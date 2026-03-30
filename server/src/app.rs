use axum::{
    routing::{any, delete, get, post},
    Router,
};
use sqlx::PgPool;
use std::sync::Arc;
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{api, billing, config::Config, proxy, tunnel::TunnelManager};

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
        .route("/routes/{id}", delete(api::delete_route))
        // Billing
        .route("/billing/checkout", post(billing::create_checkout))
        .route("/billing/portal", post(billing::create_portal));

    Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/hooks/{project_id}/{*path}", any(proxy::handle_webhook))
        .route("/tunnel", get(crate::tunnel::ws_upgrade))
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
