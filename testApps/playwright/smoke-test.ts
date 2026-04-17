/**
 * Smoke test for @simplehook/playwright.
 *
 * Calls the provider methods directly (no Playwright browser needed),
 * so it's deterministic and fast enough for CI.
 *
 * Verifies:
 *   1. Provider creates without error (reads SIMPLEHOOK_KEY from env)
 *   2. getReceivedWebhooks() returns events after a webhook is sent
 *   3. getCount() reflects journal size
 *   4. deleteById() removes an event from the journal
 *   5. resetJournal() clears and provides a fresh cursor
 *   6. URL pattern filtering works
 *
 * Required env:
 *   SIMPLEHOOK_KEY     — API key
 *   SIMPLEHOOK_SERVER  — server base URL (e.g. http://localhost:8413)
 *   SIMPLEHOOK_PROJECT — project ID (to fire webhooks)
 */

import { SimplehookWebhookProvider } from "@simplehook/playwright";

const server = process.env.SIMPLEHOOK_SERVER;
const projectId = process.env.SIMPLEHOOK_PROJECT;

if (!process.env.SIMPLEHOOK_KEY || !server || !projectId) {
  console.error("smoke-test requires SIMPLEHOOK_KEY, SIMPLEHOOK_SERVER, SIMPLEHOOK_PROJECT");
  process.exit(2);
}

const provider = new SimplehookWebhookProvider({ serverUrl: server });

// Send two webhooks to different paths
const marker = `pw-smoke-${Date.now()}`;
await fetch(`${server}/hooks/${projectId}/stripe/events`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "charge.succeeded", marker }),
});
await fetch(`${server}/hooks/${projectId}/github/push`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ref: "refs/heads/main", marker }),
});

await new Promise((r) => setTimeout(r, 500));

// 1. getReceivedWebhooks — should return both events
const all = await provider.getReceivedWebhooks();
if (all.length < 2) {
  console.error(`FAIL: expected at least 2 events, got ${all.length}`);
  process.exit(1);
}

// 2. getCount
const count = await provider.getCount();
if (count < 2) {
  console.error(`FAIL: getCount() returned ${count}, expected >= 2`);
  process.exit(1);
}

// 3. URL pattern filter
const stripeOnly = await provider.getReceivedWebhooks({ urlPattern: "/stripe/*" });
if (stripeOnly.length === 0) {
  console.error("FAIL: filter by /stripe/* returned 0 events");
  process.exit(1);
}
const hasStripe = stripeOnly.every((e) => e.url.startsWith("/stripe"));
if (!hasStripe) {
  console.error("FAIL: filter returned non-stripe events");
  process.exit(1);
}

// 4. deleteById
const firstId = all[0].id;
await provider.deleteById(firstId);
const afterDelete = await provider.getReceivedWebhooks();
if (afterDelete.some((e) => e.id === firstId)) {
  console.error("FAIL: deleteById did not remove the event");
  process.exit(1);
}

// 5. resetJournal
await provider.resetJournal();
const afterReset = await provider.getReceivedWebhooks();
// After reset with a fresh listener, should see events again
if (afterReset.length === 0) {
  console.error("FAIL: after resetJournal, expected events from fresh cursor");
  process.exit(1);
}

console.log(`OK: ${all.length} events pulled, filter/delete/reset all work`);
