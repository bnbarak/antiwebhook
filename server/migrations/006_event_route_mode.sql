-- Store the matched route mode on each event
ALTER TABLE events ADD COLUMN IF NOT EXISTS route_mode TEXT;
