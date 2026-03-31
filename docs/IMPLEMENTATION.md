# Implementation Plan

## What We Build

| Deliverable | Language | Description |
|-------------|----------|-------------|
| Cloud server | Rust | Receives webhooks, manages tunnels, dashboard, billing |
| Node.js SDK | JavaScript | `simplehook.listenToWebhooks(app, key)` — ~100 lines |
| Landing page | HTML | Static page at simplehook.dev |

---

## Rust Cloud Server

### Project Structure

```
~/simplehook/
├── Cargo.toml                          # workspace root
├── migrations/
│   └── 001_init.sql                    # SQLite schema
├── crates/
│   └── server/
│       ├── Cargo.toml
│       └── src/
│           ├── main.rs                 # boot: init DB, spawn queue worker, serve
│           ├── app.rs                  # AppState + axum Router
│           ├── db.rs                   # models + all queries
│           ├── proxy.rs                # POST /hooks/{project_id}/*path
│           ├── tunnel.rs               # WebSocket tunnel manager
│           ├── queue.rs                # background retry worker
│           ├── dashboard.rs            # maud HTML views
│           ├── billing.rs              # Stripe checkout + webhooks
│           └── auth.rs                 # API key middleware
├── sdk/
│   └── node/
│       ├── package.json
│       ├── index.js                    # simplehook.listenToWebhooks(app, key)
│       └── README.md
├── site/
│   └── index.html                      # landing page
└── .env.example
```

### Crate Dependencies

```toml
[dependencies]
axum = { version = "0.8", features = ["ws"] }
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.8", features = ["sqlite", "runtime-tokio", "migrate"] }
maud = { version = "0.26", features = ["axum"] }
reqwest = { version = "0.12", features = ["json"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
uuid = { version = "0.8", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
tower-http = { version = "0.6", features = ["cors", "trace"] }
tracing = "0.1"
tracing-subscriber = "0.3"
base64 = "0.22"
rand = "0.8"
hmac = "0.12"
sha2 = "0.10"
```

### Database Schema

```sql
CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    api_key     TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT,
    active      INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE routes (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id),
    path_prefix TEXT NOT NULL,
    mode        TEXT NOT NULL CHECK (mode IN ('passthrough', 'queue')),
    UNIQUE(project_id, path_prefix)
);

CREATE TABLE events (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id),
    path            TEXT NOT NULL,
    method          TEXT NOT NULL,
    headers         TEXT NOT NULL,       -- JSON
    body            BLOB,
    status          TEXT NOT NULL DEFAULT 'pending',
    response_status INTEGER,
    response_body   BLOB,
    attempts        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    delivered_at    TEXT
);
```

### Routes

```
POST /hooks/{project_id}/*path         → proxy::handle_webhook
GET  /tunnel                            → tunnel::handle_ws_upgrade (SDK connects here)
GET  /dashboard                         → dashboard::login_page
POST /dashboard/login                   → dashboard::login
GET  /dashboard/events                  → dashboard::events_list
POST /dashboard/events/{id}/replay      → dashboard::replay
GET  /dashboard/routes                  → dashboard::routes_list
POST /dashboard/routes                  → dashboard::create_route
POST /dashboard/routes/{id}/delete      → dashboard::delete_route
POST /billing/checkout                  → billing::create_checkout
POST /billing/webhook                   → billing::stripe_webhook
```

---

## Server Files

