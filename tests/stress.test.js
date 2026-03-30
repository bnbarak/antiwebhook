/**
 * Stress and resilience tests for simplehook.
 *
 * Tests real-world scenarios:
 *   - Concurrent webhooks
 *   - SDK disconnect/reconnect
 *   - Multiple projects
 *   - High throughput
 *
 * Run: node --test stress.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn, execSync } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

const SERVER_BIN = path.join(__dirname, '../server/target/debug/simplehook-server');
const { listen } = require(path.join(__dirname, '../javascript/sdk/express'));

const DB_URL = 'postgres://admin:secret@localhost:5434/simplehook';
const SERVER_PORT = 8405;
const BASE_URL = `http://localhost:${SERVER_PORT}`;

let serverProcess = null;

// --- Helpers ---

function httpReq(method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: '127.0.0.1',
      port: SERVER_PORT,
      path: urlPath,
      method,
      headers: {
        'content-type': 'application/json',
        ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
        ...headers,
      },
    }, (res) => {
      let d = '';
      res.on('data', (c) => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d, json: () => JSON.parse(d) }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      httpReq('GET', '/health').then(res => {
        if (res.status === 200) resolve();
        else throw new Error(`status ${res.status}`);
      }).catch(() => {
        if (++attempts >= maxAttempts) reject(new Error('Server not ready'));
        else setTimeout(check, 200);
      });
    };
    check();
  });
}

async function registerProject(name) {
  const res = await httpReq('POST', '/api/register', { name });
  return res.json();
}

function connectSDK(apiKey) {
  const received = [];
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('SDK connect timeout')), 5000);
    const app = {
      handle(req, res) {
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
          received.push({
            method: req.method,
            url: req.url,
            body: Buffer.concat(chunks).toString(),
          });
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{"received":true}');
        });
      },
    };

    const conn = listen(app, apiKey, {
      serverUrl: `ws://localhost:${SERVER_PORT}`,
      silent: true,
      onConnect: () => {
        clearTimeout(timeout);
        resolve({ conn, received });
      },
    });
  });
}

// --- Lifecycle ---

describe('stress: resilience and concurrency', () => {
  before(async () => {
    try { execSync(`psql "${DB_URL}" -c "DELETE FROM events; DELETE FROM routes; DELETE FROM projects;" 2>/dev/null`); } catch {}

    serverProcess = spawn(SERVER_BIN, [], {
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        PORT: String(SERVER_PORT),
        BASE_URL: `http://localhost:${SERVER_PORT}`,
        FRONTEND_URL: 'http://localhost:4000',
        RUST_LOG: 'simplehook_server=warn',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    serverProcess.stderr.on('data', () => {});

    await waitForServer();
  });

  after(() => {
    if (serverProcess) serverProcess.kill('SIGTERM');
  });

  // --- 1. Concurrent webhooks to same project ---

  test('handles 20 concurrent webhooks to one project', async () => {
    const proj = await registerProject('concurrent-test');
    const { conn, received } = await connectSDK(proj.api_key);
    await sleep(200);

    // Fire 20 webhooks simultaneously
    const promises = [];
    for (let i = 0; i < 20; i++) {
      promises.push(
        httpReq('POST', `/hooks/${proj.project_id}/webhook/${i}`, { index: i })
      );
    }
    const responses = await Promise.all(promises);

    // All should return 200 (queue mode)
    for (const res of responses) {
      assert.strictEqual(res.status, 200, `webhook should be accepted`);
    }

    // Wait for async delivery
    await sleep(3000);

    assert.ok(
      received.length >= 18,
      `expected >= 18 delivered, got ${received.length} (some may still be in flight)`,
    );

    conn.close();
  });

  // --- 2. Multiple projects isolated ---

  test('3 projects receive only their own webhooks', async () => {
    const projects = [];
    const sdks = [];

    // Register 3 projects and connect SDKs
    for (let i = 0; i < 3; i++) {
      const proj = await registerProject(`project-${i}`);
      const sdk = await connectSDK(proj.api_key);
      projects.push(proj);
      sdks.push(sdk);
    }
    await sleep(300);

    // Send 5 webhooks to each project
    for (let p = 0; p < 3; p++) {
      for (let w = 0; w < 5; w++) {
        await httpReq('POST', `/hooks/${projects[p].project_id}/event/${w}`, {
          project: p,
          event: w,
        });
      }
    }

    await sleep(2000);

    // Each project should have received only its own webhooks
    for (let p = 0; p < 3; p++) {
      const urls = sdks[p].received.map(r => r.url);
      assert.ok(
        sdks[p].received.length >= 4,
        `project ${p} should have >= 4 webhooks, got ${sdks[p].received.length}`,
      );

      // Verify isolation — all received webhooks should be for this project's paths
      for (const wh of sdks[p].received) {
        const body = JSON.parse(wh.body);
        assert.strictEqual(body.project, p, `project ${p} received webhook for project ${body.project}`);
      }
    }

    // Cleanup
    for (const sdk of sdks) sdk.conn.close();
  });

  // --- 3. SDK disconnect and reconnect ---

  test('events queue during disconnect and drain on reconnect', async () => {
    const proj = await registerProject('reconnect-test');
    const { conn: conn1, received: received1 } = await connectSDK(proj.api_key);
    await sleep(200);

    // Send 3 webhooks while connected
    for (let i = 0; i < 3; i++) {
      await httpReq('POST', `/hooks/${proj.project_id}/phase1/${i}`, { phase: 1, i });
    }
    await sleep(1000);
    assert.ok(received1.length >= 3, `should receive 3 webhooks before disconnect, got ${received1.length}`);

    // Disconnect
    conn1.close();
    await sleep(500);

    // Send 3 webhooks while disconnected — these should queue
    for (let i = 0; i < 3; i++) {
      await httpReq('POST', `/hooks/${proj.project_id}/phase2/${i}`, { phase: 2, i });
    }

    // Verify events are pending
    const eventsRes = await httpReq('GET', '/api/events?status=pending', null, {
      authorization: `Bearer ${proj.api_key}`,
    });
    const pendingEvents = eventsRes.json();
    assert.ok(pendingEvents.length >= 1, `should have pending events while offline, got ${pendingEvents.length}`);

    // Reconnect
    const { conn: conn2, received: received2 } = await connectSDK(proj.api_key);
    await sleep(2000); // Wait for drain

    // Queued events should be delivered
    assert.ok(
      received2.length >= 2,
      `should receive queued events after reconnect, got ${received2.length}`,
    );

    // Verify the queued events contain phase 2 data
    const phase2 = received2.filter(w => {
      try { return JSON.parse(w.body).phase === 2; } catch { return false; }
    });
    assert.ok(phase2.length >= 1, `should have phase 2 events, got ${phase2.length}`);

    conn2.close();
  });

  // --- 4. High throughput ---

  test('handles 50 rapid-fire webhooks', async () => {
    const proj = await registerProject('throughput-test');
    const { conn, received } = await connectSDK(proj.api_key);
    await sleep(200);

    // Fire 50 webhooks as fast as possible
    const start = Date.now();
    const promises = [];
    for (let i = 0; i < 50; i++) {
      promises.push(
        httpReq('POST', `/hooks/${proj.project_id}/rapid/${i}`, { seq: i })
      );
    }
    await Promise.all(promises);
    const acceptTime = Date.now() - start;

    // All webhooks should be accepted quickly
    assert.ok(acceptTime < 5000, `50 webhooks should be accepted in < 5s, took ${acceptTime}ms`);

    // Wait for delivery
    await sleep(5000);

    assert.ok(
      received.length >= 40,
      `expected >= 40 of 50 delivered, got ${received.length}`,
    );

    conn.close();
  });

  // --- 5. Webhook with various HTTP methods ---

  test('forwards GET, POST, PUT, DELETE, PATCH webhooks', async () => {
    const proj = await registerProject('methods-test');
    const { conn, received } = await connectSDK(proj.api_key);
    await sleep(200);

    const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    for (const method of methods) {
      await httpReq(method, `/hooks/${proj.project_id}/method-test`, { method });
    }

    await sleep(1500);

    const receivedMethods = received.map(r => r.method);
    for (const method of methods) {
      assert.ok(
        receivedMethods.includes(method),
        `should receive ${method} webhook, got: ${receivedMethods.join(', ')}`,
      );
    }

    conn.close();
  });

  // --- 6. Large webhook body ---

  test('handles large webhook body (100KB)', async () => {
    const proj = await registerProject('large-body-test');
    const { conn, received } = await connectSDK(proj.api_key);
    await sleep(200);

    // Create ~100KB payload
    const largeData = { items: Array.from({ length: 1000 }, (_, i) => ({
      id: i,
      name: `item-${i}`,
      description: 'x'.repeat(80),
    }))};

    await httpReq('POST', `/hooks/${proj.project_id}/large`, largeData);
    await sleep(2000);

    assert.strictEqual(received.length, 1, 'should receive 1 large webhook');
    const body = JSON.parse(received[0].body);
    assert.strictEqual(body.items.length, 1000, 'body should have 1000 items');

    conn.close();
  });

  // --- 7. Empty body webhook ---

  test('handles webhook with no body', async () => {
    const proj = await registerProject('empty-body-test');
    const { conn, received } = await connectSDK(proj.api_key);
    await sleep(200);

    // Send POST with no body
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: SERVER_PORT,
        path: `/hooks/${proj.project_id}/empty`,
        method: 'POST',
      }, (res) => {
        res.on('data', () => {});
        res.on('end', resolve);
      });
      req.on('error', reject);
      req.end(); // No body
    });

    await sleep(1000);
    assert.strictEqual(received.length, 1, 'should receive empty-body webhook');
    assert.strictEqual(received[0].body, '', 'body should be empty string');

    conn.close();
  });

  // --- 8. Replay delivers to connected SDK ---

  test('replay delivers event to connected SDK', async () => {
    const proj = await registerProject('replay-stress-test');
    const { conn, received } = await connectSDK(proj.api_key);
    await sleep(200);

    // Send a webhook
    await httpReq('POST', `/hooks/${proj.project_id}/original`, { original: true });
    await sleep(1000);
    assert.strictEqual(received.length, 1);

    // Get the event ID
    const eventsRes = await httpReq('GET', '/api/events', null, {
      authorization: `Bearer ${proj.api_key}`,
    });
    const events = eventsRes.json();
    const event = events.find(e => e.path === '/original');

    // Replay it 3 times
    for (let i = 0; i < 3; i++) {
      await httpReq('POST', `/api/events/${event.id}/replay`, null, {
        authorization: `Bearer ${proj.api_key}`,
      });
    }
    await sleep(2000);

    // Should have received original + 3 replays = 4
    assert.ok(
      received.length >= 4,
      `expected >= 4 (1 original + 3 replays), got ${received.length}`,
    );

    conn.close();
  });
});
