# @simplehook/cli

Command-line interface for [simplehook](https://simplehook.dev) -- pull webhook events and inspect queue status from your terminal.

## Install

```bash
npm install -g @simplehook/cli
```

## Quick Start

```bash
# Set your API key
export SIMPLEHOOK_KEY=ak_...

# Pull the next webhook event
simplehook pull

# Wait for an event to arrive
simplehook pull --wait

# Stream events as they arrive
simplehook pull --stream

# Check queue status
simplehook status
```

## Commands

### `simplehook pull`

Pull webhook events from the queue.

```
Options:
  -n, --n <count>          Number of events to return (1-100)
  -p, --path <glob>        Filter by path glob (e.g. /stripe/*)
  -w, --wait               Long-poll: block until an event arrives
  -s, --stream             SSE stream: print events as they arrive
  -t, --timeout <seconds>  Timeout for wait/stream (default: 30)
  -l, --listener-id <id>   Listener ID for cursor tracking
  -k, --key <apiKey>       API key (or set SIMPLEHOOK_KEY)
      --server <url>       Server URL (or set SIMPLEHOOK_SERVER)
```

Events are printed as one JSON object per line:

```bash
# Pull up to 10 Stripe events
simplehook pull -n 10 --path "/stripe/*"

# Stream all events, piping to jq
simplehook pull --stream | jq '.path'
```

### `simplehook status`

Show queue health, connected listeners, cursor positions, and per-route breakdown.

```
Options:
      --json               Output raw JSON
  -k, --key <apiKey>       API key (or set SIMPLEHOOK_KEY)
      --server <url>       Server URL (or set SIMPLEHOOK_SERVER)
```

```bash
# Pretty-printed status
simplehook status

# Machine-readable JSON
simplehook status --json
```

## Authentication

Pass your API key via `--key` or the `SIMPLEHOOK_KEY` environment variable. Get your key from the [dashboard](https://simplehook.dev/dashboard).

## Links

- [Documentation](https://simplehook.dev/docs)
- [Dashboard](https://simplehook.dev/dashboard)
- [GitHub](https://github.com/bnbarak/simplehook)

## License

MIT
