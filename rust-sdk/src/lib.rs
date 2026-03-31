//! # simplehook
//!
//! One line of code. Webhooks just work.
//!
//! Rust SDK for [simplehook](https://simplehook.dev) -- receive webhooks in local
//! development via a WebSocket tunnel. No ngrok, no port forwarding, no config.
//!
//! ## Quick start
//!
//! ```ignore
//! use axum::{routing::post, Json, Router};
//! use simplehook::{listen_to_webhooks, ListenOptions};
//!
//! #[tokio::main]
//! async fn main() {
//!     let app = Router::new()
//!         .route("/stripe/events", post(handler));
//!
//!     let dispatch = simplehook::dispatch::axum_dispatch(app.clone());
//!     let _conn = listen_to_webhooks(dispatch, "ak_xxx", ListenOptions::default());
//!
//!     let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
//!     axum::serve(listener, app).await.unwrap();
//! }
//! ```

pub mod dispatch;
pub mod frames;
pub mod options;

mod client;

pub use frames::{RequestFrame, ResponseFrame};
pub use options::{Connection, DispatchFn, ListenOptions};

use std::sync::Arc;
use tokio::sync::Notify;

/// Connect to simplehook and start receiving webhooks.
///
/// Spawns a background task that maintains a WebSocket connection to the simplehook
/// server. Inbound webhook requests are dispatched using the provided `dispatch` function,
/// and responses are sent back through the tunnel.
///
/// Returns a [`Connection`] handle. Call [`Connection::close`] to shut down the tunnel.
///
/// In production (`RUST_ENV=production` or `ENV=production`), this returns a no-op
/// connection unless `opts.force_enable` is true. It also respects
/// `SIMPLEHOOK_ENABLED=false` to explicitly disable.
pub fn listen_to_webhooks(
    dispatch: DispatchFn,
    api_key: &str,
    opts: ListenOptions,
) -> Connection {
    if !opts.force_enable && is_production() {
        return Connection::noop();
    }
    if is_disabled() {
        return Connection::noop();
    }

    let shutdown = Arc::new(Notify::new());
    let conn = Connection::new(shutdown.clone());
    let api_key = api_key.to_string();

    tokio::spawn(client::run_client(dispatch, api_key, opts, shutdown));

    conn
}

/// Returns true if the environment indicates production.
/// Checks `RUST_ENV` and `ENV` environment variables.
pub(crate) fn is_production() -> bool {
    matches!(
        std::env::var("RUST_ENV").as_deref(),
        Ok("production")
    ) || matches!(
        std::env::var("ENV").as_deref(),
        Ok("production")
    )
}

/// Returns true if `SIMPLEHOOK_ENABLED` is set to `"false"`.
pub(crate) fn is_disabled() -> bool {
    std::env::var("SIMPLEHOOK_ENABLED").as_deref() == Ok("false")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_production_rust_env() {
        // Save and restore
        let old_rust = std::env::var("RUST_ENV").ok();
        let old_env = std::env::var("ENV").ok();

        std::env::set_var("RUST_ENV", "production");
        std::env::remove_var("ENV");
        assert!(is_production());

        // Restore
        match old_rust {
            Some(v) => std::env::set_var("RUST_ENV", v),
            None => std::env::remove_var("RUST_ENV"),
        }
        match old_env {
            Some(v) => std::env::set_var("ENV", v),
            None => std::env::remove_var("ENV"),
        }
    }

    #[test]
    fn test_is_production_env() {
        let old_rust = std::env::var("RUST_ENV").ok();
        let old_env = std::env::var("ENV").ok();

        std::env::remove_var("RUST_ENV");
        std::env::set_var("ENV", "production");
        assert!(is_production());

        match old_rust {
            Some(v) => std::env::set_var("RUST_ENV", v),
            None => std::env::remove_var("RUST_ENV"),
        }
        match old_env {
            Some(v) => std::env::set_var("ENV", v),
            None => std::env::remove_var("ENV"),
        }
    }

    #[test]
    fn test_is_production_not_set() {
        let old_rust = std::env::var("RUST_ENV").ok();
        let old_env = std::env::var("ENV").ok();

        std::env::remove_var("RUST_ENV");
        std::env::remove_var("ENV");
        assert!(!is_production());

        match old_rust {
            Some(v) => std::env::set_var("RUST_ENV", v),
            None => std::env::remove_var("RUST_ENV"),
        }
        match old_env {
            Some(v) => std::env::set_var("ENV", v),
            None => std::env::remove_var("ENV"),
        }
    }

    #[test]
    fn test_is_production_development() {
        let old_rust = std::env::var("RUST_ENV").ok();
        let old_env = std::env::var("ENV").ok();

        std::env::set_var("RUST_ENV", "development");
        std::env::remove_var("ENV");
        assert!(!is_production());

        match old_rust {
            Some(v) => std::env::set_var("RUST_ENV", v),
            None => std::env::remove_var("RUST_ENV"),
        }
        match old_env {
            Some(v) => std::env::set_var("ENV", v),
            None => std::env::remove_var("ENV"),
        }
    }

    #[test]
    fn test_is_disabled_true() {
        let old = std::env::var("SIMPLEHOOK_ENABLED").ok();

        std::env::set_var("SIMPLEHOOK_ENABLED", "false");
        assert!(is_disabled());

        match old {
            Some(v) => std::env::set_var("SIMPLEHOOK_ENABLED", v),
            None => std::env::remove_var("SIMPLEHOOK_ENABLED"),
        }
    }

    #[test]
    fn test_is_disabled_not_set() {
        let old = std::env::var("SIMPLEHOOK_ENABLED").ok();

        std::env::remove_var("SIMPLEHOOK_ENABLED");
        assert!(!is_disabled());

        match old {
            Some(v) => std::env::set_var("SIMPLEHOOK_ENABLED", v),
            None => std::env::remove_var("SIMPLEHOOK_ENABLED"),
        }
    }

    #[test]
    fn test_is_disabled_true_string() {
        let old = std::env::var("SIMPLEHOOK_ENABLED").ok();

        std::env::set_var("SIMPLEHOOK_ENABLED", "true");
        assert!(!is_disabled());

        match old {
            Some(v) => std::env::set_var("SIMPLEHOOK_ENABLED", v),
            None => std::env::remove_var("SIMPLEHOOK_ENABLED"),
        }
    }
}
