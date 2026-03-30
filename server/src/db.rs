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
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO events (id, project_id, path, method, headers, body) VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(project_id)
    .bind(path)
    .bind(method)
    .bind(serde_json::to_value(headers).unwrap())
    .bind(body)
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
) -> Result<Vec<Event>, sqlx::Error> {
    let limit = query.limit.unwrap_or(50).min(200);
    let offset = query.offset.unwrap_or(0);

    match (&query.status, &query.path) {
        (Some(status), Some(path)) => {
            sqlx::query_as(
                "SELECT * FROM events WHERE project_id = $1 AND status = $2 AND path LIKE $3
                 ORDER BY created_at DESC LIMIT $4 OFFSET $5",
            )
            .bind(project_id)
            .bind(status)
            .bind(format!("{}%", path))
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
        }
        (Some(status), None) => {
            sqlx::query_as(
                "SELECT * FROM events WHERE project_id = $1 AND status = $2
                 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
            )
            .bind(project_id)
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
        }
        (None, Some(path)) => {
            sqlx::query_as(
                "SELECT * FROM events WHERE project_id = $1 AND path LIKE $2
                 ORDER BY created_at DESC LIMIT $3 OFFSET $4",
            )
            .bind(project_id)
            .bind(format!("{}%", path))
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query_as(
                "SELECT * FROM events WHERE project_id = $1
                 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
            )
            .bind(project_id)
            .bind(limit)
            .bind(offset)
            .fetch_all(pool)
            .await
        }
    }
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
