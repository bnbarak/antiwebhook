use axum::{http::StatusCode, response::IntoResponse, Json};

#[derive(Debug)]
pub enum AppError {
    NotFound(&'static str),
    Unauthorized,
    BadRequest(&'static str),
    Internal(&'static str),
    TooManyRequests,
    Db(sqlx::Error),
    Json(serde_json::Error),
    Reqwest(reqwest::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match &self {
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, *msg),
            AppError::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized"),
            AppError::TooManyRequests => (StatusCode::TOO_MANY_REQUESTS, "too many requests"),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, *msg),
            AppError::Internal(msg) => (StatusCode::INTERNAL_SERVER_ERROR, *msg),
            AppError::Db(e) => {
                tracing::error!(error = %e, "database error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error")
            }
            AppError::Json(e) => {
                tracing::error!(error = %e, "json error");
                (StatusCode::BAD_REQUEST, "invalid json")
            }
            AppError::Reqwest(e) => {
                tracing::error!(error = %e, "http client error");
                (StatusCode::INTERNAL_SERVER_ERROR, "internal error")
            }
        };
        (status, Json(serde_json::json!({"error": message}))).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        AppError::Db(e)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Json(e)
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        AppError::Reqwest(e)
    }
}
