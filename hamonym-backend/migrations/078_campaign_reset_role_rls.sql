-- Supplement 077 for existing Supabase RLS. No financial rows or existing policies change.
-- The NOLOGIN reset role is not available through SET ROLE or inherited runtime privileges.
DO $$ DECLARE t text; BEGIN
 IF pg_has_role(current_user,'hamonym_campaign_reset','SET') OR pg_has_role(current_user,'hamonym_campaign_reset','USAGE') THEN
  RAISE EXCEPTION 'Reset role runtime privileges must remain revoked';
 END IF;
 FOREACH t IN ARRAY ARRAY['users','campaigns','billing_accounts','recurring_instructions',
 'registration_participants','registration_orders','email_logs','receipts','masav_collection_proposals',
 'statement_adjustments','statement_components','payments','collection_attempts','donations','statements',
 'payment_exceptions','reconciliation_findings'] LOOP
  EXECUTE format('CREATE POLICY campaign_test_reset_private_role ON public.%I TO hamonym_campaign_reset USING (true) WITH CHECK (true)',t);
 END LOOP;
END $$;
