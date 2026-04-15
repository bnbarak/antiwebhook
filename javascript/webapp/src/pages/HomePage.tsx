import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  ArrowRight,
  Zap,
  RotateCcw,
  Shield,
  Lock,
  Clock,
  Terminal,
  Radio,
  Check,
} from "lucide-react";

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
      <span className="inline-block h-px w-5 bg-border-strong" />
      {children}
    </div>
  );
}

function SectionDivider() {
  return <div className="border-t border-border" />;
}

// ── Hero code blocks ─────────────────────────────────────────────────

const HERO_SDKS = [
  { id: "express", name: "Express", file: "app.ts", code: `import express from "express";
import { listenToWebhooks } from "@simplehook/express";

const app = express();
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

app.post("/stripe/events", (req, res) => {
  console.log("Webhook:", req.body);
  res.json({ received: true });
});` },
  { id: "fastify", name: "Fastify", file: "app.ts", code: `import Fastify from "fastify";
import { listenToWebhooks } from "@simplehook/fastify";

const app = Fastify();
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);

app.post("/stripe/events", async (req) => {
  console.log("Webhook:", req.body);
  return { received: true };
});` },
  { id: "flask", name: "Flask", file: "app.py", code: `import os
from flask import Flask, request
from simplehook_flask import listenToWebhooks

app = Flask(__name__)
listenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"])

@app.post("/stripe/events")
def stripe():
    print("Webhook:", request.json)
    return {"received": True}` },
  { id: "fastapi", name: "FastAPI", file: "app.py", code: `import os
from fastapi import FastAPI, Request
from simplehook_fastapi import listenToWebhooks

app = FastAPI()
listenToWebhooks(app, os.environ["SIMPLEHOOK_KEY"])

@app.post("/stripe/events")
async def stripe(request: Request):
    body = await request.json()
    return {"received": True}` },
];

