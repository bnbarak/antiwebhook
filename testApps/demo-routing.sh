#!/bin/bash
# Demo: targeted routing with 3 named listeners
# Run: cd testApps && ./demo-routing.sh
# Then test with curl commands printed at the end.
# Press Ctrl+C to stop everything.

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_BIN="$ROOT/server/target/debug/simplehook-server"
SERVER_PORT=8460
PIDS=()

# Kill any leftover processes from previous runs
lsof -ti:$SERVER_PORT,3091,3092,3093 2>/dev/null | xargs kill -9 2>/dev/null || true
sleep 1

cleanup() {
  echo ""
  echo "Stopping all processes..."
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null; done
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT

# Start server
export DATABASE_URL="postgres://admin:secret@localhost:5434/simplehook"
export PORT="$SERVER_PORT"
export BASE_URL="http://localhost:$SERVER_PORT"
export FRONTEND_URL="http://localhost:4000"
export RUST_LOG="warn"

echo "Starting server on :$SERVER_PORT..."
$SERVER_BIN &
PIDS+=($!)
sleep 2

# Use existing project or register new one
if [ -n "$SIMPLEHOOK_KEY" ] && [ -n "$SIMPLEHOOK_PROJECT_ID" ]; then
  API_KEY="$SIMPLEHOOK_KEY"
  PROJECT_ID="$SIMPLEHOOK_PROJECT_ID"
  echo "Using existing project: $PROJECT_ID"
else
  REGISTER=$(curl -s -X POST "http://localhost:$SERVER_PORT/api/register" \
    -H 'Content-Type: application/json' -d '{"name":"demo-routing"}')
  PROJECT_ID=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['project_id'])")
  API_KEY=$(echo "$REGISTER" | python3 -c "import sys,json; print(json.load(sys.stdin)['api_key'])")
  echo "Registered project: $PROJECT_ID"
fi
echo "Key: $API_KEY"
echo ""

# Connect 3 named listeners
cd "$ROOT/testApps/express"

echo "Connecting barak..."
SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_URL="ws://localhost:$SERVER_PORT" SIMPLEHOOK_LISTENER="barak" PORT=3091 node index.js &
PIDS+=($!)

echo "Connecting alice..."
SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_URL="ws://localhost:$SERVER_PORT" SIMPLEHOOK_LISTENER="alice" PORT=3092 node index.js &
PIDS+=($!)

echo "Connecting bob..."
SIMPLEHOOK_KEY="$API_KEY" SIMPLEHOOK_URL="ws://localhost:$SERVER_PORT" SIMPLEHOOK_LISTENER="bob" PORT=3093 node index.js &
PIDS+=($!)

sleep 3

echo ""
echo "=== Connected Listeners ==="
curl -s -H "Authorization: Bearer $API_KEY" "http://localhost:$SERVER_PORT/api/listeners" | python3 -c "
import sys,json
try:
    data = json.load(sys.stdin)
    if isinstance(data, list):
        for l in data:
            s='CONNECTED' if l.get('connected') else 'disconnected'
            print(f'  {l[\"listener_id\"]:12} {s}')
    else:
        print(f'  (unexpected response: {data})')
except Exception as e:
    print(f'  (error: {e})')
"

echo ""
echo "=== Test Commands ==="
echo ""
echo "# Send to anyone (no route targeting):"
echo "curl -X POST http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/test/hello -H 'Content-Type: application/json' -d '{\"msg\":\"hello\"}'"
echo ""
echo "# Create targeted routes:"
echo "curl -X POST http://localhost:$SERVER_PORT/api/routes -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"path_prefix\":\"/stripe\",\"mode\":\"queue\",\"listener_id\":\"barak\"}'"
echo "curl -X POST http://localhost:$SERVER_PORT/api/routes -H 'Authorization: Bearer $API_KEY' -H 'Content-Type: application/json' -d '{\"path_prefix\":\"/github\",\"mode\":\"queue\",\"listener_id\":\"alice\"}'"
echo ""
echo "# Then send webhooks:"
echo "curl -X POST http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/stripe/charge -H 'Content-Type: application/json' -d '{\"type\":\"charge.succeeded\"}'"
echo "curl -X POST http://localhost:$SERVER_PORT/hooks/$PROJECT_ID/github/push -H 'Content-Type: application/json' -d '{\"ref\":\"main\"}'"
echo ""
echo "=== Waiting... press Ctrl+C to stop ==="
wait
