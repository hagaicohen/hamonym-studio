-- PROPOSAL ONLY. Never deletes company records to make rollback possible.
BEGIN;
LOCK TABLE public.entities IN ACCESS EXCLUSIVE MODE;
DO $$
DECLARE item record; metadata jsonb;
BEGIN
  IF EXISTS (SELECT 1 FROM public.entities WHERE entity_type = 'company') THEN
    RAISE EXCEPTION 'Company records exist (including deleted): rollback refused; preserve history';
  END IF;
  FOR item IN
    SELECT c.conname, obj_description(c.oid, 'pg_constraint') AS description
    FROM pg_constraint c WHERE c.conrelid='public.entities'::regclass AND c.contype='c'
      AND left(COALESCE(obj_description(c.oid, 'pg_constraint'), ''),
        length('HAMONYM_COMPANY_V1:')) = 'HAMONYM_COMPANY_V1:'
  LOOP
    metadata := substring(item.description FROM length('HAMONYM_COMPANY_V1:') + 1)::jsonb;
    EXECUTE format('ALTER TABLE public.entities DROP CONSTRAINT %I', item.conname);
    EXECUTE format('ALTER TABLE public.entities ADD CONSTRAINT %I %s',
      item.conname, metadata->>'definition');
    EXECUTE format('COMMENT ON CONSTRAINT %I ON public.entities IS %L',
      item.conname, metadata->>'comment');
    -- Restore original NOT VALID status if present in captured DDL. Otherwise
    -- PostgreSQL validates the original rule; incompatible rows abort all rollback.
  END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.hamonym_identifier_type(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT CASE value
  WHEN 'association' THEN 'association_number'
  WHEN 'chalatz' THEN 'company_number'
  WHEN 'political_party_new' THEN 'party_number'
  WHEN 'political_party_registered' THEN 'party_number'
  WHEN 'sole_exempt' THEN 'business_number'
  WHEN 'sole_registered' THEN 'business_number'
 END
$$;
COMMIT;
