/**
 * Integration tests for the /api/stats endpoint.
 *
 * Tests the REAL flow:
 *   1. PostgreSQL (docker, port 5434)
 *   2. Rust server (port 8411) — native auth + stats endpoint
 *
 * Covers:
 *   - Auth required (401 without session/key)
 *   - Zero counts for new project
 *   - Correct counts after sending webhooks
 *   - Timeseries buckets present
 *   - by_path distribution
 *   - window parameter (1m, 10m, 1h, 1d, 7d)
 *   - Invalid window returns error
 *   - Counts match event statuses (delivered vs pending)
 *   - Path search (contains match)
 *
 * Run: node --test stats.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const RUST_PORT = 8411;
const DB_URL = "postgres://admin:secret@localhost:5434/simplehook";

let rustProcess = null;

// --- HTTP helpers ---

function request(port, method, urlPath, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          "content-type": "application/json",
          ...(data ? { "content-length": Buffer.byteLength(data) } : {}),
          ...headers,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          const cookies = res.headers["set-cookie"] || [];
          resolve({
            status: res.statusCode,
            body: d,
            cookies,
            json() {
              return JSON.parse(d);
            },
          });
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function extractCookieHeader(cookieArray) {
  return cookieArray.map((c) => c.split(";")[0]).join("; ");
}

function authReq(method, urlPath, body, cookies = []) {
  const headers = {};
  if (cookies.length) headers.cookie = extractCookieHeader(cookies);
  return request(RUST_PORT, method, urlPath, body, headers);
}

function apiReq(method, urlPath, body, headers = {}) {
  return request(RUST_PORT, method, urlPath, body, headers);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForService(port, maxAttempts = 60) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      request(port, "GET", "/health", null)
        .then((res) => {
          if (res.status === 200) resolve();
          else throw new Error(`status ${res.status}`);
        })
        .catch(() => {
          if (++attempts >= maxAttempts)
            reject(new Error(`Port ${port} not ready`));
          else setTimeout(check, 250);
        });
    };
    check();
  });
}

function randomEmail() {
  return `test-${crypto.randomBytes(4).toString("hex")}@example.com`;
}

/**
 * Sign up a new user via the Rust server's native auth.
 * Returns { cookies, token, user, project } for authenticated requests.
 */
async function signUpUser(name) {
  const email = randomEmail();
  const res = await authReq("POST", "/auth/sign-up/email", {
    name,
    email,
    password: "testpass123",
  });
  assert.strictEqual(res.status, 200, `signup failed: ${res.body}`);
  const data = res.json();

  // Fetch project info via /auth/me using session cookie
  const meRes = await authReq("GET", "/auth/me", null, res.cookies);
  assert.strictEqual(meRes.status, 200, `me failed: ${meRes.body}`);
  const meData = meRes.json();

  return {
    cookies: res.cookies,
    token: data.token,
    user: data.user,
    project: meData.project,
    email,
  };
}

/**
 * Send a webhook to a project path and return the response.
 */
async function sendWebhook(projectId, hookPath, body = { test: true }) {
  return apiReq("POST", `/hooks/${projectId}/${hookPath}`, body);
}

// --- Lifecycle ---

