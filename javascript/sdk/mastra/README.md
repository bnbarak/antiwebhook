# @simplehook/mastra

[Mastra](https://mastra.ai) tools for [simplehook](https://simplehook.dev) -- let AI agents pull webhook events and check queue status.

## Install

```bash
npm install @simplehook/mastra
```

Requires `@mastra/core` as a peer dependency (`>=0.10.0`).

## Quick Start

```typescript
import { Agent } from "@mastra/core/agent";
import { createSimplehookTools } from "@simplehook/mastra";

// Reads SIMPLEHOOK_KEY from the environment by default
const tools = createSimplehookTools();

const agent = new Agent({
  name: "webhook-agent",
  tools,
  // ...model config
});
```

The agent now has two tools: `simplehook_pull` and `simplehook_status`.

## API

### `createSimplehookTools(options?)`

Returns `{ simplehook_pull, simplehook_status }` ready to pass to a Mastra agent.
Called with no arguments, it reads `SIMPLEHOOK_KEY` from the environment.

```typescript
// Defaults — reads SIMPLEHOOK_KEY from env
createSimplehookTools();

// Override anything you need
createSimplehookTools({
  apiKey: "ak_...",         // Optional — falls back to SIMPLEHOOK_KEY env var
  serverUrl: "...",         // Override server URL
  listenerId: "agent-1",    // Cursor tracking ID (default: "default")
});
```

### Tool: `simplehook_pull`

Pulls webhook events from the queue. The agent can call this tool with:

| Parameter | Type    | Description                                |
| --------- | ------- | ------------------------------------------ |
| `n`       | number  | Number of events to return (1-100)         |
| `path`    | string  | Path glob filter (e.g. `/stripe/*`)        |
| `wait`    | boolean | Block until an event arrives               |
| `timeout` | number  | Timeout in seconds for wait mode (1-300)   |

Returns `{ events, cursor, remaining }`.

### Tool: `simplehook_status`

Returns queue health with no input required: pending/failed counts, connected listeners, cursor positions, and per-route breakdown.

### Individual Tool Factories

You can also create tools individually:

```typescript
import { SimplehookAgent } from "@simplehook/core";
import { createPullTool, createStatusTool } from "@simplehook/mastra";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY);
const pullTool = createPullTool(agent);
const statusTool = createStatusTool(agent);
```

## Links

- [Documentation](https://simplehook.dev/docs)
- [Dashboard](https://simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/antiwebhook)

## License

MIT
