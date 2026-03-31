use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

// --- Models ---

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub api_key: String,
    pub stripe_customer_id: Option<String>,
    pub stripe_subscription_id: Option<String>,
    pub active: bool,
    pub billing_status: String,
    pub subscription_period_end: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Route {
    pub id: Uuid,
    pub project_id: String,
    pub path_prefix: String,
    pub mode: String,
    pub timeout_seconds: i32,
    pub created_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Event {
    pub id: String,
    pub project_id: String,
    pub path: String,
    pub method: String,
    pub headers: serde_json::Value,
    pub body: Option<Vec<u8>>,
    pub status: String,
    pub response_status: Option<i16>,
    pub response_body: Option<Vec<u8>>,
    pub attempts: i16,
    pub next_retry_at: Option<DateTime<Utc>>,
    pub route_mode: Option<String>,
    pub created_at: DateTime<Utc>,
    pub delivered_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum RouteMode {
    Passthrough,
    Queue,
}

#[derive(Debug, Deserialize)]
pub struct EventsQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub status: Option<String>,
    pub path: Option<String>,
    pub method: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedEvents {
    pub data: Vec<Event>,
    pub total: i64,
    pub limit: i64,
    pub offset: i64,
}

// --- Project queries ---

pub async fn get_project_by_id(pool: &PgPool, id: &str) -> Result<Option<Project>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM projects WHERE id = $1")
        .bind(id)
        .fetch_optional(pool)
        .await
}

pub async fn get_project_by_key(pool: &PgPool, key: &str) -> Result<Option<Project>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM projects WHERE api_key = $1")
        .bind(key)
        .fetch_optional(pool)
        .await
}

pub async fn insert_project(
    pool: &PgPool,
    id: &str,
    name: &str,
    api_key: &str,
) -> Result<Project, sqlx::Error> {
    sqlx::query_as(
        "INSERT INTO projects (id, name, api_key) VALUES ($1, $2, $3) RETURNING *",
    )
    .bind(id)
    .bind(name)
    .bind(api_key)
    .fetch_one(pool)
    .await
}

pub async fn activate_project(
    pool: &PgPool,
    project_id: &str,
    customer_id: &str,
    subscription_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE projects SET active = true, stripe_customer_id = $1, stripe_subscription_id = $2 WHERE id = $3",
    )
    .bind(customer_id)
    .bind(subscription_id)
    .bind(project_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn deactivate_by_customer(pool: &PgPool, customer_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE projects SET active = false WHERE stripe_customer_id = $1")
        .bind(customer_id)
        .execute(pool)
        .await?;
    Ok(())
}

// --- Route queries ---

pub struct RouteMatch {
    pub mode: RouteMode,
    pub timeout_seconds: u64,
}

pub async fn match_route(
    pool: &PgPool,
    project_id: &str,
    path: &str,
) -> Result<Option<RouteMatch>, sqlx::Error> {
    let row: Option<Route> = sqlx::query_as(
        "SELECT * FROM routes WHERE project_id = $1 AND deleted_at IS NULL AND $2 LIKE path_prefix || '%'
         ORDER BY LENGTH(path_prefix) DESC LIMIT 1",
    )
    .bind(project_id)
    .bind(path)
    .fetch_optional(pool)
    .await?;

    Ok(row.map(|r| RouteMatch {
        mode: match r.mode.as_str() {
            "passthrough" => RouteMode::Passthrough,
            _ => RouteMode::Queue,
        },
        timeout_seconds: r.timeout_seconds.max(1) as u64,
    }))
}

pub async fn list_routes(pool: &PgPool, project_id: &str) -> Result<Vec<Route>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM routes WHERE project_id = $1 AND deleted_at IS NULL ORDER BY path_prefix")
        .bind(project_id)
        .fetch_all(pool)
        .await
}

pub async fn list_deleted_routes(pool: &PgPool, project_id: &str) -> Result<Vec<Route>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM routes WHERE project_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC")
        .bind(project_id)
        .fetch_all(pool)
        .await
}

