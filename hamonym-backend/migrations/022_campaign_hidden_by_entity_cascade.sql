-- Tracks whether a campaign's is_hidden=true was set as a side effect of
-- hiding its parent entity (migration 021), as opposed to being hidden
-- independently by the campaign owner. Lets entity-unhide restore exactly
-- the campaigns it cascaded onto, without surprise-publishing ones that
-- were already hidden before the entity was hidden.
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS hidden_by_entity_cascade BOOLEAN NOT NULL DEFAULT false;
