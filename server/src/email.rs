use std::sync::Arc;

use crate::{app::AppState, db, user_auth::User};

pub fn render_base(title: &str, body_html: &str) -> String {
    format!(
        r#"<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f7f6f2;font-family:'DM Sans',system-ui,-apple-system,sans-serif;color:#1a1916;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f6f2;padding:40px 0;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="padding:0 0 24px 0;">
  <span style="font-size:20px;font-weight:700;color:#1a1916;letter-spacing:-0.5px;">simplehook</span>
</td></tr>
<tr><td style="background-color:#ffffff;border-radius:12px;padding:32px;border:1px solid #e8e6e1;">
  {body_html}
</td></tr>
<tr><td style="padding:24px 0 0 0;text-align:center;font-size:13px;color:#8c8a84;">
  simplehook &middot; webhook forwarding made simple
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>"#
    )
}

pub async fn send_email(
    state: &AppState,
    to: &str,
    subject: &str,
    html: &str,
) -> Result<String, String> {
    if state.config.resend_api_key.is_empty() {
        tracing::warn!(to = %to, subject = %subject, "RESEND_API_KEY not set, skipping email");
        return Ok("skipped".into());
    }

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.resend.com/emails")
        .bearer_auth(&state.config.resend_api_key)
        .json(&serde_json::json!({
            "from": "simplehook <noreply@simplehook.dev>",
            "to": [to],
            "subject": subject,
            "html": html,
        }))
        .send()
        .await
        .map_err(|e| format!("resend request failed: {e}"))?;

    let status = resp.status();
    let body: serde_json::Value = resp.json().await.map_err(|e| format!("resend response parse error: {e}"))?;

    if !status.is_success() {
        return Err(format!("resend error ({}): {}", status, body));
    }

    let resend_id = body["id"].as_str().unwrap_or("unknown").to_string();
    Ok(resend_id)
}

pub async fn send_welcome(state: &Arc<AppState>, user: &User, webhook_url: &str) -> Result<(), String> {
    let body_html = format!(
        r#"<h2 style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Welcome to simplehook</h2>
<p style="margin:0 0 16px 0;line-height:1.6;color:#44423d;">
  Hi {name}, your webhook forwarding endpoint is ready:
</p>
<div style="background-color:#f7f6f2;border-radius:8px;padding:12px 16px;margin:0 0 16px 0;font-family:monospace;font-size:14px;word-break:break-all;">
  {webhook_url}
</div>
<p style="margin:0 0 16px 0;line-height:1.6;color:#44423d;">
  Your <strong>24-hour free trial</strong> is now active. Install the SDK, point your webhook provider here, and start receiving events locally.
</p>
<a href="{docs_url}" style="display:inline-block;background-color:#1a1916;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
  Read the docs
</a>"#,
        name = html_escape(&user.name),
        webhook_url = html_escape(webhook_url),
        docs_url = "https://simplehook.dev/docs",
    );

    let html = render_base("Welcome to simplehook", &body_html);
    let resend_id = send_email(state, &user.email, "Welcome to simplehook", &html).await?;
    let _ = db::insert_email_log(&state.db, &user.id, "welcome", &resend_id).await;
    let _ = db::mark_welcome_email_sent(&state.db, &user.id).await;
    Ok(())
}

pub async fn send_trial_reminder(state: &Arc<AppState>, user: &User) -> Result<(), String> {
    let body_html = format!(
        r#"<h2 style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Your trial ends in 2 hours</h2>
<p style="margin:0 0 16px 0;line-height:1.6;color:#44423d;">
  Hi {name}, your simplehook free trial is about to expire. Subscribe now to keep receiving webhooks without interruption.
</p>
<a href="{url}" style="display:inline-block;background-color:#1a1916;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
  Subscribe now
</a>"#,
        name = html_escape(&user.name),
        url = format!("{}/settings?billing=subscribe", state.config.frontend_url),
    );

    let html = render_base("Your trial ends soon", &body_html);
    let resend_id = send_email(state, &user.email, "Your simplehook trial ends in 2 hours", &html).await?;
    let _ = db::insert_email_log(&state.db, &user.id, "trial_reminder", &resend_id).await;
    let _ = db::mark_trial_reminder_sent(&state.db, &user.id).await;
    Ok(())
}

pub async fn send_trial_expired(state: &Arc<AppState>, user: &User) -> Result<(), String> {
    let body_html = format!(
        r#"<h2 style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Your trial has ended</h2>
<p style="margin:0 0 16px 0;line-height:1.6;color:#44423d;">
  Hi {name}, your simplehook free trial has expired and webhook forwarding has been paused. Subscribe to reactivate your project instantly.
</p>
<a href="{url}" style="display:inline-block;background-color:#1a1916;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
  Subscribe now
</a>"#,
        name = html_escape(&user.name),
        url = format!("{}/settings?billing=subscribe", state.config.frontend_url),
    );

    let html = render_base("Your trial has ended", &body_html);
    let resend_id = send_email(state, &user.email, "Your simplehook trial has ended", &html).await?;
    let _ = db::insert_email_log(&state.db, &user.id, "trial_expired", &resend_id).await;
    let _ = db::mark_trial_expired_sent(&state.db, &user.id).await;
    Ok(())
}

pub async fn send_payment_confirmed(state: &Arc<AppState>, user: &User) -> Result<(), String> {
    let body_html = format!(
        r#"<h2 style="margin:0 0 16px 0;font-size:22px;font-weight:600;">Payment confirmed</h2>
<p style="margin:0 0 16px 0;line-height:1.6;color:#44423d;">
  Hi {name}, your simplehook subscription is now active. Webhook forwarding is enabled and you're all set.
</p>
<a href="{url}" style="display:inline-block;background-color:#1a1916;color:#ffffff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">
  Go to dashboard
</a>"#,
        name = html_escape(&user.name),
        url = format!("{}/dashboard", state.config.frontend_url),
    );

    let html = render_base("Payment confirmed", &body_html);
    let resend_id = send_email(state, &user.email, "simplehook payment confirmed", &html).await?;
    let _ = db::insert_email_log(&state.db, &user.id, "payment_confirmed", &resend_id).await;
    Ok(())
}

fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_render_base_contains_structure() {
        let html = render_base("Test Title", "<p>Hello</p>");
        assert!(html.contains("Test Title"));
        assert!(html.contains("<p>Hello</p>"));
        assert!(html.contains("simplehook"));
        assert!(html.contains("#f7f6f2"));
        assert!(html.contains("#ffffff"));
        assert!(html.contains("#1a1916"));
        assert!(html.contains("DM Sans"));
        assert!(html.contains("560"));
    }

    #[test]
    fn test_render_base_valid_html() {
        let html = render_base("Subject", "<p>Body</p>");
        assert!(html.starts_with("<!DOCTYPE html>"));
        assert!(html.contains("</html>"));
        assert!(html.contains("</body>"));
    }

    #[test]
    fn test_render_base_footer() {
        let html = render_base("T", "<p>B</p>");
        assert!(html.contains("webhook forwarding made simple"));
    }

    #[test]
    fn test_html_escape() {
        assert_eq!(html_escape("a&b"), "a&amp;b");
        assert_eq!(html_escape("<b>"), "&lt;b&gt;");
        assert_eq!(html_escape("a\"b"), "a&quot;b");
        assert_eq!(
            html_escape("<script>"),
            "&lt;script&gt;"
        );
    }

    #[test]
    fn test_html_escape_passthrough() {
        assert_eq!(html_escape("hello world"), "hello world");
        assert_eq!(html_escape(""), "");
    }
}
