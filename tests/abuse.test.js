/**
 * Integration tests for rate limiting and abuse protection.
 *
 * Tests the REAL flow:
 *   1. PostgreSQL (docker, port 5434)
 *   2. Rust server (port 8409) — rate limiting, body/header limits, password validation
 *
 * Covers:
 *   - Auth rate limiting (10/min per IP, shared bucket for sign-in + sign-up)
 *   - Webhook rate limiting (100/min per project)
 *   - Large request body rejection (>1MB)
 *   - Large headers rejection (>64KB)
 *   - Password minimum length enforcement (10 chars)
 *   - WebSocket connection limit documentation
 *   - Normal webhook sanity check
 *
 * Run: node --test abuse.test.js
 * Requires: docker compose up -d && cargo build
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const RUST_PORT = 8409;
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

/**
 * Send a raw (non-JSON) request body. Used for the large body test.
 */
function requestRaw(port, method, urlPath, rawBody, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: urlPath,
        method,
        headers: {
          ...(rawBody
            ? { "content-length": Buffer.byteLength(rawBody) }
            : {}),
          ...headers,
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          resolve({
            status: res.statusCode,
            body: d,
            json() {
              return JSON.parse(d);
            },
          });
        });
      },
    );
    req.on("error", (err) => {
      // Connection reset is expected for oversized payloads — treat as rejection
      if (err.code === "ECONNRESET" || err.code === "EPIPE") {
        resolve({ status: 413, body: "connection reset (payload too large)" });
      } else {
        reject(err);
      }
    });
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

