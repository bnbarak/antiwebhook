/**
 * Agent Pull test app — consumes webhooks via HTTP pull API.
 *
 * No WebSocket, no SDK. Just HTTP requests to /api/agent/pull.
 *
 * Env:
 *   SIMPLEHOOK_KEY     — API key (Bearer token)
 *   SIMPLEHOOK_SERVER  — Server base URL (default: http://localhost:8413)
 *   LISTENER_ID        — Listener ID for cursor tracking (default: "agent-e2e")
 *
 * Prints consumed events to stdout for test verification.
 */

const http = require("node:http");

const SERVER = process.env.SIMPLEHOOK_SERVER || "http://localhost:8413";
const API_KEY = process.env.SIMPLEHOOK_KEY;
const LISTENER_ID = process.env.LISTENER_ID || "agent-e2e";

if (!API_KEY) {
  console.error("SIMPLEHOOK_KEY required");
  process.exit(1);
}

function fetch(urlStr) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const req = http.get(
      {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        headers: { authorization: `Bearer ${API_KEY}` },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: data,
            json: () => JSON.parse(data),
          }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function pullLoop() {
  console.log(`[agent] starting pull loop (listener_id=${LISTENER_ID})`);
  console.log(`[agent] server: ${SERVER}`);
  console.log("[agent] connected"); // signal for test harness

  while (true) {
    try {
      const res = await fetch(
        `${SERVER}/api/agent/pull?wait=true&timeout=10&listener_id=${LISTENER_ID}`,
      );

      if (res.status === 200) {
        const data = res.json();
        for (const event of data.events) {
          const body =
            typeof event.body === "string" ? event.body : JSON.stringify(event.body);
          console.log(`[agent] ${event.method} ${event.path} body=${body}`);
        }
        if (data.events.length === 0) {
          // Timeout with no events, loop again
        }
      } else if (res.status === 401) {
        console.error("[agent] unauthorized — bad API key");
        process.exit(1);
      } else {
        console.error(`[agent] unexpected status ${res.status}: ${res.body}`);
      }
    } catch (err) {
      console.error(`[agent] error: ${err.message}`);
      // Wait before retry
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

pullLoop();

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
