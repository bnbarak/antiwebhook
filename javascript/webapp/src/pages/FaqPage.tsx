import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { ChevronDown } from "lucide-react";

const FAQS: FaqItem[] = [
  // Core concepts
  {
    q: "What is simplehook?",
    a: "simplehook gives you a stable webhook URL that never changes. Point Stripe, GitHub, or any provider at your simplehook URL once, and webhooks arrive on your local machine via a one-line SDK integration. No ngrok, no tunnels, no CLI tools running in the background.",
  },
  {
    q: "How is this different from ngrok?",
    a: "ngrok gives you a temporary URL that changes every session. You have to update your webhook provider settings every time. simplehook gives you a permanent URL — set it once, forget it forever. The SDK connects outbound over WebSocket, so there's no port forwarding, no public IP, and no tunnel process to keep alive.",
  },
  {
    q: "Do I need to run a CLI or background process?",
    a: "No. The SDK connects from within your app — just add listenToWebhooks(app, key) and your existing routes handle webhooks normally. There's nothing extra to start or manage.",
  },

  // How it works
  {
    q: "How does it work technically?",
    a: "Your app opens an outbound WebSocket to simplehook's cloud. When a webhook arrives at your stable URL, it's forwarded through that connection to your app. Your app processes it and sends the response back. The webhook provider gets your actual HTTP response. From your app's perspective, it's a normal incoming request.",
  },
  {
    q: "Do webhook signatures still work? (Stripe, GitHub, etc.)",
    a: "Yes. All headers, including signature headers like Stripe's X-Stripe-Signature, are forwarded exactly as-is. Signature verification in your app works the same as in production.",
  },
  {
    q: "What happens when my app is offline?",
    a: "In queue mode (the default), events are stored and replayed when your app reconnects. Nothing is lost. In passthrough mode, the webhook provider gets a timeout error and can retry on their end.",
  },

  // Connections & routing
  {
    q: "What are 'connections' (listeners)?",
    a: "A connection is a named SDK instance. When you call listenToWebhooks(app, key, 'dev'), you create a connection called 'dev'. This lets you run multiple SDK instances (e.g., different team members or environments) and route specific webhook paths to specific connections.",
  },
  {
    q: "How does targeted routing work?",
    a: "Create a route in the dashboard or CLI (e.g., /stripe → dev). When a webhook arrives at /stripe/*, it's delivered only to the 'dev' connection. Other connections don't see it. If no route targeting is set, webhooks go to any connected SDK — this is the default behavior.",
    image: "/productExamples/addRoute.png",
  },
  {
    q: "What happens if a targeted connection is offline?",
    a: "Events queue and retry with exponential backoff (5s, 30s, 2m, 10m, 1h). They're never delivered to a different connection. When the target reconnects, queued events are drained automatically.",
  },

  // Queue vs Passthrough
  {
    q: "What's the difference between queue and passthrough mode?",
    a: "Queue mode returns 200 to the webhook provider immediately, then delivers the event to your app asynchronously with retries. Passthrough mode proxies the request to your app and returns your actual response to the provider. Use queue for most providers (Stripe, Shopify). Use passthrough when the provider reads your response (Twilio TwiML, GitHub status checks).",
  },

  // AI Agents
  {
    q: "Can AI agents use simplehook?",
    a: "Yes. Agents can pull webhook events via HTTP — instant poll, long-poll, or SSE stream. Use the CLI (npx @simplehook/cli pull) or the SimplehookAgent SDK class. No WebSocket needed. The server tracks a cursor per listener, so agents never miss events.",
  },
  {
    q: "What's a cursor?",
    a: "A cursor is a bookmark tracking which events a listener has already consumed. When you pull events, the cursor advances. Next pull returns only new events. If your agent goes offline and comes back, it picks up right where it left off — no duplicates, no gaps.",
  },

  // Limits & pricing
  {
    q: "What are the rate limits?",
    a: "Free: 500 events/month, 3 routes, 3 connections. Pro ($9/mo): 50,000 events/month, unlimited routes and connections. API requests are limited to 500/minute per project on all plans.",
  },
  {
    q: "Is this for local development only, or can I use it in production?",
    a: "simplehook is designed for local development and testing. The SDK auto-disables in production (NODE_ENV=production) unless you set forceEnable: true. The agent pull API works in any environment.",
  },

  // Troubleshooting
  {
    q: "My webhook isn't arriving. What should I check?",
    a: "1) Is your SDK connected? Check the Connections page in the dashboard for a green status dot. 2) Is your API key correct? The key starts with ak_. 3) Is the webhook URL correct? It should be https://hook.simplehook.dev/hooks/<project_id>/<path>. 4) Check the Events page — if the event shows as 'pending', your SDK might not be connected. If it shows as 'delivered', check your app's route handlers.",
    image: "/productExamples/eventsTable.png",
  },
  {
    q: "I see 'disconnected, reconnecting' in my terminal.",
    a: "The SDK auto-reconnects with exponential backoff. Common causes: incorrect API key, network issues, or the simplehook server being temporarily unreachable. Check your SIMPLEHOOK_KEY env var. If the key is correct and the issue persists, check https://hook.simplehook.dev/health.",
  },
  {
    q: "Events are stuck as 'pending'.",
    a: "This means the webhook arrived but hasn't been delivered to your SDK yet. Either your app isn't running, or the event is targeted to a specific connection that's offline. Check the Connections page to see which connections are online.",
    image: "/productExamples/listeners.png",
  },

  // Signatures
  {
    q: "How does delivery verification work?",
    a: "Every event delivered by simplehook is signed with HMAC-SHA256. The signing key is derived from your API key — no new secrets to manage. The SDK verifies signatures automatically. If you use the agent pull API, each event includes webhook_id, webhook_timestamp, and webhook_signature fields. You can verify with verifyWebhook() from @simplehook/core.",
  },
  {
    q: "Is this the same as Stripe's webhook signature?",
    a: "No. Stripe signs webhooks with their own secret so you can verify the event came from Stripe. simplehook preserves Stripe's signature AND adds its own. simplehook's signature proves the event was delivered through simplehook's infrastructure — not spoofed by someone who knows your webhook URL. Two separate trust chains, both work together.",
  },
  {
    q: "Do I follow the Standard Webhooks spec?",
    a: "Yes. simplehook's delivery signatures follow the Standard Webhooks specification (standardwebhooks.com) — using webhook-id, webhook-timestamp, and webhook-signature headers with HMAC-SHA256 signing.",
  },
];