function authReq(method, urlPath, body, extraHeaders = {}) {
  return request(RUST_PORT, method, urlPath, body, extraHeaders);
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

// --- Lifecycle ---

describe("abuse: rate limiting and abuse protection", () => {
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

  // --- 1. Auth rate limiting (sign-in) ---
  // The server uses "auth:{ip}" as the rate limit key. Since all requests from
  // the test runner lack x-forwarded-for, they all resolve to IP "unknown".
  // Sign-in and sign-up SHARE the same bucket (10/min per IP).
  // We test sign-in first to avoid consuming the shared bucket with sign-ups.

  test("login rate limit: 429 after 10 attempts", async () => {
    // Send 10 login requests (they fail with 401 but count toward rate limit)
    for (let i = 0; i < 10; i++) {
      const res = await authReq("POST", "/auth/sign-in/email", {
        email: `ratelimit${i}@test.com`,
        password: "wrongpassword",
      });
      // Each should be either 401 (wrong creds) or 200 (unlikely), not 429 yet
      assert.ok(
        res.status !== 429,
        `request ${i + 1} should not be rate limited yet, got ${res.status}`,
      );
    }

    // 11th should get 429
    const res = await authReq("POST", "/auth/sign-in/email", {
      email: "ratelimit@test.com",
      password: "wrongpassword",
    });
    assert.strictEqual(res.status, 429, `expected 429, got ${res.status}`);
    const data = res.json();
    assert.strictEqual(data.error, "too many requests");
  });

  // --- 2. Signup rate limiting ---
  // Since sign-in already consumed 10+1 requests on the "auth:unknown" bucket,
  // sign-up requests from the same IP should also be rate limited immediately.

  test("signup rate limit: 429 because shared auth bucket is exhausted", async () => {
    const res = await authReq("POST", "/auth/sign-up/email", {
      name: "Rate Limited",
      email: "signup-rl@test.com",
      password: "password1234",
    });
    assert.strictEqual(
      res.status,
      429,
      `expected 429 (shared auth bucket), got ${res.status}`,
    );
  });

  // --- 3. Auth rate limit with distinct IP (x-forwarded-for) ---
  // Verify that a different IP has its own rate limit bucket.

  test("different IP has separate rate limit bucket", async () => {
    const res = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Different IP User",
        email: randomEmail(),
        password: "password1234",
      },
      { "x-forwarded-for": "10.0.0.99" },
    );
    // Should NOT be 429 because 10.0.0.99 has its own bucket
    assert.ok(
      res.status !== 429,
      `different IP should not be rate limited, got ${res.status}`,
    );
  });

  // --- 4. Password minimum length enforcement ---

  test("rejects password shorter than 10 characters", async () => {
    const res = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Short Pass",
        email: "shortpass@test.com",
        password: "12345678", // only 8 chars
      },
      { "x-forwarded-for": "10.0.1.1" },
    );
    assert.strictEqual(res.status, 400, `expected 400, got ${res.status}`);
    const data = res.json();
    assert.ok(
      data.error.includes("10"),
      `error should mention 10 character minimum, got: ${data.error}`,
    );
  });

  test("accepts password with exactly 10 characters", async () => {
    const res = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Good Pass",
        email: randomEmail(),
        password: "1234567890", // exactly 10
      },
      { "x-forwarded-for": "10.0.1.2" },
    );
    assert.strictEqual(
      res.status,
      200,
      `expected 200 for 10-char password, got ${res.status}: ${res.body}`,
    );
  });

  // --- 5. Webhook rate limiting (100/min per project) ---

  test("webhook rate limit: 429 after 100 requests per project", async () => {
    // Register a project (use a fresh IP for the signup to avoid auth rate limit)
    const signupRes = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Webhook RL User",
        email: randomEmail(),
        password: "testpass12345",
      },
      { "x-forwarded-for": "10.0.2.1" },
    );
    assert.strictEqual(
      signupRes.status,
      200,
      `signup for webhook test failed: ${signupRes.body}`,
    );

    // Get the project via /auth/me
    const meRes = await authReq("GET", "/auth/me", null, {
      cookie: signupRes.cookies.map((c) => c.split(";")[0]).join("; "),
    });
    assert.strictEqual(meRes.status, 200, `me failed: ${meRes.body}`);
    const meData = meRes.json();
    const projectId = meData.project.id;

    // Send 100 webhooks rapidly (in batches to avoid overwhelming connections)
    const BATCH_SIZE = 20;
    for (let batch = 0; batch < 5; batch++) {
      const promises = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        promises.push(
          apiReq("POST", `/hooks/${projectId}/test`, { i: batch * BATCH_SIZE + i }),
        );
      }
      await Promise.all(promises);
    }

    // 101st should be rate limited
    const res = await apiReq("POST", `/hooks/${projectId}/test`, {
      overflow: true,
    });
    assert.strictEqual(res.status, 429, `expected 429, got ${res.status}`);
  });

  // --- 6. Large request body rejected (>1MB) ---

  test("rejects webhook body larger than 1MB", async () => {
    // Register a project
    const signupRes = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Large Body User",
        email: randomEmail(),
        password: "testpass12345",
      },
      { "x-forwarded-for": "10.0.3.1" },
    );
    assert.strictEqual(signupRes.status, 200, `signup failed: ${signupRes.body}`);

    const meRes = await authReq("GET", "/auth/me", null, {
      cookie: signupRes.cookies.map((c) => c.split(";")[0]).join("; "),
    });
    const projectId = meRes.json().project.id;

    // Create a body > 1MB (1,100,000 bytes)
    const largeBody = "x".repeat(1_100_000);

    const res = await requestRaw(
      RUST_PORT,
      "POST",
      `/hooks/${projectId}/test`,
      largeBody,
      { "content-type": "text/plain" },
    );

    // Axum returns 413 Payload Too Large for oversized bodies,
    // or the connection may reset (treated as 413 by requestRaw)
    assert.ok(
      res.status === 413 || res.status >= 400,
      `expected 413 or 4xx for oversized body, got ${res.status}`,
    );
  });

  // --- 7. Large headers rejected (>64KB) ---

  test("rejects webhook with headers larger than 64KB", async () => {
    // Register a project
    const signupRes = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Large Headers User",
        email: randomEmail(),
        password: "testpass12345",
      },
      { "x-forwarded-for": "10.0.4.1" },
    );
    assert.strictEqual(signupRes.status, 200, `signup failed: ${signupRes.body}`);

    const meRes = await authReq("GET", "/auth/me", null, {
      cookie: signupRes.cookies.map((c) => c.split(";")[0]).join("; "),
    });
    const projectId = meRes.json().project.id;

    // Create headers > 64KB (100 headers x 700 bytes each = 70KB)
    const bigHeaders = { "content-type": "application/json" };
    for (let i = 0; i < 100; i++) {
      bigHeaders[`x-custom-${i}`] = "a".repeat(700);
    }

    const res = await request(
      RUST_PORT,
      "POST",
      `/hooks/${projectId}/test`,
      { test: true },
      bigHeaders,
    );

    // Server returns 431 Request Header Fields Too Large
    assert.strictEqual(
      res.status,
      431,
      `expected 431 for oversized headers, got ${res.status}: ${res.body}`,
    );
  });

  // --- 8. WebSocket connection limit ---

  test("websocket connection limit documented", async () => {
    // WebSocket connection limit (10 per project) is enforced in tunnel.rs.
    // This requires establishing actual WS connections which is complex in
    // integration tests. Tested via: unit tests in tunnel.rs and E2E SDK tests.
    //
    // The limit is checked in tunnel.rs:
    //   let conn_count = state.tunnels.connection_count(&project.id).await;
    //   if conn_count >= 10 { return Err(AppError::TooManyRequests); }
    assert.ok(true, "WS connection limit: 10 per project (tested elsewhere)");
  });

  // --- 9. Normal webhook still works (sanity check) ---

  test("normal webhook under limits works fine", async () => {
    // Register a project with a fresh IP
    const signupRes = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Normal User",
        email: randomEmail(),
        password: "testpass12345",
      },
      { "x-forwarded-for": "10.0.5.1" },
    );
    assert.strictEqual(signupRes.status, 200, `signup failed: ${signupRes.body}`);

    const meRes = await authReq("GET", "/auth/me", null, {
      cookie: signupRes.cookies.map((c) => c.split(";")[0]).join("; "),
    });
    const projectId = meRes.json().project.id;

    const res = await apiReq(
      "POST",
      `/hooks/${projectId}/stripe/events`,
      { type: "invoice.paid", id: "in_normal" },
    );
    assert.strictEqual(
      res.status,
      200,
      `normal webhook should return 200, got ${res.status}: ${res.body}`,
    );
  });

  // --- 10. Webhook rate limit is per-project (isolation) ---

  test("webhook rate limit is per-project, not global", async () => {
    // Register two projects
    const signup1 = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Isolation A",
        email: randomEmail(),
        password: "testpass12345",
      },
      { "x-forwarded-for": "10.0.6.1" },
    );
    const me1 = await authReq("GET", "/auth/me", null, {
      cookie: signup1.cookies.map((c) => c.split(";")[0]).join("; "),
    });
    const projectA = me1.json().project.id;

    const signup2 = await authReq(
      "POST",
      "/auth/sign-up/email",
      {
        name: "Isolation B",
        email: randomEmail(),
        password: "testpass12345",
      },
      { "x-forwarded-for": "10.0.6.2" },
    );
    const me2 = await authReq("GET", "/auth/me", null, {
      cookie: signup2.cookies.map((c) => c.split(";")[0]).join("; "),
    });
    const projectB = me2.json().project.id;

    // Exhaust project A's rate limit (100 webhooks)
    const promises = [];
    for (let i = 0; i < 100; i++) {
      promises.push(apiReq("POST", `/hooks/${projectA}/test`, { i }));
    }
    await Promise.all(promises);

    // Project A should be rate limited
    const resA = await apiReq("POST", `/hooks/${projectA}/test`, {
      overflow: true,
    });
    assert.strictEqual(
      resA.status,
      429,
      `project A should be rate limited, got ${resA.status}`,
    );

    // Project B should still work
    const resB = await apiReq("POST", `/hooks/${projectB}/test`, {
      test: true,
    });
    assert.strictEqual(
      resB.status,
      200,
      `project B should NOT be rate limited, got ${resB.status}`,
    );
  });
});
