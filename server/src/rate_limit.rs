use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

/// Simple in-memory sliding window rate limiter.
#[derive(Clone)]
pub struct RateLimiter {
    buckets: Arc<Mutex<HashMap<String, Vec<Instant>>>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Check if a request is allowed. Returns true if under limit.
    /// `key`: identifier (IP, project_id, etc.)
    /// `max`: max requests in window
    /// `window`: time window
    pub async fn check(&self, key: &str, max: usize, window: Duration) -> bool {
        let mut map = self.buckets.lock().await;
        let now = Instant::now();
        let entries = map.entry(key.to_string()).or_default();
        entries.retain(|t| now.duration_since(*t) < window);
        if entries.len() >= max {
            false
        } else {
            entries.push(now);
            true
        }
    }

    /// Periodic cleanup of old entries (call from a background task).
    pub async fn cleanup(&self) {
        let mut map = self.buckets.lock().await;
        let now = Instant::now();
        let cutoff = Duration::from_secs(600);
        map.retain(|_, entries| {
            entries.retain(|t| now.duration_since(*t) < cutoff);
            !entries.is_empty()
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_rate_limiter_allows_under_limit() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        assert!(rl.check("key1", 3, window).await);
        assert!(rl.check("key1", 3, window).await);
        assert!(rl.check("key1", 3, window).await);
    }

    #[tokio::test]
    async fn test_rate_limiter_blocks_over_limit() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        assert!(rl.check("key1", 2, window).await);
        assert!(rl.check("key1", 2, window).await);
        assert!(!rl.check("key1", 2, window).await);
    }

    #[tokio::test]
    async fn test_rate_limiter_separate_keys() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        assert!(rl.check("key1", 1, window).await);
        assert!(!rl.check("key1", 1, window).await);
        // Different key should still be allowed
        assert!(rl.check("key2", 1, window).await);
    }

    #[tokio::test]
    async fn test_rate_limiter_cleanup() {
        let rl = RateLimiter::new();
        let window = Duration::from_secs(60);
        assert!(rl.check("key1", 1, window).await);
        // Cleanup should not remove recent entries
        rl.cleanup().await;
        assert!(!rl.check("key1", 1, window).await);
    }
}
