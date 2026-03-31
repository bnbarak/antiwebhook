use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// An inbound request frame from the simplehook server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RequestFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
    pub id: String,
    pub method: String,
    pub path: String,
    pub headers: HashMap<String, String>,
    /// Base64-encoded request body.
    pub body: Option<String>,
}

/// A response frame sent back to the simplehook server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResponseFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
    pub id: String,
    pub status: u16,
    pub headers: HashMap<String, String>,
    /// Base64-encoded response body.
    pub body: Option<String>,
}

/// Ping frame for keep-alive.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PingFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
}

/// Pong frame — response to a ping.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PongFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
}

/// Used for initial JSON deserialization to determine frame type.
#[derive(Debug, Clone, Deserialize)]
pub(crate) struct InboundFrame {
    #[serde(rename = "type")]
    pub frame_type: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_request_frame_serialization() {
        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "evt_abc123".into(),
            method: "POST".into(),
            path: "/stripe/webhook".into(),
            headers: HashMap::from([("content-type".into(), "application/json".into())]),
            body: Some("eyJ0ZXN0IjogdHJ1ZX0=".into()),
        };

        let json = serde_json::to_string(&frame).unwrap();
        assert!(json.contains(r#""type":"request"#));
        assert!(json.contains(r#""id":"evt_abc123"#));
        assert!(json.contains(r#""method":"POST"#));

        // Roundtrip
        let deserialized: RequestFrame = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "evt_abc123");
        assert_eq!(deserialized.method, "POST");
        assert_eq!(deserialized.path, "/stripe/webhook");
        assert_eq!(deserialized.body, Some("eyJ0ZXN0IjogdHJ1ZX0=".into()));
    }

    #[test]
    fn test_response_frame_serialization() {
        let json = r#"{"type":"response","id":"evt_abc","status":200,"headers":{"content-type":"application/json"},"body":"eyJvayI6IHRydWV9"}"#;
        let frame: ResponseFrame = serde_json::from_str(json).unwrap();
        assert_eq!(frame.frame_type, "response");
        assert_eq!(frame.id, "evt_abc");
        assert_eq!(frame.status, 200);
        assert!(frame.body.is_some());
        assert_eq!(frame.body.unwrap(), "eyJvayI6IHRydWV9");
    }

    #[test]
    fn test_request_frame_no_body() {
        let frame = RequestFrame {
            frame_type: "request".into(),
            id: "req-1".into(),
            method: "GET".into(),
            path: "/health".into(),
            headers: HashMap::new(),
            body: None,
        };

        let json = serde_json::to_string(&frame).unwrap();
        let deserialized: RequestFrame = serde_json::from_str(&json).unwrap();
        assert!(deserialized.body.is_none());
    }

    #[test]
    fn test_response_frame_no_body() {
        let frame = ResponseFrame {
            frame_type: "response".into(),
            id: "req-1".into(),
            status: 204,
            headers: HashMap::new(),
            body: None,
        };

        let json = serde_json::to_string(&frame).unwrap();
        let deserialized: ResponseFrame = serde_json::from_str(&json).unwrap();
        assert!(deserialized.body.is_none());
        assert_eq!(deserialized.status, 204);
    }

    #[test]
    fn test_ping_pong_frames() {
        let ping = PingFrame {
            frame_type: "ping".into(),
        };
        let json = serde_json::to_string(&ping).unwrap();
        assert!(json.contains(r#""type":"ping"#));

        let pong = PongFrame {
            frame_type: "pong".into(),
        };
        let json = serde_json::to_string(&pong).unwrap();
        assert!(json.contains(r#""type":"pong"#));
    }

    #[test]
    fn test_inbound_frame_type_detection() {
        let ping_json = r#"{"type":"ping"}"#;
        let frame: InboundFrame = serde_json::from_str(ping_json).unwrap();
        assert_eq!(frame.frame_type, "ping");

        let req_json = r#"{"type":"request","id":"r1","method":"POST","path":"/x","headers":{}}"#;
        let frame: InboundFrame = serde_json::from_str(req_json).unwrap();
        assert_eq!(frame.frame_type, "request");
    }
}
