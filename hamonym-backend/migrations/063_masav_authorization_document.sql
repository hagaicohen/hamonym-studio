-- MASAV signed bank authorization document (Billing v1 Bundle 2 follow-up,
-- MASAV setup UX, 2026-09-03).
--
-- The association uploads a scan/PDF of the bank-signed direct-debit
-- authorization ("אישור הרשאה לחיוב באמצעות מס״ב") as part of configuring
-- its MASAV instrument. Stored directly on entity_masav_details as bytea,
-- same private-document pattern already used for entities.association_
-- certificate_data / entities.tax_document_data (entities.service.js) --
-- no public URL, served only through an authenticated Super Admin download
-- route, reusing the existing document-storage convention rather than
-- inventing a new one (no Supabase Storage here -- that path is used only
-- for the public entity logo).
--
-- Deliberately does NOT touch the `authorized` boolean or its CHECK
-- constraint (migration 060): uploading this document is evidence a Super
-- Admin can review, never itself an authorization event. `authorized` stays
-- exactly what it already was -- an explicit, separate Super Admin action
-- via masav-config.service.js#authorize.
ALTER TABLE entity_masav_details
  ADD COLUMN IF NOT EXISTS authorization_document_name        TEXT,
  ADD COLUMN IF NOT EXISTS authorization_document_mime         TEXT,
  ADD COLUMN IF NOT EXISTS authorization_document_data         BYTEA,
  ADD COLUMN IF NOT EXISTS authorization_document_uploaded_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS authorization_document_uploaded_by  BIGINT REFERENCES users(id);
