import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Zap,
  RotateCcw,
  Shield,
  Clock,
  Terminal,
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

const STEPS = [
  {
    num: "1",
    title: "Set your webhook URL",
    desc: "Point Stripe, GitHub, Twilio — any provider — to your simplehook URL. Set it once, never change it.",
    code: `# Your stable webhook URL\n\nhttps://hook.simplehook.dev\n  /hooks/<your-project-id>\n  /stripe/events`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-5">
        <path d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-4.828a4.5 4.5 0 0 0-1.242-7.244l4.5-4.5a4.5 4.5 0 1 0 6.364 6.364l-1.757 1.757" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    num: "2",
    title: "Add one line of code",
    desc: "Import the SDK and call listen(). Works with Express, Fastify, Hono, Flask, and more.",
    code: `import { listen } from 'simplehook'\n\nlisten(app, process.env.SIMPLEHOOK_KEY)\n\n// That's it. Your routes work as normal.`,
    icon: (
      <svg viewBox="0 0 256 292" className="size-5" fill="currentColor">
        <path d="M116.504 3.58c6.962-3.985 16.03-4.003 22.986 0 34.995 19.774 70.001 39.517 104.99 59.303 6.581 3.707 10.983 11.031 10.916 18.614v118.968c.049 7.897-4.788 15.396-11.731 19.019-34.88 19.665-69.742 39.354-104.616 59.019-7.106 4.063-16.356 3.75-23.24-.646-10.457-6.062-20.932-12.094-31.39-18.15-2.137-1.274-4.546-2.288-6.055-4.36 1.334-1.798 3.719-2.022 5.657-2.807 4.428-1.621 8.532-3.908 12.6-6.234.643-.32 1.46-.163 2.07.235 8.964 5.282 17.946 10.537 26.908 15.822 1.378.703 2.622-.358 3.783-1.054 34.007-19.166 68.03-38.3 102.038-57.469 1.097-.587 1.567-1.874 1.48-3.086V82.305c.133-1.338-.517-2.686-1.727-3.347-34.87-19.698-69.726-39.425-104.6-59.115-.781-.442-1.804-.443-2.59.009-34.875 19.69-69.739 39.398-104.617 59.106-1.218.65-1.876 2.014-1.735 3.347v119.417c.086 1.18.556 2.432 1.612 3.042 9.498 5.408 19.014 10.784 28.52 16.18.606.279 1.298.551 1.98.467 4.407-.572 9.157-.849 13.053-3.2 2.572-1.464 3.774-4.455 3.664-7.37V82.652c-.06-1.27 1.042-2.36 2.296-2.298h10.015c1.217-.048 2.293.975 2.253 2.195v120.58c0 7.693-3.643 16.11-10.727 19.872-8.23 4.527-18.222 4.578-27.199 2.885-7.988-1.43-15.725-4.89-22.176-9.57-1.061-.722-2.064-1.537-3.166-2.178-5.702-3.347-10.04-9.31-10.09-16.043V81.49c-.052-7.604 4.352-14.946 10.963-18.643C46.503 43.089 81.49 23.394 116.504 3.58z" />
      </svg>
    ),
  },
  {
    num: "3",
    title: "Run your app",
    desc: "Webhooks flow through a WebSocket to your local server. If you go offline, events queue and replay when you reconnect.",
    code: `$ npm run dev\n\n[simplehook] connected ✓\n[simplehook] POST /stripe/events → 200\n[simplehook] POST /github/push  → 200`,
    icon: <Terminal className="size-5" />,
  },
];

const STEP_DURATION = 5000;

