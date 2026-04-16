import { BlogPostShell } from "@/components/blog/BlogPostShell.js";

export function BlogPostAgentWebhooks() {
  return (
    <BlogPostShell slug="agent-webhooks" kicker="How To">
      <div className="space-y-5 text-[16px] leading-[1.75] text-muted-foreground">
            <p>
              Your AI agent can call APIs, write code, send messages. But it can't react to
              something that just happened in the real world unless you give it a way to listen.
              A customer disputed a charge. A PR got merged. A deploy failed. These events arrive
              as webhooks, and most agents have no way to receive them.
            </p>
            <p>
              This guide shows you how to connect any AI agent to webhook events using simplehook.
              No servers to deploy, no WebSocket connections to manage. Your agent pulls events
              when it's ready, processes them, and moves on.
            </p>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Step 1: Get your webhook URL and API key
            </h2>
            <p>
              Sign up at <a href="https://simplehook.dev" className="underline underline-offset-2 hover:text-foreground transition-colors">simplehook.dev</a> and
              grab your webhook URL and API key from the dashboard. The URL looks
              like <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">https://hook.simplehook.dev/hooks/p_abc123</code> and
              the key starts with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">ak_</code>.
            </p>
            <p>
              Point your webhook provider (Stripe, GitHub, Twilio, whatever) at this URL. Append
              your route path, like <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">/stripe/events</code>.
              This URL never changes. Set it once and forget it.
            </p>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Step 2: Set your API key
            </h2>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`export SIMPLEHOOK_KEY=ak_your_api_key`}</code>
            </pre>
            <p>
              Every CLI command and SDK call reads from this environment variable. No config files.
            </p>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Step 3: Pull events from the CLI
            </h2>
            <p>
              The simplest way for an agent to consume webhooks. One command, JSON output, pipe it
              wherever you need.
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`# Get the next event (returns immediately)
npx @simplehook/cli pull

# Wait for a Stripe event (blocks until one arrives)
npx @simplehook/cli pull --wait --path "/stripe/*"

# Get the last 10 events
npx @simplehook/cli pull -n 10

# Stream events as they arrive
npx @simplehook/cli pull --stream`}</code>
            </pre>
            <p>
              The <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">--wait</code> flag
              is the one your agent will use most. It blocks until a matching event arrives, prints
              it as JSON, and exits. Your agent reads stdout, decides what to do, and calls it again
              when it's ready for the next one.
            </p>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Step 4: Never miss an event
            </h2>
            <p>
              This is where simplehook is different from polling an API. The server tracks a cursor
              for each consumer. Every time you pull, you get only events you haven't seen before.
              Pull five events, the cursor moves forward by five. If your agent crashes and comes
              back an hour later, it picks up right where it left off. No duplicates. No gaps.
            </p>
            <p>
              You can run multiple agents against the same webhook URL by giving each one a
              different listener ID:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`# Billing agent processes Stripe events
npx @simplehook/cli pull --wait --path "/stripe/*" --listener-id billing

# Deploy agent watches GitHub pushes
npx @simplehook/cli pull --wait --path "/github/*" --listener-id deploy`}</code>
            </pre>
            <p>
              Each listener has its own cursor. They consume events independently without interfering
              with each other.
            </p>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Step 5: Use the SDK for more control
            </h2>
            <p>
              If your agent is written in Node.js, the <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">SimplehookAgent</code> class
              gives you programmatic access to the same pull API:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`import { SimplehookAgent } from "@simplehook/core";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY);

// Wait for the next Stripe event
const { events } = await agent.pull({
  wait: true,
  path: "/stripe/*",
});

console.log(events[0].body);
// { "type": "charge.succeeded", "amount": 4999, ... }`}</code>
            </pre>
            <p>
              For continuous processing, use the stream method. It calls your handler for each event
              as it arrives:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`await agent.stream((event) => {
  console.log(event.path, event.body);
  // Process the event, call APIs, update state
}, { path: "/stripe/*", timeout: 300 });`}</code>
            </pre>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Step 6: Check queue health
            </h2>
            <p>
              Before pulling, you can check how many events are pending, which listeners are
              connected, and where each cursor sits:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`npx @simplehook/cli status`}</code>
            </pre>
            <p>
              This returns pending counts, cursor positions, and connected listener info. Useful
              for monitoring or deciding whether your agent needs to catch up.
            </p>

            <h2 className="pt-6 text-[22px] font-medium tracking-[-0.01em] text-foreground">
              Putting it together
            </h2>
            <p>
              Here's what a simple agent loop looks like. It waits for Stripe charges, processes
              them, and repeats:
            </p>
            <pre className="overflow-x-auto rounded-xl bg-[#1e1834] px-5 py-5 font-mono text-[13px] leading-[1.8] text-[#e0dce8]">
              <code>{`import { SimplehookAgent } from "@simplehook/core";

const agent = new SimplehookAgent(process.env.SIMPLEHOOK_KEY, {
  listenerId: "charge-processor",
});

while (true) {
  const { events } = await agent.pull({
    wait: true,
    path: "/stripe/charges",
    timeout: 60,
  });

  for (const event of events) {
    const charge = JSON.parse(event.body);
    console.log("Processing charge:", charge.id, charge.amount);
    // Your logic here: update DB, send email, call another API
  }
}`}</code>
            </pre>
            <p>
              If the agent stops, events queue. When it restarts, the cursor picks up where it left
              off. No setup, no infrastructure, no missed events. The webhook URL stays the same
              forever. The agent pulls when it's ready.
            </p>
            <p>
              That's it. Install the CLI
              with <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[13px]">npm install -g @simplehook/cli</code>,
              set your key, and start pulling.{" "}
              <a href="/docs?mode=agents" className="underline underline-offset-2 hover:text-foreground transition-colors">
                Full API reference in the docs
              </a>.
            </p>
          </div>

      <div className="mt-12 flex items-center gap-4">
        <a
          href="/docs?mode=agents"
          className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
        >
          Agent docs
        </a>
        <a
          href="/blog"
          className="text-sm text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          All posts
        </a>
      </div>
    </BlogPostShell>
  );
}
