import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SimplehookAgent } from "simplehook-core";

export function createPullTool(agent: SimplehookAgent) {
  return createTool({
    id: "simplehook_pull",
    description:
      "Pull webhook events from simplehook. Returns the next events the agent hasn't seen. " +
      "Use path to filter (e.g. '/stripe/*'). Use wait=true to block until an event arrives.",
    inputSchema: z.object({
      n: z.number().min(1).max(100).optional().describe("Number of events to return (1-100). Default: 1"),
      path: z.string().optional().describe("Path glob filter (e.g. /stripe/*)"),
      wait: z.boolean().optional().describe("Long-poll: block until an event arrives. Default: false"),
      timeout: z.number().optional().describe("Timeout in seconds for wait mode (1-300). Default: 30"),
    }),
    outputSchema: z.object({
      events: z.array(z.object({
        id: z.string(),
        path: z.string(),
        method: z.string(),
        headers: z.record(z.string()),
        body: z.string().nullable(),
        status: z.string(),
        received_at: z.string(),
      })),
      cursor: z.string().nullable(),
      remaining: z.number(),
    }),
    execute: async ({ context }) => {
      return await agent.pull({
        n: context.n,
        path: context.path,
        wait: context.wait,
        timeout: context.timeout,
      });
    },
  });
}
