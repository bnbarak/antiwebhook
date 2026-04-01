---
name: CI integration test failures
description: E2E integration tests failing - events not being stored, likely due to schema changes
type: project
---

E2E integration tests in CI are failing after the schema changes (migrations 008-010).
7 tests fail with "events.length >= 1" being false — events aren't being stored.

**Root cause investigation needed:**
- The default (unmatched) route mode is queue, stored_body should be set
- subscription_quantity column was added to projects
- listener_id column was added to routes
- github_id column was added to users
- All `SELECT *` queries return these new columns, which must match struct fields

**Why:** Need to verify the Rust server starts cleanly in CI with the fresh Postgres + all migrations.

**How to apply:** Check server startup logs in CI, verify struct fields match migration columns.
