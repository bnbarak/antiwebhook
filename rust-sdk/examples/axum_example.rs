use axum::{routing::post, Json, Router};
use simplehook::{listen_to_webhooks, ListenOptions};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route(
            "/stripe/events",
            post(|Json(body): Json<serde_json::Value>| async move {
                println!("[stripe] {:?}", body.get("type").unwrap_or(&serde_json::Value::Null));
                Json(serde_json::json!({"received": true}))
            }),
        )
        .route(
            "/github/push",
            post(|Json(body): Json<serde_json::Value>| async move {
                println!(
                    "[github] ref={:?} commits={:?}",
                    body.get("ref"),
                    body.get("commits").and_then(|c| c.as_array()).map(|a| a.len())
                );
                Json(serde_json::json!({"ok": true}))
            }),
        );

    // Create dispatch function from axum router
    let dispatch = simplehook::dispatch::axum_dispatch(app.clone());

    // One line -- webhooks flow through this connection
    let _conn = listen_to_webhooks(
        dispatch,
        &std::env::var("SIMPLEHOOK_KEY").expect("SIMPLEHOOK_KEY must be set"),
        ListenOptions::default(),
    );

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Listening on :3000");
    println!("Waiting for webhooks via simplehook...");
    axum::serve(listener, app).await.unwrap();
}
