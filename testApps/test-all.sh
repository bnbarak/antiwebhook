#!/bin/bash
#
# test-all.sh — Run all simplehook test apps against a local server + boom.js
#
# Prerequisites:
#   docker compose up -d   (Postgres on port 5434)
#   cd server && cargo build
#
# Usage:
#   cd testApps && ./test-all.sh
#
# What it does:
#   1. Starts the Rust server on a dedicated port
#   2. Registers a project (gets API key + project ID)
#   3. Starts each test app (Express, Fastify, Hono, Visualizer)
#   4. Fires webhooks via boom.js
#   5. Verifies each app received webhooks via stdout
#   6. Tests CLI pull + status commands
#   7. Tests Agent pull API directly
#   8. Cleans up all processes
#
set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_BIN="$ROOT/server/target/debug/simplehook-server"
SERVER_PORT=8413
DB_URL="postgres://admin:secret@localhost:5434/simplehook"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
PIDS=()

cleanup() {
  echo ""
  echo -e "${DIM}Cleaning up...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo -e "${DIM}Done.${NC}"
}
trap cleanup EXIT

log_pass() { PASS=$((PASS + 1)); echo -e "  ${GREEN}✓${NC} $1"; }
log_fail() { FAIL=$((FAIL + 1)); echo -e "  ${RED}✗${NC} $1"; }
log_skip() { SKIP=$((SKIP + 1)); echo -e "  ${YELLOW}⊘${NC} $1 (skipped)"; }
log_section() { echo ""; echo -e "${BOLD}$1${NC}"; }

wait_for_port() {
  local port=$1 max=${2:-30}
  for i in $(seq 1 $max); do
    if curl -s "http://localhost:$port/health" > /dev/null 2>&1; then return 0; fi
    sleep 0.5
  done
  return 1
}

wait_for_log() {
  local file=$1 pattern=$2 timeout=${3:-10}
  for i in $(seq 1 $((timeout * 2))); do
    if grep -q "$pattern" "$file" 2>/dev/null; then return 0; fi
    sleep 0.5
  done
  return 1
}

# ── 1. Start server ──────────────────────────────────────────────────

log_section "Starting server on :$SERVER_PORT"

if [ ! -f "$SERVER_BIN" ]; then
  echo -e "${RED}Server binary not found. Run: cd server && cargo build${NC}"
  exit 1
fi

export DATABASE_URL="$DB_URL"
export PORT="$SERVER_PORT"
export BASE_URL="http://localhost:$SERVER_PORT"
export FRONTEND_URL="http://localhost:4000"
export RUST_LOG="warn"

$SERVER_BIN > /tmp/sh-test-server.log 2>&1 &
PIDS+=($!)

if wait_for_port $SERVER_PORT; then
  log_pass "Server started on :$SERVER_PORT"
else
  log_fail "Server failed to start"
  cat /tmp/sh-test-server.log | tail -20
  exit 1
fi

# ── 2. Register project ──────────────────────────────────────────────

log_section "Registering test project"

REGISTER=$(curl -s -X POST "http://localhost:$SERVER_PORT/api/register" \
  -H 'Content-Type: application/json' \
  -d '{"name":"test-all-runner"}')

PROJECT_ID=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['project_id'])" 2>/dev/null)
API_KEY=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['api_key'])" 2>/dev/null)

if [ -n "$PROJECT_ID" ] && [ -n "$API_KEY" ]; then
  log_pass "Project: $PROJECT_ID"
  echo -e "  ${DIM}API Key: ${API_KEY:0:12}...${NC}"
else
  log_fail "Registration failed: $REGISTER"
  exit 1
fi

# ── 3. Test Express app ──────────────────────────────────────────────

log_section "Testing @simplehook/express"

cd "$ROOT/testApps/express"
SIMPLEHOOK_KEY="$API_KEY" \
SIMPLEHOOK_URL="ws://localhost:$SERVER_PORT" \
PORT=3098 \
node index.js > /tmp/sh-test-express.log 2>&1 &
PIDS+=($!)

if wait_for_log /tmp/sh-test-express.log "connected" 15; then
  log_pass "Express app connected"
