import { describe, it, expect } from "vitest";
import { sanitizeHeaders, parseFrame, isProduction, isExplicitlyDisabled } from "../src/utils.js";

describe("sanitizeHeaders", () => {
  it("lowercases and strips hop-by-hop headers", () => {
    const result = sanitizeHeaders(
      { "Content-Type": "application/json", Host: "example.com", Connection: "keep-alive" },
      null,
    );

    expect(result["content-type"]).toBe("application/json");
    expect(result).not.toHaveProperty("host");
    expect(result).not.toHaveProperty("connection");
  });

  it("sets content-length when body is present", () => {
    const result = sanitizeHeaders({}, 42);

    expect(result["content-length"]).toBe("42");
  });

  it("omits content-length for empty body", () => {
    const result = sanitizeHeaders({}, null);

    expect(result).not.toHaveProperty("content-length");
  });

  it("strips transfer-encoding", () => {
    const result = sanitizeHeaders({ "Transfer-Encoding": "chunked" }, null);

    expect(result).not.toHaveProperty("transfer-encoding");
  });
});

describe("parseFrame", () => {
  it("parses valid JSON from string", () => {
    const result = parseFrame('{"type":"ping"}');

    expect(result).toEqual({ type: "ping" });
  });

  it("parses valid JSON from Buffer", () => {
    const result = parseFrame(Buffer.from('{"type":"pong"}'));

    expect(result).toEqual({ type: "pong" });
  });

  it("returns null for invalid JSON", () => {
    const result = parseFrame("not json");

    expect(result).toBeNull();
  });
});

describe("isProduction", () => {
  const origEnv = process.env.NODE_ENV;

  it("returns true when NODE_ENV is production", () => {
    process.env.NODE_ENV = "production";

    expect(isProduction()).toBe(true);

    process.env.NODE_ENV = origEnv;
  });

  it("returns false otherwise", () => {
    process.env.NODE_ENV = "development";

    expect(isProduction()).toBe(false);

    process.env.NODE_ENV = origEnv;
  });
});

describe("isExplicitlyDisabled", () => {
  it("returns true when SIMPLEHOOK_ENABLED is false", () => {
    process.env.SIMPLEHOOK_ENABLED = "false";

    expect(isExplicitlyDisabled()).toBe(true);

    delete process.env.SIMPLEHOOK_ENABLED;
  });

  it("returns false otherwise", () => {
    delete process.env.SIMPLEHOOK_ENABLED;

    expect(isExplicitlyDisabled()).toBe(false);
  });
});
