# antiwebhooks

**Dead simple webhooks for developers.**

```javascript
const app = express();

// This one line replaces ngrok, Hookdeck, and everything else
require('antiwebhooks').listen(app, 'ak_x7f2k9m3p4...');

app.post('/stripe/webhook', (req, res) => {
  // This runs on your laptop. Stripe thinks it's talking to a real server.
  console.log('Payment received!', req.body);
  res.json({ received: true });
});
```

That's it. No CLI. No tunnel commands. No URL copying. Your Express app connects outbound to antiwebhooks, and we forward webhooks to your routes.

---

## How it works

```
Stripe/Twilio/GitHub
        |
        | POST https://hooks.antiwebhooks.dev/p_xxx/stripe/webhook
        v
┌─────────────────────────────────┐
│  antiwebhooks (cloud)           │
│  - Receives webhook             │
│  - Stores event                 │
│  - Finds connected app          │◄──── WebSocket (outbound from your app)
│  - Forwards through connection  │────► Your Express app on localhost
│  - Returns real response        │◄──── Express sends res.json({received:true})
│    back to Stripe               │
└─────────────────────────────────┘
```

Your app opens a WebSocket TO us (outbound — works through NAT, firewalls, corporate VPNs, everything). We forward webhooks through that connection. We return your app's real response back to the caller.

**No CLI. No tunnel process. No port forwarding. Just `npm install antiwebhooks`.**

---

## Setup (once, 2 minutes)

### 1. Sign up at antiwebhooks.dev — $5/mo

### 2. Get your stable webhook URLs

```
Stripe:  https://hooks.antiwebhooks.dev/p_8f3k2n/stripe/webhook
Twilio:  https://hooks.antiwebhooks.dev/p_8f3k2n/twilio/voice
GitHub:  https://hooks.antiwebhooks.dev/p_8f3k2n/github/push
```

Set these in Stripe/Twilio/GitHub **once**. Never change them.

### 3. Add one line to your app

```bash
npm install antiwebhooks
```

```javascript
require('antiwebhooks').listen(app, 'ak_x7f2k9m3p4...');
```

### 4. Start your app normally

```bash
npm run dev
```

Webhooks flow. That's it.

---

## Two modes per route

Configure in the dashboard:

| Path | Mode | When to use |
|------|------|-------------|
| `/twilio/*` | **passthrough** | Caller reads your response (TwiML XML) |
| `/stripe/*` | **queue** | Caller just wants 200 OK. We retry if your app is down. |
| `/github/*` | **queue** | Same — fire and forget with retry |

**Passthrough**: We hold Stripe/Twilio's connection open, forward to your app, return your real response. Twilio gets your TwiML XML back.

**Queue**: We return 200 to the caller immediately, store the event, deliver to your app async with retry. If your app is offline, events queue up and deliver when you reconnect.

Default for unconfigured paths: **queue** (never lose an event).

---

## Dashboard

See every webhook that hit your URLs. Replay failures. Configure routes.

```
┌──────────┬────────┬──────────────────────┬───────────┬─────────┐
│ Time     │ Method │ Path                 │ Status    │ Action  │
├──────────┼────────┼──────────────────────┼───────────┼─────────┤
│ 12:35:30 │ POST   │ /stripe/webhook      │ failed(1) │ [Replay]│
│ 12:35:02 │ POST   │ /github/push         │ delivered │         │
│ 12:34:15 │ POST   │ /twilio/voice        │ delivered │         │
└──────────┴────────┴──────────────────────┴───────────┴─────────┘
```

---

## Why not ngrok?

| | ngrok | antiwebhooks |
|---|---|---|
| Install a CLI | Yes | **No** |
| Run a separate process | Yes | **No** |
| URL changes every session | Yes (free) | **No** — permanent |
| Stale sessions block you | Yes | **No** |
| Retry failed deliveries | No | **Yes** |
| Replay from dashboard | No | **Yes** |
| Works through corporate VPN | Sometimes | **Always** (outbound WS) |
| Lines of code to integrate | 0 + CLI | **1 line** |

## Why not Hookdeck?

Hookdeck can't return your response to the caller. If Twilio needs TwiML XML back, Hookdeck breaks. We support passthrough mode — your Express response goes all the way back to Twilio.
