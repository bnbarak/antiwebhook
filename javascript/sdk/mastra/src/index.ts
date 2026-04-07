import { SimplehookAgent } from "simplehook-core";
import type { AgentOptions } from "simplehook-core";
import { createPullTool } from "./tools/pull.js";
import { createStatusTool } from "./tools/status.js";

export { createPullTool } from "./tools/pull.js";
export { createStatusTool } from "./tools/status.js";

export interface SimplehookToolsOptions extends AgentOptions {
  /** API key. Falls back to SIMPLEHOOK_KEY env var. */
  apiKey?: string;
}

/**
 * Create all simplehook Mastra tools. Returns an object with
 * `simplehook_pull` and `simplehook_status` tools ready to pass to a Mastra agent.
 *
 * ```ts
 * import { createSimplehookTools } from "simplehook-mastra";
 *
 * const tools = createSimplehookTools({ apiKey: "ak_..." });
 * const agent = new Agent({ tools });
 * ```
 */
export function createSimplehookTools(opts: SimplehookToolsOptions = {}) {
  const apiKey = opts.apiKey ?? process.env.SIMPLEHOOK_KEY;
  if (!apiKey) {
    throw new Error("simplehook API key required. Pass apiKey or set SIMPLEHOOK_KEY env var.");
  }

  const agent = new SimplehookAgent(apiKey, {
    serverUrl: opts.serverUrl,
    listenerId: opts.listenerId,
  });

  return {
    simplehook_pull: createPullTool(agent),
    simplehook_status: createStatusTool(agent),
  };
}
