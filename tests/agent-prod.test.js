/**
 * Production E2E tests for the Agent Pull API.
 *
 * Tests against the live simplehook.dev instance.
 * Requires SIMPLEHOOK_KEY and SIMPLEHOOK_PROJECT_ID env vars.
 *
 * Run:
 *   SIMPLEHOOK_KEY=ak_... SIMPLEHOOK_PROJECT_ID=p_... node --test tests/agent-prod.test.js
 *
 * Or with defaults from the dashboard:
 *   node --test tests/agent-prod.test.js
 */

const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const https = require('node:https');

// Set these in .env.local (not committed):
//   SIMPLEHOOK_BASE_URL=https://hook.simplehook.dev
//   SIMPLEHOOK_KEY=ak_...
//   SIMPLEHOOK_PROJECT_ID=p_...
const BASE_URL = process.env.SIMPLEHOOK_BASE_URL;
const API_KEY = process.env.SIMPLEHOOK_KEY;
const PROJECT_ID = process.env.SIMPLEHOOK_PROJECT_ID;

if (!API_KEY || !PROJECT_ID) {
  console.error('Missing SIMPLEHOOK_KEY or SIMPLEHOOK_PROJECT_ID. Set them in .env.local');
  process.exit(1);
}

// --- Helpers ---

function fetch(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: {
        ...opts.headers,
        ...(opts.body ? { 'content-type': 'application/json' } : {}),
      },
    };

    const mod = parsed.protocol === 'https:' ? https : require('http');
    const req = mod.request(reqOpts, (res) => {
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function authHeaders() {
  return { authorization: `Bearer ${API_KEY}` };
}

async function sendWebhook(path, body) {
  return fetch(`${BASE_URL}/hooks/${PROJECT_ID}${path}`, {
    method: 'POST',
    body,
  });
}

async function pullEvents(params = '') {
  return fetch(`${BASE_URL}/api/agent/pull${params ? '?' + params : ''}`, {
    headers: authHeaders(),
  });
}

// --- Tests ---

describe('agent pull API (production)', () => {
  // Use a unique listener_id per test run to avoid cursor interference
  const testRunId = `test-${Date.now()}`;

  before(async () => {
    // Verify server is up
    const health = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(health.status, 200, 'Server not healthy');
  });

  test('health check', async () => {
    const res = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(res.status, 200);
  });

  test('webhook ingestion works', async () => {
    const res = await sendWebhook('/test/agent-e2e', {
      type: 'test.prod_e2e',
      run: testRunId,
      ts: new Date().toISOString(),
    });
    assert.strictEqual(res.status, 200);
  });

  test('pull returns events', async () => {
    await sleep(500); // let webhook settle

    const res = await pullEvents(`n=5&listener_id=${testRunId}`);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(Array.isArray(data.events), 'events should be an array');
    assert.ok(data.events.length >= 1, `expected >=1 event, got ${data.events.length}`);
    assert.ok(typeof data.remaining === 'number');
    assert.ok(data.cursor);
  });

  test('cursor advances — second pull returns empty', async () => {
    const res = await pullEvents(`listener_id=${testRunId}`);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 0, 'expected empty after cursor advance');
  });

  test('pull with path filter works', async () => {
    // Send to two different paths
    await sendWebhook('/stripe/test-e2e', { type: 'stripe.test', run: testRunId });
    await sendWebhook('/github/test-e2e', { type: 'github.test', run: testRunId });
    await sleep(500);

    const listenerId = `${testRunId}-path`;
    const res = await pullEvents(`n=10&path=/stripe/*&listener_id=${listenerId}`);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(data.events.length >= 1, 'should have stripe events');
    assert.ok(data.events.every(e => e.path.startsWith('/stripe/')), 'all events should match /stripe/*');
  });

  test('pull --wait returns on new webhook', async () => {
    const waitListenerId = `${testRunId}-wait`;

    // Drain cursor first
    await pullEvents(`n=100&listener_id=${waitListenerId}`);

    // Start wait in background
    const waitPromise = pullEvents(`wait=true&timeout=10&listener_id=${waitListenerId}`);

    // Send webhook after 1s
    await sleep(1000);
    await sendWebhook('/test/wait-e2e', { type: 'test.wait', run: testRunId });

    const res = await waitPromise;
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(data.events.length >= 1, 'wait should return the new event');
  });

  test('pull --wait times out gracefully', async () => {
    const timeoutListenerId = `${testRunId}-timeout`;
    await pullEvents(`n=100&listener_id=${timeoutListenerId}`);

    const start = Date.now();
    const res = await pullEvents(`wait=true&timeout=2&listener_id=${timeoutListenerId}`);
    const elapsed = Date.now() - start;

    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 0);
    assert.ok(elapsed >= 1500, `should wait ~2s, waited ${elapsed}ms`);
  });

  test('status endpoint returns queue info', async () => {
    const res = await fetch(`${BASE_URL}/api/agent/status`, {
      headers: authHeaders(),
    });
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(data.project_id);
    assert.ok('pending' in data.queue);
    assert.ok('failed' in data.queue);
    assert.ok('delivered_last_hour' in data.queue);
    assert.ok('connected' in data.listeners);
    assert.ok(typeof data.cursors === 'object');
    assert.ok(Array.isArray(data.routes));
  });

  test('auth rejects bad key', async () => {
    const res = await fetch(`${BASE_URL}/api/agent/pull`, {
      headers: { authorization: 'Bearer ak_bad_key_12345' },
    });
    assert.strictEqual(res.status, 401);
  });

  test('concurrent wait on same listener_id returns 409', async () => {
    const conflictId = `${testRunId}-conflict`;
    await pullEvents(`n=100&listener_id=${conflictId}`);

    // Start first wait
    const wait1 = pullEvents(`wait=true&timeout=5&listener_id=${conflictId}`);
    await sleep(500);

    // Second wait should conflict
    const res2 = await pullEvents(`wait=true&timeout=2&listener_id=${conflictId}`);
    assert.strictEqual(res2.status, 409);

    // Release first wait
    await sendWebhook('/test/conflict-release', { run: testRunId });
    await wait1;
  });

  test('SSE stream receives events', async () => {
    const streamId = `${testRunId}-stream`;
    await pullEvents(`n=100&listener_id=${streamId}`);

    const events = [];
    await new Promise((resolve, reject) => {
      const url = new URL(`${BASE_URL}/api/agent/pull?stream=true&timeout=5&listener_id=${streamId}`);
      const mod = url.protocol === 'https:' ? https : require('http');
      const req = mod.get({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        headers: authHeaders(),
      }, (res) => {
        assert.ok([200].includes(res.statusCode), `expected 200, got ${res.statusCode}`);

        let buffer = '';
        res.on('data', (chunk) => {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) {
            if (line.startsWith('data:') && line.includes('evt_')) {
              try { events.push(JSON.parse(line.slice(5).trim())); } catch {}
            }
          }
        });
        res.on('end', resolve);
        res.on('error', reject);
      });
      req.on('error', reject);

      // Send webhooks during stream
      setTimeout(async () => {
        await sendWebhook('/test/stream-e2e', { type: 'stream.1', run: testRunId });
        await sleep(500);
        await sendWebhook('/test/stream-e2e', { type: 'stream.2', run: testRunId });
      }, 1000);
    });

    assert.ok(events.length >= 2, `expected >=2 SSE events, got ${events.length}`);
  });
});
