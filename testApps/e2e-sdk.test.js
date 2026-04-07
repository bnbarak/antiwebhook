/**
 * Full end-to-end SDK test — uses the REAL testApps.
 *
 * Tests each SDK by:
 *   1. Starting the real Rust server
 *   2. Registering a fresh project (gets API key)
 *   3. Starting the real testApp (Express or Flask)
 *   4. Sending webhooks to the server
 *   5. Checking the testApp's stdout for delivery confirmation
 *
 * Run: node --test e2e-sdk.test.js
 * Requires: docker compose up postgres -d && cargo build && npm install in testApps/express
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const SERVER_BIN = path.join(__dirname, "../server/target/debug/simplehook-server");
const DB_URL = "postgres://admin:secret@localhost:5434/simplehook";
const SERVER_PORT = 8413;

let serverProcess = null;

function httpReq(port, method, urlPath, body) {
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
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d, json: () => JSON.parse(d) }));
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function waitFor(port, maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      httpReq(port, "GET", "/health")
        .then((r) => { if (r.status === 200) resolve(); else throw new Error(); })
        .catch(() => {
          if (++attempts >= maxAttempts) reject(new Error(`Port ${port} not ready`));
          else setTimeout(check, 300);
        });
    };
    check();
  });
}

function registerProject(name) {
  return httpReq(SERVER_PORT, "POST", "/api/register", { name }).then((r) => r.json());
}

function sendWebhook(projectId, webhookPath, body) {
  return httpReq(SERVER_PORT, "POST", `/hooks/${projectId}${webhookPath}`, body);
}

/**
 * Start a testApp and wait for the SDK to connect.
 * Returns { process, stdout, waitForLog }.
 */
function startTestApp(cmd, args, env, connectSignal = "[simplehook] connected") {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`testApp connect timeout (${cmd})`)), 15000);
    let stdout = "";

    const proc = spawn(cmd, args, {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      cwd: path.dirname(args[0] || "."),
    });

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stdout += d.toString(); });

    // Check stdout periodically for the connect signal
    const check = setInterval(() => {
      if (stdout.includes(connectSignal)) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve({
          process: proc,
          getStdout: () => stdout,
          waitForLog: (text, timeoutMs = 5000) =>
            new Promise((res, rej) => {
              if (stdout.includes(text)) return res(true);
              const t = setTimeout(() => rej(new Error(`Log "${text}" not found`)), timeoutMs);
              const i = setInterval(() => {
                if (stdout.includes(text)) { clearInterval(i); clearTimeout(t); res(true); }
              }, 100);
            }),
        });
      }
    }, 200);
  });
}

// --- Test suites ---

