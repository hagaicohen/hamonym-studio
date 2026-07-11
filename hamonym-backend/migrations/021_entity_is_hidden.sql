-- Entity manager's own reversible "hide entity" toggle — distinct from
-- soft-delete (deleted_at, migration 020): hiding just flips visibility,
-- the entity and its data are otherwise untouched and can be unhidden.
ALTER TABLE entities ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;
