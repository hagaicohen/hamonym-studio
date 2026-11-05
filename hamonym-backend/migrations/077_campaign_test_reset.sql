-- LOCAL PREPARATION ONLY. Requires explicit migration/record-set approval.
-- No data is deleted and no campaign is authorized by applying this migration.
CREATE TEMP TABLE hamonym_reset_migration_guard ON COMMIT DROP AS SELECT txid_current() AS transaction_id;
DO $$ BEGIN
  IF to_regclass('pg_temp.hamonym_reset_migration_guard') IS NULL THEN
    RAISE EXCEPTION 'Migration 077 requires an explicit transaction';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='hamonym_campaign_reset') THEN
    RAISE EXCEPTION 'Unexpected pre-existing reset role';
  END IF;
  CREATE ROLE hamonym_campaign_reset NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
END $$;
-- Temporary DDL membership only; revoked before migration commit.
GRANT hamonym_campaign_reset TO CURRENT_USER WITH SET TRUE;
GRANT hamonym_campaign_reset TO CURRENT_USER WITH INHERIT TRUE;
CREATE SCHEMA campaign_reset_private AUTHORIZATION hamonym_campaign_reset;
REVOKE ALL ON SCHEMA campaign_reset_private FROM PUBLIC;
CREATE TABLE public.campaign_reset_approvals (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id),
  snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
  approved_by bigint NOT NULL REFERENCES public.users(id),
  test_evidence text NOT NULL CHECK (length(trim(test_evidence)) >= 10),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  allow_repeated_resets boolean NOT NULL DEFAULT false
);
ALTER TABLE public.campaign_reset_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_reset_approvals FROM PUBLIC;
GRANT SELECT, UPDATE(used_at) ON public.campaign_reset_approvals TO hamonym_campaign_reset;
CREATE POLICY reset_role_approval ON public.campaign_reset_approvals TO hamonym_campaign_reset USING (true) WITH CHECK (true);
CREATE TABLE campaign_reset_private.active_scope (
  backend_pid integer NOT NULL, transaction_id bigint NOT NULL, snapshot jsonb NOT NULL,
  PRIMARY KEY(backend_pid,transaction_id)
);
ALTER TABLE campaign_reset_private.active_scope OWNER TO hamonym_campaign_reset;
CREATE TABLE campaign_reset_private.backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL,
  snapshot_sha256 text NOT NULL, snapshot jsonb NOT NULL, actor_id bigint NOT NULL,
  reason text NOT NULL, external_backup text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE campaign_reset_private.backups OWNER TO hamonym_campaign_reset;
