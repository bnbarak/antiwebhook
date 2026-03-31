use axum::{
    body::Body,
    routing::{get, post},
    Json, Router,
};
use base64::Engine;
use simplehook::frames::{RequestFrame, ResponseFrame};
use std::collections::HashMap;

fn test_router() -> Router {
    Router::new()
        .route(
            "/stripe/events",
            post(|Json(body): Json<serde_json::Value>| async move {
                let event_type = body.get("type").and_then(|v| v.as_str()).unwrap_or("unknown");
                Json(serde_json::json!({
                    "received": true,
                    "type": event_type,
                }))
            }),
        )
        .route(
            "/github/push",
            post(|| async { Json(serde_json::json!({"ok": true})) }),
        )
        .route("/health", get(|| async { "ok" }))
}

#[tokio::test]
async fn test_dispatch_post_with_body() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    let payload = r#"{"type":"invoice.paid","id":"evt_123"}"#;
    let body_b64 = base64::engine::general_purpose::STANDARD.encode(payload.as_bytes());

    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-1".into(),
        method: "POST".into(),
        path: "/stripe/events".into(),
        headers: HashMap::from([("content-type".into(), "application/json".into())]),
        body: Some(body_b64),
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-1");
    assert_eq!(resp.status, 200);
    assert!(resp.body.is_some());

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(resp.body.unwrap())
        .unwrap();
    let body: serde_json::Value = serde_json::from_slice(&decoded).unwrap();
    assert_eq!(body["received"], true);
    assert_eq!(body["type"], "invoice.paid");
}

#[tokio::test]
async fn test_dispatch_get() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-2".into(),
        method: "GET".into(),
        path: "/health".into(),
        headers: HashMap::new(),
        body: None,
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-2");
    assert_eq!(resp.status, 200);
    assert!(resp.body.is_some());

    let decoded = base64::engine::general_purpose::STANDARD
        .decode(resp.body.unwrap())
        .unwrap();
    assert_eq!(String::from_utf8(decoded).unwrap(), "ok");
}

#[tokio::test]
async fn test_dispatch_empty_body() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-3".into(),
        method: "POST".into(),
        path: "/github/push".into(),
        headers: HashMap::from([("content-type".into(), "application/json".into())]),
        body: None,
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-3");
    // axum will return 200 since the handler doesn't require a body extractor for this route
    assert_eq!(resp.status, 200);
}

#[tokio::test]
async fn test_dispatch_404() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-4".into(),
        method: "GET".into(),
        path: "/does-not-exist".into(),
        headers: HashMap::new(),
        body: None,
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-4");
    assert_eq!(resp.status, 404);
}

#[tokio::test]
async fn test_dispatch_method_not_allowed() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    // Send GET to a POST-only route
    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-5".into(),
        method: "GET".into(),
        path: "/stripe/events".into(),
        headers: HashMap::new(),
        body: None,
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-5");
    assert_eq!(resp.status, 405);
}

#[tokio::test]
async fn test_dispatch_invalid_base64_body() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-6".into(),
        method: "POST".into(),
        path: "/stripe/events".into(),
        headers: HashMap::from([("content-type".into(), "application/json".into())]),
        body: Some("not-valid-base64!!!".into()),
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-6");
    assert_eq!(resp.status, 502);
}

#[tokio::test]
async fn test_dispatch_path_without_leading_slash() {
    let app = test_router();
    let dispatch = simplehook::dispatch::axum_dispatch(app);

    // Path without leading /
    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "req-7".into(),
        method: "GET".into(),
        path: "health".into(),
        headers: HashMap::new(),
        body: None,
    };

    let resp = dispatch(frame).await;

    assert_eq!(resp.frame_type, "response");
    assert_eq!(resp.id, "req-7");
    assert_eq!(resp.status, 200);
}

#[tokio::test]
async fn test_sanitize_headers() {
    let mut headers = HashMap::new();
    headers.insert("Content-Type".into(), "application/json".into());
    headers.insert("Host".into(), "example.com".into());
    headers.insert("Connection".into(), "keep-alive".into());
    headers.insert("Transfer-Encoding".into(), "chunked".into());
    headers.insert("Content-Length".into(), "999".into());
    headers.insert("X-Custom".into(), "value".into());

    let result = simplehook::dispatch::sanitize_headers(&headers, 42);

    assert!(!result.contains_key("host"));
    assert!(!result.contains_key("connection"));
    assert!(!result.contains_key("transfer-encoding"));
    assert_eq!(result.get("content-type").unwrap(), "application/json");
    assert_eq!(result.get("x-custom").unwrap(), "value");
    assert_eq!(result.get("content-length").unwrap(), "42");
}

#[tokio::test]
async fn test_sanitize_headers_no_body() {
    let mut headers = HashMap::new();
    headers.insert("Content-Type".into(), "text/plain".into());

    let result = simplehook::dispatch::sanitize_headers(&headers, 0);

    assert!(!result.contains_key("content-length"));
}

#[tokio::test]
async fn test_frame_serialization_roundtrip() {
    let frame = RequestFrame {
        frame_type: "request".into(),
        id: "evt_roundtrip".into(),
        method: "POST".into(),
        path: "/webhook".into(),
        headers: HashMap::from([
            ("content-type".into(), "application/json".into()),
            ("x-webhook-id".into(), "wh_123".into()),
        ]),
        body: Some("eyJ0ZXN0IjogdHJ1ZX0=".into()),
    };

    let json = serde_json::to_string(&frame).unwrap();
    let deserialized: RequestFrame = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.frame_type, "request");
    assert_eq!(deserialized.id, "evt_roundtrip");
    assert_eq!(deserialized.method, "POST");
    assert_eq!(deserialized.path, "/webhook");
    assert_eq!(deserialized.headers.len(), 2);
    assert_eq!(deserialized.body, Some("eyJ0ZXN0IjogdHJ1ZX0=".into()));
}

#[tokio::test]
async fn test_response_frame_roundtrip() {
    let frame = ResponseFrame {
        frame_type: "response".into(),
        id: "evt_resp".into(),
        status: 201,
        headers: HashMap::from([("content-type".into(), "application/json".into())]),
        body: Some("eyJjcmVhdGVkIjogdHJ1ZX0=".into()),
    };

    let json = serde_json::to_string(&frame).unwrap();
    let deserialized: ResponseFrame = serde_json::from_str(&json).unwrap();

    assert_eq!(deserialized.frame_type, "response");
    assert_eq!(deserialized.id, "evt_resp");
    assert_eq!(deserialized.status, 201);
    assert_eq!(deserialized.body, Some("eyJjcmVhdGVkIjogdHJ1ZX0=".into()));
}
