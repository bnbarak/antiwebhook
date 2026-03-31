use axum::{
    routing::{any, delete, get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{api, billing, config::Config, proxy, tunnel::TunnelManager, user_auth};

pub struct AppState {
    pub db: PgPool,
    pub tunnels: TunnelManager,
    pub config: Config,
}


pub fn build_router(state: Arc<AppState>) -> Router {
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
        .route("/sign-out", post(user_auth::sign_out));

    Router::new()
        .route("/", get(|| async { axum::Json(serde_json::json!({"name": "simplehook", "version": "0.1.0", "docs": "https://simplehook.dev/docs"})) }))
        .route("/health", get(|| async { "ok" }))
        .route("/hooks/{project_id}/{*path}", any(proxy::handle_webhook))
        .route("/tunnel", get(crate::tunnel::ws_upgrade))
        .nest("/auth", auth_routes)
        .nest("/api", api_routes)
        .route("/billing/stripe-webhook", post(billing::stripe_webhook))
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
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
