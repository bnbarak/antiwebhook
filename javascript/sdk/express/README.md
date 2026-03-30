# simplehook

Stable webhook URLs for localhost. One line of code.

```
npm install simplehook
```

## Quick start

```typescript
import express from "express";
import { listen } from "simplehook";

const app = express();
app.use(express.json());

listen(app, process.env.SIMPLEHOOK_KEY);

app.post("/stripe/events", (req, res) => {
  console.log("Webhook received!", req.body);
  res.json({ received: true });
});

app.listen(3000);
```

That's it. Webhooks sent to your simplehook URL flow to your local Express app.

## How it works

Your app opens an outbound WebSocket to simplehook. When a webhook arrives at your stable URL, it's forwarded through the connection to your Express routes. Your response goes back to the caller.

No CLI. No tunnel process. No URL that changes every session.

## Options

```typescript
listen(app, apiKey, {
  forceEnable: false,   // Connect even in production
  serverUrl: "...",     // Override server URL
  onConnect: () => {},  // Called when connected
  onDisconnect: () => {},
  silent: false,        // Suppress console output
});
```

By default, simplehook only connects in development (`NODE_ENV !== "production"`).

Set `SIMPLEHOOK_ENABLED=false` to disable, or `SIMPLEHOOK_ENABLED=true` to force enable.

## Docs

Full documentation at **https://www.simplehook.dev/docs**

## License

MIT