function HowItWorksSteps() {
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
          setActive((a) => (a + 1) % STEPS.length);
          return 0;
        }
        return p + 100 / (STEP_DURATION / 50);
      });
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const step = STEPS[active];

  return (
    <div className="grid items-start gap-8 md:grid-cols-[280px_1fr]">
      {/* Step tabs (left) */}
      <div className="flex flex-col gap-1">
        {STEPS.map((s, i) => (
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
            {/* Progress bar */}
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

      {/* Code panel (right) */}
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

export function HomePage() {
  return (
    <div>
      {/* ── HERO ── */}
      <section className="px-6 pb-20 pt-24">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Developer tools</Kicker>

          <h1 className="mb-6 max-w-[680px] text-[clamp(36px,5.5vw,60px)] font-normal leading-[1.08] tracking-[-0.015em]">
            One line of code.{" "}
            <span className="text-muted-foreground">Webhooks just work.</span>
          </h1>

          <p className="mb-10 max-w-[480px] text-lg font-light leading-relaxed text-muted-foreground">
            Stop tunneling. Stop polling. Stop building webhook infrastructure.
            Add one SDK call and your local app receives real webhooks.
          </p>

          <div className="mb-16 flex flex-wrap gap-2.5">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-transparent px-6 py-3 text-[15px] text-muted-foreground transition-colors hover:border-text-tertiary hover:text-foreground"
            >
              How it works
            </a>
          </div>

          {/* Code split panes — terminal theme */}
          <div className="max-w-[860px] overflow-hidden rounded-xl shadow-lg">
            {/* Terminal title bar */}
            <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
                <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
                <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
              </div>
              <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">Terminal</span>
              <div className="w-[52px]" />
            </div>
            {/* Split panes */}
            <div className="grid md:grid-cols-2">
              <div className="flex flex-col">
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#2d2640] px-4 py-2.5">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#9a91b0]">
                    Your app
                  </span>
                  <span className="font-mono text-[11px] text-[#7a7190]">app.ts</span>
                </div>
                <pre className="flex-1 overflow-x-auto bg-[#1e1834] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e0dce8]">
                  <code>
                    <span className="text-[#c678dd]">import</span>
                    {" { webhooks } "}
                    <span className="text-[#c678dd]">from</span>
                    {" "}
                    <span className="text-[#98c379]">'simplehook'</span>
                    {"\n\n"}
                    <span className="text-[#61afef]">webhooks</span>
                    <span className="text-[#7a7190]">.</span>
                    <span className="text-[#e5c07b]">listen</span>
                    {"("}
                    <span className="text-[#d19a66]">3000</span>
                    {")"}
                    {"\n\n"}
                    <span className="text-[#7a7190] italic">{"// That's it. Webhooks flow to localhost:3000"}</span>
                  </code>
                </pre>
              </div>
              <div className="flex flex-col border-t border-white/[0.06] md:border-l md:border-t-0">
                <div className="flex items-center justify-between border-b border-white/[0.06] bg-[#2d2640] px-4 py-2.5">
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#9a91b0]">
                    Webhook URL
                  </span>
                  <span className="font-mono text-[11px] text-[#7a7190]">Stripe Dashboard</span>
                </div>
                <pre className="flex-1 overflow-x-auto bg-[#1e1834] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e0dce8]">
                  <code>
                    <span className="text-[#7a7190] italic">{"// Set your webhook URL to:"}</span>
                    {"\n\n"}
                    <span className="text-[#98c379]">https://hook.simplehook.dev</span>
                    {"\n  "}
                    <span className="text-[#61afef]">/</span>
                    <span className="text-[#c678dd]">{"<your-project-id>"}</span>
                    {"\n  "}
                    <span className="text-[#61afef]">/stripe/events</span>
                    {"\n\n"}
                    <span className="text-[#7a7190] italic">{"// Events forward to your localhost"}</span>
                  </code>
                </pre>
              </div>
            </div>
          </div>

          <p className="mt-3.5 font-mono text-[11px] text-text-tertiary">
            Works with Stripe, GitHub, Twilio, Shopify, and every webhook provider.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="px-6 py-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>How it works</Kicker>

          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Three steps. Zero infrastructure.
          </h2>
          <p className="mb-10 max-w-[560px] text-[15px] text-muted-foreground">
            No tunnels, no public servers, no webhook infrastructure to manage.
            Just your code and a WebSocket.
          </p>

          <HowItWorksSteps />
        </div>
      </section>

      <SectionDivider />

      {/* ── TWO MODES ── */}
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
            {/* Queue mode */}
            <div className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-border-strong">
              <div className="mb-3 flex items-center gap-2">
                <Clock className="size-4 text-status-blue-text" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-status-blue-text">
                  Queue mode
                </span>
              </div>
              <h3 className="mb-2 text-sm font-medium">Instant 200, guaranteed delivery</h3>
              <p className="mb-4 text-[13px] text-muted-foreground">
                Returns 200 to the provider immediately. Events queue and forward
                to your app with automatic retries. Your app can be offline -- events
                wait.
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

            {/* Passthrough mode */}
            <div className="rounded-lg border border-border bg-card p-6 transition-colors hover:border-border-strong">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="size-4 text-status-amber-text" />
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-status-amber-text">
                  Passthrough mode
                </span>
              </div>
              <h3 className="mb-2 text-sm font-medium">Your real response, forwarded back</h3>
              <p className="mb-4 text-[13px] text-muted-foreground">
                Proxies the webhook to your app and returns your actual response
                to the provider. Real end-to-end, like a tunnel but without the tunnel.
              </p>
              <div className="flex flex-col gap-2">
                {["Real response forwarded to provider", "True end-to-end webhook flow", "No queue delay", "Best for: GitHub webhooks, custom integrations"].map((item) => (
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

      {/* ── WHY NOT ── */}
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
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Feature
                  </th>
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    simplehook
                  </th>
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    ngrok
                  </th>
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Hookdeck
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Setup", "1 line of code", "CLI + config", "Dashboard + SDK"],
                  ["Runs as", "SDK in your app", "Separate process", "Cloud platform"],
                  ["Offline events", "Queued + replayed", "Lost", "Queued"],
                  ["Response passthrough", "Yes (passthrough mode)", "Yes", "No"],
                  ["Event replay", "One click", "No", "Yes"],
                  ["Public URL needed", "No", "Yes (tunnel)", "No"],
                  ["Auth", "API key", "Account + auth token", "Account + API key"],
                  ["Price", "$5/mo flat", "Free tier / $8+/mo", "Free tier / $25+/mo"],
                ].map(([feature, aw, ngrok, hookdeck]) => (
                  <tr key={feature} className="border-b last:border-0">
                    <td className="px-3 py-2.5 font-medium text-foreground">{feature}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{aw}</td>
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

      {/* ── FEATURES ── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Built for developers</Kicker>

          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Everything you need. Nothing you don't.
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Minimal surface area. Maximum usefulness.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            {[
              {
                icon: Zap,
                title: "WebSocket delivery",
                desc: "Events flow over a persistent WebSocket. No polling, no public endpoints.",
              },
              {
                icon: RotateCcw,
                title: "Automatic retries",
                desc: "Failed deliveries retry with exponential backoff. Events never get lost.",
              },
              {
                icon: Terminal,
                title: "Event replay",
                desc: "Replay any event from the dashboard. Debug webhooks without retriggering.",
              },
              {
                icon: Shield,
                title: "Per-route configuration",
                desc: "Set queue or passthrough mode per path prefix. Different providers, different rules.",
              },
            ].map((feature) => (
              <div
                key={feature.title}
                className="rounded-lg border border-border bg-card px-5 py-5 transition-all hover:border-border-strong hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)]"
              >
                <feature.icon className="mb-2.5 size-5 text-muted-foreground" />
                <h3 className="mb-1.5 text-sm font-medium">{feature.title}</h3>
                <p className="text-[13px] text-muted-foreground">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── PRICING ── */}
      <section id="pricing" className="px-6 py-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Pricing</Kicker>

          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            One plan. No surprises.
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            24-hour free trial. No credit card required. $5/mo after trial.
          </p>

          <div className="flex justify-center">
            <div className="w-full max-w-[440px] rounded-xl border border-border bg-card px-8 py-9">
              <div className="mb-1 text-[42px] font-medium leading-none tracking-[-0.02em]">
                $5
                <span className="text-[15px] font-normal text-muted-foreground">
                  /mo
                </span>
              </div>
              <p className="mb-6 text-sm text-muted-foreground">
                Per project. Everything included.
              </p>

              <ul className="flex flex-col gap-2">
                {[
                  "Unlimited webhook events",
                  "Queue + Passthrough modes",
                  "Automatic retries with backoff",
                  "Event replay from dashboard",
                  "WebSocket real-time delivery",
                  "Per-route configuration",
                  "Full request/response logging",
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-baseline gap-2 text-sm text-muted-foreground"
                  >
                    <span className="shrink-0 text-[13px] font-semibold text-status-green-text">
                      &#10003;
                    </span>
                    {item}
                  </li>
                ))}
              </ul>

              <div className="mt-6 border-t border-border pt-5">
                <p className="text-[13px] text-text-tertiary">
                  24-hour free trial. No credit card required.
                </p>
              </div>

              <Link
                to="/login"
                className="mt-6 flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-85"
              >
                Start free trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* ── BOTTOM CTA ── */}
      <section className="px-6 py-20 text-center">
        <div className="mx-auto max-w-[960px]">
          <h2 className="mb-5 text-[22px] font-medium tracking-[-0.015em]">
            Start receiving webhooks in 30 seconds
          </h2>
          <p className="mx-auto mb-6 max-w-[480px] text-[15px] text-muted-foreground">
            One install. One line of code. Every webhook provider works.
          </p>

          <div className="mx-auto mb-6 inline-block overflow-hidden rounded-xl text-left shadow-lg">
            <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f56]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#27c93f]" />
              </div>
              <span className="mx-auto font-mono text-[11px] text-[#9a91b0]">Terminal</span>
              <div className="w-[44px]" />
            </div>
            <pre className="bg-[#1e1834] px-5 py-4 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code><span className="text-[#27c93f]">$</span> npm install simplehook</code>
            </pre>
          </div>

          <div className="flex flex-wrap justify-center gap-2.5">
            <Link
              to="/login"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-[15px] font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              Get started
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to="/docs"
              className="inline-flex items-center rounded-lg border border-border-strong px-6 py-3 text-[15px] text-muted-foreground transition-colors hover:border-text-tertiary hover:text-foreground"
            >
              Read the docs
            </Link>
          </div>

          <p className="mt-6 font-mono text-xs text-text-tertiary">
            npm install simplehook &middot; one line &middot; done
          </p>
        </div>
      </section>
    </div>
  );
}
