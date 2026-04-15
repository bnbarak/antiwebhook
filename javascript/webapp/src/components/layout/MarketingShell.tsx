export function MarketingShell({ children }: { children: React.ReactNode }) {
  const isHome = window.location.pathname === "/";
  const mode = new URLSearchParams(window.location.search).get("mode");
  const modeQuery = mode ? `?mode=${mode}` : "";

  return (
    <div className="min-h-svh bg-background">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card/90 supports-backdrop-filter:backdrop-blur-[20px]">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
          {/* Logo */}
          <a href={`/${modeQuery}`} className="flex items-center gap-2.5">
            <img src="/logos/simplehook-mark-dark.svg" alt="simplehook" className="size-7 rounded-md" />
            <span className="font-mono text-sm font-medium tracking-[0.04em]">
              simplehook
            </span>
          </a>

          {/* Nav links */}
          <div className="flex items-center gap-1">
            {!isHome && (
              <a href={`/${modeQuery}#`} className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground rounded-md">
                Home
              </a>
            )}
            <a href={`/${modeQuery}#how-it-works`} className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground rounded-md">
              How it works
            </a>
            <a href={`/${modeQuery}#pricing`} className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground rounded-md">
              Pricing
            </a>
            <a href={`/docs${modeQuery}`} className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground rounded-md">
              Docs
            </a>
            <a
              href="/login"
              className="ml-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              Dashboard
            </a>
          </div>
        </div>
      </nav>

      {/* Content */}
      {children}

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div className="flex flex-wrap items-center gap-5">
            <a href={`/docs${modeQuery}`} className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              Docs
            </a>
            <a href="/faq" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              FAQ
            </a>
            <a href="/privacy" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              Privacy
            </a>
            <a href="/terms" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              Terms
            </a>
            <a href="https://github.com/bnbarak/antiwebhook" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/@simplehook/express" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              npm
            </a>
          </div>
          <span className="text-xs text-text-tertiary">
            simplehook
          </span>
        </div>
      </footer>
    </div>
  );
}
