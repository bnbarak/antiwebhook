import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { SimplehookAgent } from "../src/agent.js";
import type { WebhookEvent } from "../src/agent.js";

// ── Mock HTTP server ─────────────────────────────────────────────────

let mockServer: http.Server;
let mockPort: number;
let lastRequest: { method: string; url: string; headers: Record<string, string> };
let mockResponse: { status: number; body: string; headers?: Record<string, string> };

function setMockResponse(status: number, body: unknown, headers?: Record<string, string>) {
  mockResponse = { status, body: JSON.stringify(body), headers };
}

beforeAll(async () => {
  mockServer = http.createServer((req, res) => {
    lastRequest = {
      method: req.method ?? "GET",
      url: req.url ?? "/",
      headers: req.headers as Record<string, string>,
    };

    res.writeHead(mockResponse.status, {
      "content-type": "application/json",
      ...mockResponse.headers,
    });
    res.end(mockResponse.body);
  });

  await new Promise<void>((resolve) => {
    mockServer.listen(0, "127.0.0.1", () => {
      mockPort = (mockServer.address() as { port: number }).port;
      resolve();
    });
  });

  // Default mock response
  setMockResponse(200, { events: [], cursor: null, remaining: 0 });
});

afterAll(() => {
  mockServer.close();
});

function createAgent(opts?: { listenerId?: string }) {
  return new SimplehookAgent("ak_test_key", {
    serverUrl: `http://127.0.0.1:${mockPort}`,
    listenerId: opts?.listenerId,
  });
}

// ── Constructor tests ────────────────────────────────────────────────

describe("SimplehookAgent constructor", () => {
  it("creates with defaults", () => {
    const agent = new SimplehookAgent("ak_test");
    expect(agent).toBeInstanceOf(SimplehookAgent);
  });

  it("creates with custom options", () => {
    const agent = new SimplehookAgent("ak_test", {
      serverUrl: "http://localhost:9999",
      listenerId: "my-agent",
    });
    expect(agent).toBeInstanceOf(SimplehookAgent);
  });
});

// ── pull() tests ─────────────────────────────────────────────────────

describe("pull()", () => {
  it("sends correct default query params", async () => {
    setMockResponse(200, { events: [], cursor: null, remaining: 0 });
    const agent = createAgent();

    await agent.pull();

    expect(lastRequest.url).toContain("listener_id=default");
    expect(lastRequest.headers.authorization).toBe("Bearer ak_test_key");
  });

  it("sends custom query params", async () => {
    setMockResponse(200, { events: [], cursor: null, remaining: 0 });
    const agent = createAgent({ listenerId: "ci-bot" });

    await agent.pull({ n: 5, path: "/stripe/*", wait: true, timeout: 60 });

    expect(lastRequest.url).toContain("listener_id=ci-bot");
    expect(lastRequest.url).toContain("n=5");
    expect(lastRequest.url).toContain("path=%2Fstripe%2F*");
    expect(lastRequest.url).toContain("wait=true");
    expect(lastRequest.url).toContain("timeout=60");
  });

  it("sends after param without advancing cursor", async () => {
    setMockResponse(200, { events: [], cursor: "evt_old", remaining: 0 });
    const agent = createAgent();

    await agent.pull({ after: "evt_123" });

    expect(lastRequest.url).toContain("after=evt_123");
  });

  it("returns PullResult shape", async () => {
    const mockEvent = {
      id: "evt_abc",
      path: "/stripe/webhook",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"type":"charge.succeeded"}',
      status: "delivered",
      received_at: "2026-04-06T14:00:00Z",
    };
    setMockResponse(200, { events: [mockEvent], cursor: "evt_abc", remaining: 3 });
    const agent = createAgent();

    const result = await agent.pull();

    expect(result.events).toHaveLength(1);
    expect(result.events[0].id).toBe("evt_abc");
    expect(result.events[0].path).toBe("/stripe/webhook");
    expect(result.cursor).toBe("evt_abc");
    expect(result.remaining).toBe(3);
  });

  it("throws on 401 Unauthorized", async () => {
    setMockResponse(401, { error: "unauthorized" });
    const agent = createAgent();

    await expect(agent.pull()).rejects.toThrow("Unauthorized");
  });

  it("throws on 409 Conflict", async () => {
    setMockResponse(409, { error: "listener_id is already being consumed" });
    const agent = createAgent();

    await expect(agent.pull({ wait: true })).rejects.toThrow("already being consumed");
  });

  it("throws on 500 server error", async () => {
    setMockResponse(500, { error: "internal" });
    const agent = createAgent();

    await expect(agent.pull()).rejects.toThrow("HTTP 500");
  });

  it("throws when stream option is passed to pull()", async () => {
    const agent = createAgent();

    await expect(agent.pull({ stream: true })).rejects.toThrow("Use agent.stream()");
  });
});

