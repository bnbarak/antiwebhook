use crate::frames::{RequestFrame, ResponseFrame};
use crate::options::DispatchFn;
use base64::Engine;
use std::collections::HashMap;
use std::sync::Arc;

/// Headers that should be stripped when forwarding requests.
const HOP_BY_HOP_HEADERS: &[&str] = &["host", "connection", "transfer-encoding", "content-length"];

/// Sanitize headers: remove hop-by-hop headers and set content-length if there is a body.
pub fn sanitize_headers(headers: &HashMap<String, String>, body_len: usize) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for (k, v) in headers {
        let lower = k.to_lowercase();
        if !HOP_BY_HOP_HEADERS.contains(&lower.as_str()) {
            out.insert(lower, v.clone());
        }
    }
    if body_len > 0 {
        out.insert("content-length".into(), body_len.to_string());
    }
    out
}

/// Create a dispatch function from an axum `Router`.
///
/// This converts each inbound `RequestFrame` into an `http::Request`, dispatches it
/// through the axum router using `tower::Service`, and captures the response as a
/// `ResponseFrame`.
///
/// # Example
///
/// ```ignore
/// let app = axum::Router::new()
///     .route("/webhook", axum::routing::post(handler));
///
/// let dispatch = simplehook::dispatch::axum_dispatch(app);
/// let conn = simplehook::listen_to_webhooks(dispatch, "ak_xxx", Default::default());
/// ```
pub fn axum_dispatch(router: axum::Router) -> DispatchFn {
    use tower::ServiceExt;

    let router = Arc::new(tokio::sync::Mutex::new(router.into_service()));

    Arc::new(move |frame: RequestFrame| {
        let router = router.clone();
        Box::pin(async move {
            // Decode base64 body
            let body_bytes = match &frame.body {
                Some(b64) => {
                    match base64::engine::general_purpose::STANDARD.decode(b64) {
                        Ok(bytes) => bytes,
                        Err(_) => {
                            return ResponseFrame {
                                frame_type: "response".into(),
                                id: frame.id,
                                status: 502,
                                headers: HashMap::new(),
                                body: None,
                            };
                        }
                    }
                }
                None => Vec::new(),
            };

            // Ensure path starts with /
            let path = if frame.path.starts_with('/') {
                frame.path.clone()
            } else {
                format!("/{}", frame.path)
            };

            // Build http::Request
            let mut builder = http::Request::builder()
                .method(frame.method.as_str())
                .uri(&path);

            // Set sanitized headers
            for (k, v) in &frame.headers {
                let lower = k.to_lowercase();
                if !HOP_BY_HOP_HEADERS.contains(&lower.as_str()) {
                    builder = builder.header(&lower, v);
                }
            }

            if !body_bytes.is_empty() {
                builder = builder.header("content-length", body_bytes.len().to_string());
            }

            let request = match builder.body(axum::body::Body::from(body_bytes)) {
                Ok(req) => req,
                Err(_) => {
                    return ResponseFrame {
                        frame_type: "response".into(),
                        id: frame.id,
                        status: 502,
                        headers: HashMap::new(),
                        body: None,
                    };
                }
            };

            // Dispatch through the router
            let mut svc = router.lock().await;
            let response = match ServiceExt::<http::Request<axum::body::Body>>::ready(&mut *svc).await {
                Ok(ready_svc) => {
                    match ready_svc.call(request).await {
                        Ok(resp) => resp,
                        Err(_) => {
                            return ResponseFrame {
                                frame_type: "response".into(),
                                id: frame.id,
                                status: 502,
                                headers: HashMap::new(),
                                body: None,
                            };
                        }
                    }
                }
                Err(_) => {
                    return ResponseFrame {
                        frame_type: "response".into(),
                        id: frame.id,
                        status: 502,
                        headers: HashMap::new(),
                        body: None,
                    };
                }
            };

            // Read response
            let status = response.status().as_u16();

            let mut resp_headers = HashMap::new();
            for (k, v) in response.headers() {
                if let Ok(val) = v.to_str() {
                    resp_headers.insert(k.as_str().to_string(), val.to_string());
                }
            }

            // Read body
            let body_bytes = match http_body_util::BodyExt::collect(response.into_body()).await {
                Ok(collected) => {
                    use http_body_util::BodyExt as _;
                    collected.to_bytes().to_vec()
                }
                Err(_) => Vec::new(),
            };

            let resp_body = if body_bytes.is_empty() {
                None
            } else {
                Some(base64::engine::general_purpose::STANDARD.encode(&body_bytes))
            };

            // Sanitize response headers
            let sanitized = sanitize_headers(&resp_headers, body_bytes.len());

            ResponseFrame {
                frame_type: "response".into(),
                id: frame.id,
                status,
                headers: sanitized,
                body: resp_body,
            }
        })
    })
}
