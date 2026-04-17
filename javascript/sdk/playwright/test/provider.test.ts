import { describe, it, expect, vi, beforeEach } from "vitest";
import { SimplehookWebhookProvider } from "../src/provider.js";

// Mock @simplehook/core so we control what pull() returns
vi.mock("@simplehook/core", () => {
  return {
    SimplehookAgent: vi.fn().mockImplementation(() => ({
      pull: vi.fn(),
      status: vi.fn(),
    })),
  };
});

import { SimplehookAgent } from "@simplehook/core";

function makeEvent(id: string, path: string, body: Record<string, unknown> = {}) {
  return {
    id,
    path,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    status: "delivered",
    received_at: new Date().toISOString(),
  };
}

describe("SimplehookWebhookProvider", () => {
  let provider: SimplehookWebhookProvider;
  let mockPull: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SIMPLEHOOK_KEY = "ak_test_unit";
    provider = new SimplehookWebhookProvider();
    // Get the mock pull function from the constructed agent
    const agentInstance = (SimplehookAgent as any).mock.results.at(-1)?.value;
    mockPull = agentInstance.pull;
  });

  describe("constructor", () => {
    it("throws when no API key available", () => {
      delete process.env.SIMPLEHOOK_KEY;
      expect(() => new SimplehookWebhookProvider()).toThrow("API key not provided");
    });

    it("reads SIMPLEHOOK_KEY from env", () => {
      process.env.SIMPLEHOOK_KEY = "ak_from_env";
      const p = new SimplehookWebhookProvider();
      expect(p).toBeDefined();
    });

    it("accepts explicit apiKey override", () => {
      const p = new SimplehookWebhookProvider({ apiKey: "ak_explicit" });
      expect(p).toBeDefined();
    });
  });

  describe("getReceivedWebhooks", () => {
    it("returns empty array when no events", async () => {
      mockPull.mockResolvedValue({ events: [], cursor: null, remaining: 0 });
      const result = await provider.getReceivedWebhooks();
      expect(result).toEqual([]);
    });

    it("returns events in ReceivedWebhook format", async () => {
      const event = makeEvent("evt_1", "/stripe/events", { type: "charge.succeeded" });
      mockPull.mockResolvedValue({ events: [event], cursor: "evt_1", remaining: 0 });

      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "evt_1",
        url: "/stripe/events",
        method: "POST",
        body: { type: "charge.succeeded" },
      });
      expect(result[0].receivedAt).toBeInstanceOf(Date);
      expect(result[0].parseError).toBeFalsy();
    });

    it("handles non-JSON body with parseError", async () => {
      const event = makeEvent("evt_2", "/webhook", {});
      event.body = "not-json{{{";
      mockPull.mockResolvedValue({ events: [event], cursor: "evt_2", remaining: 0 });

      const result = await provider.getReceivedWebhooks();
      expect(result[0].body).toBe("not-json{{{");
      expect(result[0].parseError).toBe(true);
    });

    it("handles null body", async () => {
      const event = makeEvent("evt_3", "/webhook", {});
      event.body = null as any;
      mockPull.mockResolvedValue({ events: [event], cursor: "evt_3", remaining: 0 });

      const result = await provider.getReceivedWebhooks();
      expect(result[0].body).toBeNull();
    });

    it("filters by urlPattern glob", async () => {
      const events = [
        makeEvent("evt_a", "/stripe/events", {}),
        makeEvent("evt_b", "/github/push", {}),
        makeEvent("evt_c", "/stripe/checkout", {}),
      ];
      mockPull.mockResolvedValue({ events, cursor: "evt_c", remaining: 0 });

      const result = await provider.getReceivedWebhooks({ urlPattern: "/stripe/*" });
      expect(result).toHaveLength(2);
      expect(result.every(r => r.url.startsWith("/stripe"))).toBe(true);
    });

    it("filters by method", async () => {
      const events = [
        makeEvent("evt_post", "/hook", {}),
        { ...makeEvent("evt_get", "/hook", {}), method: "GET" },
      ];
      mockPull.mockResolvedValue({ events, cursor: "evt_get", remaining: 0 });

      const result = await provider.getReceivedWebhooks({ method: "GET" });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("evt_get");
    });

    it("filters by since date", async () => {
      const old = makeEvent("evt_old", "/hook", {});
      old.received_at = "2020-01-01T00:00:00Z";
      const recent = makeEvent("evt_new", "/hook", {});
      recent.received_at = new Date().toISOString();
      mockPull.mockResolvedValue({ events: [old, recent], cursor: "evt_new", remaining: 0 });

      const result = await provider.getReceivedWebhooks({ since: new Date("2025-01-01") });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("evt_new");
    });

    it("returns same events on repeated calls (journal model)", async () => {
      const event = makeEvent("evt_1", "/hook", {});
      mockPull
        .mockResolvedValueOnce({ events: [event], cursor: "evt_1", remaining: 0 })
        .mockResolvedValueOnce({ events: [], cursor: null, remaining: 0 });

      const first = await provider.getReceivedWebhooks();
      const second = await provider.getReceivedWebhooks();
      expect(first).toHaveLength(1);
      expect(second).toHaveLength(1);
      expect(first[0].id).toBe(second[0].id);
    });

    it("accumulates events across multiple pulls", async () => {
      mockPull
        .mockResolvedValueOnce({ events: [makeEvent("evt_1", "/a", {})], cursor: "evt_1", remaining: 0 })
        .mockResolvedValueOnce({ events: [makeEvent("evt_2", "/b", {})], cursor: "evt_2", remaining: 0 });

      await provider.getReceivedWebhooks();
      // Second call triggers another pull (incremental via after param)
      const all = await provider.getReceivedWebhooks();
      expect(all).toHaveLength(2);
    });

    it("paginates when remaining > 0", async () => {
      mockPull
        .mockResolvedValueOnce({ events: [makeEvent("evt_1", "/a", {})], cursor: "evt_1", remaining: 5 })
        .mockResolvedValueOnce({ events: [makeEvent("evt_2", "/b", {})], cursor: "evt_2", remaining: 0 });

      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(2);
      expect(mockPull).toHaveBeenCalledTimes(2);
    });
  });

  describe("deleteById", () => {
    it("removes event from journal", async () => {
      const events = [makeEvent("evt_1", "/a", {}), makeEvent("evt_2", "/b", {})];
      mockPull.mockResolvedValue({ events, cursor: "evt_2", remaining: 0 });

      await provider.getReceivedWebhooks(); // populate journal
      await provider.deleteById("evt_1");

      mockPull.mockResolvedValue({ events: [], cursor: null, remaining: 0 });
      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("evt_2");
    });
  });

  describe("getCount", () => {
    it("returns journal size", async () => {
      const events = [makeEvent("evt_1", "/a", {}), makeEvent("evt_2", "/b", {})];
      mockPull.mockResolvedValue({ events, cursor: "evt_2", remaining: 0 });

      const count = await provider.getCount();
      expect(count).toBe(2);
    });

    it("returns filtered count when criteria provided", async () => {
      const events = [makeEvent("evt_1", "/stripe/x", {}), makeEvent("evt_2", "/github/y", {})];
      mockPull.mockResolvedValue({ events, cursor: "evt_2", remaining: 0 });

      const count = await provider.getCount({ urlPattern: "/stripe/*" } as any);
      expect(count).toBe(1);
    });
  });

  describe("resetJournal", () => {
    it("clears journal and generates fresh listener", async () => {
      const events = [makeEvent("evt_1", "/a", {})];
      mockPull.mockResolvedValue({ events, cursor: "evt_1", remaining: 0 });

      await provider.getReceivedWebhooks(); // populate
      await provider.resetJournal();

      // A new SimplehookAgent should have been created
      const callCount = (SimplehookAgent as any).mock.calls.length;
      expect(callCount).toBeGreaterThan(1);

      // New agent's pull returns fresh data
      const newAgent = (SimplehookAgent as any).mock.results.at(-1)?.value;
      newAgent.pull.mockResolvedValue({ events: [], cursor: null, remaining: 0 });

      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(0);
    });
  });

  describe("removeByCriteria", () => {
    it("removes matching events from journal", async () => {
      const events = [
        makeEvent("evt_1", "/stripe/events", {}),
        makeEvent("evt_2", "/github/push", {}),
      ];
      mockPull.mockResolvedValue({ events, cursor: "evt_2", remaining: 0 });

      await provider.getReceivedWebhooks();
      await provider.removeByCriteria!({ urlPattern: "/stripe/*" } as any);

      mockPull.mockResolvedValue({ events: [], cursor: null, remaining: 0 });
      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe("/github/push");
    });
  });

  describe("setup and teardown", () => {
    it("setup refreshes journal", async () => {
      mockPull.mockResolvedValue({ events: [makeEvent("evt_1", "/a", {})], cursor: "evt_1", remaining: 0 });
      await provider.setup!();
      mockPull.mockResolvedValue({ events: [], cursor: null, remaining: 0 });
      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(1);
    });

    it("teardown clears journal", async () => {
      mockPull.mockResolvedValue({ events: [makeEvent("evt_1", "/a", {})], cursor: "evt_1", remaining: 0 });
      await provider.getReceivedWebhooks();
      await provider.teardown!();
      mockPull.mockResolvedValue({ events: [], cursor: null, remaining: 0 });
      const result = await provider.getReceivedWebhooks();
      expect(result).toHaveLength(0);
    });
  });
});
