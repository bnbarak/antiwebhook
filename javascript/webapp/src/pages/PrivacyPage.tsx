import { Shield, Lock, Eye, Trash2, Globe, Ban } from "lucide-react";
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
            Privacy & Security
          </h1>
          <p className="max-w-[560px] text-[17px] font-light leading-relaxed text-muted-foreground">
            How simplehook handles your webhook data. The short version: we
            store as little as possible and never share it.
          </p>
        </div>
      </section>

      <SectionDivider />

      {/* Content */}
      <section className="px-6 py-16">
        <div className="mx-auto flex max-w-[960px] flex-col gap-6">
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
                Webhook payloads are encrypted from the moment they leave
                your provider to the moment they reach your local app.
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
                Data stored in our database (Neon Postgres) is encrypted at
                rest using AES-256. This includes event metadata, headers,
                and any temporarily queued request bodies.
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
                In passthrough mode, the request body flows through memory
                only. It is proxied directly to your app over the WebSocket
                and is <strong>never written to disk or database</strong>.
                Only headers and metadata are stored for debugging and replay.
              </p>
            </CardContent>
          </Card>

          {/* Queue mode */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <Trash2 className="size-5 text-muted-foreground" />
                <CardTitle>Queue mode: stored temporarily, then deleted</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                In queue mode, the request body is stored temporarily so we
                can retry delivery if your app is offline. The body is
                encrypted at rest and{" "}
                <strong>deleted after successful delivery</strong>. Headers
                and metadata are retained for debugging.
              </p>
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
                advertising scripts. There are no cookies beyond what is
                required for authentication.
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
                  We <strong>never sell or share</strong> your webhook data
                  with third parties. Your data is used solely to provide the
                  simplehook service.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
