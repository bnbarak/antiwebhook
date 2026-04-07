import { SimplehookAgent } from "simplehook-core";

export interface StatusFlags {
  key: string;
  server?: string;
  json?: boolean;
}

export async function runStatus(flags: StatusFlags): Promise<void> {
  const agent = new SimplehookAgent(flags.key, {
    serverUrl: flags.server,
  });

  const status = await agent.status();

  if (flags.json) {
    console.log(JSON.stringify(status, null, 2));
    return;
  }

  // Pretty print
  console.log(`Project: ${status.project_id}`);
  console.log();
  console.log("Queue:");
  console.log(`  Pending:            ${status.queue.pending}`);
  console.log(`  Failed:             ${status.queue.failed}`);
  console.log(`  Delivered (1h):     ${status.queue.delivered_last_hour}`);
  if (status.queue.oldest_pending) {
    console.log(`  Oldest pending:     ${status.queue.oldest_pending}`);
  }

  console.log();
  console.log("Listeners:");
  if (status.listeners.connected.length > 0) {
    console.log(`  Connected:          ${status.listeners.connected.join(", ")}`);
  }
  if (status.listeners.disconnected.length > 0) {
    console.log(`  Disconnected:       ${status.listeners.disconnected.join(", ")}`);
  }

  if (Object.keys(status.cursors).length > 0) {
    console.log();
    console.log("Cursors:");
    for (const [id, cursor] of Object.entries(status.cursors)) {
      console.log(`  ${id}: ${cursor.last_event ?? "(none)"} (${cursor.behind} behind)`);
    }
  }

  if (status.routes.length > 0) {
    console.log();
    console.log("Routes:");
    for (const route of status.routes) {
      console.log(`  ${route.path}  ${route.mode}  ${route.pending} pending`);
    }
  }
}
