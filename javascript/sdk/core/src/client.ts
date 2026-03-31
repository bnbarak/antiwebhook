import WebSocket from "ws";
import type {
  Connection,
  DispatchFn,
  ListenOptions,
  RequestFrame,
  ResponseFrame,
} from "./types.js";
import { isExplicitlyDisabled, isProduction, parseFrame } from "./utils.js";

const DEFAULT_URL = "wss://hook.simplehook.dev";
const MAX_BACKOFF = 30_000;
const NOOP_CONNECTION: Connection = { close() {} };

export function createClient(
  dispatchFn: DispatchFn,
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
        handleRequest(ws, frame as RequestFrame);
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

  async function handleRequest(ws: WebSocket, frame: RequestFrame) {
    try {
      const response = await dispatchFn(frame);
      sendResponse(ws, response);
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
