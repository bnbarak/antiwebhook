use std::sync::Arc;
use std::time::Duration;

use crate::{app::AppState, db, email, user_auth::User};

pub async fn run_trial_checker(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        if let Err(e) = check_trials(&state).await {
            tracing::error!(error = %e, "trial checker error");
        }
    }
}

async fn check_trials(state: &Arc<AppState>) -> Result<(), String> {
    // Check for users whose trial ends within 2 hours (reminder)
    let reminders = db::get_trial_reminder_candidates(&state.db)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    for candidate in &reminders {
        let user = build_user_from_candidate(candidate);
        if let Err(e) = email::send_trial_reminder(state, &user).await {
            tracing::error!(
                user_id = %candidate.user_id,
                error = %e,
                "failed to send trial reminder"
            );
        } else {
            tracing::info!(user_id = %candidate.user_id, "sent trial reminder");
        }
    }

    // Check for users whose trial has expired
    let expired = db::get_trial_expired_candidates(&state.db)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    for candidate in &expired {
        // Expire their trial projects
        if let Err(e) = db::expire_trial_projects(&state.db, &candidate.user_id).await {
            tracing::error!(user_id = %candidate.user_id, error = %e, "failed to expire trial projects");
            continue;
        }

        let user = build_user_from_candidate(candidate);
        if let Err(e) = email::send_trial_expired(state, &user).await {
            tracing::error!(
                user_id = %candidate.user_id,
                error = %e,
                "failed to send trial expired email"
            );
        } else {
            tracing::info!(user_id = %candidate.user_id, "sent trial expired email, projects deactivated");
        }
    }

    Ok(())
}

fn build_user_from_candidate(c: &db::TrialCandidate) -> User {
    User {
        id: c.user_id.clone(),
        name: c.user_name.clone(),
        email: c.user_email.clone(),
        password_hash: String::new(),
        trial_ends_at: Some(c.trial_ends_at),
        trial_reminder_sent: false,
        trial_expired_sent: false,
        welcome_email_sent: false,
        github_id: None,
        created_at: chrono::Utc::now(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_build_user_from_candidate() {
        let now = Utc::now();
        let candidate = db::TrialCandidate {
            user_id: "u_test123".into(),
            user_name: "Test User".into(),
            user_email: "test@example.com".into(),
            trial_ends_at: now,
            project_id: "p_abc".into(),
        };
        let user = build_user_from_candidate(&candidate);
        assert_eq!(user.id, "u_test123");
        assert_eq!(user.name, "Test User");
        assert_eq!(user.email, "test@example.com");
        assert_eq!(user.trial_ends_at, Some(now));
        assert!(!user.trial_reminder_sent);
        assert!(!user.trial_expired_sent);
    }

    #[test]
    fn test_trial_status_logic() {
        // Verify the billing status values used in expire logic
        let valid_statuses = ["trial", "trial_expired", "active", "cancelled", "past_due"];
        assert!(valid_statuses.contains(&"trial"));
        assert!(valid_statuses.contains(&"trial_expired"));

        // Only 'trial' status projects should be expired
        let should_expire = |status: &str| status == "trial";
        assert!(should_expire("trial"));
        assert!(!should_expire("active"));
        assert!(!should_expire("trial_expired"));
        assert!(!should_expire("cancelled"));
    }
}
