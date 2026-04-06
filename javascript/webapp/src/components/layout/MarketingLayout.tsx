import { Link, Outlet, useLocation, useSearchParams } from "react-router-dom";
import { Webhook } from "lucide-react";

export function MarketingLayout() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isHome = location.pathname === "/";
  const mode = searchParams.get("mode");

  // Carry ?mode= across nav links
  const modeQuery = mode ? `?mode=${mode}` : "";

  return (
    <div className="min-h-svh bg-background">
      {/* Sticky nav */}
      <nav className="sticky top-0 z-50 border-b border-border bg-card/90 supports-backdrop-filter:backdrop-blur-[20px]">
        <div className="mx-auto flex h-14 max-w-[960px] items-center justify-between px-6">
          {/* Logo */}
          <Link to={`/${modeQuery}`} className="flex items-center gap-2.5">
            <img src="/logos/simplehook-mark-dark.svg" alt="simplehook" className="size-7 rounded-md" />
            <span className="font-mono text-sm font-medium tracking-[0.04em]">
              simplehook
            </span>
          </Link>

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
            <Link to={`/docs${modeQuery}`} className="px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground rounded-md">
              Docs
            </Link>
            <Link
              to="/login"
              className="ml-1.5 rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-85"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <Outlet />

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-6 py-8">
          <div className="flex flex-wrap items-center gap-5">
            <Link to={`/docs${modeQuery}`} className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              Docs
            </Link>
            <Link to="/privacy" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              Terms
            </Link>
            <a href="https://github.com/bnbarak/antiwebhook" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/simplehook" className="text-xs text-text-tertiary transition-colors hover:text-foreground">
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
