import Fastify from "fastify";
import { listenToWebhooks } from "simplehook-fastify";

const app = Fastify({ logger: true });

// Connect to simplehook — webhooks flow through this connection
const connection = listenToWebhooks(app, process.env.SIMPLEHOOK_KEY || "ak_your_key_here", {
  serverUrl: process.env.SIMPLEHOOK_URL || undefined,
  forceEnable: true,
});

// Stripe webhooks
app.post("/stripe/events", (request, reply) => {
  console.log("[stripe]", request.body?.type || "unknown event");
  reply.send({ received: true });
});

// GitHub webhooks
app.post("/github/push", (request, reply) => {
  console.log("[github]", request.body?.ref, request.body?.commits?.length, "commits");
  reply.send({ ok: true });
});

// Twilio voice (passthrough — response goes back to Twilio)
app.post("/twilio/voice", (request, reply) => {
  console.log("[twilio]", request.body?.CallSid, request.body?.CallStatus);
  reply.type("text/xml").send(`
    <Response>
      <Say>Hello from simplehook test app!</Say>
    </Response>
  `);
});

// Generic catch-all
app.all("/*", (request, reply) => {
  console.log(`[webhook] ${request.method} ${request.url}`);
  reply.send({ received: true, path: request.url, method: request.method });
});

const port = process.env.PORT || 3003;
app.listen({ port: Number(port), host: "0.0.0.0" }).then(() => {
  console.log(`Fastify test app listening on :${port}`);
  console.log("Waiting for webhooks via simplehook...");
});

process.on("SIGINT", () => {
  connection.close();
  process.exit(0);
});