describe("e2e-sdk: all SDKs", () => {
  before(async () => {
    try {
      execSync(`psql "${DB_URL}" -c "DELETE FROM events WHERE project_id LIKE 'p_%';" 2>/dev/null`);
    } catch {}

    serverProcess = spawn(SERVER_BIN, [], {
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        PORT: String(SERVER_PORT),
        BASE_URL: `http://localhost:${SERVER_PORT}`,
        FRONTEND_URL: "http://localhost:4000",
        RUST_LOG: "simplehook_server=warn",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    serverProcess.stderr.on("data", () => {});
    await waitFor(SERVER_PORT);
  });

  after(() => {
    serverProcess?.kill("SIGTERM");
  });

  // ── Express SDK ──

  describe("Express SDK (testApps/express)", () => {
    let app;
    let projectId;

    before(async () => {
      const proj = await registerProject("express-e2e");
      projectId = proj.project_id;

      app = await startTestApp("node", [path.join(__dirname, "express/index.js")], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3098",
      });
    });

    after(() => {
      app?.process.kill("SIGTERM");
    });

    test("receives stripe webhook", async () => {
      await sendWebhook(projectId, "/stripe/events", { type: "invoice.paid", id: "in_1" });
      await app.waitForLog("[stripe] invoice.paid");
      assert.ok(true);
    });

    test("receives github webhook", async () => {
      await sendWebhook(projectId, "/github/push", { ref: "refs/heads/main", commits: [{ id: "abc" }] });
      await app.waitForLog("[github] refs/heads/main");
      assert.ok(true);
    });

    test("receives twilio webhook", async () => {
      await sendWebhook(projectId, "/twilio/voice", { CallSid: "CA_e2e", CallStatus: "ringing" });
      await app.waitForLog("[twilio] CA_e2e");
      assert.ok(true);
    });

    test("receives catch-all webhook", async () => {
      await sendWebhook(projectId, "/custom/anything", { test: true });
      await app.waitForLog("[webhook] POST /custom/anything");
      assert.ok(true);
    });

    test("handles 5 concurrent webhooks", async () => {
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(sendWebhook(projectId, `/concurrent/${i}`, { i }));
      }
      await Promise.all(promises);
      await sleep(2000);
      const stdout = app.getStdout();
      let count = 0;
      for (let i = 0; i < 5; i++) {
        if (stdout.includes(`/concurrent/${i}`)) count++;
      }
      assert.ok(count >= 4, `expected >= 4 of 5 concurrent, got ${count}`);
    });
  });

  // ── Fastify SDK ──

  describe("Fastify SDK (testApps/fastify)", () => {
    let app;
    let projectId;

    before(async () => {
      const proj = await registerProject("fastify-e2e");
      projectId = proj.project_id;

      // Build SDK first
      try {
        execSync("npm run build", { cwd: path.join(__dirname, "../javascript/sdk/fastify"), stdio: "ignore" });
      } catch {}

      app = await startTestApp("node", [path.join(__dirname, "fastify/index.js")], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3096",
      });
    });

    after(() => {
      app?.process.kill("SIGTERM");
    });

    test("receives stripe webhook", async () => {
      await sendWebhook(projectId, "/stripe/events", { type: "invoice.paid", id: "in_fast" });
      await app.waitForLog("[stripe] invoice.paid");
      assert.ok(true);
    });

    test("receives github webhook", async () => {
      await sendWebhook(projectId, "/github/push", { ref: "refs/heads/main", commits: [{ id: "abc" }] });
      await app.waitForLog("[github] refs/heads/main");
      assert.ok(true);
    });

    test("receives catch-all webhook", async () => {
      await sendWebhook(projectId, "/custom/path", { test: true });
      await app.waitForLog("[webhook] POST /custom/path");
      assert.ok(true);
    });
  });

  // ── Hono SDK ──

  describe("Hono SDK (testApps/hono)", () => {
    let app;
    let projectId;

    before(async () => {
      const proj = await registerProject("hono-e2e");
      projectId = proj.project_id;

      // Build SDK first
      try {
        execSync("npm run build", { cwd: path.join(__dirname, "../javascript/sdk/hono"), stdio: "ignore" });
      } catch {}

      app = await startTestApp("node", [path.join(__dirname, "hono/index.js")], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3095",
      });
    });

    after(() => {
      app?.process.kill("SIGTERM");
    });

    test("receives stripe webhook", async () => {
      await sendWebhook(projectId, "/stripe/events", { type: "charge.completed", id: "ch_hono" });
      await app.waitForLog("[stripe] charge.completed");
      assert.ok(true);
    });

    test("receives catch-all webhook", async () => {
      await sendWebhook(projectId, "/anything/here", { test: true });
      await app.waitForLog("[webhook] POST /anything/here");
      assert.ok(true);
    });
  });

  // ── Flask SDK ──

  describe("Flask SDK (testApps/flask)", () => {
    let app;
    let projectId;
    let hasPython = true;

    before(async () => {
      // Check if Python + Flask are available
      try {
        execSync("python3 -c 'import flask; import websockets'", { stdio: "ignore" });
      } catch {
        hasPython = false;
        return;
      }

      const proj = await registerProject("flask-e2e");
      projectId = proj.project_id;

      app = await startTestApp("python3", [path.join(__dirname, "flask/app.py")], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3097",
      }, "[simplehook] connected");
    });

    after(() => {
      app?.process.kill("SIGTERM");
    });

    test("receives stripe webhook", async (t) => {
      if (!hasPython) { t.skip("Python/Flask not available"); return; }
      await sendWebhook(projectId, "/stripe/events", { type: "charge.succeeded" });
      await app.waitForLog("[stripe] charge.succeeded");
      assert.ok(true);
    });

    test("receives github webhook", async (t) => {
      if (!hasPython) { t.skip("Python/Flask not available"); return; }
      await sendWebhook(projectId, "/github/push", { ref: "refs/heads/develop" });
      await app.waitForLog("[github] refs/heads/develop");
      assert.ok(true);
    });

    test("receives catch-all webhook", async (t) => {
      if (!hasPython) { t.skip("Python/Flask not available"); return; }
      await sendWebhook(projectId, "/any/path", { data: "test" });
      await app.waitForLog("[webhook] POST /any/path");
      assert.ok(true);
    });
  });

  // ── FastAPI SDK ──

  describe("FastAPI SDK (testApps/fastapi)", () => {
    let app;
    let projectId;
    let hasPython = true;

    before(async () => {
      try {
        execSync("python3 -c 'import fastapi; import websockets; import httpx'", { stdio: "ignore" });
      } catch {
        hasPython = false;
        return;
      }

      const proj = await registerProject("fastapi-e2e");
      projectId = proj.project_id;

      app = await startTestApp("python3", [path.join(__dirname, "fastapi/app.py")], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3094",
      }, "[simplehook] connected");
    });

    after(() => {
      app?.process.kill("SIGTERM");
    });

    test("receives stripe webhook", async (t) => {
      if (!hasPython) { t.skip("Python/FastAPI not available"); return; }
      await sendWebhook(projectId, "/stripe/events", { type: "payment_intent.succeeded" });
      await app.waitForLog("[stripe] payment_intent.succeeded");
      assert.ok(true);
    });

    test("receives catch-all webhook", async (t) => {
      if (!hasPython) { t.skip("Python/FastAPI not available"); return; }
      await sendWebhook(projectId, "/any/path", { data: "test" });
      await app.waitForLog("[webhook] POST /any/path");
      assert.ok(true);
    });
  });

  // ── Agent Pull (testApps/agent-pull) ──

  describe("Agent Pull API (testApps/agent-pull)", () => {
    let agentApp;
    let projectId;
    let apiKey;

    before(async () => {
      const proj = await registerProject("agent-pull-e2e");
      projectId = proj.project_id;
      apiKey = proj.api_key;

      agentApp = await startTestApp(
        "node",
        [path.join(__dirname, "agent-pull/index.js")],
        {
          SIMPLEHOOK_KEY: proj.api_key,
          SIMPLEHOOK_SERVER: `http://localhost:${SERVER_PORT}`,
          LISTENER_ID: "agent-e2e",
        },
        "[agent] connected",
      );
    });

    after(() => {
      agentApp?.process.kill("SIGTERM");
    });

    test("agent receives webhook via pull", async () => {
      await sendWebhook(projectId, "/stripe/events", { type: "charge.succeeded", id: "ch_agent1" });
      await agentApp.waitForLog("charge.succeeded", 12000);
      assert.ok(true);
    });

    test("agent receives github webhook via pull", async () => {
      await sendWebhook(projectId, "/github/push", { ref: "refs/heads/main" });
      await agentApp.waitForLog("/github/push", 12000);
      assert.ok(true);
    });

    test("status endpoint returns data for this project", async () => {
      const res = await httpReq(SERVER_PORT, "GET", "/api/agent/status", null);
      // Need auth header — use raw http
      const statusRes = await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "127.0.0.1",
            port: SERVER_PORT,
            path: "/api/agent/status",
            headers: { authorization: `Bearer ${apiKey}` },
          },
          (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => resolve({ status: res.statusCode, json: () => JSON.parse(d) }));
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.strictEqual(statusRes.status, 200);
      const data = statusRes.json();
      assert.strictEqual(data.project_id, projectId);
      assert.ok("pending" in data.queue);
      assert.ok("cursors" in data);
    });

    test("instant pull returns events", async () => {
      // Send a fresh webhook
      await sendWebhook(projectId, "/test/instant", { mode: "instant" });
      await sleep(500);

      // Direct pull (not through the testApp loop)
      const pullRes = await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "127.0.0.1",
            port: SERVER_PORT,
            path: "/api/agent/pull?n=10&listener_id=instant-test",
            headers: { authorization: `Bearer ${apiKey}` },
          },
          (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => resolve({ status: res.statusCode, json: () => JSON.parse(d) }));
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.strictEqual(pullRes.status, 200);
      const data = pullRes.json();
      assert.ok(data.events.length >= 1, "expected at least 1 event");
      assert.ok(data.cursor, "expected cursor");
      assert.ok(typeof data.remaining === "number");
    });

    test("path filter returns only matching events", async () => {
      // Send to two paths
      await sendWebhook(projectId, "/stripe/filter-test", { type: "stripe.test" });
      await sendWebhook(projectId, "/github/filter-test", { type: "github.test" });
      await sleep(500);

      const pullRes = await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "127.0.0.1",
            port: SERVER_PORT,
            path: `/api/agent/pull?n=10&listener_id=filter-test&path=/stripe/*`,
            headers: { authorization: `Bearer ${apiKey}` },
          },
          (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => resolve({ status: res.statusCode, json: () => JSON.parse(d) }));
          },
        );
        req.on("error", reject);
        req.end();
      });
      const data = pullRes.json();
      assert.ok(data.events.length >= 1);
      assert.ok(data.events.every((e) => e.path.startsWith("/stripe/")));
    });
  });

  // ── SDK + Agent on same project ──

  describe("SDK + Agent coexistence", () => {
    let sdkApp;
    let projectId;
    let apiKey;

    before(async () => {
      const proj = await registerProject("combo-e2e");
      projectId = proj.project_id;
      apiKey = proj.api_key;

      // Start Express SDK app
      sdkApp = await startTestApp("node", [path.join(__dirname, "express/index.js")], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3091",
      });
    });

    after(() => {
      sdkApp?.process.kill("SIGTERM");
    });

    test("SDK receives webhook AND agent can pull same events", async () => {
      // Send webhook — SDK will receive it via WebSocket
      await sendWebhook(projectId, "/stripe/events", { type: "combo.test", id: "ch_combo" });

      // SDK should get it
      await sdkApp.waitForLog("[stripe] combo.test");

      // Agent should also be able to pull it (different cursor)
      await sleep(500);
      const pullRes = await new Promise((resolve, reject) => {
        const req = http.get(
          {
            hostname: "127.0.0.1",
            port: SERVER_PORT,
            path: "/api/agent/pull?n=10&listener_id=combo-agent",
            headers: { authorization: `Bearer ${apiKey}` },
          },
          (res) => {
            let d = "";
            res.on("data", (c) => (d += c));
            res.on("end", () => resolve({ status: res.statusCode, json: () => JSON.parse(d) }));
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.strictEqual(pullRes.status, 200);
      const data = pullRes.json();
      assert.ok(data.events.length >= 1, "agent should see the same event");
      assert.ok(data.events.some((e) => e.body && e.body.includes("combo.test")));
    });
  });

  // ── Go SDK ──

  describe("Go SDK (testApps/go)", () => {
    let app;
    let projectId;
    let hasGo = true;

    before(async () => {
      try {
        execSync("go version", { stdio: "ignore" });
      } catch {
        hasGo = false;
        return;
      }

      const proj = await registerProject("go-e2e");
      projectId = proj.project_id;

      // Build the Go test app
      try {
        execSync("go build -o testapp .", { cwd: path.join(__dirname, "go"), stdio: "ignore" });
      } catch (e) {
        hasGo = false;
        return;
      }

      app = await startTestApp(path.join(__dirname, "go/testapp"), [], {
        SIMPLEHOOK_KEY: proj.api_key,
        SIMPLEHOOK_URL: `ws://localhost:${SERVER_PORT}`,
        PORT: "3093",
      }, "[simplehook] connected");
    });

    after(() => {
      app?.process.kill("SIGTERM");
    });

    test("receives stripe webhook", async (t) => {
      if (!hasGo) { t.skip("Go not available"); return; }
      await sendWebhook(projectId, "/stripe/events", { type: "charge.succeeded" });
      await app.waitForLog("[stripe] charge.succeeded");
      assert.ok(true);
    });

    test("receives catch-all webhook", async (t) => {
      if (!hasGo) { t.skip("Go not available"); return; }
      await sendWebhook(projectId, "/any/path", { data: "test" });
      await app.waitForLog("[webhook] POST /any/path");
      assert.ok(true);
    });
  });
});
