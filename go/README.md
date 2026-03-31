# simplehook-go

One line of code. Webhooks just work.

Go SDK for [simplehook](https://simplehook.dev) -- receive webhooks in local development via a WebSocket tunnel. No ngrok, no port forwarding, no config.

## Install

```bash
go get github.com/bnbarak/antiwebhook/go
```

## Quick start

```go
package main

import (
    "encoding/json"
    "log"
    "net/http"
    "os"

    simplehook "github.com/bnbarak/antiwebhook/go"
)

func main() {
    mux := http.NewServeMux()

    mux.HandleFunc("/stripe/events", func(w http.ResponseWriter, r *http.Request) {
        log.Println("[stripe] received event")
        json.NewEncoder(w).Encode(map[string]bool{"received": true})
    })

    mux.HandleFunc("/github/push", func(w http.ResponseWriter, r *http.Request) {
        log.Println("[github] received push")
        json.NewEncoder(w).Encode(map[string]bool{"ok": true})
    })

    // One line -- webhooks flow through this connection
    conn := simplehook.ListenToWebhooks(mux, os.Getenv("SIMPLEHOOK_KEY"), nil)
    defer conn.Close()

    log.Println("Listening on :8080")
    http.ListenAndServe(":8080", mux)
}
```

## Options

```go
conn := simplehook.ListenToWebhooks(mux, apiKey, &simplehook.ListenOptions{
    ListenerID:  "staging",           // identify this listener
    ForceEnable: true,                // enable even in production
    ServerURL:   "wss://custom.url",  // custom server
    Silent:      true,                // suppress logs
    OnConnect:   func() { log.Println("connected") },
    OnDisconnect: func() { log.Println("disconnected") },
})
```

## How it works

1. Your app calls `ListenToWebhooks` with your HTTP handler and API key
2. The SDK opens a WebSocket tunnel to simplehook's server
3. When a webhook arrives at your simplehook URL, it's forwarded through the tunnel
4. The SDK dispatches it to your handler using `httptest.NewRecorder`
5. The response is sent back through the tunnel to the webhook sender

## Production safety

By default, the SDK is a no-op in production (`GO_ENV=production` or `ENV=production`). It also respects `SIMPLEHOOK_ENABLED=false` to explicitly disable.

## Agents

If you have multiple developers or environments, use listener IDs:

```go
conn := simplehook.ListenToWebhooks(mux, apiKey, &simplehook.ListenOptions{
    ListenerID: "alice-laptop",
})
```

## Links

- [simplehook.dev](https://simplehook.dev)
- [Dashboard](https://simplehook.dev/dashboard)
- [JavaScript SDK](https://www.npmjs.com/package/simplehook)