interface FaqItem {
  q: string;
  a: string;
  image?: string;
}

function FaqItemComponent({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-b border-border px-6 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-foreground"
      >
        <span className="text-[15px] font-medium">{item.q}</span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="pb-5">
          <p className="text-[14px] leading-relaxed text-muted-foreground">
            {item.a}
          </p>
          {item.image && (
            <img
              src={item.image}
              alt={item.q}
              className="mt-4 rounded-lg border border-border shadow-sm"
            />
          )}
        </div>
      )}
    </div>
  );
}

export function FaqPage() {
  return (
    <div>
      <Helmet>
        <title>FAQ — simplehook</title>
        <meta name="description" content="Frequently asked questions about simplehook — how it works, webhook routing, AI agents, troubleshooting, and pricing." />
        <link rel="canonical" href="https://simplehook.dev/faq" />
      </Helmet>

      <section className="px-6 py-20">
        <div className="mx-auto max-w-[700px]">
          <p className="mb-4 font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-text-tertiary">
            <span className="inline-block h-px w-5 bg-border-strong mr-2.5 align-middle" />
            FAQ
          </p>
          <h1 className="mb-3 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            Frequently asked questions
          </h1>
          <p className="mb-12 max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            How simplehook works, what to expect, and how to debug when things
            don't go as planned.
          </p>

          <div className="rounded-xl border border-border bg-card">
            {FAQS.map((faq, i) => (
              <FaqItemComponent key={i} item={faq} />
            ))}
          </div>

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Still have questions?{" "}
            <a
              href="https://github.com/bnbarak/simplehook/issues"
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Open an issue on GitHub
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}
