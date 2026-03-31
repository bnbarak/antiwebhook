package simplehook

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// --- Environment / production detection tests ---

func TestIsProduction_GoEnv(t *testing.T) {
	os.Setenv("GO_ENV", "production")
	defer os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")

	if !isProduction() {
		t.Error("expected isProduction() to return true when GO_ENV=production")
	}
}

func TestIsProduction_Env(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Setenv("ENV", "production")
	defer os.Unsetenv("ENV")

	if !isProduction() {
		t.Error("expected isProduction() to return true when ENV=production")
	}
}

func TestIsProduction_NotSet(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")

	if isProduction() {
		t.Error("expected isProduction() to return false when neither GO_ENV nor ENV is set")
	}
}

func TestIsProduction_Development(t *testing.T) {
	os.Setenv("GO_ENV", "development")
	defer os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")

	if isProduction() {
		t.Error("expected isProduction() to return false when GO_ENV=development")
	}
}

func TestIsExplicitlyDisabled(t *testing.T) {
	os.Setenv("SIMPLEHOOK_ENABLED", "false")
	defer os.Unsetenv("SIMPLEHOOK_ENABLED")

	if !isExplicitlyDisabled() {
		t.Error("expected isExplicitlyDisabled() to return true")
	}
}

func TestIsExplicitlyDisabled_NotSet(t *testing.T) {
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	if isExplicitlyDisabled() {
		t.Error("expected isExplicitlyDisabled() to return false when not set")
	}
}

func TestIsExplicitlyDisabled_True(t *testing.T) {
	os.Setenv("SIMPLEHOOK_ENABLED", "true")
	defer os.Unsetenv("SIMPLEHOOK_ENABLED")

	if isExplicitlyDisabled() {
		t.Error("expected isExplicitlyDisabled() to return false when SIMPLEHOOK_ENABLED=true")
	}
}

// --- Noop in production ---

func TestNoopInProduction(t *testing.T) {
	os.Setenv("GO_ENV", "production")
	defer os.Unsetenv("GO_ENV")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called in production")
	})

	conn := ListenToWebhooks(handler, "ak_test_key", nil)
	// Should return immediately and be closeable without blocking.
	conn.Close()
}

func TestNoopWhenDisabled(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Setenv("SIMPLEHOOK_ENABLED", "false")
	defer os.Unsetenv("SIMPLEHOOK_ENABLED")

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called when disabled")
	})

	conn := ListenToWebhooks(handler, "ak_test_key", nil)
	conn.Close()
}

// --- ForceEnable overrides production ---

func TestForceEnable(t *testing.T) {
	os.Setenv("GO_ENV", "production")
	defer os.Unsetenv("GO_ENV")

	// Create a mock WS server so the connection succeeds.
	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		// Just wait for the connection to close.
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	connected := make(chan struct{}, 1)
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})

	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
		OnConnect: func() {
			select {
			case connected <- struct{}{}:
			default:
			}
		},
	})
	defer conn.Close()

	select {
	case <-connected:
		// Success: connection was established despite production env.
	case <-time.After(3 * time.Second):
		t.Error("expected connection to be established with ForceEnable in production")
	}
}

// --- Dispatch tests ---

