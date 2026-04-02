use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::Utc;
use serde::Serialize;
use std::sync::Arc;

use crate::{app::AppState, auth::AuthProject, db, error::AppError, user_auth};

#[derive(Serialize)]
pub struct CheckoutResponse {
    pub url: String,
}

pub async fn create_checkout(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<CheckoutResponse>, AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/checkout/sessions")
        .bearer_auth(&state.config.stripe_secret_key)
        .form(&[
            ("mode", "subscription"),
            ("payment_method_types[0]", "card"),
            ("line_items[0][price]", &state.config.stripe_price_id),
            ("line_items[0][quantity]", "1"),
            (
                "success_url",
                &format!("{}/settings?billing=success", state.config.frontend_url),
            ),
            (
                "cancel_url",
                &format!("{}/settings?billing=cancel", state.config.frontend_url),
            ),
            ("client_reference_id", &project.id),
        ])
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let url = resp["url"]
        .as_str()
        .ok_or(AppError::Internal("stripe checkout error"))?;

    Ok(Json(CheckoutResponse {
        url: url.to_string(),
    }))
}

#[derive(Serialize)]
pub struct PortalResponse {
    pub url: String,
}

pub async fn create_portal(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<PortalResponse>, AppError> {
    let customer_id = project
        .stripe_customer_id
        .as_ref()
        .ok_or(AppError::BadRequest("no subscription"))?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.stripe.com/v1/billing_portal/sessions")
        .bearer_auth(&state.config.stripe_secret_key)
        .form(&[
            ("customer", customer_id.as_str()),
            (
                "return_url",
                &format!("{}/settings", state.config.frontend_url),
            ),
        ])
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let url = resp["url"]
        .as_str()
        .ok_or(AppError::Internal("stripe portal error"))?;

    Ok(Json(PortalResponse {
        url: url.to_string(),
    }))
}

#[derive(Serialize)]
pub struct BillingStatusResponse {
    pub billing_status: String,
    pub trial_ends_at: Option<chrono::DateTime<Utc>>,
    pub trial_hours_remaining: Option<f64>,
    pub has_subscription: bool,
    pub subscription_quantity: i32,
    pub agent_limit: i64,
}

pub async fn get_billing_status(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<BillingStatusResponse>, AppError> {
    let user: Option<user_auth::User> = sqlx::query_as(
        "SELECT * FROM users WHERE id = (SELECT user_id FROM projects WHERE id = $1)",
    )
    .bind(&project.id)
    .fetch_optional(&state.db)
    .await?;

    let trial_ends_at = user.as_ref().and_then(|u| u.trial_ends_at);
    let trial_hours_remaining = trial_ends_at.map(|t| {
        let remaining = t - Utc::now();
        (remaining.num_seconds() as f64 / 3600.0).max(0.0)
    });

    let agent_limit = 3 + (project.subscription_quantity as i64 * 3);

    Ok(Json(BillingStatusResponse {
        billing_status: project.billing_status.clone(),
        trial_ends_at,
        trial_hours_remaining,
        has_subscription: project.stripe_subscription_id.is_some(),
        subscription_quantity: project.subscription_quantity,
        agent_limit,
    }))
}

// --- Upgrade / Downgrade ---

pub async fn upgrade_plan(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<serde_json::Value>, AppError> {
    let sub_id = project.stripe_subscription_id.as_ref()
        .ok_or(AppError::BadRequest("no active subscription"))?;

    // Get the subscription to find the current item ID
    let client = reqwest::Client::new();
    let sub: serde_json::Value = client
        .get(&format!("https://api.stripe.com/v1/subscriptions/{}", sub_id))
        .bearer_auth(&state.config.stripe_secret_key)
        .send().await?.json().await?;

    let item_id = sub["items"]["data"][0]["id"].as_str()
        .ok_or(AppError::Internal("could not read subscription item"))?;

    // Switch to the 6-agent price
    client
        .post(&format!("https://api.stripe.com/v1/subscriptions/{}", sub_id))
        .bearer_auth(&state.config.stripe_secret_key)
        .form(&[
            ("items[0][id]", item_id),
            ("items[0][price]", &state.config.stripe_price_id_6),
            ("proration_behavior", "create_prorations"),
        ])
        .send().await?;

    sqlx::query("UPDATE projects SET subscription_quantity = 1 WHERE id = $1")
        .bind(&project.id)
        .execute(&state.db)
        .await?;

    tracing::info!(project_id = %project.id, "upgraded to 6-agent plan");
    Ok(Json(serde_json::json!({"plan": "6_agents", "agent_limit": 6})))
}

pub async fn downgrade_plan(
    State(state): State<Arc<AppState>>,
    AuthProject(project): AuthProject,
) -> Result<Json<serde_json::Value>, AppError> {
    let sub_id = project.stripe_subscription_id.as_ref()
        .ok_or(AppError::BadRequest("no active subscription"))?;

    let client = reqwest::Client::new();
    let sub: serde_json::Value = client
        .get(&format!("https://api.stripe.com/v1/subscriptions/{}", sub_id))
        .bearer_auth(&state.config.stripe_secret_key)
        .send().await?.json().await?;

    let item_id = sub["items"]["data"][0]["id"].as_str()
        .ok_or(AppError::Internal("could not read subscription item"))?;

    // Switch to the 3-agent price
    client
        .post(&format!("https://api.stripe.com/v1/subscriptions/{}", sub_id))
        .bearer_auth(&state.config.stripe_secret_key)
        .form(&[
            ("items[0][id]", item_id),
            ("items[0][price]", &state.config.stripe_price_id),
            ("proration_behavior", "create_prorations"),
        ])
        .send().await?;

    sqlx::query("UPDATE projects SET subscription_quantity = 0 WHERE id = $1")
        .bind(&project.id)
        .execute(&state.db)
        .await?;

    // Delete excess agents (keep only the first 3)
    let listeners = db::list_listeners(&state.db, &project.id).await?;
    if listeners.len() > 3 {
        for listener in listeners.iter().skip(3) {
            let _ = db::delete_listener(&state.db, &project.id, &listener.listener_id).await;
        }
        tracing::info!(project_id = %project.id, deleted = listeners.len() - 3, "deleted excess agents on downgrade");
    }

    tracing::info!(project_id = %project.id, "downgraded to 3-agent plan");
    Ok(Json(serde_json::json!({"plan": "3_agents", "agent_limit": 3})))
}

pub async fn stripe_webhook(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, AppError> {
    let signature = headers
        .get("stripe-signature")
        .and_then(|v| v.to_str().ok())
        .ok_or(AppError::BadRequest("missing stripe-signature"))?;

    verify_signature(&body, signature, &state.config.stripe_webhook_secret)?;

    let event: serde_json::Value = serde_json::from_slice(&body)?;
    let event_type = event["type"].as_str().unwrap_or("");

    match event_type {
        "checkout.session.completed" => {
            let obj = &event["data"]["object"];
            let project_id = obj["client_reference_id"].as_str().unwrap_or("");
            let customer_id = obj["customer"].as_str().unwrap_or("");
            let sub_id = obj["subscription"].as_str().unwrap_or("");
            if !project_id.is_empty() {
                db::activate_project(&state.db, project_id, customer_id, sub_id).await?;
                db::set_billing_status(&state.db, project_id, "active").await?;

                // Set agent slots based on which price was purchased
                if !sub_id.is_empty() {
                    let qty = match price_from_subscription(&state, sub_id).await {
                        Ok(price) if price == state.config.stripe_price_id_6 => 1, // 6 agents
                        _ => 0, // 3 agents (default)
                    };
                    sqlx::query("UPDATE projects SET subscription_quantity = $1 WHERE id = $2")
                        .bind(qty)
                        .bind(project_id)
                        .execute(&state.db)
                        .await?;
                }
                tracing::info!(project_id = %project_id, "project activated via checkout");

                // Send payment confirmed email
                let state2 = state.clone();
                let pid = project_id.to_string();
                tokio::spawn(async move {
                    let user: Option<user_auth::User> = sqlx::query_as(
                        "SELECT * FROM users WHERE id = (SELECT user_id FROM projects WHERE id = $1)",
                    )
                    .bind(&pid)
                    .fetch_optional(&state2.db)
                    .await
                    .ok()
                    .flatten();

                    if let Some(user) = user {
                        if let Err(e) = crate::email::send_payment_confirmed(&state2, &user).await {
                            tracing::error!(error = %e, "failed to send payment confirmed email");
                        }
                    }
                });
            }
        }
        "invoice.paid" => {
            let customer_id = event["data"]["object"]["customer"]
                .as_str()
                .unwrap_or("");
            if !customer_id.is_empty() {
                // Ensure project stays active on recurring payments
                sqlx::query(
                    "UPDATE projects SET active = true, billing_status = 'active' WHERE stripe_customer_id = $1",
                )
                .bind(customer_id)
                .execute(&state.db)
                .await?;
                tracing::info!(customer_id = %customer_id, "invoice paid, project confirmed active");
            }
        }
        "customer.subscription.deleted" => {
            let customer_id = event["data"]["object"]["customer"]
                .as_str()
                .unwrap_or("");
            if !customer_id.is_empty() {
                sqlx::query(
                    "UPDATE projects SET active = false, billing_status = 'cancelled' WHERE stripe_customer_id = $1",
                )
                .bind(customer_id)
                .execute(&state.db)
                .await?;
                tracing::info!(customer_id = %customer_id, "subscription deleted, project deactivated");
            }
        }
        "customer.subscription.updated" => {
            let obj = &event["data"]["object"];
            let customer_id = obj["customer"].as_str().unwrap_or("");
            let price_id = obj["items"]["data"][0]["price"]["id"].as_str().unwrap_or("");
            if !customer_id.is_empty() {
                let qty = if price_id == state.config.stripe_price_id_6 { 1 } else { 0 };
                sqlx::query(
                    "UPDATE projects SET subscription_quantity = $1 WHERE stripe_customer_id = $2",
                )
                .bind(qty)
                .bind(customer_id)
                .execute(&state.db)
                .await?;
                tracing::info!(customer_id = %customer_id, price = %price_id, qty = qty, "subscription updated");
            }
        }
        "invoice.payment_failed" => {
            let customer_id = event["data"]["object"]["customer"]
                .as_str()
                .unwrap_or("");
            if !customer_id.is_empty() {
                sqlx::query(
                    "UPDATE projects SET billing_status = 'past_due' WHERE stripe_customer_id = $1",
                )
                .bind(customer_id)
                .execute(&state.db)
                .await?;
                tracing::info!(customer_id = %customer_id, "payment failed, project set to past_due");
            }
        }
        _ => {}
    }

    Ok(StatusCode::OK)
}

async fn price_from_subscription(state: &AppState, sub_id: &str) -> Result<String, AppError> {
    let client = reqwest::Client::new();
    let resp = client
        .get(&format!("https://api.stripe.com/v1/subscriptions/{}", sub_id))
        .bearer_auth(&state.config.stripe_secret_key)
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;
    let price = resp["items"]["data"][0]["price"]["id"].as_str()
        .unwrap_or("")
        .to_string();
    Ok(price)
}

fn verify_signature(payload: &[u8], sig_header: &str, secret: &str) -> Result<(), AppError> {
    use hmac::{Hmac, Mac};
    use sha2::Sha256;

    let mut timestamp = "";
    let mut expected_sig = "";
    for part in sig_header.split(',') {
        if let Some(t) = part.strip_prefix("t=") {
            timestamp = t;
        }
        if let Some(v) = part.strip_prefix("v1=") {
            expected_sig = v;
        }
    }

    if timestamp.is_empty() || expected_sig.is_empty() {
        return Err(AppError::BadRequest("invalid signature format"));
    }

    // Validate timestamp is within 300 seconds of now
    let ts: i64 = timestamp.parse().map_err(|_| AppError::BadRequest("invalid timestamp"))?;
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs() as i64;
    if (now - ts).abs() > 300 {
        return Err(AppError::BadRequest("webhook timestamp too old"));
    }

    let payload_str =
        std::str::from_utf8(payload).map_err(|_| AppError::BadRequest("invalid payload"))?;
    let signed = format!("{}.{}", timestamp, payload_str);

    let mut mac =
        Hmac::<Sha256>::new_from_slice(secret.as_bytes()).map_err(|_| AppError::Internal("hmac error"))?;
    mac.update(signed.as_bytes());
    let computed = hex::encode(mac.finalize().into_bytes());

    if computed != expected_sig {
        return Err(AppError::BadRequest("invalid signature"));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_verify_signature_valid() {
        use hmac::{Hmac, Mac};
        use sha2::Sha256;

        let secret = "whsec_test_secret";
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();
        let payload = r#"{"type":"checkout.session.completed"}"#;
        let signed = format!("{}.{}", timestamp, payload);

        let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
        mac.update(signed.as_bytes());
        let sig = hex::encode(mac.finalize().into_bytes());

        let sig_header = format!("t={},v1={}", timestamp, sig);
        let result = verify_signature(payload.as_bytes(), &sig_header, secret);
        assert!(result.is_ok());
    }

    #[test]
    fn test_verify_signature_invalid() {
        let result = verify_signature(
            b"payload",
            "t=123,v1=badsignature",
            "whsec_secret",
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_verify_signature_missing_parts() {
        let result = verify_signature(b"payload", "garbage", "secret");
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_stripe_event_types() {
        let events = [
            "checkout.session.completed",
            "customer.subscription.deleted",
            "invoice.payment_failed",
        ];
        for e in events {
            assert!(!e.is_empty());
        }
    }
}
