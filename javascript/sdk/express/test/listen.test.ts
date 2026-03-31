import { describe, it, expect, afterEach } from "vitest";
import { listenToWebhooks } from "../src/index.js";
import { createMockServer, mockApp } from "./helpers.js";
import type { Connection } from "../src/types.js";

describe("listenToWebhooks", () => {
  let conn: Connection | null = null;
  let server: ReturnType<typeof createMockServer> | null = null;

  afterEach(() => {
    conn?.close();
    server?.close();
    conn = null;
    server = null;
  });

  describe("dev mode guard", () => {
    it("returns noop in production", () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      conn = listenToWebhooks({ handle: () => {} }, "ak_test", { silent: true });
      conn.close();

      process.env.NODE_ENV = origEnv;
    });

    it("connects with forceEnable in production", () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      conn = listenToWebhooks({ handle: () => {} }, "ak_test", {
        forceEnable: true,
        silent: true,
        serverUrl: "ws://localhost:19999",
      });

      process.env.NODE_ENV = origEnv;
    });

    it("skips when SIMPLEHOOK_ENABLED=false", () => {
      process.env.SIMPLEHOOK_ENABLED = "false";

      conn = listenToWebhooks({ handle: () => {} }, "ak_test", { silent: true });

      delete process.env.SIMPLEHOOK_ENABLED;
    });
  });

  describe("WebSocket protocol", () => {
    it("responds to ping with pong", async () => {
      // Arrange
      server = createMockServer();
      conn = listenToWebhooks({ handle: () => {} }, "ak_test", {
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
      const { app } = mockApp();
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

    it("delivers request to the correct path", async () => {
      // Arrange
      server = createMockServer();
      const { app, received } = mockApp();
      conn = listenToWebhooks(app, "ak_test", {
        serverUrl: `ws://localhost:${server.port}`,
        silent: true,
      });
      const ws = await server.waitForConnection();

      // Act
      server.sendRequest(ws, { id: "evt_1", method: "PUT", path: "/github/push" });
      await server.waitForResponse(ws);

      // Assert
      expect(received).toHaveLength(1);
      expect(received[0].method).toBe("PUT");
      expect(received[0].url).toBe("/github/push");
    });

    it("handles empty body", async () => {
      // Arrange
      server = createMockServer();
      const { app, received } = mockApp();
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
      expect(received[0].body).toBe("");
    });

    it("includes listener_id in WS URL when passed via opts", async () => {
      // Arrange
      server = createMockServer();
      conn = listenToWebhooks({ handle: () => {} }, "ak_test", {
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
      conn = listenToWebhooks({ handle: () => {} }, "ak_test", "my-listener", {
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
      conn = listenToWebhooks({ handle: () => {} }, "ak_test", {
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
      const receivedHeaders: Record<string, string> = {};
      const app = {
        handle(req: any, res: any) {
          Object.assign(receivedHeaders, req.headers);
          req.on("data", () => {});
          req.on("end", () => {
            res.writeHead(200);
            res.end();
          });
        },
      };
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
  });
});
