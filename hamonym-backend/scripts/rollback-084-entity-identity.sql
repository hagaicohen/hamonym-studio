-- Run in ONE transaction with writers paused. Roll back identity-aware code too.
-- New data may be valid under the new namespaces but incompatible with the old
-- global raw-number index. Never modify/merge data to force rollback through.
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.entities WHERE deleted_at IS NULL
   AND registration_number IS NOT NULL GROUP BY registration_number HAVING count(*) > 1) THEN
   RAISE EXCEPTION 'Rollback blocked: raw numbers now repeat across identity namespaces';
 END IF;
END $$;
CREATE UNIQUE INDEX entities_registration_number_key ON public.entities(registration_number) WHERE deleted_at IS NULL;
DROP INDEX public.entities_legal_identity_unique;
ALTER TABLE public.entities DROP CONSTRAINT entities_identifier_type_supported,
 DROP COLUMN normalized_registration_number, DROP COLUMN identifier_type, DROP COLUMN registration_jurisdiction;
DROP FUNCTION public.hamonym_identifier_type(text);
DROP FUNCTION public.hamonym_normalize_registration(text);
