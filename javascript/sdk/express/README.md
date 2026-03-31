# simplehook / simplehook-express

**One line of code. Webhooks just work.**

Stop tunneling. Stop polling. Stop building webhook infrastructure. Add one SDK call and your local app receives real webhooks from Stripe, GitHub, Twilio — any provider.

```typescript
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);
```

Your app opens an outbound WebSocket to [simplehook.dev](https://simplehook.dev). When a webhook arrives at your stable URL, it's forwarded through the connection to your local server. Your response goes back to the caller. No CLI. No tunnel process. No URL that changes every session.

## Why simplehook?

- **No CLI** — just `npm install` and one function call
- **Permanent URLs** — set once in Stripe/GitHub, never change them
- **Real responses** — passthrough mode returns your actual response to the caller (TwiML, verification, etc.)
- **Queue + retry** — if your app is offline, events queue and deliver when you reconnect
- **Dev mode by default** — only connects in development, never in production

## Install

```bash
npm install simplehook
```

## Quick start

```typescript
import express from "express";
import { listenToWebhooks } from "simplehook";

const app = express();
app.use(express.json());

listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

app.post("/stripe/events", (req, res) => {
  console.log("Webhook received!", req.body);
  res.json({ received: true });
});

app.listen(3000);
```

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

- [GitHub](https://github.com/bnbarak/antiwebhook)

- [Documentation](https://www.simplehook.dev/docs)
- [Dashboard](https://www.simplehook.dev/dashboard)

## License

MIT