pub async fn create_route(
    pool: &PgPool,
    project_id: &str,
    path_prefix: &str,
    mode: &str,
    timeout_seconds: i32,
) -> Result<Route, sqlx::Error> {
    sqlx::query_as(
        "INSERT INTO routes (project_id, path_prefix, mode, timeout_seconds) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(project_id)
    .bind(path_prefix)
    .bind(mode)
    .bind(timeout_seconds)
    .fetch_one(pool)
    .await
}

pub async fn delete_route(pool: &PgPool, id: Uuid, project_id: &str) -> Result<bool, sqlx::Error> {
    let result = sqlx::query(
        "UPDATE routes SET deleted_at = now() WHERE id = $1 AND project_id = $2 AND deleted_at IS NULL",
    )
    .bind(id)
    .bind(project_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn restore_route(pool: &PgPool, id: Uuid, project_id: &str) -> Result<bool, AppError> {
    // Check for conflict: is there an active route with the same path_prefix?
    let route: Option<Route> = sqlx::query_as(
        "SELECT * FROM routes WHERE id = $1 AND project_id = $2 AND deleted_at IS NOT NULL",
    )
    .bind(id)
    .bind(project_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::Db)?;

    let Some(route) = route else {
        return Ok(false);
    };

    let conflict: Option<Route> = sqlx::query_as(
        "SELECT * FROM routes WHERE project_id = $1 AND path_prefix = $2 AND deleted_at IS NULL AND id != $3",
    )
    .bind(project_id)
    .bind(&route.path_prefix)
    .bind(id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::Db)?;

    if conflict.is_some() {
        return Err(AppError::BadRequest("an active route with this path prefix already exists"));
    }

    let result = sqlx::query(
        "UPDATE routes SET deleted_at = NULL WHERE id = $1 AND project_id = $2",
    )
    .bind(id)
    .bind(project_id)
    .execute(pool)
    .await
    .map_err(AppError::Db)?;

    Ok(result.rows_affected() > 0)
}

use crate::error::AppError;

// --- Event queries ---

pub async fn insert_event(
    pool: &PgPool,
    id: &str,
    project_id: &str,
    path: &str,
    method: &str,
    headers: &HashMap<String, String>,
    body: Option<&[u8]>,
    route_mode: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO events (id, project_id, path, method, headers, body, route_mode) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(id)
    .bind(project_id)
    .bind(path)
    .bind(method)
    .bind(serde_json::to_value(headers).unwrap())
    .bind(body)
    .bind(route_mode)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_delivered(
    pool: &PgPool,
    event_id: &str,
    response_status: i16,
    response_body: Option<&[u8]>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE events SET status = 'delivered', response_status = $1, response_body = $2,
         delivered_at = now(), next_retry_at = NULL WHERE id = $3",
    )
    .bind(response_status)
    .bind(response_body)
    .bind(event_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_failed(pool: &PgPool, event_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE events SET status = 'failed', next_retry_at = NULL WHERE id = $1")
        .bind(event_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn schedule_retry(
    pool: &PgPool,
    event_id: &str,
    attempts: i16,
) -> Result<(), sqlx::Error> {
    let backoff_secs: [i64; 5] = [5, 30, 120, 600, 3600];
    let delay = backoff_secs.get(attempts as usize).copied().unwrap_or(3600);
    sqlx::query(
        "UPDATE events SET attempts = $1, next_retry_at = now() + make_interval(secs => $2) WHERE id = $3",
    )
    .bind(attempts)
    .bind(delay as f64)
    .bind(event_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_retryable_events(pool: &PgPool, limit: i64) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as(
        "SELECT * FROM events
         WHERE status = 'pending' AND next_retry_at IS NOT NULL AND next_retry_at <= now()
         ORDER BY next_retry_at ASC LIMIT $1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
}

pub async fn get_pending_for_project(
    pool: &PgPool,
    project_id: &str,
) -> Result<Vec<Event>, sqlx::Error> {
    sqlx::query_as(
        "SELECT * FROM events
         WHERE project_id = $1 AND status = 'pending'
         ORDER BY created_at ASC",
    )
    .bind(project_id)
    .fetch_all(pool)
    .await
}

pub async fn list_events(
    pool: &PgPool,
    project_id: &str,
    query: &EventsQuery,
) -> Result<PaginatedEvents, sqlx::Error> {
    let limit = query.limit.unwrap_or(50).min(200);
    let offset = query.offset.unwrap_or(0);

    // Build WHERE clauses dynamically
    let mut conditions = vec!["project_id = $1".to_string()];
    let mut param_idx = 2;

    if query.status.is_some() {
        conditions.push(format!("status = ${}", param_idx));
        param_idx += 1;
    }
    if query.path.is_some() {
        conditions.push(format!("path LIKE ${}", param_idx));
        param_idx += 1;
    }
    if query.method.is_some() {
        conditions.push(format!("method = ${}", param_idx));
        param_idx += 1;
    }

    let where_clause = conditions.join(" AND ");

    // Count query
    let count_sql = format!("SELECT COUNT(*) as count FROM events WHERE {}", where_clause);
    let mut count_query = sqlx::query_scalar::<_, i64>(&count_sql).bind(project_id);
    if let Some(ref status) = query.status {
        count_query = count_query.bind(status);
    }
    if let Some(ref path) = query.path {
        count_query = count_query.bind(format!("%{}%", path));
    }
    if let Some(ref method) = query.method {
        count_query = count_query.bind(method);
    }
    let total = count_query.fetch_one(pool).await?;

    // Data query
    let data_sql = format!(
        "SELECT * FROM events WHERE {} ORDER BY created_at DESC LIMIT ${} OFFSET ${}",
        where_clause, param_idx, param_idx + 1
    );
    let mut data_query = sqlx::query_as::<_, Event>(&data_sql).bind(project_id);
    if let Some(ref status) = query.status {
        data_query = data_query.bind(status);
    }
    if let Some(ref path) = query.path {
        data_query = data_query.bind(format!("%{}%", path));
    }
    if let Some(ref method) = query.method {
        data_query = data_query.bind(method);
    }
    let data = data_query.bind(limit).bind(offset).fetch_all(pool).await?;

    Ok(PaginatedEvents {
        data,
        total,
        limit,
        offset,
    })
}

pub async fn get_event(
    pool: &PgPool,
    event_id: &str,
    project_id: &str,
) -> Result<Option<Event>, sqlx::Error> {
    sqlx::query_as("SELECT * FROM events WHERE id = $1 AND project_id = $2")
        .bind(event_id)
        .bind(project_id)
        .fetch_optional(pool)
        .await
}

pub async fn clone_event_as_pending(pool: &PgPool, original: &Event, new_id: &str) -> Result<Event, sqlx::Error> {
    sqlx::query_as(
        "INSERT INTO events (id, project_id, path, method, headers, body, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending') RETURNING *",
    )
    .bind(new_id)
    .bind(&original.project_id)
    .bind(&original.path)
    .bind(&original.method)
    .bind(&original.headers)
    .bind(&original.body)
    .fetch_one(pool)
    .await
}

// --- Trial & billing queries ---

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TrialCandidate {
    pub user_id: String,
    pub user_name: String,
    pub user_email: String,
    pub trial_ends_at: DateTime<Utc>,
    pub project_id: String,
}

pub async fn get_trial_reminder_candidates(pool: &PgPool) -> Result<Vec<TrialCandidate>, sqlx::Error> {
    sqlx::query_as(
        "SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email,
                u.trial_ends_at, p.id AS project_id
         FROM users u JOIN projects p ON p.user_id = u.id
         WHERE u.trial_ends_at IS NOT NULL
           AND u.trial_ends_at > now()
           AND u.trial_ends_at <= now() + interval '2 hours'
           AND u.trial_reminder_sent = false",
    )
    .fetch_all(pool)
    .await
}

pub async fn get_trial_expired_candidates(pool: &PgPool) -> Result<Vec<TrialCandidate>, sqlx::Error> {
    sqlx::query_as(
        "SELECT u.id AS user_id, u.name AS user_name, u.email AS user_email,
                u.trial_ends_at, p.id AS project_id
         FROM users u JOIN projects p ON p.user_id = u.id
         WHERE u.trial_ends_at IS NOT NULL
           AND u.trial_ends_at <= now()
           AND u.trial_expired_sent = false",
    )
    .fetch_all(pool)
    .await
}

pub async fn expire_trial_projects(pool: &PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE projects SET billing_status = 'trial_expired', active = false
         WHERE user_id = $1 AND billing_status = 'trial'",
    )
    .bind(user_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn mark_trial_reminder_sent(pool: &PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET trial_reminder_sent = true WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn mark_trial_expired_sent(pool: &PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET trial_expired_sent = true WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn mark_welcome_email_sent(pool: &PgPool, user_id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET welcome_email_sent = true WHERE id = $1")
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn set_billing_status(pool: &PgPool, project_id: &str, status: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE projects SET billing_status = $1 WHERE id = $2")
        .bind(status)
        .bind(project_id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn insert_email_log(
    pool: &PgPool,
    user_id: &str,
    email_type: &str,
    resend_id: &str,
) -> Result<(), sqlx::Error> {
    let id = generate_id("eml_", 16);
    sqlx::query("INSERT INTO email_log (id, user_id, email_type, resend_id) VALUES ($1, $2, $3, $4)")
        .bind(&id)
        .bind(user_id)
        .bind(email_type)
        .bind(resend_id)
        .execute(pool)
        .await?;
    Ok(())
}

// --- Stats queries ---

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct StatsCounts {
    pub total: i64,
    pub delivered: i64,
    pub pending: i64,
    pub failed: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TimeseriesBucket {
    pub time: DateTime<Utc>,
    pub total: i64,
    pub delivered: i64,
    pub failed: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PathCount {
    pub path: String,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct StatsResponse {
    pub total: i64,
    pub delivered: i64,
    pub pending: i64,
    pub failed: i64,
    pub timeseries: Vec<TimeseriesBucket>,
    pub by_path: Vec<PathCount>,
}

pub fn parse_window(window: &str) -> (&str, &str) {
    match window {
        "1m" => ("1 minute", "5 seconds"),
        "10m" => ("10 minutes", "30 seconds"),
        "1h" => ("1 hour", "5 minutes"),
        "1d" => ("1 day", "1 hour"),
        "7d" => ("7 days", "6 hours"),
        _ => ("1 day", "1 hour"),
    }
}

pub async fn get_stats(
    pool: &PgPool,
    project_id: &str,
    window: &str,
) -> Result<StatsResponse, sqlx::Error> {
    let (interval, bucket) = parse_window(window);

    // Counts
    let counts_sql = format!(
        "SELECT \
           COUNT(*) AS total, \
           COUNT(*) FILTER (WHERE status = 'delivered') AS delivered, \
           COUNT(*) FILTER (WHERE status = 'pending') AS pending, \
           COUNT(*) FILTER (WHERE status = 'failed') AS failed \
         FROM events \
         WHERE project_id = $1 AND created_at >= now() - interval '{}'",
        interval
    );
    let counts: StatsCounts = sqlx::query_as(&counts_sql)
        .bind(project_id)
        .fetch_one(pool)
        .await?;

    // Timeseries
    let ts_sql = format!(
        "SELECT \
           date_bin(interval '{}', created_at, now() - interval '{}') AS time, \
           COUNT(*) AS total, \
           COUNT(*) FILTER (WHERE status = 'delivered') AS delivered, \
           COUNT(*) FILTER (WHERE status = 'failed') AS failed \
         FROM events \
         WHERE project_id = $1 AND created_at >= now() - interval '{}' \
         GROUP BY 1 ORDER BY 1",
        bucket, interval, interval
    );
    let timeseries: Vec<TimeseriesBucket> = sqlx::query_as(&ts_sql)
        .bind(project_id)
        .fetch_all(pool)
        .await?;

    // By path
    let path_sql = format!(
        "SELECT path, COUNT(*) AS count \
         FROM events \
         WHERE project_id = $1 AND created_at >= now() - interval '{}' \
         GROUP BY path ORDER BY count DESC LIMIT 10",
        interval
    );
    let by_path: Vec<PathCount> = sqlx::query_as(&path_sql)
        .bind(project_id)
        .fetch_all(pool)
        .await?;

    Ok(StatsResponse {
        total: counts.total,
        delivered: counts.delivered,
        pending: counts.pending,
        failed: counts.failed,
        timeseries,
        by_path,
    })
}

// --- Helpers ---

pub fn generate_id(prefix: &str, len: usize) -> String {
    use rand::Rng;
    let mut rng = rand::rng();
    let chars: Vec<char> = "abcdefghijklmnopqrstuvwxyz0123456789".chars().collect();
    let random: String = (0..len).map(|_| chars[rng.random_range(0..chars.len())]).collect();
    format!("{}{}", prefix, random)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_id_prefix() {
        let id = generate_id("p_", 12);
        assert!(id.starts_with("p_"));
        assert_eq!(id.len(), 14); // "p_" + 12 chars
    }

    #[test]
    fn test_generate_id_uniqueness() {
        let a = generate_id("evt_", 16);
        let b = generate_id("evt_", 16);
        assert_ne!(a, b);
    }

    #[test]
    fn test_generate_id_charset() {
        let id = generate_id("", 100);
        assert!(id.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit()));
    }
}
