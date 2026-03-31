# simplehook / simplehook-flask

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
pip install simplehook-flask
```

## Quick start

```python
from flask import Flask, request, jsonify
from simplehook_flask import listenToWebhooks

app = Flask(__name__)

listenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"])

@app.post("/stripe/events")
def stripe_webhook():
    print("Webhook received!", request.json)
    return jsonify(received=True)
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

## Dev mode

By default, simplehook only connects in development. Set `SIMPLEHOOK_ENABLED=false` to disable, or `force_enable: True` to force.

Production is detected when `FLASK_ENV === "production"` or `FLASK_DEBUG` is not set.

## Links

- [Documentation](https://www.simplehook.dev/docs)
- [Dashboard](https://www.simplehook.dev/dashboard)

## License

MIT
