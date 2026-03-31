import { WebSocketServer, WebSocket } from "ws";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import type { RequestFrame } from "../src/types.js";

export interface MockServer {
  port: number;
  wss: WebSocketServer;
  close(): void;
  waitForConnection(): Promise<WebSocket>;
  sendRequest(ws: WebSocket, frame: Partial<RequestFrame> & { id: string }): void;
  waitForResponse(ws: WebSocket): Promise<Record<string, unknown>>;
}

export function createMockServer(): MockServer {
  const wss = new WebSocketServer({ port: 0 });
  const port = (wss.address() as { port: number }).port;

  return {
    port,
    wss,

    close() {
      wss.close();
    },

    waitForConnection(): Promise<WebSocket> {
      return new Promise((resolve) => {
        wss.once("connection", resolve);
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
}

export async function createTestApp(): Promise<{
  app: FastifyInstance;
  received: Array<{ method: string; url: string; body: string }>;
}> {
  const received: Array<{ method: string; url: string; body: string }> = [];

  const app = Fastify();

  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", { parseAs: "string" }, (_req, body, done) => {
    done(null, body);
  });

  app.all("/*", (request, reply) => {
    const body = typeof request.body === "string" ? request.body : "";
    received.push({ method: request.method, url: request.url, body });
    reply.header("content-type", "application/json").send({ received: true });
  });

  await app.ready();

  return { app, received };
}
