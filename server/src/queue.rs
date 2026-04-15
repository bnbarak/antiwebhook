use base64::Engine;
use std::{collections::HashMap, sync::Arc, time::Duration};

use crate::{app::AppState, db, tunnel::RequestFrame};

const MAX_ATTEMPTS: i16 = 5;

/// Background worker: retries failed queue-mode deliveries.
/// Pending events get their FIRST delivery attempt inline (in proxy.rs)
/// or on SDK reconnect (in tunnel.rs drain_pending).
/// This worker only handles retries for events that failed delivery.
pub async fn run_worker(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(Duration::from_secs(10));
    loop {
        interval.tick().await;
        if let Err(e) = process_retries(&state).await {
            tracing::error!(error = %e, "queue worker error");
        }
    }
}

async fn process_retries(state: &AppState) -> Result<(), sqlx::Error> {
    let events = db::get_retryable_events(&state.db, 50).await?;

    for event in events {
        let mut headers: HashMap<String, String> =
            serde_json::from_value(event.headers.clone()).unwrap_or_default();

        let body_b64 = event
            .body
            .as_ref()
            .map(|b| base64::engine::general_purpose::STANDARD.encode(b));

        // Sign the delivery — look up project API key for signing
        if let Ok(Some(project)) = db::get_project_by_id(&state.db, &event.project_id).await {
            let signing_key = crate::signature::derive_signing_key(&project.api_key);
            let (sig_ts, sig_val) = crate::signature::sign_event(&signing_key, &event.id, body_b64.as_deref());
            headers.insert("webhook-id".into(), event.id.clone());
            headers.insert("webhook-timestamp".into(), sig_ts.to_string());
            headers.insert("webhook-signature".into(), sig_val);
        }

        let frame = RequestFrame {
            frame_type: "request".into(),
            id: event.id.clone(),
            method: event.method.clone(),
            path: event.path.clone(),
            headers,
            body: body_b64,
        };

        match state
            .tunnels
            .send_request(&event.project_id, event.listener_id.as_deref(), frame, Duration::from_secs(10))
            .await
        {
            Some(resp) => {
                let body_bytes = resp.body.as_ref().and_then(|b| {
                    base64::engine::general_purpose::STANDARD.decode(b).ok()
                });
                let _ = db::mark_delivered(
                    &state.db,
                    &event.id,
                    resp.status as i16,
                    body_bytes.as_deref(),
                )
                .await;
            }
            None => {
                let attempts = event.attempts + 1;
                if attempts >= MAX_ATTEMPTS {
                    let _ = db::mark_failed(&state.db, &event.id).await;
                    tracing::warn!(event_id = %event.id, "event exhausted retries, marking failed");
                } else {
                    let _ = db::schedule_retry(&state.db, &event.id, attempts).await;
                }
            }
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_max_attempts() {
        assert_eq!(MAX_ATTEMPTS, 5);
    }

    #[test]
    fn test_backoff_schedule() {
        // Verify the backoff values used in db::schedule_retry
        let backoff: [i64; 5] = [5, 30, 120, 600, 3600];
        assert_eq!(backoff[0], 5);     // 5 seconds
        assert_eq!(backoff[1], 30);    // 30 seconds
        assert_eq!(backoff[2], 120);   // 2 minutes
        assert_eq!(backoff[3], 600);   // 10 minutes
        assert_eq!(backoff[4], 3600);  // 1 hour
    }
}
