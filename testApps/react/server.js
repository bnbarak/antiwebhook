import express from "express";
import { listen } from "simplehook";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// Store received webhooks in memory for the UI
const events = [];
const MAX_EVENTS = 100;

function addEvent(method, path, body, headers) {
  events.unshift({
    id: crypto.randomUUID(),
    method,
    path,
    body,
    headers,
    timestamp: new Date().toISOString(),
  });
  if (events.length > MAX_EVENTS) events.pop();
}

// Connect to simplehook
const connection = listen(app, process.env.SIMPLEHOOK_KEY, {
  serverUrl: process.env.SIMPLEHOOK_URL || undefined,
  forceEnable: true,
});

// Stripe
app.post("/stripe/*", (req, res) => {
  addEvent(req.method, req.url, req.body, req.headers);
  console.log("[stripe]", req.body?.type);
  res.json({ received: true });
});

// GitHub
app.post("/github/*", (req, res) => {
  addEvent(req.method, req.url, req.body, req.headers);
  console.log("[github]", req.body?.action || req.body?.ref);
  res.json({ received: true });
});

// Twilio (passthrough)
app.post("/twilio/*", (req, res) => {
  addEvent(req.method, req.url, req.body, req.headers);
  console.log("[twilio]", req.body?.CallSid);
  res.type("text/xml").send("<Response><Say>Hello!</Say></Response>");
});

// Shopify
app.post("/shopify/*", (req, res) => {
  addEvent(req.method, req.url, req.body, req.headers);
  console.log("[shopify]", req.body?.topic);
  res.json({ received: true });
});

// Catch-all
app.all("/webhook*", (req, res) => {
  addEvent(req.method, req.url, req.body, req.headers);
  console.log(`[webhook] ${req.method} ${req.url}`);
  res.json({ received: true });
});

// API: list events for the React UI
app.get("/api/events", (req, res) => {
  res.json(events);
});

// Serve the React UI
app.get("/", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

const port = process.env.PORT || 3002;
app.listen(port, () => {
  console.log(`React test app at http://localhost:${port}`);
  console.log("Listening for webhooks from: Stripe, GitHub, Twilio, Shopify");
});

process.on("SIGINT", () => {
  connection.close();
  process.exit(0);
});
