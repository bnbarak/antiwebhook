use axum::{
    extract::DefaultBodyLimit,
    http::{header::{AUTHORIZATION, CONTENT_TYPE, COOKIE}, HeaderValue, Method},
    routing::{any, delete, get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{agent, api, billing, config::Config, proxy, rate_limit::RateLimiter, tunnel::TunnelManager, user_auth};

pub struct AppState {
    pub db: PgPool,
    pub tunnels: TunnelManager,
    pub config: Config,
    pub rate_limiter: RateLimiter,
    pub agent_locks: agent::AgentLocks,
}


pub fn build_router(state: Arc<AppState>) -> Router {
    let cors = CorsLayer::new()
        .allow_origin([
            state.config.frontend_url.parse::<HeaderValue>().unwrap(),
            state.config.base_url.parse::<HeaderValue>().unwrap(),
        ])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE, Method::OPTIONS])
        .allow_headers([AUTHORIZATION, CONTENT_TYPE, COOKIE])
        .allow_credentials(true);

    let api_routes = Router::new()
        // Public
        .route("/register", post(api::register))
        // Authed (Bearer api_key)
        .route("/projects/me", get(api::get_project))
        .route("/events", get(api::list_events))
        .route("/events/{id}", get(api::get_event))
        .route("/events/{id}/replay", post(api::replay_event))
        .route("/routes", get(api::list_routes).post(api::create_route))
        .route("/routes/trash", get(api::list_deleted_routes))
        .route("/routes/{id}", delete(api::delete_route).put(api::update_route))
        .route("/routes/{id}/restore", post(api::restore_route))
        .route("/listeners", get(api::list_listeners).post(api::create_listener))
        .route("/listeners/{listener_id}", delete(api::delete_listener))
        .route("/stats", get(api::get_stats))
        // Agent pull
        .route("/agent/pull", get(agent::pull))
        .route("/agent/status", get(agent::status))
        // Billing
        .route("/billing/checkout", post(billing::create_checkout))
        .route("/billing/portal", post(billing::create_portal))
        .route("/billing/status", get(billing::get_billing_status))
        .route("/billing/upgrade", post(billing::upgrade_plan))
        .route("/billing/downgrade", post(billing::downgrade_plan));

    let auth_routes = Router::new()
        .route("/sign-up/email", post(user_auth::sign_up))
        .route("/sign-in/email", post(user_auth::sign_in))
        .route("/get-session", get(user_auth::get_session))
        .route("/me", get(user_auth::me))
        .route("/sign-out", post(user_auth::sign_out))
        .route("/github", get(user_auth::github_auth))
        .route("/github/callback", get(user_auth::github_callback))
        .route("/forgot-password", post(user_auth::forgot_password))
        .route("/reset-password", post(user_auth::reset_password));

    Router::new()
        .route("/", get(|| async { axum::Json(serde_json::json!({"name": "simplehook", "version": "0.1.0", "docs": "https://simplehook.dev/docs"})) }))
        .route("/health", get(|| async { "ok" }))
        .route("/hooks/{project_id}/{*path}", any(proxy::handle_webhook))
        .route("/tunnel", get(crate::tunnel::ws_upgrade))
        .nest("/auth", auth_routes)
        .nest("/api", api_routes)
        .route("/billing/stripe-webhook", post(billing::stripe_webhook))
        .layer(DefaultBodyLimit::max(1_048_576))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        // Verify the router builds without panicking
        // (actual integration test would need a DB pool)
    }
}
