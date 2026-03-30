-- Trial and billing tracking

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_reminder_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_expired_sent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_status TEXT NOT NULL DEFAULT 'trial'
  CHECK (billing_status IN ('trial', 'trial_expired', 'active', 'cancelled', 'past_due'));
ALTER TABLE projects ADD COLUMN IF NOT EXISTS subscription_period_end TIMESTAMPTZ;

-- Set trial_ends_at for existing users (give them 24h from now)
UPDATE users SET trial_ends_at = now() + interval '24 hours' WHERE trial_ends_at IS NULL;

-- Email audit log
CREATE TABLE IF NOT EXISTS email_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL,
  resend_id TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_trial ON users(trial_ends_at) WHERE trial_ends_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_billing ON projects(billing_status);
