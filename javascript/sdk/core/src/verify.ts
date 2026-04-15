import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Derive a signing key from the API key.
 * The API key is never used directly for signing — this produces
 * a separate HMAC key that can't be reversed to recover the API key.
 */
export function deriveSigningKey(apiKey: string): Buffer {
  return createHmac("sha256", "simplehook-signing-v1")
    .update(apiKey)
    .digest();
}

/**
 * Verify a webhook delivery signature.
 *
 * @param apiKey - Your SIMPLEHOOK_KEY (ak_...)
 * @param eventId - The webhook-id header value
 * @param timestamp - The webhook-timestamp header value
 * @param body - The body string (base64 for WebSocket frames, UTF-8 for pull API)
 * @param signature - The webhook-signature header value (v1,...)
 * @returns true if the signature is valid
 */
export function verifyWebhook(
  apiKey: string,
  eventId: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  if (!apiKey || !eventId || !timestamp || !signature) {
    return false;
  }

  const key = deriveSigningKey(apiKey);
  const payload = `${eventId}.${timestamp}.${body}`;
  const expected =
    "v1," +
    createHmac("sha256", key).update(payload).digest("base64");

  // Constant-time comparison to prevent timing attacks
  try {
    return timingSafeEqual(
      Buffer.from(expected, "utf8"),
      Buffer.from(signature, "utf8"),
    );
  } catch {
    // timingSafeEqual throws if buffers have different lengths
    return false;
  }
}

/**
 * Extract signature headers from a frame's headers map.
 * Returns null if any required header is missing.
 */
export function extractSignatureHeaders(
  headers: Record<string, string>,
): { id: string; timestamp: string; signature: string } | null {
  const id = headers["webhook-id"];
  const timestamp = headers["webhook-timestamp"];
  const signature = headers["webhook-signature"];
  if (!id || !timestamp || !signature) return null;
  return { id, timestamp, signature };
}
