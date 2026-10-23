'use strict';
// Only a disposable Docker database with no network; never reads .env.
const {execFileSync}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const container='hamonym-campaign-reset-tests',root=path.join(__dirname,'..');
const info=JSON.parse(execFileSync('docker',['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.ok(info.Config.Env.includes('POSTGRES_DB=hamonym_campaign_reset_test'));
execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{input:'DROP DATABASE IF EXISTS hamonym_campaign_reset_test WITH (FORCE);DROP ROLE IF EXISTS hamonym_campaign_reset;DROP ROLE IF EXISTS hamonym_reset_test_owner;DROP ROLE IF EXISTS anon;DROP ROLE IF EXISTS authenticated;DROP ROLE IF EXISTS service_role;CREATE ROLE hamonym_reset_test_owner LOGIN CREATEROLE;CREATE DATABASE hamonym_campaign_reset_test OWNER hamonym_reset_test_owner;',stdio:['pipe','pipe','pipe']});
function sql(input){return execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','hamonym_reset_test_owner','-d','hamonym_campaign_reset_test'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
function fails(input,pattern){assert.throws(()=>sql(input),e=>pattern.test(String(e.stderr)));}
const C='00000000-0000-4000-8000-000000000001',O='00000000-0000-4000-8000-000000000002',D='00000000-0000-4000-8000-000000000003',S='00000000-0000-4000-8000-000000000004',A='00000000-0000-4000-8000-000000000005',P='00000000-0000-4000-8000-000000000006',E='00000000-0000-4000-8000-000000000007',B='00000000-0000-4000-8000-000000000008',R='00000000-0000-4000-8000-000000000009',PER='00000000-0000-4000-8000-000000000010';
sql('CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;');
sql(`CREATE TABLE users(id bigint PRIMARY KEY,is_super_admin boolean NOT NULL);INSERT INTO users VALUES(1,true),(2,false);
CREATE TABLE entities(id uuid PRIMARY KEY,display_name text);INSERT INTO entities VALUES('${E}','fixture');
CREATE TABLE campaigns(id uuid PRIMARY KEY,entity_id uuid REFERENCES entities(id),title text,current_amount numeric,supporters_count bigint,settings jsonb DEFAULT '{"preserve":"all settings"}',updated_at timestamptz DEFAULT now());
INSERT INTO campaigns(id,entity_id,title,current_amount,supporters_count) VALUES('${C}','${E}','Keshet fixture',100,1),('${O}','${E}','Other campaign',50,1);
CREATE TABLE donations(id uuid PRIMARY KEY,campaign_id uuid REFERENCES campaigns(id),entity_id uuid REFERENCES entities(id),amount numeric,status text,is_mock boolean DEFAULT false,completed_at timestamptz DEFAULT now(),billing_effective_at timestamptz DEFAULT now(),provider_charged_at timestamptz,provider_reference text,low_profile_id text,recurring_instruction_id uuid,supporters_count bigint DEFAULT 1);
CREATE TABLE recurring_instructions(id uuid PRIMARY KEY,campaign_id uuid REFERENCES campaigns(id));`);
for(const f of ['017_receipts_and_donor_accounts.sql','018_email_logs.sql','024_registration_orders.sql','051_reconciliation_findings.sql','054_billing_engine_core.sql','055_donations_financial_integrity.sql','058_statement_lifecycle_correction.sql','059_collection_engine_core.sql','072_statement_adjustments.sql','073_fin11_payment_exceptions.sql','074_fin11_masav_collection_proposals.sql','077_campaign_test_reset.sql'])sql((f.startsWith('077')?'BEGIN;':'')+fs.readFileSync(path.join(root,'migrations',f),'utf8')+(f.startsWith('077')?'COMMIT;':''));
// Reproduce Supabase: RLS enabled without a general policy for the private role.
for(const table of ['users','campaigns','billing_accounts','recurring_instructions','registration_participants','registration_orders','email_logs','receipts','masav_collection_proposals','statement_adjustments','statement_components','payments','collection_attempts','donations','statements','payment_exceptions','reconciliation_findings'])sql('ALTER TABLE public.'+table+' ENABLE ROW LEVEL SECURITY');
sql('BEGIN;'+fs.readFileSync(path.join(root,'migrations/078_campaign_reset_role_rls.sql'),'utf8')+'COMMIT;');
sql(`INSERT INTO billing_accounts(id,entity_id,fee_rate,vat_rate) VALUES('${B}','${E}',0.03,0.18);
INSERT INTO billing_periods(id,period_start,period_end)VALUES('${PER}','2026-10-01','2026-11-01');
INSERT INTO billing_runs(id,billing_period_id,mode,as_of,status)VALUES('${R}','${PER}','production',now(),'approved');
INSERT INTO statements(id,billing_account_id,billing_run_id,gross_raised,fee_rate,vat_rate,fee_amount,vat_amount,total_due,status)VALUES('${S}','${B}','${R}',100,0.03,0.18,3,0.54,3.54,'draft');
INSERT INTO donations(id,campaign_id,entity_id,amount,status,provider_reference,low_profile_id)VALUES('${D}','${C}','${E}',100,'paid','fixture-donation','fixture-low-profile');
INSERT INTO statement_components(statement_id,donation_id,amount_snapshot,completed_at_snapshot,origin_type)VALUES('${S}','${D}',100,now(),'card_onetime');
UPDATE donations SET effective_statement_id='${S}' WHERE id='${D}';UPDATE statements SET status='paid' WHERE id='${S}';
INSERT INTO receipts(donation_id,entity_id,campaign_id,amount)VALUES('${D}','${E}','${C}',100);
INSERT INTO collection_attempts(id,statement_id,collection_method,attempt_number,status,requested_amount)VALUES('${A}','${S}','card',1,'succeeded',3.54);
INSERT INTO payments(id,statement_id,collection_attempt_id,amount,provider,provider_reference,received_at)VALUES('${P}','${S}','${A}',3.54,'cardcom','fixture-provider-charge',now());`);
const OD='00000000-0000-4000-8000-000000000021',OS='00000000-0000-4000-8000-000000000022',OA='00000000-0000-4000-8000-000000000023',OP='00000000-0000-4000-8000-000000000024',ORUN='00000000-0000-4000-8000-000000000025',OPER='00000000-0000-4000-8000-000000000026';
sql(`INSERT INTO billing_periods(id,period_start,period_end)VALUES('${OPER}','2026-11-01','2026-12-01');
INSERT INTO billing_runs(id,billing_period_id,mode,as_of,status)VALUES('${ORUN}','${OPER}','production',now(),'approved');
INSERT INTO statements(id,billing_account_id,billing_run_id,gross_raised,fee_rate,vat_rate,fee_amount,vat_amount,total_due,status)VALUES('${OS}','${B}','${ORUN}',50,0.03,0.18,1.5,0.27,1.77,'draft');
INSERT INTO donations(id,campaign_id,entity_id,amount,status,provider_reference)VALUES('${OD}','${O}','${E}',50,'paid','unrelated-provider-donation');
INSERT INTO statement_components(statement_id,donation_id,amount_snapshot,completed_at_snapshot,origin_type)VALUES('${OS}','${OD}',50,now(),'card_onetime');
UPDATE donations SET effective_statement_id='${OS}' WHERE id='${OD}';UPDATE statements SET status='paid' WHERE id='${OS}';
INSERT INTO receipts(donation_id,entity_id,campaign_id,amount)VALUES('${OD}','${E}','${O}',50);
INSERT INTO collection_attempts(id,statement_id,collection_method,attempt_number,status,requested_amount)VALUES('${OA}','${OS}','card',1,'succeeded',1.77);
INSERT INTO payments(id,statement_id,collection_attempt_id,amount,provider,provider_reference,received_at)VALUES('${OP}','${OS}','${OA}',1.77,'cardcom','unrelated-provider-payment',now());`);
const otherFinancial=()=>sql(`SELECT jsonb_build_object('donation',(SELECT to_jsonb(d) FROM donations d WHERE id='${OD}'),'statement',(SELECT to_jsonb(s) FROM statements s WHERE id='${OS}'),'payment',(SELECT to_jsonb(p) FROM payments p WHERE id='${OP}'),'attempt',(SELECT to_jsonb(a) FROM collection_attempts a WHERE id='${OA}'),'receipt',(SELECT to_jsonb(r) FROM receipts r WHERE donation_id='${OD}'),'components',(SELECT jsonb_agg(to_jsonb(sc) ORDER BY id) FROM statement_components sc WHERE statement_id='${OS}'))`);
const financialBefore=otherFinancial();
const hash=()=>sql(`SELECT encode(sha256(convert_to(public.campaign_test_reset_snapshot('${C}')::text,'UTF8')),'hex')`);
const approve=h=>`INSERT INTO campaign_reset_approvals(campaign_id,snapshot_sha256,approved_by,test_evidence,expires_at,used_at) VALUES('${C}','${h}',1,'Explicitly authorized isolated fixture',now()+interval '1 hour',NULL);`;
const reset=h=>`SELECT public.execute_campaign_test_reset('${C}','${h}',1,'isolated fixture reset','isolated-test-backup.json');`;
let count=0;function test(name,fn){fn();count++;console.log('PASS '+name);}
test('normal paid donation, receipt, component and payment deletes remain blocked',()=>{for(const table of ['donations','receipts','statement_components','payments'])fails('DELETE FROM '+table,/cannot be deleted|permanent|append-only/);});
test('normal financial updates and forged reset context cannot bypass guards',()=>{
 fails('UPDATE donations SET amount=101',/frozen/);fails('UPDATE payments SET amount=4',/append-only/);
 fails("BEGIN;SET LOCAL hamonym.reset='true';DELETE FROM receipts;",/permanent/);
 fails('BEGIN;SET ROLE hamonym_campaign_reset;DELETE FROM receipts;',/permission denied/);
 fails("INSERT INTO campaign_reset_private.active_scope VALUES(pg_backend_pid(),txid_current(),jsonb_build_object('tables','{}'::jsonb))",/permission denied/);
});
test('no approval cannot reset',()=>fails(reset(hash()),/RESET_APPROVAL_REQUIRED/));
test('non-admin cannot reset',()=>fails('BEGIN;'+approve(hash())+reset(hash()).replace(",1,'isolated",",2,'isolated"),/RESET_NOT_AUTHORIZED/));
test('stale preview cannot reset',()=>fails('BEGIN;'+approve(hash())+`UPDATE campaigns SET title='Changed' WHERE id='${C}';`+reset(hash()),/RESET_PREVIEW_STALE/));
test('mixed campaign statement is blocked without changing either campaign',()=>fails(`BEGIN;INSERT INTO donations(id,campaign_id,entity_id,amount,status)VALUES(gen_random_uuid(),'${O}','${E}',50,'paid');INSERT INTO statement_components(statement_id,donation_id,amount_snapshot,completed_at_snapshot,origin_type) SELECT '${S}',id,50,now(),'card_onetime' FROM donations WHERE campaign_id='${O}';SELECT public.campaign_test_reset_snapshot('${C}');`,/MIXED_CAMPAIGN_STATEMENT/));
test('uncertain attempt blocks reset',()=>fails(`BEGIN;UPDATE collection_attempts SET status='ambiguous' WHERE id='${A}';SELECT public.campaign_test_reset_snapshot('${C}');`,/PROVIDER_OPERATION_UNRESOLVED/));
test('unreviewed cascading dependency fails closed',()=>fails('BEGIN;'+`CREATE TABLE new_dependent(id uuid PRIMARY KEY,donation_id uuid REFERENCES donations(id) ON DELETE CASCADE);`+approve(hash())+reset(hash()),/UNREVIEWED_FOREIGN_KEY/));
test('unreviewed cascade inside a known dependent table is also rejected',()=>{
 fails('BEGIN;ALTER TABLE registration_orders ADD COLUMN unexpected_payment uuid REFERENCES payments(id) ON DELETE CASCADE;'+approve(hash())+reset(hash()),/UNREVIEWED_FOREIGN_KEY/);
});
test('concurrent activity on the selected campaign blocks reset',()=>{
 const approvedHash=hash();
 sql(approve(approvedHash));
 execFileSync('docker',['exec','-d',container,'psql','-X','-qAt','-U','hamonym_reset_test_owner','-d','hamonym_campaign_reset_test','-c',`SET application_name='reset-lock-fixture';BEGIN;SELECT id FROM campaigns WHERE id='${C}' FOR UPDATE;SELECT pg_sleep(30);COMMIT;`]);
 let ready=false;for(let i=0;i<12;i++){if(sql("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='reset-lock-fixture' AND wait_event='PgSleep')")==='t'){ready=true;break;}}
 assert.ok(ready,'isolated row lock did not become ready');
 try{fails('BEGIN;'+reset(approvedHash),/could not obtain lock/);assert.equal(otherFinancial(),financialBefore);}
 finally{sql("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name='reset-lock-fixture' AND pid<>pg_backend_pid()");sql(`DELETE FROM campaign_reset_approvals WHERE campaign_id='${C}'`);}
});
test('exception after child deletion rolls everything back',()=>{
 fails(`BEGIN;CREATE FUNCTION fail_reset_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected reset failure';END $$;CREATE TRIGGER zz_fail_reset BEFORE DELETE ON donations FOR EACH ROW EXECUTE FUNCTION fail_reset_test();`+approve(hash())+reset(hash()),/injected reset failure/);
 assert.equal(sql('SELECT count(*) FROM receipts'),'2');assert.equal(sql('SELECT count(*) FROM payments'),'2');assert.equal(sql('SELECT count(*) FROM donations'),'2');assert.equal(sql('SELECT count(*) FROM campaign_reset_private.backups'),'0');
});
test('even the active reset role cannot delete a different campaign receipt',()=>{
 fails(`BEGIN;CREATE FUNCTION scope_escape_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN DELETE FROM receipts WHERE donation_id='${OD}';RETURN OLD;END $$;CREATE TRIGGER zz_scope_escape BEFORE DELETE ON donations FOR EACH ROW EXECUTE FUNCTION scope_escape_test();`+approve(hash())+reset(hash()),/permanent/);assert.equal(otherFinancial(),financialBefore);
});
const otherBefore=sql(`SELECT row_to_json(c) FROM campaigns c WHERE id='${O}'`),configBefore=sql(`SELECT (to_jsonb(c)-'current_amount'-'supporters_count'-'updated_at')::text FROM campaigns c WHERE id='${C}'`);
test('authorized deletion commits with backup and preserves all unrelated/configuration data',()=>{
 const snapshot=JSON.parse(sql(`SELECT public.campaign_test_reset_snapshot('${C}')`));assert.equal(snapshot.tables.payments.length,1);
 const result=JSON.parse(sql('BEGIN;'+approve(hash())+reset(hash())+'COMMIT;'));assert.equal(result.reset,true);assert.equal(result.deleted.donations,1);assert.equal(result.deleted.payments,1);
 assert.equal(sql('SELECT count(*) FROM donations'),'1');assert.equal(sql('SELECT count(*) FROM payments'),'1');assert.equal(sql('SELECT count(*) FROM statements'),'1');assert.equal(otherFinancial(),financialBefore);assert.equal(sql('SELECT count(*) FROM billing_accounts'),'1');assert.equal(sql('SELECT count(*) FROM billing_runs'),'2');assert.equal(sql('SELECT count(*) FROM users'),'2');
 assert.equal(sql(`SELECT row_to_json(c) FROM campaigns c WHERE id='${O}'`),otherBefore);
 assert.equal(sql(`SELECT (to_jsonb(c)-'current_amount'-'supporters_count'-'updated_at')::text FROM campaigns c WHERE id='${C}'`),configBefore);
 const saved=JSON.parse(sql('SELECT snapshot FROM campaign_reset_private.backups'));assert.deepEqual(saved,snapshot);assert.equal(execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d','hamonym_campaign_reset_test','-c','SELECT count(*) FROM campaign_reset_private.active_scope'],{encoding:'utf8'}).trim(),'0');assert.equal(sql('SELECT (used_at IS NOT NULL) FROM campaign_reset_approvals'),'t');assert.equal(sql(`SELECT current_amount=0 AND supporters_count=0 FROM campaigns WHERE id='${C}'`),'t');
});
test('duplicate reset and provider-event replay are rejected',()=>{
 fails(reset(hash()),/RESET_APPROVAL_REQUIRED/);
 fails(`INSERT INTO donations(id,campaign_id,entity_id,amount,status,provider_reference)VALUES(gen_random_uuid(),'${C}','${E}',100,'paid','fixture-donation')`,/RESET_ARCHIVED_PROVIDER_EVENT/);
});
test('replayed provider reference cannot be attached later through an update',()=>{
 const id='00000000-0000-4000-8000-000000000099';
 sql(`INSERT INTO donations(id,campaign_id,entity_id,amount,status)VALUES('${id}','${C}','${E}',100,'pending')`);
 fails(`UPDATE donations SET provider_reference='fixture-donation' WHERE id='${id}'`,/RESET_ARCHIVED_PROVIDER_EVENT/);
});
test('archived donation references do not block an unrelated campaign',()=>{
 sql(`INSERT INTO donations(id,campaign_id,entity_id,amount,status,provider_reference)VALUES(gen_random_uuid(),'${O}','${E}',1,'pending','fixture-donation')`);
});
test('migration refuses autocommit before changing persistent objects',()=>{
 fails(fs.readFileSync(path.join(root,'migrations/077_campaign_test_reset.sql'),'utf8'),/requires an explicit transaction/);
});
test('explicit reusable test-campaign approval supports fresh confirmed snapshots without approving stale data',()=>{
 sql(`UPDATE campaign_reset_approvals SET allow_repeated_resets=true WHERE campaign_id='${C}'`);
 const stale=hash();sql(`INSERT INTO donations(id,campaign_id,entity_id,amount,status)VALUES(gen_random_uuid(),'${C}','${E}',2,'failed')`);
 fails(reset(stale),/RESET_PREVIEW_STALE/);
 assert.equal(JSON.parse(sql(reset(hash()))).reset,true);
 sql(`INSERT INTO donations(id,campaign_id,entity_id,amount,status)VALUES(gen_random_uuid(),'${C}','${E}',1,'paid');UPDATE campaigns SET current_amount=1,supporters_count=1 WHERE id='${C}'`);
 assert.equal(JSON.parse(sql(reset(hash()))).reset,true);
 assert.equal(sql(`SELECT count(*) FROM donations WHERE campaign_id='${C}'`),'0');assert.equal(otherFinancial(),financialBefore);
 sql(`UPDATE campaign_reset_approvals SET expires_at=now()-interval '1 second' WHERE campaign_id='${C}'`);
 fails(reset(hash()),/RESET_APPROVAL_REQUIRED/);
});
test('Supabase ADMIN-only membership is accepted without SET or inherited reset privileges',()=>{
 execFileSync('docker',['exec','-i',container,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','hamonym_campaign_reset_test','-c','GRANT hamonym_campaign_reset TO hamonym_reset_test_owner WITH ADMIN TRUE, INHERIT FALSE, SET FALSE']);
 assert.equal(sql("SELECT pg_has_role(current_user,'hamonym_campaign_reset','MEMBER') AND NOT pg_has_role(current_user,'hamonym_campaign_reset','SET') AND NOT pg_has_role(current_user,'hamonym_campaign_reset','USAGE')"),'t');
 fails('SET ROLE hamonym_campaign_reset',/permission denied/);
});
test('Supabase default API-role grants cannot expose reset functions or approvals',()=>{
 assert.equal(sql("SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') AND (has_function_privilege(oid,'public.execute_campaign_test_reset(uuid,text,bigint,text,text)','EXECUTE') OR has_function_privilege(oid,'public.campaign_test_reset_snapshot(uuid)','EXECUTE') OR has_table_privilege(oid,'public.campaign_reset_approvals','INSERT'))"),'0');
});
console.log(count+' isolated PostgreSQL reset tests passed');
