import { FlowNode, FlowArrow, FlowRow } from "@/components/shared/FlowDiagram.js";
import { BlogPostShell } from "@/components/blog/BlogPostShell.js";

export function BlogPostWebhooksThatNeverChange() {
  return (
    <BlogPostShell
      slug="webhooks-that-never-change"
      metaDescription="We need to kill webhooks in the way we think about them. One permanent URL. One line of code. Events that survive going offline."
    >
      <div className="prose-simplehook space-y-5 text-[16px] leading-[1.75] text-muted-foreground">
            <p>
              We need to kill webhooks in the way we think about them. Not the protocol. The mental model.
              The one where every integration starts with you opening Stripe or GitHub or Twilio, pasting a
              URL into a settings field, and then doing it again every time something changes. Restart your
              machine. Switch to a coffee shop. Hand the project to a teammate. Back into that settings field,
              updating the URL.
            </p>
            <p>
              It's a small thing. But small things that happen every day are just big things you've
              stopped noticing.
            </p>
            {/* Value cards */}
            <div className="my-8 grid grid-cols-1 md:grid-cols-3 rounded-xl border border-border bg-card/30">
              <div className="px-5 py-5 md:border-r md:border-border">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-border bg-background font-mono text-[10px] text-muted-foreground">01</span>
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">Permanent URL</span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Set your webhook URL once in Stripe, GitHub, or any provider.
                  It stays the same across restarts, machines, and teammates.
                </p>
              </div>
              <div className="border-t border-border px-5 py-5 md:border-t-0 md:border-r md:border-border">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-border bg-background font-mono text-[10px] text-muted-foreground">02</span>
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">Offline resilient</span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Close your laptop, events queue. Open it tomorrow, they replay
                  automatically. Nothing is lost.
                </p>
              </div>
              <div className="border-t border-border px-5 py-5 md:border-t-0">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-md border border-border bg-background font-mono text-[10px] text-muted-foreground">03</span>
                  <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">Signed delivery</span>
                </div>
                <p className="text-[13px] leading-relaxed text-muted-foreground">
                  Every event signed with HMAC-SHA256. Provider signatures preserved end-to-end.
                  Follows the <a href="https://www.standardwebhooks.com/" className="underline underline-offset-2 hover:text-foreground transition-colors">Standard Webhooks</a> spec.
                </p>
              </div>
            </div>

            {/* How it works diagram */}
            <div className="my-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground/60">How it works</h3>
              <div className="font-mono text-[11px]">
                <FlowRow>
                  <FlowNode>Stripe / GitHub</FlowNode>
                  <FlowArrow label="POST" />
                  <FlowNode highlight>simplehook</FlowNode>
                  <FlowArrow label="WS" />
                  <FlowNode>Your app</FlowNode>
                </FlowRow>
                <FlowRow className="mt-1">
                  <span className="shrink-0 px-2.5 text-[9px] text-muted-foreground/60" style={{ width: "calc(var(--node-w, 100px))" }}>webhook provider</span>
                  <span className="flex-1" />
                  <span className="shrink-0 px-2.5 text-center text-[9px] text-muted-foreground/60">cloud relay</span>
                  <span className="flex-1" />
                  <span className="shrink-0 px-2.5 text-right text-[9px] text-muted-foreground/60">localhost</span>
                </FlowRow>
              </div>
            </div>

            <p>
              I built simplehook because I got tired of managing webhook URLs. The idea is simple:
              you get a URL that never changes. Set it once in Stripe, once in GitHub, and never
              think about it again. Your local dev server receives events through one line of code:
            </p>

            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`import { listenToWebhooks } from "@simplehook/express";
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);`}</code>
            </pre>

            <div className="my-8 overflow-hidden rounded-xl border border-border shadow-lg">
              <img
                src="/productExamples/dashboard.png"
                alt="simplehook dashboard showing the permanent webhook URL and API key with language picker"
                className="w-full"
                loading="lazy"
              />
              <p className="bg-card/50 px-4 py-2.5 text-center font-mono text-[11px] text-muted-foreground">
                Your permanent webhook URL and API key. Set once, use forever.
              </p>
            </div>

            <p>
              Your routes work exactly like they do in production.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">app.post("/stripe/events", ...)</code>{" "}
              fires the same way whether the request came from the internet or through simplehook.
              There's no tunnel binary, no background process, no port to expose. The SDK connects
              outbound, so it works behind NATs, firewalls, hotel Wi-Fi. Wherever you write code.
            </p>
            <p>
              The part that changed how I work: when your app is offline, events queue. Open your
              laptop in the morning, start your server, and yesterday's test webhooks are already
              waiting. No "can you resend that?" No clicking "Send test webhook" in the Stripe
              dashboard for the fifth time. They just show up.
            </p>
            <div className="my-8 overflow-hidden rounded-xl border border-border shadow-lg">
              <img
                src="/productExamples/visualizer.gif"
                alt="simplehook visualizer — live webhook events arriving in terminal"
                className="w-full"
                loading="lazy"
              />
              <p className="bg-card/50 px-4 py-2.5 text-center font-mono text-[11px] text-muted-foreground">
                Live webhook events from Stripe, GitHub, Twilio arriving via simplehook
              </p>
            </div>

            <p>
              Your whole team shares the same URL. No more "which ngrok instance is the live one"
              in Slack. No more <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">.env</code> files
              with URLs that expired two hours ago. One URL per project, every teammate pulls from
              it, nobody steps on each other.
            </p>
            <p>
              Testing gets simpler too. Point your webhook provider at your simplehook URL once
              during setup. From then on, every test environment, every branch, every developer on
              your team can receive real webhook payloads without any configuration. The URL is the
              constant. Everything else can change.
            </p>
            <p>
              There are SDKs for Express, Fastify, Hono, Flask, and FastAPI. Same pattern everywhere:
              one import, one function call, your existing routes handle the rest. AI agents can also
              pull events from the same URL via CLI if that's your thing, but honestly, the core value
              is just this: a webhook URL you set once and forget.
            </p>
          </div>

      <div className="mt-12 flex items-center gap-4">
        <a
          href="/docs"
          className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
        >
          Read the docs
        </a>
        <a
          href="/"
          className="text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          Back to homepage
        </a>
      </div>
    </BlogPostShell>
  );
}
