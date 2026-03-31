use crate::frames::{InboundFrame, PongFrame, RequestFrame};
use crate::options::{DispatchFn, ListenOptions};
use futures_util::{SinkExt, StreamExt};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Notify;
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_URL: &str = "wss://hook.simplehook.dev";
const MAX_BACKOFF_SECS: u64 = 30;
const INITIAL_BACKOFF_SECS: u64 = 1;

fn log_msg(silent: bool, msg: &str) {
    if !silent {
        tracing::info!("{}", msg);
        println!("{}", msg);
    }
}

/// Run the WebSocket client with automatic reconnection.
pub(crate) async fn run_client(
    dispatch: DispatchFn,
    api_key: String,
    opts: ListenOptions,
    shutdown: Arc<Notify>,
) {
    let server_url = match &opts.server_url {
        Some(url) => url.clone(),
        None => std::env::var("SIMPLEHOOK_URL").unwrap_or_else(|_| DEFAULT_URL.to_string()),
    };

    let mut ws_url = format!("{}/tunnel?key={}", server_url, api_key);
    if let Some(ref lid) = opts.listener_id {
        ws_url.push_str(&format!("&listener_id={}", lid));
    }

    let silent = opts.silent;
    let mut backoff = INITIAL_BACKOFF_SECS;

    loop {
        match connect_and_run(&ws_url, &dispatch, silent, &opts, &shutdown).await {
            Ok(()) => {
                // Clean shutdown
                return;
            }
            Err(e) => {
                log_msg(
                    silent,
                    &format!(
                        "[simplehook] disconnected ({}), reconnecting in {}s...",
                        e, backoff
                    ),
                );
                if let Some(ref cb) = opts.on_disconnect {
                    cb();
                }

                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(backoff)) => {}
                    _ = shutdown.notified() => return,
                }

                backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
            }
        }
    }
}

/// Connect to the WebSocket and handle messages until disconnection or shutdown.
async fn connect_and_run(
    url: &str,
    dispatch: &DispatchFn,
    silent: bool,
    opts: &ListenOptions,
    shutdown: &Arc<Notify>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(url).await?;
    let (mut write, mut read) = ws_stream.split();

    log_msg(silent, "[simplehook] connected");
    if let Some(ref cb) = opts.on_connect {
        cb();
    }

    loop {
        tokio::select! {
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        // Parse the frame type first
                        let frame_type = match serde_json::from_str::<InboundFrame>(&text) {
                            Ok(f) => f.frame_type,
                            Err(_) => continue,
                        };

                        match frame_type.as_str() {
                            "ping" => {
                                let pong = PongFrame { frame_type: "pong".into() };
                                let pong_json = serde_json::to_string(&pong)?;
                                write.send(Message::Text(pong_json.into())).await?;
                            }
                            "request" => {
                                let frame: RequestFrame = match serde_json::from_str(&text) {
                                    Ok(f) => f,
                                    Err(_) => continue,
                                };

                                // Dispatch the request
                                let resp = dispatch(frame).await;

                                let resp_json = serde_json::to_string(&resp)?;
                                write.send(Message::Text(resp_json.into())).await?;
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => {
                        return Err("connection closed".into());
                    }
                    Some(Err(e)) => {
                        return Err(Box::new(e));
                    }
                    _ => {
                        // Binary, Ping, Pong — ignore
                    }
                }
            }
            _ = shutdown.notified() => {
                // Clean shutdown requested
                let _ = write.send(Message::Close(None)).await;
                return Ok(());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_backoff_calculation() {
        let mut backoff = INITIAL_BACKOFF_SECS;
        assert_eq!(backoff, 1);

        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
        assert_eq!(backoff, 2);

        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
        assert_eq!(backoff, 4);

        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
        assert_eq!(backoff, 8);

        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
        assert_eq!(backoff, 16);

        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
        assert_eq!(backoff, 30);

        backoff = (backoff * 2).min(MAX_BACKOFF_SECS);
        assert_eq!(backoff, 30);
    }
}
