mod api;
mod app;
mod auth;
mod billing;
mod config;
mod db;
mod error;
mod proxy;
mod queue;
mod tunnel;
mod user_auth;

use std::sync::Arc;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "simplehook_server=info,tower_http=info".parse().unwrap()),
        )
        .init();

    let config = config::Config::from_env();
    let port = config.port;

    let db = sqlx::PgPool::connect(&config.database_url)
        .await
        .expect("failed to connect to postgres");

    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("failed to run migrations");

    let state = Arc::new(app::AppState {
        db,
        tunnels: tunnel::TunnelManager::new(),
        config,
    });

    // Spawn background queue worker
    tokio::spawn(queue::run_worker(state.clone()));

    let router = app::build_router(state);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .unwrap();

    tracing::info!(port = port, "simplehook server running");
    axum::serve(listener, router).await.unwrap();
}
