use axum::{
    extract::State,
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

// --- Handlers ---

pub async fn sign_up(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SignUpRequest>,
) -> Result<impl IntoResponse, AppError> {
    let email = body.email.trim().to_lowercase();

    if body.password.len() < 8 {
        return Err(AppError::BadRequest("password must be at least 8 characters"));
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

    // Create user
    let user_id = db::generate_id("u_", 16);
    let user: User = sqlx::query_as(
        "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING *",
    )
    .bind(&user_id)
    .bind(&body.name)
    .bind(&email)
    .bind(&password_hash)
    .fetch_one(&state.db)
    .await?;

    // Create project for user
    let project_id = db::generate_id("p_", 12);
    let api_key = db::generate_id("ak_", 24);
    sqlx::query(
        "INSERT INTO projects (id, name, api_key, user_id, active) VALUES ($1, $2, $3, $4, true)",
    )
    .bind(&project_id)
    .bind(format!("{}'s project", body.name))
    .bind(&api_key)
    .bind(&user_id)
    .execute(&state.db)
    .await?;

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
    Json(body): Json<SignInRequest>,
) -> Result<impl IntoResponse, AppError> {
    let email = body.email.trim().to_lowercase();

    let user: User = sqlx::query_as("SELECT * FROM users WHERE email = $1")
        .bind(&email)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::Unauthorized)?;

    if !verify_password(&body.password, &user.password_hash)? {
        return Err(AppError::Unauthorized);
    }

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

pub async fn sign_out(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<impl IntoResponse, AppError> {
    if let Some(token) = extract_token(&headers) {
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
        "sh_session={}; Path=/; HttpOnly; SameSite=Lax; Max-Age={}",
        token,
        30 * 24 * 3600
    );

    Ok((token, cookie))
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
