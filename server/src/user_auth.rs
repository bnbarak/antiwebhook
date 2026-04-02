use axum::{
    extract::{Query, State},
    http::{header::SET_COOKIE, HeaderMap, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{Duration, Utc};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::{app::AppState, db, error::AppError};

// --- Types ---

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct User {
    pub id: String,
    pub name: String,
    pub email: String,
    #[serde(skip_serializing)]
    pub password_hash: String,
    pub trial_ends_at: Option<chrono::DateTime<Utc>>,
    pub trial_reminder_sent: bool,
    pub trial_expired_sent: bool,
    pub welcome_email_sent: bool,
    pub github_id: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct Session {
    pub id: String,
    pub user_id: String,
    pub token: String,
    pub expires_at: chrono::DateTime<Utc>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct SignUpRequest {
    pub name: String,
    pub email: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct SignInRequest {
    pub email: String,
    pub password: String,
}

#[derive(Serialize)]
pub struct AuthResponse {
    pub user: UserInfo,
    pub token: String,
}

#[derive(Serialize)]
pub struct UserInfo {
    pub id: String,
    pub name: String,
    pub email: String,
}

#[derive(Serialize)]
pub struct SessionResponse {
    pub user: Option<UserInfo>,
}

#[derive(Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
}

// --- Handlers ---

pub async fn sign_up(
    State(state): State<Arc<AppState>>,
    req_headers: HeaderMap,
    Json(body): Json<SignUpRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Rate limit: 10 sign-up attempts per minute per IP
    let ip = extract_client_ip(&req_headers);
    if !state.rate_limiter.check(&format!("auth:{}", ip), 30, std::time::Duration::from_secs(60)).await {
        return Err(AppError::TooManyRequests);
    }

    let email = body.email.trim().to_lowercase();

    if body.password.len() < 10 {
        return Err(AppError::BadRequest("password must be at least 10 characters"));
    }

    if email.is_empty() || !email.contains('@') {
        return Err(AppError::BadRequest("invalid email"));
    }

    // Check duplicate
    let existing: Option<User> =
        sqlx::query_as("SELECT * FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?;

    if existing.is_some() {
        return Err(AppError::BadRequest("email already registered"));
    }

    // Hash password
    let password_hash = hash_password(&body.password)?;

    // Create user with trial
    let user_id = db::generate_id("u_", 16);
    let trial_ends_at = Utc::now() + Duration::hours(24);
    let user: User = sqlx::query_as(
        "INSERT INTO users (id, name, email, password_hash, trial_ends_at) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    )
    .bind(&user_id)
    .bind(&body.name)
    .bind(&email)
    .bind(&password_hash)
    .bind(trial_ends_at)
    .fetch_one(&state.db)
    .await?;

    // Create project for user (trial, active)
    let project_id = db::generate_id("p_", 12);
    let api_key = db::generate_id("ak_", 24);
    sqlx::query(
        "INSERT INTO projects (id, name, api_key, user_id, active, billing_status) VALUES ($1, $2, $3, $4, true, 'trial')",
    )
    .bind(&project_id)
    .bind(format!("{}'s project", body.name))
    .bind(&api_key)
    .bind(&user_id)
    .execute(&state.db)
    .await?;

    // Send welcome email in background
    let welcome_state = state.clone();
    let welcome_user = user.clone();
    let webhook_url = format!("{}/hooks/{}", state.config.base_url, project_id);
    tokio::spawn(async move {
        if let Err(e) = crate::email::send_welcome(&welcome_state, &welcome_user, &webhook_url).await {
            tracing::error!(error = %e, "failed to send welcome email");
        }
    });

    tracing::info!(email = %email, user_id = %user_id, "user signed up");

    // Create session
    let (token, cookie) = create_session(&state, &user_id).await?;

    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, cookie.parse().unwrap());

    Ok((
        StatusCode::OK,
        headers,
        Json(AuthResponse {
            user: UserInfo {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            token,
        }),
    ))
}

pub async fn sign_in(
    State(state): State<Arc<AppState>>,
    req_headers: HeaderMap,
    Json(body): Json<SignInRequest>,
) -> Result<impl IntoResponse, AppError> {
    // Rate limit: 10 sign-in attempts per minute per IP
    let ip = extract_client_ip(&req_headers);
    if !state.rate_limiter.check(&format!("auth:{}", ip), 30, std::time::Duration::from_secs(60)).await {
        return Err(AppError::TooManyRequests);
    }

    let email = body.email.trim().to_lowercase();

    let user: Option<User> = sqlx::query_as("SELECT * FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;

    let Some(user) = user else {
        // Hash dummy to prevent timing-based enumeration
        let _ = hash_password("dummy_password_to_prevent_timing_attack");
        return Err(AppError::Unauthorized);
    };

    if !verify_password(&body.password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

    tracing::info!(email = %email, user_id = %user.id, "user signed in");

    let (token, cookie) = create_session(&state, &user.id).await?;

    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, cookie.parse().unwrap());

    Ok((
        StatusCode::OK,
        headers,
        Json(AuthResponse {
            user: UserInfo {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            token,
        }),
    ))
}

pub async fn get_session(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<SessionResponse>, AppError> {
    let token = extract_token(&headers);

    let Some(token) = token else {
        return Ok(Json(SessionResponse { user: None }));
    };

    let session: Option<Session> =
        sqlx::query_as("SELECT * FROM sessions WHERE token = $1 AND expires_at > now()")
            .bind(&token)
            .fetch_optional(&state.db)
            .await?;

    let Some(session) = session else {
        return Ok(Json(SessionResponse { user: None }));
    };

    let user: Option<User> = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(&session.user_id)
        .fetch_optional(&state.db)
        .await?;

    Ok(Json(SessionResponse {
        user: user.map(|u| UserInfo {
            id: u.id,
            name: u.name,
            email: u.email,
        }),
    }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, AppError> {
    let token = extract_token(&headers).ok_or(AppError::Unauthorized)?;

    let session: Session = sqlx::query_as(
        "SELECT * FROM sessions WHERE token = $1 AND expires_at > now()",
    )
    .bind(&token)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let user: User = sqlx::query_as("SELECT * FROM users WHERE id = $1")
        .bind(&session.user_id)
        .fetch_one(&state.db)
        .await?;

    let project: Option<db::Project> = sqlx::query_as(
        "SELECT * FROM projects WHERE user_id = $1 LIMIT 1",
    )
    .bind(&user.id)
    .fetch_optional(&state.db)
    .await?;

    let (project_json, listeners_json) = match project {
        Some(ref p) => {
            let connected = state.tunnels.is_any_connected(&p.id).await;
            let listeners = db::list_listeners(&state.db, &p.id).await?;
            let mut listener_infos = Vec::new();
            for l in listeners {
                let l_connected = state.tunnels.is_connected(&p.id, Some(&l.listener_id)).await;
                listener_infos.push(serde_json::json!({
                    "id": l.id,
                    "listener_id": l.listener_id,
                    "label": l.label,
                    "connected": l_connected,
                    "created_at": l.created_at,
                }));
            }
            (
                Some(serde_json::json!({
                    "id": p.id,
                    "name": p.name,
                    "api_key": p.api_key,
                    "webhook_base_url": format!("{}/hooks/{}", state.config.base_url, p.id),
                    "active": p.active,
                    "billing_status": p.billing_status,
                    "connected": connected,
                })),
                listener_infos,
            )
        }
        None => (None, Vec::new()),
    };

    Ok(Json(serde_json::json!({
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "trial_ends_at": user.trial_ends_at,
        },
        "project": project_json,
        "listeners": listeners_json,
    })))
}

pub async fn sign_out(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    if let Some(token) = extract_token(&headers) {
        // Look up user_id before deleting for audit logging
        let session: Option<Session> = sqlx::query_as("SELECT * FROM sessions WHERE token = $1")
            .bind(&token)
            .fetch_optional(&state.db)
            .await?;
        if let Some(ref s) = session {
            tracing::info!(user_id = %s.user_id, "user signed out");
        }
        sqlx::query("DELETE FROM sessions WHERE token = $1")
            .bind(&token)
            .execute(&state.db)
            .await?;
    }

    let cookie = "sh_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
    let mut resp_headers = HeaderMap::new();
    resp_headers.insert(SET_COOKIE, cookie.parse().unwrap());

    Ok((StatusCode::OK, resp_headers, Json(serde_json::json!({"ok": true}))))
}

#[derive(Deserialize)]
pub struct GitHubCallbackQuery {
    pub code: String,
    pub state: Option<String>,
}

pub async fn github_auth(
    State(state): State<Arc<AppState>>,
) -> Result<impl IntoResponse, AppError> {
    let oauth_state = crate::db::generate_id("ghst_", 24);
    let url = format!(
        "https://github.com/login/oauth/authorize?client_id={}&redirect_uri={}/auth/github/callback&scope=user:email&state={}",
        state.config.github_client_id,
        state.config.frontend_url,
        oauth_state,
    );
    let cookie = format!(
        "sh_oauth_state={}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600",
        oauth_state,
    );
    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, cookie.parse().unwrap());
    Ok((headers, axum::response::Redirect::temporary(&url)))
}

pub async fn github_callback(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(query): Query<GitHubCallbackQuery>,
) -> Result<impl IntoResponse, AppError> {
    // Validate OAuth state parameter
    let expected_state = headers
        .get("cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|cookie_str| {
            cookie_str.split(';').find_map(|part| {
                let part = part.trim();
                part.strip_prefix("sh_oauth_state=").map(String::from)
            })
        });
    let query_state = query.state.as_deref().unwrap_or("");
    match expected_state {
        Some(ref expected) if !expected.is_empty() && expected == query_state => {}
        _ => return Err(AppError::BadRequest("oauth state mismatch")),
    }
    let client = reqwest::Client::new();

    // Exchange code for token
    let token_resp = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .json(&serde_json::json!({
            "client_id": state.config.github_client_id,
            "client_secret": state.config.github_client_secret,
            "code": query.code,
        }))
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let access_token = token_resp["access_token"]
        .as_str()
        .ok_or(AppError::BadRequest("github auth failed"))?;

    // Fetch profile
    let profile = client
        .get("https://api.github.com/user")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "simplehook")
        .send()
        .await?
        .json::<serde_json::Value>()
        .await?;

    let github_id = profile["id"]
        .as_i64()
        .ok_or(AppError::Internal("missing github id"))?
        .to_string();
    let name = profile["name"]
        .as_str()
        .or(profile["login"].as_str())
        .unwrap_or("GitHub User")
        .to_string();

    // Fetch email
    let emails = client
        .get("https://api.github.com/user/emails")
        .header("Authorization", format!("Bearer {}", access_token))
        .header("User-Agent", "simplehook")
        .send()
        .await?
        .json::<Vec<serde_json::Value>>()
        .await?;

    let email = emails
        .iter()
        .find(|e| e["primary"].as_bool() == Some(true))
        .and_then(|e| e["email"].as_str())
        .or(profile["email"].as_str())
        .ok_or(AppError::BadRequest("no email from github"))?
        .to_lowercase();

    // Find or create user
    let user: User = if let Some(existing) =
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE github_id = $1")
            .bind(&github_id)
            .fetch_optional(&state.db)
            .await?
    {
        existing
    } else if let Some(existing) =
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE email = $1")
            .bind(&email)
            .fetch_optional(&state.db)
            .await?
    {
        // Link GitHub to existing account
        sqlx::query("UPDATE users SET github_id = $1 WHERE id = $2")
            .bind(&github_id)
            .bind(&existing.id)
            .execute(&state.db)
            .await?;
        existing
    } else {
        // Create new user + project
        let user_id = db::generate_id("u_", 16);
        let trial_ends_at = Utc::now() + Duration::hours(24);
        let user: User = sqlx::query_as(
            "INSERT INTO users (id, name, email, password_hash, github_id, trial_ends_at) VALUES ($1, $2, $3, '', $4, $5) RETURNING *",
        )
        .bind(&user_id)
        .bind(&name)
        .bind(&email)
        .bind(&github_id)
        .bind(trial_ends_at)
        .fetch_one(&state.db)
        .await?;

        let project_id = db::generate_id("p_", 12);
        let api_key = db::generate_id("ak_", 24);
        sqlx::query(
            "INSERT INTO projects (id, name, api_key, user_id, active, billing_status) VALUES ($1, $2, $3, $4, true, 'trial')",
        )
        .bind(&project_id)
        .bind(format!("{}'s project", name))
        .bind(&api_key)
        .bind(&user_id)
        .execute(&state.db)
        .await?;

        user
    };

    tracing::info!(email = %email, github_id = %github_id, user_id = %user.id, "github oauth callback");

    // Create session and redirect via HTML page (Vercel rewrites don't forward Set-Cookie on 302)
    let (_token, cookie) = create_session(&state, &user.id).await?;
    let redirect_url = format!("{}/dashboard", state.config.frontend_url);

    let html = format!(
        r#"<!DOCTYPE html><html><head><script>window.location.replace("{}")</script></head><body>Redirecting...</body></html>"#,
        redirect_url
    );

    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, cookie.parse().unwrap());
    headers.insert("Content-Type", "text/html".parse().unwrap());

    Ok((StatusCode::OK, headers, html))
}

pub async fn forgot_password(
    State(state): State<Arc<AppState>>,
    req_headers: HeaderMap,
    Json(body): Json<ForgotPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Rate limit: 10 attempts per minute per IP
    let ip = extract_client_ip(&req_headers);
    if !state.rate_limiter.check(&format!("auth:{}", ip), 30, std::time::Duration::from_secs(60)).await {
        return Err(AppError::TooManyRequests);
    }

    let email = body.email.trim().to_lowercase();

    // Always return success to prevent email enumeration
    let user: Option<User> = sqlx::query_as("SELECT * FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?;

    if let Some(user) = user {
        // Generate reset token
        let reset_id = db::generate_id("rst_", 16);
        let token = db::generate_id("rpw_", 32);
        let expires_at = Utc::now() + Duration::hours(1);

        sqlx::query(
            "INSERT INTO password_resets (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)"
        )
        .bind(&reset_id)
        .bind(&user.id)
        .bind(&token)
        .bind(expires_at)
        .execute(&state.db)
        .await?;

        // Send email in background
        let reset_url = format!("{}/reset-password?token={}", state.config.frontend_url, token);
        let state2 = state.clone();
        let user2 = user.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::email::send_password_reset(&state2, &user2, &reset_url).await {
                tracing::error!(error = %e, "failed to send password reset email");
            }
        });

        tracing::info!(email = %email, "password reset requested");
    }

    Ok(Json(serde_json::json!({"ok": true, "message": "If that email exists, a reset link has been sent."})))
}

pub async fn reset_password(
    State(state): State<Arc<AppState>>,
    req_headers: HeaderMap,
    Json(body): Json<ResetPasswordRequest>,
) -> Result<Json<serde_json::Value>, AppError> {
    // Rate limit
    let ip = extract_client_ip(&req_headers);
    if !state.rate_limiter.check(&format!("auth:{}", ip), 30, std::time::Duration::from_secs(60)).await {
        return Err(AppError::TooManyRequests);
    }

    if body.password.len() < 10 {
        return Err(AppError::BadRequest("password must be at least 10 characters"));
    }

    // Find valid, unused reset token
    let reset: Option<(String, String)> = sqlx::query_as(
        "SELECT id, user_id FROM password_resets WHERE token = $1 AND expires_at > now() AND used = false"
    )
    .bind(&body.token)
    .fetch_optional(&state.db)
    .await?;

    let Some((reset_id, user_id)) = reset else {
        return Err(AppError::BadRequest("invalid or expired reset token"));
    };

    // Update password
    let password_hash = hash_password(&body.password)?;
    sqlx::query("UPDATE users SET password_hash = $1 WHERE id = $2")
        .bind(&password_hash)
        .bind(&user_id)
        .execute(&state.db)
        .await?;

    // Mark token as used
    sqlx::query("UPDATE password_resets SET used = true WHERE id = $1")
        .bind(&reset_id)
        .execute(&state.db)
        .await?;

    // Invalidate all sessions for this user (force re-login)
    sqlx::query("DELETE FROM sessions WHERE user_id = $1")
        .bind(&user_id)
        .execute(&state.db)
        .await?;

    tracing::info!(user_id = %user_id, "password reset completed");

    Ok(Json(serde_json::json!({"ok": true})))
}

// --- Helpers ---

async fn create_session(state: &AppState, user_id: &str) -> Result<(String, String), AppError> {
    let session_id = db::generate_id("ses_", 16);
    let token = db::generate_id("sht_", 32);
    let expires_at = Utc::now() + Duration::days(30);

    sqlx::query(
        "INSERT INTO sessions (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)",
    )
    .bind(&session_id)
    .bind(user_id)
    .bind(&token)
    .bind(expires_at)
    .execute(&state.db)
    .await?;

    let cookie = format!(
        "sh_session={}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age={}",
        token,
        30 * 24 * 3600
    );

    Ok((token, cookie))
}

fn extract_client_ip(headers: &HeaderMap) -> String {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .unwrap_or("unknown")
        .trim()
        .to_string()
}

fn extract_token(headers: &HeaderMap) -> Option<String> {
    let cookie_header = headers.get("cookie")?.to_str().ok()?;
    for part in cookie_header.split(';') {
        let part = part.trim();
        if let Some(val) = part.strip_prefix("sh_session=") {
            if !val.is_empty() {
                return Some(val.to_string());
            }
        }
    }
    None
}

fn hash_password(password: &str) -> Result<String, AppError> {
    use argon2::{
        password_hash::{rand_core::OsRng, SaltString},
        Argon2, PasswordHasher,
    };
    let salt = SaltString::generate(&mut OsRng);
    let hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|_| AppError::Internal("password hash error"))?
        .to_string();
    Ok(hash)
}

fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    use argon2::{password_hash::PasswordHash, Argon2, PasswordVerifier};
    let parsed = PasswordHash::new(hash).map_err(|_| AppError::Internal("invalid hash"))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hash_and_verify() {
        let hash = hash_password("testpassword123").unwrap();
        assert!(verify_password("testpassword123", &hash).unwrap());
        assert!(!verify_password("wrongpassword", &hash).unwrap());
    }

    #[test]
    fn test_hash_different_salts() {
        let h1 = hash_password("same").unwrap();
        let h2 = hash_password("same").unwrap();
        assert_ne!(h1, h2); // different salts
    }

    #[test]
    fn test_extract_token_from_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert("cookie", "sh_session=sht_abc123; other=val".parse().unwrap());
        assert_eq!(extract_token(&headers), Some("sht_abc123".to_string()));
    }

    #[test]
    fn test_extract_token_missing() {
        let headers = HeaderMap::new();
        assert_eq!(extract_token(&headers), None);
    }

    #[test]
    fn test_extract_token_no_session_cookie() {
        let mut headers = HeaderMap::new();
        headers.insert("cookie", "other=val".parse().unwrap());
        assert_eq!(extract_token(&headers), None);
    }
}
