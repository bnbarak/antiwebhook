import { WebSocketServer, WebSocket } from "ws";
import type { RequestFrame } from "../src/types.js";

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

export function mockApp(onRequest?: (method: string, url: string, body: string) => void) {
  const received: Array<{ method: string; url: string; body: string }> = [];

  const app = {
    handle(req: any, res: any) {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        received.push({ method: req.method, url: req.url, body });
        onRequest?.(req.method, req.url, body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end('{"received":true}');
      });
    },
  };

  return { app, received };
}
