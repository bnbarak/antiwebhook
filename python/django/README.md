# simplehook-django

Stable webhook URLs for localhost. One line of code.

> Part of the [simplehook](https://simplehook.dev) ecosystem.

## Install

```bash
pip install simplehook-django
```

## Quick start

```python
# manage.py or wsgi.py
import os
import django
from django.core.wsgi import get_wsgi_application
from simplehook_django import listenToWebhooks

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "myproject.settings")
django.setup()

application = get_wsgi_application()

listenToWebhooks(application, os.environ["SIMPLEHOOK_KEY"])
```

```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt

@csrf_exempt
def stripe_webhook(request):
    print("Webhook received!", request.body)
    return JsonResponse({"received": True})
```

## How it works

Your app opens an outbound WebSocket to simplehook. When a webhook arrives at your stable URL, it's forwarded through the connection to your Django views. Your response goes back to the caller.

No CLI. No tunnel process. No URL that changes every session.

## Options

```python
listenToWebhooks(application, api_key, {
    "force_enable": False,     # Connect even in production
    "server_url": "...",       # Override server URL
    "on_connect": callback,    # Called when connected
    "on_disconnect": callback, # Called when disconnected
    "silent": False,           # Suppress console output
})
```

## Dev mode

By default, simplehook only connects in development. Set `SIMPLEHOOK_ENABLED=false` to disable, or `force_enable: True` to force.

Production is detected when `DJANGO_SETTINGS_MODULE` is set and `DEBUG` is `False`.

## Links

- [Documentation](https://www.simplehook.dev/docs)
- [Dashboard](https://www.simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/antiwebhook)

## License

MIT
