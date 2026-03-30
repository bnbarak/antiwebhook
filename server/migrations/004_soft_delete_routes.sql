-- Soft delete for routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Drop the old unique constraint (it's a constraint, not just an index)
ALTER TABLE routes DROP CONSTRAINT IF EXISTS routes_project_id_path_prefix_key;

-- New unique index only on active (non-deleted) routes
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_active_unique
  ON routes(project_id, path_prefix) WHERE deleted_at IS NULL;
