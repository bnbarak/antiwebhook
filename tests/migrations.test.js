/**
 * Migration safety tests.
 *
 * Validates that:
 * 1. All migrations run cleanly on a fresh database
 * 2. Server starts successfully after migrations
 * 3. Core tables exist with expected columns
 *
 * Run: node --test migrations.test.js
 * Requires: docker compose up postgres -d && cargo build
 */

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn, execSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");

const SERVER_BIN = path.join(
  __dirname,
  "../server/target/debug/simplehook-server",
);
const DB_URL = "postgres://admin:secret@localhost:5434/simplehook_migration_test";
const PORT = 8410;

let serverProcess = null;

function request(method, urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port: PORT, path: urlPath, method },
      (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve({ status: res.statusCode, body: d }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      request("GET", "/health")
        .then((res) => {
          if (res.status === 200) resolve();
          else throw new Error(`status ${res.status}`);
        })
        .catch(() => {
          if (++attempts >= maxAttempts)
            reject(new Error("Server not ready"));
          else setTimeout(check, 300);
        });
    };
    check();
  });
}

describe("migrations: fresh database", () => {
  before(async () => {
    // Create a fresh test database
    try {
      execSync(
        `psql "postgres://admin:secret@localhost:5434/postgres" -c "DROP DATABASE IF EXISTS simplehook_migration_test;" 2>/dev/null`,
      );
    } catch {}
    execSync(
      `psql "postgres://admin:secret@localhost:5434/postgres" -c "CREATE DATABASE simplehook_migration_test;"`,
    );

    // Start server — migrations auto-run on startup
    serverProcess = spawn(SERVER_BIN, [], {
      env: {
        ...process.env,
        DATABASE_URL: DB_URL,
        PORT: String(PORT),
        BASE_URL: `http://localhost:${PORT}`,
        FRONTEND_URL: "http://localhost:4000",
        RUST_LOG: "simplehook_server=warn",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    serverProcess.stderr.on("data", (d) => (stderr += d.toString()));
    serverProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        console.error("Server crashed:", stderr.slice(-500));
      }
    });

    await waitForServer();
  });

  after(() => {
    serverProcess?.kill("SIGTERM");
    // Clean up test database
    try {
      execSync(
        `psql "postgres://admin:secret@localhost:5434/postgres" -c "DROP DATABASE IF EXISTS simplehook_migration_test;" 2>/dev/null`,
      );
    } catch {}
  });

  test("server starts successfully with all migrations", async () => {
    const res = await request("GET", "/health");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body, "ok");
  });

  test("all migration versions are recorded", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT COUNT(*) FROM _sqlx_migrations;"`,
    )
      .toString()
      .trim();
    assert.strictEqual(parseInt(result), 4, `expected 4 migrations, got ${result}`);
  });

  test("projects table has billing columns", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name IN ('billing_status','subscription_period_end','user_id','deleted_at') ORDER BY column_name;"`,
    )
      .toString()
      .trim();
    assert.ok(result.includes("billing_status"), "missing billing_status");
    assert.ok(result.includes("user_id"), "missing user_id");
  });

  test("users table has trial columns", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name LIKE 'trial%' ORDER BY column_name;"`,
    )
      .toString()
      .trim();
    assert.ok(result.includes("trial_ends_at"), "missing trial_ends_at");
    assert.ok(result.includes("trial_reminder_sent"), "missing trial_reminder_sent");
    assert.ok(result.includes("trial_expired_sent"), "missing trial_expired_sent");
  });

  test("routes table has soft delete column", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name='routes' AND column_name='deleted_at';"`,
    )
      .toString()
      .trim();
    assert.ok(result.includes("deleted_at"), "missing deleted_at");
  });

  test("routes unique index is partial (non-deleted only)", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT indexdef FROM pg_indexes WHERE tablename='routes' AND indexname='idx_routes_active_unique';"`,
    )
      .toString()
      .trim();
    assert.ok(result.includes("deleted_at IS NULL"), "unique index should be partial");
  });

  test("email_log table exists", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='email_log';"`,
    )
      .toString()
      .trim();
    assert.strictEqual(parseInt(result), 1, "email_log table missing");
  });

  test("sessions table exists with correct foreign key", async () => {
    const result = execSync(
      `psql "${DB_URL}" -t -c "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='sessions' AND constraint_type='FOREIGN KEY';"`,
    )
      .toString()
      .trim();
    assert.ok(result.length > 0, "sessions should have foreign key to users");
  });

  test("signup works on fresh DB", async () => {
    const res = await new Promise((resolve, reject) => {
      const body = JSON.stringify({
        name: "Migration Test",
        email: "migration@test.com",
        password: "testpass123",
      });
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port: PORT,
          path: "/auth/sign-up/email",
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(body),
          },
        },
        (res) => {
          let d = "";
          res.on("data", (c) => (d += c));
          res.on("end", () =>
            resolve({ status: res.statusCode, body: d }),
          );
        },
      );
      req.on("error", reject);
      req.write(body);
      req.end();
    });

    assert.strictEqual(res.status, 200, `signup failed: ${res.body}`);
    const data = JSON.parse(res.body);
    assert.ok(data.user.id, "should return user id");
    assert.ok(data.token, "should return session token");
  });
});
