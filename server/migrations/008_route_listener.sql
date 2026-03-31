-- Routes can optionally target a specific agent (listener).
-- When set, webhooks matching this route are delivered only to that agent.
ALTER TABLE routes ADD COLUMN listener_id TEXT DEFAULT NULL;
