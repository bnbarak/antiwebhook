# @simplehook/core

Core WebSocket client and HTTP pull API for [simplehook](https://simplehook.dev) -- receive webhooks locally without tunnels.

> **Most users should install a framework adapter, not this package directly.** Pick the one that matches your use case:
>
> | Package | Use case | Install |
> |---------|----------|---------|
> | [`@simplehook/express`](https://www.npmjs.com/package/@simplehook/express) | Receive webhooks in Express | `npm i @simplehook/express` |
> | [`@simplehook/fastify`](https://www.npmjs.com/package/@simplehook/fastify) | Receive webhooks in Fastify | `npm i @simplehook/fastify` |
> | [`@simplehook/hono`](https://www.npmjs.com/package/@simplehook/hono) | Receive webhooks in Hono | `npm i @simplehook/hono` |
> | [`@simplehook/cli`](https://www.npmjs.com/package/@simplehook/cli) | Pull/stream webhooks from the terminal | `npx @simplehook/cli pull` |
> | [`@simplehook/mastra`](https://www.npmjs.com/package/@simplehook/mastra) | Mastra AI agent tools | `npm i @simplehook/mastra` |
> | [`@simplehook/playwright`](https://www.npmjs.com/package/@simplehook/playwright) | Test real webhooks in Playwright E2E | `npm i @simplehook/playwright` |
> | [`simplehook-flask`](https://pypi.org/project/simplehook-flask/) | Receive webhooks in Flask | `pip install simplehook-flask` |
> | [`simplehook-fastapi`](https://pypi.org/project/simplehook-fastapi/) | Receive webhooks in FastAPI | `pip install simplehook-fastapi` |
>
> Use `@simplehook/core` when you need the low-level WebSocket client or the `SimplehookAgent` HTTP pull API.

## Install

```bash
npm install @simplehook/core
```

## WebSocket Client

`createClient` opens an outbound WebSocket to simplehook and dispatches incoming webhook requests through your handler.

```typescript
import { createClient } from "@simplehook/core";
import type { RequestFrame, ResponseFrame } from "@simplehook/core";

const dispatch = async (frame: RequestFrame): Promise<ResponseFrame> => {
  console.log(`${frame.method} ${frame.path}`);
  return { type: "response", id: frame.id, status: 200, headers: {}, body: null };
};

const conn = createClient(dispatch, process.env.SIMPLEHOOK_KEY!);

// Later: conn.close();
```

### Options

```typescript
createClient(dispatch, apiKey, {
  forceEnable: false,     // Connect even when NODE_ENV=production
  serverUrl: "...",       // Override WebSocket server URL
  listenerId: "staging",  // Route events to a specific listener
  onConnect: () => {},    // Called on connect
  onDisconnect: () => {}, // Called on disconnect
  silent: false,          // Suppress console output
});
```

## SimplehookAgent (HTTP Pull API)

For AI agents, CLIs, and scripts that consume webhook events via HTTP instead of a persistent WebSocket.

```typescript
import { SimplehookAgent } from "@simplehook/core";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY!);

// Pull next events
const { events, remaining } = await agent.pull();

// Long-poll until an event arrives
const result = await agent.pull({ wait: true, timeout: 30 });

// Filter by path
const stripeEvents = await agent.pull({ path: "/stripe/*", n: 10 });

// Stream events via SSE
await agent.stream((event) => {
  console.log(event.path, event.body);
});

// Check queue health
const status = await agent.status();
console.log(status.queue.pending, "events pending");
```

### Agent Options

```typescript
new SimplehookAgent(apiKey, {
  serverUrl: "...",       // Override server URL (default: https://hook.simplehook.dev)
  listenerId: "worker-1", // Cursor tracking ID (default: "default")
});
```

### Pull Options

| Option    | Type    | Default | Description                                |
| --------- | ------- | ------- | ------------------------------------------ |
| `n`       | number  | 1       | Number of events to return (1-100)         |
| `path`    | string  | --      | Path glob filter (e.g. `/stripe/*`)        |
| `wait`    | boolean | false   | Long-poll until an event arrives           |
| `timeout` | number  | 30      | Timeout in seconds for wait/stream         |
| `after`   | string  | --      | Read from this event ID without advancing  |

## Exports

```typescript
// Functions
export { createClient } from "./client";
export { SimplehookAgent } from "./agent";

// Types
export type {
  RequestFrame, ResponseFrame, PingFrame, InboundFrame,
  ListenOptions, Connection, DispatchFn,
  WebhookEvent, PullResult, PullOptions, StatusResult, AgentOptions,
};
```

## Links

- [Documentation](https://simplehook.dev/docs)
- [Dashboard](https://simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/antiwebhook)

## License

MIT
