-- Local preparation only. Shared application requires explicit migration approval.
-- Run the whole file in ONE transaction, before deploying identity-aware code.
CREATE FUNCTION public.hamonym_normalize_registration(value text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT NULLIF(regexp_replace(value, '[[:space:] ​‌‍﻿\-‐‑‒–—―−]', '', 'g'), '')
$$;
CREATE FUNCTION public.hamonym_identifier_type(value text) RETURNS text
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
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.entities
   WHERE public.hamonym_identifier_type(entity_type) IS NULL) THEN
   RAISE EXCEPTION 'Unmapped entity type: review identity mapping before migration';
 END IF;
 IF EXISTS (SELECT 1 FROM public.entities WHERE deleted_at IS NULL
   AND public.hamonym_normalize_registration(registration_number) IS NOT NULL
   GROUP BY public.hamonym_identifier_type(entity_type), public.hamonym_normalize_registration(registration_number)
   HAVING count(*) > 1) THEN
   RAISE EXCEPTION 'Normalized legal identities collide: no records were merged';
 END IF;
END $$;
ALTER TABLE public.entities
 ADD COLUMN registration_jurisdiction text GENERATED ALWAYS AS ('IL'::text) STORED,
 ADD COLUMN identifier_type text GENERATED ALWAYS AS (public.hamonym_identifier_type(entity_type)) STORED,
 ADD COLUMN normalized_registration_number text GENERATED ALWAYS AS (public.hamonym_normalize_registration(registration_number)) STORED,
 ADD CONSTRAINT entities_identifier_type_supported CHECK(identifier_type IS NOT NULL);
CREATE UNIQUE INDEX entities_legal_identity_unique
 ON public.entities(registration_jurisdiction, identifier_type, normalized_registration_number)
 WHERE deleted_at IS NULL AND normalized_registration_number IS NOT NULL;
-- Only remove the old index after the replacement has succeeded.
ALTER TABLE public.entities DROP CONSTRAINT IF EXISTS entities_registration_number_key;
DROP INDEX IF EXISTS public.entities_registration_number_key;
