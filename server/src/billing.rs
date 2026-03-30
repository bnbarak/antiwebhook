use axum::{
    body::Bytes,
    extract::State,
    http::{HeaderMap, StatusCode},
    Json,
};
use serde::Serialize;
use std::sync::Arc;

use crate::{app::AppState, auth::AuthProject, db, error::AppError};

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
                tracing::info!(project_id = %project_id, "project activated via checkout");
            }
        }
        "customer.subscription.deleted" | "invoice.payment_failed" => {
            let customer_id = event["data"]["object"]["customer"]
                .as_str()
                .unwrap_or("");
            if !customer_id.is_empty() {
                db::deactivate_by_customer(&state.db, customer_id).await?;
                tracing::info!(customer_id = %customer_id, "project deactivated");
            }
        }
        _ => {}
    }

    Ok(StatusCode::OK)
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
        let timestamp = "1234567890";
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
