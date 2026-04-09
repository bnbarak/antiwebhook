---
name: build-test-validate
description: How to build, test, and validate the simplehook codebase — Rust server, React webapp, integration tests, and deployment
---

# simplehook — Build, Test & Validate

## Prerequisites

```bash
# Start Postgres (port 5434)
docker compose up -d

# Verify it's running
docker compose ps
```

## Build

### Rust server

```bash
cd server && cargo build
```

Binary at `server/target/debug/simplehook-server`. Warnings about unused `deactivate_by_customer` and `TrialCandidate.project_id` are known and safe to ignore.

### React webapp

```bash
cd javascript/webapp && npm run build
```

Chunk size warning for `index.js > 500kB` is known. Output in `dist/`.

## Test — Three Layers

Run in this order. If unit tests fail, don't bother with integration tests.

### 1. Unit tests (Rust) — 60 tests

```bash
cd server && cargo test
```

Tests agent logic (cursor, params, glob, serialization, locks), tunnel manager, proxy, queue, auth, billing, email, rate limiting. No database needed.

### 2. Integration tests (Node.js) — 37 tests

Requires: `docker compose up -d` + `cargo build`

```bash
# Agent pull API (17 tests)
cd tests && node --test agent.test.js

# Core webhook flow (20 tests, 1 pre-existing skip)
cd tests && node --test e2e.test.js
```

Each test file spawns its own server instance on a unique port:

| Test file | Port | Tests |
|-----------|------|-------|
| e2e.test.js | 8401 | 20 (19 pass, 1 skip) |
| agent.test.js | 8402 | 17 |
| stress.test.js | 8403 | 8 |
| auth.test.js | 8404 | varies |
| billing.test.js | 8405 | varies |

**New test files use port 8406+.**

### 3. Stress tests (optional)

```bash
cd tests && node --test stress.test.js
```

8 tests: concurrent webhooks, disconnect/reconnect, rapid-fire, body sizes, triple replay.

### Run all integration tests at once

```bash
cd tests && node --test e2e.test.js agent.test.js stress.test.js
```

## Full Validation Checklist

Run this before pushing to main:

```bash
# 1. Unit tests
cd server && cargo test

# 2. Build server
cd server && cargo build

# 3. Build webapp
cd javascript/webapp && npm run build

# 4. Integration tests (requires docker postgres)
cd tests && node --test agent.test.js
cd tests && node --test e2e.test.js

# 5. Check git status
cd /Users/barak/antiwebhooks && git status
```

Expected results:
- `cargo test`: 60 passed, 0 failed
- `cargo build`: success (2 known warnings)
- `npm run build`: success (1 known chunk warning)
- `agent.test.js`: 17 passed, 0 failed
- `e2e.test.js`: 19 passed, 0 failed, 1 skipped (passthrough test)

## Architecture Quick Reference

```
server/src/
├── main.rs           # Entrypoint, migrations, background workers
├── app.rs            # Router, AppState, CORS
├── agent.rs          # Pull API: /api/agent/pull, /api/agent/status
├── api.rs            # REST API: events, routes, listeners, stats
├── proxy.rs          # Webhook receiver: /hooks/:project_id/*
├── tunnel.rs         # WebSocket tunnel manager
├── queue.rs          # Background retry worker
├── db.rs             # Models, queries, cursor CRUD
├── auth.rs           # Bearer token / session cookie extractor
├── billing.rs        # Stripe integration
├── user_auth.rs      # Email/password + GitHub OAuth
├── error.rs          # AppError enum
├── config.rs         # Env var config
├── rate_limit.rs     # Per-key rate limiter
├── email.rs          # Transactional email
└── trial_worker.rs   # Trial expiration checker

javascript/webapp/    # React (Vite) dashboard
tests/                # Integration tests (Node.js)
javascript/sdk/       # @simplehook/* SDKs (core, express, fastify, hono, cli, mastra)
python/               # Flask/FastAPI/Django SDKs
go/                   # Go SDK
```

## Database

Postgres on port 5434 (docker compose). 13 migrations in `server/migrations/`.

To reset: `psql "postgres://admin:secret@localhost:5434/simplehook" -c "DELETE FROM agent_cursors; DELETE FROM events; DELETE FROM listeners; DELETE FROM routes; DELETE FROM sessions; DELETE FROM password_resets; DELETE FROM email_log; DELETE FROM users; DELETE FROM projects;"`

## Adding Code

### New API endpoint
1. Add query/model to `db.rs`
2. Add handler to `agent.rs` or `api.rs`
3. Mount route in `app.rs`
4. Add unit test in the source file's `#[cfg(test)]` module
5. Add integration test in `tests/agent.test.js` or `tests/e2e.test.js`
6. Run full validation checklist

### New migration
Next migration: `server/migrations/014_*.sql`

### New integration test
Use port 8406+. Follow the harness pattern in existing test files (spawn server, wait for health, register project, run tests, kill server).

## Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `DATABASE_URL` | — | Yes |
| `PORT` | `8400` | No |
| `BASE_URL` | `http://localhost:8400` | No |
| `FRONTEND_URL` | `http://localhost:4000` | No |
| `STRIPE_SECRET_KEY` | — | For billing |
| `STRIPE_WEBHOOK_SECRET` | — | For billing |
| `RESEND_API_KEY` | — | For email |
| `GITHUB_CLIENT_ID` | — | For OAuth |
| `GITHUB_CLIENT_SECRET` | — | For OAuth |

## Deployment

### Server (Rust → Fly.io)

```bash
# Deploy from repo root
flyctl deploy -a simplehook-server
```

Uses `Dockerfile.fly` (multi-stage: rust:slim builder → debian:bookworm-slim runtime). Config in `fly.toml`. App runs at `hook.simplehook.dev`.

**After deploy, verify:**
```bash
curl https://hook.simplehook.dev/health  # should return "ok"
```

**Known warning:** "The app is not listening on the expected address" — this is a false positive from Fly.io's detection. The app works correctly on port 8400.

**CI/CD:** GitHub Actions (`.github/workflows/ci.yml`) runs on push to main:
- Rust build + unit tests
- SDK tests (Express, Fastify, Hono, Flask, Django, FastAPI)
- Webapp typecheck + build
- Integration tests (e2e + agent pull)

Fly.io deploys are triggered separately via webhook. If a deploy fails, check the Fly.io Activity tab or run `flyctl logs -a simplehook-server`.

### Webapp (React → static)

```bash
cd javascript/webapp && npm run build
```

Output in `dist/`. Deploy to any CDN/static host.

### Production E2E Test

After deploying, run the production test suite:

```bash
cd tests
source .env.local  # contains SIMPLEHOOK_KEY, SIMPLEHOOK_PROJECT_ID, SIMPLEHOOK_BASE_URL
SIMPLEHOOK_KEY=$SIMPLEHOOK_KEY SIMPLEHOOK_PROJECT_ID=$SIMPLEHOOK_PROJECT_ID SIMPLEHOOK_BASE_URL=$SIMPLEHOOK_BASE_URL node --test agent-prod.test.js
```

11 tests against live production: webhook ingestion, pull, cursor, path filter, wait, timeout, SSE stream, auth, conflict, status.
