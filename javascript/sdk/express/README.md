# @simplehook/express

One line of code to receive webhooks locally in Express. No tunnels, no CLI, no ngrok.

```typescript
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);
```

Your app opens an outbound WebSocket to [simplehook.dev](https://simplehook.dev). When a webhook arrives at your stable URL, it's forwarded to your local Express server. Your response goes back to the caller. Set your webhook URL once in Stripe/GitHub/Twilio and never change it.

## Install

```bash
npm install @simplehook/express
```

## Quick Start

```typescript
import express from "express";
import { listenToWebhooks } from "@simplehook/express";

const app = express();
app.use(express.json());

listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

app.post("/stripe/events", (req, res) => {
  console.log("Webhook received!", req.body);
  res.json({ received: true });
});

app.listen(3000);
```

## API

### `listenToWebhooks(app, apiKey, options?): Connection`

Connects your Express app to simplehook and returns a `Connection` handle.

```typescript
const conn = listenToWebhooks(app, apiKey, {
  forceEnable: false,     // Connect even in production
  serverUrl: "...",       // Override server URL
  onConnect: () => {},    // Called when connected
  onDisconnect: () => {}, // Called when disconnected
  silent: false,          // Suppress console output
});

// Later: conn.close();
```

### `listenToWebhooks(app, apiKey, listenerId, options?)`

Pass a listener ID to route events to a specific SDK instance. Create listeners in the [dashboard](https://simplehook.dev/dashboard).

```typescript
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY, "staging");
```

### `SimplehookAgent`

Re-exported from `@simplehook/core` for convenience. Use it to pull webhook events via HTTP in scripts, CLIs, or AI agents.

```typescript
import { SimplehookAgent } from "@simplehook/express";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY);
const { events } = await agent.pull();
```

## Dev Mode

By default, simplehook only connects in development (`NODE_ENV !== "production"`). Use `forceEnable: true` to override, or set `SIMPLEHOOK_ENABLED=false` to disable explicitly.

## Links

- [Documentation](https://simplehook.dev/docs)
- [Dashboard](https://simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/simplehook)

## License

MIT
