# One URL, Two Consumers: How Simplehook Serves Both Your App and Your AI Agent

Webhook development has a plumbing problem. Your app runs on localhost:3000, but Stripe, GitHub, or Clerk need to POST to a public URL. So you fire up ngrok, get a fresh URL, paste it into a dashboard, and start building. Tomorrow you do it all again because the URL expired.

Simplehook gives you a stable URL that never changes. But the interesting part is not the URL itself -- it is how events get from that URL to your code, and why the same architecture cleanly serves two very different consumption patterns.

## The outbound WebSocket model

Most tunneling tools work by exposing a port. Your machine accepts inbound connections from the internet, which means NAT traversal, firewall rules, or a relay server proxying TCP.

Simplehook flips this. Your application opens an outbound WebSocket to simplehook's cloud. No port forwarding. No public IP. No firewall configuration. The connection originates from your machine, so it passes through any NAT or corporate firewall the same way your browser does.

When a webhook arrives at your stable simplehook URL, the cloud service sends a request frame down the existing WebSocket to your app. Your app processes it and sends the response frame back up the same connection. From the webhook provider's perspective, they got a normal HTTP response. From your app's perspective, the request came in through the framework's normal routing -- Express middleware, Fastify hooks, Hono handlers all work as expected.

The SDK setup is a single function call:

```js
import express from "express";
import { listenToWebhooks } from "@simplehook/express";

const app = express();

app.post("/stripe/webhook", (req, res) => {
  // your normal webhook handler
  res.json({ received: true });
});

listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);
app.listen(3000);
```

That `listenToWebhooks` call opens the WebSocket, spins up a loopback HTTP server on an ephemeral port, and proxies request frames into your Express app. Auto-reconnect handles disconnections with exponential backoff. In production (`NODE_ENV=production`), it becomes a no-op -- no code changes needed for deployment.

The same pattern works across Fastify, Hono, Flask, and FastAPI. One import, one call.

## The agent pull model

The WebSocket model is perfect for a running application processing webhooks in real time. But AI agents have a different consumption pattern.

An agent built with Cursor, Claude Code, or a Mastra pipeline does not keep a web server running. It wakes up, does work, and goes back to sleep. It needs to pull events on its own schedule, not have them pushed.

Simplehook handles this through a cursor-based pull API. Every webhook that arrives at your stable URL gets durably queued. An agent consumes those events via HTTP:

```bash
npx @simplehook/cli pull --wait --key $SIMPLEHOOK_KEY
```

The `--wait` flag turns this into a long-poll: the request blocks until a new event arrives, then returns it as JSON. For continuous consumption, `--stream` switches to SSE mode, delivering events as a real-time stream.

Each consumer gets a cursor tracking its position in the event queue. Pull 5 events, the cursor advances by 5. An agent can disconnect, come back hours later, and pick up exactly where it left off. No missed events. No duplicates.

The same API is available programmatically through the `SimplehookAgent` class:

```js
import { SimplehookAgent } from "@simplehook/core";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY);

const { events, cursor, remaining } = await agent.pull({ wait: true });
```

Agents can filter by path (`/stripe/*`, `/github/*`), request batches of up to 100 events, or stream via SSE with a callback. The status endpoint exposes pending counts, cursor positions, and connected listeners.

## One URL, two consumers

This is the design that ties it together. A single simplehook URL accepts webhooks from any provider. Those events are simultaneously available to:

1. **Your running application** via the real-time WebSocket push model. Events are dispatched to your framework's router the instant they arrive.

2. **An AI agent (or any HTTP client)** via the cursor-based pull API. Events are durably queued and consumed at the agent's pace.

Both consumers operate independently. Separate cursors, separate connection lifecycles, separate failure modes. Your Express app can be down while an agent pulls from the queue. The agent can be idle while your app processes webhooks in real time.

This matters because modern development increasingly involves both patterns. You are building a Stripe integration in Express, and your AI coding agent needs to observe incoming payloads to help debug the signature verification that keeps failing. Same events, two consumers, zero extra configuration.

## What the architecture avoids

No daemon. No background process. No Docker container. No DNS records.

The WebSocket is outbound, so there is nothing to expose. The pull API is plain HTTP, so there is nothing to install beyond an npm package. The stable URL means you configure your webhook provider once and never touch it again.

The complexity of webhook forwarding collapses into a WebSocket that your app manages and an HTTP endpoint that agents query. One URL, no infrastructure.

That is the whole idea.
