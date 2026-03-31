use axum::{
    extract::{Query, State, WebSocketUpgrade, ws::{Message, WebSocket}},
    response::Response,
};
use futures::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::Arc, time::Duration};
use tokio::sync::{mpsc, oneshot, RwLock};

use crate::{app::AppState, db, error::AppError};

// --- Protocol frames ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
    pub id: String,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    pub body: Option<String>, // base64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
    pub id: String,
    pub status: u16,
    pub headers: Option<HashMap<String, String>>,
    pub body: Option<String>, // base64
}

// --- Tunnel manager ---

type TunnelKey = (String, Option<String>); // (project_id, listener_id)
type TunnelMessage = (RequestFrame, oneshot::Sender<ResponseFrame>);

pub struct TunnelManager {
    connections: RwLock<HashMap<TunnelKey, mpsc::Sender<TunnelMessage>>>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self {
            connections: RwLock::new(HashMap::new()),
        }
    }

    pub async fn register(&self, project_id: String, listener_id: Option<String>) -> mpsc::Receiver<TunnelMessage> {
        let (tx, rx) = mpsc::channel::<TunnelMessage>(32);
        self.connections.write().await.insert((project_id, listener_id), tx);
        rx
    }

    pub async fn unregister(&self, project_id: &str, listener_id: Option<&str>) {
        self.connections.write().await.remove(&(project_id.to_string(), listener_id.map(String::from)));
    }

    pub async fn is_connected(&self, project_id: &str, listener_id: Option<&str>) -> bool {
        let conns = self.connections.read().await;
        let key = (project_id.to_string(), listener_id.map(String::from));
        conns.get(&key).map_or(false, |tx| !tx.is_closed())
    }

    /// Check if ANY connection exists for this project (any listener_id).
    /// Used by the dashboard to show overall connectivity.
    pub async fn is_any_connected(&self, project_id: &str) -> bool {
        let conns = self.connections.read().await;
        conns.iter().any(|((pid, _), tx)| pid == project_id && !tx.is_closed())
    }

    pub async fn send_request(
        &self,
        project_id: &str,
        listener_id: Option<&str>,
        frame: RequestFrame,
        timeout: Duration,
    ) -> Option<ResponseFrame> {
        let tx = {
            let conns = self.connections.read().await;
            let key = (project_id.to_string(), listener_id.map(String::from));
            conns.get(&key)?.clone()
        };

        let (resp_tx, resp_rx) = oneshot::channel();
        if tx.send((frame, resp_tx)).await.is_err() {
            return None;
        }

        tokio::time::timeout(timeout, resp_rx).await.ok()?.ok()
    }
}

// --- WebSocket handler ---

#[derive(Deserialize)]
pub struct TunnelParams {
    key: String,
    listener_id: Option<String>,
}

pub async fn ws_upgrade(
    ws: WebSocketUpgrade,
    Query(params): Query<TunnelParams>,
    State(state): State<Arc<AppState>>,
) -> Result<Response, AppError> {
    let project = db::get_project_by_key(&state.db, &params.key)
        .await?
        .ok_or(AppError::Unauthorized)?;

    // Validate listener_id exists in DB if provided
    if let Some(ref lid) = params.listener_id {
        let listener = db::get_listener(&state.db, &project.id, lid).await?;
        if listener.is_none() {
            return Err(AppError::BadRequest("listener_id not found for this project"));
        }
    }

    let listener_id = params.listener_id;
    Ok(ws.on_upgrade(move |socket| handle_ws(socket, state, project, listener_id)))
}

