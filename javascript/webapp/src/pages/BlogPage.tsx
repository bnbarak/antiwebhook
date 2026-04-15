import { Helmet } from "react-helmet-async";

export function BlogPage() {
  return (
    <div>
      <Helmet>
        <title>Webhooks That Never Change — simplehook</title>
        <meta name="description" content="simplehook gives you a webhook URL that never changes. Set it once in Stripe, GitHub, or any provider. Webhooks arrive on your local machine via SDK." />
        <link rel="canonical" href="https://simplehook.dev/blog" />
        <meta property="og:title" content="Webhooks That Never Change — simplehook" />
        <meta property="og:description" content="Set your webhook URL once. It stays the same across restarts, machines, and teammates." />
        <meta property="og:url" content="https://simplehook.dev/blog" />
      </Helmet>

      <article className="px-6 py-20">
        <div className="mx-auto max-w-[640px]">
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
            <span className="inline-block h-px w-5 bg-border-strong mr-2.5 align-middle" />
            Blog
          </p>
          <h1 className="mb-6 text-[clamp(32px,5vw,44px)] font-normal leading-[1.1] tracking-[-0.02em]">
            Webhooks That Never Change
          </h1>

          <div className="prose-simplehook space-y-5 text-[16px] leading-[1.75] text-muted-foreground">
            <p>
              Every webhook integration starts the same way. You go to Stripe or GitHub or Twilio,
              paste a URL into a settings field, and start building. Then you restart your machine.
              Or switch to a coffee shop. Or your teammate needs to test the same flow. And suddenly
              you're back in that settings field, updating the URL again.
            </p>
            <p>
              It's a small thing. But small things that happen every day are just big things you've
              stopped noticing.
            </p>
            <p>
              I built simplehook because I got tired of managing webhook URLs. The idea is simple:
              you get a URL that never changes. Set it once in Stripe, once in GitHub, and never
              think about it again. Your local dev server receives events through one line of code:
            </p>

            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`import { listenToWebhooks } from "@simplehook/express";
listenToWebhooks(app, process.env.SIMPLEHOOK_KEY);`}</code>
            </pre>

            <p>
              Your routes work exactly like they do in production.{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">app.post("/stripe/events", ...)</code>{" "}
              fires the same way whether the request came from the internet or through simplehook.
              There's no tunnel binary, no background process, no port to expose. The SDK connects
              outbound, so it works behind NATs, firewalls, hotel Wi-Fi — wherever you write code.
            </p>
            <p>
              The part that changed how I work: when your app is offline, events queue. Open your
              laptop in the morning, start your server, and yesterday's test webhooks are already
              waiting. No "can you resend that?" No clicking "Send test webhook" in the Stripe
              dashboard for the fifth time. They just show up.
            </p>
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
              There are SDKs for Express, Fastify, Hono, Flask, and FastAPI. Same pattern everywhere —
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
        </div>
      </article>
    </div>
  );
}