else
  log_fail "Express app failed to connect"
fi

# Send a webhook
curl -s -X POST "http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/stripe/events" \
  -H 'Content-Type: application/json' \
  -d '{"type":"invoice.paid","amount":500}' > /dev/null

if wait_for_log /tmp/sh-test-express.log "stripe" 5; then
  log_pass "Express received Stripe webhook"
else
  log_fail "Express did not receive webhook"
fi

# ── 4. Test Fastify app ──────────────────────────────────────────────

log_section "Testing @simplehook/fastify"

cd "$ROOT/testApps/fastify"
SIMPLEHOOK_KEY="$API_KEY" \
SIMPLEHOOK_URL="ws://localhost:$SERVER_PORT" \
PORT=3096 \
node index.js > /tmp/sh-test-fastify.log 2>&1 &
PIDS+=($!)

if wait_for_log /tmp/sh-test-fastify.log "connected" 15; then
  log_pass "Fastify app connected"
else
  log_fail "Fastify app failed to connect"
fi

curl -s -X POST "http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/github/push" \
  -H 'Content-Type: application/json' \
  -d '{"ref":"refs/heads/main","commits":[{"id":"abc","message":"test"}]}' > /dev/null

if wait_for_log /tmp/sh-test-fastify.log "github" 5; then
  log_pass "Fastify received GitHub webhook"
else
  log_fail "Fastify did not receive webhook"
fi

# ── 5. Test Hono app ─────────────────────────────────────────────────

log_section "Testing @simplehook/hono"

cd "$ROOT/testApps/hono"
SIMPLEHOOK_KEY="$API_KEY" \
SIMPLEHOOK_URL="ws://localhost:$SERVER_PORT" \
PORT=3095 \
node index.js > /tmp/sh-test-hono.log 2>&1 &
PIDS+=($!)

if wait_for_log /tmp/sh-test-hono.log "connected" 15; then
  log_pass "Hono app connected"
else
  log_fail "Hono app failed to connect"
fi

curl -s -X POST "http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/twilio/sms" \
  -H 'Content-Type: application/json' \
  -d '{"MessageSid":"SM_test","Body":"Hello"}' > /dev/null

if wait_for_log /tmp/sh-test-hono.log "webhook" 5; then
  log_pass "Hono received Twilio webhook"
else
  log_fail "Hono did not receive webhook"
fi

# ── 6. Test Agent Pull API ────────────────────────────────────────────

log_section "Testing Agent Pull API"

# Send a webhook first
curl -s -X POST "http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/linear/issue" \
  -H 'Content-Type: application/json' \
  -d '{"action":"create","data":{"title":"Test","priority":1}}' > /dev/null

sleep 1

# Pull via API
PULL_RESULT=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:$SERVER_PORT/api/agent/pull?n=10&listener_id=test-runner")

EVENTS_COUNT=$(echo "$PULL_RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('events',[])))" 2>/dev/null)

if [ "$EVENTS_COUNT" -gt 0 ] 2>/dev/null; then
  log_pass "Agent pull returned $EVENTS_COUNT events"
else
  log_fail "Agent pull returned no events"
fi

# Status
STATUS_RESULT=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:$SERVER_PORT/api/agent/status")

if echo "$STATUS_RESULT" | grep -q "project_id"; then
  log_pass "Agent status returned project info"
else
  log_fail "Agent status failed"
fi

# ── 6b. Test @simplehook/mastra smoke test ────────────────────────────

log_section "Testing @simplehook/mastra (smoke)"

cd "$ROOT/testApps/mastra"

if [ -d node_modules/@simplehook/mastra ] && [ -x node_modules/.bin/tsx ]; then
  MASTRA_OUT=$(SIMPLEHOOK_KEY="$API_KEY" \
    SIMPLEHOOK_SERVER="http://localhost:$SERVER_PORT" \
    SIMPLEHOOK_PROJECT="$PROJECT_ID" \
    node_modules/.bin/tsx smoke-test.ts 2>&1)
  if echo "$MASTRA_OUT" | grep -q "^OK:"; then
    log_pass "Mastra tools pull + status work"
  else
    log_fail "Mastra smoke test failed"
    echo "$MASTRA_OUT" | sed 's/^/    /'
  fi
