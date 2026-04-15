use axum::{
    extract::{Query, State},
    response::{sse, IntoResponse, Sse},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    convert::Infallible,
    sync::Arc,
    time::Duration,
};
use tokio::sync::RwLock;
use crate::{app::AppState, auth::AuthProject, db, error::AppError};

// --- Active wait/stream lock registry ---

/// Tracks which listener_ids are currently in a long-poll or SSE stream.
/// Prevents two processes from consuming the same listener_id concurrently.
pub struct AgentLocks {
    active: RwLock<HashSet<(String, String)>>, // (project_id, listener_id)
}

impl AgentLocks {
    pub fn new() -> Self {
        Self {
            active: RwLock::new(HashSet::new()),
        }
    }

    /// Try to acquire a lock. Returns false if already held.
    pub async fn try_lock(&self, project_id: &str, listener_id: &str) -> bool {
        let key = (project_id.to_string(), listener_id.to_string());
        let mut active = self.active.write().await;
        active.insert(key)
    }

    /// Release a lock.
    pub async fn unlock(&self, project_id: &str, listener_id: &str) {
        let key = (project_id.to_string(), listener_id.to_string());
        let mut active = self.active.write().await;
        active.remove(&key);
    }
}

// --- Request/Response types ---

#[derive(Debug, Deserialize)]
pub struct PullParams {
    pub listener_id: Option<String>,
    pub n: Option<i64>,
    pub path: Option<String>,
    pub wait: Option<bool>,
    pub stream: Option<bool>,
    pub timeout: Option<u64>,
    pub after: Option<String>,
}

impl PullParams {
    pub fn listener_id(&self) -> &str {
        self.listener_id.as_deref().unwrap_or("default")
    }

    pub fn limit(&self) -> i64 {
        self.n.unwrap_or(1).clamp(1, 100)
    }

    pub fn is_wait(&self) -> bool {
        self.wait.unwrap_or(false)
    }

    pub fn is_stream(&self) -> bool {
        self.stream.unwrap_or(false)
    }

    pub fn timeout_duration(&self) -> Duration {
        Duration::from_secs(self.timeout.unwrap_or(30).clamp(1, 300))
    }
}

#[derive(Debug, Serialize)]
pub struct PullEventResponse {
    pub id: String,
    pub path: String,
    pub method: String,
    pub headers: serde_json::Value,
    pub body: Option<String>,
    pub status: String,
    pub received_at: DateTime<Utc>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_timestamp: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub webhook_signature: Option<String>,
}

