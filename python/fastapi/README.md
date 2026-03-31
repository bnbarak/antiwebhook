# simplehook / simplehook-fastapi

**One line of code. Webhooks just work.**

Stop tunneling. Stop polling. Stop building webhook infrastructure. Add one SDK call and your local app receives real webhooks from Stripe, GitHub, Twilio — any provider.

```python
listenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"])
```

Your app opens an outbound WebSocket to [simplehook.dev](https://simplehook.dev). When a webhook arrives at your stable URL, it's forwarded through the connection to your local server. Your response goes back to the caller. No CLI. No tunnel process. No URL that changes every session.

## Why simplehook?

- **No CLI** — just `pip install` and one function call
- **Permanent URLs** — set once in Stripe/GitHub, never change them
- **Real responses** — passthrough mode returns your actual response to the caller (TwiML, verification, etc.)
- **Queue + retry** — if your app is offline, events queue and deliver when you reconnect
- **Dev mode by default** — only connects in development, never in production

## Install

```bash
pip install simplehook-fastapi
```

## Quick start

```python
import os
from fastapi import FastAPI, Request
from simplehook_fastapi import listenToWebhooks

app = FastAPI()

listenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"])

@app.post("/stripe/events")
async def stripe_webhook(request: Request):
    body = await request.json()
    print("Webhook received!", body)
    return {"received": True}
```

## Options

```python
listenToWebhooks(app, api_key, {
    "force_enable": False,     # Connect even in production
    "server_url": "...",       # Override server URL
    "on_connect": callback,    # Called when connected
    "on_disconnect": callback, # Called when disconnected
    "silent": False,           # Suppress console output
})
```

## Agents

Use agents to run multiple SDK instances and route events to specific ones. Create agents in the dashboard, then assign them to routes.

```python
# This instance only receives events from routes assigned to "staging"
listenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"], "staging")
```

Your webhook URL stays the same — event routing is configured in the dashboard, not the URL.

## Dev mode

By default, simplehook only connects in development. Set `SIMPLEHOOK_ENABLED=false` to disable, or `force_enable: True` to force.

Production is detected when `FASTAPI_ENV === "production"` or `ENV === "production"`.

## Links

- [GitHub](https://github.com/bnbarak/antiwebhook)

- [Documentation](https://www.simplehook.dev/docs)
- [Dashboard](https://www.simplehook.dev/dashboard)

## License

MIT
