import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 10) {
      setError("Password must be at least 10 characters");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("Missing reset token");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Reset failed");
      }
      navigate("/login", {
        replace: true,
        state: { message: "Password reset successfully. Please sign in." },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
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
            <h1 className="mb-1 text-base font-medium">Invalid link</h1>
            <p className="mb-6 text-sm text-muted-foreground">
              This password reset link is invalid or has expired.
            </p>
            <Link to="/forgot-password">
              <Button variant="outline" className="w-full">
                Request a new link
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
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
          <h1 className="mb-1 text-base font-medium">Reset password</h1>
          <p className="mb-6 text-sm text-muted-foreground">
            Enter your new password below.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                placeholder="At least 10 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 size-4 animate-spin" />}
              Reset password
            </Button>
          </form>

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
