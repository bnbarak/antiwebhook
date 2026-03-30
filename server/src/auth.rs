use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use std::sync::Arc;

use crate::{app::AppState, db, error::AppError};

/// Extractor that authenticates via session cookie OR Bearer API key.
/// Dashboard webapp uses cookies, SDKs use API keys.
pub struct AuthProject(pub db::Project);

impl FromRequestParts<Arc<AppState>> for AuthProject {
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let state = state.clone();

        let bearer_key = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .and_then(|h| h.strip_prefix("Bearer "))
            .map(String::from);

        let session_token = parts
            .headers
            .get("cookie")
            .and_then(|v| v.to_str().ok())
            .and_then(extract_session_token)
            .map(String::from);

        async move {
            // Try Bearer API key first
            if let Some(key) = bearer_key {
                if let Some(project) = db::get_project_by_key(&state.db, &key).await? {
                    return Ok(AuthProject(project));
                }
            }

            // Try session cookie
            if let Some(token) = session_token {
                let session: Option<crate::user_auth::Session> = sqlx::query_as(
                    "SELECT * FROM sessions WHERE token = $1 AND expires_at > now()",
                )
                .bind(&token)
                .fetch_optional(&state.db)
                .await?;

                if let Some(session) = session {
                    let project: Option<db::Project> = sqlx::query_as(
                        "SELECT * FROM projects WHERE user_id = $1 LIMIT 1",
                    )
                    .bind(&session.user_id)
                    .fetch_optional(&state.db)
                    .await?;

                    if let Some(project) = project {
                        return Ok(AuthProject(project));
                    }
                }
            }

            Err(AppError::Unauthorized)
        }
    }
}

fn extract_session_token(cookie_header: &str) -> Option<&str> {
    for part in cookie_header.split(';') {
        let part = part.trim();
        if let Some(val) = part.strip_prefix("sh_session=") {
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_session_token() {
        assert_eq!(
            extract_session_token("sh_session=sht_abc; other=val"),
            Some("sht_abc"),
        );
    }

    #[test]
    fn test_extract_session_token_missing() {
        assert_eq!(extract_session_token("other=val"), None);
    }

    #[test]
    fn test_extract_session_token_empty() {
        assert_eq!(extract_session_token("sh_session="), None);
    }
}
