import http from "node:http";
import https from "node:https";

// ── Types ────────────────────────────────────────────────────────────

interface Route {
  id: string;
  path: string;
  mode: string;
  listener_id?: string;
  timeout?: number;
  pending?: number;
  created_at?: string;
}

export interface RoutesListFlags {
  key: string;
  server?: string;
  json?: boolean;
}

export interface RoutesCreateFlags {
  key: string;
  server?: string;
  path: string;
  mode?: string;
  listener?: string;
  timeout?: number;
}

export interface RoutesDeleteFlags {
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

export async function runRoutesList(flags: RoutesListFlags): Promise<void> {
  const res = await request("GET", "/api/routes", flags.key, flags.server);
  handleAuthError(res.status);
  if (res.status !== 200) {
    throw new Error(`Failed to list routes: HTTP ${res.status}`);
  }

  const routes: Route[] = JSON.parse(res.body);

  if (flags.json) {
    console.log(JSON.stringify(routes, null, 2));
    return;
  }

  if (routes.length === 0) {
    console.log("No routes configured.");
    return;
  }

  // Table output
  const header = padRow("ID", "PATH", "MODE", "LISTENER", "TIMEOUT");
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of routes) {
    console.log(
      padRow(
        r.id,
        r.path,
        r.mode,
        r.listener_id ?? "-",
        r.timeout !== undefined ? `${r.timeout}s` : "-",
      ),
    );
  }
}

export async function runRoutesCreate(flags: RoutesCreateFlags): Promise<void> {
  const payload: Record<string, unknown> = { path: flags.path };
  if (flags.mode) payload.mode = flags.mode;
  if (flags.listener) payload.listener_id = flags.listener;
  if (flags.timeout !== undefined) payload.timeout = flags.timeout;

  const res = await request("POST", "/api/routes", flags.key, flags.server, payload);
  handleAuthError(res.status);
  if (res.status !== 200 && res.status !== 201) {
    const detail = tryParseError(res.body);
    throw new Error(`Failed to create route: HTTP ${res.status}${detail}`);
  }

  const route: Route = JSON.parse(res.body);
  console.log(`Route created.`);
  console.log(`  ID:        ${route.id}`);
  console.log(`  Path:      ${route.path}`);
  console.log(`  Mode:      ${route.mode}`);
  if (route.listener_id) console.log(`  Listener:  ${route.listener_id}`);
  if (route.timeout !== undefined) console.log(`  Timeout:   ${route.timeout}s`);
}

export async function runRoutesDelete(flags: RoutesDeleteFlags): Promise<void> {
  const res = await request("DELETE", `/api/routes/${encodeURIComponent(flags.id)}`, flags.key, flags.server);
  handleAuthError(res.status);
  if (res.status === 404) {
    throw new Error(`Route "${flags.id}" not found`);
  }
  if (res.status !== 200 && res.status !== 204) {
    throw new Error(`Failed to delete route: HTTP ${res.status}`);
  }

  console.log(`Route "${flags.id}" deleted.`);
}

// ── Formatting helpers ──────────────────────────────────────────────

function padRow(id: string, path: string, mode: string, listener: string, timeout: string): string {
  return [
    id.padEnd(24),
    path.padEnd(24),
    mode.padEnd(14),
    listener.padEnd(16),
    timeout.padEnd(8),
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
