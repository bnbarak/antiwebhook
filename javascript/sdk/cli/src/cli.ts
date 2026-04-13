#!/usr/bin/env node

import { Command } from "commander";
import { runPull } from "./commands/pull.js";
import { runStatus } from "./commands/status.js";
import { runRoutesList, runRoutesCreate, runRoutesDelete } from "./commands/routes.js";
import { runListenersList, runListenersCreate, runListenersDelete } from "./commands/listeners.js";

const program = new Command();

program
  .name("simplehook")
  .description("CLI for simplehook — pull webhook events and check queue status.")
  .version("0.1.0");

function resolveKey(opts: { key?: string }): string {
  const key = opts.key ?? process.env.SIMPLEHOOK_KEY;
  if (!key) {
    console.error("Error: API key required. Use --key or set SIMPLEHOOK_KEY env var.");
    process.exit(1);
  }
  return key;
}

function resolveServer(opts: { server?: string }): string | undefined {
  return opts.server ?? process.env.SIMPLEHOOK_SERVER ?? undefined;
}

program
  .command("pull")
  .description("Pull webhook events from the queue.")
  .option("-n, --n <count>", "Number of events (1-100)", parseInt)
  .option("-p, --path <glob>", "Filter by path glob (e.g. /stripe/*)")
  .option("-w, --wait", "Long-poll: block until an event arrives")
  .option("-s, --stream", "SSE stream: print events as they arrive")
  .option("-t, --timeout <seconds>", "Timeout for wait/stream (default: 30)", parseInt)
  .option("-l, --listener-id <id>", "Listener ID for cursor tracking")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (opts) => {
    try {
      await runPull({
        key: resolveKey(opts),
        server: resolveServer(opts),
        listenerId: opts.listenerId,
        n: opts.n,
        path: opts.path,
        wait: opts.wait,
        stream: opts.stream,
        timeout: opts.timeout,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Show queue health, cursors, and connected listeners.")
  .option("--json", "Output raw JSON")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (opts) => {
    try {
      await runStatus({
        key: resolveKey(opts),
        server: resolveServer(opts),
        json: opts.json,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── Routes ──────────────────────────────────────────────────────────

const routes = program
  .command("routes")
  .description("List, create, or delete routes.")
  .option("--json", "Output raw JSON")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (opts) => {
    try {
      await runRoutesList({
        key: resolveKey(opts),
        server: resolveServer(opts),
        json: opts.json,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

routes
  .command("create <path>")
  .description("Create a new route.")
  .option("-m, --mode <mode>", "Route mode: queue or passthrough")
  .option("-l, --listener <id>", "Listener ID to bind")
  .option("-t, --timeout <seconds>", "Timeout in seconds", parseInt)
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (path, opts) => {
    try {
      await runRoutesCreate({
        key: resolveKey(opts),
        server: resolveServer(opts),
        path,
        mode: opts.mode,
        listener: opts.listener,
        timeout: opts.timeout,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

routes
  .command("delete <id>")
  .description("Delete a route by ID.")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (id, opts) => {
    try {
      await runRoutesDelete({
        key: resolveKey(opts),
        server: resolveServer(opts),
        id,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

// ── Listeners ───────────────────────────────────────────────────────

const listeners = program
  .command("listeners")
  .description("List, create, or delete listeners.")
  .option("--json", "Output raw JSON")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (opts) => {
    try {
      await runListenersList({
        key: resolveKey(opts),
        server: resolveServer(opts),
        json: opts.json,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

listeners
  .command("create <id>")
  .description("Create a new listener.")
  .option("-l, --label <name>", "Human-readable label")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (id, opts) => {
    try {
      await runListenersCreate({
        key: resolveKey(opts),
        server: resolveServer(opts),
        id,
        label: opts.label,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

listeners
  .command("delete <id>")
  .description("Delete a listener by ID.")
  .option("-k, --key <apiKey>", "API key (or set SIMPLEHOOK_KEY)")
  .option("--server <url>", "Server URL (or set SIMPLEHOOK_SERVER)")
  .action(async (id, opts) => {
    try {
      await runListenersDelete({
        key: resolveKey(opts),
        server: resolveServer(opts),
        id,
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

program.parse();
