# @simplehook/playwright

[Playwright](https://playwright.dev/) [WebhookProvider](https://seontechnologies.github.io/playwright-utils/webhook.html) for [simplehook](https://simplehook.dev). Test your E2E flows against real webhook events from Stripe, GitHub, Twilio, and any provider.

## Install

```bash
npm install @simplehook/playwright
```

Requires `@seontechnologies/playwright-utils` as a peer dependency (`>=4.0.0`).

## Quick Start

```typescript
import { test } from "@seontechnologies/playwright-utils/webhook/fixtures";
import { SimplehookWebhookProvider } from "@simplehook/playwright";
import { WebhookTemplate } from "@seontechnologies/playwright-utils/webhook";

// Reads SIMPLEHOOK_KEY from the environment by default.
// Each test worker gets a unique listener ID for parallel safety.
const webhookTest = test.extend({
  webhookProvider: async ({}, use) => {
    await use(new SimplehookWebhookProvider());
  },
});

webhookTest.use({ webhookConfig: { cleanupStrategy: "matched-only" } });

webhookTest("Stripe charge creates an order", async ({ webhookRegistry, page }) => {
  // Trigger a real Stripe test charge
  await page.click("#buy-button");

  // Wait for the real webhook to arrive through simplehook
  const webhook = await webhookRegistry.waitFor(
    WebhookTemplate.create("stripe-charge")
      .withUrlMatching("/stripe/events")
      .withBodyMatching({ type: "charge.succeeded" })
  );

  expect(webhook.body.data.object.amount).toBe(500);
});
```

## API

### `new SimplehookWebhookProvider(options?)`

Creates a provider that pulls real webhook events from simplehook's API and exposes them through the `WebhookProvider` interface.

Called with no arguments, it reads `SIMPLEHOOK_KEY` from the environment.

```typescript
// Defaults: reads SIMPLEHOOK_KEY from env, auto-generates unique listener ID
new SimplehookWebhookProvider();

// Override anything you need
new SimplehookWebhookProvider({
  apiKey: "ak_...",           // Optional, falls back to SIMPLEHOOK_KEY env var
  serverUrl: "...",           // Override server URL
  listenerId: "my-worker",   // Custom listener ID (default: auto-generated per instance)
  pullBatchSize: 50,          // Events per pull cycle (default: 100)
});
```

### How it works

The provider bridges simplehook's cursor-based Pull API to the journal model that `playwright-utils` expects:

1. Each provider instance gets a unique listener ID, so parallel test workers never see each other's cursors
2. Events are pulled from the API into an in-memory journal
3. `getReceivedWebhooks()` queries the local journal with filter support (URL pattern, method, timestamp)
4. `deleteById()` removes events from the local journal (for `matched-only` cleanup)
5. `resetJournal()` clears the journal and generates a fresh listener ID (clean slate)

### Parallel safety

Each `SimplehookWebhookProvider` instance generates a unique listener ID (`pw-<random>`). This means:
- Workers A and B both see the same events (independent cursors)
- `deleteById()` in worker A doesn't affect worker B
- `resetJournal()` in one worker doesn't affect others

## Links

- [Documentation](https://simplehook.dev/docs)
- [playwright-utils webhook docs](https://seontechnologies.github.io/playwright-utils/webhook.html)
- [GitHub](https://github.com/bnbarak/antiwebhook)

## License

MIT
