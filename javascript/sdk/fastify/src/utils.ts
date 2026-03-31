const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "transfer-encoding",
  "content-length",
]);

export function sanitizeHeaders(
  raw: Record<string, string>,
  bodyLength: number | null,
): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [k, v] of Object.entries(raw)) {
    const lower = k.toLowerCase();
    if (!HOP_BY_HOP_HEADERS.has(lower)) {
      out[lower] = v;
    }
  }

  if (bodyLength !== null && bodyLength > 0) {
    out["content-length"] = String(bodyLength);
  }

  return out;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isExplicitlyDisabled(): boolean {
  return process.env.SIMPLEHOOK_ENABLED === "false";
}

export function parseFrame(raw: Buffer | string): unknown | null {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}
