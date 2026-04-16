/**
 * Smoke test for @simplehook/mastra — calls the tool functions directly
 * (no LLM), so it's deterministic and fast enough for CI.
 *
 * Verifies:
 *   1. createSimplehookTools() returns both tools
 *   2. simplehook_pull.execute() returns events that were sent to the project
 *   3. simplehook_status.execute() returns project info
 *
 * Required env:
 *   SIMPLEHOOK_KEY     — API key
 *   SIMPLEHOOK_SERVER  — server base URL (e.g. http://localhost:8413)
 *   SIMPLEHOOK_PROJECT — project ID (so we can fire a webhook to /hooks/<id>/...)
 */

import { createSimplehookTools } from "@simplehook/mastra";

const apiKey = process.env.SIMPLEHOOK_KEY;
const server = process.env.SIMPLEHOOK_SERVER;
const projectId = process.env.SIMPLEHOOK_PROJECT;

if (!apiKey || !server || !projectId) {
  console.error("smoke-test requires SIMPLEHOOK_KEY, SIMPLEHOOK_SERVER, SIMPLEHOOK_PROJECT");
  process.exit(2);
}

const tools = createSimplehookTools({ apiKey, serverUrl: server, listenerId: "mastra-smoke" });

if (!tools.simplehook_pull || !tools.simplehook_status) {
  console.error("FAIL: createSimplehookTools did not return both tools");
  process.exit(1);
}

// Send a webhook so we have something to pull
const marker = `mastra-smoke-${Date.now()}`;
await fetch(`${server}/hooks/${projectId}/mastra/test`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ marker }),
});

// Tiny wait for the queue insert to settle
await new Promise((r) => setTimeout(r, 500));

// Pull
const pullResult: any = await tools.simplehook_pull.execute({
  context: { n: 10, path: "/mastra/*" },
});

if (!Array.isArray(pullResult.events) || pullResult.events.length === 0) {
  console.error("FAIL: simplehook_pull returned no events");
  console.error(JSON.stringify(pullResult));
  process.exit(1);
}

const found = pullResult.events.some((e: any) => typeof e.body === "string" && e.body.includes(marker));
if (!found) {
  console.error(`FAIL: simplehook_pull did not return event with marker ${marker}`);
  console.error(JSON.stringify(pullResult.events.map((e: any) => ({ path: e.path, body: e.body }))));
  process.exit(1);
}

// Status
const statusResult: any = await tools.simplehook_status.execute({ context: {} });
if (!statusResult.project_id) {
  console.error("FAIL: simplehook_status missing project_id");
  console.error(JSON.stringify(statusResult));
  process.exit(1);
}

console.log(`OK: pulled ${pullResult.events.length} events, status returned project_id=${statusResult.project_id}`);
