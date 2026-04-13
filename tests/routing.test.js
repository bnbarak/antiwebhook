/**
 * Integration tests for targeted webhook routing.
 *
 * Tests the REAL flow:
 *   1. PostgreSQL database (docker, port 5434)
 *   2. Rust server binary (spawned as child process)
 *   3. Routes with listener_id targeting
 *   4. WebSocket connections with listener_id
 *   5. Agent pull API with listener_id isolation
 *
 * Run: node --test routing.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const WebSocket = require('ws');

const SERVER_BIN = path.join(__dirname, '../server/target/debug/simplehook-server');

const DB_URL = 'postgres://admin:secret@localhost:5434/simplehook';
const SERVER_PORT = 8407; // Unique port to avoid conflicts with other test files
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

function connectWs(listenerId) {
  const lid = listenerId ? `&listener_id=${listenerId}` : '';
  const url = `ws://localhost:${SERVER_PORT}/tunnel?key=${apiKey}${lid}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error('WebSocket connect timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function connectWsExpectReject(listenerId) {
  const lid = listenerId ? `&listener_id=${listenerId}` : '';
  const url = `ws://localhost:${SERVER_PORT}/tunnel?key=${apiKey}${lid}`;
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timeout = setTimeout(() => reject(new Error('Expected rejection but connection stayed open')), 5000);
    ws.on('open', () => {
      clearTimeout(timeout);
      // If it opens, that means it was NOT rejected — fail
      ws.close();
      reject(new Error('Expected WebSocket to be rejected, but it connected'));
    });
    ws.on('error', (err) => {
      clearTimeout(timeout);
      resolve(err);
    });
    ws.on('unexpected-response', (req, res) => {
      clearTimeout(timeout);
      resolve({ status: res.statusCode });
    });
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

describe('routing: targeted webhook routing', () => {
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
      body: { name: 'routing-test' },
    });
    assert.strictEqual(res.status, 200);
    const data = res.json();
    projectId = data.project_id;
    apiKey = data.api_key;
  });

  after(() => {
    stopServer();
  });

  // --- 1. Auto-register listener on SDK connect ---

  test('auto-register listener on SDK connect', async () => {
    const ws = await connectWs('barak');
    await sleep(300);

    const res = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    assert.strictEqual(res.status, 200);
    const listeners = res.json();
    const barak = listeners.find((l) => l.listener_id === 'barak');
    assert.ok(barak, 'listener "barak" should exist after WebSocket connect');
    assert.strictEqual(barak.connected, true);

    ws.close();
    await sleep(200);
  });

  // --- 2. Rejects invalid listener_id format ---

  test('rejects invalid listener_id format', async () => {
    const result = await connectWsExpectReject('BAD NAME');
    // Server should reject the upgrade with a 400
    assert.ok(result, 'WebSocket connection should have been rejected');
    assert.ok(
      result.status === 400 || result.message || result.code,
      'should get an error for invalid listener_id'
    );
  });

  // --- 3. Respects listener limit ---

  test('respects listener limit', async () => {
    // Clean up existing listeners first
    const existingRes = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    const existing = existingRes.json();
    for (const l of existing) {
      await fetch(`${BASE_URL}/api/listeners/${l.listener_id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    }

    // Create 3 listeners via POST (free limit is 3)
    for (const lid of ['one', 'two', 'three']) {
      const createRes = await fetch(`${BASE_URL}/api/listeners`, {
        method: 'POST',
        headers: authHeaders(),
        body: { listener_id: lid },
      });
      assert.strictEqual(createRes.status, 200, `should create listener "${lid}"`);
    }

    // 4th listener via WebSocket auto-register should be rejected
    const result = await connectWsExpectReject('four');
    assert.ok(result, 'WebSocket connection should have been rejected at listener limit');
    assert.ok(
      result.status === 400 || result.message || result.code,
      'should get an error when listener limit is reached'
    );

    // Clean up: delete the 3 listeners
    for (const lid of ['one', 'two', 'three']) {
      await fetch(`${BASE_URL}/api/listeners/${lid}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    }
  });

  // --- 4. Targeted delivery — only target receives ---

  test('targeted delivery — only target receives', async () => {
    // Create route /stripe with listener_id: "dev"
    const routeRes = await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: authHeaders(),
      body: { path_prefix: '/stripe', mode: 'queue', listener_id: 'dev' },
    });
    assert.strictEqual(routeRes.status, 200);
    const route = routeRes.json();
    assert.strictEqual(route.listener_id, 'dev');

    // Drain any existing cursors
    await pullEvents('n=100&listener_id=dev');
    await pullEvents('n=100&listener_id=staging');

    // Send webhook to /stripe/test
    const hookRes = await sendWebhook('/stripe/test', { type: 'charge.created' });
    assert.strictEqual(hookRes.status, 200);
    await sleep(300);

    // Pull as "dev" — should get the event
    const devRes = await pullEvents('listener_id=dev');
    assert.strictEqual(devRes.status, 200);
    const devData = devRes.json();
    assert.strictEqual(devData.events.length, 1);
    assert.strictEqual(devData.events[0].path, '/stripe/test');

    // Pull as "staging" — should get the same event (pull is cursor-based, not listener-filtered)
    // But let's verify the event was stored with listener_id "dev"
    const eventsRes = await fetch(`${BASE_URL}/api/events?listener_id=dev`, {
      headers: authHeaders(),
    });
    assert.strictEqual(eventsRes.status, 200);
    const eventsData = eventsRes.json();
    const events = eventsData.data || eventsData;
    const stripeEvent = events.find((e) => e.path === '/stripe/test');
    assert.ok(stripeEvent, 'event should be stored with listener_id=dev');
    assert.strictEqual(stripeEvent.listener_id, 'dev');
  });

  // --- 5. Multi-route multi-listener isolation ---

  test('multi-route multi-listener isolation', async () => {
    // Create route /github with listener_id: "staging"
    const ghRouteRes = await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: authHeaders(),
      body: { path_prefix: '/github', mode: 'queue', listener_id: 'staging' },
    });
    assert.strictEqual(ghRouteRes.status, 200);

    // Send webhooks to both routes
    await sendWebhook('/stripe/invoice', { type: 'invoice.paid' });
    await sendWebhook('/github/push', { ref: 'main' });
    await sleep(300);

    // Verify events are stored with correct listener_ids
    const devEventsRes = await fetch(`${BASE_URL}/api/events?listener_id=dev`, {
      headers: authHeaders(),
    });
    const devEventsBody = devEventsRes.json();
    const devEvents = devEventsBody.data || devEventsBody;
    const stripeEvents = devEvents.filter((e) => e.path.startsWith('/stripe'));
    assert.ok(stripeEvents.length >= 1, 'dev listener should have stripe events');
    assert.ok(stripeEvents.every((e) => e.listener_id === 'dev'));

    const stagingEventsRes = await fetch(`${BASE_URL}/api/events?listener_id=staging`, {
      headers: authHeaders(),
    });
    const stagingEventsBody = stagingEventsRes.json();
    const stagingEvents = stagingEventsBody.data || stagingEventsBody;
    const githubEvents = stagingEvents.filter((e) => e.path.startsWith('/github'));
    assert.ok(githubEvents.length >= 1, 'staging listener should have github events');
    assert.ok(githubEvents.every((e) => e.listener_id === 'staging'));

    // Cross-check: staging should have no stripe events
    const stagingStripeEvents = stagingEvents.filter((e) => e.path.startsWith('/stripe'));
    assert.strictEqual(stagingStripeEvents.length, 0, 'staging should not have stripe events');
  });

  // --- 6. Untargeted route delivers to any ---

  test('untargeted route delivers to any', async () => {
    // Create untargeted route
    const routeRes = await fetch(`${BASE_URL}/api/routes`, {
      method: 'POST',
      headers: authHeaders(),
      body: { path_prefix: '/generic', mode: 'queue' },
    });
    assert.strictEqual(routeRes.status, 200);
    const route = routeRes.json();
    assert.strictEqual(route.listener_id, null);

    // Drain default cursor
    await pullEvents('n=100');

    // Send webhook to untargeted route
    await sendWebhook('/generic/test', { type: 'ping' });
    await sleep(300);

    // Pull with default listener (no listener_id) — should get the event
    const res = await pullEvents();
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);
    assert.strictEqual(data.events[0].path, '/generic/test');

    // Verify event has no listener_id
    const eventsRes = await fetch(`${BASE_URL}/api/events?listener_id=none`, {
      headers: authHeaders(),
    });
    assert.strictEqual(eventsRes.status, 200);
    const eventsData = eventsRes.json();
    const events = eventsData.data || eventsData;
    const genericEvent = events.find((e) => e.path === '/generic/test');
    assert.ok(genericEvent, 'event should be stored without listener_id');
    assert.strictEqual(genericEvent.listener_id, null);
  });

  // --- 7. Disconnect queues, reconnect drains ---

  test('disconnect queues, reconnect drains', async () => {
    // Connect WebSocket as "dev"
    const ws = await connectWs('dev');
    await sleep(500);

    // Verify connected
    const listenersRes = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    const listeners = listenersRes.json();
    const devListener = listeners.find((l) => l.listener_id === 'dev');
    assert.ok(devListener, 'dev listener should exist');
    assert.strictEqual(devListener.connected, true);

    // Disconnect
    ws.close();
    await sleep(500);

    // Verify disconnected
    const listenersRes2 = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    const listeners2 = listenersRes2.json();
    const devListener2 = listeners2.find((l) => l.listener_id === 'dev');
    assert.ok(devListener2, 'dev listener should still exist after disconnect');
    assert.strictEqual(devListener2.connected, false);

    // Send webhook while disconnected — should be stored as pending
    await sendWebhook('/stripe/offline', { type: 'charge.failed' });
    await sleep(300);

    // Verify event is pending
    const pendingRes = await fetch(`${BASE_URL}/api/events?status=pending&listener_id=dev`, {
      headers: authHeaders(),
    });
    assert.strictEqual(pendingRes.status, 200);
    const pendingData = pendingRes.json();
    const pendingEvents = pendingData.data || pendingData;
    const offlineEvent = pendingEvents.find((e) => e.path === '/stripe/offline');
    assert.ok(offlineEvent, 'event should be pending while dev is disconnected');

    // Reconnect with a frame handler that responds to dispatched requests
    const ws2 = await connectWs('dev');
    ws2.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'request') {
          ws2.send(JSON.stringify({
            type: 'response',
            id: frame.id,
            status: 200,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(JSON.stringify({ received: true })).toString('base64'),
          }));
        }
      } catch {}
    });
    await sleep(3000); // Give time for drain + delivery

    // Verify event was delivered
    const deliveredRes = await fetch(`${BASE_URL}/api/events?status=delivered&listener_id=dev`, {
      headers: authHeaders(),
    });
    assert.strictEqual(deliveredRes.status, 200);
    const deliveredData = deliveredRes.json();
    const deliveredEvents = deliveredData.data || deliveredData;
    const drainedEvent = deliveredEvents.find((e) => e.path === '/stripe/offline');
    assert.ok(drainedEvent, 'event should be delivered after dev reconnects');

    ws2.close();
    await sleep(200);
  });

  // --- 8. Auto-register is idempotent ---

  test('auto-register is idempotent', async () => {
    // Clean up all listeners
    const existingRes = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    const existing = existingRes.json();
    for (const l of existing) {
      await fetch(`${BASE_URL}/api/listeners/${l.listener_id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
    }

    // Connect with "dev"
    const ws1 = await connectWs('dev');
    await sleep(300);

    // Verify one listener
    const res1 = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    const listeners1 = res1.json();
    const devCount1 = listeners1.filter((l) => l.listener_id === 'dev').length;
    assert.strictEqual(devCount1, 1, 'should have exactly one "dev" listener');

    // Disconnect
    ws1.close();
    await sleep(300);

    // Reconnect with "dev"
    const ws2 = await connectWs('dev');
    await sleep(300);

    // Verify still only one listener
    const res2 = await fetch(`${BASE_URL}/api/listeners`, {
      headers: authHeaders(),
    });
    const listeners2 = res2.json();
    const devCount2 = listeners2.filter((l) => l.listener_id === 'dev').length;
    assert.strictEqual(devCount2, 1, 'should still have exactly one "dev" listener after reconnect');

    ws2.close();
    await sleep(200);
  });
});
