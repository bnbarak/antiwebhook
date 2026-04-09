# simplehook-rust

One line of code. Webhooks just work.

Rust SDK for [simplehook](https://simplehook.dev) -- receive webhooks in local development via a WebSocket tunnel. No ngrok, no port forwarding, no config.

## Install

```toml
[dependencies]
simplehook = { path = "../rust-sdk" }
# or from git:
# simplehook = { git = "https://github.com/bnbarak/antiwebhook", subdirectory = "rust-sdk" }
```

## Quick start (axum)

```rust
use axum::{routing::post, Json, Router};
use simplehook::{listen_to_webhooks, ListenOptions};

#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/stripe/events", post(|Json(body): Json<serde_json::Value>| async move {
            println!("Webhook: {:?}", body);
            Json(serde_json::json!({"received": true}))
        }));

    // Create dispatch function from axum router
    let dispatch = simplehook::dispatch::axum_dispatch(app.clone());

    // One line -- webhooks flow through this connection
    let _conn = listen_to_webhooks(
        dispatch,
        &std::env::var("SIMPLEHOOK_KEY").unwrap(),
        ListenOptions::default(),
    );

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

## Custom dispatch

If you are not using axum, provide your own dispatch function:

```rust
use simplehook::{listen_to_webhooks, ListenOptions, RequestFrame, ResponseFrame, DispatchFn};
use std::sync::Arc;
use std::collections::HashMap;

let dispatch: DispatchFn = Arc::new(|frame: RequestFrame| {
    Box::pin(async move {
        // Your custom routing logic here
        ResponseFrame {
            frame_type: "response".into(),
            id: frame.id,
            status: 200,
            headers: HashMap::new(),
            body: None,
        }
    })
});

let _conn = listen_to_webhooks(dispatch, "ak_xxx", ListenOptions::default());
```

## Options

```rust
let _conn = listen_to_webhooks(dispatch, api_key, ListenOptions {
    listener_id: Some("staging".into()),     // identify this listener
    force_enable: true,                       // enable even in production
    server_url: Some("wss://custom.url".into()), // custom server
    silent: true,                             // suppress logs
    on_connect: Some(Box::new(|| println!("connected"))),
    on_disconnect: Some(Box::new(|| println!("disconnected"))),
});
```

## How it works

1. Your app calls `listen_to_webhooks` with a dispatch function and API key
2. The SDK opens a WebSocket tunnel to simplehook's server
3. When a webhook arrives at your simplehook URL, it's forwarded through the tunnel
4. The SDK dispatches it to your handler via the dispatch function
5. The response is sent back through the tunnel to the webhook sender

## Production safety

By default, the SDK is a no-op in production (`RUST_ENV=production` or `ENV=production`). It also respects `SIMPLEHOOK_ENABLED=false` to explicitly disable.

## Agents

If you have multiple developers or environments, use listener IDs:

```rust
let _conn = listen_to_webhooks(dispatch, api_key, ListenOptions {
    listener_id: Some("alice-laptop".into()),
    ..Default::default()
});
```

## Links

- [simplehook.dev](https://simplehook.dev)
- [Dashboard](https://simplehook.dev/dashboard)
- [JavaScript SDK](https://www.npmjs.com/package/@simplehook/express)
- [Go SDK](https://github.com/bnbarak/antiwebhook/tree/main/go)
