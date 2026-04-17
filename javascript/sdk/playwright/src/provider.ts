import { SimplehookAgent } from "@simplehook/core";
import type { AgentOptions } from "@simplehook/core";
import type {
  WebhookProvider,
  ReceivedWebhook,
  WebhookQueryFilter,
} from "@seontechnologies/playwright-utils/webhook";

// ── Types ────────────────────────────────────────────────────────────

export interface SimplehookProviderOptions extends AgentOptions {
  /** API key. Falls back to SIMPLEHOOK_KEY env var. */
  apiKey?: string;
  /** Max events to pull per refresh cycle. Default: 100. */
  pullBatchSize?: number;
}

// ── Helpers ──────────────────────────────────────────────────────────

function globToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const withWildcards = escaped.replace(/\*/g, ".*");
  return new RegExp(`^${withWildcards}$`);
}

function randomId(): string {
  return `pw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ── Provider ─────────────────────────────────────────────────────────

/**
 * A WebhookProvider backed by simplehook's Pull API.
 *
 * Instead of a mock server, this provider receives real webhook events
 * (Stripe, GitHub, Twilio, etc.) that were delivered through simplehook.
 * Events are pulled into an in-memory journal and served from there,
 * bridging simplehook's cursor-based API to the journal model that
 * playwright-utils expects.
 *
 * Each provider instance gets a unique listener ID, so parallel test
 * workers never collide.
 */
export class SimplehookWebhookProvider implements WebhookProvider {
  private agent: SimplehookAgent;
  private journal = new Map<string, ReceivedWebhook>();
  private lastSeenId: string | null = null;
  private batchSize: number;
  private apiKey: string;
  private opts: AgentOptions;
  private refreshing: Promise<void> | null = null;

  constructor(opts: SimplehookProviderOptions = {}) {
    const apiKey = opts.apiKey ?? process.env.SIMPLEHOOK_KEY;
    if (!apiKey) {
      throw new Error(
        "simplehook: API key not provided. Pass apiKey or set SIMPLEHOOK_KEY env var.",
      );
    }
    this.apiKey = apiKey;
    this.opts = { serverUrl: opts.serverUrl, listenerId: opts.listenerId ?? randomId() };
    this.agent = new SimplehookAgent(apiKey, this.opts);
    this.batchSize = opts.pullBatchSize ?? 100;
  }

  // ── WebhookProvider interface ────────────────────────────────────

  async setup(): Promise<void> {
    await this.refresh();
  }

  async teardown(): Promise<void> {
    this.journal.clear();
    this.lastSeenId = null;
  }

  async getReceivedWebhooks(filter?: WebhookQueryFilter): Promise<ReceivedWebhook[]> {
    await this.refresh();
    let entries = Array.from(this.journal.values());

    if (filter?.urlPattern) {
      const re = globToRegex(filter.urlPattern);
      entries = entries.filter((e) => re.test(e.url));
    }
    if (filter?.method) {
      const m = filter.method.toUpperCase();
      entries = entries.filter((e) => e.method.toUpperCase() === m);
    }
    if (filter?.since) {
      const since = filter.since.getTime();
      entries = entries.filter((e) => e.receivedAt.getTime() >= since);
    }

    return entries.sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());
  }

  async deleteById(id: string): Promise<void> {
    this.journal.delete(id);
  }

  async resetJournal(): Promise<void> {
    this.journal.clear();
    this.lastSeenId = null;
    // Fresh listener ID so the server-side cursor resets
    this.opts = { ...this.opts, listenerId: randomId() };
    this.agent = new SimplehookAgent(this.apiKey, this.opts);
  }

  async getCount(criteria?: Record<string, unknown>): Promise<number> {
    await this.refresh();
    if (!criteria) return this.journal.size;
    return (await this.getReceivedWebhooks(criteria as WebhookQueryFilter)).length;
  }

  async removeByCriteria(criteria: Record<string, unknown>): Promise<void> {
    const matches = await this.getReceivedWebhooks(criteria as WebhookQueryFilter);
    for (const m of matches) {
      this.journal.delete(m.id);
    }
  }

  // ── Internals ────────────────────────────────────────────────────

  /** Pull new events from the simplehook API and add them to the journal. */
  private async refresh(): Promise<void> {
    // Deduplicate concurrent refreshes
    if (this.refreshing) {
      await this.refreshing;
      return;
    }
    this.refreshing = this.doRefresh();
    try {
      await this.refreshing;
    } finally {
      this.refreshing = null;
    }
  }

  private async doRefresh(): Promise<void> {
    let hasMore = true;
    while (hasMore) {
      const pullOpts: Record<string, unknown> = { n: this.batchSize };
      if (this.lastSeenId) {
        pullOpts.after = this.lastSeenId;
      }
      const result = await this.agent.pull(pullOpts as any);

      for (const event of result.events) {
        if (!this.journal.has(event.id)) {
          this.journal.set(event.id, toReceivedWebhook(event));
        }
        this.lastSeenId = event.id;
      }

      hasMore = result.remaining > 0 && result.events.length > 0;
    }
  }
}

// ── Mapping ──────────────────────────────────────────────────────────

function toReceivedWebhook(event: {
  id: string;
  path: string;
  method: string;
  headers: Record<string, string>;
  body: string | null;
  received_at: string;
}): ReceivedWebhook {
  let parsedBody: unknown = event.body;
  let parseError = false;

  if (typeof event.body === "string") {
    try {
      parsedBody = JSON.parse(event.body);
    } catch {
      parseError = true;
      parsedBody = event.body;
    }
  }

  return {
    id: event.id,
    url: event.path,
    method: event.method,
    headers: event.headers,
    body: parsedBody,
    receivedAt: new Date(event.received_at),
    parseError,
  };
}
