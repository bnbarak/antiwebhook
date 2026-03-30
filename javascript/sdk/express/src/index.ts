import WebSocket from "ws";
import http from "node:http";
import type {
  App,
  Connection,
  ListenOptions,
  RequestFrame,
  ResponseFrame,
} from "./types.js";
import { isExplicitlyDisabled, isProduction, parseFrame, sanitizeHeaders } from "./utils.js";

export type { App, Connection, ListenOptions, RequestFrame, ResponseFrame };

const DEFAULT_URL = "wss://hooks.simplehook.dev";
const MAX_BACKOFF = 30_000;
const NOOP_CONNECTION: Connection = { close() {} };

export function listen(app: App, apiKey: string, opts: ListenOptions = {}): Connection {
  if (!opts.forceEnable && isProduction()) return NOOP_CONNECTION;
  if (isExplicitlyDisabled()) return NOOP_CONNECTION;

  const serverUrl = opts.serverUrl ?? process.env.SIMPLEHOOK_URL ?? DEFAULT_URL;
  const log = opts.silent ? () => {} : console.log.bind(console);

  let closed = false;
  let currentWs: WebSocket | null = null;
  let backoff = 1000;

  const loopback = http.createServer((req, res) => app.handle(req, res));
  let loopbackPort: number;

  loopback.listen(0, "127.0.0.1", () => {
    loopbackPort = (loopback.address() as { port: number }).port;
    connect();
  });

  function connect() {
    if (closed) return;

    const ws = new WebSocket(`${serverUrl}/tunnel?key=${apiKey}`);
    currentWs = ws;

    ws.on("open", () => {
      log("[simplehook] connected");
      backoff = 1000;
      opts.onConnect?.();
    });

    ws.on("message", (raw: Buffer) => {
      const parsed = parseFrame(raw);
      if (!parsed || typeof parsed !== "object") return;

      const frame = parsed as { type?: string };

      if (frame.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (frame.type === "request") {
        forwardToLoopback(ws, frame as RequestFrame);
      }
    });

    ws.on("close", () => {
      if (closed) return;
      log(`[simplehook] disconnected, reconnecting in ${backoff / 1000}s...`);
      opts.onDisconnect?.();
      setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_BACKOFF);
    });

    ws.on("error", () => {});
  }

  function forwardToLoopback(ws: WebSocket, frame: RequestFrame) {
    const body = frame.body ? Buffer.from(frame.body, "base64") : null;
    const headers = sanitizeHeaders(frame.headers ?? {}, body?.length ?? null);

    const proxyReq = http.request(
      {
        hostname: "127.0.0.1",
        port: loopbackPort,
        path: frame.path,
        method: frame.method,
        headers,
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", () => {
          const responseBody = Buffer.concat(chunks);
          const respHeaders: Record<string, string> = {};
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (typeof v === "string") respHeaders[k] = v;
          }

          sendResponse(ws, {
            type: "response",
            id: frame.id,
            status: proxyRes.statusCode ?? 500,
            headers: respHeaders,
            body: responseBody.length > 0 ? responseBody.toString("base64") : null,
          });
        });
      },
    );

    proxyReq.on("error", () => {
      sendResponse(ws, {
        type: "response",
        id: frame.id,
        status: 502,
        headers: {},
        body: null,
      });
    });

    if (body) proxyReq.write(body);
    proxyReq.end();
  }

  function sendResponse(ws: WebSocket, frame: ResponseFrame) {
    try {
      ws.send(JSON.stringify(frame));
    } catch {}
  }

  return {
    close() {
      closed = true;
      currentWs?.close();
      currentWs = null;
      loopback.close();
    },
  };
}