async fn handle_ws(socket: WebSocket, state: Arc<AppState>, project: db::Project, listener_id: Option<String>) {
    let project_id = project.id.clone();
    tracing::info!(project_id = %project_id, listener_id = ?listener_id, "SDK connected");

    let mut rx = state.tunnels.register(project_id.clone(), listener_id.clone()).await;
    let (mut ws_tx, mut ws_rx) = socket.split();

    // Track in-flight requests
    let pending: Arc<RwLock<HashMap<String, oneshot::Sender<ResponseFrame>>>> =
        Arc::new(RwLock::new(HashMap::new()));
    let pending_read = pending.clone();

    // Spawn reader: SDK responses come in here
    let mut read_handle = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_rx.next().await {
            let text = match msg {
                Message::Text(t) => t,
                Message::Close(_) => break,
                _ => continue,
            };

            let Ok(frame) = serde_json::from_str::<serde_json::Value>(&text) else {
                continue;
            };

            let frame_type = frame.get("type").and_then(|t| t.as_str()).unwrap_or("");

            if frame_type == "response" {
                if let (Some(id), Some(status)) = (
                    frame.get("id").and_then(|v| v.as_str()),
                    frame.get("status").and_then(|v| v.as_u64()),
                ) {
                    let resp = ResponseFrame {
                        frame_type: "response".into(),
                        id: id.to_string(),
                        status: status as u16,
                        headers: frame.get("headers").and_then(|v| serde_json::from_value(v.clone()).ok()),
                        body: frame.get("body").and_then(|v| v.as_str()).map(String::from),
                    };
                    let mut p = pending_read.write().await;
                    if let Some(sender) = p.remove(&resp.id) {
                        let _ = sender.send(resp);
                    }
                }
            }
            // pong frames are just keepalive acks, ignore
        }
    });

    // Drain pending events CONCURRENTLY — spawned so the select loop runs at the same time
    let drain_state = state.clone();
    let drain_pid = project_id.clone();
    let drain_lid = listener_id.clone();
    tokio::spawn(async move {
        // Small delay to ensure the select loop is running
        tokio::time::sleep(Duration::from_millis(50)).await;
        drain_pending(&drain_state, &drain_pid, drain_lid.as_deref()).await;
    });

    // Main loop: forward requests to SDK + keepalive
    let mut ping_interval = tokio::time::interval(Duration::from_secs(30));

    loop {
        tokio::select! {
            Some((request_frame, resp_sender)) = rx.recv() => {
                let event_id = request_frame.id.clone();
                pending.write().await.insert(event_id, resp_sender);
                let json = serde_json::to_string(&request_frame).unwrap();
                if ws_tx.send(Message::Text(json.into())).await.is_err() {
                    break;
                }
            }
            _ = ping_interval.tick() => {
                let ping = r#"{"type":"ping"}"#;
                if ws_tx.send(Message::Text(ping.into())).await.is_err() {
                    break;
                }
            }
            _ = &mut read_handle => {
                break;
            }
        }
    }

    state.tunnels.unregister(&project_id, listener_id.as_deref()).await;
    tracing::info!(project_id = %project_id, listener_id = ?listener_id, "SDK disconnected");
}

