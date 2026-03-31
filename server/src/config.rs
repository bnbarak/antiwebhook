use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub base_url: String,
    pub frontend_url: String,
    pub stripe_secret_key: String,
    pub stripe_webhook_secret: String,
    pub stripe_price_id: String,       // $5/mo — 3 agents
    pub stripe_price_id_6: String,     // $8/mo — 6 agents
    pub resend_api_key: String,
    pub github_client_id: String,
    pub github_client_secret: String,
    pub port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        Self {
            database_url: env::var("DATABASE_URL").expect("DATABASE_URL required"),
            base_url: env::var("BASE_URL").unwrap_or_else(|_| "http://localhost:8400".into()),
            frontend_url: env::var("FRONTEND_URL").unwrap_or_else(|_| "http://localhost:4000".into()),
            stripe_secret_key: env::var("STRIPE_SECRET_KEY").unwrap_or_default(),
            stripe_webhook_secret: env::var("STRIPE_WEBHOOK_SECRET").unwrap_or_default(),
            stripe_price_id: env::var("STRIPE_PRICE_ID").unwrap_or_default(),
            stripe_price_id_6: env::var("STRIPE_PRICE_ID_6").unwrap_or_default(),
            resend_api_key: env::var("RESEND_API_KEY").unwrap_or_default(),
            github_client_id: env::var("GITHUB_CLIENT_ID").unwrap_or_default(),
            github_client_secret: env::var("GITHUB_CLIENT_SECRET").unwrap_or_default(),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8400".into())
                .parse()
                .unwrap_or(8400),
        }
    }
}
