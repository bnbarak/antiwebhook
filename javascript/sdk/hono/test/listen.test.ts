import { describe, it, expect, afterEach } from "vitest";
import { listenToWebhooks } from "../src/index.js";
import { createMockServer, createTestApp } from "./helpers.js";
import type { Connection } from "../src/types.js";
import { Hono } from "hono";
import type { App } from "./helpers.js";

describe("listenToWebhooks", () => {
  let conn: Connection | null = null;
  let server: ReturnType<typeof createMockServer> | null = null;
  let app: App | null = null;

  afterEach(async () => {
    conn?.close();
    server?.close();
    conn = null;
    server = null;
    app = null;
  });

  describe("dev mode guard", () => {
    it("returns noop in production", async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", { silent: true });
      conn.close();

      process.env.NODE_ENV = origEnv;
    });

    it("connects with forceEnable in production", async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", {
        forceEnable: true,
        silent: true,
        serverUrl: "ws://localhost:19999",
      });

      process.env.NODE_ENV = origEnv;
    });

    it("skips when SIMPLEHOOK_ENABLED=false", async () => {
      process.env.SIMPLEHOOK_ENABLED = "false";

      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", { silent: true });

      delete process.env.SIMPLEHOOK_ENABLED;
    });
  });

  describe("WebSocket protocol", () => {
    it("responds to ping with pong", async () => {
      // Arrange
      server = createMockServer();
      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      ws.send(JSON.stringify({ type: "ping" }));
      const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("pong timeout")), 3000);
        ws.on("message", (raw: Buffer) => {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "pong") {
            clearTimeout(timeout);
            resolve(msg);
          }
        });
      });

      // Assert
      expect(response.type).toBe("pong");
    });

    it("forwards webhook request and returns response", async () => {
      // Arrange
      server = createMockServer();
      const testApp = await createTestApp();
      app = testApp.app;
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      server.sendRequest(ws, {
        id: "evt_abc",
        path: "/stripe/webhook",
        body: Buffer.from('{"type":"test"}').toString("base64"),
      });
      const response = await server.waitForResponse(ws);

      // Assert
      expect(response.type).toBe("response");
      expect(response.id).toBe("evt_abc");
      expect(response.status).toBe(200);
      const body = Buffer.from(response.body as string, "base64").toString();
      expect(JSON.parse(body)).toEqual({ received: true });
    });

    it("delivers request to the correct path and method", async () => {
      // Arrange
      server = createMockServer();
      const testApp = await createTestApp();
      app = testApp.app;
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      server.sendRequest(ws, { id: "evt_1", method: "PUT", path: "/github/push" });
      await server.waitForResponse(ws);

      // Assert
      expect(testApp.received).toHaveLength(1);
      expect(testApp.received[0].method).toBe("PUT");
      expect(testApp.received[0].url).toBe("/github/push");
    });

    it("handles empty body", async () => {
      // Arrange
      server = createMockServer();
      const testApp = await createTestApp();
      app = testApp.app;
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      server.sendRequest(ws, { id: "evt_empty", method: "GET", path: "/health", body: null });
      const response = await server.waitForResponse(ws);

      // Assert
      expect(response.status).toBe(200);
      expect(testApp.received[0].body).toBe("");
    });

    it("includes listener_id in WS URL when passed via opts", async () => {
      // Arrange
      server = createMockServer();
      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
        listenerId: "my-listener",
      });
      await server.waitForConnection();

      // Assert
      expect(server.lastConnectionUrl).toContain("listener_id=my-listener");
    });

    it("includes listener_id in WS URL when passed as shorthand string", async () => {
      // Arrange
      server = createMockServer();
      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", "my-listener", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      await server.waitForConnection();

      // Assert
      expect(server.lastConnectionUrl).toContain("listener_id=my-listener");
    });

    it("does not include listener_id in WS URL when not set", async () => {
      // Arrange
      server = createMockServer();
      app = new Hono();
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      await server.waitForConnection();

      // Assert
      expect(server.lastConnectionUrl).not.toContain("listener_id");
    });

    it("lowercases forwarded headers", async () => {
      // Arrange
      server = createMockServer();
      app = new Hono();

      const receivedHeaders: Record<string, string> = {};
      app.all("/*", async (c) => {
        c.req.raw.headers.forEach((v, k) => {
          receivedHeaders[k] = v;
        });
        return c.json({ ok: true });
      });

      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      server.sendRequest(ws, {
        id: "evt_hdr",
        headers: { "X-Custom-Header": "TestValue", "Content-Type": "text/plain" },
      });
      await server.waitForResponse(ws);

      // Assert
      expect(receivedHeaders["x-custom-header"]).toBe("TestValue");
      expect(receivedHeaders["content-type"]).toBe("text/plain");
    });

    it("returns 502 when request fails", async () => {
      // Arrange
      server = createMockServer();
      app = new Hono();

      // Override app.request to throw
      const originalRequest = app.request.bind(app);
      app.request = (() => { throw new Error("forced failure"); }) as any;

      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      server.sendRequest(ws, { id: "evt_fail" });
      const response = await server.waitForResponse(ws);

      // Assert
      expect(response.type).toBe("response");
      expect(response.id).toBe("evt_fail");
      expect(response.status).toBe(502);

      // Restore
      app.request = originalRequest;
    });
  });
});
