# PRD: Agent Pull API

**Status:** Draft
**Date:** 2026-04-06

---

## Problem

AI agents need webhook data but operate in request/response cycles. They can't hold WebSocket connections open like our SDKs do. Today, the only way to consume webhooks is through the SDK tunnel — which requires a persistent process.

Agents need to:
1. Pull recent events on demand (batch processing)
2. Wait for the next matching event (reactive workflows)
3. Stream events as they arrive (always-on listeners)

---

## Solution

One new endpoint: **`pull`**. Three behaviors controlled by params: instant return, long-poll, and SSE stream. Plus a **`status`** endpoint for queue visibility.

No MCP. No re-enqueue. The API is the product. A Skill/CLI wraps it for developer UX.

---

## Architecture

```
┌─────────────────────────────────────┐
│  Skill / CLI                        │  "simplehook pull -n 5"
├─────────────────────────────────────┤
│  REST API  (/api/agent/pull, /status)│  Universal, any HTTP client
├─────────────────────────────────────┤
│  Server: cursor per listener_id     │  New table: agent_cursors
│  Events table (existing)            │  Existing infra, unchanged
└─────────────────────────────────────┘
```

**Single source of truth:** All logic lives in the Rust server. The Skill/CLI is a stateless HTTP client that calls the API and formats output. Zero business logic in the CLI layer.

---

## API

### `GET /api/agent/pull`

Pull the next N events the caller hasn't seen.

**Auth:** `Authorization: Bearer ak_xxx` (existing api_key)

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `listener_id` | string | `"default"` | Identifies this consumer. Cursor tracked per listener_id. |
| `n` | int | `1` | Max events to return (1-100) |
| `path` | string | none | Glob filter on event path (e.g. `/stripe/*`). Agent must request the path — no automatic filtering. |
| `wait` | bool | `false` | Long-poll: hold connection until an event arrives or timeout |
| `stream` | bool | `false` | SSE: keep connection open, push events as they arrive |
| `timeout` | int | `30` | Seconds to wait before returning empty (for wait/stream modes) |
| `after` | string | none | Override cursor: return events after this event ID. Escape hatch for re-reading. |

**Behavior matrix:**

| `wait` | `stream` | Behavior |
|--------|----------|----------|
| false | false | Return immediately. Empty array if nothing new. |
| true | false | Hold until >=1 event matches or timeout. Single response. |
| false | true | SSE stream. Push events as they arrive. Connection stays open until timeout or client disconnect. |

**Response (instant / long-poll):**

```json
{
  "events": [
    {
      "id": "evt_043",
      "path": "/stripe/webhook",
      "method": "POST",
      "headers": { "stripe-signature": "t=1712..." },
      "body": "{ \"type\": \"checkout.session.completed\" }",
      "status": "delivered",
      "received_at": "2026-04-06T14:02:31Z"
    }
  ],
  "cursor": "evt_043",
  "remaining": 7
}
```

**Response (SSE stream):**

```
event: webhook
data: {"id":"evt_043","path":"/stripe/webhook","method":"POST","headers":{...},"body":"...","received_at":"..."}

event: webhook
data: {"id":"evt_044","path":"/stripe/webhook","method":"POST","headers":{...},"body":"...","received_at":"..."}

event: heartbeat
data: {}
```

