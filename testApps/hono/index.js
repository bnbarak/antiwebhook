import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { listenToWebhooks } from "@simplehook/hono";

const app = new Hono();

// Connect to simplehook — webhooks flow through this connection
const listenerId = process.env.SIMPLEHOOK_LISTENER || undefined;
const connection = listenToWebhooks(app, process.env.SIMPLEHOOK_KEY || "ak_your_key_here", listenerId, {
  serverUrl: process.env.SIMPLEHOOK_URL || undefined,
  forceEnable: true,
});

// Stripe webhooks
app.post("/stripe/events", async (c) => {
  const body = await c.req.json();
  console.log("[stripe]", body?.type || "unknown event");
  return c.json({ received: true });
});

// GitHub webhooks
app.post("/github/push", async (c) => {
  const body = await c.req.json();
  console.log("[github]", body?.ref, body?.commits?.length, "commits");
  return c.json({ ok: true });
});

// Twilio voice (passthrough — response goes back to Twilio)
app.post("/twilio/voice", async (c) => {
  const body = await c.req.parseBody();
  console.log("[twilio]", body?.CallSid, body?.CallStatus);
  return c.text(`
    <Response>
      <Say>Hello from simplehook test app!</Say>
    </Response>
  `, 200, { "Content-Type": "text/xml" });
});

// Generic catch-all
app.all("/*", async (c) => {
  console.log(`[webhook] ${c.req.method} ${c.req.url}`);
  const url = new URL(c.req.url);
  return c.json({ received: true, path: url.pathname, method: c.req.method });
});

const port = process.env.PORT || 3002;
serve({ fetch: app.fetch, port: Number(port) }, () => {
  console.log(`Hono test app listening on :${port}`);
  console.log("Waiting for webhooks via simplehook...");
});

process.on("SIGINT", () => {
  connection.close();
  process.exit(0);
});
