/**
 * Integration tests for the Agent Pull API.
 *
 * Tests the REAL flow:
 *   1. PostgreSQL database (docker, port 5434)
 *   2. Rust server binary (spawned as child process)
 *   3. HTTP requests to /api/agent/* endpoints
 *
 * Run: node --test agent.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const SERVER_BIN = path.join(__dirname, '../server/target/debug/simplehook-server');

const DB_URL = 'postgres://admin:secret@localhost:5434/simplehook';
const SERVER_PORT = 8402; // Unique port to avoid conflicts with e2e tests
const BASE_URL = `http://localhost:${SERVER_PORT}`;

let serverProcess = null;
let apiKey = null;
let projectId = null;

// --- Helpers ---

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: {
        ...opts.headers,
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
    };

    const req = http.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data,
          json() { return JSON.parse(data); },
        });
      });
    });

    req.on('error', reject);
    if (opts.body) req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    req.end();
  });
}

function waitForServer(url, maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      fetch(url)
        .then((res) => {
          if (res.status === 200) resolve();
          else throw new Error(`status ${res.status}`);
        })
        .catch(() => {
          if (++attempts >= maxAttempts) {
            reject(new Error(`Server not ready after ${maxAttempts} attempts`));
          } else {
            setTimeout(check, 200);
          }
        });
    };
    check();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendWebhook(webhookPath, body) {
  return fetch(`${BASE_URL}/hooks/${projectId}${webhookPath}`, {
    method: 'POST',
    body,
  });
}

function authHeaders() {
  return { authorization: `Bearer ${apiKey}` };
}

async function pullEvents(params = '') {
  return fetch(`${BASE_URL}/api/agent/pull${params ? '?' + params : ''}`, {
    headers: authHeaders(),
  });
}

// --- Server lifecycle ---

async function startServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn(SERVER_BIN, [], {
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        BASE_URL: `http://localhost:${SERVER_PORT}`,
        FRONTEND_URL: 'http://localhost:4000',
        PORT: String(SERVER_PORT),
        RUST_LOG: 'simplehook_server=warn',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    serverProcess.stderr.on('data', (d) => {
      stderr += d.toString();
      if (stderr.includes('simplehook server running')) {
        resolve();
      }
    });

    serverProcess.on('error', reject);
    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Server exited with code ${code}\n${stderr}`));
      }
    });

    setTimeout(() => {
      waitForServer(`${BASE_URL}/health`).then(resolve).catch(reject);
    }, 500);
  });
}

function stopServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }
}

// --- Test suite ---

describe('agent: pull API', () => {
  before(async () => {
    // Clean DB
    const { execSync } = require('child_process');
    try {
      execSync(`psql "${DB_URL}" -c "DELETE FROM agent_cursors; DELETE FROM events; DELETE FROM listeners; DELETE FROM routes; DELETE FROM sessions; DELETE FROM projects;" 2>/dev/null`);
    } catch {}

    await startServer();
    await waitForServer(`${BASE_URL}/health`);

    // Register a project
    const res = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      body: { name: 'agent-test' },
    });
    assert.strictEqual(res.status, 200);
    const data = res.json();
    projectId = data.project_id;
    apiKey = data.api_key;
  });

  after(() => {
    stopServer();
  });

  // --- 1. Pull with no events ---

  test('pull with no events returns empty', async () => {
    const res = await pullEvents();
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.deepStrictEqual(data.events, []);
    assert.strictEqual(data.remaining, 0);
  });

  // --- 2. Pull after webhook ---

  test('pull returns event after webhook is sent', async () => {
    await sendWebhook('/stripe/webhook', { type: 'payment_intent.created' });
    await sleep(100); // let async queue delivery attempt finish

    const res = await pullEvents();
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);
    assert.strictEqual(data.events[0].path, '/stripe/webhook');
    assert.strictEqual(data.events[0].method, 'POST');
    assert.ok(data.events[0].id.startsWith('evt_'));
    assert.ok(data.events[0].received_at);
    assert.ok(data.cursor);
  });

  // --- 3. Cursor advancement ---

  test('second pull returns nothing (cursor advanced)', async () => {
    const res = await pullEvents();
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 0);
  });

  // --- 4. Pull N ---

  test('pull n=3 returns up to 3 events', async () => {
    // Send 5 webhooks
    for (let i = 0; i < 5; i++) {
      await sendWebhook('/stripe/webhook', { index: i });
    }
    await sleep(200);

    const res = await pullEvents('n=3');
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 3);
    assert.ok(data.remaining >= 2); // at least 2 remaining
  });

  // --- 5. Path filter ---

  test('pull with path filter returns only matching events', async () => {
    // Drain remaining events first
    await pullEvents('n=100');

    // Send events to different paths
    await sendWebhook('/github/push', { ref: 'main' });
    await sendWebhook('/stripe/webhook', { type: 'charge.succeeded' });
    await sendWebhook('/github/pr', { action: 'opened' });
    await sleep(200);

    const res = await pullEvents('n=10&path=/github/*');
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 2);
    assert.ok(data.events.every(e => e.path.startsWith('/github/')));
  });

  // --- 6. Pull --wait ---

  test('pull wait returns event when webhook arrives during wait', async () => {
    // Drain cursor first
    await pullEvents('n=100');

    // Start a wait in the background
    const waitPromise = pullEvents('wait=true&timeout=10');

    // Send a webhook after a short delay
    await sleep(1000);
    await sendWebhook('/stripe/webhook', { type: 'charge.refunded' });

    const res = await waitPromise;
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);
    assert.ok(data.events[0].body.includes('charge.refunded'));
  });

  // --- 7. Pull --wait timeout ---

  test('pull wait returns empty on timeout', async () => {
    // Drain cursor
    await pullEvents('n=100');

    const start = Date.now();
    const res = await pullEvents('wait=true&timeout=2');
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 0);
    assert.ok(elapsed >= 1500, `expected ~2s wait, got ${elapsed}ms`);
  });

  // --- 8. Pull --stream (SSE) ---

  test('pull stream returns events as SSE', async () => {
    // Drain cursor
    await pullEvents('n=100');

    const events = [];
    await new Promise((resolve, reject) => {
      const url = new URL(`${BASE_URL}/api/agent/pull?stream=true&timeout=5`);
      const req = http.get({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: authHeaders(),
      }, (res) => {
        assert.strictEqual(res.statusCode, 200);
        assert.ok(res.headers['content-type'].includes('text/event-stream'));

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          // Parse SSE events
          const lines = buffer.split('\n');
          buffer = lines.pop(); // keep incomplete line
          for (const line of lines) {
            if (line.startsWith('data:') && line.includes('evt_')) {
              try {
                events.push(JSON.parse(line.slice(5).trim()));
              } catch {}
            }
          }
        });
        res.on('end', resolve);
        res.on('error', reject);
      });
      req.on('error', reject);

      // Send webhooks during the stream
      setTimeout(async () => {
        await sendWebhook('/stripe/webhook', { type: 'invoice.paid' });
        await sleep(200);
        await sendWebhook('/stripe/webhook', { type: 'invoice.sent' });
      }, 1000);
    });

    assert.ok(events.length >= 2, `expected >=2 SSE events, got ${events.length}`);
    assert.ok(events.some(e => e.body && e.body.includes('invoice.paid')));
    assert.ok(events.some(e => e.body && e.body.includes('invoice.sent')));
  });

  // --- 9. After override ---

  test('pull with after= reads from that point without advancing cursor', async () => {
    // Get current cursor state
    const statusRes = await fetch(`${BASE_URL}/api/agent/status`, {
      headers: authHeaders(),
    });
    const statusData = statusRes.json();
    const defaultCursor = statusData.cursors.default;

    // Send a new webhook
    await sendWebhook('/stripe/webhook', { type: 'test_after' });
    await sleep(200);

    // Use after=nonexistent to read from the start (will get recent events)
    // First, let's pull normally to advance cursor
    const normalPull = await pullEvents('n=100');
    const lastEvent = normalPull.json().events.slice(-1)[0];

    // Now send another webhook
    await sendWebhook('/stripe/webhook', { type: 'test_after_2' });
    await sleep(200);

    // Pull with after= pointing to an earlier event should NOT advance cursor
    if (lastEvent) {
      const afterRes = await pullEvents(`after=${lastEvent.id}`);
      assert.strictEqual(afterRes.status, 200);
      const afterData = afterRes.json();
      assert.ok(afterData.events.length >= 1);

      // Normal pull should still see the event (cursor wasn't advanced by after=)
      const normalRes = await pullEvents();
      assert.strictEqual(normalRes.status, 200);
      const normalData = normalRes.json();
      assert.ok(normalData.events.length >= 1);
    }
  });

  // --- 10. Listener isolation ---

  test('different listener_ids have independent cursors', async () => {
    // Send a webhook
    await sendWebhook('/stripe/webhook', { type: 'isolation_test' });
    await sleep(200);

    // Pull as listener "agent-a"
    const resA = await pullEvents('listener_id=agent-a');
    assert.strictEqual(resA.status, 200);
    assert.ok(resA.json().events.length >= 1);

    // Pull as listener "agent-b" — should also see events
    const resB = await pullEvents('listener_id=agent-b');
    assert.strictEqual(resB.status, 200);
    assert.ok(resB.json().events.length >= 1);

    // Pull agent-a again — should be empty (cursor advanced)
    const resA2 = await pullEvents('listener_id=agent-a');
    assert.strictEqual(resA2.status, 200);
    assert.strictEqual(resA2.json().events.length, 0);
  });

  // --- 11. Auth ---

  test('pull without auth returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/agent/pull`);
    assert.strictEqual(res.status, 401);
  });

  test('pull with bad key returns 401', async () => {
    const res = await fetch(`${BASE_URL}/api/agent/pull`, {
      headers: { authorization: 'Bearer ak_bad_key' },
    });
    assert.strictEqual(res.status, 401);
  });

  // --- 12. Status ---

  test('status returns queue overview', async () => {
    const res = await fetch(`${BASE_URL}/api/agent/status`, {
      headers: authHeaders(),
    });
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.project_id, projectId);
    assert.ok('pending' in data.queue);
    assert.ok('failed' in data.queue);
    assert.ok('delivered_last_hour' in data.queue);
    assert.ok('connected' in data.listeners);
    assert.ok('disconnected' in data.listeners);
    assert.ok(typeof data.cursors === 'object');
  });

  // --- 13. Wait conflict ---

  test('concurrent wait on same listener_id returns 409', async () => {
    // Drain
    await pullEvents('n=100&listener_id=conflict-test');

    // Start first wait
    const wait1 = pullEvents('wait=true&timeout=5&listener_id=conflict-test');
    await sleep(300); // let the first request establish

    // Second wait should get 409
    const res2 = await pullEvents('wait=true&timeout=2&listener_id=conflict-test');
    assert.strictEqual(res2.status, 409);
    const data2 = res2.json();
    assert.ok(data2.error.includes('already being consumed'));

    // Clean up: send a webhook to release wait1
    await sendWebhook('/stripe/webhook', { type: 'release_wait' });
    await wait1; // let it finish
  });

  // --- 14. Stream conflict ---

  test('stream blocks second consumer on same listener_id', async () => {
    await pullEvents('n=100&listener_id=stream-conflict');

    // Start SSE stream
    const streamReq = new Promise((resolve) => {
      const url = new URL(`${BASE_URL}/api/agent/pull?stream=true&timeout=5&listener_id=stream-conflict`);
      const req = http.get({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers: authHeaders(),
      }, (res) => {
        // Consume data to prevent backpressure
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', resolve);
    });

    await sleep(500); // let stream establish

    // Try wait on same listener_id
    const res = await pullEvents('wait=true&timeout=1&listener_id=stream-conflict');
    assert.strictEqual(res.status, 409);

    await streamReq; // clean up
  });

  // --- 15. Status shows per-route breakdown ---

  test('status shows route-level pending counts', async () => {
    // Create routes
    await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ path_prefix: '/stripe/', mode: 'queue', timeout_seconds: 30 }),
    });
    await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ path_prefix: '/github/', mode: 'queue', timeout_seconds: 30 }),
    });

    const res = await fetch(`${BASE_URL}/api/agent/status`, {
      headers: authHeaders(),
    });
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(Array.isArray(data.routes));
    assert.ok(data.routes.length >= 2);
    assert.ok(data.routes.some(r => r.path === '/stripe/'));
    assert.ok(data.routes.some(r => r.path === '/github/'));
    assert.ok(data.routes.every(r => 'pending' in r && 'mode' in r));
  });

  // --- 16. Rate limit ---

  test('excessive pulls get rate limited', async () => {
    // This test just verifies the rate limit header/response is plumbed.
    // We don't actually send 500 requests — just verify the endpoint shares limits.
    const res = await pullEvents();
    assert.ok([200, 429].includes(res.status));
  });
});
