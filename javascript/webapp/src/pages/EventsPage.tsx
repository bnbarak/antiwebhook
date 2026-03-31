import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw, RotateCcw, Filter } from "lucide-react";
import { api, type WebhookEvent } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { StatusBadge } from "@/components/shared/StatusBadge.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { toast } from "sonner";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function EventsPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pathFilter, setPathFilter] = useState("");
  const [routeFilter, setRouteFilter] = useState("all");
  const [modeFilter, setModeFilter] = useState("all");
  const [routes, setRoutes] = useState<{ path_prefix: string }[]>([]);
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const pageSize = 25;

  // Fetch routes for the dropdown filter
  useEffect(() => {
    api.routes.list().then((r) => setRoutes(r)).catch(() => {});
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      const result = await api.events.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        path: routeFilter !== "all" ? routeFilter : pathFilter || undefined,
        route_mode: modeFilter === "all" ? undefined : modeFilter,
        limit: pageSize,
        offset: page * pageSize,
      });
      setEvents(result.data);
      setTotal(result.total);
    } catch {
      // silently fail for polling
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pathFilter, routeFilter, modeFilter, page]);

  // Initial fetch + polling
  useEffect(() => {
    fetchEvents();
    const interval = setInterval(fetchEvents, 5000);
    return () => clearInterval(interval);
  }, [fetchEvents]);

  const handleReplay = async (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    setReplayingId(eventId);
    try {
      await api.events.replay(eventId);
      toast.success("Event replayed");
      fetchEvents();
    } catch {
      toast.error("Failed to replay event");
    } finally {
      setReplayingId(null);
    }
  };

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-lg font-medium">Events</h1>
        <p className="text-sm text-muted-foreground">
          Webhook events received by your project.
        </p>
      </div>

      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <Filter className="size-3.5 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Select value={modeFilter} onValueChange={(v) => { setModeFilter(v); setPage(0); }}>
          <SelectTrigger size="sm" className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All modes</SelectItem>
            <SelectItem value="passthrough">Passthrough</SelectItem>
            <SelectItem value="queue">Queue</SelectItem>
            <SelectItem value="unmatched">No route</SelectItem>
          </SelectContent>
        </Select>

        {routes.length > 0 && (
          <Select value={routeFilter} onValueChange={(v) => { setRouteFilter(v); setPage(0); }}>
            <SelectTrigger size="sm" className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All routes</SelectItem>
              {routes.map((r) => (
                <SelectItem key={r.path_prefix} value={r.path_prefix}>
                  {r.path_prefix}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input
          placeholder="Search paths..."
          value={pathFilter}
          onChange={(e) => {
            setPathFilter(e.target.value);
            setRouteFilter("all");
            setPage(0);
          }}
          className="h-7 w-[180px] text-sm"
        />

        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setLoading(true);
            fetchEvents();
          }}
          className="ml-auto gap-1.5"
        >
          <RefreshCw className="size-3" />
          Refresh
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="mb-1 text-sm font-medium text-muted-foreground">
            No events yet
          </p>
          <p className="text-xs text-text-tertiary">
            Webhook events will appear here when received.
          </p>
        </div>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">Time</TableHead>
              <TableHead className="w-[70px]">Method</TableHead>
              <TableHead className="w-[200px]">Path</TableHead>
              <TableHead className="w-[90px]">Mode</TableHead>
              <TableHead className="w-[90px]">Status</TableHead>
              <TableHead className="w-[70px]">Response</TableHead>
              <TableHead className="w-[50px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((event) => (
              <TableRow
                key={event.id}
                className="cursor-pointer"
                onClick={() => navigate(`/events/${event.id}`)}
              >
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {timeAgo(event.created_at)}
                </TableCell>
                <TableCell>
                  <span className="inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">
                    {event.method}
                  </span>
                </TableCell>
                <TableCell className="max-w-[200px] truncate font-mono text-xs">
                  {event.path}
                </TableCell>
                <TableCell>
                  {event.route_mode ? (
                    <span className={`inline-flex rounded px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase ${
                      event.route_mode === "passthrough"
                        ? "bg-status-blue-bg text-status-blue-text"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {event.route_mode}
                    </span>
                  ) : (
                    <span className="inline-flex rounded bg-status-amber-bg px-1.5 py-0.5 font-mono text-[9px] font-medium text-status-amber-text">
                      no route
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={event.status} />
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {event.response_status ?? "-"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => handleReplay(e, event.id)}
                    disabled={replayingId === event.id}
                    title="Replay event"
                  >
                    <RotateCcw className={replayingId === event.id ? "animate-spin" : ""} />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination */}
      {total > pageSize && (
        <div className="mt-4 flex items-center justify-between">
          <span className="font-mono text-xs text-muted-foreground">
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * pageSize >= total}
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