// ── status() tests ───────────────────────────────────────────────────

describe("status()", () => {
  it("returns StatusResult shape", async () => {
    setMockResponse(200, {
      project_id: "p_test",
      queue: { pending: 5, failed: 1, delivered_last_hour: 100, oldest_pending: null },
      listeners: { connected: ["default"], disconnected: [] },
      cursors: { default: { last_event: "evt_99", behind: 2 } },
      routes: [{ path: "/stripe/", mode: "queue", pending: 3 }],
    });
    const agent = createAgent();

    const result = await agent.status();

    expect(result.project_id).toBe("p_test");
    expect(result.queue.pending).toBe(5);
    expect(result.listeners.connected).toContain("default");
    expect(result.cursors.default.behind).toBe(2);
    expect(result.routes[0].path).toBe("/stripe/");
  });

  it("sends auth header", async () => {
    setMockResponse(200, {
      project_id: "p_test",
      queue: { pending: 0, failed: 0, delivered_last_hour: 0, oldest_pending: null },
      listeners: { connected: [], disconnected: [] },
      cursors: {},
      routes: [],
    });
    const agent = createAgent();

    await agent.status();

    expect(lastRequest.url).toBe("/api/agent/status");
    expect(lastRequest.headers.authorization).toBe("Bearer ak_test_key");
  });

  it("throws on 401", async () => {
    setMockResponse(401, { error: "unauthorized" });
    const agent = createAgent();

    await expect(agent.status()).rejects.toThrow("Unauthorized");
  });
});

// ── stream() tests ───────────────────────────────────────────────────

describe("stream()", () => {
  it("receives SSE events and calls handler", async () => {
    // Replace the mock server temporarily with an SSE server
    const sseServer = http.createServer((req, res) => {
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "close",
      });

      // Send two events then close
      res.write('event: webhook\ndata: {"id":"evt_1","path":"/stripe/test","method":"POST","headers":{},"body":"{}","status":"delivered","received_at":"2026-01-01T00:00:00Z"}\n\n');
      res.write("event: heartbeat\ndata: {}\n\n");
      res.write('event: webhook\ndata: {"id":"evt_2","path":"/github/push","method":"POST","headers":{},"body":"{}","status":"delivered","received_at":"2026-01-01T00:00:01Z"}\n\n');

      setTimeout(() => res.end(), 100);
    });

    const ssePort = await new Promise<number>((resolve) => {
      sseServer.listen(0, "127.0.0.1", () => {
        resolve((sseServer.address() as { port: number }).port);
      });
    });

    const received: WebhookEvent[] = [];
    const agent = new SimplehookAgent("ak_test", {
      serverUrl: `http://127.0.0.1:${ssePort}`,
    });

    await agent.stream((event) => {
      received.push(event);
    });

    sseServer.close();

    expect(received).toHaveLength(2);
    expect(received[0].id).toBe("evt_1");
    expect(received[1].id).toBe("evt_2");
    // Heartbeat was skipped (no id field)
  });
});
