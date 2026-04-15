use axum::{
    body::Bytes,
    extract::{Path, State},
    http::{HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use base64::Engine;
use std::{collections::HashMap, sync::Arc, time::Duration};
use tracing::warn;

use crate::{app::AppState, db, error::AppError, tunnel::RequestFrame};

pub async fn handle_webhook(
    State(state): State<Arc<AppState>>,
    Path((project_id, path)): Path<(String, String)>,
    method: Method,
    headers: HeaderMap,
    body: Bytes,
) -> Result<Response, AppError> {
    // Rate limit: 500 webhooks per minute per project
    if !state.rate_limiter.check(
        &format!("hooks:{}", project_id),
        500,
        Duration::from_secs(60),
    ).await {
        warn!(project_id = %project_id, "webhook rate limit exceeded");
        return Ok((StatusCode::TOO_MANY_REQUESTS, "rate limit exceeded").into_response());
    }

    // 1. Verify project exists
    let project = db::get_project_by_id(&state.db, &project_id)
        .await?
        .ok_or(AppError::NotFound("project not found"))?;

    // 1b. Check billing status
    if project.billing_status == "trial_expired" || project.billing_status == "cancelled" {
        return Ok((
            StatusCode::PAYMENT_REQUIRED,
            Json(serde_json::json!({
                "error": "payment_required",
                "message": "Your trial has ended or subscription is cancelled. Please subscribe to continue receiving webhooks.",
            })),
        ).into_response());
    }

    let full_path = format!("/{}", path);

    // 2. Determine route mode + timeout (longest prefix match, default: queue 5s)
    let matched_route = db::match_route(&state.db, &project_id, &full_path).await?;
    let has_route = matched_route.is_some();
    let route_match = matched_route.unwrap_or(db::RouteMatch {
        mode: db::RouteMode::Queue,
        timeout_seconds: 5,
        listener_id: None,
    });
    let listener_id = route_match.listener_id.clone();
    let route_mode_str: Option<&str> = if has_route {
        Some(match route_match.mode {
            db::RouteMode::Passthrough => "passthrough",
            db::RouteMode::Queue => "queue",
        })
    } else {
        None // no matching route — will show as "unmatched" in UI
    };

    // 3. Serialize headers + enforce size limit (64KB)
    let header_map = serialize_headers(&headers);
    let headers_json = serde_json::to_value(&header_map).unwrap_or_default();
    if headers_json.to_string().len() > 65_536 {
        return Ok((StatusCode::REQUEST_HEADER_FIELDS_TOO_LARGE, "headers too large").into_response());
    }

    // 4. Store event
    let event_id = db::generate_id("evt_", 16);
    let body_bytes = if body.is_empty() { None } else { Some(body.as_ref()) };
    // In passthrough mode, don't persist the body (data-in-transit only for privacy)
    let stored_body = if route_match.mode == db::RouteMode::Queue { body_bytes } else { None };
    db::insert_event(
        &state.db,
        &event_id,
        &project_id,
        &full_path,
        method.as_str(),
        &header_map,
        stored_body,
        route_mode_str,
        listener_id.as_deref(),
    )
    .await?;

    // 5. Build request frame with delivery signature
    let body_b64 = body_bytes
        .map(|b| base64::engine::general_purpose::STANDARD.encode(b));
    let signing_key = crate::signature::derive_signing_key(&project.api_key);
    let (sig_ts, sig_val) = crate::signature::sign_event(&signing_key, &event_id, body_b64.as_deref());
    let mut signed_headers = header_map;
    signed_headers.insert("webhook-id".into(), event_id.clone());
    signed_headers.insert("webhook-timestamp".into(), sig_ts.to_string());
    signed_headers.insert("webhook-signature".into(), sig_val);

    let frame = RequestFrame {
        frame_type: "request".into(),
        id: event_id.clone(),
        method: method.to_string(),
        path: full_path,
        headers: signed_headers,
        body: body_b64,
    };

    // 6. Forward based on mode
    let timeout = Duration::from_secs(route_match.timeout_seconds);
    match route_match.mode {
        db::RouteMode::Passthrough => handle_passthrough(&state, &project_id, listener_id.as_deref(), &event_id, frame, timeout).await,
        db::RouteMode::Queue => handle_queue(&state, &project_id, listener_id.as_deref(), &event_id, frame, timeout).await,
    }
}

async fn handle_passthrough(
    state: &Arc<AppState>,
    project_id: &str,
    listener_id: Option<&str>,
    event_id: &str,
    frame: RequestFrame,
    timeout: Duration,
) -> Result<Response, AppError> {
    match state
        .tunnels
        .send_request(project_id, listener_id, frame, timeout)
        .await
    {
        Some(resp) => {
            let body_bytes = resp.body.as_ref().and_then(|b| {
                base64::engine::general_purpose::STANDARD.decode(b).ok()
            });
            let _ = db::mark_delivered(
                &state.db,
                event_id,
                resp.status as i16,
                body_bytes.as_deref(),
            )
            .await;
            Ok(build_response(resp.status, resp.headers, body_bytes))
        }
        None => Ok((StatusCode::BAD_GATEWAY, "SDK not connected or timed out").into_response()),
    }
}

async fn handle_queue(
    state: &Arc<AppState>,
    project_id: &str,
    listener_id: Option<&str>,
    event_id: &str,
    frame: RequestFrame,
    timeout: Duration,
) -> Result<Response, AppError> {
    // Try instant delivery in background
    let state = state.clone();
    let pid = project_id.to_string();
    let lid = listener_id.map(String::from);
    let eid = event_id.to_string();

    tokio::spawn(async move {
        match state
            .tunnels
            .send_request(&pid, lid.as_deref(), frame, timeout)
            .await
        {
            Some(resp) => {
                let body_bytes = resp.body.as_ref().and_then(|b| {
                    base64::engine::general_purpose::STANDARD.decode(b).ok()
                });
                let _ = db::mark_delivered(&state.db, &eid, resp.status as i16, body_bytes.as_deref()).await;
            }
            None => {
                let _ = db::schedule_retry(&state.db, &eid, 0).await;
            }
        }
    });

    Ok((StatusCode::OK, "accepted").into_response())
}

fn build_response(
    status: u16,
    headers: Option<HashMap<String, String>>,
    body: Option<Vec<u8>>,
) -> Response {
    let mut builder = Response::builder().status(status);
    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            if let (Ok(name), Ok(val)) = (
                axum::http::header::HeaderName::from_bytes(k.as_bytes()),
                axum::http::header::HeaderValue::from_str(&v),
            ) {
                builder = builder.header(name, val);
            }
        }
    }
    builder
        .body(axum::body::Body::from(body.unwrap_or_default()))
        .unwrap_or_else(|_| StatusCode::INTERNAL_SERVER_ERROR.into_response())
}

