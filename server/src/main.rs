mod agent;
mod api;
mod app;
mod auth;
mod billing;
mod config;
mod db;
mod email;
mod error;
mod proxy;
mod queue;
mod rate_limit;
mod trial_worker;
mod tunnel;
mod user_auth;

use std::sync::Arc;
use std::time::Duration;

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

    let connect_options: sqlx::postgres::PgConnectOptions = config
        .database_url
        .parse()
        .expect("failed to parse DATABASE_URL");
    let connect_options = connect_options.statement_cache_capacity(0);

    let db = sqlx::postgres::PgPoolOptions::new()
        .connect_with(connect_options)
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
        rate_limiter: rate_limit::RateLimiter::new(),
        agent_locks: agent::AgentLocks::new(),
    });

    // Spawn background workers
    tokio::spawn(queue::run_worker(state.clone()));
    tokio::spawn(trial_worker::run_trial_checker(state.clone()));

    // Spawn rate limiter cleanup task
    let cleanup_state = state.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            cleanup_state.rate_limiter.cleanup().await;
        }
    });

    let router = app::build_router(state);
    let listener = tokio::net::TcpListener::bind(("0.0.0.0", port))
        .await
        .unwrap();

    tracing::info!(port = port, "simplehook server running");
    axum::serve(listener, router).await.unwrap();
}
