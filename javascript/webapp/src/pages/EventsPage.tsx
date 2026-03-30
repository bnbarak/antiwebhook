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
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [pathFilter, setPathFilter] = useState("");
  const [replayingId, setReplayingId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    try {
      const data = await api.events.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        path: pathFilter || undefined,
        limit: 50,
      });
      setEvents(data);
    } catch {
      // silently fail for polling
    } finally {
      setLoading(false);
    }
  }, [statusFilter, pathFilter]);

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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
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

        <Input
          placeholder="Filter by path..."
          value={pathFilter}
          onChange={(e) => setPathFilter(e.target.value)}
          className="h-7 w-[200px] text-sm"
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Path</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Response</TableHead>
              <TableHead className="text-right">Actions</TableHead>
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
    </div>
  );
}
