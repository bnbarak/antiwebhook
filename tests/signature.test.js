/**
 * Integration tests for webhook delivery signatures.
 *
 * Tests the REAL flow:
 *   1. PostgreSQL database (docker, port 5434)
 *   2. Rust server binary (spawned as child process)
 *   3. HTTP requests verify signature headers on delivered events
 *
 * Every delivered event includes:
 *   - webhook-id: event ID
 *   - webhook-timestamp: Unix seconds
 *   - webhook-signature: v1,<base64(HMAC-SHA256(derived_key, id.timestamp.body))>
 *
 * Signing key derivation: HMAC-SHA256("simplehook-signing-v1", api_key)
 *
 * Run: node --test signature.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');

const SERVER_BIN = path.join(__dirname, '../server/target/debug/simplehook-server');

const DB_URL = 'postgres://admin:secret@localhost:5434/simplehook';
const SERVER_PORT = 8408;
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
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
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
    if (opts.body !== undefined) {
      req.write(typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body));
    }
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

async function sendWebhook(pid, webhookPath, body) {
  return fetch(`${BASE_URL}/hooks/${pid}${webhookPath}`, {
    method: 'POST',
    body,
  });
}

function authHeaders(key) {
  return { authorization: `Bearer ${key || apiKey}` };
}

async function pullEvents(key, params = '') {
  return fetch(`${BASE_URL}/api/agent/pull${params ? '?' + params : ''}`, {
    headers: authHeaders(key),
  });
}

// --- Signature helpers ---

function deriveSigningKey(key) {
  return crypto.createHmac('sha256', 'simplehook-signing-v1').update(key).digest();
}

function computeSignature(key, eventId, timestamp, body) {
  const signingKey = deriveSigningKey(key);
  const payload = `${eventId}.${timestamp}.${body || ''}`;
  return 'v1,' + crypto.createHmac('sha256', signingKey).update(payload).digest('base64');
}

function verifySignature(key, eventId, timestamp, body, signature) {
  const expected = computeSignature(key, eventId, timestamp, body);
  return expected === signature;
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

describe('signature: webhook delivery signatures', () => {
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
      body: { name: 'sig-test' },
    });
    assert.strictEqual(res.status, 200);
    const data = res.json();
    projectId = data.project_id;
    apiKey = data.api_key;
  });

  after(() => {
    stopServer();
  });

  // --- 1. Agent pull response includes signature fields ---

  test('agent pull response includes signature fields', async () => {
    await sendWebhook(projectId, '/stripe/webhook', { type: 'payment_intent.created' });
    await sleep(100);

    const res = await pullEvents(apiKey);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);

    const evt = data.events[0];
    assert.ok(evt.webhook_id, 'expected webhook_id to be present');
    assert.ok(evt.webhook_timestamp, 'expected webhook_timestamp to be present');
    assert.ok(evt.webhook_signature, 'expected webhook_signature to be present');
  });

  // --- 2. Signature is valid ---

  test('signature is valid', async () => {
    await sendWebhook(projectId, '/stripe/webhook', { type: 'charge.succeeded' });
    await sleep(100);

    const res = await pullEvents(apiKey);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);

    const evt = data.events[0];
    const valid = verifySignature(
      apiKey,
      evt.webhook_id,
      evt.webhook_timestamp,
      evt.body,
      evt.webhook_signature,
    );
    assert.ok(valid, 'expected signature to be valid when verified with correct API key');
  });

  // --- 3. Signature covers the body ---

  test('signature covers the body', async () => {
    await sendWebhook(projectId, '/stripe/webhook', { type: 'invoice.paid' });
    await sleep(100);

    const res = await pullEvents(apiKey);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);

    const evt = data.events[0];

    // Tamper the body and recompute — should NOT match original signature
    const tamperedBody = '{"type":"invoice.TAMPERED"}';
    const tamperedSig = computeSignature(apiKey, evt.webhook_id, evt.webhook_timestamp, tamperedBody);
    assert.notStrictEqual(
      tamperedSig,
      evt.webhook_signature,
      'signature should differ when body is tampered',
    );
  });

  // --- 4. Different projects have different signatures ---

  test('different projects have different signatures', async () => {
    // Register a second project
    const regRes = await fetch(`${BASE_URL}/api/register`, {
      method: 'POST',
      body: { name: 'sig-test-2' },
    });
    assert.strictEqual(regRes.status, 200);
    const reg2 = regRes.json();
    const projectId2 = reg2.project_id;
    const apiKey2 = reg2.api_key;

    const sharedBody = { type: 'shared_event' };

    // Send same body to both projects
    await sendWebhook(projectId, '/stripe/webhook', sharedBody);
    await sendWebhook(projectId2, '/stripe/webhook', sharedBody);
    await sleep(100);

    const res1 = await pullEvents(apiKey);
    const res2 = await pullEvents(apiKey2);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);

    const evt1 = res1.json().events[0];
    const evt2 = res2.json().events[0];

    assert.ok(evt1.webhook_signature, 'project 1 signature should be present');
    assert.ok(evt2.webhook_signature, 'project 2 signature should be present');
    assert.notStrictEqual(
      evt1.webhook_signature,
      evt2.webhook_signature,
      'signatures from different projects should differ',
    );
  });

  // --- 5. Each event has a unique signature ---

  test('each event has a unique signature', async () => {
    await sendWebhook(projectId, '/stripe/webhook', { type: 'event_a' });
    await sendWebhook(projectId, '/stripe/webhook', { type: 'event_b' });
    await sleep(100);

    const res = await pullEvents(apiKey, 'n=10');
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(data.events.length >= 2, 'expected at least 2 events');

    const sigs = data.events.map((e) => e.webhook_signature);
    const uniqueSigs = new Set(sigs);
    assert.strictEqual(uniqueSigs.size, sigs.length, 'all signatures should be unique');
  });

  // --- 6. Empty body events are signed ---

  test('empty body events are signed', async () => {
    // Send webhook with empty body (empty string)
    await fetch(`${BASE_URL}/hooks/${projectId}/empty/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    await sleep(100);

    const res = await pullEvents(apiKey);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.ok(data.events.length >= 1, 'expected at least 1 event');

    const evt = data.events[data.events.length - 1];
    assert.ok(evt.webhook_signature, 'expected signature on empty-body event');

    const valid = verifySignature(
      apiKey,
      evt.webhook_id,
      evt.webhook_timestamp,
      evt.body,
      evt.webhook_signature,
    );
    assert.ok(valid, 'empty-body event signature should be valid');
  });

  // --- 7. Signature uses correct event ID ---

  test('signature uses correct event ID', async () => {
    await sendWebhook(projectId, '/stripe/webhook', { type: 'id_check' });
    await sleep(100);

    const res = await pullEvents(apiKey);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);

    const evt = data.events[0];
    assert.strictEqual(evt.webhook_id, evt.id, 'webhook_id should match the event id');

    // Verify signature using webhook_id specifically
    const valid = verifySignature(
      apiKey,
      evt.webhook_id,
      evt.webhook_timestamp,
      evt.body,
      evt.webhook_signature,
    );
    assert.ok(valid, 'signature verified with webhook_id should be valid');
  });

  // --- 8. Bad API key cannot forge signature ---

  test('bad API key cannot forge signature', async () => {
    await sendWebhook(projectId, '/stripe/webhook', { type: 'forge_test' });
    await sleep(100);

    const res = await pullEvents(apiKey);
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.events.length, 1);

    const evt = data.events[0];
    const wrongKey = 'ak_wrong_key_that_nobody_has';
    const valid = verifySignature(
      wrongKey,
      evt.webhook_id,
      evt.webhook_timestamp,
      evt.body,
      evt.webhook_signature,
    );
    assert.ok(!valid, 'signature should NOT verify with a wrong API key');
  });
});
