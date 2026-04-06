-- Agent pull cursors: tracks last-consumed event per project+listener_id
CREATE TABLE agent_cursors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(id),
    listener_id TEXT NOT NULL DEFAULT 'default',
    last_event_id TEXT,
    last_pulled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(project_id, listener_id)
);

CREATE INDEX idx_agent_cursors_lookup
    ON agent_cursors(project_id, listener_id);