CREATE TABLE campaign_reset_private.retired_records (
  table_name text NOT NULL, row_id text NOT NULL, entity_id uuid, campaign_id uuid, provider text,
  provider_reference text, low_profile_id text, backup_id uuid NOT NULL REFERENCES campaign_reset_private.backups(id),
  PRIMARY KEY(table_name,row_id)
);
ALTER TABLE campaign_reset_private.retired_records OWNER TO hamonym_campaign_reset;
CREATE INDEX retired_provider_reference ON campaign_reset_private.retired_records(table_name,provider,provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX retired_low_profile ON campaign_reset_private.retired_records(table_name,low_profile_id) WHERE low_profile_id IS NOT NULL;
GRANT USAGE,CREATE ON SCHEMA public TO hamonym_campaign_reset; -- CREATE is revoked after ownership transfers.
GRANT SELECT ON public.users,public.campaigns,public.billing_accounts,public.recurring_instructions TO hamonym_campaign_reset;
GRANT UPDATE(current_amount,supporters_count,updated_at) ON public.campaigns TO hamonym_campaign_reset;
GRANT SELECT,DELETE,UPDATE ON public.registration_participants,public.registration_orders,public.email_logs,
  public.receipts,public.masav_collection_proposals,public.statement_adjustments,public.statement_components,
  public.payments,public.collection_attempts,public.donations,public.statements TO hamonym_campaign_reset;
GRANT SELECT ON public.payment_exceptions TO hamonym_campaign_reset;
GRANT SELECT,UPDATE(resolved_at,resolved_by) ON public.reconciliation_findings TO hamonym_campaign_reset;
-- Row locks require UPDATE permission; never use it to rewrite frozen facts.
GRANT UPDATE ON public.billing_accounts TO hamonym_campaign_reset;

CREATE FUNCTION public.campaign_test_reset_snapshot(p_campaign uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE c jsonb; ds uuid[]; ss uuid[]; rs uuid[]; ids uuid[]; data jsonb='{}'; t text; predicate text; rows jsonb;
BEGIN
 SELECT to_jsonb(x) INTO c FROM public.campaigns x WHERE id=p_campaign;
 IF c IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND'; END IF;
 SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO ds FROM public.donations WHERE campaign_id=p_campaign;
 SELECT coalesce(array_agg(DISTINCT id ORDER BY id),'{}') INTO ss FROM (
   SELECT statement_id id FROM public.statement_components WHERE donation_id=ANY(ds)
   UNION SELECT effective_statement_id FROM public.donations WHERE id=ANY(ds) AND effective_statement_id IS NOT NULL
 ) x;
 IF EXISTS(SELECT 1 FROM public.statement_components sc JOIN public.donations d ON d.id=sc.donation_id
   WHERE sc.statement_id=ANY(ss) AND d.campaign_id<>p_campaign)
 OR EXISTS(SELECT 1 FROM public.donations WHERE effective_statement_id=ANY(ss) AND campaign_id<>p_campaign) THEN
   RAISE EXCEPTION 'MIXED_CAMPAIGN_STATEMENT';
 END IF;
 IF EXISTS(SELECT 1 FROM public.statements s JOIN public.billing_accounts a ON a.id=s.billing_account_id
   WHERE s.id=ANY(ss) AND a.entity_id<>(c->>'entity_id')::uuid)
 OR EXISTS(SELECT 1 FROM public.donations WHERE id=ANY(ds) AND entity_id<>(c->>'entity_id')::uuid) THEN
   RAISE EXCEPTION 'CROSS_ENTITY_RECORD';
 END IF;
 IF EXISTS(SELECT 1 FROM public.collection_attempts WHERE statement_id=ANY(ss) AND status IN ('pending','ambiguous'))
 OR EXISTS(SELECT 1 FROM public.donations WHERE id=ANY(ds) AND status='pending' AND low_profile_id IS NOT NULL) THEN
   RAISE EXCEPTION 'PROVIDER_OPERATION_UNRESOLVED';
 END IF;
 IF EXISTS(SELECT 1 FROM public.recurring_instructions WHERE campaign_id=p_campaign) OR EXISTS(SELECT 1 FROM public.donations WHERE id=ANY(ds) AND recurring_instruction_id IS NOT NULL) THEN RAISE EXCEPTION 'RECURRING_CAMPAIGN_UNSUPPORTED'; END IF;
 IF EXISTS(SELECT 1 FROM public.payment_exceptions WHERE statement_id=ANY(ss) OR payment_id IN(SELECT id FROM public.payments WHERE statement_id=ANY(ss)) OR collection_attempt_id IN(SELECT id FROM public.collection_attempts WHERE statement_id=ANY(ss))) THEN RAISE EXCEPTION 'PAYMENT_EXCEPTION_REQUIRES_REVIEW'; END IF;
 IF EXISTS(SELECT 1 FROM public.masav_collection_proposals WHERE statement_id=ANY(ss) AND status IN ('approved','exported'))
 OR EXISTS(SELECT 1 FROM public.payments WHERE statement_id=ANY(ss) AND provider<>'cardcom') OR EXISTS(SELECT 1 FROM public.collection_attempts WHERE statement_id=ANY(ss) AND collection_method='masav') THEN RAISE EXCEPTION 'MASAV_REQUIRES_REVIEW'; END IF;
 IF EXISTS(SELECT 1 FROM public.receipts WHERE campaign_id=p_campaign AND NOT(donation_id=ANY(ds))) OR EXISTS(SELECT 1 FROM public.registration_orders WHERE campaign_id=p_campaign AND NOT(donation_id=ANY(ds))) OR EXISTS(SELECT 1 FROM public.receipts WHERE donation_id=ANY(ds) AND (campaign_id<>p_campaign OR entity_id<>(c->>'entity_id')::uuid))
 OR EXISTS(SELECT 1 FROM public.registration_orders WHERE donation_id=ANY(ds) AND campaign_id<>p_campaign)
 OR EXISTS(SELECT 1 FROM public.payments p JOIN public.collection_attempts a ON a.id=p.collection_attempt_id
   WHERE p.statement_id=ANY(ss) AND a.statement_id<>p.statement_id) THEN RAISE EXCEPTION 'CROSS_CAMPAIGN_DEPENDENCY'; END IF;
 -- Billing runs and periods are shared audit infrastructure and are never deleted.
 rs='{}';
 FOREACH t IN ARRAY ARRAY['registration_participants','registration_orders','email_logs','receipts','masav_collection_proposals',
    'statement_adjustments','statement_components','payments','collection_attempts','donations','statements'] LOOP
   IF t='registration_participants' THEN predicate='registration_order_id IN (SELECT id FROM public.registration_orders WHERE donation_id=ANY($1))';
   ELSIF t IN ('registration_orders','email_logs','receipts') THEN predicate='donation_id=ANY($1)';
   ELSIF t='donations' THEN predicate='id=ANY($1)';
   ELSIF t='statements' THEN predicate='id=ANY($2)';
   ELSIF t='billing_runs' THEN predicate='id=ANY($3)';
   ELSE predicate='statement_id=ANY($2)'; END IF;
   EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),''[]''::jsonb) FROM public.%I x WHERE %s',t,predicate)
     INTO rows USING ds,ss,rs;
   data=jsonb_set(data,ARRAY[t],rows);
 END LOOP;
 SELECT coalesce(array_agg(id),'{}') INTO ids FROM public.collection_attempts WHERE statement_id=ANY(ss);
 SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]') INTO rows FROM public.reconciliation_findings r
 WHERE resolved_at IS NULL AND ((subject_type='donation' AND subject_id=ANY(ds)) OR (subject_type='statement' AND subject_id=ANY(ss))
 OR (subject_type='collection_attempt' AND subject_id=ANY(ids)) OR (subject_type='campaign' AND subject_id=p_campaign));
 RETURN jsonb_build_object('campaign',c,'tables',data,'findings',rows);
