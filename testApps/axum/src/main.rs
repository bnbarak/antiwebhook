use axum::{
    extract::Request,
    routing::{get, post},
    Json, Router,
};
use simplehook::{listen_to_webhooks, ListenOptions};

#[tokio::main]
async fn main() {
    let app = Router::new()
        // Stripe webhooks
        .route(
            "/stripe/events",
            post(|Json(body): Json<serde_json::Value>| async move {
                println!(
                    "[stripe] {}",
                    body.get("type")
                        .and_then(|v| v.as_str())
                        .unwrap_or("unknown event")
                );
                Json(serde_json::json!({"received": true}))
            }),
        )
        // GitHub webhooks
        .route(
            "/github/push",
            post(|Json(body): Json<serde_json::Value>| async move {
                println!(
                    "[github] ref={:?} commits={}",
                    body.get("ref").and_then(|v| v.as_str()).unwrap_or("?"),
                    body.get("commits")
                        .and_then(|c| c.as_array())
                        .map(|a| a.len())
                        .unwrap_or(0)
                );
                Json(serde_json::json!({"ok": true}))
            }),
        )
        // Twilio voice
        .route(
            "/twilio/voice",
            post(|| async {
                (
                    [("content-type", "text/xml")],
                    "<Response><Say>Hello from simplehook test app!</Say></Response>",
                )
            }),
        )
        // Generic webhook endpoint
        .route(
            "/webhook",
            post(|req: Request| async move {
                let method = req.method().to_string();
                let path = req.uri().path().to_string();
                println!("[webhook] {} {}", method, path);
                Json(serde_json::json!({
                    "received": true,
                    "path": path,
                    "method": method,
                }))
            }),
        )
        // Health check
        .route("/health", get(|| async { "ok" }));

    // Connect to simplehook
    let api_key =
        std::env::var("SIMPLEHOOK_KEY").unwrap_or_else(|_| "ak_your_key_here".to_string());

    let listener_id = std::env::var("SIMPLEHOOK_LISTENER").ok();
    let server_url = std::env::var("SIMPLEHOOK_URL").ok();

    let dispatch = simplehook::dispatch::axum_dispatch(app.clone());

    let _conn = listen_to_webhooks(
        dispatch,
        &api_key,
        ListenOptions {
            force_enable: true,
            listener_id,
            server_url,
            ..Default::default()
        },
    );

    let port = std::env::var("PORT").unwrap_or_else(|_| "3002".to_string());
    let addr = format!("0.0.0.0:{}", port);

    println!("Axum test app listening on :{}", port);
    println!("Waiting for webhooks via simplehook...");

    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
