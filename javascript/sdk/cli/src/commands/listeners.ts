import http from "node:http";
import https from "node:https";

// ── Types ────────────────────────────────────────────────────────────

interface Listener {
  id: string;
  label?: string;
  connected: boolean;
  created_at?: string;
  last_seen?: string;
}

export interface ListenersListFlags {
  key: string;
  server?: string;
  json?: boolean;
}

export interface ListenersCreateFlags {
  key: string;
  server?: string;
  id: string;
  label?: string;
}

export interface ListenersDeleteFlags {
  key: string;
  server?: string;
  id: string;
}

// ── HTTP helpers ────────────────────────────────────────────────────

function resolveBase(server?: string): string {
  return server ?? process.env.SIMPLEHOOK_SERVER ?? "https://hook.simplehook.dev";
}

function request(
  method: string,
  path: string,
  key: string,
  server?: string,
  body?: unknown,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, resolveBase(server));
    const mod = url.protocol === "https:" ? https : http;

    const headers: Record<string, string> = {
      authorization: `Bearer ${key}`,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      payload = JSON.stringify(body);
      headers["content-type"] = "application/json";
      headers["content-length"] = String(Buffer.byteLength(payload));
    }

    const req = mod.request(
      {
        method,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + url.search,
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (c: Buffer) => (data += c.toString()));
        res.on("end", () => resolve({ status: res.statusCode ?? 500, body: data }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function handleAuthError(status: number): void {
  if (status === 401) {
    throw new Error("Unauthorized — check your API key");
  }
}

// ── Commands ────────────────────────────────────────────────────────

export async function runListenersList(flags: ListenersListFlags): Promise<void> {
  const res = await request("GET", "/api/listeners", flags.key, flags.server);
  handleAuthError(res.status);
  if (res.status !== 200) {
    throw new Error(`Failed to list listeners: HTTP ${res.status}`);
  }

  const listeners: Listener[] = JSON.parse(res.body);

  if (flags.json) {
    console.log(JSON.stringify(listeners, null, 2));
    return;
  }

  if (listeners.length === 0) {
    console.log("No listeners configured.");
    return;
  }

  // Table output
  const header = padRow("ID", "LABEL", "STATUS");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const l of listeners) {
    console.log(
      padRow(
        l.id,
        l.label ?? "-",
        l.connected ? "connected" : "disconnected",
      ),
    );
  }
}

export async function runListenersCreate(flags: ListenersCreateFlags): Promise<void> {
  const payload: Record<string, unknown> = { id: flags.id };
  if (flags.label) payload.label = flags.label;

  const res = await request("POST", "/api/listeners", flags.key, flags.server, payload);
  handleAuthError(res.status);
  if (res.status !== 200 && res.status !== 201) {
    const detail = tryParseError(res.body);
    throw new Error(`Failed to create listener: HTTP ${res.status}${detail}`);
  }

  const listener: Listener = JSON.parse(res.body);
  console.log(`Listener created.`);
  console.log(`  ID:     ${listener.id}`);
  if (listener.label) console.log(`  Label:  ${listener.label}`);
}

export async function runListenersDelete(flags: ListenersDeleteFlags): Promise<void> {
  const res = await request("DELETE", `/api/listeners/${encodeURIComponent(flags.id)}`, flags.key, flags.server);
  handleAuthError(res.status);
  if (res.status === 404) {
    throw new Error(`Listener "${flags.id}" not found`);
  }
  if (res.status !== 200 && res.status !== 204) {
    throw new Error(`Failed to delete listener: HTTP ${res.status}`);
  }

  console.log(`Listener "${flags.id}" deleted.`);
}

// ── Formatting helpers ──────────────────────────────────────────────

function padRow(id: string, label: string, status: string): string {
  return [
    id.padEnd(24),
    label.padEnd(24),
    status.padEnd(14),
  ].join("  ");
}

function tryParseError(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (parsed.error) return ` — ${parsed.error}`;
    if (parsed.message) return ` — ${parsed.message}`;
  } catch {
    // ignore
  }
  return "";
}
