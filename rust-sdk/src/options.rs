use crate::frames::{RequestFrame, ResponseFrame};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::Notify;

/// The dispatch function type: takes a RequestFrame and returns a ResponseFrame.
///
/// Users provide this to route inbound webhook requests to their application.
pub type DispatchFn = Arc<
    dyn Fn(RequestFrame) -> Pin<Box<dyn Future<Output = ResponseFrame> + Send>> + Send + Sync,
>;

/// Configuration for the webhook listener.
pub struct ListenOptions {
    /// Override production detection and enable the tunnel anyway.
    pub force_enable: bool,

    /// Override the default simplehook server URL.
    /// Defaults to `wss://hook.simplehook.dev` or `SIMPLEHOOK_URL` env var.
    pub server_url: Option<String>,

    /// Identify this listener when multiple listeners share an API key.
    pub listener_id: Option<String>,

    /// Called when the WebSocket connection is established.
    pub on_connect: Option<Box<dyn Fn() + Send + Sync>>,

    /// Called when the WebSocket connection is lost.
    pub on_disconnect: Option<Box<dyn Fn() + Send + Sync>>,

    /// Suppress log output when true.
    pub silent: bool,
}

impl Default for ListenOptions {
    fn default() -> Self {
        Self {
            force_enable: false,
            server_url: None,
            listener_id: None,
            on_connect: None,
            on_disconnect: None,
            silent: false,
        }
    }
}

/// Represents an active webhook tunnel connection.
///
/// Call [`close`](Connection::close) to shut down the tunnel gracefully.
pub struct Connection {
    shutdown: Arc<Notify>,
}

impl Connection {
    pub(crate) fn new(shutdown: Arc<Notify>) -> Self {
        Self { shutdown }
    }

    /// Create a no-op connection (used when disabled or in production).
    pub(crate) fn noop() -> Self {
        Self {
            shutdown: Arc::new(Notify::new()),
        }
    }

    /// Signal the tunnel to shut down.
    pub fn close(&self) {
        self.shutdown.notify_one();
    }
}
