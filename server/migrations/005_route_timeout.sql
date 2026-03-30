-- Configurable timeout per route (seconds)
ALTER TABLE routes ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 30;
