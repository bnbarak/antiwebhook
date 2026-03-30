use axum::{
    extract::FromRequestParts,
    http::request::Parts,
};
use std::sync::Arc;

use crate::{app::AppState, db, error::AppError};

/// Extractor that validates the API key from the Authorization header.
/// Use in any handler: `AuthProject(project): AuthProject`
pub struct AuthProject(pub db::Project);

impl FromRequestParts<Arc<AppState>> for AuthProject {
    type Rejection = AppError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let state = state.clone();
        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .map(String::from);

        async move {
            let header = auth_header.ok_or(AppError::Unauthorized)?;
            let key = header.strip_prefix("Bearer ").ok_or(AppError::Unauthorized)?;
            let project = db::get_project_by_key(&state.db, key)
                .await?
                .ok_or(AppError::Unauthorized)?;
            Ok(AuthProject(project))
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_bearer_prefix_strip() {
        let header = "Bearer ak_test123";
        let key = header.strip_prefix("Bearer ");
        assert_eq!(key, Some("ak_test123"));
    }

    #[test]
    fn test_bearer_prefix_missing() {
        let header = "Basic ak_test123";
        let key = header.strip_prefix("Bearer ");
        assert!(key.is_none());
    }

    #[test]
    fn test_empty_header() {
        let header = "";
        let key = header.strip_prefix("Bearer ");
        assert!(key.is_none());
    }
}
