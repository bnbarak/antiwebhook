// Package simplehook connects Go HTTP handlers to simplehook's WebSocket tunnel,
// enabling local development with real webhooks. One line of code — webhooks just work.
package simplehook

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	defaultServerURL = "wss://hook.simplehook.dev"
	maxBackoff       = 30 * time.Second
	initialBackoff   = 1 * time.Second
)

// ListenToWebhooks connects an http.Handler to simplehook's WebSocket tunnel.
// Inbound webhook requests are dispatched to the handler and responses are sent back.
//
// In production (GO_ENV=production or ENV=production), this returns a no-op connection
// unless opts.ForceEnable is true.
func ListenToWebhooks(handler http.Handler, apiKey string, opts ...ListenOptions) *Connection {
	var o ListenOptions
	if len(opts) > 0 {
		o = opts[0]
	}

	if !o.ForceEnable && isProduction() {
		return newClosedConnection()
	}
	if isExplicitlyDisabled() {
		return newClosedConnection()
	}

	serverURL := o.ServerURL
	if serverURL == "" {
		serverURL = os.Getenv("SIMPLEHOOK_URL")
	}
	if serverURL == "" {
		serverURL = defaultServerURL
	}

	logFn := log.Printf
	if o.Silent {
		logFn = func(string, ...interface{}) {}
	}

	conn := newConnection()

	go runLoop(conn, handler, apiKey, serverURL, &o, logFn)

	return conn
}

// ListenToWebhooksWithID is a convenience for passing a listener ID.
func ListenToWebhooksWithID(handler http.Handler, apiKey string, listenerID string, opts ...ListenOptions) *Connection {
	if len(opts) == 0 {
		opts = []ListenOptions{{}}
	}
	opts[0].ListenerID = listenerID
	return ListenToWebhooks(handler, apiKey, opts...)
}

// runLoop manages the WebSocket connection lifecycle with reconnection.
func runLoop(
	conn *Connection,
	handler http.Handler,
	apiKey string,
	serverURL string,
	opts *ListenOptions,
	logFn func(string, ...interface{}),
) {
	defer close(conn.doneCh)

	backoff := initialBackoff

	for {
		select {
		case <-conn.closeCh:
			return
		default:
		}

		wsURL := fmt.Sprintf("%s/tunnel?key=%s", serverURL, apiKey)
		if opts.ListenerID != "" {
			wsURL += "&listener_id=" + opts.ListenerID
		}

		ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
		if err != nil {
			logFn("[simplehook] connection failed: %v, retrying in %v...", err, backoff)
			if !sleepOrClose(conn.closeCh, backoff) {
				return
			}
			backoff = nextBackoff(backoff)
			continue
		}

		logFn("[simplehook] connected")
		backoff = initialBackoff
		if opts.OnConnect != nil {
			opts.OnConnect()
		}

		handleMessages(conn, ws, handler, logFn)

		ws.Close()

		select {
		case <-conn.closeCh:
			return
		default:
		}

		if opts.OnDisconnect != nil {
			opts.OnDisconnect()
		}

		logFn("[simplehook] disconnected, reconnecting in %v...", backoff)
		if !sleepOrClose(conn.closeCh, backoff) {
			return
		}
		backoff = nextBackoff(backoff)
	}
}

// handleMessages reads WebSocket messages until the connection drops or Close is called.
func handleMessages(
	conn *Connection,
	ws *websocket.Conn,
	handler http.Handler,
	logFn func(string, ...interface{}),
) {
	// Set up a goroutine to close the websocket when conn is closed.
	stopReader := make(chan struct{})
	go func() {
		select {
		case <-conn.closeCh:
			ws.Close()
		case <-stopReader:
		}
	}()
	defer close(stopReader)

	// Mutex to protect concurrent writes to the WebSocket connection.
	var writeMu sync.Mutex

	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			return
		}

		var frame inboundFrame
		if err := json.Unmarshal(raw, &frame); err != nil {
			continue
		}

		switch frame.Type {
		case "ping":
			writeMu.Lock()
			pong, _ := json.Marshal(PongFrame{Type: "pong"})
			err := ws.WriteMessage(websocket.TextMessage, pong)
			writeMu.Unlock()
			if err != nil {
				return
			}

		case "request":
			var req RequestFrame
			if err := json.Unmarshal(raw, &req); err != nil {
				continue
			}
			go func(f RequestFrame) {
				resp := dispatch(handler, f)
				data, err := json.Marshal(resp)
				if err != nil {
					return
				}
				writeMu.Lock()
				_ = ws.WriteMessage(websocket.TextMessage, data)
				writeMu.Unlock()
			}(req)
		}
	}
}

// sleepOrClose waits for the given duration or returns false if closeCh is closed.
func sleepOrClose(closeCh <-chan struct{}, d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-closeCh:
		return false
	case <-t.C:
		return true
	}
}

// nextBackoff doubles the backoff duration up to the maximum.
func nextBackoff(current time.Duration) time.Duration {
	next := current * 2
	if next > maxBackoff {
		return maxBackoff
	}
	return next
}
