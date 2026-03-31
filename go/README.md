# simplehook / simplehook-go

**One line of code. Webhooks just work.**

## Install

```bash
go get github.com/bnbarak/antiwebhook/go
```

## Quick start

```go
package main

import (
    "fmt"
    "net/http"
    "os"

    simplehook "github.com/bnbarak/antiwebhook/go"
)

func main() {
    mux := http.NewServeMux()
    mux.HandleFunc("POST /stripe/events", func(w http.ResponseWriter, r *http.Request) {
        fmt.Println("Webhook received!")
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(`{"received": true}`))
    })

    simplehook.ListenToWebhooks(mux, os.Getenv("SIMPLEHOOK_KEY"))
    http.ListenAndServe(":3000", mux)
}
```

## Agents

```go
simplehook.ListenToWebhooksWithID(mux, os.Getenv("SIMPLEHOOK_KEY"), "staging")
```

## Options

```go
simplehook.ListenToWebhooks(mux, apiKey, simplehook.ListenOptions{
    ForceEnable: true,
    Silent:      false,
    OnConnect:   func() { fmt.Println("Connected!") },
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

## Links

- [simplehook.dev](https://simplehook.dev)
- [Dashboard](https://simplehook.dev/dashboard)
- [JavaScript SDK](https://www.npmjs.com/package/simplehook)
