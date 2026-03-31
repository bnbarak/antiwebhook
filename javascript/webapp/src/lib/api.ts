// ── Types ──────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  api_key: string;
  webhook_base_url: string;
  active: boolean;
  connected: boolean;
  billing_status: string;
  trial_ends_at?: string;
}

export interface WebhookEvent {
  id: string;
  project_id: string;
  route_id: string | null;
  method: string;
  path: string;
  headers: Record<string, string>;
  body: string | null;
  status: "queued" | "pending" | "delivered" | "failed";
  response_status: number | null;
  response_body: string | null;
  response_headers: Record<string, string> | null;
  route_mode: string | null;
  attempts: number;
  next_retry_at: string | null;
  created_at: string;
  delivered_at: string | null;
}

export interface Route {
  id: string;
  project_id: string;
  path_prefix: string;
  mode: "queue" | "passthrough";
  timeout_seconds: number;
  created_at: string;
}

export interface BillingInfo {
  plan: string;
  status: string;
  current_period_end: string | null;
  checkout_url: string | null;
  portal_url: string | null;
}

export interface BillingStatus {
  billing_status: string;
  trial_ends_at: string | null;
  trial_hours_remaining: number | null;
  has_subscription: boolean;
}

export interface TimeseriesBucket {
  time: string;
  total: number;
  delivered: number;
  failed: number;
}

export interface PathCount {
  path: string;
  count: number;
}

export interface StatsResponse {
  total: number;
  delivered: number;
  pending: number;
  failed: number;
  timeseries: TimeseriesBucket[];
  by_path: PathCount[];
}

export type StatsWindow = "1m" | "10m" | "1h" | "1d" | "7d";

export interface EventsFilter {
  status?: string;
  path?: string;
  method?: string;
  route_mode?: string;
  limit?: number;
  offset?: number;
}

// ── Fetch wrapper ──────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, text);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ── API methods ────────────────────────────────────────────────────────

export const api = {
  auth: {
    register(name: string): Promise<Project> {
      return request("/auth/register", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
    },
    me(): Promise<Project> {
      return request("/auth/me");
    },
  },

  stats: {
    get(window: StatsWindow = "1d"): Promise<StatsResponse> {
      return request(`/stats?window=${window}`);
    },
  },

  events: {
    list(filters: EventsFilter = {}): Promise<{
      data: WebhookEvent[];
      total: number;
      limit: number;
      offset: number;
    }> {
      const params = new URLSearchParams();
      if (filters.status) params.set("status", filters.status);
      if (filters.path) params.set("path", filters.path);
      if (filters.method) params.set("method", filters.method);
      if (filters.route_mode) params.set("route_mode", filters.route_mode);
      if (filters.limit) params.set("limit", String(filters.limit));
      if (filters.offset) params.set("offset", String(filters.offset));
      const qs = params.toString();
      return request(`/events${qs ? `?${qs}` : ""}`);
    },
    get(id: string): Promise<WebhookEvent> {
      return request(`/events/${id}`);
    },
    replay(id: string): Promise<WebhookEvent> {
      return request(`/events/${id}/replay`, { method: "POST" });
    },
  },

  routes: {
    list(): Promise<Route[]> {
      return request("/routes");
    },
    listDeleted(): Promise<Route[]> {
      return request("/routes/trash");
    },
    create(data: {
      path_prefix: string;
      mode: "queue" | "passthrough";
      timeout_seconds?: number;
    }): Promise<Route> {
      return request("/routes", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },
    delete(id: string): Promise<void> {
      return request(`/routes/${id}`, { method: "DELETE" });
    },
    restore(id: string): Promise<void> {
      return request(`/routes/${id}/restore`, { method: "POST" });
    },
  },

  billing: {
    getStatus(): Promise<BillingStatus> {
      return request("/billing/status");
    },
    createCheckout(): Promise<{ url: string }> {
      return request("/billing/checkout", { method: "POST" });
    },
    getPortal(): Promise<{ url: string }> {
      return request("/billing/portal", { method: "POST" });
    },
  },

  project: {
    async get(): Promise<Project> {
      const res = await fetch("/auth/me", { credentials: "include" });
      if (!res.ok) throw new ApiError(res.status, "Failed to load project");
      const data = await res.json();
      return data.project;
    },
  },
};
