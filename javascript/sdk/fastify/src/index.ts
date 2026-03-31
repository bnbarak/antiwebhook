import WebSocket from "ws";
import type { FastifyInstance } from "fastify";
import type {
  Connection,
  ListenOptions,
  RequestFrame,
  ResponseFrame,
} from "./types.js";
import { isExplicitlyDisabled, isProduction, parseFrame, sanitizeHeaders } from "./utils.js";

export type { Connection, ListenOptions, RequestFrame, ResponseFrame };

const DEFAULT_URL = "wss://hook.simplehook.dev";
const MAX_BACKOFF = 30_000;
const NOOP_CONNECTION: Connection = { close() {} };

export function listenToWebhooks(
  app: FastifyInstance,
  apiKey: string,
  opts: ListenOptions = {},
): Connection {
  if (!opts.forceEnable && isProduction()) return NOOP_CONNECTION;
  if (isExplicitlyDisabled()) return NOOP_CONNECTION;

  const serverUrl = opts.serverUrl ?? process.env.SIMPLEHOOK_URL ?? DEFAULT_URL;
  const log = opts.silent ? () => {} : console.log.bind(console);

  let closed = false;
  let currentWs: WebSocket | null = null;
  let backoff = 1000;

  connect();

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
        forwardViaInject(ws, frame as RequestFrame);
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

  async function forwardViaInject(ws: WebSocket, frame: RequestFrame) {
    const bodyBuffer = frame.body ? Buffer.from(frame.body, "base64") : null;
    const headers = sanitizeHeaders(frame.headers ?? {}, bodyBuffer?.length ?? null);

    try {
      const response = await app.inject({
        method: frame.method as any,
        url: frame.path,
        headers,
        payload: bodyBuffer ?? undefined,
      });

      const respHeaders: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers)) {
        if (typeof v === "string") respHeaders[k] = v;
      }

      const responseBody = response.rawPayload;

      sendResponse(ws, {
        type: "response",
        id: frame.id,
        status: response.statusCode,
        headers: respHeaders,
        body: responseBody.length > 0 ? responseBody.toString("base64") : null,
      });
    } catch {
      sendResponse(ws, {
        type: "response",
        id: frame.id,
        status: 502,
        headers: {},
        body: null,
      });
    }
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
    },
  };
}
