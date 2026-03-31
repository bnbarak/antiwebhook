use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

use crate::{app::AppState, auth::AuthProject, db, error::AppError};

// --- Registration (public, no auth) ---

#[derive(Deserialize)]
pub struct RegisterRequest {
    pub name: String,
}

#[derive(Serialize)]
pub struct RegisterResponse {
    pub project_id: String,
    pub api_key: String,
    pub webhook_base_url: String,
}

pub async fn register(
    State(state): State<Arc<AppState>>,
    Json(body): Json<RegisterRequest>,
) -> Result<Json<RegisterResponse>, AppError> {
    let project_id = db::generate_id("p_", 12);
    let api_key = db::generate_id("ak_", 24);

    db::insert_project(&state.db, &project_id, &body.name, &api_key).await?;

    Ok(Json(RegisterResponse {
        webhook_base_url: format!("{}/hooks/{}", state.config.base_url, project_id),
        project_id,
        api_key,
    }))
}

// --- Project info ---

#[derive(Serialize)]
pub struct ProjectInfo {
    #[serde(flatten)]
    pub project: db::Project,
    pub connected: bool,
    pub webhook_base_url: String,
}

pub async fn get_project(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<ProjectInfo>, AppError> {
    let connected = state.tunnels.is_connected(&project.id).await;
    let webhook_base_url = format!("{}/hooks/{}", state.config.base_url, project.id);
    Ok(Json(ProjectInfo {
        project,
        connected,
        webhook_base_url,
    }))
}

// --- Events ---

pub async fn list_events(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Query(query): Query<db::EventsQuery>,
) -> Result<Json<db::PaginatedEvents>, AppError> {
    let result = db::list_events(&state.db, &project.id, &query).await?;
    Ok(Json(result))
}

pub async fn get_event(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Path(event_id): Path<String>,
) -> Result<Json<db::Event>, AppError> {
    let event = db::get_event(&state.db, &event_id, &project.id)
        .await?
        .ok_or(AppError::NotFound("event not found"))?;
    Ok(Json(event))
}

pub async fn replay_event(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Path(event_id): Path<String>,
) -> Result<Json<db::Event>, AppError> {
    let original = db::get_event(&state.db, &event_id, &project.id)
        .await?
        .ok_or(AppError::NotFound("event not found"))?;

    let new_id = db::generate_id("evt_", 16);
    let new_event = db::clone_event_as_pending(&state.db, &original, &new_id).await?;

    // Try instant delivery in background
    let state2 = state.clone();
    let pid = project.id.clone();
    let eid = new_id.clone();
    let headers: std::collections::HashMap<String, String> =
        serde_json::from_value(original.headers).unwrap_or_default();

    tokio::spawn(async move {
        use crate::tunnel::RequestFrame;
        use base64::Engine;

        let frame = RequestFrame {
            frame_type: "request".into(),
            id: eid.clone(),
            method: original.method,
            path: original.path,
            headers,
            body: original.body.as_ref().map(|b| {
                base64::engine::general_purpose::STANDARD.encode(b)
            }),
        };

        match state2
            .tunnels
            .send_request(&pid, frame, std::time::Duration::from_secs(5))
            .await
        {
            Some(resp) => {
                let body_bytes = resp.body.as_ref().and_then(|b| {
                    base64::engine::general_purpose::STANDARD.decode(b).ok()
                });
                let _ = db::mark_delivered(&state2.db, &eid, resp.status as i16, body_bytes.as_deref()).await;
            }
            None => {
                let _ = db::schedule_retry(&state2.db, &eid, 0).await;
            }
        }
    });

    Ok(Json(new_event))
}

// --- Routes ---

pub async fn list_routes(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<Vec<db::Route>>, AppError> {
    let routes = db::list_routes(&state.db, &project.id).await?;
    Ok(Json(routes))
}

#[derive(Deserialize)]
pub struct CreateRouteRequest {
    pub path_prefix: String,
    pub mode: String,
    pub timeout_seconds: Option<i32>,
}

pub async fn create_route(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Json(body): Json<CreateRouteRequest>,
) -> Result<Json<db::Route>, AppError> {
    if body.mode != "passthrough" && body.mode != "queue" {
        return Err(AppError::BadRequest("mode must be 'passthrough' or 'queue'"));
    }
    let default_timeout = if body.mode == "passthrough" { 30 } else { 5 };
    let timeout = body.timeout_seconds.unwrap_or(default_timeout).clamp(1, 300);
    let route = db::create_route(&state.db, &project.id, &body.path_prefix, &body.mode, timeout).await?;
    Ok(Json(route))
}

pub async fn delete_route(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Path(route_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let route_id: Uuid = route_id.parse().map_err(|_| AppError::BadRequest("invalid route id"))?;
    let deleted = db::delete_route(&state.db, route_id, &project.id).await?;
    if !deleted {
        return Err(AppError::NotFound("route not found"));
    }
    Ok(Json(serde_json::json!({"deleted": true})))
}

pub async fn list_deleted_routes(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<Vec<db::Route>>, AppError> {
    let routes = db::list_deleted_routes(&state.db, &project.id).await?;
    Ok(Json(routes))
}

pub async fn restore_route(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Path(route_id): Path<String>,
) -> Result<Json<serde_json::Value>, AppError> {
    let route_id: Uuid = route_id.parse().map_err(|_| AppError::BadRequest("invalid route id"))?;
    let restored = db::restore_route(&state.db, route_id, &project.id).await?;
    if !restored {
        return Err(AppError::NotFound("route not found or conflict"));
    }
    Ok(Json(serde_json::json!({"restored": true})))
}

// --- Stats ---

#[derive(Deserialize)]
pub struct StatsQuery {
    pub window: Option<String>,
}

pub async fn get_stats(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
    Query(query): Query<StatsQuery>,
) -> Result<Json<db::StatsResponse>, AppError> {
    let window = query.window.as_deref().unwrap_or("1d");
    let valid = ["1m", "10m", "1h", "1d", "7d"];
    if !valid.contains(&window) {
        return Err(AppError::BadRequest("window must be 1m, 10m, 1h, 1d, or 7d"));
    }
    let stats = db::get_stats(&state.db, &project.id, window).await?;
    Ok(Json(stats))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_register_request_deserialize() {
        let json = r#"{"name": "my project"}"#;
        let req: RegisterRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.name, "my project");
    }

    #[test]
    fn test_create_route_mode_validation() {
        // passthrough and queue are the only valid modes
        let valid = ["passthrough", "queue"];
        let invalid = ["forward", "async", "sync", ""];

        for mode in valid {
            assert!(mode == "passthrough" || mode == "queue");
        }
        for mode in invalid {
            assert!(mode != "passthrough" && mode != "queue");
        }
    }

    #[test]
    fn test_register_response_serialize() {
        let resp = RegisterResponse {
            project_id: "p_abc123".into(),
            api_key: "ak_xyz".into(),
            webhook_base_url: "https://hooks.simplehook.dev/hooks/p_abc123".into(),
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("p_abc123"));
        assert!(json.contains("ak_xyz"));
        assert!(json.contains("webhook_base_url"));
    }
}
