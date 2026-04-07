import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { SimplehookAgent } from "simplehook-core";

export function createStatusTool(agent: SimplehookAgent) {
  return createTool({
    id: "simplehook_status",
    description:
      "Get simplehook queue health — pending/failed event counts, " +
      "connected listeners, cursor positions, and per-route breakdown.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      project_id: z.string(),
      queue: z.object({
        pending: z.number(),
        failed: z.number(),
        delivered_last_hour: z.number(),
        oldest_pending: z.string().nullable(),
      }),
      listeners: z.object({
        connected: z.array(z.string()),
        disconnected: z.array(z.string()),
      }),
      cursors: z.record(z.object({
        last_event: z.string().nullable(),
        behind: z.number(),
      })),
      routes: z.array(z.object({
        path: z.string(),
        mode: z.string(),
        pending: z.number(),
      })),
    }),
    execute: async () => {
      return await agent.status();
    },
  });
}
