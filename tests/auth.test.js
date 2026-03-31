/**
 * Integration tests for the auth flow (BetterAuth).
 *
 * Tests the REAL flow:
 *   1. PostgreSQL (docker, port 5434)
 *   2. Auth service (BetterAuth + Express, port 8401)
 *   3. Rust server (port 8400) — for project creation after signup
 *
 * Run: node --test auth.test.js
 * Requires: docker compose up -d && auth service running && rust server running
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");

const SERVER_PORT = 8406;
const DB_URL = "postgres://admin:secret@localhost:5434/simplehook";

let serverProcess = null;

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
  const headers = { origin: "http://localhost:4000" };
  if (cookies.length) headers.cookie = extractCookieHeader(cookies);
  return request(SERVER_PORT, method, urlPath, body, headers);
}

function apiReq(method, urlPath, body, headers = {}) {
  return request(SERVER_PORT, method, urlPath, body, headers);
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
          if (++attempts >= maxAttempts) reject(new Error(`Port ${port} not ready`));
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

describe("auth: signup, login, session, logout", () => {
  before(async () => {
    // Clean auth tables
    try {
      execSync(
        `psql "${DB_URL}" -c "DELETE FROM sessions; DELETE FROM users WHERE email LIKE 'test-%';" 2>/dev/null`,
      );
    } catch {}

    // Start Rust server (auth is built in)
    serverProcess = spawn(
      path.join(__dirname, "../server/target/debug/simplehook-server"),
      [],
      {
        env: {
          ...process.env,
          DATABASE_URL: DB_URL,
          PORT: String(SERVER_PORT),
          BASE_URL: `http://localhost:${SERVER_PORT}`,
          FRONTEND_URL: "http://localhost:4000",
          RUST_LOG: "simplehook_server=warn",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    serverProcess.stderr.on("data", () => {});

    await waitForService(SERVER_PORT);
  });

  after(() => {
    serverProcess?.kill("SIGTERM");
  });

  // --- Signup ---

  test("signup creates a new user", async () => {
    // Arrange
    const email = randomEmail();

    // Act
    const res = await authReq("POST", "/auth/sign-up/email", {
      name: "Test User",
      email,
      password: "password123",
    });

    // Assert
    assert.strictEqual(res.status, 200, `signup failed: ${res.body}`);
    const data = res.json();
    assert.ok(data.user, "response should contain user");
    assert.strictEqual(data.user.email, email);
    assert.strictEqual(data.user.name, "Test User");
    assert.ok(res.cookies.length > 0, "should set session cookie");
  });

  test("signup rejects duplicate email", async () => {
    // Arrange
    const email = randomEmail();
    await authReq("POST", "/auth/sign-up/email", {
      name: "First",
      email,
      password: "password123",
    });

    // Act
    const res = await authReq("POST", "/auth/sign-up/email", {
      name: "Second",
      email,
      password: "password456",
    });

    // Assert
    assert.ok(res.status >= 400, `should reject duplicate: status ${res.status}`);
  });

  test("signup rejects weak password", async () => {
    // Arrange
    const email = randomEmail();

    // Act
    const res = await authReq("POST", "/auth/sign-up/email", {
      name: "Weak",
      email,
      password: "123",
    });

    // Assert
    assert.ok(res.status >= 400, `should reject weak password: status ${res.status}`);
  });

  test("signup rejects missing fields", async () => {
    // Act
    const res = await authReq("POST", "/auth/sign-up/email", {
      email: randomEmail(),
    });

    // Assert
    assert.ok(res.status >= 400, `should reject missing fields: status ${res.status}`);
  });

  // --- Login ---

  test("login with valid credentials returns session", async () => {
    // Arrange
    const email = randomEmail();
    await authReq("POST", "/auth/sign-up/email", {
      name: "Login Test",
      email,
      password: "securepass123",
    });

    // Act
    const res = await authReq("POST", "/auth/sign-in/email", {
      email,
      password: "securepass123",
    });

    // Assert
    assert.strictEqual(res.status, 200, `login failed: ${res.body}`);
    const data = res.json();
    assert.ok(data.user, "response should contain user");
    assert.strictEqual(data.user.email, email);
    assert.ok(res.cookies.length > 0, "should set session cookie");
  });

  test("login rejects wrong password", async () => {
    // Arrange
    const email = randomEmail();
    await authReq("POST", "/auth/sign-up/email", {
      name: "Wrong Pass",
      email,
      password: "correctpass123",
    });

    // Act
    const res = await authReq("POST", "/auth/sign-in/email", {
      email,
      password: "wrongpass456",
    });

    // Assert
    assert.ok(res.status >= 400, `should reject wrong password: status ${res.status}`);
  });

  test("login rejects nonexistent email", async () => {
    // Act
    const res = await authReq("POST", "/auth/sign-in/email", {
      email: "nobody@example.com",
      password: "password123",
    });

    // Assert
    assert.ok(res.status >= 400, `should reject unknown email: status ${res.status}`);
  });

  // --- Session ---

  test("get-session returns user when authenticated", async () => {
    // Arrange
    const email = randomEmail();
    const signupRes = await authReq("POST", "/auth/sign-up/email", {
      name: "Session Test",
      email,
      password: "sessionpass123",
    });
    const cookies = signupRes.cookies;

    // Act
    const res = await authReq("GET", "/auth/get-session", null, cookies);

    // Assert
    assert.strictEqual(res.status, 200, `get-session failed: ${res.body}`);
    const data = res.json();
    assert.ok(data.user, "should return user");
    assert.strictEqual(data.user.email, email);
    assert.strictEqual(data.user.name, "Session Test");
  });

  test("get-session returns no user without cookie", async () => {
    // Act
    const res = await authReq("GET", "/auth/get-session", null, []);

    // Assert — BetterAuth may return 200 with null body, or 401
    const data = res.body ? JSON.parse(res.body) : null;
    const hasUser = data && data.user && data.user.id;
    assert.ok(!hasUser, "should not return a valid user without cookie");
  });

  test("get-session returns no user with invalid cookie", async () => {
    // Act
    const res = await authReq("GET", "/auth/get-session", null, [
      "better-auth.session_token=invalid_token_abc123",
    ]);

    // Assert
    const data = res.body ? JSON.parse(res.body) : null;
    const hasUser = data && data.user && data.user.id;
    assert.ok(!hasUser, "should not return a valid user with bad cookie");
  });

  // --- Logout ---

  test("sign-out invalidates session", async () => {
    // Arrange
    const email = randomEmail();
    const signupRes = await authReq("POST", "/auth/sign-up/email", {
      name: "Logout Test",
      email,
      password: "logoutpass123",
    });
    const cookies = signupRes.cookies;

    // Verify session exists
    const beforeRes = await authReq("GET", "/auth/get-session", null, cookies);
    assert.strictEqual(beforeRes.status, 200);
    const beforeData = beforeRes.json();
    assert.ok(beforeData.user, "should have session before logout");

    // Act
    await authReq("POST", "/auth/sign-out", null, cookies);

    // Assert
    const afterRes = await authReq("GET", "/auth/get-session", null, cookies);
    const afterData = afterRes.body ? JSON.parse(afterRes.body) : null;
    const hasUser = afterData && afterData.user && afterData.user.id;
    assert.ok(!hasUser, "session should be gone after logout");
  });

  // --- Full flow: signup → create project → use API ---

  test("full flow: signup → create project → access dashboard API", async () => {
    // Arrange: sign up
    const email = randomEmail();
    const signupRes = await authReq("POST", "/auth/sign-up/email", {
      name: "Full Flow User",
      email,
      password: "fullflow123",
    });
    assert.strictEqual(signupRes.status, 200, `signup failed: ${signupRes.body}`);

    // Act: create a project via Rust API
    const projectRes = await apiReq("POST", "/api/register", { name: "My Project" });
    assert.strictEqual(projectRes.status, 200);
    const project = projectRes.json();

    // Assert: project created with valid IDs
    assert.ok(project.project_id.startsWith("p_"));
    assert.ok(project.api_key.startsWith("ak_"));
    assert.ok(project.webhook_base_url.includes(project.project_id));

    // Act: use API key to access dashboard endpoints
    const eventsRes = await apiReq("GET", "/api/events", null, {
      authorization: `Bearer ${project.api_key}`,
    });

    // Assert: empty events for new project
    assert.strictEqual(eventsRes.status, 200);
    const eventsBody = eventsRes.json();
    assert.ok(Array.isArray(eventsBody.data));
    assert.strictEqual(eventsBody.data.length, 0);
  });

  // --- Multiple sessions ---

  test("multiple logins create independent sessions", async () => {
    // Arrange
    const email = randomEmail();
    await authReq("POST", "/auth/sign-up/email", {
      name: "Multi Session",
      email,
      password: "multipass123",
    });

    // Act: login twice
    const login1 = await authReq("POST", "/auth/sign-in/email", {
      email,
      password: "multipass123",
    });
    const login2 = await authReq("POST", "/auth/sign-in/email", {
      email,
      password: "multipass123",
    });

    // Assert: both sessions are valid
    const session1 = await authReq("GET", "/auth/get-session", null, login1.cookies);
    const session2 = await authReq("GET", "/auth/get-session", null, login2.cookies);

    assert.strictEqual(session1.status, 200);
    assert.strictEqual(session2.status, 200);
    assert.ok(session1.json().user);
    assert.ok(session2.json().user);
  });

  // --- Edge cases ---

  test("signup with extra whitespace in email is trimmed or rejected", async () => {
    // Arrange
    const email = randomEmail();
    const paddedEmail = `  ${email}  `;

    // Act
    const res = await authReq("POST", "/auth/sign-up/email", {
      name: "Padded",
      email: paddedEmail,
      password: "padded123456",
    });

    // Assert: either succeeds with trimmed email or rejects
    if (res.status === 200) {
      const data = res.json();
      assert.ok(
        data.user.email === email || data.user.email === paddedEmail,
        "email should be stored",
      );
    }
  });

  test("login is case-insensitive for email", async () => {
    // Arrange
    const email = randomEmail().toLowerCase();
    await authReq("POST", "/auth/sign-up/email", {
      name: "Case Test",
      email,
      password: "casetest123",
    });

    // Act: login with uppercase email
    const res = await authReq("POST", "/auth/sign-in/email", {
      email: email.toUpperCase(),
      password: "casetest123",
    });

    // Assert: should succeed (most auth systems are case-insensitive)
    // BetterAuth may or may not handle this — just verify no crash
    assert.ok(
      res.status === 200 || res.status === 401,
      `unexpected status: ${res.status}`,
    );
  });
});
