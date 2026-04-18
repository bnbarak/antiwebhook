-- Track admin impersonation sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonated_by TEXT REFERENCES users(id);
