import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  BookOpen,
  GitBranch,
  LayoutDashboard,
  Radio,
  Settings,
  Webhook,
  LogOut,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils.js";
import { Separator } from "@/components/ui/separator.js";
import { useAuth } from "@/hooks/use-auth.js";
import { TrialBanner } from "@/components/shared/TrialBanner.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/events", label: "Events", icon: Activity },
  { to: "/agents", label: "Agents", icon: Radio },
  { to: "/routes", label: "Routes", icon: GitBranch },
];

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut } = useAuth();

  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";
  const userInitial = userName.charAt(0).toUpperCase();

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Fixed sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-foreground text-background">
            <Webhook className="size-3" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold leading-tight tracking-tight">
              simplehook
            </span>
          </div>
        </div>

        <Separator />

        {/* Nav items */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
          <span className="mb-1 px-2.5 font-mono text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60 small-caps">
            Workspace
          </span>
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const isActive = location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                className={() =>
                  cn(
                    "relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )
                }
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
                )}
                <Icon className="size-4" />
                {label}
              </NavLink>
            );
          })}
          <div className="mt-auto flex flex-col gap-0.5">
            <a
              href="/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <BookOpen className="size-4" />
              Docs
            </a>
            <NavLink
              to="/settings"
              className={() =>
                cn(
                  "relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  location.pathname.startsWith("/settings")
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )
              }
            >
              {location.pathname.startsWith("/settings") && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-primary" />
              )}
              <Settings className="size-4" />
              Settings
            </NavLink>
          </div>
        </nav>

        {/* User menu at bottom */}
        <div className="mt-auto border-t px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-accent">
                <div className="flex size-7 items-center justify-center rounded-full bg-muted font-mono text-xs font-medium text-muted-foreground">
                  {userInitial}
                </div>
                <div className="flex flex-1 flex-col overflow-hidden">
                  <span className="truncate text-sm font-medium leading-tight">
                    {userName}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {userEmail}
                  </span>
                </div>
                <ChevronUp className="size-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="start" className="w-56">
              <div className="px-2 py-1.5">
                <p className="text-sm font-medium">{userName}</p>
                <p className="text-xs text-muted-foreground">{userEmail}</p>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/settings")}>
                <Settings className="mr-2 size-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={async () => {
                  await signOut();
                  navigate("/login");
                }}
                className="text-destructive focus:text-destructive"
              >
                <LogOut className="mr-2 size-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[960px] px-6 py-6">
          <TrialBanner />
          <Outlet />
        </div>
      </main>
    </div>
  );
}