impl PullEventResponse {
    pub fn from_event(e: db::Event, signing_key: Option<&[u8]>) -> Self {
        let body = e.body.map(|b| {
            String::from_utf8(b.clone()).unwrap_or_else(|_| {
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &b)
            })
        });
        let (wh_id, wh_ts, wh_sig) = if let Some(key) = signing_key {
            let (ts, sig) = crate::signature::sign_event(key, &e.id, body.as_deref());
            (Some(e.id.clone()), Some(ts), Some(sig))
        } else {
            (None, None, None)
        };
        Self {
            id: e.id,
            path: e.path,
            method: e.method,
            headers: e.headers,
            body,
            status: e.status,
            received_at: e.created_at,
            webhook_id: wh_id,
            webhook_timestamp: wh_ts,
            webhook_signature: wh_sig,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct PullResponse {
    pub events: Vec<PullEventResponse>,
    pub cursor: Option<String>,
    pub remaining: i64,
}

#[derive(Debug, Serialize)]
pub struct StatusResponse {
    pub project_id: String,
    pub queue: QueueStatus,
    pub listeners: ListenerStatus,
    pub cursors: HashMap<String, CursorInfo>,
    pub routes: Vec<RouteStatus>,
}

#[derive(Debug, Serialize)]
pub struct QueueStatus {
    pub pending: i64,
    pub failed: i64,
    pub delivered_last_hour: i64,
    pub oldest_pending: Option<DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct ListenerStatus {
    pub connected: Vec<String>,
    pub disconnected: Vec<String>,
}

#[derive(Debug, Serialize)]
pub struct CursorInfo {
    pub last_event: Option<String>,
    pub behind: i64,
}

#[derive(Debug, Serialize)]
pub struct RouteStatus {
    pub path: String,
    pub mode: String,
    pub pending: i64,
}

// --- Handlers ---

pub async fn pull(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Query(params): Query<PullParams>,
) -> Result<axum::response::Response, AppError> {
    // Rate limit: shared with webhook ingestion
    if !state
        .rate_limiter
        .check(
            &format!("agent:{}", project.id),
            500,
            Duration::from_secs(60),
        )
        .await
    {
        return Err(AppError::TooManyRequests);
    }

    if params.is_stream() {
        return pull_stream(state, project, params).await;
    }

    if params.is_wait() {
        return pull_wait(state, project, params).await;
    }

    // Instant mode
    pull_instant(&state, &project, &params).await.map(|r| Json(r).into_response())
}

async fn pull_instant(
    state: &Arc<AppState>,
    project: &db::Project,
    params: &PullParams,
) -> Result<PullResponse, AppError> {
    let listener_id = params.listener_id();
    let limit = params.limit();

    // Get or create cursor
    let cursor = db::get_or_create_cursor(&state.db, &project.id, listener_id).await?;

    // Use `after` override or cursor position
    let effective_cursor = params.after.as_deref().or(cursor.last_event_id.as_deref());

    // Pull events
    let events = db::pull_events_after_cursor(
        &state.db,
        &project.id,
        effective_cursor,
        params.path.as_deref(),
        limit,
    )
    .await?;

    // Advance cursor (only if not using `after` override)
    let new_cursor_id = events.last().map(|e| e.id.clone());
    if params.after.is_none() {
        if let Some(ref eid) = new_cursor_id {
            db::advance_cursor(&state.db, &project.id, listener_id, eid).await?;
        }
    }

    // Count remaining
    let cursor_for_count = new_cursor_id.as_deref().or(effective_cursor);
    let remaining = if let Some(eid) = cursor_for_count {
        db::count_events_after(&state.db, &project.id, eid).await.unwrap_or(0)
    } else {
        0
    };

    let signing_key = crate::signature::derive_signing_key(&project.api_key);
    Ok(PullResponse {
        events: events.into_iter().map(|e| PullEventResponse::from_event(e, Some(&signing_key))).collect(),
        cursor: new_cursor_id.or_else(|| effective_cursor.map(String::from)),
        remaining,
    })
}

async fn pull_wait(
    state: Arc<AppState>,
    project: db::Project,
    params: PullParams,
) -> Result<axum::response::Response, AppError> {
    let listener_id = params.listener_id().to_string();
    let timeout = params.timeout_duration();

    // Lock listener_id for long-poll
    if !state.agent_locks.try_lock(&project.id, &listener_id).await {
        return Err(AppError::Conflict("listener_id is already being consumed"));
    }

    // Helper: always unlock when done
    async fn unlock_and_return(
        state: &Arc<AppState>,
        project_id: &str,
        listener_id: &str,
        result: Result<axum::response::Response, AppError>,
    ) -> Result<axum::response::Response, AppError> {
        state.agent_locks.unlock(project_id, listener_id).await;
        result
    }

    // First, check if there are already events available
    let instant = pull_instant(&state, &project, &params).await;
    match instant {
        Ok(r) if !r.events.is_empty() => {
            return unlock_and_return(&state, &project.id, &listener_id, Ok(Json(r).into_response())).await;
        }
        Err(e) => {
            return unlock_and_return(&state, &project.id, &listener_id, Err(e)).await;
        }
        _ => {}
    }

    // Poll until event arrives or timeout
    let poll_interval = Duration::from_millis(500);
    let deadline = tokio::time::Instant::now() + timeout;

    loop {
        tokio::time::sleep(poll_interval).await;
        if tokio::time::Instant::now() >= deadline {
            let empty = Ok(Json(PullResponse {
                events: vec![],
                cursor: None,
                remaining: 0,
            })
            .into_response());
            return unlock_and_return(&state, &project.id, &listener_id, empty).await;
        }

        let result = pull_instant(&state, &project, &params).await;
        match result {
            Ok(r) if !r.events.is_empty() => {
                return unlock_and_return(&state, &project.id, &listener_id, Ok(Json(r).into_response())).await;
            }
            Err(e) => {
                return unlock_and_return(&state, &project.id, &listener_id, Err(e)).await;
            }
            _ => {}
        }
    }
}

async fn pull_stream(
    state: Arc<AppState>,
    project: db::Project,
    params: PullParams,
) -> Result<axum::response::Response, AppError> {
    let listener_id = params.listener_id().to_string();
    let timeout = params.timeout_duration();
    let limit = params.limit();
    let path = params.path.clone();
    let after_override = params.after.clone();

    // Lock listener_id for stream
    if !state.agent_locks.try_lock(&project.id, &listener_id).await {
        return Err(AppError::Conflict("listener_id is already being consumed"));
    }

    let stream = async_stream::stream! {
        let deadline = tokio::time::Instant::now() + timeout;
        let poll_interval = Duration::from_millis(500);
        let heartbeat_interval = Duration::from_secs(15);
        let mut last_heartbeat = tokio::time::Instant::now();

        // Track cursor locally for the stream
        let cursor = db::get_or_create_cursor(&state.db, &project.id, &listener_id).await;
        let mut current_cursor = match cursor {
            Ok(c) => after_override.clone().or(c.last_event_id),
            Err(_) => after_override.clone(),
        };

        loop {
            if tokio::time::Instant::now() >= deadline {
                break;
            }

            // Check for new events
            let events = db::pull_events_after_cursor(
                &state.db,
                &project.id,
                current_cursor.as_deref(),
                path.as_deref(),
                limit,
            )
            .await;

            if let Ok(events) = events {
                for event in events {
                    let eid = event.id.clone();
                    let stream_signing_key = crate::signature::derive_signing_key(&project.api_key);
                    let resp = PullEventResponse::from_event(event, Some(&stream_signing_key));
                    if let Ok(json) = serde_json::to_string(&resp) {
                        yield Ok::<_, Infallible>(sse::Event::default().event("webhook").data(json));
                    }
                    // Advance cursor (only if not using after override)
                    if after_override.is_none() {
                        let _ = db::advance_cursor(&state.db, &project.id, &listener_id, &eid).await;
                    }
                    current_cursor = Some(eid);
                }
            }

            // Heartbeat
            if last_heartbeat.elapsed() >= heartbeat_interval {
                yield Ok::<_, Infallible>(sse::Event::default().event("heartbeat").data("{}"));
                last_heartbeat = tokio::time::Instant::now();
            }

            tokio::time::sleep(poll_interval).await;
        }

        // Unlock on stream end
        state.agent_locks.unlock(&project.id, &listener_id).await;
    };

    Ok(Sse::new(stream)
        .keep_alive(sse::KeepAlive::default())
        .into_response())
}

// --- Status handler ---

pub async fn status(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<StatusResponse>, AppError> {
    // Queue stats
    let pending: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM events WHERE project_id = $1 AND status = 'pending'",
    )
    .bind(&project.id)
    .fetch_one(&state.db)
    .await?;

    let failed: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM events WHERE project_id = $1 AND status = 'failed'",
    )
    .bind(&project.id)
    .fetch_one(&state.db)
    .await?;

    let delivered_last_hour: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM events WHERE project_id = $1 AND status = 'delivered' AND delivered_at >= now() - interval '1 hour'",
    )
    .bind(&project.id)
    .fetch_one(&state.db)
    .await?;

    let oldest_pending: Option<DateTime<Utc>> = sqlx::query_scalar(
        "SELECT MIN(created_at) FROM events WHERE project_id = $1 AND status = 'pending'",
    )
    .bind(&project.id)
    .fetch_one(&state.db)
    .await?;

    // Listener connectivity
    let all_listeners = db::list_listeners(&state.db, &project.id).await?;
    let connected_ws = state.tunnels.connected_listener_ids(&project.id).await;
    let connected_ids: HashSet<String> = connected_ws
        .into_iter()
        .map(|lid| lid.unwrap_or_else(|| "default".to_string()))
        .collect();

    let mut connected = Vec::new();
    let mut disconnected = Vec::new();
    // Always include "default"
    if connected_ids.contains("default") {
        connected.push("default".to_string());
    }
    for listener in &all_listeners {
        if connected_ids.contains(&listener.listener_id) {
            connected.push(listener.listener_id.clone());
        } else {
            disconnected.push(listener.listener_id.clone());
        }
    }

    // Cursor positions
    let cursors_list = db::list_cursors(&state.db, &project.id).await?;
    let mut cursors = HashMap::new();
    for c in cursors_list {
        let behind = if let Some(ref eid) = c.last_event_id {
            db::count_events_after(&state.db, &project.id, eid)
                .await
                .unwrap_or(0)
        } else {
            pending // if no cursor, they're "behind" by at least the pending count
        };
        cursors.insert(
            c.listener_id,
            CursorInfo {
                last_event: c.last_event_id,
                behind,
            },
        );
    }

    // Per-route breakdown
    let routes = db::list_routes(&state.db, &project.id).await?;
    let mut route_statuses = Vec::new();
    for route in routes {
        let route_pending: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM events WHERE project_id = $1 AND status = 'pending' AND path LIKE $2",
        )
        .bind(&project.id)
        .bind(format!("{}%", route.path_prefix))
        .fetch_one(&state.db)
        .await
        .unwrap_or(0);

        route_statuses.push(RouteStatus {
            path: route.path_prefix,
            mode: route.mode,
            pending: route_pending,
        });
    }