END $$;
ALTER FUNCTION public.campaign_test_reset_snapshot(uuid) OWNER TO hamonym_campaign_reset;
REVOKE ALL ON FUNCTION public.campaign_test_reset_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.campaign_test_reset_snapshot(uuid) TO CURRENT_USER;

CREATE FUNCTION public.campaign_reset_row_allowed(p_table text,p_old jsonb) RETURNS boolean
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF current_user<>'hamonym_campaign_reset' THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM campaign_reset_private.active_scope a
  WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current()
    AND a.snapshot->'tables'->p_table @> jsonb_build_array(p_old));
END $$;
ALTER FUNCTION public.campaign_reset_row_allowed(text,jsonb) OWNER TO hamonym_campaign_reset;
-- Preserve original trigger bodies and all UPDATE protections. Only exact, authorized DELETE rows are exceptional.
DO $$ DECLARE fn text; definition text; BEGIN
 FOREACH fn IN ARRAY ARRAY['donations_block_paid_delete','receipts_block_delete','billing_statement_components_block_mutation',
   'payments_block_mutation','statement_adjustments_block_mutation'] LOOP
   SELECT pg_get_functiondef(to_regprocedure('public.'||fn||'()')) INTO definition;
   IF definition IS NULL THEN RAISE EXCEPTION 'Required financial trigger missing: %',fn; END IF;
   definition=regexp_replace(definition,'BEGIN', 'BEGIN
 IF TG_OP=''DELETE'' AND TG_TABLE_SCHEMA=''public'' AND public.campaign_reset_row_allowed(TG_TABLE_NAME,to_jsonb(OLD)) THEN RETURN OLD; END IF;','i');
   EXECUTE definition;
 END LOOP;
END $$;

CREATE FUNCTION public.execute_campaign_test_reset(p_campaign uuid,p_hash text,p_actor bigint,p_reason text,p_backup text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE a public.campaign_reset_approvals; snap jsonb; actual_hash text; backup_id uuid; t text; row_data jsonb;
 d_ids uuid[]; s_ids uuid[]; locked_id uuid; n integer; counts jsonb='{}'; paid numeric; supporters bigint; after_campaign jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.users WHERE id=p_actor AND is_super_admin) OR length(trim(coalesce(p_reason,'')))<3
    OR coalesce(p_backup,'')='' THEN RAISE EXCEPTION 'RESET_NOT_AUTHORIZED'; END IF;
 SELECT * INTO a FROM public.campaign_reset_approvals WHERE campaign_id=p_campaign FOR UPDATE NOWAIT;
 IF NOT FOUND OR a.expires_at<=clock_timestamp() OR (NOT a.allow_repeated_resets AND (a.used_at IS NOT NULL OR a.snapshot_sha256<>p_hash))
   OR NOT EXISTS(SELECT 1 FROM public.users WHERE id=a.approved_by AND is_super_admin) THEN RAISE EXCEPTION 'RESET_APPROVAL_REQUIRED'; END IF;
 -- Entity/campaign parent locks prevent new FK children; NOWAIT fails safely instead of waiting behind live operations.
 PERFORM b.id FROM public.billing_accounts b JOIN public.campaigns c ON c.entity_id=b.entity_id WHERE c.id=p_campaign FOR UPDATE OF b NOWAIT;
 PERFORM id FROM public.campaigns WHERE id=p_campaign FOR UPDATE NOWAIT;
 SELECT coalesce(array_agg(id),'{}') INTO d_ids FROM public.donations WHERE campaign_id=p_campaign;
 SELECT coalesce(array_agg(DISTINCT id),'{}') INTO s_ids FROM (
   SELECT statement_id id FROM public.statement_components WHERE donation_id=ANY(d_ids)
   UNION SELECT effective_statement_id FROM public.donations WHERE id=ANY(d_ids) AND effective_statement_id IS NOT NULL) s;
 PERFORM id FROM public.statements WHERE id=ANY(s_ids) FOR UPDATE NOWAIT;
 PERFORM id FROM public.donations WHERE id=ANY(d_ids) FOR UPDATE NOWAIT;
 snap=public.campaign_test_reset_snapshot(p_campaign);
 IF jsonb_array_length(snap->'tables'->'donations')=0 THEN RAISE EXCEPTION 'NOTHING_TO_RESET'; END IF;
 -- Lock every affected row, then resnapshot to detect concurrent changes.
 FOR t IN SELECT jsonb_object_keys(snap->'tables') LOOP
   -- Normal DML-compatible lock: prevents concurrent FK/DDL changes, not other row writes.
   EXECUTE format('LOCK TABLE public.%I IN ROW EXCLUSIVE MODE NOWAIT',t);
   EXECUTE format('SELECT id FROM public.%I WHERE id::text IN (SELECT value->>''id'' FROM jsonb_array_elements($1)) FOR UPDATE NOWAIT',t)
    USING snap->'tables'->t;
 END LOOP;
 PERFORM id FROM public.reconciliation_findings WHERE id::text IN (SELECT value->>'id' FROM jsonb_array_elements(snap->'findings')) FOR UPDATE NOWAIT;
 snap=public.campaign_test_reset_snapshot(p_campaign);
 actual_hash=encode(sha256(convert_to(snap::text,'UTF8')),'hex');
 IF actual_hash<>p_hash THEN RAISE EXCEPTION 'RESET_PREVIEW_STALE'; END IF;
 -- Fail closed on an unreviewed incoming FK (including CASCADE): never silently remove a new dependent table.
 IF EXISTS(SELECT 1 FROM pg_constraint fk JOIN pg_class parent ON parent.oid=fk.confrelid JOIN pg_namespace pn ON pn.oid=parent.relnamespace
   JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_namespace cn ON cn.oid=child.relnamespace
   LEFT JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=fk.conkey[1]
   LEFT JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=fk.confkey[1]
   WHERE fk.contype='f' AND pn.nspname='public' AND snap->'tables' ? parent.relname
     AND (cn.nspname<>'public' OR cardinality(fk.conkey)<>1 OR cardinality(fk.confkey)<>1 OR pa.attname<>'id'
       OR NOT EXISTS(SELECT 1 FROM (VALUES
        ('receipts','donation_id','donations','a'),('email_logs','donation_id','donations','a'),
        ('registration_orders','donation_id','donations','c'),('registration_participants','registration_order_id','registration_orders','c'),
        ('statement_components','donation_id','donations','r'),('statement_components','statement_id','statements','a'),
        ('donations','effective_statement_id','statements','a'),('collection_attempts','statement_id','statements','a'),
        ('payments','statement_id','statements','a'),('payments','collection_attempt_id','collection_attempts','a'),
        ('statement_adjustments','statement_id','statements','a'),('masav_collection_proposals','statement_id','statements','a'),
        ('payment_exceptions','statement_id','statements','a'),('payment_exceptions','payment_id','payments','a'),
        ('payment_exceptions','collection_attempt_id','collection_attempts','a')
       ) expected(child_table,child_column,parent_table,delete_type)
       WHERE child.relname=expected.child_table AND ca.attname=expected.child_column AND parent.relname=expected.parent_table
         AND fk.confdeltype::text=expected.delete_type))) THEN RAISE EXCEPTION 'UNREVIEWED_FOREIGN_KEY'; END IF;
 SELECT coalesce(sum((value->>'amount')::numeric),0),coalesce(sum(coalesce((value->>'supporters_count')::bigint,1)),0)
 INTO paid,supporters FROM jsonb_array_elements(snap->'tables'->'donations') WHERE value->>'status'='paid';
 IF (snap->'campaign'->>'current_amount')::numeric<paid OR (snap->'campaign'->>'supporters_count')::bigint<supporters THEN
   RAISE EXCEPTION 'CAMPAIGN_TOTALS_INCONSISTENT'; END IF;
 INSERT INTO campaign_reset_private.backups(campaign_id,snapshot_sha256,snapshot,actor_id,reason,external_backup)
 VALUES(p_campaign,p_hash,snap,p_actor,p_reason,p_backup) RETURNING id INTO backup_id;
 INSERT INTO campaign_reset_private.active_scope VALUES(pg_backend_pid(),txid_current(),snap);
 FOREACH t IN ARRAY ARRAY['donations','payments'] LOOP
   INSERT INTO campaign_reset_private.retired_records(table_name,row_id,entity_id,campaign_id,provider,provider_reference,low_profile_id,backup_id)
   SELECT t,value->>'id',(value->>'entity_id')::uuid,(value->>'campaign_id')::uuid,coalesce(value->>'provider','cardcom'),value->>'provider_reference',value->>'low_profile_id',backup_id
   FROM jsonb_array_elements(snap->'tables'->t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['registration_participants','registration_orders','email_logs','receipts','masav_collection_proposals',
   'statement_adjustments','statement_components','payments','collection_attempts','donations','statements'] LOOP
   EXECUTE format('DELETE FROM public.%I WHERE id::text IN (SELECT value->>''id'' FROM jsonb_array_elements($1))',t) USING snap->'tables'->t;
   GET DIAGNOSTICS n=ROW_COUNT;
   IF n<>jsonb_array_length(snap->'tables'->t) THEN RAISE EXCEPTION 'RESET_COUNT_MISMATCH: %',t; END IF;
   counts=jsonb_set(counts,ARRAY[t],to_jsonb(n));
 END LOOP;
 UPDATE public.campaigns SET current_amount=current_amount-paid,supporters_count=supporters_count-supporters,updated_at=now() WHERE id=p_campaign;
 SELECT to_jsonb(c) INTO after_campaign FROM public.campaigns c WHERE id=p_campaign;
 IF (after_campaign-'current_amount'-'supporters_count'-'updated_at') IS DISTINCT FROM
    ((snap->'campaign')-'current_amount'-'supporters_count'-'updated_at') THEN RAISE EXCEPTION 'CAMPAIGN_CONFIGURATION_CHANGED'; END IF;
 UPDATE public.reconciliation_findings SET resolved_at=now(),resolved_by='campaign-test-reset:'||backup_id
 WHERE id::text IN (SELECT value->>'id' FROM jsonb_array_elements(snap->'findings')) AND resolved_at IS NULL;
 UPDATE public.campaign_reset_approvals SET used_at=clock_timestamp() WHERE campaign_id=p_campaign;
 DELETE FROM campaign_reset_private.active_scope WHERE backend_pid=pg_backend_pid() AND transaction_id=txid_current();
 IF EXISTS(SELECT 1 FROM public.donations WHERE campaign_id=p_campaign) OR EXISTS(SELECT 1 FROM public.statements WHERE id=ANY(s_ids)) THEN
  RAISE EXCEPTION 'RESET_VERIFICATION_FAILED'; END IF;
 RETURN jsonb_build_object('reset',true,'backupId',backup_id,'deleted',counts,'campaignId',p_campaign);
END $$;
ALTER FUNCTION public.execute_campaign_test_reset(uuid,text,bigint,text,text) OWNER TO hamonym_campaign_reset;
REVOKE ALL ON FUNCTION public.execute_campaign_test_reset(uuid,text,bigint,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_campaign_test_reset(uuid,text,bigint,text,text) TO CURRENT_USER;

-- Archived provider events remain retired even though their test ledger rows were removed.
CREATE FUNCTION public.campaign_reset_block_replay() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r jsonb=to_jsonb(NEW);
BEGIN
 IF EXISTS(SELECT 1 FROM campaign_reset_private.retired_records a WHERE a.table_name=TG_TABLE_NAME AND
  (a.row_id=r->>'id' OR ((TG_TABLE_NAME='payments' OR (a.entity_id=(r->>'entity_id')::uuid AND a.campaign_id=(r->>'campaign_id')::uuid)) AND ((a.provider_reference IS NOT NULL AND a.provider_reference=r->>'provider_reference' AND a.provider=coalesce(r->>'provider','cardcom'))
   OR (a.low_profile_id IS NOT NULL AND a.low_profile_id=r->>'low_profile_id'))))) THEN RAISE EXCEPTION 'RESET_ARCHIVED_PROVIDER_EVENT'; END IF;
 RETURN NEW;
END $$;
ALTER FUNCTION public.campaign_reset_block_replay() OWNER TO hamonym_campaign_reset;
CREATE TRIGGER campaign_reset_donation_replay BEFORE INSERT OR UPDATE OF provider_reference,low_profile_id ON public.donations FOR EACH ROW EXECUTE FUNCTION public.campaign_reset_block_replay();
CREATE TRIGGER campaign_reset_payment_replay BEFORE INSERT ON public.payments FOR EACH ROW EXECUTE FUNCTION public.campaign_reset_block_replay();

GRANT USAGE ON SCHEMA campaign_reset_private TO CURRENT_USER;
GRANT SELECT ON campaign_reset_private.backups TO CURRENT_USER;
-- Supabase default privileges can grant these roles directly, independently of PUBLIC.
DO $$ DECLARE api_role text; BEGIN
 FOR api_role IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION public.campaign_test_reset_snapshot(uuid) FROM %I',api_role);
  EXECUTE format('REVOKE ALL ON FUNCTION public.execute_campaign_test_reset(uuid,text,bigint,text,text) FROM %I',api_role);
  EXECUTE format('REVOKE ALL ON TABLE public.campaign_reset_approvals FROM %I',api_role);
 END LOOP;
END $$;

REVOKE CREATE ON SCHEMA public FROM hamonym_campaign_reset;
REVOKE hamonym_campaign_reset FROM CURRENT_USER;

-- Supabase may retain an ADMIN-only membership. Runtime SET/INHERIT must remain forbidden.
DO $$ BEGIN
 IF pg_has_role(current_user,'hamonym_campaign_reset','SET') OR pg_has_role(current_user,'hamonym_campaign_reset','USAGE') THEN
   RAISE EXCEPTION 'Reset role runtime privileges were not revoked';
 END IF;
END $$;

