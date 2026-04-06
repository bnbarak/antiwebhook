import { FileText, AlertTriangle, Scale, Clock, Ban, CreditCard, RefreshCw, Globe } from "lucide-react";
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

export function TermsPage() {
  return (
    <div>
      {/* Hero */}
      <section className="px-6 pb-16 pt-20">
        <div className="mx-auto max-w-[960px]">
          <Kicker>Legal</Kicker>
          <h1 className="mb-4 text-[clamp(28px,4vw,38px)] font-normal leading-[1.15] tracking-[-0.015em]">
            Terms of Service
          </h1>
          <p className="max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            Last updated: April 6, 2026. By using simplehook, you agree to
            these terms.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Content */}
      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
          {/* Service description */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <FileText className="size-5 text-muted-foreground" />
                <CardTitle>1. Service Description</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  simplehook ("the Service") is a webhook forwarding platform
                  operated by simplehook ("we", "us", "our"). The Service
                  receives webhook HTTP requests from third-party providers and
                  forwards them to your locally running applications via
                  outbound connections.
                </p>
                <p>
                  The Service is designed for <strong>development and testing
                  purposes</strong>. It may also be used in production
                  environments, but the limitations described in these terms
                  apply in all contexts.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Best-effort delivery */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <AlertTriangle className="size-5 text-muted-foreground" />
                <CardTitle>2. Best-Effort Delivery — No Guarantee</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  <strong>
                    The Service provides webhook forwarding on a best-effort
                    basis. We do not guarantee that any specific webhook will be
                    delivered, delivered on time, or delivered in order.
                  </strong>
                </p>
                <p>
                  Webhooks may be lost, delayed, or fail to deliver due to
                  factors including but not limited to: network interruptions,
                  your application being offline or unreachable, server
                  maintenance, capacity limits, software defects, third-party
                  provider issues, or force majeure events.
                </p>
                <p>
                  In queue mode, the Service will attempt up to 5 retries with
                  exponential backoff. If all retry attempts fail, the event is
                  marked as failed. <strong>We are not liable for any
                  consequences arising from undelivered, delayed, duplicated,
                  or out-of-order webhooks.</strong>
                </p>
                <p>
                  You are responsible for implementing your own idempotency,
                  deduplication, and error handling in your application. Do not
                  rely on simplehook as the sole mechanism for critical business
                  logic that requires guaranteed exactly-once delivery.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Service availability */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Clock className="size-5 text-muted-foreground" />
                <CardTitle>3. Availability & SLA</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  We strive to maintain high availability but{" "}
                  <strong>
                    do not offer any uptime SLA or service level guarantee
                  </strong>
                  . The Service may be temporarily unavailable due to scheduled
                  maintenance, infrastructure issues, or other factors.
                </p>
                <p>
                  We reserve the right to modify, suspend, or discontinue any
                  part of the Service at any time, with or without notice. We
                  will make reasonable efforts to provide advance notice of
                  significant changes.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Limitation of liability */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Scale className="size-5 text-muted-foreground" />
                <CardTitle>4. Limitation of Liability</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT
                  WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING
                  BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY,
                  FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
                </p>
                <p>
                  TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL
                  SIMPLEHOOK, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE
                  LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                  OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS OF
                  PROFITS, DATA, BUSINESS OPPORTUNITIES, OR GOODWILL, ARISING
                  OUT OF OR IN CONNECTION WITH YOUR USE OF THE SERVICE,
                  REGARDLESS OF WHETHER SUCH DAMAGES WERE FORESEEABLE.
                </p>
                <p>
                  OUR TOTAL AGGREGATE LIABILITY FOR ANY CLAIMS ARISING FROM OR
                  RELATED TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID
                  US IN THE THREE (3) MONTHS PRECEDING THE CLAIM.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Acceptable use */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Ban className="size-5 text-muted-foreground" />
                <CardTitle>5. Acceptable Use</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>You agree not to:</p>
                <ul className="ml-4 list-disc space-y-1.5">
                  <li>
                    Use the Service for any unlawful purpose or to facilitate
                    illegal activity
                  </li>
                  <li>
                    Transmit malicious payloads, malware, or content designed to
                    exploit vulnerabilities
                  </li>
                  <li>
                    Attempt to circumvent rate limits, authentication, or
                    billing controls
                  </li>
                  <li>
                    Use the Service to relay traffic unrelated to webhook
                    forwarding (e.g., as a general-purpose proxy or tunnel)
                  </li>
                  <li>
                    Resell access to the Service without written authorization
                  </li>
                  <li>
                    Send webhook traffic that exceeds reasonable volume for your
                    plan tier
                  </li>
                </ul>
                <p>
                  We reserve the right to suspend or terminate accounts that
                  violate these terms, with or without notice.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Billing */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <CreditCard className="size-5 text-muted-foreground" />
                <CardTitle>6. Billing & Cancellation</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  Paid subscriptions are billed monthly through Stripe. Your
                  subscription renews automatically unless cancelled before the
                  end of the billing period.
                </p>
                <p>
                  You may cancel at any time through your Stripe billing portal.
                  Cancellation takes effect at the end of the current billing
                  period. <strong>We do not offer refunds</strong> for partial
                  billing periods.
                </p>
                <p>
                  Free trials are limited in duration. When a trial expires,
                  webhook forwarding is paused until you subscribe.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Data & privacy */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Globe className="size-5 text-muted-foreground" />
                <CardTitle>7. Data & Privacy</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  Your use of the Service is also governed by our{" "}
                  <Link
                    to="/privacy"
                    className="underline underline-offset-4 hover:text-foreground"
                  >
                    Privacy Policy
                  </Link>
                  . Webhook payloads may contain sensitive data from third-party
                  providers. You are responsible for ensuring that your use of
                  the Service complies with applicable data protection laws and
                  any agreements you have with those providers.
                </p>
                <p>
                  We act as a data processor on your behalf. We do not inspect,
                  analyze, or share webhook payload contents for any purpose
                  other than delivering them to your application.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Changes to terms */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <RefreshCw className="size-5 text-muted-foreground" />
                <CardTitle>8. Changes to These Terms</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm text-muted-foreground">
                <p>
                  We may update these terms from time to time. Material changes
                  will be communicated via email or a notice in the dashboard.
                  Continued use of the Service after changes take effect
                  constitutes acceptance of the revised terms.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Contact */}
          <div className="mt-4 text-center text-xs text-muted-foreground">
            Questions about these terms? Contact us at{" "}
            <a
              href="mailto:support@simplehook.dev"
              className="underline underline-offset-4 hover:text-foreground"
            >
              support@simplehook.dev
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
