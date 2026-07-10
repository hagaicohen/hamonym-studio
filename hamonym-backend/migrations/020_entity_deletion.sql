-- Soft-delete support for entities (entity manager's own "delete entity"
-- action). Platform admin hard-delete does not need columns — it removes
-- the row entirely.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE entities ADD COLUMN IF NOT EXISTS deleted_by BIGINT REFERENCES users(id);
