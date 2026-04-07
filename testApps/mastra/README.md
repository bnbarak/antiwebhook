# Mastra + simplehook Example

A Mastra AI agent that processes Stripe webhook events via simplehook's pull API.

## Setup

```bash
npm install
```

## Run

```bash
# Set your simplehook API key and OpenAI key
export SIMPLEHOOK_KEY=ak_your_key_here
export OPENAI_API_KEY=sk-your_key_here

# Run the agent
npx tsx index.ts
```

## How it works

```
Stripe ──POST──> simplehook (stores event)
                     │
                     └── Mastra agent calls simplehook_pull tool
                              │
                              └── LLM processes the event
```

1. Stripe sends webhooks to your simplehook URL
2. simplehook stores events in the queue
3. The Mastra agent uses the `simplehook_pull` tool to fetch events
4. The LLM analyzes each event and reports what happened

## Tools

| Tool | Description |
|------|-------------|
| `simplehook_pull` | Pull webhook events (instant or long-poll) |
| `simplehook_status` | Check queue health and cursor positions |

## Custom server

To point at a local server instead of production:

```bash
export SIMPLEHOOK_SERVER=http://localhost:8400
```
