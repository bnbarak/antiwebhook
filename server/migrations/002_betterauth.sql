-- Auth tables (replaces BetterAuth — native Rust implementation)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link user to project (one user = one project for now)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(id);

-- Drop old BetterAuth tables if they exist
DROP TABLE IF EXISTS verification CASCADE;
DROP TABLE IF EXISTS account CASCADE;
DROP TABLE IF EXISTS session CASCADE;
DROP TABLE IF EXISTS "user" CASCADE;
