# Database Migrations

## Rules

1. **NEVER modify a migration that has already been deployed.** sqlx tracks checksums. If you change the content of an existing migration file, the server will panic on startup with `VersionMismatch`.

2. **Always add new migrations as the next numbered file.** Use the pattern `NNN_description.sql`.

3. **Use `IF NOT EXISTS` / `IF EXISTS` for safety.** Migrations should be idempotent where possible.

4. **Drop constraints with `ALTER TABLE ... DROP CONSTRAINT`, not `DROP INDEX`.** PostgreSQL unique constraints create backing indexes, but you must drop the constraint, not the index.

5. **Test migrations locally before deploying:**
   ```bash
   # Reset local DB
   docker compose down -v && docker compose up postgres -d

   # Run server (migrations auto-apply)
   cd server && cargo run
   ```

6. **Check Neon migration state if deploy fails:**
   ```bash
   psql "$DATABASE_URL" -c "SELECT version, description FROM _sqlx_migrations ORDER BY version;"
   ```

7. **If a migration fails on Neon:** The failed migration is NOT recorded in `_sqlx_migrations`. Fix the SQL, rebuild, and redeploy. No need to delete migration records.

## Current migrations

| # | File | Description |
|---|------|-------------|
| 1 | `001_init.sql` | projects, routes, events tables |
| 2 | `002_auth.sql` | users, sessions tables, user_id on projects |
| 3 | `003_billing_trial.sql` | trial tracking, billing_status, email_log |
| 4 | `004_soft_delete_routes.sql` | deleted_at on routes, partial unique index |
