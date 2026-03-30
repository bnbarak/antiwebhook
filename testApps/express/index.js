import express from "express";
import { listen } from "simplehook";

const app = express();
app.use(express.json());

// Connect to simplehook — webhooks flow through this connection
const connection = listen(app, "ak_sev2wk9abp05yvoxb8gkn1ca", {
  serverUrl: process.env.SIMPLEHOOK_URL || undefined,
  forceEnable: true,
});

// Stripe webhooks
app.post("/stripe/events", (req, res) => {
  console.log("[stripe]", req.body?.type || "unknown event");
  res.json({ received: true });
});

// GitHub webhooks
app.post("/github/push", (req, res) => {
  console.log("[github]", req.body?.ref, req.body?.commits?.length, "commits");
  res.json({ ok: true });
});

// Twilio voice (passthrough — response goes back to Twilio)
app.post("/twilio/voice", (req, res) => {
  console.log("[twilio]", req.body?.CallSid, req.body?.CallStatus);
  res.type("text/xml").send(`
    <Response>
      <Say>Hello from simplehook test app!</Say>
    </Response>
  `);
});

// Generic catch-all
app.all("*", (req, res) => {
  console.log(`[webhook] ${req.method} ${req.url}`);
  res.json({ received: true, path: req.url, method: req.method });
});

const port = process.env.PORT || 3002;
app.listen(port, () => {
  console.log(`Express test app listening on :${port}`);
  console.log("Waiting for webhooks via simplehook...");
});

process.on("SIGINT", () => {
  connection.close();
  process.exit(0);
});