/// On reconnect, immediately try to deliver any pending queued events.
async fn drain_pending(state: &AppState, project_id: &str, listener_id: Option<&str>) {
    let events = match db::get_pending_for_project(&state.db, project_id, listener_id).await {
        Ok(e) => e,
        Err(e) => {
            tracing::error!(error = %e, "failed to drain pending events");
            return;
        }
    };

    if events.is_empty() {
        return;
    }

    tracing::info!(project_id = %project_id, listener_id = ?listener_id, count = events.len(), "draining pending events");

    for event in events {
        let headers: HashMap<String, String> =
            serde_json::from_value(event.headers.clone()).unwrap_or_default();

        let frame = RequestFrame {
            frame_type: "request".into(),
            id: event.id.clone(),
            method: event.method.clone(),
            path: event.path.clone(),
            headers,
            body: event.body.as_ref().map(|b| {
                use base64::Engine;
                base64::engine::general_purpose::STANDARD.encode(b)
            }),
        };

        match state
            .tunnels
            .send_request(project_id, listener_id, frame, Duration::from_secs(10))
            .await
        {
            Some(resp) => {
                let body_bytes = resp.body.as_ref().and_then(|b| {
                    use base64::Engine;
                    base64::engine::general_purpose::STANDARD.decode(b).ok()
                });
                let _ = db::mark_delivered(
                    &state.db,
                    &event.id,
                    resp.status as i16,
                    body_bytes.as_deref(),
                )
                .await;
            }
            None => {
                let _ = db::schedule_retry(&state.db, &event.id, event.attempts + 1).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_frame_serialization() {
        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_abc123".into(),
            method: "POST".into(),
            path: "/stripe/webhook".into(),
            headers: HashMap::from([("content-type".into(), "application/json".into())]),
            body: Some("eyJ0ZXN0IjogdHJ1ZX0=".into()),
        };

        let json = serde_json::to_string(&frame).unwrap();
        assert!(json.contains(r#""type":"request"#));
        assert!(json.contains(r#""id":"evt_abc123"#));
        assert!(json.contains(r#""method":"POST"#));
    }

    #[test]
    fn test_response_frame_deserialization() {
        let json = r#"{"type":"response","id":"evt_abc","status":200,"headers":{"content-type":"application/json"},"body":"eyJvayI6IHRydWV9"}"#;
        let frame: ResponseFrame = serde_json::from_str(json).unwrap();
        assert_eq!(frame.id, "evt_abc");
        assert_eq!(frame.status, 200);
        assert!(frame.body.is_some());
    }

    #[tokio::test]
    async fn test_tunnel_manager_register_unregister() {
        let tm = TunnelManager::new();
        let _rx = tm.register("p_test".into(), None).await;
        assert!(tm.is_connected("p_test", None).await);

        tm.unregister("p_test", None).await;
        assert!(!tm.is_connected("p_test", None).await);
    }

    #[tokio::test]
    async fn test_tunnel_manager_not_connected() {
        let tm = TunnelManager::new();
        assert!(!tm.is_connected("p_nonexistent", None).await);
    }

    #[tokio::test]
    async fn test_tunnel_manager_send_no_connection() {
        let tm = TunnelManager::new();
        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_test".into(),
            method: "POST".into(),
            path: "/test".into(),
            headers: HashMap::new(),
            body: None,
        };
        let result = tm.send_request("p_none", None, frame, Duration::from_millis(100)).await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_tunnel_manager_send_and_receive() {
        let tm = TunnelManager::new();
        let mut rx = tm.register("p_test".into(), None).await;

        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_123".into(),
            method: "POST".into(),
            path: "/webhook".into(),
            headers: HashMap::new(),
            body: None,
        };

        // Spawn a "fake SDK" that responds
        tokio::spawn(async move {
            if let Some((req, resp_tx)) = rx.recv().await {
                let resp = ResponseFrame {
                    frame_type: "response".into(),
                    id: req.id,
                    status: 200,
                    headers: None,
                    body: None,
                };
                let _ = resp_tx.send(resp);
            }
        });

        let result = tm.send_request("p_test", None, frame, Duration::from_secs(5)).await;
        assert!(result.is_some());
        let resp = result.unwrap();
        assert_eq!(resp.status, 200);
        assert_eq!(resp.id, "evt_123");
    }

    #[tokio::test]
    async fn test_tunnel_manager_timeout() {
        let tm = TunnelManager::new();
        let _rx = tm.register("p_test".into(), None).await;
        // rx is alive but never responds

        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_timeout".into(),
            method: "POST".into(),
            path: "/test".into(),
            headers: HashMap::new(),
            body: None,
        };

        let result = tm.send_request("p_test", None, frame, Duration::from_millis(50)).await;
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn test_tunnel_manager_replaces_old_connection() {
        let tm = TunnelManager::new();
        let _rx1 = tm.register("p_test".into(), None).await;
        let mut rx2 = tm.register("p_test".into(), None).await;

        // Old connection's receiver should be dropped
        // New connection should work
        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_new".into(),
            method: "POST".into(),
            path: "/test".into(),
            headers: HashMap::new(),
            body: None,
        };

        tokio::spawn(async move {
            if let Some((req, resp_tx)) = rx2.recv().await {
                let _ = resp_tx.send(ResponseFrame {
                    frame_type: "response".into(),
                    id: req.id,
                    status: 201,
                    headers: None,
                    body: None,
                });
            }
        });

        let result = tm.send_request("p_test", None, frame, Duration::from_secs(1)).await;
        assert!(result.is_some());
        assert_eq!(result.unwrap().status, 201);
    }

    #[tokio::test]
    async fn test_tunnel_manager_with_listener_id() {
        let tm = TunnelManager::new();

        // Register with listener_id
        let mut rx = tm.register("p_test".into(), Some("dev".into())).await;

        // Should be connected for specific listener
        assert!(tm.is_connected("p_test", Some("dev")).await);
        // Should NOT be connected for None listener
        assert!(!tm.is_connected("p_test", None).await);
        // Should NOT be connected for different listener
        assert!(!tm.is_connected("p_test", Some("staging")).await);
        // is_any_connected should be true
        assert!(tm.is_any_connected("p_test").await);

        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_lid".into(),
            method: "POST".into(),
            path: "/test".into(),
            headers: HashMap::new(),
            body: None,
        };

        tokio::spawn(async move {
            if let Some((req, resp_tx)) = rx.recv().await {
                let _ = resp_tx.send(ResponseFrame {
                    frame_type: "response".into(),
                    id: req.id,
                    status: 200,
                    headers: None,
                    body: None,
                });
            }
        });

        let result = tm.send_request("p_test", Some("dev"), frame, Duration::from_secs(1)).await;
        assert!(result.is_some());
        assert_eq!(result.unwrap().status, 200);

        // Sending to wrong listener should fail
        let frame2 = RequestFrame {
            frame_type: "request".into(),
            id: "evt_lid2".into(),
            method: "POST".into(),
            path: "/test".into(),
            headers: HashMap::new(),
            body: None,
        };
        let result2 = tm.send_request("p_test", None, frame2, Duration::from_millis(50)).await;
        assert!(result2.is_none());
    }

    #[tokio::test]
    async fn test_tunnel_manager_multiple_listeners() {
        let tm = TunnelManager::new();

        let _rx_none = tm.register("p_test".into(), None).await;
        let _rx_dev = tm.register("p_test".into(), Some("dev".into())).await;

        // Both should be connected independently
        assert!(tm.is_connected("p_test", None).await);
        assert!(tm.is_connected("p_test", Some("dev")).await);
        assert!(tm.is_any_connected("p_test").await);

        // Unregister dev, None should still work
        tm.unregister("p_test", Some("dev")).await;
        assert!(!tm.is_connected("p_test", Some("dev")).await);
        assert!(tm.is_connected("p_test", None).await);
        assert!(tm.is_any_connected("p_test").await);

        // Unregister None too
        tm.unregister("p_test", None).await;
        assert!(!tm.is_connected("p_test", None).await);
        assert!(!tm.is_any_connected("p_test").await);
    }

    #[tokio::test]
    async fn test_is_any_connected_none() {
        let tm = TunnelManager::new();
        assert!(!tm.is_any_connected("p_test").await);
    }
}
