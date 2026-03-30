CREATE TABLE projects (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    api_key     TEXT NOT NULL UNIQUE,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    active      BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE routes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path_prefix TEXT NOT NULL,
    mode        TEXT NOT NULL CHECK (mode IN ('passthrough', 'queue')) DEFAULT 'queue',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, path_prefix)
);

CREATE TABLE events (
    id              TEXT PRIMARY KEY,
    project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path            TEXT NOT NULL,
    method          TEXT NOT NULL,
    headers         JSONB NOT NULL,
    body            BYTEA,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
    response_status SMALLINT,
    response_body   BYTEA,
    attempts        SMALLINT NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ
);

CREATE INDEX idx_events_project_created ON events(project_id, created_at DESC);
CREATE INDEX idx_events_pending_retry ON events(status, next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_projects_api_key ON projects(api_key);
