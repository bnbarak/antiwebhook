import http from "node:http";
import https from "node:https";
import { verifyWebhook } from "./verify.js";

// ── Types ────────────────────────────────────────────────────────────

export interface WebhookEvent {
  id: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  status: string;
  received_at: string;
  webhook_id?: string;
  webhook_timestamp?: number;
  webhook_signature?: string;
  /** Set by the SDK after verifying the delivery signature. */
  verified?: boolean;
}

export interface PullResult {
  events: WebhookEvent[];
  cursor: string | null;
  remaining: number;
}

export interface PullOptions {
  /** Number of events to return (1-100). Default: 1 */
  n?: number;
  /** Path glob filter (e.g. "/stripe/*") */
  path?: string;
  /** Long-poll: block until event arrives. Default: false */
  wait?: boolean;
  /** SSE stream mode. Default: false */
  stream?: boolean;
  /** Timeout in seconds (for wait/stream). Default: 30 */
  timeout?: number;
  /** Override cursor — read from this event ID without advancing */
  after?: string;
}

export interface QueueStatus {
  pending: number;
  failed: number;
  delivered_last_hour: number;
  oldest_pending: string | null;
}

export interface CursorInfo {
  last_event: string | null;
  behind: number;
}

export interface StatusResult {
  project_id: string;
  queue: QueueStatus;
  listeners: { connected: string[]; disconnected: string[] };
  cursors: Record<string, CursorInfo>;
  routes: Array<{ path: string; mode: string; pending: number }>;
}

export interface AgentOptions {
  /** Server base URL. Default: "https://hook.simplehook.dev" */
  serverUrl?: string;
  /** Listener ID for cursor tracking. Default: "default" */
  listenerId?: string;
}

// ── Agent Client ─────────────────────────────────────────────────────

export class SimplehookAgent {
  private apiKey: string;
  private baseUrl: string;
  private listenerId: string;

  constructor(apiKey: string, opts: AgentOptions = {}) {
    this.apiKey = apiKey;
    this.baseUrl = opts.serverUrl ?? process.env.SIMPLEHOOK_SERVER ?? "https://hook.simplehook.dev";
    this.listenerId = opts.listenerId ?? "default";
  }

  /**
   * Pull next events. Returns immediately by default.
   * Use `wait: true` to long-poll until an event arrives.
   */
  async pull(opts: PullOptions = {}): Promise<PullResult> {
    const params = new URLSearchParams();
    params.set("listener_id", this.listenerId);
    if (opts.n !== undefined) params.set("n", String(opts.n));
    if (opts.path) params.set("path", opts.path);
    if (opts.wait) params.set("wait", "true");
    if (opts.timeout !== undefined) params.set("timeout", String(opts.timeout));
    if (opts.after) params.set("after", opts.after);

    if (opts.stream) {
      throw new Error("Use agent.stream() for SSE mode");
    }

    const res = await this._get(`/api/agent/pull?${params}`);
    if (res.status === 409) {
      throw new Error(`Listener "${this.listenerId}" is already being consumed`);
    }
    if (res.status === 401) {
      throw new Error("Unauthorized — check your API key");
    }
    if (res.status !== 200) {
      throw new Error(`Pull failed: HTTP ${res.status}`);
    }
    const result: PullResult = JSON.parse(res.body);
    // Auto-verify delivery signatures
    for (const event of result.events) {
      if (event.webhook_id && event.webhook_timestamp && event.webhook_signature) {
        event.verified = verifyWebhook(
          this.apiKey,
          event.webhook_id,
          String(event.webhook_timestamp),
          event.body ?? "",
          event.webhook_signature,
        );
      }
    }
    return result;
  }

  /**
   * Get queue status — pending counts, cursor positions, connected listeners.
   */
  async status(): Promise<StatusResult> {
    const res = await this._get("/api/agent/status");
    if (res.status === 401) {
      throw new Error("Unauthorized — check your API key");
    }
    if (res.status !== 200) {
      throw new Error(`Status failed: HTTP ${res.status}`);
    }
    return JSON.parse(res.body);
  }

  /**
   * Stream events via SSE. Calls the handler for each event.
   * Returns a promise that resolves when the stream ends (timeout or disconnect).
   */
  async stream(
    handler: (event: WebhookEvent) => void | Promise<void>,
    opts: { path?: string; timeout?: number } = {},
  ): Promise<void> {
    const params = new URLSearchParams();
    params.set("listener_id", this.listenerId);
    params.set("stream", "true");
    if (opts.path) params.set("path", opts.path);
    if (opts.timeout !== undefined) params.set("timeout", String(opts.timeout));

    return new Promise((resolve, reject) => {
      const url = new URL(`/api/agent/pull?${params}`, this.baseUrl);
      const mod = url.protocol === "https:" ? https : http;

      const req = mod.get(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          headers: { authorization: `Bearer ${this.apiKey}` },
        },
        (res) => {
          if (res.statusCode === 409) {
            reject(new Error(`Listener "${this.listenerId}" is already being consumed`));
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`Stream failed: HTTP ${res.statusCode}`));
            return;
          }

          let buffer = "";
          res.on("data", (chunk: Buffer) => {
            buffer += chunk.toString();
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (line.startsWith("data:")) {
                const data = line.slice(5).trim();
                if (data === "{}" || !data) continue; // heartbeat
                try {
                  const event: WebhookEvent = JSON.parse(data);
                  if (event.id) {
                    // Auto-verify signature
                    if (event.webhook_id && event.webhook_timestamp && event.webhook_signature) {
                      event.verified = verifyWebhook(
                        this.apiKey,
                        event.webhook_id,
                        String(event.webhook_timestamp),
                        event.body ?? "",
                        event.webhook_signature,
                      );
                    }
                    handler(event);
                  }
                } catch {
                  // skip unparseable
                }
              }
            }
          });
          res.on("end", resolve);
          res.on("error", reject);
        },
      );
      req.on("error", reject);
    });
  }

  // ── Internal ───────────────────────────────────────────────────────

  private _get(path: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const mod = url.protocol === "https:" ? https : http;

      const req = mod.get(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === "https:" ? 443 : 80),
          path: url.pathname + url.search,
          headers: { authorization: `Bearer ${this.apiKey}` },
        },
        (res) => {
          let data = "";
          res.on("data", (c: Buffer) => (data += c.toString()));
          res.on("end", () => resolve({ status: res.statusCode ?? 500, body: data }));
        },
      );
      req.on("error", reject);
      req.end();
    });
  }
}
