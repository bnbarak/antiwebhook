import { useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Check } from "lucide-react";

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

function CopyableCode({ code, title }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="overflow-hidden rounded-xl shadow-lg">
      <div className="flex items-center border-b border-white/[0.06] bg-[#2d2640] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
          <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
          <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
        </div>
        <span className="mx-auto font-mono text-[12px] text-[#9a91b0]">{title ?? "Terminal"}</span>
        <button onClick={copy} className="text-[#9a91b0] hover:text-white/80 transition-colors" title="Copy code">
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <pre className="overflow-x-auto bg-[#1e1834] px-6 py-5 font-mono text-[13px] leading-[1.9] text-[#e0dce8]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MastraExamplePage() {
  return (
    <div>
      {/* Hero */}
      <section className="px-6 pb-16 pt-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Example</Kicker>
          <h1 className="mb-4 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            Build a Stripe webhook agent with Mastra
          </h1>
          <p className="max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            A step-by-step guide to building an AI agent that processes Stripe
            webhook events using Mastra and simplehook.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Flow diagram */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <h2 className="mb-6 text-[18px] font-medium">How it works</h2>
          <div className="rounded-xl border border-border bg-card/50 p-6">
            <div className="flex flex-wrap items-center justify-center gap-3 font-mono text-[12px]">
              <div className="rounded-lg border border-border bg-muted px-4 py-2">Stripe</div>
              <span className="text-muted-foreground/40">──POST──&gt;</span>
              <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-primary">simplehook</div>
              <span className="text-muted-foreground/40">──pull──&gt;</span>
              <div className="rounded-lg border border-border bg-muted px-4 py-2">Mastra agent</div>
              <span className="text-muted-foreground/40">──&gt;</span>
              <div className="rounded-lg border border-border bg-muted px-4 py-2">Your logic</div>
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Stripe sends webhooks to simplehook. Your Mastra agent pulls them via HTTP and processes with an LLM.
            </p>
          </div>
        </div>
      </section>

      <SectionDivider />

      {/* Prerequisites */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <h2 className="mb-6 text-[18px] font-medium">Prerequisites</h2>
          <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
            <li className="flex items-baseline gap-2">
              <span className="text-status-green-text">&#10003;</span>
              A simplehook account with an API key (<Link to="/login" className="underline underline-offset-2 hover:text-foreground">sign up</Link>)
            </li>
            <li className="flex items-baseline gap-2">
              <span className="text-status-green-text">&#10003;</span>
              Node.js 18+ installed
            </li>
            <li className="flex items-baseline gap-2">
              <span className="text-status-green-text">&#10003;</span>
              An OpenAI API key (or any Mastra-supported provider)
            </li>
            <li className="flex items-baseline gap-2">
              <span className="text-status-green-text">&#10003;</span>
              A Stripe test account (for sending test webhooks)
            </li>
          </ul>
        </div>
      </section>

      <SectionDivider />

      {/* Step 1 */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-foreground font-mono text-sm text-background">1</div>
            <h2 className="text-[18px] font-medium">Set up the project</h2>
          </div>
          <CopyableCode
            code={`mkdir stripe-agent && cd stripe-agent
npm init -y
npm install @simplehook/mastra @mastra/core zod`}
            title="terminal"
          />
        </div>
      </section>

      <SectionDivider />

      {/* Step 2 */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-foreground font-mono text-sm text-background">2</div>
            <h2 className="text-[18px] font-medium">Configure your webhook URL</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            In the Stripe Dashboard, set your webhook endpoint to your simplehook URL:
          </p>
          <CopyableCode
            code="https://hook.simplehook.dev/hooks/<your-project-id>/stripe/events"
            title="Stripe webhook URL"
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Find your project ID in the{" "}
            <Link to="/dashboard" className="underline underline-offset-2 hover:text-foreground">simplehook dashboard</Link>.
            Set it once — it never changes.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Step 3 */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-foreground font-mono text-sm text-background">3</div>
            <h2 className="text-[18px] font-medium">Create the agent</h2>
          </div>
          <CopyableCode
            code={`import { Agent } from "@mastra/core/agent";
import { createSimplehookTools } from "@simplehook/mastra";

// Create simplehook tools — reads SIMPLEHOOK_KEY from env
const tools = createSimplehookTools();

// Create a Mastra agent with webhook tools
const agent = new Agent({
  name: "stripe-webhook-agent",
  instructions: \`You are a Stripe webhook processing agent.

Your job:
1. Use simplehook_pull to check for new events (path="/stripe/*")
2. Analyze each event and summarize what happened
3. Use simplehook_status to check queue health if asked

Always use wait=true so you block until an event arrives.\`,
  model: {
    provider: "OPEN_AI",
    name: "gpt-4o",
  },
  tools,
});

// Run the agent
const response = await agent.generate(
  "Pull up to 5 Stripe events and tell me what happened."
);

console.log(response.text);`}
            title="agent.ts"
          />
        </div>
      </section>

      <SectionDivider />

      {/* Step 4 */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-foreground font-mono text-sm text-background">4</div>
            <h2 className="text-[18px] font-medium">Run and test</h2>
          </div>
          <CopyableCode
            code={`# Set your keys
export SIMPLEHOOK_KEY=ak_your_key_here
export OPENAI_API_KEY=sk-your_key_here

# Run the agent
npx tsx agent.ts`}
            title="terminal"
          />
          <p className="mt-4 text-sm text-muted-foreground">
            The agent will call <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">simplehook_pull</code> to
            fetch your Stripe events, then use the LLM to analyze and summarize them.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            To send test events, use the <a href="https://dashboard.stripe.com/test/webhooks" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground">Stripe webhook test tool</a> or trigger
            a test payment in Stripe's test mode.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* What's next */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-[960px]">
          <h2 className="mb-6 text-[18px] font-medium">What's next</h2>
          <div className="grid gap-4 md:grid-cols-3">
            <Link to="/docs?mode=agents#sdk-reference" className="rounded-lg border border-border bg-card px-5 py-4 transition-all hover:border-border-strong">
              <h3 className="mb-1 text-sm font-medium">SDK Reference</h3>
              <p className="text-xs text-muted-foreground">Full SimplehookAgent API docs</p>
            </Link>
            <Link to="/docs?mode=agents#cli" className="rounded-lg border border-border bg-card px-5 py-4 transition-all hover:border-border-strong">
              <h3 className="mb-1 text-sm font-medium">CLI</h3>
              <p className="text-xs text-muted-foreground">Pull events from the terminal</p>
            </Link>
            <Link to="/docs?mode=agents#ai-agent-api" className="rounded-lg border border-border bg-card px-5 py-4 transition-all hover:border-border-strong">
              <h3 className="mb-1 text-sm font-medium">Pull API Reference</h3>
              <p className="text-xs text-muted-foreground">Full endpoint docs with all params</p>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