function HeroCodeBlock() {
  const [activeSDK, setActiveSDK] = useState(0);
  const sdk = HERO_SDKS[activeSDK];

  return (
    <div className="max-w-[860px] overflow-hidden rounded-xl shadow-lg">
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">Terminal</span>
        <div className="w-[52px]" />
      </div>
      <div className="flex border-b border-white/[0.06] bg-[#2d2640]">
        {HERO_SDKS.map((s, i) => (
          <button
            key={s.id}
            onClick={() => setActiveSDK(i)}
            className={`px-4 py-2 font-mono text-[11px] transition-colors ${
              i === activeSDK
                ? "bg-[#1e1834] text-[#e0dce8]"
                : "text-[#7a7190] hover:text-[#9a91b0]"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#2d2640] px-4 py-1.5">
        <span className="font-mono text-[10px] text-[#7a7190]">{sdk.file}</span>
      </div>
      <pre className="min-h-[200px] overflow-x-auto bg-[#1e1834] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e0dce8]">
        <code>{sdk.code}</code>
      </pre>
    </div>
  );
}

const AGENT_CLI_CODE = `# Pull the next webhook event
npx @simplehook/cli pull

# Wait for a Stripe event (blocks until it arrives)
npx @simplehook/cli pull --wait --path "/stripe/*"

# Stream events as they arrive (SSE)
npx @simplehook/cli pull --stream

# Check queue status
npx @simplehook/cli status`;

const AGENT_SDK_CODE = `import { SimplehookAgent } from "@simplehook/core";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY);

// Pull the next webhook event
const { events } = await agent.pull();
console.log(events[0].path, events[0].body);

// Wait for a Stripe event (blocks until it arrives)
const stripe = await agent.pull({
  wait: true,
  path: "/stripe/*",
});

// Stream events as they arrive
await agent.stream((event) => {
  console.log("Event:", event.path, event.body);
});`;

type AgentTab = "cli" | "sdk";

function AgentHeroCodeBlock() {
  const [tab, setTab] = useState<AgentTab>("cli");

  return (
    <div className="max-w-[860px] overflow-hidden rounded-xl shadow-lg">
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">Terminal</span>
        <div className="w-[52px]" />
      </div>
      <div className="flex border-b border-white/[0.06] bg-[#2d2640]">
        <button
          onClick={() => setTab("cli")}
          className={`px-4 py-2 font-mono text-[11px] transition-colors ${
            tab === "cli"
              ? "bg-[#1e1834] text-[#e0dce8]"
              : "text-[#7a7190] hover:text-[#9a91b0]"
          }`}
        >
          CLI
        </button>
        <button
          onClick={() => setTab("sdk")}
          className={`px-4 py-2 font-mono text-[11px] transition-colors ${
            tab === "sdk"
              ? "bg-[#1e1834] text-[#e0dce8]"
              : "text-[#7a7190] hover:text-[#9a91b0]"
          }`}
        >
          SDK
        </button>
      </div>
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-1.5">
        <span className="font-mono text-[10px] text-[#7a7190]">{tab === "cli" ? "agent.sh" : "agent.ts"}</span>
      </div>
      {/* Both code blocks always in DOM for crawlers — inactive collapses visually but stays in DOM */}
      <div className={tab === "cli" ? "" : "h-0 overflow-hidden"} aria-hidden={tab !== "cli"}>
        <pre className="overflow-x-auto bg-[#1e1834] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e0dce8]">
          <code>{AGENT_CLI_CODE}</code>
        </pre>
      </div>
      <div className={tab === "sdk" ? "" : "h-0 overflow-hidden"} aria-hidden={tab !== "sdk"}>
        <pre className="overflow-x-auto bg-[#1e1834] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e0dce8]">
          <code>{AGENT_SDK_CODE}</code>
        </pre>
      </div>
    </div>
  );
}

// ── How it works steps ───────────────────────────────────────────────

const DEV_STEPS = [
  {
    num: "1",
    title: "Set your webhook URL",
    desc: "Point Stripe, GitHub, Twilio — any provider — to your simplehook URL. Set it once, never change it.",
    code: `# Your stable webhook URL\n\nhttps://hook.simplehook.dev/hooks/<your-project-id>/stripe/events`,
  },
  {
    num: "2",
    title: "Add one line of code",
    desc: "Import the SDK and call listenToWebhooks(). Works with Express, Fastify, Hono, Flask, and more.",
    code: `import { listenToWebhooks } from '@simplehook/express'\n\nlistenToWebhooks(app, process.env.SIMPLEHOOK_KEY)\n\n// That's it. Your routes work as normal.`,
  },
  {
    num: "3",
    title: "Run your app",
    desc: "Webhooks flow through a WebSocket to your local server. If you go offline, events queue and replay when you reconnect.",
    code: `$ npm run dev\n\n[simplehook] connected ✓\n[simplehook] POST /stripe/events → 200\n[simplehook] POST /github/push  → 200`,
  },
];

const AGENT_STEPS = [
  {
    num: "1",
    title: "Get your API key",
    desc: "Sign up, get your project's API key from the dashboard. Same key works for SDKs and the pull API.",
    code: `# Your API key (from dashboard)\n\nAuthorization: Bearer ak_w4MF...`,
  },
  {
    num: "2",
    title: "Pull events via CLI or SDK",
    desc: "Use the CLI or SDK to pull events. Get the next event instantly, or long-poll until one arrives.",
    code: `# CLI\nnpx @simplehook/cli pull --wait --path "/stripe/*"\n\n# SDK\nconst { events } = await agent.pull({ wait: true, path: "/stripe/*" })`,
  },
  {
    num: "3",
    title: "Process and repeat",
    desc: "The server tracks your cursor. Each pull returns only new events. Loop until you're done.",
    code: `# Your agent loop\nwhile true:\n  events = pull(wait=true, path="/stripe/*")\n  for event in events:\n    process(event)\n  # cursor auto-advances — next pull returns new events only`,
  },
];

const STEP_DURATION = 5000;

function SteppedWalkthrough({ steps }: { steps: typeof DEV_STEPS }) {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  const goTo = useCallback((idx: number) => {
    setActive(idx);
    setProgress(0);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setActive((a) => (a + 1) % steps.length);
          return 0;
        }
        return p + 100 / (STEP_DURATION / 50);
      });
    }, 50);
    return () => clearInterval(interval);
  }, [steps.length]);

  const step = steps[active];

  return (
    <div className="grid items-start gap-8 md:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-1">
        {steps.map((s, i) => (
          <button
            key={s.num}
            onClick={() => goTo(i)}
            className={`group relative flex items-start gap-3.5 rounded-lg px-4 py-3.5 text-left transition-colors ${
              i === active
                ? "bg-card border border-border-strong"
                : "hover:bg-card/50"
            }`}
          >
            <div
              className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-xs transition-colors ${
                i === active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s.num}
            </div>
            <div>
              <div className="text-[13px] font-medium">{s.title}</div>
              <div className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                {s.desc}
              </div>
            </div>
            {i === active && (
              <div className="absolute bottom-0 left-4 right-4 h-[2px] overflow-hidden rounded-full bg-border">
                <div
                  className="h-full bg-foreground/60 transition-none"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl shadow-lg transition-all">
        <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
            <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
            <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
          </div>
          <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">
            Step {step.num}
          </span>
          <div className="w-[52px]" />
        </div>
        <pre className="min-h-[200px] bg-[#1e1834] px-6 py-6 font-mono text-[14px] leading-[1.9] text-[#e0dce8]">
          <code>{step.code}</code>
        </pre>
      </div>
    </div>
  );
}

// ── Audience toggle pill ─────────────────────────────────────────────

type Audience = "developers" | "agents";

function AudienceToggle({ value, onChange }: { value: Audience; onChange: (v: Audience) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1 w-fit">
      <button
        onClick={() => onChange("developers")}
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
          value === "developers"
            ? "bg-card border border-border-strong shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        For developers
      </button>
      <button
        onClick={() => onChange("agents")}
        className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
          value === "agents"
            ? "bg-card border border-border-strong shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        For AI agents
      </button>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────

export function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const initialAudience: Audience = modeParam === "agents" ? "agents" : "developers";
  const [audience, setAudience] = useState<Audience>(initialAudience);

  const handleAudienceChange = useCallback((v: Audience) => {
    setAudience(v);
    setSearchParams(v === "developers" ? {} : { mode: v }, { replace: true });
  }, [setSearchParams]);

  return (
    <div>
      <Helmet>
        <title>simplehook — Webhooks that just work</title>
        <meta name="description" content="Stable webhook URLs for localhost. One line of code to receive Stripe, GitHub, Twilio webhooks locally. No ngrok, no CLI, no tunnels. SDKs for Express, Fastify, Flask, FastAPI." />
        <link rel="canonical" href="https://simplehook.dev/" />
        <meta property="og:title" content="simplehook — Webhooks that just work" />
        <meta property="og:description" content="Stable webhook URLs for localhost. One line of code to receive webhooks locally. No ngrok, no CLI, no tunnels." />
        <meta property="og:url" content="https://simplehook.dev/" />
      </Helmet>
      {/* ── HERO ── */}
      <section className="px-6 pb-20 pt-24">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Webhooks for everyone</Kicker>

          <div className="mb-6 flex flex-wrap items-center gap-4">
            <h1 className="max-w-[680px] text-[clamp(36px,5.5vw,60px)] font-normal leading-[1.08] tracking-[-0.015em]">
              Stable webhook URLs.{" "}
              <span className="text-muted-foreground">Zero infrastructure.</span>
            </h1>
            <AudienceToggle value={audience} onChange={handleAudienceChange} />
          </div>

          {/* Audience-specific subtitle (both in DOM) */}
          <div className={audience === "developers" ? "" : "invisible h-0 overflow-hidden"}>
            <p className="mb-10 max-w-[480px] text-lg font-light leading-relaxed text-muted-foreground">
              Stop using ngrok. Add one SDK call and your local app receives real
              webhooks over WebSocket.
            </p>
          </div>
          <div className={audience === "agents" ? "" : "invisible h-0 overflow-hidden"}>
            <p className="mb-10 max-w-[480px] text-lg font-light leading-relaxed text-muted-foreground">
              Pull webhook events via HTTP. Instant, long-poll, or SSE stream. Built
              for AI agents that operate in request/response cycles.
            </p>
          </div>

          <div className="mb-16 flex flex-wrap gap-2.5">
            <a
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              Get started
              <ArrowRight className="size-4" />
            </a>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-transparent px-6 py-3 text-[15px] text-muted-foreground transition-colors hover:border-text-tertiary hover:text-foreground"
            >
              How it works
            </a>
          </div>

          {/* Hero code blocks (both in DOM) */}
          <div className={audience === "developers" ? "" : "invisible h-0 overflow-hidden"}>
            <HeroCodeBlock />
            <p className="mt-3.5 font-mono text-[11px] text-text-tertiary">
              Works with Stripe, GitHub, Twilio, Shopify, and every webhook provider.
            </p>
          </div>
          <div className={audience === "agents" ? "" : "invisible h-0 overflow-hidden"}>
            <AgentHeroCodeBlock />
            <p className="mt-3.5 font-mono text-[11px] text-text-tertiary">
              Same webhook URL. Same events. Just a different access pattern.
            </p>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── HOW IT WORKS (audience-specific) ── */}
      <section id="how-it-works" className="px-6 py-20">
        <div className="mx-auto max-w-[960px]">
          {/* Developers */}
          <div className={audience === "developers" ? "" : "invisible h-0 overflow-hidden"}>
            <Kicker>How it works</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Three steps. Zero infrastructure.
            </h2>
            <p className="mb-10 max-w-[560px] text-[15px] text-muted-foreground">
              No tunnels, no public servers, no webhook infrastructure to manage.
              Just your code and a WebSocket.
            </p>
            <SteppedWalkthrough steps={DEV_STEPS} />
          </div>

          {/* Agents */}
          <div className={audience === "agents" ? "" : "invisible h-0 overflow-hidden"}>
            <Kicker>How it works</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Three steps. One HTTP call.
            </h2>
            <p className="mb-10 max-w-[560px] text-[15px] text-muted-foreground">
              No WebSocket, no SDK, no persistent connection. Just pull events
              when your agent is ready.
            </p>
            <SteppedWalkthrough steps={AGENT_STEPS} />
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── DEVELOPER-ONLY: Delivery modes + Why not ngrok ── */}
      <div className={audience === "developers" ? "" : "invisible h-0 overflow-hidden"}>
        {/* Two modes */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-[960px]">
            <Kicker>Delivery modes</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Queue mode or Passthrough mode
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Choose per-route. Mix and match based on what each provider needs.
            </p>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-border-strong">
                <div className="mb-3 flex items-center gap-2">
                  <Clock className="size-4 text-status-blue-text" />
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-status-blue-text">Queue mode</span>
                </div>
                <h3 className="mb-2 text-sm font-medium">Instant 200, guaranteed delivery</h3>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Returns 200 to the provider immediately. Events queue and forward to your app with automatic retries.
                </p>
                <div className="flex flex-col gap-2">
                  {["Instant 200 response to provider", "Automatic retry with backoff", "Events persist while app is offline", "Best for: Stripe, Shopify, most providers"].map((item) => (
                    <div key={item} className="flex items-baseline gap-2 text-[13px] text-muted-foreground">
                      <Check className="mt-0.5 size-3 shrink-0 text-status-green-text" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-border-strong">
                <div className="mb-3 flex items-center gap-2">
                  <Zap className="size-4 text-status-amber-text" />
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-status-amber-text">Passthrough mode</span>
                </div>
                <h3 className="mb-2 text-sm font-medium">Your real response, forwarded back</h3>
                <p className="mb-4 text-[13px] text-muted-foreground">
                  Proxies the webhook to your app and returns your actual response to the provider.
                </p>
                <div className="flex flex-col gap-2">
                  {["Real response forwarded to provider", "True end-to-end webhook flow", "No queue delay", "Best for: Twilio TwiML, GitHub, custom integrations"].map((item) => (
                    <div key={item} className="flex items-baseline gap-2 text-[13px] text-muted-foreground">
                      <Check className="mt-0.5 size-3 shrink-0 text-status-green-text" />
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Why not ngrok */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-[960px]">
            <Kicker>Comparison</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Why not ngrok or Hookdeck?
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Different tools for different problems. Here is where simplehook fits.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Feature</th>
                    <th className="border-l-2 border-status-green-dot/30 bg-status-green-bg/30 px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-status-green-text">simplehook</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">ngrok</th>
                    <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Hookdeck</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Setup", "1 line of code", "CLI + config", "Dashboard + SDK"],
                    ["Runs as", "SDK in your app", "Separate process", "Cloud platform"],
                    ["Offline events", "Queued + replayed", "Lost", "Queued"],
                    ["Response passthrough", "Yes (passthrough mode)", "Yes", "No"],
                    ["Event replay", "One click", "No", "Yes"],
                    ["AI Agent API", "Yes (pull/stream)", "No", "No"],
                    ["Price", "$5/mo flat", "Free tier / $8+/mo", "Free tier / $25+/mo"],
                  ].map(([feature, aw, ngrok, hookdeck]) => (
                    <tr key={feature} className="border-b last:border-0">
                      <td className="px-3 py-2.5 font-medium text-foreground">{feature}</td>
                      <td className="border-l-2 border-status-green-dot/30 bg-status-green-bg/30 px-3 py-2.5 font-medium text-status-green-text">{aw}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{ngrok}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{hookdeck}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Developer features */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-[960px]">
            <Kicker>Features</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Everything you need. Nothing you don't.
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Minimal surface area. Maximum usefulness.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { icon: Zap, title: "WebSocket delivery", desc: "Events flow over a persistent WebSocket. No polling, no public endpoints." },
                { icon: RotateCcw, title: "Automatic retries", desc: "Failed deliveries retry with exponential backoff. Events never get lost." },
                { icon: Terminal, title: "Event replay", desc: "Replay any event from the dashboard. Debug webhooks without retriggering." },
                { icon: Shield, title: "Per-route configuration", desc: "Set queue or passthrough mode per path prefix. Different providers, different rules." },
                { icon: Radio, title: "Listeners", desc: "Run multiple SDKs and route events to specific ones. Same webhook URL, different destinations." },
                { icon: Clock, title: "AI Agent API", desc: "Pull webhooks via HTTP too — instant, long-poll, or SSE stream. Same project, same events." },
              ].map((f) => (
                <div key={f.title} className="rounded-lg border border-border bg-card px-5 py-5 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                  <f.icon className="mb-2.5 size-5 text-muted-foreground" />
                  <h3 className="mb-1.5 text-sm font-medium">{f.title}</h3>
                  <p className="text-[13px] text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* ── AGENT-ONLY: Pull modes + features ── */}
      <div className={audience === "agents" ? "" : "invisible h-0 overflow-hidden"}>
        {/* Three pull modes */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-[960px]">
            <Kicker>Pull modes</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Instant, long-poll, or stream
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              One endpoint, three behaviors. Choose how patient your agent is.
            </p>
            <div className="grid gap-5 md:grid-cols-3">
              {[
                {
                  mode: "Instant",
                  color: "text-status-green-text",
                  desc: "Return immediately with whatever events are available. Empty array if nothing new.",
                  code: "GET /api/agent/pull",
                },
                {
                  mode: "Long-poll",
                  color: "text-status-blue-text",
                  desc: "Hold the connection until an event arrives or timeout expires. Synchronous from the agent's perspective.",
                  code: "GET /api/agent/pull?wait=true",
                },
                {
                  mode: "SSE stream",
                  color: "text-status-amber-text",
                  desc: "Keep the connection open. Events push as they arrive. For agents that can hold a connection.",
                  code: "GET /api/agent/pull?stream=true",
                },
              ].map((m) => (
                <div key={m.mode} className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-border-strong">
                  <span className={`font-mono text-[10px] font-medium uppercase tracking-[0.08em] ${m.color}`}>{m.mode}</span>
                  <p className="mt-2 mb-3 text-[13px] text-muted-foreground">{m.desc}</p>
                  <code className="block rounded bg-muted px-2 py-1 font-mono text-[11px] text-foreground/80">{m.code}</code>
                </div>
              ))}
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* Agent features */}
        <section className="px-6 py-20">
          <div className="mx-auto max-w-[960px]">
            <Kicker>Features</Kicker>
            <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
              Built for agents. No WebSocket required.
            </h2>
            <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
              Everything an AI agent needs to consume webhooks reliably.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              {[
                { icon: Radio, title: "Per-agent cursors", desc: "Each listener_id tracks its own position. Multiple agents consume the same project independently." },
                { icon: Shield, title: "Path filtering", desc: "Pull only /stripe/* events, or /github/* — filter with glob patterns." },
                { icon: Terminal, title: "Queue status", desc: "GET /api/agent/status — pending counts, cursor positions, connected listeners, per-route breakdown." },
                { icon: Lock, title: "Same auth, same data", desc: "Uses your existing API key. Same events, same routes — just a different access pattern." },
                { icon: Clock, title: "Conflict detection", desc: "One consumer per listener_id for long-poll/stream. Prevents duplicate processing. 409 if already consumed." },
                { icon: Zap, title: "SDK + API together", desc: "Developers use the SDK, agents use the pull API. Same project, same webhook URL, different access patterns." },
                { icon: Terminal, title: "Claude Code Skill", desc: "Install our skill for Claude Code — teaches your AI agent the full pull API. github.com/bnbarak/simplewehbook-skills" },
              ].map((f) => (
                <div key={f.title} className="rounded-lg border border-border bg-card px-5 py-5 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                  <f.icon className="mb-2.5 size-5 text-muted-foreground" />
                  <h3 className="mb-1.5 text-sm font-medium">{f.title}</h3>
                  <p className="text-[13px] text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <SectionDivider />

      {/* ── SHARED: Privacy ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Privacy</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Your webhook data stays yours
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Security built in, not bolted on.
          </p>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-border bg-card px-5 py-5 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <Lock className="mb-2.5 size-5 text-muted-foreground" />
              <h3 className="mb-1.5 text-sm font-medium">Signed delivery</h3>
              <p className="text-[13px] text-muted-foreground">Every event is signed with HMAC-SHA256 before delivery. The SDK verifies automatically. Provider signatures (Stripe, GitHub) are also preserved end-to-end.</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-5 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <Shield className="mb-2.5 size-5 text-muted-foreground" />
              <h3 className="mb-1.5 text-sm font-medium">Passthrough = zero storage</h3>
              <p className="text-[13px] text-muted-foreground">In passthrough mode, the request body flows through memory only and is never persisted.</p>
            </div>
            <div className="rounded-lg border border-border bg-card px-5 py-5 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <Shield className="mb-2.5 size-5 text-muted-foreground" />
              <h3 className="mb-1.5 text-sm font-medium">Queue = encrypted & auto-deleted</h3>
              <p className="text-[13px] text-muted-foreground">Queued bodies are encrypted at rest and deleted after successful delivery. Events auto-expire after 30 days.</p>
            </div>
          </div>
          <p className="mt-6 text-center text-[13px] text-text-tertiary">
            No third-party analytics. No tracking. We never sell or share your data.{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">Full privacy details</a>
          </p>

          <a
            href="https://www.standardwebhooks.com/"
            className="mt-5 mb-[-8px] mx-auto flex items-center gap-2 w-fit opacity-50 hover:opacity-80 transition-opacity"
          >
            <img
              src="https://www.standardwebhooks.com/_next/static/media/logo-icon-text-bw.963dab3a.svg"
              alt="Standard Webhooks"
              className="h-6"
            />
          </a>
        </div>
      </section>

      <SectionDivider />

      {/* ── SHARED: Pricing ── */}
      <section id="pricing" className="px-6 py-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Pricing</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">One plan. No surprises.</h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">24-hour free trial. No credit card required.</p>
          <div className="flex justify-center gap-4">
            {[
              { name: "Starter", price: "$5", desc: "For solo developers", features: ["3 routes", "3 listeners", "Unlimited webhook events", "Queue + Passthrough modes", "Automatic retries", "AI Agent Pull API"] },
              { name: "Pro", price: "$8", desc: "For teams", features: ["6 routes", "6 listeners", "Everything in Starter", "Priority delivery", "Full request/response logging", "Per-route listener assignment"] },
            ].map((plan) => (
              <div key={plan.name} className="w-full max-w-[320px] rounded-xl border border-border bg-card px-6 py-7">
                <div className="mb-0.5 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">{plan.name}</div>
                <div className="mb-1 text-[36px] font-medium leading-none tracking-[-0.02em]">
                  {plan.price}<span className="text-[14px] font-normal text-muted-foreground">/mo</span>
                </div>
                <p className="mb-5 text-sm text-muted-foreground">{plan.desc}</p>
                <ul className="flex flex-col gap-1.5">
                  {plan.features.map((item) => (
                    <li key={item} className="flex items-baseline gap-2 text-sm text-muted-foreground">
                      <span className="shrink-0 text-[12px] font-semibold text-status-green-text">&#10003;</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 text-center">
            <p className="mb-4 text-[13px] text-text-tertiary">24-hour free trial with 3 routes &amp; 3 listeners. No credit card required.</p>
            <a href="/login" className="inline-flex items-center justify-center rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-85">
              Start free trial
            </a>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── SHARED: Bottom CTA ── */}
      <section className="px-6 py-20 text-center">
        <div className="mx-auto max-w-[960px]">
          <h2 className="mb-5 text-[22px] font-medium tracking-[-0.015em]">
            Start receiving webhooks in 30 seconds
          </h2>
          <p className="mx-auto mb-6 max-w-[480px] text-[15px] text-muted-foreground">
            One install. One line of code. Every webhook provider works.
          </p>
          <a
            href="/login"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-8 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-85"
          >
            Get started
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>
    </div>
  );
}
