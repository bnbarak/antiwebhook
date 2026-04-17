/**
 * Parallel provider test — simulates two Playwright workers
 * running simultaneously with independent cursors.
 */

import { SimplehookWebhookProvider } from "@simplehook/playwright";
import { WebhookRegistry, webhookTemplate } from "@seontechnologies/playwright-utils/webhook";

const server = process.env.SIMPLEHOOK_SERVER;
const projectId = process.env.SIMPLEHOOK_PROJECT;

if (!process.env.SIMPLEHOOK_KEY || !server || !projectId) {
  console.error("requires SIMPLEHOOK_KEY, SIMPLEHOOK_SERVER, SIMPLEHOOK_PROJECT");
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function sendWebhook(path: string, body: Record<string, unknown>) {
  await fetch(`${server}/hooks/${projectId}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Simulate two parallel workers ─────────────────────────────────

const marker = Date.now();

// Worker A and Worker B each get their own provider (unique listenerId)
const providerA = new SimplehookWebhookProvider({ serverUrl: server });
const providerB = new SimplehookWebhookProvider({ serverUrl: server });

const registryA = new WebhookRegistry(providerA, { defaultTimeout: 10_000, defaultInterval: 500, cleanupStrategy: "matched-only" });
const registryB = new WebhookRegistry(providerB, { defaultTimeout: 10_000, defaultInterval: 500, cleanupStrategy: "matched-only" });

await providerA.setup?.();
await providerB.setup?.();

// Send one webhook that both workers should see
await sendWebhook("/parallel/test", { worker: "shared", marker });
await sleep(500);

// ── Test 1: Both workers see the same event ───────────────────────

const templateShared = webhookTemplate("shared-event")
  .matchField("marker", marker)
  .withTimeout(10_000)
  .build();

let matchA, matchB;
try {
  [matchA, matchB] = await Promise.all([
    registryA.waitFor(templateShared),
    registryB.waitFor(templateShared),
  ]);
} catch (err: any) {
  console.error("FAIL: one or both workers could not find shared event");
  console.error(err.message);
  process.exit(1);
}

if (matchA.id === matchB.id) {
  console.log("  ✓ Both workers independently found the same event");
} else {
  console.error(`FAIL: workers found different events (${matchA.id} vs ${matchB.id})`);
  process.exit(1);
}

// ── Test 2: deleteById in A doesn't affect B ──────────────────────

await providerA.deleteById(matchA.id);

const aAfterDelete = await providerA.getReceivedWebhooks();
const bAfterDelete = await providerB.getReceivedWebhooks();

const aHasIt = aAfterDelete.some((e) => e.id === matchA.id);
const bHasIt = bAfterDelete.some((e) => e.id === matchB.id);

if (!aHasIt && bHasIt) {
  console.log("  ✓ deleteById in worker A did not affect worker B");
} else {
  console.error(`FAIL: aHasIt=${aHasIt}, bHasIt=${bHasIt} (expected false, true)`);
  process.exit(1);
}

// ── Test 3: cleanup in A doesn't affect B ─────────────────────────

await registryA.cleanup();

const bAfterCleanup = await providerB.getReceivedWebhooks();
const bStillHasIt = bAfterCleanup.some((e) => e.id === matchB.id);

if (bStillHasIt) {
  console.log("  ✓ cleanup in worker A did not affect worker B");
} else {
  console.error("FAIL: cleanup in A wiped B's journal");
  process.exit(1);
}

// ── Test 4: Each worker can waitFor different events concurrently ──

const markerA = `worker-a-${Date.now()}`;
const markerB = `worker-b-${Date.now()}`;

await sendWebhook("/stripe/events", { type: "charge.succeeded", batch: markerA });
await sendWebhook("/github/push", { ref: "refs/heads/main", batch: markerB });
await sleep(500);

// Reset both registries for clean state
await providerA.resetJournal();
await providerB.resetJournal();

const templateA = webhookTemplate("worker-a-charge")
  .matchField("batch", markerA)
  .withTimeout(10_000)
  .build();

const templateB = webhookTemplate("worker-b-push")
  .matchField("batch", markerB)
  .withTimeout(10_000)
  .build();

try {
  const [resultA, resultB] = await Promise.all([
    registryA.waitFor(templateA),
    registryB.waitFor(templateB),
  ]);

  if ((resultA.body as any).type === "charge.succeeded" && (resultB.body as any).ref === "refs/heads/main") {
    console.log("  ✓ Both workers found their own events concurrently");
  } else {
    console.error("FAIL: wrong events matched");
    process.exit(1);
  }
} catch (err: any) {
  console.error("FAIL: concurrent waitFor threw");
  console.error(err.message);
  process.exit(1);
}

// ── Teardown ──────────────────────────────────────────────────────

await providerA.teardown?.();
await providerB.teardown?.();

console.log("\nOK: parallel safety verified (4 checks)");
