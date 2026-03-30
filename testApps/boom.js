/**
 * Boom! Send 1000 webhooks to simplehook as fast as possible.
 *
 * Usage:
 *   node boom.js <project_id> [url]
 *
 * Example:
 *   node boom.js p_pmsptasz5f89
 *   node boom.js p_pmsptasz5f89 https://simplehook-server.fly.dev
 */

const projectId = process.argv[2];
const baseUrl = process.argv[3] || "https://hook.simplehook.dev";

if (!projectId) {
  console.error("Usage: node boom.js <project_id> [base_url]");
  process.exit(1);
}

const TOTAL = 1000;
const CONCURRENCY = 50;

const providers = [
  { path: "/stripe/checkout", body: (i) => ({ type: "checkout.session.completed", id: `cs_${i}`, amount: Math.floor(Math.random() * 10000) }) },
  { path: "/stripe/invoice", body: (i) => ({ type: "invoice.paid", id: `in_${i}`, amount_paid: 500 + i }) },
  { path: "/github/push", body: (i) => ({ ref: "refs/heads/main", commits: [{ id: `sha_${i}`, message: `commit #${i}` }] }) },
  { path: "/github/issues", body: (i) => ({ action: "opened", issue: { number: i, title: `Issue #${i}` } }) },
  { path: "/twilio/voice", body: (i) => ({ CallSid: `CA_${i}`, From: `+1555${String(i).padStart(7, "0")}`, CallStatus: "completed" }) },
  { path: "/twilio/sms", body: (i) => ({ MessageSid: `SM_${i}`, Body: `Message ${i}` }) },
  { path: "/shopify/orders", body: (i) => ({ id: 10000 + i, email: `customer${i}@shop.com`, total_price: `${(Math.random() * 200).toFixed(2)}` }) },
  { path: "/linear/issue", body: (i) => ({ action: "create", data: { title: `Task ${i}`, priority: Math.ceil(Math.random() * 4) } }) },
  { path: "/custom/deploy", body: (i) => ({ service: "api", version: `1.0.${i}`, env: "production" }) },
  { path: "/custom/alert", body: (i) => ({ level: ["info", "warn", "error"][i % 3], message: `Alert #${i}` }) },
];

let sent = 0;
let success = 0;
let failed = 0;
const start = Date.now();

async function sendOne(i) {
  const provider = providers[i % providers.length];
  const url = `${baseUrl}/hooks/${projectId}${provider.path}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(provider.body(i)),
    });
    if (res.status >= 200 && res.status < 300) success++;
    else failed++;
  } catch {
    failed++;
  }
  sent++;
  if (sent % 100 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const rps = (sent / (Date.now() - start) * 1000).toFixed(0);
    console.log(`  ${sent}/${TOTAL} sent (${success} ok, ${failed} fail) — ${elapsed}s — ${rps} req/s`);
  }
}

async function boom() {
  console.log(`\n  BOOM! Sending ${TOTAL} webhooks to ${baseUrl}/hooks/${projectId}`);
  console.log(`  Concurrency: ${CONCURRENCY}\n`);

  // Send in batches of CONCURRENCY
  for (let i = 0; i < TOTAL; i += CONCURRENCY) {
    const batch = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, TOTAL); j++) {
      batch.push(sendOne(j));
    }
    await Promise.all(batch);
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const rps = (TOTAL / (Date.now() - start) * 1000).toFixed(0);

  console.log(`\n  Done!`);
  console.log(`  Total:    ${TOTAL}`);
  console.log(`  Success:  ${success}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Time:     ${elapsed}s`);
  console.log(`  Rate:     ${rps} req/s\n`);
}

boom();
