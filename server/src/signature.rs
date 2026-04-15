use base64::{Engine as _, engine::general_purpose::STANDARD as BASE64};
use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Derive a signing key from the project's API key.
/// The API key is never used directly — this produces a separate key
/// for signing that can't be reversed to recover the API key.
pub fn derive_signing_key(api_key: &str) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(b"simplehook-signing-v1")
        .expect("HMAC can take key of any size");
    mac.update(api_key.as_bytes());
    mac.finalize().into_bytes().to_vec()
}

/// Sign an event. Returns (unix_timestamp, signature_string).
/// Signature format: "v1,<base64(HMAC-SHA256(key, id.timestamp.body))>"
pub fn sign_event(signing_key: &[u8], event_id: &str, body: Option<&str>) -> (i64, String) {
    let timestamp = Utc::now().timestamp();
    sign_event_with_timestamp(signing_key, event_id, timestamp, body)
}

/// Sign with an explicit timestamp (useful for tests).
pub fn sign_event_with_timestamp(
    signing_key: &[u8],
    event_id: &str,
    timestamp: i64,
    body: Option<&str>,
) -> (i64, String) {
    let payload = format!("{}.{}.{}", event_id, timestamp, body.unwrap_or(""));
    let mut mac = HmacSha256::new_from_slice(signing_key)
        .expect("HMAC can take key of any size");
    mac.update(payload.as_bytes());
    let sig = BASE64.encode(mac.finalize().into_bytes());
    (timestamp, format!("v1,{}", sig))
}

/// Verify a signature. Returns true if valid.
pub fn verify_signature(
    signing_key: &[u8],
    event_id: &str,
    timestamp: i64,
    body: Option<&str>,
    signature: &str,
) -> bool {
    let (_, expected) = sign_event_with_timestamp(signing_key, event_id, timestamp, body);
    // Constant-time comparison
    if expected.len() != signature.len() {
        return false;
    }
    expected
        .as_bytes()
        .iter()
        .zip(signature.as_bytes())
        .fold(0u8, |acc, (a, b)| acc | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_derive_signing_key_deterministic() {
        let key1 = derive_signing_key("ak_test123");
        let key2 = derive_signing_key("ak_test123");
        assert_eq!(key1, key2);
    }

    #[test]
    fn test_different_keys_different_sigs() {
        let key1 = derive_signing_key("ak_key1");
        let key2 = derive_signing_key("ak_key2");
        assert_ne!(key1, key2);

        let (_, sig1) = sign_event_with_timestamp(&key1, "evt_1", 1000, Some("body"));
        let (_, sig2) = sign_event_with_timestamp(&key2, "evt_1", 1000, Some("body"));
        assert_ne!(sig1, sig2);
    }

    #[test]
    fn test_sign_event_format() {
        let key = derive_signing_key("ak_test");
        let (ts, sig) = sign_event_with_timestamp(&key, "evt_abc", 1713100800, Some("hello"));
        assert_eq!(ts, 1713100800);
        assert!(sig.starts_with("v1,"), "signature should start with v1, but got: {}", sig);
        // base64 after v1, should be non-empty
        assert!(sig.len() > 3);
    }

    #[test]
    fn test_sign_event_no_body() {
        let key = derive_signing_key("ak_test");
        let (_, sig) = sign_event_with_timestamp(&key, "evt_abc", 1000, None);
        assert!(sig.starts_with("v1,"));

        // Different from with body
        let (_, sig_with_body) = sign_event_with_timestamp(&key, "evt_abc", 1000, Some("data"));
        assert_ne!(sig, sig_with_body);
    }

    #[test]
    fn test_verify_valid() {
        let key = derive_signing_key("ak_test");
        let (ts, sig) = sign_event_with_timestamp(&key, "evt_1", 1000, Some("body"));
        assert!(verify_signature(&key, "evt_1", ts, Some("body"), &sig));
    }

    #[test]
    fn test_verify_tampered_body() {
        let key = derive_signing_key("ak_test");
        let (ts, sig) = sign_event_with_timestamp(&key, "evt_1", 1000, Some("body"));
        assert!(!verify_signature(&key, "evt_1", ts, Some("tampered"), &sig));
    }

    #[test]
    fn test_verify_wrong_key() {
        let key1 = derive_signing_key("ak_real");
        let key2 = derive_signing_key("ak_fake");
        let (ts, sig) = sign_event_with_timestamp(&key1, "evt_1", 1000, Some("body"));
        assert!(!verify_signature(&key2, "evt_1", ts, Some("body"), &sig));
    }

    #[test]
    fn test_verify_wrong_event_id() {
        let key = derive_signing_key("ak_test");
        let (ts, sig) = sign_event_with_timestamp(&key, "evt_1", 1000, Some("body"));
        assert!(!verify_signature(&key, "evt_2", ts, Some("body"), &sig));
    }

    #[test]
    fn test_verify_wrong_timestamp() {
        let key = derive_signing_key("ak_test");
        let (_, sig) = sign_event_with_timestamp(&key, "evt_1", 1000, Some("body"));
        assert!(!verify_signature(&key, "evt_1", 9999, Some("body"), &sig));
    }

    #[test]
    fn test_verify_garbage_signature() {
        let key = derive_signing_key("ak_test");
        assert!(!verify_signature(&key, "evt_1", 1000, Some("body"), "garbage"));
        assert!(!verify_signature(&key, "evt_1", 1000, Some("body"), "v1,notreal"));
        assert!(!verify_signature(&key, "evt_1", 1000, Some("body"), ""));
    }
}
