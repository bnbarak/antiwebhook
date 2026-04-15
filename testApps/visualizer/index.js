/**
 * simplehook visualizer — live webhook monitor with colorful terminal table
 *
 * Usage:
 *   SIMPLEHOOK_KEY=ak_... node index.js
 *
 * Then fire webhooks with boom.js:
 *   node ../boom.js <project_id>
 */

import express from "express";
import { listenToWebhooks } from "@simplehook/express";
import chalk from "chalk";
import logUpdate from "log-update";

const app = express();
app.use(express.json());

// ── State ────────────────────────────────────────────────────────────

const events = [];
let startTime = null;
let successCount = 0;
let failCount = 0;

// ── Provider colors ──────────────────────────────────────────────────

const PROVIDER_COLORS = {
  stripe:  chalk.cyan,
  github:  chalk.green,
  twilio:  chalk.yellow,
  shopify: chalk.magenta,
  linear:  chalk.blue,
  custom:  chalk.white,
  unknown: chalk.gray,
};

function detectProvider(path) {
  const segment = path.split("/")[1]?.toLowerCase() || "";
  if (segment in PROVIDER_COLORS) return segment;
  return "unknown";
}

// ── Body preview formatters ──────────────────────────────────────────

function formatBody(provider, path, body) {
  if (!body) return chalk.dim("(empty)");

  try {
    switch (provider) {
      case "stripe": {
        const type = body.type || "event";
        const amount = body.amount ?? body.amount_paid;
        return amount != null ? `${type} — $${amount}` : type;
      }
      case "github": {
        if (body.ref) {
          const commits = body.commits?.length ?? 0;
          return `${body.ref} — ${commits} commit${commits !== 1 ? "s" : ""}`;
        }
        if (body.action && body.issue) {
          return `${body.action}: ${body.issue.title || `Issue #${body.issue.number}`}`;
        }
        return body.action || JSON.stringify(body).slice(0, 40);
      }
      case "twilio": {
        const sid = body.CallSid || body.MessageSid || "";
        if (body.CallStatus) return `${sid} — ${body.CallStatus}`;
        if (body.Body) return `${sid} — "${body.Body}"`;
        return sid;
      }
      case "shopify": {
        const id = body.id ? `#${body.id}` : "";
        const price = body.total_price ? `$${body.total_price}` : "";
        return [id, price].filter(Boolean).join(" — ");
      }
      case "linear": {
        const action = body.action || "event";
        const title = body.data?.title || "";
        const priority = body.data?.priority ? `P${body.data.priority}` : "";
        return [action, title, priority ? `(${priority})` : ""].filter(Boolean).join(": ").replace(": (", " (");
      }
      case "custom": {
        if (path.includes("deploy")) {
          return `${body.service || "app"} v${body.version || "?"} → ${body.env || "unknown"}`;
        }
        if (path.includes("alert")) {
          const icons = { info: "ℹ", warn: "⚠", error: "✗" };
          const icon = icons[body.level] || "•";
          return `${icon} ${body.level}: ${body.message || "alert"}`;
        }
        return JSON.stringify(body).slice(0, 40);
      }
      default:
        return JSON.stringify(body).slice(0, 40);
    }
  } catch {
    return chalk.dim("(parse error)");
  }
}

// ── Table rendering ──────────────────────────────────────────────────

const COL = { time: 10, listener: 12, provider: 10, path: 20, method: 8, status: 8, body: 30 };

function pad(str, len) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI for length calc
  if (visible.length >= len) return str.slice(0, len + (str.length - visible.length));
  return str + " ".repeat(len - visible.length);
}

function center(str, len) {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, "");
  const left = Math.floor((len - visible.length) / 2);
  const right = len - visible.length - left;
  return " ".repeat(Math.max(0, left)) + str + " ".repeat(Math.max(0, right));
}

// Debounced render — batch rapid updates into a single frame
let renderTimer = null;
function scheduleRender() {
  if (renderTimer) return; // already scheduled
  renderTimer = setTimeout(() => {
    renderTimer = null;
    renderNow();
  }, 50); // 20fps max
}

