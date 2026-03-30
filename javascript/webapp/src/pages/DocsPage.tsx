import { CodeBlock } from "@/components/shared/CodeBlock.js";

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

export function DocsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="px-6 pb-16 pt-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Documentation</Kicker>
          <h1 className="mb-4 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            antiwebhooks docs
          </h1>
          <p className="max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            Everything you need to receive webhooks locally with one line of code.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Quick Start */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Quick start</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Up and running in 60 seconds
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Install the SDK, add one line, and start receiving webhooks.
          </p>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">1. Install the package</h3>
              <CodeBlock label="Terminal">
                {`npm install antiwebhooks`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">2. Add to your app</h3>
              <CodeBlock label="Your app" filename="app.ts">
                {`import { webhooks } from 'antiwebhooks'

// Start receiving webhooks on port 3000
webhooks.listen(3000, {
  apiKey: 'aw_live_...',  // or set ANTIWEBHOOKS_API_KEY env var
})`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">3. Set your webhook URL</h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                In your webhook provider's dashboard (Stripe, GitHub, etc.), set the webhook URL to:
              </p>
              <CodeBlock label="Webhook URL">
                {`https://hook.antiwebhooks.com/<your-project-id>/stripe/events`}
              </CodeBlock>
              <p className="mt-2 text-xs text-muted-foreground">
                Replace <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">&lt;your-project-id&gt;</code> with
                your project ID from the dashboard.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">4. Run your app</h3>
              <CodeBlock label="Terminal">
                {`$ npm run dev

[antiwebhooks] connected to wss://ws.antiwebhooks.com
[antiwebhooks] listening on port 3000
[antiwebhooks] POST /stripe/events -> forwarded -> 200 OK`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* SDK Reference */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>SDK Reference</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Node.js SDK
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            The antiwebhooks SDK connects to the platform over WebSocket and forwards
            events to your local server.
          </p>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">webhooks.listen(port, options?)</code>
              </h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                Start listening for webhook events and forward them to the specified port.
              </p>
              <CodeBlock label="Example">
                {`import { webhooks } from 'antiwebhooks'

const client = webhooks.listen(3000, {
  // API key — defaults to ANTIWEBHOOKS_API_KEY env var
  apiKey: 'aw_live_...',

  // Host to forward to — defaults to localhost
  host: 'localhost',

  // Called when connected to antiwebhooks
  onConnect: () => console.log('connected'),

  // Called when disconnected
  onDisconnect: () => console.log('disconnected'),

  // Called for each received event
  onEvent: (event) => console.log(event.method, event.path),
})

// Graceful shutdown
process.on('SIGINT', () => client.close())`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Options</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Option</th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Type</th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Default</th>
                      <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["apiKey", "string", "env var", "Your project API key"],
                      ["host", "string", "'localhost'", "Host to forward webhooks to"],
                      ["onConnect", "() => void", "undefined", "Called when WebSocket connects"],
                      ["onDisconnect", "() => void", "undefined", "Called when WebSocket disconnects"],
                      ["onEvent", "(event) => void", "undefined", "Called for each received event"],
                    ].map(([opt, type, def, desc]) => (
                      <tr key={opt} className="border-b last:border-0">
                        <td className="px-3 py-2 font-mono text-xs">{opt}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{type}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{def}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Route Configuration */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Route configuration</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Per-path routing rules
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Routes let you control how different webhook paths are handled.
            Configure them in the dashboard or via API.
          </p>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">Queue mode (default)</h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                Returns 200 to the webhook provider immediately. Events are queued and
                forwarded to your app with automatic retries and exponential backoff.
              </p>
              <CodeBlock label="Route config">
                {`{
  "path_prefix": "/stripe",
  "mode": "queue"
}`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Passthrough mode</h3>
              <p className="mb-3 text-[13px] text-muted-foreground">
                Proxies the webhook to your app over WebSocket and returns your actual
                HTTP response to the webhook provider. Like a tunnel but without the tunnel.
              </p>
              <CodeBlock label="Route config">
                {`{
  "path_prefix": "/github",
  "mode": "passthrough"
}`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Path matching</h3>
              <p className="text-[13px] text-muted-foreground">
                Routes match on prefix. A route with <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/stripe</code> will
                match <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/stripe/events</code>,{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">/stripe/webhooks</code>, etc. The most specific
                prefix wins. If no route matches, the default queue mode is used.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* WebSocket Protocol */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>WebSocket protocol</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Real-time event delivery
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            The SDK maintains a persistent WebSocket to receive events in real-time.
            Here is how the protocol works under the hood.
          </p>

          <div className="flex flex-col gap-6">
            <div>
              <h3 className="mb-3 text-sm font-medium">Connection</h3>
              <CodeBlock label="WebSocket">
                {`wss://ws.antiwebhooks.com/connect?api_key=aw_live_...`}
              </CodeBlock>
              <p className="mt-2 text-xs text-muted-foreground">
                The SDK authenticates on connect. The server sends a ping every 30 seconds
                to keep the connection alive.
              </p>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Event message (queue mode)</h3>
              <CodeBlock label="Server -> Client">
                {`{
  "type": "event",
  "event_id": "evt_abc123",
  "method": "POST",
  "path": "/stripe/events",
  "headers": { "content-type": "application/json", ... },
  "body": "{ \\"type\\": \\"checkout.session.completed\\", ... }"
}`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">ACK message</h3>
              <CodeBlock label="Client -> Server">
                {`{
  "type": "ack",
  "event_id": "evt_abc123",
  "status": 200
}`}
              </CodeBlock>
              <p className="mt-2 text-xs text-muted-foreground">
                In queue mode, the client sends an ACK after forwarding the event locally.
                In passthrough mode, the ACK includes the full response body and headers.
              </p>
            </div>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* API Reference */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>API Reference</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            REST API
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            All endpoints require a Bearer token in the Authorization header.
          </p>

          <div className="flex flex-col gap-4">
            {/* Events */}
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-background px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Events
              </div>
              {[
                { method: "GET", path: "/api/events", desc: "List events" },
                { method: "GET", path: "/api/events/:id", desc: "Get event detail" },
                { method: "POST", path: "/api/events/:id/replay", desc: "Replay event" },
              ].map((ep) => (
                <div key={ep.path + ep.method} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
                  <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${ep.method === "GET" ? "bg-status-blue-bg text-status-blue-text" : "bg-status-green-bg text-status-green-text"}`}>
                    {ep.method}
                  </span>
                  <span className="font-mono text-xs">{ep.path}</span>
                  <span className="ml-auto text-xs text-text-tertiary">{ep.desc}</span>
                </div>
              ))}
            </div>

            {/* Routes */}
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-background px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Routes
              </div>
              {[
                { method: "GET", path: "/api/routes", desc: "List routes" },
                { method: "POST", path: "/api/routes", desc: "Create route" },
                { method: "PATCH", path: "/api/routes/:id", desc: "Update route" },
                { method: "DELETE", path: "/api/routes/:id", desc: "Delete route" },
              ].map((ep) => (
                <div key={ep.path + ep.method} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
                  <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                    ep.method === "GET" ? "bg-status-blue-bg text-status-blue-text" :
                    ep.method === "POST" ? "bg-status-green-bg text-status-green-text" :
                    ep.method === "PATCH" ? "bg-status-amber-bg text-status-amber-text" :
                    "bg-status-red-bg text-status-red-text"
                  }`}>
                    {ep.method}
                  </span>
                  <span className="font-mono text-xs">{ep.path}</span>
                  <span className="ml-auto text-xs text-text-tertiary">{ep.desc}</span>
                </div>
              ))}
            </div>

            {/* Auth & Billing */}
            <div className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="border-b border-border bg-background px-4 py-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Auth & Billing
              </div>
              {[
                { method: "POST", path: "/api/auth/register", desc: "Create project" },
                { method: "GET", path: "/api/auth/me", desc: "Get current project" },
                { method: "GET", path: "/api/billing", desc: "Get billing info" },
                { method: "POST", path: "/api/billing/checkout", desc: "Create checkout session" },
                { method: "POST", path: "/api/billing/portal", desc: "Create billing portal link" },
              ].map((ep) => (
                <div key={ep.path + ep.method} className="flex items-center gap-3 border-b border-border px-4 py-2.5 text-sm last:border-0">
                  <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${ep.method === "GET" ? "bg-status-blue-bg text-status-blue-text" : "bg-status-green-bg text-status-green-text"}`}>
                    {ep.method}
                  </span>
                  <span className="font-mono text-xs">{ep.path}</span>
                  <span className="ml-auto text-xs text-text-tertiary">{ep.desc}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <h3 className="mb-3 text-sm font-medium">Authentication</h3>
            <CodeBlock label="Example request">
              {`curl -H "Authorization: Bearer aw_live_..." \\
  https://api.antiwebhooks.com/api/events`}
            </CodeBlock>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Examples */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Examples</Kicker>
          <h2 className="mb-2 text-[22px] font-medium tracking-[-0.015em]">
            Common integrations
          </h2>
          <p className="mb-8 max-w-[560px] text-[15px] text-muted-foreground">
            Copy-paste examples for popular webhook providers.
          </p>

          <div className="flex flex-col gap-8">
            <div>
              <h3 className="mb-3 text-sm font-medium">Stripe</h3>
              <CodeBlock label="Express + Stripe" filename="server.ts">
                {`import express from 'express'
import { webhooks } from 'antiwebhooks'
import Stripe from 'stripe'

const app = express()
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

app.post('/stripe/events', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature']!
  const event = stripe.webhooks.constructEvent(
    req.body, sig, process.env.STRIPE_WEBHOOK_SECRET!
  )

  switch (event.type) {
    case 'checkout.session.completed':
      // handle checkout
      break
  }

  res.json({ received: true })
})

app.listen(3000)
webhooks.listen(3000)`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">GitHub</h3>
              <CodeBlock label="GitHub webhooks" filename="server.ts">
                {`import express from 'express'
import { webhooks } from 'antiwebhooks'

const app = express()
app.use(express.json())

app.post('/github/events', (req, res) => {
  const event = req.headers['x-github-event']
  const payload = req.body

  console.log(\`GitHub event: \${event}\`)
  console.log(\`Repo: \${payload.repository?.full_name}\`)

  res.status(200).send('ok')
})

app.listen(3000)
webhooks.listen(3000)`}
              </CodeBlock>
            </div>

            <div>
              <h3 className="mb-3 text-sm font-medium">Generic webhook handler</h3>
              <CodeBlock label="Any provider" filename="server.ts">
                {`import express from 'express'
import { webhooks } from 'antiwebhooks'

const app = express()
app.use(express.json())

// Catch all webhook events
app.post('/webhooks/*', (req, res) => {
  console.log('Webhook received:', req.path)
  console.log('Headers:', req.headers)
  console.log('Body:', req.body)
  res.status(200).json({ ok: true })
})

app.listen(3000)
webhooks.listen(3000)`}
              </CodeBlock>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
