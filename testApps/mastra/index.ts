/**
 * Mastra + simplehook example agent.
 *
 * This agent pulls Stripe webhook events and processes them using an LLM.
 * It demonstrates how to wire simplehook tools into a Mastra agent.
 *
 * Run:
 *   SIMPLEHOOK_KEY=ak_... npx tsx index.ts
 *
 * Or with a custom server:
 *   SIMPLEHOOK_KEY=ak_... SIMPLEHOOK_SERVER=http://localhost:8400 npx tsx index.ts
 */

import { Agent } from "@mastra/core/agent";
import { createSimplehookTools } from "simplehook-mastra";

// Create simplehook tools — reads SIMPLEHOOK_KEY from env
const tools = createSimplehookTools();

// Create a Mastra agent with the simplehook tools
const agent = new Agent({
  name: "stripe-webhook-agent",
  instructions: `You are a Stripe webhook processing agent.

Your job:
1. Use simplehook_pull to check for new Stripe webhook events (use path="/stripe/*")
2. When you receive events, analyze each one and summarize what happened
3. Use simplehook_status to check the queue health if asked

Always use wait=true when pulling so you block until an event arrives.
Format your responses clearly with the event type and key details.`,
  model: {
    provider: "OPEN_AI",
    name: "gpt-4o",
  },
  tools,
});

// Run the agent
async function main() {
  console.log("[mastra] Starting Stripe webhook agent...");
  console.log("[mastra] Pulling events from simplehook...\n");

  const response = await agent.generate(
    "Check for new Stripe webhook events and tell me what happened. " +
    "Pull up to 5 events from the /stripe/* path.",
  );

  console.log("\n--- Agent Response ---");
  console.log(response.text);
  console.log("\n--- Done ---");
}

main().catch((err) => {
  console.error("[mastra] Error:", err.message);
  process.exit(1);
});