    Ok(Json(StatusResponse {
        project_id: project.id,
        queue: QueueStatus {
            pending,
            failed,
            delivered_last_hour,
            oldest_pending,
        },
        listeners: ListenerStatus {
            connected,
            disconnected,
        },
        cursors,
        routes: route_statuses,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pull_params_defaults() {
        let params = PullParams {
            listener_id: None,
            n: None,
            path: None,
            wait: None,
            stream: None,
            timeout: None,
            after: None,
        };
        assert_eq!(params.listener_id(), "default");
        assert_eq!(params.limit(), 1);
        assert!(!params.is_wait());
        assert!(!params.is_stream());
        assert_eq!(params.timeout_duration(), Duration::from_secs(30));
    }

    #[test]
    fn test_pull_params_custom() {
        let params = PullParams {
            listener_id: Some("ci-agent".to_string()),
            n: Some(10),
            path: Some("/stripe/*".to_string()),
            wait: Some(true),
            stream: Some(false),
            timeout: Some(60),
            after: Some("evt_abc".to_string()),
        };
        assert_eq!(params.listener_id(), "ci-agent");
        assert_eq!(params.limit(), 10);
        assert!(params.is_wait());
        assert!(!params.is_stream());
        assert_eq!(params.timeout_duration(), Duration::from_secs(60));
    }

    #[test]
    fn test_pull_params_clamp() {
        let params = PullParams {
            listener_id: None,
            n: Some(500),
            path: None,
            wait: None,
            stream: None,
            timeout: Some(999),
            after: None,
        };
        assert_eq!(params.limit(), 100); // clamped to max
        assert_eq!(params.timeout_duration(), Duration::from_secs(300)); // clamped to max

        let params_zero = PullParams {
            listener_id: None,
            n: Some(0),
            path: None,
            wait: None,
            stream: None,
            timeout: Some(0),
            after: None,
        };
        assert_eq!(params_zero.limit(), 1); // clamped to min
        assert_eq!(params_zero.timeout_duration(), Duration::from_secs(1)); // clamped to min
    }

    #[test]
    fn test_glob_to_sql_like() {
        assert_eq!(db::glob_to_sql_like("/stripe/*"), "/stripe/%");
        assert_eq!(db::glob_to_sql_like("/*"), "/%");
        assert_eq!(db::glob_to_sql_like("/exact/path"), "/exact/path");
        assert_eq!(db::glob_to_sql_like("/a/*/b/*"), "/a/%/b/%");
    }

    #[test]
    fn test_pull_event_response_from_event() {
        let event = db::Event {
            id: "evt_123".to_string(),
            project_id: "p_abc".to_string(),
            path: "/stripe/webhook".to_string(),
            method: "POST".to_string(),
            headers: serde_json::json!({"content-type": "application/json"}),
            body: Some(b"{\"type\":\"checkout.session.completed\"}".to_vec()),
            status: "delivered".to_string(),
            response_status: Some(200),
            response_body: None,
            attempts: 0,
            next_retry_at: None,
            route_mode: Some("queue".to_string()),
            listener_id: None,
            created_at: Utc::now(),
            delivered_at: Some(Utc::now()),
        };

        let resp = PullEventResponse::from_event(event, None);
        assert_eq!(resp.id, "evt_123");
        assert_eq!(resp.path, "/stripe/webhook");
        assert_eq!(resp.method, "POST");
        assert_eq!(resp.status, "delivered");
        assert!(resp.body.is_some());
        // UTF-8 body should be returned as-is, not base64
        assert!(resp.body.unwrap().contains("checkout.session.completed"));
    }

    #[test]
    fn test_pull_event_response_binary_body() {
        let binary_body = vec![0xFF, 0xFE, 0x00, 0x01]; // Not valid UTF-8
        let event = db::Event {
            id: "evt_bin".to_string(),
            project_id: "p_abc".to_string(),
            path: "/upload".to_string(),
            method: "POST".to_string(),
            headers: serde_json::json!({}),
            body: Some(binary_body),
            status: "pending".to_string(),
            response_status: None,
            response_body: None,
            attempts: 0,
            next_retry_at: None,
            route_mode: None,
            listener_id: None,
            created_at: Utc::now(),
            delivered_at: None,
        };

        let resp = PullEventResponse::from_event(event, None);
        // Binary body should be base64 encoded
        assert!(resp.body.is_some());
        let body = resp.body.unwrap();
        assert_eq!(body, "//4AAQ=="); // base64 of [0xFF, 0xFE, 0x00, 0x01]
    }

    #[test]
    fn test_pull_event_response_no_body() {
        let event = db::Event {
            id: "evt_no".to_string(),
            project_id: "p_abc".to_string(),
            path: "/ping".to_string(),
            method: "GET".to_string(),
            headers: serde_json::json!({}),
            body: None,
            status: "delivered".to_string(),
            response_status: Some(200),
            response_body: None,
            attempts: 0,
            next_retry_at: None,
            route_mode: None,
            listener_id: None,
            created_at: Utc::now(),
            delivered_at: Some(Utc::now()),
        };

        let resp = PullEventResponse::from_event(event, None);
        assert!(resp.body.is_none());
    }

    #[tokio::test]
    async fn test_agent_locks() {
        let locks = AgentLocks::new();

        // First lock succeeds
        assert!(locks.try_lock("p_1", "default").await);

        // Second lock on same key fails
        assert!(!locks.try_lock("p_1", "default").await);

        // Different listener_id succeeds
        assert!(locks.try_lock("p_1", "other").await);

        // Different project succeeds
        assert!(locks.try_lock("p_2", "default").await);

        // Unlock and re-lock succeeds
        locks.unlock("p_1", "default").await;
        assert!(locks.try_lock("p_1", "default").await);
    }
}
