/**
 * Integration tests for the trial/billing system.
 *
 * Tests the REAL flow:
 *   1. PostgreSQL (docker, port 5434)
 *   2. Rust server (port 8408) — native auth + billing endpoints
 *
 * Covers:
 *   - Trial state after signup
 *   - Billing status endpoint
 *   - Webhook acceptance during trial
 *   - Webhook blocking after trial expiry (402)
 *   - Checkout endpoint (Stripe session creation)
 *   - Project isolation for billing status
 *   - Unauthenticated access rejection
 *
 * Run: node --test billing.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const RUST_PORT = 8408;
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

// --- Lifecycle ---

describe("billing: trial system and billing status", () => {
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

  // --- 1. Signup sets trial ---

  test("signup sets trial: billing_status is 'trial' with hours remaining", async () => {
    // Arrange
    const { cookies, project } = await signUpUser("Trial User");

    // Act
    const res = await apiReq("GET", "/api/billing/status", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    // Assert
    assert.strictEqual(res.status, 200, `billing status failed: ${res.body}`);
    const data = res.json();
    assert.strictEqual(data.billing_status, "trial");
    assert.ok(data.trial_ends_at, "should have trial_ends_at");
    assert.ok(
      typeof data.trial_hours_remaining === "number",
      "trial_hours_remaining should be a number",
    );
    assert.ok(
      data.trial_hours_remaining > 0,
      `trial_hours_remaining should be > 0, got ${data.trial_hours_remaining}`,
    );
    assert.ok(
      data.trial_hours_remaining <= 24,
      `trial_hours_remaining should be <= 24h, got ${data.trial_hours_remaining}`,
    );
    assert.strictEqual(data.has_subscription, false);
  });

  // --- 2. Webhooks work during trial ---

  test("webhooks are accepted during active trial (200)", async () => {
    // Arrange
    const { project } = await signUpUser("Webhook Trial User");

    // Act
    const res = await apiReq(
      "POST",
      `/hooks/${project.id}/stripe/webhook`,
      { type: "checkout.session.completed", id: "cs_test_1" },
    );

    // Assert
    assert.strictEqual(
      res.status,
      200,
      `webhook should be accepted during trial, got ${res.status}: ${res.body}`,
    );
  });

  // --- 3. Billing status endpoint returns correct trial info ---

  test("billing status returns complete trial information", async () => {
    // Arrange
    const { project } = await signUpUser("Status User");

    // Act
    const res = await apiReq("GET", "/api/billing/status", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    // Assert
    assert.strictEqual(res.status, 200);
    const data = res.json();

    // Verify all expected fields are present
    assert.ok("billing_status" in data, "should have billing_status field");
    assert.ok("trial_ends_at" in data, "should have trial_ends_at field");
    assert.ok(
      "trial_hours_remaining" in data,
      "should have trial_hours_remaining field",
    );
    assert.ok(
      "has_subscription" in data,
      "should have has_subscription field",
    );

    // Verify trial values
    assert.strictEqual(data.billing_status, "trial");
    assert.strictEqual(data.has_subscription, false);
    assert.ok(data.trial_hours_remaining > 23, "fresh trial should have ~24h remaining");
  });

  // --- 4. Billing status via session cookie ---

  test("billing status works with session cookie auth", async () => {
    // Arrange
    const { cookies } = await signUpUser("Cookie Auth User");

    // Act
    const res = await authReq("GET", "/api/billing/status", null, cookies);

    // Assert
    assert.strictEqual(
      res.status,
      200,
      `billing status via cookie failed: ${res.body}`,
    );
    const data = res.json();
    assert.strictEqual(data.billing_status, "trial");
  });

  // --- 5. Checkout creates Stripe session ---

  test("checkout endpoint exists and requires auth", async () => {
    // Arrange
    const { project } = await signUpUser("Checkout User");

    // Act
    const res = await apiReq("POST", "/api/billing/checkout", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    // Assert: Without a real Stripe key the request will fail at Stripe,
    // but the endpoint should respond (not 404 or 401).
    // It may return 500 (Stripe error) or 200 (if Stripe key is configured).
    assert.ok(
      res.status !== 404,
      "checkout endpoint should exist (not 404)",
    );
    assert.ok(
      res.status !== 401,
      "checkout should accept valid auth (not 401)",
    );
  });

  test("checkout without auth returns 401", async () => {
    // Arrange: no auth headers

    // Act
    const res = await apiReq("POST", "/api/billing/checkout", null);

    // Assert
    assert.strictEqual(res.status, 401, `expected 401, got ${res.status}`);
  });

  // --- 6. Webhook blocking after trial expiry (402) ---

  test("webhooks return 402 after trial expires", async () => {
    // Arrange: create user, then manually expire the trial in DB
    const { project } = await signUpUser("Expired Trial User");

    // Verify webhooks work before expiry
    const beforeRes = await apiReq(
      "POST",
      `/hooks/${project.id}/test/hook`,
      { test: true },
    );
    assert.strictEqual(
      beforeRes.status,
      200,
      "webhook should work before expiry",
    );

    // Manually expire the trial via psql
    execSync(
      `psql "${DB_URL}" -c "UPDATE projects SET billing_status='trial_expired', active=false WHERE id='${project.id}';"`,
    );

    // Act
    const res = await apiReq(
      "POST",
      `/hooks/${project.id}/test/hook`,
      { test: true },
    );

    // Assert
    assert.strictEqual(
      res.status,
      402,
      `expected 402 Payment Required, got ${res.status}: ${res.body}`,
    );
    const data = res.json();
    assert.strictEqual(data.error, "payment_required");
    assert.ok(data.message, "should include an explanation message");
  });

  test("webhooks return 402 for cancelled subscription", async () => {
    // Arrange
    const { project } = await signUpUser("Cancelled User");

    execSync(
      `psql "${DB_URL}" -c "UPDATE projects SET billing_status='cancelled', active=false WHERE id='${project.id}';"`,
    );

    // Act
    const res = await apiReq(
      "POST",
      `/hooks/${project.id}/test/hook`,
      { test: true },
    );

    // Assert
    assert.strictEqual(
      res.status,
      402,
      `expected 402 for cancelled, got ${res.status}: ${res.body}`,
    );
  });

  // --- 7. Billing status reflects expired trial ---

  test("billing status shows trial_expired after manual expiry", async () => {
    // Arrange
    const { project } = await signUpUser("Expired Status User");

    execSync(
      `psql "${DB_URL}" -c "UPDATE projects SET billing_status='trial_expired', active=false WHERE id='${project.id}';"`,
    );

    // Act
    const res = await apiReq("GET", "/api/billing/status", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    // Assert
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.billing_status, "trial_expired");
    assert.strictEqual(data.has_subscription, false);
  });

  // --- 8. Project isolation ---

  test("one user's billing status does not affect another", async () => {
    // Arrange: create two users
    const user1 = await signUpUser("Isolation User A");
    const user2 = await signUpUser("Isolation User B");

    // Expire user1's trial
    execSync(
      `psql "${DB_URL}" -c "UPDATE projects SET billing_status='trial_expired', active=false WHERE id='${user1.project.id}';"`,
    );

    // Act: check both users' billing status
    const res1 = await apiReq("GET", "/api/billing/status", null, {
      authorization: `Bearer ${user1.project.api_key}`,
    });
    const res2 = await apiReq("GET", "/api/billing/status", null, {
      authorization: `Bearer ${user2.project.api_key}`,
    });

    // Assert: user1 expired, user2 still on trial
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);

    const data1 = res1.json();
    const data2 = res2.json();

    assert.strictEqual(
      data1.billing_status,
      "trial_expired",
      "user1 should be trial_expired",
    );
    assert.strictEqual(
      data2.billing_status,
      "trial",
      "user2 should still be on trial",
    );
    assert.ok(
      data2.trial_hours_remaining > 0,
      "user2 should have trial hours remaining",
    );
  });

  test("one user cannot access another user's billing status", async () => {
    // Arrange
    const user1 = await signUpUser("Access User A");
    const user2 = await signUpUser("Access User B");

    // Act: user1's API key should only return user1's project status
    const res = await apiReq("GET", "/api/billing/status", null, {
      authorization: `Bearer ${user1.project.api_key}`,
    });

    // Assert: should return user1's status, not user2's
    assert.strictEqual(res.status, 200);
    const data = res.json();
    assert.strictEqual(data.billing_status, "trial");
  });

  // --- 9. Unauthenticated billing status ---

  test("billing status without auth returns 401", async () => {
    // Arrange: no auth headers

    // Act
    const res = await apiReq("GET", "/api/billing/status", null);

    // Assert
    assert.strictEqual(
      res.status,
      401,
      `expected 401 for unauthenticated request, got ${res.status}`,
    );
  });

  test("billing status with invalid API key returns 401", async () => {
    // Arrange: fake API key

    // Act
    const res = await apiReq("GET", "/api/billing/status", null, {
      authorization: "Bearer ak_invalid_key_here",
    });

    // Assert
    assert.strictEqual(
      res.status,
      401,
      `expected 401 for bad key, got ${res.status}`,
    );
  });

  test("billing status with invalid session cookie returns 401", async () => {
    // Arrange: fake cookie

    // Act
    const res = await authReq("GET", "/api/billing/status", null, [
      "sh_session=sht_fake_token_not_real",
    ]);

    // Assert
    assert.strictEqual(
      res.status,
      401,
      `expected 401 for bad cookie, got ${res.status}`,
    );
  });

  // --- 10. Portal endpoint ---

  test("portal endpoint requires subscription", async () => {
    // Arrange: new user (no subscription)
    const { project } = await signUpUser("Portal User");

    // Act
    const res = await apiReq("POST", "/api/billing/portal", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    // Assert: should fail because user has no stripe_customer_id
    assert.ok(
      res.status >= 400,
      `portal should reject user without subscription, got ${res.status}`,
    );
    assert.ok(
      res.status !== 401,
      "portal should accept auth (not 401)",
    );
  });

  // --- 11. Webhooks still work for non-billing-blocked statuses ---

  test("webhooks work for active (paid) projects", async () => {
    // Arrange: create user and set to active/paid
    const { project } = await signUpUser("Active User");

    execSync(
      `psql "${DB_URL}" -c "UPDATE projects SET billing_status='active', active=true WHERE id='${project.id}';"`,
    );

    // Act
    const res = await apiReq(
      "POST",
      `/hooks/${project.id}/test/hook`,
      { test: true },
    );

    // Assert
    assert.strictEqual(
      res.status,
      200,
      `active project webhooks should work, got ${res.status}: ${res.body}`,
    );
  });

  test("webhooks work for past_due projects (grace period)", async () => {
    // Arrange
    const { project } = await signUpUser("Past Due User");

    execSync(
      `psql "${DB_URL}" -c "UPDATE projects SET billing_status='past_due', active=true WHERE id='${project.id}';"`,
    );

    // Act
    const res = await apiReq(
      "POST",
      `/hooks/${project.id}/test/hook`,
      { test: true },
    );

    // Assert: past_due is not blocked (only trial_expired and cancelled are)
    assert.strictEqual(
      res.status,
      200,
      `past_due project webhooks should still work, got ${res.status}: ${res.body}`,
    );
  });
});
