import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, RotateCcw, Copy } from "lucide-react";
import { api, type WebhookEvent } from "@/lib/api.js";
import { Button } from "@/components/ui/button.js";
import { StatusBadge } from "@/components/shared/StatusBadge.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.js";
import { toast } from "sonner";

function JsonViewer({ data }: { data: string | Record<string, string> | null }) {
  if (!data) return <span className="text-xs text-text-tertiary">No data</span>;

  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  return (
    <div className="group relative">
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={handleCopy}
        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
        title="Copy"
      >
        <Copy />
      </Button>
      <pre className="max-h-[400px] overflow-auto rounded-lg bg-[#1a1916] p-4 font-mono text-xs leading-relaxed text-[#d4d0c8]">
        <code>{text}</code>
      </pre>
    </div>
  );
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<WebhookEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.events
      .get(id)
      .then(setEvent)
      .catch(() => toast.error("Event not found"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleReplay = async () => {
    if (!id) return;
    setReplaying(true);
    try {
      const updated = await api.events.replay(id);
      setEvent(updated);
      toast.success("Event replayed");
    } catch {
      toast.error("Failed to replay event");
    } finally {
      setReplaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-muted-foreground">Event not found.</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/events")} className="mt-2">
          Back to events
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Back + header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/events")}
          className="mb-3 -ml-2 gap-1.5 text-muted-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Events
        </Button>

        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="inline-flex rounded bg-muted px-2 py-0.5 font-mono text-xs font-medium">
                {event.method}
              </span>
              <span className="font-mono text-sm">{event.path}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <StatusBadge status={event.status} />
              <span className="font-mono text-xs text-text-tertiary">
                {new Date(event.created_at).toLocaleString()}
              </span>
              {event.attempts > 0 && (
                <span className="font-mono text-xs text-text-tertiary">
                  {event.attempts} attempt{event.attempts !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleReplay}
            disabled={replaying}
            className="gap-1.5"
          >
            <RotateCcw className={replaying ? "animate-spin size-3" : "size-3"} />
            Replay
          </Button>
        </div>
      </div>

      {/* Request / Response tabs */}
      <Tabs defaultValue="request">
        <TabsList variant="line">
          <TabsTrigger value="request">Request</TabsTrigger>
          <TabsTrigger value="response">Response</TabsTrigger>
        </TabsList>

        <TabsContent value="request" className="mt-4 flex flex-col gap-4">
          <div>
            <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Headers
            </h3>
            <JsonViewer data={event.headers} />
          </div>
          <div>
            <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Body
            </h3>
            <JsonViewer data={event.body} />
          </div>
        </TabsContent>

        <TabsContent value="response" className="mt-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Status
            </span>
            <span className="font-mono text-sm font-medium">
              {event.response_status ?? "No response"}
            </span>
          </div>
          {event.response_headers && (
            <div>
              <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
                Headers
              </h3>
              <JsonViewer data={event.response_headers} />
            </div>
          )}
          <div>
            <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-text-tertiary">
              Body
            </h3>
            <JsonViewer data={event.response_body} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
