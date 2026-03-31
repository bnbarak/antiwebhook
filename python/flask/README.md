# simplehook-flask

Stable webhook URLs for localhost. One line of code.

> Part of the [simplehook](https://simplehook.dev) ecosystem.

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

## How it works

Your app opens an outbound WebSocket to simplehook. When a webhook arrives at your stable URL, it's forwarded through the connection to your Flask routes. Your response goes back to the caller.

No CLI. No tunnel process. No URL that changes every session.

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

## Migration

The `listen` function is still available as a deprecated alias for `listenToWebhooks`. Update your code when convenient:

```diff
- from simplehook_flask import listen
+ from simplehook_flask import listenToWebhooks
```

## Links

- [Documentation](https://www.simplehook.dev/docs)
- [Dashboard](https://www.simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/antiwebhook)

## License

MIT