else
  log_skip "Mastra deps not installed (cd testApps/mastra && npm install)"
fi

# ── 6c. Test @simplehook/playwright smoke test ───────────────────────

log_section "Testing @simplehook/playwright (smoke)"

cd "$ROOT/testApps/playwright"

if [ -d node_modules/@simplehook/playwright ] && [ -x node_modules/.bin/tsx ]; then
  PW_OUT=$(SIMPLEHOOK_KEY="$API_KEY" \
    SIMPLEHOOK_SERVER="http://localhost:$SERVER_PORT" \
    SIMPLEHOOK_PROJECT="$PROJECT_ID" \
    node_modules/.bin/tsx smoke-test.ts 2>&1)
  if echo "$PW_OUT" | grep -q "^OK:"; then
    log_pass "Playwright provider pull + filter + delete + reset work"
  else
    log_fail "Playwright smoke test failed"
    echo "$PW_OUT" | sed 's/^/    /'
  fi
else
  log_skip "Playwright deps not installed (cd testApps/playwright && npm install)"
fi

# ── 7. Test CLI ───────────────────────────────────────────────────────

log_section "Testing @simplehook/cli"

CLI_BIN="$ROOT/javascript/sdk/cli/dist/cli.js"

if [ -f "$CLI_BIN" ]; then
  CLI_STATUS=$(SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_SERVER="http://localhost:$SERVER_PORT" \
    node "$CLI_BIN" status --json 2>&1)

  if echo "$CLI_STATUS" | grep -q "project_id"; then
    log_pass "CLI status command works"
  else
    log_fail "CLI status command failed"
  fi

  CLI_PULL=$(SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_SERVER="http://localhost:$SERVER_PORT" \
    node "$CLI_BIN" pull -n 1 --listener-id cli-test 2>&1)

  if echo "$CLI_PULL" | grep -q -E "path|events|No events"; then
    log_pass "CLI pull command works"
  else
    log_fail "CLI pull command failed"
  fi

  # Test CLI routes commands
  CLI_ROUTES=$(SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_SERVER="http://localhost:$SERVER_PORT" \
    node "$CLI_BIN" routes 2>&1)

  if echo "$CLI_ROUTES" | grep -q -E "PATH|No routes"; then
    log_pass "CLI routes list works"
  else
    log_fail "CLI routes list failed"
  fi

  # Test CLI listeners commands
  CLI_LISTENERS=$(SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_SERVER="http://localhost:$SERVER_PORT" \
    node "$CLI_BIN" listeners 2>&1)

  if echo "$CLI_LISTENERS" | grep -q -E "ID|No listeners"; then
    log_pass "CLI listeners list works"
  else
    log_fail "CLI listeners list failed"
  fi
else
  log_skip "CLI not built (run: cd javascript/sdk/cli && npx tsc)"
fi

# ── 8. Targeted routing ───────────────────────────────────────────────

log_section "Testing targeted routing"

# Create a listener named "test-target"
curl -s -X POST "http://localhost:$SERVER_PORT/api/listeners" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"listener_id":"test-target"}' > /dev/null 2>&1

