# Architecture

## The Key Insight

The developer's app connects TO us. Not the other way around.

```
Traditional (ngrok):     Developer runs a tunnel process → exposes localhost to internet
simplehook:            Developer's app opens WebSocket to us → we forward webhooks through it
```

No CLI. No tunnel binary. The SDK (npm package) opens an outbound WebSocket from inside the Express app. We send webhooks down that connection. The app handles them like normal HTTP requests.

---

## System Overview

```
3rd Party (Stripe, Twilio)                Developer's Express App
        |                                         |
        | POST /hooks/p_xxx/stripe/webhook         | app starts → SDK connects
        v                                         v
┌──────────────────────────────────────────────────────────┐
│                  simplehook cloud (Rust)                │
│                                                          │
│   Webhook Receiver          Tunnel Manager               │
│   ┌──────────┐             ┌──────────────┐              │
│   │ Receives  │   route    │ Connected    │              │
│   │ webhook   │──lookup──▶│ apps per     │◄── WebSocket  │
│   │ from 3rd  │            │ project_id   │    from SDK   │
│   │ party     │            │              │              │
│   └──────────┘            └──────────────┘              │
│        │                        │                        │
│        │  passthrough?          │                        │
│        │  ├─ yes: hold conn,    │                        │
│        │  │  forward via WS,    │                        │
│        │  │  return real resp   │                        │
│        │  └─ no (queue):        │                        │
│        │     store event,       │                        │
│        │     return 200,        │                        │
│        │     deliver async      │                        │
│        │                        │                        │
│   SQLite: events, routes, projects                       │
│   Dashboard: maud HTML                                   │
│   Billing: Stripe $5/mo                                  │
└──────────────────────────────────────────────────────────┘
```

## Components

### 1. Cloud Service (Rust binary)

Single Rust binary that handles everything:

- **Webhook receiver**: `POST /hooks/{project_id}/*path` — accepts webhooks from 3rd parties
- **Tunnel server**: `GET /tunnel?key=ak_xxx` — WebSocket endpoint that SDKs connect to
- **Tunnel manager**: Routes incoming webhooks to the right connected app
- **Event store**: SQLite — every webhook is logged, replayable
- **Queue worker**: Background task that retries failed queue-mode deliveries
- **Dashboard**: Server-rendered HTML (maud) — events, routes, replay
- **Billing**: Stripe checkout + webhook handler

### 2. SDK (npm package, pip package, etc.)

Tiny library that the developer adds to their app. For Node.js/Express:

```javascript
// simplehook npm package — ~100 lines of code
const WebSocket = require('ws');

function listenToWebhooks(app, apiKey, opts = {}) {
  const ws = new WebSocket(`wss://hooks.simplehook.dev/tunnel?key=${apiKey}`);

  ws.on('message', (raw) => {
    const frame = JSON.parse(raw);
    if (frame.type !== 'request') return;

    // Synthesize an HTTP request to the Express app
    const req = new MockRequest(frame.method, frame.path, frame.headers, frame.body);
    const res = new MockResponse((status, headers, body) => {
      ws.send(JSON.stringify({
        type: 'response',
        id: frame.id,
        status,
        headers,
        body: body?.toString('base64'),
      }));
    });

    // Run through Express's router
    app.handle(req, res);
  });

  ws.on('close', () => setTimeout(() => listenToWebhooks(app, apiKey, opts), 3000)); // reconnect
}
```

That's the entire SDK concept. It:
1. Opens WebSocket to simplehook
2. Receives webhook requests as JSON frames
3. Feeds them into Express's router (app.handle)
4. Captures the response and sends it back through the WebSocket

The developer's route handlers (`app.post('/stripe/webhook', ...)`) work exactly as if it were a real HTTP request. `req.body`, `req.headers`, `res.json()`, `res.type()` — all work.

### 3. Dashboard

Minimal server-rendered HTML. No JS framework. Dark theme, monospace.

Pages:
- Login (API key)
- Events list (last 100, filterable by path/status)
- Event detail (full request/response bodies)
- Routes config (path → passthrough/queue)
- Replay button (re-delivers an event)

---

## Tech Stack

| Component | Choice | Why |
|-----------|--------|-----|
| Language | Rust | Single binary, fast, reliable |
| HTTP | axum 0.8 | Modern, tokio-native, built-in WebSocket |
| Runtime | tokio | Standard |
| DB | SQLite (sqlx) | No external deps, single file |
| HTML | maud | Compile-time, no template files |
| Billing | Stripe via reqwest | 4 API calls, no SDK needed |
| Node SDK | ws + Express internals | ~100 lines, zero deps beyond ws |

---

## Database

```sql
projects (id, name, api_key, stripe_customer_id, active, created_at)
routes   (id, project_id, path_prefix, mode: passthrough|queue, created_at)
events   (id, project_id, path, method, headers, body, status, response_status, response_body, created_at, delivered_at, attempts)
```

Three tables. Every webhook is an event row. Replay = clone event as pending.

---

## WebSocket Protocol

JSON frames between cloud service and SDK:

```json
// Cloud → SDK: here's a webhook for you
{
  "type": "request",
  "id": "evt_abc123",
  "method": "POST",
  "path": "/stripe/webhook",
  "headers": {"content-type": "application/json", "stripe-signature": "..."},
  "body": "<base64>"
}

// SDK → Cloud: here's my app's response
{
  "type": "response",
  "id": "evt_abc123",
  "status": 200,
  "headers": {"content-type": "application/json"},
  "body": "<base64>"
}

// Keepalive
{"type": "ping"}
{"type": "pong"}
```

---

## Passthrough vs Queue

### Passthrough

```
Twilio ──POST──▶ Cloud ══WS══▶ SDK ──▶ Express handler
                   ▲                        │
                   │         ◀══WS══        │
                   └──── real TwiML XML ────┘
```

Cloud holds Twilio's HTTP connection. Forwards through WebSocket. Gets Express's response back. Returns it to Twilio. Twilio sees TwiML XML. Timeout: 30s.

### Queue

```
Stripe ──POST──▶ Cloud ──▶ 200 OK (instant, Stripe happy)
                   │
                   └──▶ Store event
                   └──▶ Deliver via WS when SDK connected
                   └──▶ Retry 5x with backoff if fails
```

Stripe doesn't care about the response body. We return 200 immediately, deliver async. If the developer's app is offline, events queue and deliver when they reconnect.

---

## Deployment

Single binary. Deploy anywhere (fly.io, Railway, bare VPS).

```bash
DATABASE_URL=sqlite:data.db \
STRIPE_SECRET_KEY=sk_xxx \
STRIPE_WEBHOOK_SECRET=whsec_xxx \
./simplehook-server
```

Put behind Caddy for TLS. SQLite file on disk. Back up with cron.

---

## What we ship

| Deliverable | What |
|-------------|------|
| `simplehook-server` | Rust binary — the cloud service |
| `simplehook` npm package | Node.js SDK (~100 lines) |
| Dashboard | Built into the server (maud HTML) |
| Landing page | Static HTML at simplehook.dev |

Future SDKs: Python, Go, Ruby — same WebSocket protocol, ~100 lines each.