fn serialize_headers(headers: &HeaderMap) -> HashMap<String, String> {
    headers
        .iter()
        .filter_map(|(k, v)| {
            v.to_str().ok().map(|val| (k.as_str().to_string(), val.to_string()))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_serialize_headers() {
        let mut hm = HeaderMap::new();
        hm.insert("content-type", "application/json".parse().unwrap());
        hm.insert("x-custom", "hello".parse().unwrap());

        let result = serialize_headers(&hm);
        assert_eq!(result.get("content-type").unwrap(), "application/json");
        assert_eq!(result.get("x-custom").unwrap(), "hello");
    }

    #[test]
    fn test_build_response_200() {
        let resp = build_response(200, None, Some(b"ok".to_vec()));
        assert_eq!(resp.status(), 200);
    }

    #[test]
    fn test_build_response_with_headers() {
        let headers = HashMap::from([
            ("content-type".to_string(), "text/xml".to_string()),
        ]);
        let body = b"<Response><Hangup/></Response>".to_vec();
        let resp = build_response(200, Some(headers), Some(body));
        assert_eq!(resp.status(), 200);
        assert_eq!(resp.headers().get("content-type").unwrap(), "text/xml");
    }

    #[test]
    fn test_build_response_empty_body() {
        let resp = build_response(204, None, None);
        assert_eq!(resp.status(), 204);
    }

    #[test]
    fn test_full_path_construction() {
        let path = "stripe/webhook";
        let full_path = format!("/{}", path);
        assert_eq!(full_path, "/stripe/webhook");
    }
}
