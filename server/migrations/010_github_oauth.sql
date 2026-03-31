-- Support GitHub OAuth login (password_hash becomes optional for OAuth users)
ALTER TABLE users ADD COLUMN IF NOT EXISTS github_id TEXT UNIQUE;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash SET DEFAULT '';
