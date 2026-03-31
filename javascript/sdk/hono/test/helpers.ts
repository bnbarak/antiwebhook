import { WebSocketServer, WebSocket } from "ws";
import { Hono } from "hono";
import type { RequestFrame } from "../src/types.js";

export type App = InstanceType<typeof Hono>;

export interface MockServer {
  port: number;
  wss: WebSocketServer;
  lastConnectionUrl: string | null;
  close(): void;
  waitForConnection(): Promise<WebSocket>;
  sendRequest(ws: WebSocket, frame: Partial<RequestFrame> & { id: string }): void;
  waitForResponse(ws: WebSocket): Promise<Record<string, unknown>>;
}

export function createMockServer(): MockServer {
  const wss = new WebSocketServer({ port: 0 });
  const port = (wss.address() as { port: number }).port;

  const server: MockServer = {
    port,
    wss,
    lastConnectionUrl: null,

    close() {
      wss.close();
    },

    waitForConnection(): Promise<WebSocket> {
      return new Promise((resolve) => {
        wss.once("connection", (ws, req) => {
          server.lastConnectionUrl = req.url ?? null;
          resolve(ws);
        });
      });
    },

    sendRequest(ws: WebSocket, frame: Partial<RequestFrame> & { id: string }) {
      ws.send(
        JSON.stringify({
          type: "request",
          method: "POST",
          path: "/test",
          headers: { "content-type": "application/json" },
          body: null,
          ...frame,
        }),
      );
    },

    waitForResponse(ws: WebSocket): Promise<Record<string, unknown>> {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("response timeout")), 3000);

        ws.on("message", function handler(raw: Buffer) {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "pong") return;
          ws.off("message", handler);
          clearTimeout(timeout);
          resolve(msg);
        });
      });
    },
  };

  return server;
}

export async function createTestApp(): Promise<{
  app: App;
  received: Array<{ method: string; url: string; body: string }>;
}> {
  const received: Array<{ method: string; url: string; body: string }> = [];

  const app = new Hono();

  app.all("/*", async (c) => {
    const body = await c.req.text().catch(() => "");
    const url = new URL(c.req.url);
    received.push({ method: c.req.method, url: url.pathname, body });
    return c.json({ received: true });
  });

  return { app, received };
}
