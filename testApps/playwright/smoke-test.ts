/**
 * Smoke test for @simplehook/playwright.
 *
 * Tests the provider both directly AND through the actual WebhookRegistry
 * + webhookTemplate system from @seontechnologies/playwright-utils.
 * No Playwright browser needed, but exercises the full fixture-compatible
 * lifecycle: setup → registry.waitFor → cleanup → teardown.
 *
 * Required env:
 *   SIMPLEHOOK_KEY     — API key
 *   SIMPLEHOOK_SERVER  — server base URL (e.g. http://localhost:8413)
 *   SIMPLEHOOK_PROJECT — project ID (to fire webhooks)
 */

import { SimplehookWebhookProvider } from "@simplehook/playwright";
import {
  WebhookRegistry,
  webhookTemplate,
} from "@seontechnologies/playwright-utils/webhook";

const server = process.env.SIMPLEHOOK_SERVER;
const projectId = process.env.SIMPLEHOOK_PROJECT;

if (!process.env.SIMPLEHOOK_KEY || !server || !projectId) {
  console.error("smoke-test requires SIMPLEHOOK_KEY, SIMPLEHOOK_SERVER, SIMPLEHOOK_PROJECT");
  process.exit(2);
}

let passed = 0;
let failed = 0;

function pass(msg: string) { passed++; console.log(`  ✓ ${msg}`); }
function fail(msg: string, detail?: string) {
  failed++;
  console.error(`  ✗ ${msg}`);
  if (detail) console.error(`    ${detail}`);
}

async function sendWebhook(path: string, body: Record<string, unknown>) {
  await fetch(`${server}/hooks/${projectId}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 1. Provider direct tests ─────────────────────────────────────────

console.log("Provider direct tests:");

const provider = new SimplehookWebhookProvider({ serverUrl: server });

const marker = `pw-smoke-${Date.now()}`;
await sendWebhook("/stripe/events", { type: "charge.succeeded", marker });
await sendWebhook("/github/push", { ref: "refs/heads/main", marker });
await sleep(500);

// getReceivedWebhooks
const all = await provider.getReceivedWebhooks();
all.length >= 2
  ? pass(`getReceivedWebhooks returned ${all.length} events`)
  : fail(`getReceivedWebhooks returned ${all.length}, expected >= 2`);

// getCount
const count = await provider.getCount();
count >= 2
  ? pass(`getCount returned ${count}`)
  : fail(`getCount returned ${count}, expected >= 2`);

// URL pattern filter
const stripeOnly = await provider.getReceivedWebhooks({ urlPattern: "/stripe/*" });
stripeOnly.length > 0 && stripeOnly.every((e) => e.url.startsWith("/stripe"))
  ? pass(`urlPattern filter: ${stripeOnly.length} stripe events`)
  : fail("urlPattern filter failed");

// deleteById
const firstId = all[0].id;
await provider.deleteById(firstId);
const afterDelete = await provider.getReceivedWebhooks();
afterDelete.every((e) => e.id !== firstId)
  ? pass("deleteById removed event")
  : fail("deleteById did not remove event");

// resetJournal
await provider.resetJournal();
const afterReset = await provider.getReceivedWebhooks();
afterReset.length > 0
  ? pass("resetJournal provides fresh cursor")
  : fail("resetJournal returned 0 events");

// ── 2. WebhookRegistry + webhookTemplate integration ────────────────

console.log("\nWebhookRegistry integration tests:");

const provider2 = new SimplehookWebhookProvider({ serverUrl: server });
await provider2.setup?.();

const registry = new WebhookRegistry(provider2, {
  defaultTimeout: 10_000,
  defaultInterval: 500,
  cleanupStrategy: "matched-only",
});

// Send a webhook with a unique marker for this test
const registryMarker = `registry-${Date.now()}`;
await sendWebhook("/stripe/events", { type: "invoice.paid", test_id: registryMarker });
await sleep(500);

// waitFor with webhookTemplate
try {
  const template = webhookTemplate("invoice-paid")
    .matchField("type", "invoice.paid")
    .matchField("test_id", registryMarker)
    .withTimeout(10_000)
    .build();

  const matched = await registry.waitFor(template);
  matched.body && (matched.body as any).type === "invoice.paid"
    ? pass("waitFor matched invoice.paid event")
    : fail("waitFor returned wrong event", JSON.stringify(matched.body));
} catch (err: any) {
  fail("waitFor threw", err.message);
}

// waitForCount
const countMarker = `count-${Date.now()}`;
await sendWebhook("/stripe/events", { type: "payment_intent.created", batch: countMarker });
await sendWebhook("/stripe/events", { type: "payment_intent.succeeded", batch: countMarker });
await sleep(500);

try {
  const countTemplate = webhookTemplate("batch-payments")
    .matchField("batch", countMarker)
    .withTimeout(10_000)
    .build();

  const matches = await registry.waitForCount(countTemplate, 2);
  matches.length === 2
    ? pass("waitForCount returned 2 events")
    : fail(`waitForCount returned ${matches.length}, expected 2`);
} catch (err: any) {
  fail("waitForCount threw", err.message);
}

// cleanup (matched-only strategy)
try {
  await registry.cleanup();
  pass("cleanup (matched-only) completed");
} catch (err: any) {
  fail("cleanup threw", err.message);
}

// teardown
try {
  await provider2.teardown?.();
  pass("teardown completed");
} catch (err: any) {
  fail("teardown threw", err.message);
}

// ── Summary ─────────────────────────────────────────────────────────

console.log("");
if (failed > 0) {
  console.error(`FAIL: ${passed} passed, ${failed} failed`);
  process.exit(1);
} else {
  console.log(`OK: ${passed} passed, 0 failed`);
}