# Create a route targeting that listener
ROUTE_RES=$(curl -s -X POST "http://localhost:$SERVER_PORT/api/routes" \
  -H "Authorization: Bearer $API_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"path_prefix":"/targeted","mode":"queue","listener_id":"test-target"}')

if echo "$ROUTE_RES" | grep -q "test-target"; then
  log_pass "Created targeted route → test-target"
else
  log_fail "Failed to create targeted route"
fi

# Send webhook to the targeted path
curl -s -X POST "http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/targeted/webhook" \
  -H 'Content-Type: application/json' \
  -d '{"type":"targeted.test"}' > /dev/null

sleep 1

# Pull as the target listener — should get the event
TARGET_PULL=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:$SERVER_PORT/api/agent/pull?n=10&listener_id=test-target")

if echo "$TARGET_PULL" | grep -q "targeted.test"; then
  log_pass "Targeted listener received event"
else
  log_fail "Targeted listener did not receive event"
fi

# Verify the event has the correct listener_id stored
EVENTS_RES=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:$SERVER_PORT/api/events?path=/targeted/webhook")

if echo "$EVENTS_RES" | grep -q '"listener_id":"test-target"'; then
  log_pass "Event stored with correct listener_id"
else
  # Check if the event data structure uses a different format
  if echo "$EVENTS_RES" | grep -q "test-target"; then
    log_pass "Event stored with correct listener_id"
  else
    log_fail "Event not tagged with target listener_id"
  fi
fi

# ── 9. Delivery signatures ────────────────────────────────────────────

log_section "Testing delivery signatures"

# Pull an event and check for signature fields
SIG_PULL=$(curl -s -H "Authorization: Bearer $API_KEY" \
  "http://localhost:$SERVER_PORT/api/agent/pull?n=1&listener_id=sig-test")

if echo "$SIG_PULL" | grep -q "webhook_signature"; then
  log_pass "Agent pull includes webhook_signature"
else
  log_fail "Agent pull missing webhook_signature"
fi

if echo "$SIG_PULL" | grep -q "webhook_id"; then
  log_pass "Agent pull includes webhook_id"
else
  log_fail "Agent pull missing webhook_id"
fi

# ── 10. Boom test (small batch) ───────────────────────────────────────

log_section "Testing boom.js (50 webhooks)"

cd "$ROOT/testApps"
BOOM_OUTPUT=$(node -e "
  const TOTAL = 50, CONCURRENCY = 10;
  const providers = [
    { path: '/stripe/checkout', body: (i) => ({ type: 'checkout.session.completed', id: 'cs_'+i }) },
    { path: '/github/push', body: (i) => ({ ref: 'refs/heads/main', commits: [{ id: 'sha_'+i }] }) },
    { path: '/custom/alert', body: (i) => ({ level: 'info', message: 'Alert '+i }) },
  ];
  let ok = 0, fail = 0;
  async function send(i) {
    const p = providers[i % providers.length];
    try {
      const r = await fetch('http://localhost:$SERVER_PORT/hooks/$PROJECT_ID'+p.path, {
        method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(p.body(i))
      });
      if (r.status < 300) ok++; else fail++;
    } catch { fail++; }
  }
  async function run() {
    for (let i = 0; i < TOTAL; i += CONCURRENCY) {
      await Promise.all(Array.from({length: Math.min(CONCURRENCY, TOTAL-i)}, (_,j) => send(i+j)));
    }
    console.log(JSON.stringify({ok, fail, total: TOTAL}));
  }
  run();
" 2>&1)

BOOM_OK=$(echo "$BOOM_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['ok'])" 2>/dev/null)
BOOM_FAIL=$(echo "$BOOM_OUTPUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['fail'])" 2>/dev/null)

if [ "$BOOM_OK" = "50" ] 2>/dev/null; then
  log_pass "Boom: $BOOM_OK/50 webhooks delivered"
else
  log_fail "Boom: $BOOM_OK ok, $BOOM_FAIL failed (expected 50 ok)"
fi

# ── 9. Webapp build ───────────────────────────────────────────────────

log_section "Testing webapp build"

cd "$ROOT/javascript/webapp"
if npm run build > /tmp/sh-test-webapp.log 2>&1; then
  log_pass "Webapp builds successfully"

  # Check MPA output
  if [ -f dist/index.html ] && [ -f dist/docs.html ] && [ -f dist/app.html ]; then
    log_pass "MPA: 3 HTML entry points"
  else
    log_fail "MPA: missing HTML entry points"
  fi

  if [ -f dist/robots.txt ] && [ -f dist/sitemap.xml ] && [ -f dist/llm.txt ]; then
    log_pass "SEO: robots.txt + sitemap.xml + llm.txt"
  else
    log_fail "SEO: missing static files"
  fi
else
  log_fail "Webapp build failed"
fi

# ── Summary ───────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}Results:${NC} ${GREEN}$PASS passed${NC} | ${RED}$FAIL failed${NC} | ${YELLOW}$SKIP skipped${NC}"
echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