function renderNow() {
  const rows = process.stdout.rows || 40;
  const cols = process.stdout.columns || 100;
  const bar = chalk.dim("━".repeat(Math.min(cols - 4, 96)));

  // How many event rows fit (header=5 lines, footer=3 lines, padding=2)
  const maxEvents = Math.max(5, rows - 10);
  const visibleEvents = events.slice(-maxEvents);

  const elapsed = startTime ? (Date.now() - startTime) / 1000 : 0;
  const rps = elapsed > 0 ? (events.length / elapsed).toFixed(1) : "0.0";

  let output = "";

  // Header
  output += "\n";
  const listenerLabel = listenerId ? chalk.magenta(listenerId) : chalk.dim("default");
  output += `  ${chalk.bold("simplehook")} ${chalk.dim("—")} ${listenerLabel} ${chalk.dim("— live webhook monitor")}`;
  output += `${" ".repeat(Math.max(2, 40 - (listenerId?.length || 7)))}${chalk.bold.white(`${events.length}`)} ${chalk.dim("events received")}\n`;
  output += `  ${bar}\n`;
  output += "\n";

  // Table header
  const headerRow = `  ${chalk.dim("|")} ${chalk.bold(pad("Time", COL.time))}${chalk.dim("|")} ${chalk.bold(pad("Listener", COL.listener))}${chalk.dim("|")} ${chalk.bold(pad("Provider", COL.provider))}${chalk.dim("|")} ${chalk.bold(pad("Path", COL.path))}${chalk.dim("|")} ${chalk.bold(center("Method", COL.method))}${chalk.dim("|")} ${chalk.bold(center("Status", COL.status))}${chalk.dim("|")} ${chalk.bold(pad("Body Preview", COL.body))}${chalk.dim("|")}`;
  output += headerRow + "\n";

  const sepRow = `  ${chalk.dim("|")}${chalk.dim("=".repeat(COL.time + 1))}${chalk.dim("|")}${chalk.dim("=".repeat(COL.listener + 1))}${chalk.dim("|")}${chalk.dim("=".repeat(COL.provider + 1))}${chalk.dim("|")}${chalk.dim("=".repeat(COL.path + 1))}${chalk.dim("|")}${chalk.dim("=".repeat(COL.method + 1))}${chalk.dim("|")}${chalk.dim("=".repeat(COL.status + 1))}${chalk.dim("|")}${chalk.dim("=".repeat(COL.body + 1))}${chalk.dim("|")}`;
  output += sepRow + "\n";

  // Event rows
  for (const ev of visibleEvents) {
    const time = chalk.dim(ev.time);
    const listener = chalk.magenta(ev.listener);
    const colorFn = PROVIDER_COLORS[ev.provider] || chalk.gray;
    const provider = colorFn(ev.provider);
    const path = chalk.white(ev.path);
    const method = chalk.white(ev.method);
    const status = ev.status >= 200 && ev.status < 300
      ? chalk.green(String(ev.status))
      : chalk.red(String(ev.status));
    const body = ev.bodyPreview;

    output += `  ${chalk.dim("|")} ${pad(time, COL.time)}${chalk.dim("|")} ${pad(listener, COL.listener)}${chalk.dim("|")} ${pad(provider, COL.provider)}${chalk.dim("|")} ${pad(path, COL.path)}${chalk.dim("|")} ${center(method, COL.method)}${chalk.dim("|")} ${center(status, COL.status)}${chalk.dim("|")} ${pad(body, COL.body)}${chalk.dim("|")}\n`;
  }

  const totalCols = COL.time + COL.listener + COL.provider + COL.path + COL.method + COL.status + COL.body + 6;
  if (visibleEvents.length === 0) {
    output += `  ${chalk.dim("|")} ${chalk.dim(center("Waiting for webhooks...", totalCols))} ${chalk.dim("|")}\n`;
  }

  // Footer
  output += "\n";
  output += `  ${bar}\n`;
  output += `  ${chalk.dim("↑")} ${chalk.bold(String(events.length))} received ${chalk.dim("|")} ${chalk.green("✓")} ${successCount} ok ${chalk.dim("|")} ${chalk.red("✗")} ${failCount} failed ${chalk.dim("|")} ${chalk.yellow(rps)} req/s\n`;

  logUpdate(output);
}

// ── Event handler ────────────────────────────────────────────────────

function addEvent(provider, req, status = 200) {
  if (!startTime) startTime = Date.now();

  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");

  if (status >= 200 && status < 300) successCount++;
  else failCount++;

  events.push({
    time,
    listener: listenerId || "default",
    provider,
    path: req.url,
    method: req.method,
    status,
    bodyPreview: formatBody(provider, req.url, req.body),
  });

  scheduleRender();
}

// ── Routes ───────────────────────────────────────────────────────────

app.post("/stripe/*", (req, res) => {
  addEvent("stripe", req);
  res.json({ received: true });
});

app.post("/github/*", (req, res) => {
  addEvent("github", req);
  res.json({ received: true });
});

app.post("/twilio/*", (req, res) => {
  addEvent("twilio", req);
  res.json({ received: true });
});

app.post("/shopify/*", (req, res) => {
  addEvent("shopify", req);
  res.json({ received: true });
});

app.post("/linear/*", (req, res) => {
  addEvent("linear", req);
  res.json({ received: true });
});

app.post("/custom/*", (req, res) => {
  addEvent("custom", req);
  res.json({ received: true });
});

app.all("*", (req, res) => {
  addEvent(detectProvider(req.url), req);
  res.json({ received: true });
});

// ── Start ────────────────────────────────────────────────────────────

const key = process.env.SIMPLEHOOK_KEY || "ak_your_key_here";
const listenerId = process.env.SIMPLEHOOK_LISTENER || undefined;

const connection = listenToWebhooks(app, key, listenerId, {
  serverUrl: process.env.SIMPLEHOOK_URL || undefined,
  forceEnable: true,
  silent: true,
});

const port = process.env.PORT || 3099;
app.listen(port, () => {
  // Enter alternate screen buffer (like vim/htop/claude)
  process.stdout.write("\x1b[?1049h");
  // Hide cursor
  process.stdout.write("\x1b[?25l");
  renderNow(); // Initial render with empty table
});

process.on("SIGINT", () => {
  // Show cursor
  process.stdout.write("\x1b[?25h");
  // Leave alternate screen buffer (restores previous terminal content)
  process.stdout.write("\x1b[?1049l");
  connection.close();
  process.exit(0);
});
