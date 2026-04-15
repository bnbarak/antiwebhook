import { describe, it, expect } from "vitest";
import { deriveSigningKey, verifyWebhook, extractSignatureHeaders } from "../src/verify.js";
import { createHmac } from "node:crypto";

describe("deriveSigningKey", () => {
  it("produces consistent output for same key", () => {
    const k1 = deriveSigningKey("ak_test123");
    const k2 = deriveSigningKey("ak_test123");
    expect(k1.equals(k2)).toBe(true);
  });

  it("produces different output for different keys", () => {
    const k1 = deriveSigningKey("ak_key1");
    const k2 = deriveSigningKey("ak_key2");
    expect(k1.equals(k2)).toBe(false);
  });

  it("is not the raw API key", () => {
    const key = deriveSigningKey("ak_test");
    expect(key.toString("utf8")).not.toContain("ak_test");
  });
});

describe("verifyWebhook", () => {
  const apiKey = "ak_testkey123";

  function sign(eventId: string, timestamp: string, body: string): string {
    const key = deriveSigningKey(apiKey);
    const payload = `${eventId}.${timestamp}.${body}`;
    const sig = createHmac("sha256", key).update(payload).digest("base64");
    return `v1,${sig}`;
  }

  it("accepts valid signature", () => {
    const sig = sign("evt_1", "1000", "hello");
    expect(verifyWebhook(apiKey, "evt_1", "1000", "hello", sig)).toBe(true);
  });

  it("accepts valid signature with empty body", () => {
    const sig = sign("evt_2", "2000", "");
    expect(verifyWebhook(apiKey, "evt_2", "2000", "", sig)).toBe(true);
  });

  it("rejects tampered body", () => {
    const sig = sign("evt_1", "1000", "original");
    expect(verifyWebhook(apiKey, "evt_1", "1000", "tampered", sig)).toBe(false);
  });

  it("rejects wrong API key", () => {
    const sig = sign("evt_1", "1000", "body");
    expect(verifyWebhook("ak_wrong", "evt_1", "1000", "body", sig)).toBe(false);
  });

  it("rejects wrong event ID", () => {
    const sig = sign("evt_1", "1000", "body");
    expect(verifyWebhook(apiKey, "evt_wrong", "1000", "body", sig)).toBe(false);
  });

  it("rejects wrong timestamp", () => {
    const sig = sign("evt_1", "1000", "body");
    expect(verifyWebhook(apiKey, "evt_1", "9999", "body", sig)).toBe(false);
  });

  it("rejects garbage signature", () => {
    expect(verifyWebhook(apiKey, "evt_1", "1000", "body", "garbage")).toBe(false);
  });

  it("rejects empty signature", () => {
    expect(verifyWebhook(apiKey, "evt_1", "1000", "body", "")).toBe(false);
  });

  it("rejects v1 with wrong hash", () => {
    expect(verifyWebhook(apiKey, "evt_1", "1000", "body", "v1,notarealhash")).toBe(false);
  });

  it("returns false for missing parameters", () => {
    const sig = sign("evt_1", "1000", "body");
    expect(verifyWebhook("", "evt_1", "1000", "body", sig)).toBe(false);
    expect(verifyWebhook(apiKey, "", "1000", "body", sig)).toBe(false);
    expect(verifyWebhook(apiKey, "evt_1", "", "body", sig)).toBe(false);
    expect(verifyWebhook(apiKey, "evt_1", "1000", "body", "")).toBe(false);
  });
});

describe("extractSignatureHeaders", () => {
  it("extracts all three headers", () => {
    const result = extractSignatureHeaders({
      "webhook-id": "evt_1",
      "webhook-timestamp": "1000",
      "webhook-signature": "v1,abc",
      "content-type": "application/json",
    });
    expect(result).toEqual({ id: "evt_1", timestamp: "1000", signature: "v1,abc" });
  });

  it("returns null if webhook-id missing", () => {
    expect(extractSignatureHeaders({
      "webhook-timestamp": "1000",
      "webhook-signature": "v1,abc",
    })).toBeNull();
  });

  it("returns null if webhook-timestamp missing", () => {
    expect(extractSignatureHeaders({
      "webhook-id": "evt_1",
      "webhook-signature": "v1,abc",
    })).toBeNull();
  });

  it("returns null if webhook-signature missing", () => {
    expect(extractSignatureHeaders({
      "webhook-id": "evt_1",
      "webhook-timestamp": "1000",
    })).toBeNull();
  });

  it("returns null for empty headers", () => {
    expect(extractSignatureHeaders({})).toBeNull();
  });
});