func TestDispatch(t *testing.T) {
	handler := http.NewServeMux()
	handler.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"received":true}`))
	})

	body := base64.StdEncoding.EncodeToString([]byte(`{"event":"test"}`))
	frame := RequestFrame{
		Type:    "request",
		ID:      "req-1",
		Method:  "POST",
		Path:    "/webhook",
		Headers: map[string]string{"content-type": "application/json"},
		Body:    &body,
	}

	resp := dispatch(handler, frame)

	if resp.Type != "response" {
		t.Errorf("expected type=response, got %s", resp.Type)
	}
	if resp.ID != "req-1" {
		t.Errorf("expected id=req-1, got %s", resp.ID)
	}
	if resp.Status != 200 {
		t.Errorf("expected status=200, got %d", resp.Status)
	}
	if resp.Body == nil {
		t.Fatal("expected non-nil body")
	}
	decoded, err := base64.StdEncoding.DecodeString(*resp.Body)
	if err != nil {
		t.Fatalf("failed to decode body: %v", err)
	}
	if string(decoded) != `{"received":true}` {
		t.Errorf("expected body={\"received\":true}, got %s", string(decoded))
	}
}

func TestDispatch_GET(t *testing.T) {
	handler := http.NewServeMux()
	handler.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" {
			w.WriteHeader(405)
			return
		}
		w.WriteHeader(200)
		w.Write([]byte("ok"))
	})

	frame := RequestFrame{
		Type:    "request",
		ID:      "req-2",
		Method:  "GET",
		Path:    "/health",
		Headers: map[string]string{},
	}

	resp := dispatch(handler, frame)

	if resp.Status != 200 {
		t.Errorf("expected status=200, got %d", resp.Status)
	}
	if resp.Body == nil {
		t.Fatal("expected non-nil body")
	}
	decoded, _ := base64.StdEncoding.DecodeString(*resp.Body)
	if string(decoded) != "ok" {
		t.Errorf("expected body=ok, got %s", string(decoded))
	}
}

func TestDispatch_404(t *testing.T) {
	handler := http.NewServeMux()
	handler.HandleFunc("/exists", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})

	frame := RequestFrame{
		Type:    "request",
		ID:      "req-3",
		Method:  "GET",
		Path:    "/does-not-exist",
		Headers: map[string]string{},
	}

	resp := dispatch(handler, frame)

	if resp.Status != 404 {
		t.Errorf("expected status=404, got %d", resp.Status)
	}
}

func TestDispatch_PostWithBody(t *testing.T) {
	handler := http.NewServeMux()
	handler.HandleFunc("/stripe/events", func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		w.Header().Set("Content-Type", "application/json")
		resp := map[string]interface{}{"received": true, "type": body["type"]}
		json.NewEncoder(w).Encode(resp)
	})

	payload := `{"type":"invoice.paid","id":"evt_123"}`
	body := base64.StdEncoding.EncodeToString([]byte(payload))
	frame := RequestFrame{
		Type:    "request",
		ID:      "req-4",
		Method:  "POST",
		Path:    "/stripe/events",
		Headers: map[string]string{"content-type": "application/json"},
		Body:    &body,
	}

	resp := dispatch(handler, frame)

	if resp.Status != 200 {
		t.Errorf("expected status=200, got %d", resp.Status)
	}
	if resp.Body == nil {
		t.Fatal("expected non-nil body")
	}
	decoded, _ := base64.StdEncoding.DecodeString(*resp.Body)
	var result map[string]interface{}
	json.Unmarshal(decoded, &result)
	if result["received"] != true {
		t.Error("expected received=true")
	}
	if result["type"] != "invoice.paid" {
		t.Errorf("expected type=invoice.paid, got %v", result["type"])
	}
}

func TestDispatch_InvalidBase64Body(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		t.Error("handler should not be called with invalid base64 body")
	})

	invalidBody := "not-valid-base64!!!"
	frame := RequestFrame{
		Type:    "request",
		ID:      "req-bad",
		Method:  "POST",
		Path:    "/webhook",
		Headers: map[string]string{},
		Body:    &invalidBody,
	}

	resp := dispatch(handler, frame)

	if resp.Status != 502 {
		t.Errorf("expected status=502 for invalid base64, got %d", resp.Status)
	}
	if resp.ID != "req-bad" {
		t.Errorf("expected id=req-bad, got %s", resp.ID)
	}
}

// --- WebSocket integration tests ---

// mockWSServer wraps an httptest.Server with a websocket upgrader.
type mockWSServer struct {
	server   *httptest.Server
	upgrader websocket.Upgrader
}

func newMockWSServer(t *testing.T, handler func(ws *websocket.Conn)) *mockWSServer {
	t.Helper()
	m := &mockWSServer{
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
	m.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ws, err := m.upgrader.Upgrade(w, r, nil)
		if err != nil {
			t.Logf("upgrade error: %v", err)
			return
		}
		defer ws.Close()
		handler(ws)
	}))
	return m
}

func (m *mockWSServer) Close() {
	m.server.Close()
}

func (m *mockWSServer) wsURL() string {
	return "ws" + strings.TrimPrefix(m.server.URL, "http")
}

func TestPingPong(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	pongReceived := make(chan struct{}, 1)

	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		// Send a ping frame.
		ping, _ := json.Marshal(PingFrame{Type: "ping"})
		if err := ws.WriteMessage(websocket.TextMessage, ping); err != nil {
			t.Logf("write ping error: %v", err)
			return
		}

		// Read the pong response.
		_, msg, err := ws.ReadMessage()
		if err != nil {
			t.Logf("read pong error: %v", err)
			return
		}

		var frame inboundFrame
		json.Unmarshal(msg, &frame)
		if frame.Type == "pong" {
			pongReceived <- struct{}{}
		}

		// Keep connection open until client disconnects.
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
	})
	defer conn.Close()

	select {
	case <-pongReceived:
		// Success
	case <-time.After(3 * time.Second):
		t.Error("expected pong response within 3 seconds")
	}
}

func TestRequestForwarding(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	responseReceived := make(chan ResponseFrame, 1)

	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		// Send a request frame.
		body := base64.StdEncoding.EncodeToString([]byte(`{"event":"test.event"}`))
		reqFrame := RequestFrame{
			Type:    "request",
			ID:      "ws-req-1",
			Method:  "POST",
			Path:    "/webhook",
			Headers: map[string]string{"content-type": "application/json"},
			Body:    &body,
		}
		data, _ := json.Marshal(reqFrame)
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}

		// Read the response.
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}

		var resp ResponseFrame
		json.Unmarshal(msg, &resp)
		responseReceived <- resp

		// Keep connection open.
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	handler := http.NewServeMux()
	handler.HandleFunc("/webhook", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.Write([]byte(`{"received":true}`))
	})

	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
	})
	defer conn.Close()

	select {
	case resp := <-responseReceived:
		if resp.Type != "response" {
			t.Errorf("expected type=response, got %s", resp.Type)
		}
		if resp.ID != "ws-req-1" {
			t.Errorf("expected id=ws-req-1, got %s", resp.ID)
		}
		if resp.Status != 200 {
			t.Errorf("expected status=200, got %d", resp.Status)
		}
		if resp.Body == nil {
			t.Fatal("expected non-nil body")
		}
		decoded, _ := base64.StdEncoding.DecodeString(*resp.Body)
		if string(decoded) != `{"received":true}` {
			t.Errorf("unexpected body: %s", string(decoded))
		}
	case <-time.After(3 * time.Second):
		t.Error("expected response within 3 seconds")
	}
}

func TestRequestForwarding_404(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	responseReceived := make(chan ResponseFrame, 1)

	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		reqFrame := RequestFrame{
			Type:    "request",
			ID:      "ws-req-404",
			Method:  "GET",
			Path:    "/nonexistent",
			Headers: map[string]string{},
		}
		data, _ := json.Marshal(reqFrame)
		if err := ws.WriteMessage(websocket.TextMessage, data); err != nil {
			return
		}

		_, msg, err := ws.ReadMessage()
		if err != nil {
			return
		}

		var resp ResponseFrame
		json.Unmarshal(msg, &resp)
		responseReceived <- resp

		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	handler := http.NewServeMux()
	handler.HandleFunc("/exists", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
	})

	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
	})
	defer conn.Close()

	select {
	case resp := <-responseReceived:
		if resp.Status != 404 {
			t.Errorf("expected status=404, got %d", resp.Status)
		}
	case <-time.After(3 * time.Second):
		t.Error("expected response within 3 seconds")
	}
}

func TestConnectionClose(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	connected := make(chan struct{}, 1)

	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
		OnConnect: func() {
			select {
			case connected <- struct{}{}:
			default:
			}
		},
	})

	select {
	case <-connected:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for connection")
	}

	// Close should complete without blocking.
	done := make(chan struct{})
	go func() {
		conn.Close()
		close(done)
	}()

	select {
	case <-done:
		// Success
	case <-time.After(3 * time.Second):
		t.Error("Close() blocked for too long")
	}
}

func TestReconnectBackoff(t *testing.T) {
	// Test the backoff calculation directly.
	b := initialBackoff
	if b != 1*time.Second {
		t.Errorf("expected initial backoff=1s, got %v", b)
	}

	b = nextBackoff(b)
	if b != 2*time.Second {
		t.Errorf("expected backoff=2s, got %v", b)
	}

	b = nextBackoff(b)
	if b != 4*time.Second {
		t.Errorf("expected backoff=4s, got %v", b)
	}

	b = nextBackoff(b)
	if b != 8*time.Second {
		t.Errorf("expected backoff=8s, got %v", b)
	}

	b = nextBackoff(b)
	if b != 16*time.Second {
		t.Errorf("expected backoff=16s, got %v", b)
	}

	b = nextBackoff(b)
	if b != 30*time.Second {
		t.Errorf("expected backoff to cap at 30s, got %v", b)
	}

	b = nextBackoff(b)
	if b != 30*time.Second {
		t.Errorf("expected backoff to stay at 30s, got %v", b)
	}
}

func TestReconnectAfterServerDrop(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	var mu sync.Mutex
	connectCount := 0

	reconnected := make(chan struct{}, 5)

	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		mu.Lock()
		connectCount++
		count := connectCount
		mu.Unlock()

		reconnected <- struct{}{}

		if count == 1 {
			// Drop the first connection immediately.
			ws.Close()
			return
		}

		// Keep the second connection open.
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})

	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
	})
	defer conn.Close()

	// Wait for at least 2 connections (original + reconnect).
	for i := 0; i < 2; i++ {
		select {
		case <-reconnected:
		case <-time.After(5 * time.Second):
			t.Fatalf("timed out waiting for connection attempt %d", i+1)
		}
	}

	mu.Lock()
	if connectCount < 2 {
		t.Errorf("expected at least 2 connection attempts, got %d", connectCount)
	}
	mu.Unlock()
}

// --- Header sanitization tests (in dispatch.go) ---

func TestHopByHopHeadersRemoved(t *testing.T) {
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify hop-by-hop headers were stripped from the request.
		if r.Header.Get("Host") != "" {
			t.Error("expected Host header to be stripped")
		}
		if r.Header.Get("Connection") != "" {
			t.Error("expected Connection header to be stripped")
		}
		if r.Header.Get("Transfer-Encoding") != "" {
			t.Error("expected Transfer-Encoding header to be stripped")
		}
		// Custom headers should survive.
		if r.Header.Get("X-Custom") != "value" {
			t.Errorf("expected X-Custom=value, got %s", r.Header.Get("X-Custom"))
		}
		w.WriteHeader(200)
	})

	frame := RequestFrame{
		Type:   "request",
		ID:     "req-headers",
		Method: "GET",
		Path:   "/test",
		Headers: map[string]string{
			"Host":              "example.com",
			"Connection":        "keep-alive",
			"Transfer-Encoding": "chunked",
			"X-Custom":          "value",
			"Content-Type":      "text/plain",
		},
	}

	resp := dispatch(handler, frame)

	if resp.Status != 200 {
		t.Errorf("expected status=200, got %d", resp.Status)
	}
}

// --- Connection.Done() test ---

func TestConnectionDone(t *testing.T) {
	os.Unsetenv("GO_ENV")
	os.Unsetenv("ENV")
	os.Unsetenv("SIMPLEHOOK_ENABLED")

	mockServer := newMockWSServer(t, func(ws *websocket.Conn) {
		for {
			_, _, err := ws.ReadMessage()
			if err != nil {
				return
			}
		}
	})
	defer mockServer.Close()

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {})
	connected := make(chan struct{}, 1)

	conn := ListenToWebhooks(handler, "ak_test_key", &ListenOptions{
		ForceEnable: true,
		ServerURL:   mockServer.wsURL(),
		Silent:      true,
		OnConnect: func() {
			select {
			case connected <- struct{}{}:
			default:
			}
		},
	})

	select {
	case <-connected:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for connection")
	}

	// Done() should not be closed yet.
	select {
	case <-conn.Done():
		t.Error("Done() should not be closed while connection is active")
	default:
		// Good
	}

	conn.Close()

	// Done() should be closed after Close().
	select {
	case <-conn.Done():
		// Good
	case <-time.After(3 * time.Second):
		t.Error("Done() should be closed after Close()")
	}
}
