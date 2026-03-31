CREATE TABLE listeners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    listener_id TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT listener_id_format CHECK (listener_id ~ '^[a-z0-9_-]{1,12}$'),
    CONSTRAINT listener_id_unique UNIQUE (project_id, listener_id)
);
ALTER TABLE events ADD COLUMN IF NOT EXISTS listener_id TEXT;