describe("stats: /api/stats endpoint", () => {
  before(async () => {
    // Clean DB from previous runs
    try {
      execSync(
        `psql "${DB_URL}" -c "DELETE FROM events; DELETE FROM routes; DELETE FROM email_log; DELETE FROM sessions; DELETE FROM projects; DELETE FROM users;" 2>/dev/null`,
      );
    } catch {}

    // Start Rust server
    rustProcess = spawn(
      path.join(__dirname, "../server/target/debug/simplehook-server"),
      [],
      {
        env: {
          ...process.env,
          DATABASE_URL: DB_URL,
          PORT: String(RUST_PORT),
          BASE_URL: `http://localhost:${RUST_PORT}`,
          FRONTEND_URL: "http://localhost:4000",
          RUST_LOG: "simplehook_server=warn",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    rustProcess.stderr.on("data", () => {});
    rustProcess.stdout.on("data", () => {});

    await waitForService(RUST_PORT);
  });

  after(() => {
    rustProcess?.kill("SIGTERM");
  });

  // --- 1. Auth required ---

  test("stats endpoint returns 401 without auth", async () => {
    const res = await apiReq("GET", "/api/stats", null);
    assert.strictEqual(
      res.status,
      401,
      `expected 401 for unauthenticated request, got ${res.status}`,
    );
  });

  test("stats endpoint returns 401 with invalid API key", async () => {
    const res = await apiReq("GET", "/api/stats", null, {
      authorization: "Bearer ak_invalid_key_here",
    });
    assert.strictEqual(
      res.status,
      401,
      `expected 401 for bad key, got ${res.status}`,
    );
  });

  test("stats endpoint returns 401 with invalid session cookie", async () => {
    const res = await authReq("GET", "/api/stats", null, [
      "sh_session=sht_fake_token_not_real",
    ]);
    assert.strictEqual(
      res.status,
      401,
      `expected 401 for bad cookie, got ${res.status}`,
    );
  });

  // --- 2. Zero counts for new project ---

  test("stats returns zeros for new project with no events", async () => {
    const { project } = await signUpUser("Stats Zero User");

    const res = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    assert.strictEqual(res.status, 200, `stats failed: ${res.body}`);
    const data = res.json();

    assert.strictEqual(data.total, 0, "total should be 0");
    assert.strictEqual(data.delivered, 0, "delivered should be 0");
    assert.strictEqual(data.pending, 0, "pending should be 0");
    assert.strictEqual(data.failed, 0, "failed should be 0");
    assert.ok(Array.isArray(data.timeseries), "timeseries should be an array");
    assert.strictEqual(data.timeseries.length, 0, "timeseries should be empty");
    assert.ok(Array.isArray(data.by_path), "by_path should be an array");
    assert.strictEqual(data.by_path.length, 0, "by_path should be empty");
  });

  // --- 3. Correct counts after sending webhooks ---

  test("stats returns correct counts after sending webhooks", async () => {
    const { project } = await signUpUser("Stats Count User");

    // Send several webhooks to generate events
    await sendWebhook(project.id, "stripe/webhook", { type: "invoice.paid" });
    await sendWebhook(project.id, "stripe/webhook", { type: "charge.succeeded" });
    await sendWebhook(project.id, "github/push", { ref: "refs/heads/main" });

    // Small delay to let events be stored
    await sleep(200);

    const res = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    assert.strictEqual(res.status, 200, `stats failed: ${res.body}`);
    const data = res.json();

    assert.strictEqual(data.total, 3, `total should be 3, got ${data.total}`);
    // total = delivered + pending + failed
    assert.strictEqual(
      data.total,
      data.delivered + data.pending + data.failed,
      "total should equal sum of delivered + pending + failed",
    );
  });

  // --- 4. Timeseries has buckets ---

  test("stats timeseries has buckets after sending webhooks", async () => {
    const { project } = await signUpUser("Stats Timeseries User");

    await sendWebhook(project.id, "test/hook", { n: 1 });
    await sendWebhook(project.id, "test/hook", { n: 2 });

    await sleep(200);

    const res = await apiReq("GET", "/api/stats?window=1d", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    assert.strictEqual(res.status, 200, `stats failed: ${res.body}`);
    const data = res.json();

    assert.ok(
      data.timeseries.length > 0,
      "timeseries should have at least one bucket",
    );

    // Each bucket should have time, total, delivered, failed fields
    const bucket = data.timeseries[0];
    assert.ok("time" in bucket, "bucket should have time field");
    assert.ok("total" in bucket, "bucket should have total field");
    assert.ok("delivered" in bucket, "bucket should have delivered field");
    assert.ok("failed" in bucket, "bucket should have failed field");
    assert.ok(
      typeof bucket.total === "number",
      "bucket total should be a number",
    );
  });

  // --- 5. by_path shows correct path distribution ---

  test("stats by_path shows correct path distribution", async () => {
    const { project } = await signUpUser("Stats Path User");

    // Send webhooks to different paths
    await sendWebhook(project.id, "stripe/webhook", { a: 1 });
    await sendWebhook(project.id, "stripe/webhook", { a: 2 });
    await sendWebhook(project.id, "stripe/webhook", { a: 3 });
    await sendWebhook(project.id, "github/push", { b: 1 });

    await sleep(200);

    const res = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    assert.strictEqual(res.status, 200, `stats failed: ${res.body}`);
    const data = res.json();

    assert.ok(
      data.by_path.length >= 2,
      `by_path should have at least 2 entries, got ${data.by_path.length}`,
    );

    // Each entry should have path and count
    for (const entry of data.by_path) {
      assert.ok("path" in entry, "by_path entry should have path field");
      assert.ok("count" in entry, "by_path entry should have count field");
      assert.ok(entry.count > 0, "count should be > 0");
    }

    // Find stripe path — should have count 3
    const stripePath = data.by_path.find((e) => e.path.includes("stripe"));
    assert.ok(stripePath, "should have a stripe path entry");
    assert.strictEqual(
      stripePath.count,
      3,
      `stripe path count should be 3, got ${stripePath.count}`,
    );

    // Find github path — should have count 1
    const githubPath = data.by_path.find((e) => e.path.includes("github"));
    assert.ok(githubPath, "should have a github path entry");
    assert.strictEqual(
      githubPath.count,
      1,
      `github path count should be 1, got ${githubPath.count}`,
    );

    // by_path should be sorted descending by count
    for (let i = 1; i < data.by_path.length; i++) {
      assert.ok(
        data.by_path[i - 1].count >= data.by_path[i].count,
        "by_path should be sorted by count descending",
      );
    }
  });

  // --- 6. Window parameter works ---

  test("stats window parameter works for all valid values", async () => {
    const { project } = await signUpUser("Stats Window User");

    // Send a webhook so there is data
    await sendWebhook(project.id, "test/hook", { w: 1 });
    await sleep(200);

    const validWindows = ["1m", "10m", "1h", "1d", "7d"];

    for (const window of validWindows) {
      const res = await apiReq("GET", `/api/stats?window=${window}`, null, {
        authorization: `Bearer ${project.api_key}`,
      });

      assert.strictEqual(
        res.status,
        200,
        `stats with window=${window} should return 200, got ${res.status}: ${res.body}`,
      );

      const data = res.json();
      assert.ok(
        typeof data.total === "number",
        `window=${window}: total should be a number`,
      );
      assert.ok(
        Array.isArray(data.timeseries),
        `window=${window}: timeseries should be an array`,
      );
      assert.ok(
        Array.isArray(data.by_path),
        `window=${window}: by_path should be an array`,
      );
    }
  });

  test("stats default window is 1d when omitted", async () => {
    const { project } = await signUpUser("Stats Default Window User");

    await sendWebhook(project.id, "test/hook", { d: 1 });
    await sleep(200);

    // Request without window param
    const noWindow = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });
    // Request with explicit 1d
    const explicit1d = await apiReq("GET", "/api/stats?window=1d", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    assert.strictEqual(noWindow.status, 200);
    assert.strictEqual(explicit1d.status, 200);

    const dataNoWindow = noWindow.json();
    const dataExplicit = explicit1d.json();

    assert.strictEqual(
      dataNoWindow.total,
      dataExplicit.total,
      "default window should match explicit 1d window",
    );
  });

  // --- 7. Invalid window returns error ---

  test("stats with invalid window returns 400 error", async () => {
    const { project } = await signUpUser("Stats Invalid Window User");

    const invalidWindows = ["2d", "30m", "1w", "24h", "abc", ""];

    for (const window of invalidWindows) {
      const res = await apiReq("GET", `/api/stats?window=${window}`, null, {
        authorization: `Bearer ${project.api_key}`,
      });

      assert.ok(
        res.status === 400 || res.status === 422,
        `stats with window=${JSON.stringify(window)} should return 400 or 422, got ${res.status}: ${res.body}`,
      );
    }
  });

  // --- 8. Counts match event statuses ---

  test("stats counts match event statuses (delivered vs pending)", async () => {
    const { project } = await signUpUser("Stats Status User");

    // Send webhooks — without a tunnel connected, they will stay as pending
    await sendWebhook(project.id, "test/hook", { s: 1 });
    await sendWebhook(project.id, "test/hook", { s: 2 });
    await sendWebhook(project.id, "test/hook", { s: 3 });

    await sleep(200);

    // Check stats before manual status changes
    const beforeRes = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });
    assert.strictEqual(beforeRes.status, 200);
    const before = beforeRes.json();

    assert.strictEqual(before.total, 3, `total should be 3, got ${before.total}`);

    // All events should be pending (no tunnel to deliver to)
    // pending count = total - delivered - failed
    const expectedPending = before.total - before.delivered - before.failed;
    assert.strictEqual(
      before.pending,
      expectedPending,
      "pending should equal total - delivered - failed",
    );

    // Manually mark one event as delivered, one as failed via DB
    execSync(
      `psql "${DB_URL}" -c "UPDATE events SET status = 'delivered', delivered_at = now() WHERE project_id = '${project.id}' AND id = (SELECT id FROM events WHERE project_id = '${project.id}' ORDER BY created_at ASC LIMIT 1);"`,
    );
    execSync(
      `psql "${DB_URL}" -c "UPDATE events SET status = 'failed' WHERE project_id = '${project.id}' AND id = (SELECT id FROM events WHERE project_id = '${project.id}' ORDER BY created_at ASC OFFSET 1 LIMIT 1);"`,
    );

    const afterRes = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });
    assert.strictEqual(afterRes.status, 200);
    const afterData = afterRes.json();

    assert.strictEqual(afterData.total, 3, "total should still be 3");
    assert.strictEqual(afterData.delivered, 1, `delivered should be 1, got ${afterData.delivered}`);
    assert.strictEqual(afterData.failed, 1, `failed should be 1, got ${afterData.failed}`);
    assert.strictEqual(afterData.pending, 1, `pending should be 1, got ${afterData.pending}`);

    // Verify invariant: total = delivered + pending + failed
    assert.strictEqual(
      afterData.total,
      afterData.delivered + afterData.pending + afterData.failed,
      "total should equal delivered + pending + failed",
    );
  });

  // --- 9. Path search (contains match) ---

  test("path search: searching 'order' finds /shopify/orders", async () => {
    const { project } = await signUpUser("Stats Path Search User");

    // Send webhooks to various paths including one with "orders"
    await sendWebhook(project.id, "shopify/orders", { order_id: 123 });
    await sendWebhook(project.id, "shopify/orders", { order_id: 456 });
    await sendWebhook(project.id, "stripe/webhook", { type: "charge.created" });
    await sendWebhook(project.id, "github/push", { ref: "main" });

    await sleep(200);

    // Use the events endpoint with path filter to verify contains-match
    const res = await apiReq("GET", "/api/events?path=order", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    assert.strictEqual(res.status, 200, `events search failed: ${res.body}`);
    const data = res.json();

    assert.strictEqual(
      data.total,
      2,
      `searching 'order' should find 2 events, got ${data.total}`,
    );

    // All matched events should have paths containing "order"
    for (const event of data.data) {
      assert.ok(
        event.path.toLowerCase().includes("order"),
        `matched event path '${event.path}' should contain 'order'`,
      );
    }

    // Verify stats by_path includes the shopify/orders path
    const statsRes = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${project.api_key}`,
    });
    assert.strictEqual(statsRes.status, 200);
    const stats = statsRes.json();

    const orderPath = stats.by_path.find((e) => e.path.includes("order"));
    assert.ok(
      orderPath,
      `by_path should include a path containing 'order', got: ${JSON.stringify(stats.by_path)}`,
    );
    assert.strictEqual(
      orderPath.count,
      2,
      `order path count should be 2, got ${orderPath.count}`,
    );
  });

  // --- 10. Project isolation for stats ---

  test("stats are isolated per project", async () => {
    const user1 = await signUpUser("Stats Isolation A");
    const user2 = await signUpUser("Stats Isolation B");

    // Send webhooks only to user1's project
    await sendWebhook(user1.project.id, "test/hook", { x: 1 });
    await sendWebhook(user1.project.id, "test/hook", { x: 2 });

    await sleep(200);

    const res1 = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${user1.project.api_key}`,
    });
    const res2 = await apiReq("GET", "/api/stats", null, {
      authorization: `Bearer ${user2.project.api_key}`,
    });

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);

    const data1 = res1.json();
    const data2 = res2.json();

    assert.strictEqual(data1.total, 2, `user1 should have 2 events, got ${data1.total}`);
    assert.strictEqual(data2.total, 0, `user2 should have 0 events, got ${data2.total}`);
  });

  // --- 11. Stats works with session cookie auth ---

  test("stats works with session cookie auth", async () => {
    const { cookies, project } = await signUpUser("Stats Cookie User");

    await sendWebhook(project.id, "test/hook", { c: 1 });
    await sleep(200);

    const res = await authReq("GET", "/api/stats", null, cookies);

    assert.strictEqual(
      res.status,
      200,
      `stats via cookie should return 200, got ${res.status}: ${res.body}`,
    );
    const data = res.json();
    assert.strictEqual(data.total, 1, `total should be 1, got ${data.total}`);
  });
});
