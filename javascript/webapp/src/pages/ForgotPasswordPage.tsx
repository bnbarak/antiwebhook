import { useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Something went wrong");
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2.5">
          <img src="/logos/simplehook-mark-dark.svg" alt="simplehook" className="size-8 rounded-lg" />
          <span className="font-mono text-[15px] font-medium tracking-[0.04em]">
            simplehook
          </span>
        </Link>

        <div className="rounded-xl border border-border bg-card p-6 ring-1 ring-foreground/10">
          {submitted ? (
            <>
              <h1 className="mb-1 text-base font-medium">Check your email</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                If an account exists for {email}, we sent a password reset link.
                It expires in 1 hour.
              </p>
              <Link to="/login">
                <Button variant="outline" className="w-full">
                  Back to sign in
                </Button>
              </Link>
            </>
          ) : (
            <>
              <h1 className="mb-1 text-base font-medium">Forgot password</h1>
              <p className="mb-6 text-sm text-muted-foreground">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              {error && (
                <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    autoFocus
                  />
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
                  Send reset link
                </Button>
              </form>
            </>
          )}

          <div className="mt-5 border-t border-border pt-4">
            <p className="text-center text-sm text-muted-foreground">
              Remember your password?{" "}
              <Link
                to="/login"
                className="font-medium text-foreground underline underline-offset-2 hover:text-foreground/80"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
