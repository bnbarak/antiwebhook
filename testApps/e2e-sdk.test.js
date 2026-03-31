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
});
