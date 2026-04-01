-- Security constraints
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_timeout_range;
ALTER TABLE routes ADD CONSTRAINT routes_timeout_range CHECK (timeout_seconds >= 1 AND timeout_seconds <= 300);
ALTER TABLE users ADD CONSTRAINT users_name_length CHECK (length(name) <= 100);
ALTER TABLE users ADD CONSTRAINT users_email_length CHECK (length(email) <= 255);