### main.rs (~50 lines)
- Read env vars (DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
- Init tracing
- Init SQLite pool, run migrations
- Build AppState, build Router
- Spawn queue::run_worker background task
- Serve on port 8400

### app.rs (~50 lines)
```rust
struct AppState {
    db: SqlitePool,
    tunnels: TunnelManager,
    stripe_secret: String,
    stripe_webhook_secret: String,
}
```
Build axum Router with all routes.

### db.rs (~200 lines)
- `Project`, `Route`, `Event` structs (sqlx::FromRow)
- All query functions: get_project_by_key, insert_event, update_event_delivered, get_pending_events, etc.
- init_pool: create pool, WAL mode, run migrations

### tunnel.rs (~180 lines) — THE CORE
```rust
struct TunnelManager {
    // project_id → channel to send requests to the connected SDK
    connections: RwLock<HashMap<String, mpsc::Sender<(RequestFrame, oneshot::Sender<ResponseFrame>)>>>,
}

impl TunnelManager {
    // Called by proxy.rs: forward a webhook to the connected SDK
    async fn send_request(&self, project_id: &str, frame: RequestFrame) -> Option<ResponseFrame>;

    // Check if SDK is connected for a project
    fn is_connected(&self, project_id: &str) -> bool;
}
```

WebSocket handler:
1. SDK connects with `GET /tunnel?key=ak_xxx`
2. Verify API key, lookup project
3. Register in connections map
4. Loop: receive request from channel → send over WS → wait for response → send through oneshot
5. On disconnect: remove from map

### proxy.rs (~100 lines)
```rust
async fn handle_webhook(state, project_id, path, method, headers, body) -> Response {
    // 1. Lookup project
    // 2. Store event in DB
    // 3. Match route → passthrough or queue
    //
    // Passthrough:
    //   tunnels.send_request(project_id, frame).await
    //   Return SDK's response to the webhook caller
    //
    // Queue:
    //   Return 200 immediately
    //   Spawn task: try instant delivery, else worker picks it up
}
```

### queue.rs (~80 lines)
Background task: poll pending events every 1s, deliver via tunnel, retry with backoff (5s→30s→2m→10m→1h), mark failed after 5 attempts.

### dashboard.rs (~250 lines)
All maud HTML. Dark theme, monospace. Login, events table, routes form, replay button. Optional htmx for no-reload replay.

### billing.rs (~120 lines)
- create_checkout: POST to Stripe API, redirect to checkout URL
- stripe_webhook: verify signature, handle 4 event types (checkout.completed, payment.succeeded, payment.failed, subscription.deleted)

### auth.rs (~50 lines)
Extract API key from Bearer header or cookie.

---

## Node.js SDK

### sdk/node/index.js (~100 lines)

```javascript
const WebSocket = require('ws');
const http = require('http');

const SERVER = process.env.SIMPLEHOOK_URL || 'wss://hooks.simplehook.dev';

exports.listenToWebhooks = function listenToWebhooks(app, apiKey) {
  function connect() {
    const ws = new WebSocket(`${SERVER}/tunnel?key=${apiKey}`);

    ws.on('open', () => console.log('[simplehook] connected'));

    ws.on('message', (raw) => {
      const frame = JSON.parse(raw);
      if (frame.type === 'ping') return ws.send(JSON.stringify({ type: 'pong' }));
      if (frame.type !== 'request') return;

      // Build a fake IncomingMessage + ServerResponse and run through Express
      const body = frame.body ? Buffer.from(frame.body, 'base64') : Buffer.alloc(0);

      const req = new http.IncomingMessage();
      req.method = frame.method;
      req.url = frame.path;
      req.headers = frame.headers || {};
      req.push(body);
      req.push(null);

      const chunks = [];
      const res = new http.ServerResponse(req);
      const originalWrite = res.write.bind(res);
      const originalEnd = res.end.bind(res);

      res.write = (chunk) => { chunks.push(Buffer.from(chunk)); return originalWrite(chunk); };
      res.end = (chunk) => {
        if (chunk) chunks.push(Buffer.from(chunk));
        const responseBody = Buffer.concat(chunks);

        ws.send(JSON.stringify({
          type: 'response',
          id: frame.id,
          status: res.statusCode,
          headers: res.getHeaders(),
          body: responseBody.length > 0 ? responseBody.toString('base64') : null,
        }));

        return originalEnd(chunk);
      };

      // Feed into Express router
      app.handle(req, res);
    });

    ws.on('close', () => {
      console.log('[simplehook] disconnected, reconnecting in 3s...');
      setTimeout(connect, 3000);
    });

    ws.on('error', () => {}); // close event handles reconnect
  }

  connect();
};
```

### sdk/node/package.json

```json
{
  "name": "simplehook",
  "version": "0.1.0",
  "description": "Stable webhook URLs for localhost. One line of code.",
  "main": "index.js",
  "dependencies": { "ws": "^8.0.0" },
  "keywords": ["webhooks", "tunnel", "ngrok", "development"]
}
```

---

## Build Phases

| # | Phase | Files | Time |
|---|-------|-------|------|
| 1 | Skeleton | Cargo.toml, main.rs, app.rs, db.rs, migrations | 2h |
| 2 | Tunnel + Passthrough | tunnel.rs, proxy.rs, SDK index.js | 3h |
| 3 | Queue | queue.rs, update proxy.rs | 1h |
| 4 | Dashboard | dashboard.rs, auth.rs | 2h |
| 5 | Billing | billing.rs | 1h |
| 6 | Polish | Error handling, reconnect, landing page | 1h |

**Total: ~10 hours. ~1,500 lines Rust + ~100 lines JS.**

---

## Verification

1. `cargo build` compiles
2. Start server, Express app with SDK connects via WebSocket
3. `curl POST /hooks/{id}/test` → arrives at Express route, response returned
4. Queue mode: event stored, delivered async, retry on failure
5. Passthrough mode: real response returned to curl
6. Dashboard: login, view events, replay, configure routes
7. Stripe: checkout → project activated
