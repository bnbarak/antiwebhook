import { SimplehookAgent } from "simplehook-core";
import type { PullOptions, WebhookEvent } from "simplehook-core";

export interface PullFlags {
  key: string;
  server?: string;
  listenerId?: string;
  n?: number;
  path?: string;
  wait?: boolean;
  stream?: boolean;
  timeout?: number;
}

export async function runPull(flags: PullFlags): Promise<void> {
  const agent = new SimplehookAgent(flags.key, {
    serverUrl: flags.server,
    listenerId: flags.listenerId,
  });

  if (flags.stream) {
    await agent.stream(
      (event: WebhookEvent) => {
        console.log(JSON.stringify(event));
      },
      { path: flags.path, timeout: flags.timeout },
    );
    return;
  }

  const opts: PullOptions = {};
  if (flags.n !== undefined) opts.n = flags.n;
  if (flags.path) opts.path = flags.path;
  if (flags.wait) opts.wait = true;
  if (flags.timeout !== undefined) opts.timeout = flags.timeout;

  const result = await agent.pull(opts);

  for (const event of result.events) {
    console.log(JSON.stringify(event));
  }

  if (result.events.length === 0 && !flags.wait) {
    process.stderr.write(`No new events. ${result.remaining} remaining.\n`);
  }
}
