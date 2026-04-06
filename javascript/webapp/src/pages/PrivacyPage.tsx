import { Shield, Lock, Eye, Trash2, Globe, Ban, UserCheck, Cookie, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.js";

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

export function PrivacyPage() {
  return (
    <div>
      {/* Hero */}
      <section className="px-6 pb-16 pt-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Privacy</Kicker>
          <h1 className="mb-4 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            Privacy Policy
          </h1>
          <p className="max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            Last updated: April 6, 2026. How simplehook handles your data. The
            short version: we store as little as possible and never share it.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Content */}
      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
          {/* Data controller */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-muted-foreground" />
                <CardTitle>Data controller</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  simplehook ("we", "us", "our") is the data controller for
                  personal data collected through the Service. For questions
                  about this policy, contact us at{" "}
                  <a
                    href="mailto:support@simplehook.dev"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    support@simplehook.dev
                  </a>
                  .
                </p>
              </div>
            </CardContent>
          </Card>

          {/* What we collect */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Eye className="size-5 text-muted-foreground" />
                <CardTitle>What we collect</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>We collect the minimum data needed to operate the Service:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>
                    <strong>Account data:</strong> Name, email address, and
                    hashed password (or GitHub OAuth profile for social login).
                  </li>
                  <li>
                    <strong>Webhook metadata:</strong> HTTP method, path,
                    headers, timestamps, delivery status. In queue mode, request
                    bodies are stored temporarily for retry delivery.
                  </li>
                  <li>
                    <strong>Billing data:</strong> Processed by Stripe. We store
                    your Stripe customer ID and subscription status. We never
                    see or store your full credit card number.
                  </li>
                  <li>
                    <strong>Usage data:</strong> Event counts and connection
                    status for your dashboard. No behavioral analytics or
                    tracking.
                  </li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Encryption in transit */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Lock className="size-5 text-muted-foreground" />
                <CardTitle>Encrypted in transit</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                All connections use TLS (HTTPS) and secure WebSockets (WSS).
                Webhook payloads are encrypted from the moment they leave your
                provider to the moment they reach your local app.
              </p>
            </CardContent>
          </Card>

          {/* Encryption at rest */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Shield className="size-5 text-muted-foreground" />
                <CardTitle>Encrypted at rest</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Data stored in our database (Neon Postgres) is encrypted at rest
                using AES-256. This includes event metadata, headers, and any
                temporarily queued request bodies. Passwords are hashed with
                Argon2.
              </p>
            </CardContent>
          </Card>

          {/* Passthrough mode */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Eye className="size-5 text-muted-foreground" />
                <CardTitle>Passthrough mode: zero body storage</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                In passthrough mode, the request body flows through memory only.
                It is proxied directly to your app over the WebSocket and is{" "}
                <strong>never written to disk or database</strong>. Only headers
                and metadata are stored for debugging.
              </p>
            </CardContent>
          </Card>

          {/* Queue mode */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Trash2 className="size-5 text-muted-foreground" />
                <CardTitle>Queue mode: stored temporarily</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                In queue mode, the request body is stored temporarily so we can
                retry delivery if your app is offline. The body is encrypted at
                rest and <strong>deleted after successful delivery</strong>.
                Headers and metadata are retained for debugging within the
                retention window.
              </p>
            </CardContent>
          </Card>

          {/* Data retention */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-muted-foreground" />
                <CardTitle>Data retention</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  Event metadata (headers, path, status, timestamps)
                  auto-expires after <strong>30 days</strong>.
                </p>
                <p>
                  Account data is retained while your account is active. If you
                  delete your account, all associated data (events, routes,
                  listeners, sessions) is permanently deleted within 30 days.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Cookies */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Cookie className="size-5 text-muted-foreground" />
                <CardTitle>Cookies</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  We use a single session cookie (<code>sh_session</code>) for
                  authentication. It is HttpOnly, Secure, and SameSite=Lax. It
                  expires when your session ends.
                </p>
                <p>
                  We do not use advertising cookies, tracking cookies, or any
                  third-party cookie-based analytics.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* No tracking */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Ban className="size-5 text-muted-foreground" />
                <CardTitle>No third-party analytics or tracking</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                We do not use any third-party analytics, tracking pixels, or
                advertising scripts. No data is shared with analytics providers,
                ad networks, or data brokers.
              </p>
            </CardContent>
          </Card>

          {/* Your rights */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <UserCheck className="size-5 text-muted-foreground" />
                <CardTitle>Your rights</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>You have the right to:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>
                    <strong>Access</strong> the personal data we hold about you
                  </li>
                  <li>
                    <strong>Correct</strong> inaccurate personal data
                  </li>
                  <li>
                    <strong>Delete</strong> your account and all associated data
                  </li>
                  <li>
                    <strong>Export</strong> your event data via the API
                  </li>
                  <li>
                    <strong>Object</strong> to processing based on legitimate
                    interest
                  </li>
                </ul>
                <p>
                  To exercise any of these rights, contact us at{" "}
                  <a
                    href="mailto:support@simplehook.dev"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    support@simplehook.dev
                  </a>
                  . We respond within 30 days.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Third-party services */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-muted-foreground" />
                <CardTitle>Third-party services</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>We use a limited number of third-party services:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>
                    <strong>Stripe</strong> — Payment processing. Subject to{" "}
                    <a
                      href="https://stripe.com/privacy"
                      className="underline underline-offset-4 hover:text-foreground"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Stripe's Privacy Policy
                    </a>
                    .
                  </li>
                  <li>
                    <strong>Neon</strong> — Database hosting (Postgres).
                    Encrypted at rest.
                  </li>
                  <li>
                    <strong>Fly.io</strong> — Server hosting.
                  </li>
                  <li>
                    <strong>Resend</strong> — Transactional email (password
                    resets, trial reminders).
                  </li>
                  <li>
                    <strong>GitHub</strong> — OAuth login (optional, only if you
                    choose to sign in with GitHub).
                  </li>
                </ul>
                <p>
                  We <strong>never sell or share</strong> your webhook data with
                  third parties. Your data is used solely to provide the
                  simplehook service.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Changes & Terms link */}
          <div className="mt-4 flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <p>
              This policy may be updated from time to time. Material changes
              will be communicated via email.
            </p>
            <p>
              See also our{" "}
              <Link
                to="/terms"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
