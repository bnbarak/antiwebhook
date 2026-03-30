-- Soft delete for routes
ALTER TABLE routes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Update unique constraint to only apply to non-deleted routes
DROP INDEX IF EXISTS routes_project_id_path_prefix_key;
CREATE UNIQUE INDEX idx_routes_active_unique
  ON routes(project_id, path_prefix) WHERE deleted_at IS NULL;
