# Developer Examples

## Express + Stripe (queue mode)

```javascript
const express = require('express');
const simplehook = require('@simplehook/express');

const app = express();

// Connect to simplehook — webhooks flow through this connection
simplehook.listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

// Your route — works exactly like a normal Express route
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const event = JSON.parse(req.body);

  switch (event.type) {
    case 'checkout.session.completed':
      console.log('Payment received!');
      activateSubscription(event.data.object);
      break;
    case 'invoice.payment_failed':
      console.log('Payment failed');
      notifyCustomer(event.data.object);
      break;
  }

  res.json({ received: true });
});

app.listen(3001);
```

Set in Stripe Dashboard (once, never changes):
```
Webhook URL: https://hooks.simplehook.dev/p_8f3k2n/stripe/webhook
```

Run: `npm run dev`. Stripe webhooks arrive at your route. If your app is down, events queue and replay when you restart.

---

## Express + Twilio TwiML (passthrough mode)

This is the killer feature. Twilio needs your XML response back. We make it work.

```javascript
const express = require('express');
const simplehook = require('@simplehook/express');

const app = express();
app.use(express.urlencoded({ extended: true }));

simplehook.listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

// Twilio calls this and reads the XML response
app.post('/twilio/voice', (req, res) => {
  const answeredBy = req.body.AnsweredBy;

  if (answeredBy === 'machine_start') {
    res.type('text/xml').send('<Response><Hangup/></Response>');
    return;
  }

  res.type('text/xml').send(`
    <Response>
      <Dial callerId="+16467292166">
        <Client>agent-${req.query.agent}</Client>
      </Dial>
    </Response>
  `);
});

// Status callbacks — just log them, no response needed
app.post('/twilio/status', (req, res) => {
  console.log(`Call ${req.body.CallSid}: ${req.body.CallStatus}`);
  res.sendStatus(200);
});

app.listen(3001);
```

Configure routes in simplehook dashboard:
```
/twilio/voice   → passthrough   (Twilio reads the TwiML response)
/twilio/status  → queue         (fire-and-forget, retry on failure)
```

Set in Twilio (once):
```
Voice URL:       https://hooks.simplehook.dev/p_8f3k2n/twilio/voice
Status Callback: https://hooks.simplehook.dev/p_8f3k2n/twilio/status
```

**Twilio sends POST → simplehook holds the connection → forwards to your Express app via WebSocket → your app returns TwiML → simplehook returns it to Twilio.** Hookdeck cannot do this.

---

## Express + GitHub (queue mode)

```javascript
const express = require('express');
const simplehook = require('@simplehook/express');

const app = express();
app.use(express.json());

simplehook.listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

app.post('/github/push', (req, res) => {
  const { repository, commits } = req.body;
  console.log(`${repository.full_name}: ${commits.length} new commits`);
  triggerDeploy(repository, commits);
  res.json({ ok: true });
});

app.listen(3001);
```

GitHub webhook URL: `https://hooks.simplehook.dev/p_8f3k2n/github/push`

---

## What changes vs. a normal Express app?

One line: `simplehook.listenToWebhooks(app, key)`

Everything else is identical. Your routes, middleware, `req`, `res` — all work exactly the same. The SDK handles the WebSocket connection and feeds webhooks into Express's router.

```diff
  const express = require('express');
+ const simplehook = require('@simplehook/express');

  const app = express();

+ simplehook.listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

  app.post('/stripe/webhook', (req, res) => {
    // your existing code — no changes
  });

  app.listen(3001);
```

---

## AI Agent API — Pull webhooks via HTTP

AI agents and scripts can consume webhooks without an SDK or WebSocket. Use the pull API to fetch events on demand.

### curl — pull latest events

```bash
# Pull next 5 events
curl -H "Authorization: Bearer $SIMPLEHOOK_KEY" \
  "https://hook.simplehook.dev/api/agent/pull?n=5"

# Wait for next Stripe event (long-poll, blocks up to 60s)
curl -H "Authorization: Bearer $SIMPLEHOOK_KEY" \
  "https://hook.simplehook.dev/api/agent/pull?wait=true&path=/stripe/*&timeout=60"

# Stream events via SSE
curl -N -H "Authorization: Bearer $SIMPLEHOOK_KEY" \
  "https://hook.simplehook.dev/api/agent/pull?stream=true&timeout=300"

# Check queue status
curl -H "Authorization: Bearer $SIMPLEHOOK_KEY" \
  "https://hook.simplehook.dev/api/agent/status"
```

### Python — process Stripe events

```python
import requests
import os

KEY = os.environ["SIMPLEHOOK_KEY"]
BASE = "https://hook.simplehook.dev"

# Pull and process events in a loop
while True:
    resp = requests.get(
        f"{BASE}/api/agent/pull",
        headers={"Authorization": f"Bearer {KEY}"},
        params={"wait": "true", "path": "/stripe/*", "timeout": 30}
    )
    data = resp.json()

    for event in data["events"]:
        body = json.loads(event["body"])
        print(f"Stripe event: {body['type']}")
        handle_stripe_event(body)

    if not data["events"]:
        print("No events, polling again...")
```

### Node.js — reactive agent

```javascript
const SIMPLEHOOK_KEY = process.env.SIMPLEHOOK_KEY;

// Wait for a specific webhook, then act on it
async function waitForPayment() {
  const res = await fetch(
    "https://hook.simplehook.dev/api/agent/pull?wait=true&path=/stripe/*&timeout=60",
    { headers: { Authorization: `Bearer ${SIMPLEHOOK_KEY}` } }
  );
  const { events } = await res.json();

  if (events.length > 0) {
    const body = JSON.parse(events[0].body);
    console.log(`Got ${body.type} — processing...`);
    return body;
  }
  return null;
}
```

### Response format

```json
{
  "events": [
    {
      "id": "evt_abc123",
      "path": "/stripe/webhook",
      "method": "POST",
      "headers": { "stripe-signature": "t=1712..." },
      "body": "{ \"type\": \"checkout.session.completed\" }",
      "status": "delivered",
      "received_at": "2026-04-06T14:02:31Z"
    }
  ],
  "cursor": "evt_abc123",
  "remaining": 7
}
```

Each pull advances your cursor. Use `?listener_id=my-agent` to track separate cursors for different consumers.

---

## Environment-aware (production vs development)

In production, webhooks hit your server directly. In development, they go through simplehook. One pattern:

```javascript
if (process.env.NODE_ENV !== 'production') {
  require('@simplehook/express').listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);
}
```

Or just always use it — simplehook works in production too (adds ~50ms latency). But most developers will use it only in development and point webhook URLs directly at their production server.

---

## Python + FastAPI

```python
from fastapi import FastAPI, Request
import simplehook

app = FastAPI()

simplehook.listenToWebhooks(app, "ak_x7f2k9m3p4...")

@app.post("/stripe/webhook")
async def stripe_webhook(request: Request):
    body = await request.json()
    print(f"Event: {body['type']}")
    return {"received": True}
```

Same concept. Same WebSocket protocol. ~100 lines of Python SDK.

---

## The developer experience

**Day 1 (setup)**:
1. `npm install @simplehook/express` (10 seconds)
2. Add `simplehook.listenToWebhooks(app, key)` to your app (10 seconds)
3. Set webhook URLs in Stripe/Twilio/GitHub (2 minutes)

**Every other day**:
1. `npm run dev`
2. Webhooks just work.

No ngrok. No CLI. No tunnel commands. No URL copying. No stale sessions.