**Cursor advancement:** Pulling advances the server-side cursor for this `listener_id`. The `after` param overrides but does NOT update the stored cursor (it's a read-only peek).

### `GET /api/agent/status`

Queue health and consumer state.

**Auth:** `Authorization: Bearer ak_xxx`

**Response:**

```json
{
  "project_id": "p_abc123",
  "queue": {
    "pending": 12,
    "failed": 3,
    "delivered_last_hour": 847,
    "oldest_pending": "2026-04-06T10:23:00Z"
  },
  "listeners": {
    "connected": ["default", "staging"],
    "disconnected": ["ci-agent"]
  },
  "cursors": {
    "default": { "last_event": "evt_043", "behind": 7 },
    "ci-agent": { "last_event": "evt_031", "behind": 19 }
  },
  "routes": [
    { "path": "/stripe/*", "mode": "queue", "pending": 8 },
    { "path": "/twilio/*", "mode": "passthrough", "pending": 0 }
  ]
}
```

---

## Skill / CLI

Thin wrapper over the API. Formats output for terminal/conversation. No business logic.

```
simplehook pull                        # next 1 event, instant
simplehook pull -n 5                   # next 5
simplehook pull --wait                 # block until next arrives
simplehook pull --wait --timeout 60    # block up to 60s
simplehook pull --stream               # SSE, print as they come
simplehook pull /stripe/*              # filter by path
simplehook pull /stripe/* --wait       # wait for matching event
simplehook status                      # queue overview
```

**Implementation:** Single file. Calls `/api/agent/pull` and `/api/agent/status` with the user's `api_key`. Parses JSON, pretty-prints tables/events. For `--stream`, reads SSE lines and prints each event as it arrives.

---

## Data Model

### New table: `agent_cursors`

```sql
CREATE TABLE agent_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(id),
    listener_id TEXT NOT NULL,        -- e.g. "default", "ci-agent"
    last_event_id TEXT,               -- last pulled event ID
    last_pulled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, listener_id)
);

CREATE INDEX idx_agent_cursors_lookup
    ON agent_cursors(project_id, listener_id);
```

**Cursor logic:**
- On `pull`: find cursor for (project_id, listener_id). Query events WHERE id > last_event_id, ordered by created_at ASC, LIMIT n. Update cursor to last returned event.
- If no cursor exists, create one. First pull returns the most recent event (not the entire history).
- `after` param queries from that point but does NOT update stored cursor.

### Existing tables (unchanged)

- `events` — already has all the fields needed. No schema changes.
- `listeners` — existing table for listener metadata. Cursors are separate because not all cursor consumers are WebSocket listeners.
- `routes` — existing route config. Path glob matching reuses the route matching logic already in `proxy.rs`.

---

## Design Decisions

### Path filtering is explicit

The agent must pass `path=/stripe/*` to filter. No automatic routing based on listener_id → route → path. Reason: agents may want events from multiple paths, or paths that don't have routes configured.

### Cursor storage is a new table

Not in the `listeners` table because:
- Not all pull consumers are WebSocket listeners
- A WebSocket listener and a pull consumer for the same listener_id are different cursors
- Clean separation of concerns

### Event retention uses existing TTL

The existing settings control how long events live. No new TTL logic. Slow pollers who fall behind the retention window lose events — the cursor simply finds nothing and returns empty.

### Same rate limits

Agent pull endpoints share the existing 500 req/min per-project rate limit. No separate limits.

### No ack, no re-enqueue

Pull advances the cursor. That's the only state change. If an agent wants to re-read, it uses `after=evt_xxx`. If a developer wants to replay an event to a WebSocket SDK, the existing `/api/events/:id/replay` endpoint handles that.

### No MCP

MCP tools are request/response — a worse version of `pull --wait`. Agents that want MCP-style discovery can read the API docs. The REST API is the universal interface.

---

## Code Organization (Single Source of Truth)

All logic in the Rust server. No duplication.

```
server/src/
├── agent.rs              # NEW: pull + status handlers
│   ├── pull_handler()    # GET /api/agent/pull — all three modes
│   ├── status_handler()  # GET /api/agent/status
│   ├── advance_cursor()  # Cursor read/write logic
│   └── path_glob_match() # Reuse from proxy.rs (extract to shared mod)
├── proxy.rs              # Existing: webhook receiver (unchanged)
├── tunnel.rs             # Existing: WebSocket tunnel (unchanged)
├── queue.rs              # Existing: retry worker (unchanged)
├── db.rs                 # Add: cursor CRUD queries
├── app.rs                # Add: mount /api/agent/* routes
└── ...

javascript/
├── sdk/express/          # Existing SDK (unchanged)
└── cli/                  # NEW: simplehook CLI
    ├── src/index.ts      # Single file. HTTP client → format → print.
    └── package.json
```

**Shared logic extraction:**
- `path_glob_match()` currently lives implicitly in proxy.rs route matching. Extract to a shared module so both `proxy.rs` and `agent.rs` use the same function.
- Event serialization (JSON response format) — one `impl` on the Event struct, used by both existing `/api/events` and new `/api/agent/pull`.

---

## Testing Strategy

Three layers, each with a clear purpose. No overlap.

### Unit Tests (Rust, `cargo test`)

Test the logic in isolation. No database, no HTTP, no processes.

| Test | What it validates |
|------|-------------------|
| `test_cursor_advance` | Cursor moves forward correctly on pull |
| `test_cursor_first_pull` | First pull with no cursor returns most recent event |
| `test_cursor_after_override` | `after=` param queries correctly without updating cursor |
| `test_path_glob_match` | `/stripe/*` matches `/stripe/webhook`, not `/github/push` |
| `test_path_glob_wildcard` | `/*` matches everything, empty path matches nothing |
| `test_pull_params_parsing` | Query string → PullParams struct (defaults, validation, bounds) |
| `test_pull_response_serialization` | Event → JSON response format (body encoding, header casing) |
| `test_remaining_count` | `remaining` field calculated correctly from cursor position |

**Location:** `server/src/agent.rs` (inline `#[cfg(test)]` module)

### Integration Tests (Node.js, `node --test`)

Test the API against a real database and real server. Same pattern as existing `e2e.test.js`.

| Test | What it validates |
|------|-------------------|
| `test_pull_empty` | Pull with no events returns `{ events: [], cursor: null, remaining: 0 }` |
| `test_pull_after_webhook` | Send webhook → pull → get that event with correct fields |
| `test_pull_advances_cursor` | Pull twice → second pull returns nothing (cursor advanced) |
| `test_pull_n` | Send 5 webhooks → `pull?n=3` → get 3, remaining=2 |
| `test_pull_path_filter` | Send to /stripe and /github → `pull?path=/stripe/*` → only stripe events |
| `test_pull_wait` | Start `pull?wait=true&timeout=5` → send webhook during wait → returns it |
| `test_pull_wait_timeout` | `pull?wait=true&timeout=2` with no events → returns empty after ~2s |
| `test_pull_stream` | `pull?stream=true` → send 3 webhooks → receive 3 SSE events |
| `test_pull_after_override` | Pull (advances cursor) → `pull?after=evt_000` → re-reads from start, cursor unchanged |
| `test_pull_listener_isolation` | Two listener_ids → each has independent cursor |
| `test_pull_auth` | No api_key → 401. Wrong key → 401. |
| `test_pull_rate_limit` | Exceeding 500/min → 429 |
| `test_status_response` | Status returns correct pending count, cursor positions, connected listeners |
| `test_status_per_route_breakdown` | Multiple routes → status shows pending per route |
| `test_pull_wait_conflict` | Two concurrent `pull?wait=true` on same listener_id → second gets 409 |
| `test_pull_stream_conflict` | `pull?stream=true` active → second `pull?wait=true` on same listener_id → 409 |

**Location:** `tests/agent.test.js` (new file, same harness as `e2e.test.js`)

### E2E Tests (Full stack with CLI)

Test the Skill/CLI → API → DB → response chain.

| Test | What it validates |
|------|-------------------|
| `test_cli_pull` | `simplehook pull` returns formatted event |
| `test_cli_pull_n` | `simplehook pull -n 3` returns 3 events, table format |
| `test_cli_pull_wait` | `simplehook pull --wait` blocks, returns when webhook arrives |
| `test_cli_pull_path` | `simplehook pull /stripe/*` filters correctly |
| `test_cli_pull_stream` | `simplehook pull --stream` prints events as SSE arrives |
| `test_cli_status` | `simplehook status` prints queue table |
| `test_cli_no_auth` | Missing api key → helpful error message |

**Location:** `tests/agent-cli.test.js` (new file)

### What is NOT tested redundantly

- Webhook ingestion, WebSocket tunnel, queue retry, billing, auth flows — covered by existing tests. Agent pull builds on events that already work.
- Path glob matching at the integration level — if the unit test passes and the shared function is used, it works. Integration tests cover "does filtering work via HTTP" but don't re-test every glob edge case.
- Event serialization at the integration level — unit tests cover format, integration tests verify it round-trips correctly through one happy path.

---

## Migration

### Database migration (013_agent_cursors.sql)

```sql
-- 013_agent_cursors.sql
CREATE TABLE agent_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(id),
    listener_id TEXT NOT NULL,
    last_event_id TEXT,
    last_pulled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, listener_id)
);

CREATE INDEX idx_agent_cursors_lookup
    ON agent_cursors(project_id, listener_id);
```

### No breaking changes

- All existing endpoints unchanged
- All existing SDKs unchanged
- WebSocket tunnel unchanged
- New endpoints are additive

---

## Billing

Agent pull uses the existing billing model. No new tier. The pull endpoints count against the same rate limits as webhook ingestion. If we later want to meter agent pulls separately, the `agent_cursors.last_pulled_at` gives us the data.

---

### One consumer per listener_id

Only one process can `pull` (or `pull --wait` / `pull --stream`) a given `listener_id` at a time. Same rule as the WebSocket tunnel: one connection per (project_id, listener_id) pair.

If a second caller tries to pull with a listener_id that's already in a `wait` or `stream` call, the server returns `409 Conflict`:

```json
{ "error": "listener_id 'ci-agent' is already being consumed" }
```

Instant pulls (no `wait`, no `stream`) don't hold a lock — they read the cursor, return events, and release. Only long-lived connections (wait/stream) hold the lock.

This keeps the model simple: one cursor, one consumer, no fan-out ambiguity.

---

## Open Questions (Deferred)

1. **Body-level filtering** — Should `pull` support filtering on event body content (e.g., Stripe event `type`)? Deferred: start with path filtering, add body filters if agents need it.
2. **Cursor expiry** — Should cursors be cleaned up if unused for N days? Probably yes, but can add later.

---

## Implementation Order

1. **Migration + cursor CRUD in db.rs** — table + basic read/write
2. **Extract path_glob_match to shared module** — from proxy.rs
3. **agent.rs: pull handler (instant mode only)** — simplest path, get tests passing
4. **agent.rs: status handler** — query aggregates
5. **agent.rs: pull --wait (long-poll)** — add tokio::select with timeout
6. **agent.rs: pull --stream (SSE)** — add SSE response type
7. **CLI: simplehook pull + status** — thin HTTP wrapper
8. **Integration tests** — full suite
9. **E2E tests** — CLI → API chain
