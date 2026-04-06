# simplehook

Stable webhook URLs for localhost. One line of code.

```
Stripe/Twilio/GitHub ──POST──> simplehook cloud ══WS══> Your Express app on localhost
```

## Quick start

### Run everything with Docker (recommended)

```bash
docker compose up --build -d
```

That's it. Postgres + Rust server start together. Server is at **http://localhost:8400**.

```bash
# Verify it works
curl http://localhost:8400/health

# Register a project
curl -s -X POST http://localhost:8400/api/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-project"}' | jq
```

Stop everything: `docker compose down` (add `-v` to wipe the DB).

### Run without Docker (for development)

Prerequisites: Docker (for Postgres), Rust toolchain, Node.js 18+

```bash
# 1. Start just Postgres
docker compose up postgres -d

# 2. Start the server
cp .env.example .env
cd server
cargo run
```

Server starts on **http://localhost:8400**. Migrations run automatically on first boot.

### 3. Test it

```bash
# Register a project
curl -s -X POST http://localhost:8400/api/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"my-project"}' | jq

# Returns: { project_id, api_key, webhook_base_url }
```

### 4. Connect the SDK

```bash
cd javascript/sdk/express
npm install
```

```javascript
const express = require('express');
const { listenToWebhooks } = require('./index'); // or 'simplehook' when published

const app = express();
app.use(express.json());

listenToWebhooks(app, 'ak_YOUR_KEY', { serverUrl: 'ws://localhost:8400' });

app.post('/stripe/webhook', (req, res) => {
  console.log('Webhook received!', req.body);
  res.json({ received: true });
});

app.listen(3001);
```

### 5. Send a test webhook

```bash
curl -X POST http://localhost:8400/hooks/p_YOUR_PROJECT_ID/stripe/webhook \
  -H 'Content-Type: application/json' \
  -d '{"type":"checkout.session.completed"}'
```

The webhook arrives at your Express app.

## Running tests

### Unit tests (Rust)

```bash
cd server
cargo test
```

28 tests covering: tunnel manager, frame serialization, auth, billing signature verification, DB helpers.

### E2E integration tests

Requires Docker (postgres) + compiled server binary.

```bash
# Make sure postgres is running
docker compose up -d

# Build the server
cd server && cargo build && cd ..

# Run e2e tests (spawns real server, connects real SDK, sends real webhooks)
cd tests
npm install
node --test e2e.test.js
```

19 tests covering: registration, auth, queue mode, live delivery, drain-on-reconnect, replay, routes CRUD, filtering, project isolation.

### Stress tests

```bash
cd tests
node --test stress.test.js
```

8 tests covering: 20 concurrent webhooks, 3 isolated projects, disconnect/reconnect, 50 rapid-fire, HTTP methods, 100KB body, empty body, triple replay.

## Project structure

```
simplehook/
  server/                    Rust server (axum + sqlx + postgres)
    src/
      main.rs                Boot, migrations, serve on :8400
      tunnel.rs              THE CORE: WebSocket tunnel manager
      proxy.rs               Webhook receiver (passthrough + queue)
      queue.rs               Background retry worker
      api.rs                 REST API for dashboard
      billing.rs             Stripe checkout + webhooks
      auth.rs                API key auth extractor
      db.rs                  Models + queries
      config.rs              Env vars
      error.rs               Error handling
    migrations/
      001_init.sql           PostgreSQL schema (3 tables)

  javascript/
    sdk/
      express/               Node.js SDK (~100 lines)
        index.js             WebSocket client + loopback proxy
        index.d.ts           TypeScript types

  tests/
    e2e.test.js              Full integration tests
    stress.test.js           Concurrency + resilience tests

  docs/
    PRODUCT.md               Product pitch + user-facing README
    ARCHITECTURE.md          System design
    IMPLEMENTATION.md        Build plan
    EXAMPLES.md              Developer examples

  docker-compose.yml         PostgreSQL for local dev
  .env.example               Environment variables
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | required | Postgres connection string |
| `PORT` | `8400` | Server port |
| `BASE_URL` | `http://localhost:8400` | Public URL for webhook endpoints |
| `FRONTEND_URL` | `http://localhost:4000` | React webapp URL (for Stripe redirects) |
| `STRIPE_SECRET_KEY` | - | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | - | Stripe webhook signing secret |
| `STRIPE_PRICE_ID` | - | Stripe price ID ($5/mo) |
| `RUST_LOG` | `info` | Log level |

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/register` | Create project, get API key + webhook URL |
| `GET` | `/api/projects/me` | Project info + connection status |
| `GET` | `/api/events` | List events (filter: `?status=`, `?path=`) |
| `GET` | `/api/events/:id` | Event detail |
| `POST` | `/api/events/:id/replay` | Replay an event |
| `GET` | `/api/routes` | List route configs |
| `POST` | `/api/routes` | Create route (passthrough/queue) |
| `DELETE` | `/api/routes/:id` | Delete route |
| `POST` | `/api/billing/checkout` | Create Stripe checkout |
| `POST` | `/api/billing/portal` | Create Stripe billing portal |
| `GET` | `/api/listeners` | List listeners |
| `POST` | `/api/listeners` | Create listener |
| `DELETE` | `/api/listeners/:id` | Delete listener |
| `GET` | `/api/agent/pull` | Pull events (instant, `?wait=true`, `?stream=true`) |
| `GET` | `/api/agent/status` | Queue health, cursors, connected listeners |
| `POST` | `/hooks/:project_id/*` | Webhook receiver (3rd parties POST here) |
| `GET` | `/tunnel?key=ak_...` | WebSocket tunnel (SDKs connect here) |

### AI Agent API

AI agents and scripts can consume webhooks via HTTP without holding a WebSocket open.

```bash
# Pull next event
curl -H "Authorization: Bearer ak_..." "https://hook.simplehook.dev/api/agent/pull"

# Long-poll — block until a Stripe event arrives
curl -H "Authorization: Bearer ak_..." "https://hook.simplehook.dev/api/agent/pull?wait=true&path=/stripe/*"

# Check queue status
curl -H "Authorization: Bearer ak_..." "https://hook.simplehook.dev/api/agent/status"
```

Three modes: instant (`pull`), long-poll (`pull?wait=true`), SSE stream (`pull?stream=true`). See [docs](https://www.simplehook.dev/docs?mode=agents) for full reference.

### Claude Code Skill

Teach your AI agent the full simplehook API:

```bash
claude skills add bnbarak/simplewehbook-skills
```

Source: [github.com/bnbarak/simplewehbook-skills](https://github.com/bnbarak/simplewehbook-skills)
