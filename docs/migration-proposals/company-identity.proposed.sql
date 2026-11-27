-- PROPOSAL ONLY. Execute the complete transaction only after explicit approval.
-- Prerequisite: migration 084; no pilot reset or data deletion is performed here.
BEGIN;
LOCK TABLE public.entities IN ACCESS EXCLUSIVE MODE;

-- Extend only CHECK constraints owned exclusively by entity_type. Preserve
-- their original DDL and comments in constraint metadata for exact rollback.
DO $$
DECLARE
  type_column smallint;
  type_oid oid;
  item record;
  accepts_type boolean;
  needs_extension boolean;
  legal_type text;
  original_comment text;
  metadata jsonb;
  supported constant text[] := ARRAY[
    'association', 'chalatz', 'political_party_new', 'political_party_registered',
    'sole_exempt', 'sole_registered', 'company'
  ];
BEGIN
  SELECT attnum, atttypid INTO type_column, type_oid
  FROM pg_attribute WHERE attrelid = 'public.entities'::regclass
    AND attname = 'entity_type' AND NOT attisdropped;
  IF type_column IS NULL OR type_oid NOT IN ('text'::regtype, 'varchar'::regtype) THEN
    RAISE EXCEPTION 'Expected text/varchar entity_type; enum/domain changes require separate review';
  END IF;
  IF to_regprocedure('public.hamonym_identifier_type(text)') IS NULL
     OR NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
       AND tablename='entities' AND indexname='entities_legal_identity_unique') THEN
    RAISE EXCEPTION 'Migration 084 legal-identity infrastructure is required';
  END IF;

  FOR item IN
    SELECT c.oid, c.conname, c.conkey, c.connoinherit, c.convalidated, c.coninhcount,
      pg_get_expr(c.conbin, c.conrelid) AS expression,
      pg_get_constraintdef(c.oid) AS definition,
      obj_description(c.oid, 'pg_constraint') AS description
    FROM pg_constraint c WHERE c.conrelid='public.entities'::regclass
      AND c.contype='c' AND type_column = ANY(c.conkey)
  LOOP
    IF cardinality(item.conkey) <> 1 OR item.coninhcount > 0 THEN
      RAISE EXCEPTION 'Cross-field constraint % requires targeted review; no constraints were weakened', item.conname;
    END IF;
    needs_extension := false;
    FOREACH legal_type IN ARRAY supported LOOP
      EXECUTE format('SELECT (%s) FROM (SELECT %L::varchar AS entity_type) candidate',
        item.expression, legal_type) INTO accepts_type;
      needs_extension := needs_extension OR accepts_type IS FALSE;
    END LOOP;
    IF NOT needs_extension THEN CONTINUE; END IF;
    IF left(COALESCE(item.description, ''), length('HAMONYM_COMPANY_V1:')) = 'HAMONYM_COMPANY_V1:' THEN
      RAISE EXCEPTION 'Previously extended constraint % was changed; review before replacing rollback metadata', item.conname;
    END IF;
    original_comment := item.description;
    metadata := jsonb_build_object('definition', item.definition, 'comment', original_comment);
    EXECUTE format('ALTER TABLE public.entities DROP CONSTRAINT %I', item.conname);
    EXECUTE format(
      'ALTER TABLE public.entities ADD CONSTRAINT %I CHECK ((%s) OR entity_type = ANY (%L::text[])) %s',
      item.conname, item.expression, supported::text,
      (CASE WHEN item.connoinherit THEN 'NO INHERIT ' ELSE '' END) ||
      (CASE WHEN item.convalidated THEN '' ELSE 'NOT VALID' END));
    EXECUTE format('COMMENT ON CONSTRAINT %I ON public.entities IS %L',
      item.conname, 'HAMONYM_COMPANY_V1:' || metadata::text);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.hamonym_identifier_type(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE value
  WHEN 'association' THEN 'association_number'
  WHEN 'chalatz' THEN 'company_number'
  WHEN 'company' THEN 'company_number'
  WHEN 'political_party_new' THEN 'party_number'
  WHEN 'political_party_registered' THEN 'party_number'
  WHEN 'sole_exempt' THEN 'business_number'
  WHEN 'sole_registered' THEN 'business_number'
 END
$$;
-- Existing 084 generated columns and partial unique index remain unchanged.
-- company and chalatz share company_number in jurisdiction IL.
-- Replacing the function does not recompute stored generated values; no
-- existing legal-type mappings are changed by this proposal.
COMMIT;
