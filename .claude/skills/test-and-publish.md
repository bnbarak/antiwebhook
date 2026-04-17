---
name: test-and-publish
description: How to test all simplehook SDKs, test apps, and publish packages — the complete release process
---

# simplehook — Test & Publish

## Quick E2E Test (all SDKs + CLI + Agent API + boom)

```bash
cd testApps && ./test-all.sh
```

Prerequisites:
- `docker compose up -d` (Postgres on port 5434)
- `cd server && cargo build` (Rust server binary)
- `cd javascript/sdk/cli && npx tsc` (build CLI)
- Test apps need `npm install` in each: express, fastify, hono, visualizer

What it covers:
- Server boots + project registration via `/api/register`
- SDK adapters connect over WebSocket and receive webhooks (`@simplehook/express`, `/fastify`, `/hono`)
- Agent Pull API (`/api/agent/pull` + `/status`)
- `@simplehook/mastra` smoke test — calls the tool `execute()` directly (no LLM)
- `@simplehook/playwright` smoke test — provider pull, filter, delete, reset (no browser)
- `@simplehook/cli` — `status`, `pull`, `routes`, `listeners`
- Targeted routing — listener-specific delivery, listener_id tagging
- Delivery signatures — `webhook_signature` + `webhook_id` present on pulled events
- boom.js — concurrent burst of webhooks
- Webapp build — MPA HTML entries + SEO files

## Running Individual Integration Tests

```bash
# Agent pull API (17 tests)
cd tests && node --test agent.test.js

# Core webhook flow (20 tests)
cd tests && node --test e2e.test.js

# Targeted routing (8 tests)
cd tests && node --test routing.test.js

# Delivery signatures (8 tests)
cd tests && node --test signature.test.js

# Auth tests
cd tests && node --test auth.test.js

# Stress tests
cd tests && node --test stress.test.js

# All integration tests
cd tests && node --test e2e.test.js agent.test.js routing.test.js signature.test.js
```

Each test file spawns its own server on a unique port (8401-8406).

## Running SDK Unit Tests

```bash
# JavaScript SDKs (Vitest)
cd javascript/sdk/core && npx vitest run

# Python SDKs (pytest)
cd python/flask && python -m pytest
cd python/fastapi && python -m pytest
```

## Full SDK E2E Test (all frameworks including Python/Go)

```bash
cd testApps && node --test e2e-sdk.test.js
```

Tests Express, Fastify, Hono, Flask, FastAPI, Go, Agent Pull, and SDK+Agent coexistence.

## Publishing to npm

### Publish order (dependencies matter!)

1. `@simplehook/core` FIRST (all others depend on it)
2. Then all adapters in any order

### Publish all npm packages

```bash
./scripts/publish.sh npm
```

### Publish individual packages

```bash
./scripts/publish.sh core      # @simplehook/core
./scripts/publish.sh express   # @simplehook/express
./scripts/publish.sh fastify   # @simplehook/fastify
./scripts/publish.sh hono      # @simplehook/hono
./scripts/publish.sh cli       # @simplehook/cli
./scripts/publish.sh mastra    # @simplehook/mastra
./scripts/publish.sh playwright # @simplehook/playwright
```

### Publish Python packages

```bash
./scripts/publish.sh pip       # simplehook-flask + simplehook-django
./scripts/publish.sh flask     # simplehook-flask only
```

### Publish everything

```bash
./scripts/publish.sh all       # All packages (npm + pip)
```

## Package Versions

| Package | Current Version | npm |
|---------|----------------|-----|
| @simplehook/core | 0.2.0 | [npmjs.com](https://www.npmjs.com/package/@simplehook/core) |
| @simplehook/express | 0.3.1 | [npmjs.com](https://www.npmjs.com/package/@simplehook/express) |
| @simplehook/fastify | 0.3.0 | [npmjs.com](https://www.npmjs.com/package/@simplehook/fastify) |
| @simplehook/hono | 0.3.0 | [npmjs.com](https://www.npmjs.com/package/@simplehook/hono) |
| @simplehook/cli | 0.1.0 | [npmjs.com](https://www.npmjs.com/package/@simplehook/cli) |
| @simplehook/mastra | 0.1.0 | [npmjs.com](https://www.npmjs.com/package/@simplehook/mastra) |
| @simplehook/playwright | 0.1.0 | [npmjs.com](https://www.npmjs.com/package/@simplehook/playwright) |

## Test Apps

| App | Framework | Port | Uses real npm deps |
|-----|-----------|------|--------------------|
| testApps/express | Express | 3098 | @simplehook/express |
| testApps/fastify | Fastify | 3096 | @simplehook/fastify |
| testApps/hono | Hono | 3095 | @simplehook/hono |
| testApps/visualizer | Express | 3099 | @simplehook/express |
| testApps/mastra | Mastra | — | @simplehook/mastra (has `smoke-test.ts` for CI, `index.ts` for LLM demo) |
| testApps/playwright | Playwright | — | @simplehook/playwright (has `smoke-test.ts` for CI) |
| testApps/flask | Flask | 3097 | simplehook-flask (pip) |
| testApps/fastapi | FastAPI | 3094 | simplehook-fastapi (pip) |

## Updating Test Apps After SDK Changes

1. Bump version in the SDK's `package.json`
2. Publish: `./scripts/publish.sh <package>`
3. Update version in testApp's `package.json`
4. `cd testApps/<app> && rm -rf node_modules package-lock.json && npm install`
5. Run: `cd testApps && ./test-all.sh`

## Production E2E Test (against live server)

```bash
cd tests
source .env.local
SIMPLEHOOK_KEY=$SIMPLEHOOK_KEY \
SIMPLEHOOK_PROJECT_ID=$SIMPLEHOOK_PROJECT_ID \
SIMPLEHOOK_BASE_URL=$SIMPLEHOOK_BASE_URL \
node --test agent-prod.test.js
```

11 tests against `hook.simplehook.dev`: webhook ingestion, pull, cursor, path filter, wait, timeout, SSE stream, auth rejection, conflict (409), status.

Credentials in `tests/.env.local`:
- `SIMPLEHOOK_BASE_URL=https://hook.simplehook.dev`
- `SIMPLEHOOK_KEY=ak_...`
- `SIMPLEHOOK_PROJECT_ID=p_...`

## Full Release Checklist

1. Bump version in SDK `package.json`
2. Run local tests: `cd testApps && ./test-all.sh`
3. Publish: `./scripts/publish.sh <package>` (core first!)
4. Update testApp deps + reinstall from npm
5. Re-run: `cd testApps && ./test-all.sh` (verifies real npm packages)
6. Deploy server: `flyctl deploy -a simplehook-server`
7. Run prod tests: `cd tests && source .env.local && node --test agent-prod.test.js`
8. Deploy webapp: push to main (Vercel auto-deploys)

## Not Actively Maintained

Go SDK (`go/`) and Rust SDK (`rust-sdk/`) exist but are not actively maintained or tested.
