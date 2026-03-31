package simplehook

// RequestFrame represents an inbound webhook request from the simplehook server.
type RequestFrame struct {
	Type    string            `json:"type"`
	ID      string            `json:"id"`
	Method  string            `json:"method"`
	Path    string            `json:"path"`
	Headers map[string]string `json:"headers"`
	Body    *string           `json:"body,omitempty"` // base64-encoded
}

// ResponseFrame represents the response sent back to the simplehook server.
type ResponseFrame struct {
	Type    string            `json:"type"`
	ID      string            `json:"id"`
	Status  int               `json:"status"`
	Headers map[string]string `json:"headers"`
	Body    *string           `json:"body,omitempty"` // base64-encoded
}

// PingFrame represents a keep-alive ping from the server.
type PingFrame struct {
	Type string `json:"type"`
}

// PongFrame is the response to a ping.
type PongFrame struct {
	Type string `json:"type"`
}

// inboundFrame is used for initial JSON unmarshalling to determine frame type.
type inboundFrame struct {
	Type string `json:"type"`
}
