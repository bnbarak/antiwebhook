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

          {/* Code split panes */}
          <div className="grid max-w-[860px] overflow-hidden rounded-xl border border-border-strong bg-background md:grid-cols-2">
            {/* Left pane: your code */}
            <div>
              <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  Your app
                </span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  app.ts
                </span>
              </div>
              <pre className="overflow-x-auto bg-[#1a1916] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e8e5dd]">
                <code>
                  <span className="text-[#8c1a4a]">import</span>
                  {" { webhooks } "}
                  <span className="text-[#8c1a4a]">from</span>
                  {" "}
                  <span className="text-[#92600a]">'antiwebhooks'</span>
                  {"\n\n"}
                  <span className="text-[#1d6a4a]">webhooks</span>
                  <span className="text-[#9e9b93]">.</span>
                  <span className="text-[#1a4b8c]">listen</span>
                  {"("}
                  <span className="text-[#92600a]">3000</span>
                  {")"}
                  {"\n\n"}
                  <span className="text-[#9e9b93] italic">{"// That's it. Webhooks flow to localhost:3000"}</span>
                </code>
              </pre>
            </div>

            {/* Right pane: what happens */}
            <div className="border-t border-border-strong md:border-l md:border-t-0">
              <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
                <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                  Webhook URL
                </span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  Stripe Dashboard
                </span>
              </div>
              <pre className="overflow-x-auto bg-[#1a1916] px-5 py-5 font-mono text-[12.5px] leading-[1.8] text-[#e8e5dd]">
                <code>
                  <span className="text-[#9e9b93] italic">{"// Set your webhook URL to:"}</span>
                  {"\n\n"}
                  <span className="text-[#1d6a4a]">https://hook.antiwebhooks.com</span>
                  {"\n  "}
                  <span className="text-[#1a4b8c]">/</span>
                  <span className="text-[#4a1a8c]">{"<your-project-id>"}</span>
                  {"\n  "}
                  <span className="text-[#1a4b8c]">/stripe/events</span>
                  {"\n\n"}
                  <span className="text-[#9e9b93] italic">{"// Events forward to your localhost"}</span>
                </code>
              </pre>
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
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            No tunnels, no public servers, no webhook infrastructure to manage.
            Just your code and a WebSocket.
          </p>

          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                num: "1",
                title: "Set your webhook URLs",
                desc: "Point Stripe, GitHub, etc. to your antiwebhooks URL. Do this once.",
                code: "https://hook.antiwebhooks.com\n  /<project-id>/stripe",
              },
              {
                num: "2",
                title: "Add one line of code",
                desc: "Import the SDK and call listen(). That's the entire integration.",
                code: "import { webhooks } from 'antiwebhooks'\nwebhooks.listen(3000)",
              },
              {
                num: "3",
                title: "Run your app",
                desc: "Webhooks flow through a WebSocket to your local server. Instantly.",
                code: "$ npm run dev\n\n[antiwebhooks] connected\n[antiwebhooks] POST /stripe/events -> 200",
              },
            ].map((step) => (
              <div
                key={step.num}
                className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-border-strong"
              >
                <div className="mb-3 flex size-6 items-center justify-center rounded-full bg-foreground font-mono text-xs text-background">
                  {step.num}
                </div>
                <h3 className="mb-2 text-sm font-medium">{step.title}</h3>
                <p className="mb-3 text-[13px] text-muted-foreground">
                  {step.desc}
                </p>
                <pre className="overflow-x-auto rounded-md bg-[#1a1916] px-3 py-2.5 font-mono text-[12px] leading-[1.7] text-[#d4d0c8]">
                  <code>{step.code}</code>
                </pre>
              </div>
            ))}
          </div>
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
            Different tools for different problems. Here is where antiwebhooks fits.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    Feature
                  </th>
                  <th className="px-3 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                    antiwebhooks
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
            No per-event pricing. No usage tiers. Just webhooks that work.
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
                  14-day free trial. Cancel anytime.
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

          <div className="mx-auto mb-6 inline-block text-left">
            <pre className="rounded-lg bg-[#1a1916] px-5 py-4 font-mono text-[12.5px] leading-[1.8] text-[#d4d0c8]">
              <code>npm install antiwebhooks</code>
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
            npm install antiwebhooks &middot; one line &middot; done
          </p>
        </div>
      </section>
    </div>
  );
}
