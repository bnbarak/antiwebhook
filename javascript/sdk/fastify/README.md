# simplehook-fastify

Stable webhook URLs for localhost. One line of code.

> Part of the [simplehook](https://simplehook.dev) ecosystem.

## Install

```bash
npm install simplehook-fastify
```

## Quick start

```typescript
import Fastify from "fastify";
import { listenToWebhooks } from "simplehook-fastify";

const app = Fastify();

listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

app.post("/stripe/events", async (request, reply) => {
  console.log("Webhook received!", request.body);
  return { received: true };
});

app.listen({ port: 3000 });
```

## How it works

Your app opens an outbound WebSocket to simplehook. When a webhook arrives at your stable URL, it's forwarded through the connection to your Fastify routes. Your response goes back to the caller.

No CLI. No tunnel process. No URL that changes every session.

## Options

```typescript
listenToWebhooks(app, apiKey, {
  forceEnable: false,     // Connect even in production
  serverUrl: "...",       // Override server URL
  onConnect: () => {},    // Called when connected
  onDisconnect: () => {}, // Called when disconnected
  silent: false,          // Suppress console output
});
```

## Dev mode

By default, simplehook only connects in development. Set `SIMPLEHOOK_ENABLED=false` to disable, or `forceEnable: true` to force.

Production is detected when `NODE_ENV === "production"`.

## Links

- [Documentation](https://www.simplehook.dev/docs)
- [Dashboard](https://www.simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/antiwebhook)

## License

MIT
