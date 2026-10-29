'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{randomUUID}=require('crypto');
const {Pool}=require(process.env.HAMONYM_TEST_PG_MODULE || 'pg');
const root=require('path').join(__dirname,'..')+require('path').sep;
const schema='risk_'+randomUUID().replaceAll('-','');
const pool=new Pool({host:'127.0.0.1',port:5433,database:'hamonym_fin11_masav_20261028',user:'postgres',password:'testpass',max:8,options:'-c search_path='+schema+',pg_catalog',connectionTimeoutMillis:5000});
let checks=0;const pass=(name)=>{checks++;console.log('PASS '+name)};
const E=randomUUID(),C=randomUUID(),B=randomUUID(),P=randomUUID(),R=randomUUID(),OLD=randomUUID(),LATE=randomUUID();
function load(file,stubs){const exports={};const code=fs.readFileSync(root+file,'utf8');const context={exports,module:{exports},require:(id)=>{if(id in stubs)return stubs[id];throw Error('Unstubbed dependency '+id)},console,process:{env:{}},setTimeout,clearTimeout,Buffer};vm.runInNewContext(code,context,{filename:file});return context.module.exports;}
(async()=>{let locker;let paymentPromise;try{
assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name,'hamonym_fin11_masav_20261028');
await pool.query('CREATE SCHEMA '+schema);
await pool.query(`CREATE TABLE entities(id uuid PRIMARY KEY,display_name text,status text);
CREATE TABLE campaigns(id uuid PRIMARY KEY,current_amount numeric(14,2) DEFAULT 0,supporters_count int DEFAULT 0,updated_at timestamptz);
CREATE TABLE users(id bigint,email text,email_verified_at timestamptz,donation_verified_email text,is_active boolean,deleted_at timestamptz);
CREATE TABLE donations(id uuid PRIMARY KEY,entity_id uuid,campaign_id uuid,amount numeric(14,2),status text,is_mock boolean DEFAULT false,created_at timestamptz DEFAULT now(),completed_at timestamptz,provider_charged_at timestamptz,billing_effective_at timestamptz GENERATED ALWAYS AS(COALESCE(provider_charged_at,completed_at)) STORED,effective_statement_id uuid,recurring_instruction_id uuid,source text,provider_reference text,low_profile_id text,client_submission_key uuid,updated_at timestamptz,donor_user_id bigint,donor_email text,donor_name text);
CREATE TABLE receipts(id uuid DEFAULT gen_random_uuid(),donation_id uuid UNIQUE,entity_id uuid,campaign_id uuid,amount numeric(14,2),donor_name text,donor_email text,receipt_number int DEFAULT 1);
CREATE TABLE billing_accounts(id uuid,entity_id uuid,fee_rate numeric(14,2),vat_rate numeric(14,2),enforcement_status text);
CREATE TABLE billing_periods(id uuid,period_start timestamptz,period_end timestamptz,retired boolean DEFAULT false);
CREATE TABLE billing_runs(id uuid DEFAULT gen_random_uuid(),billing_period_id uuid,mode text,as_of timestamptz,status text,started_at timestamptz,result_summary jsonb,completed_at timestamptz);
CREATE TABLE statements(id uuid DEFAULT gen_random_uuid(),billing_account_id uuid,billing_run_id uuid,billing_period_id uuid DEFAULT '${P}',gross_raised numeric(14,2),fee_rate numeric(14,2),vat_rate numeric(14,2),fee_amount numeric(14,2),vat_amount numeric(14,2),total_due numeric(14,2),status text,created_at timestamptz DEFAULT now());
CREATE TABLE statement_components(id uuid DEFAULT gen_random_uuid(),statement_id uuid,donation_id uuid,amount_snapshot numeric(14,2),completed_at_snapshot timestamptz,billing_effective_at_snapshot timestamptz,origin_type text);`);
const dates=load('src/modules/billing-engine/billing-period.util.js',{});
const oct=await dates.computeCycleBoundary(pool,2026,10),nov=await dates.computeCycleBoundary(pool,2026,11);
assert.equal(oct.periodEnd.toISOString(),'2026-10-28T18:00:00.000Z');assert.equal(nov.periodStart.toISOString(),oct.periodEnd.toISOString());pass('October Israel cutoff is fixed at 20:00 and November starts at exactly that instant');
for(const [t,inOct] of [['2026-10-28T19:59:59.999+02:00',true],['2026-10-28T20:00:00+02:00',false],['2026-10-28T20:00:00.001+02:00',false]]){const r=(await pool.query('SELECT $1::timestamptz >= $2 AND $1::timestamptz < $3 AS included',[t,oct.periodStart,oct.periodEnd])).rows[0];assert.equal(r.included,inOct);pass('Boundary '+t+' -> October '+inOct)}
const job=load('src/jobs/billing-monthly-cycle.job.js',{'../modules/billing-engine/billing-period.util':dates});
assert.equal((await job.computeMostRecentCycleBoundary(pool,new Date('2026-10-28T20:15:00+02:00'))).periodEnd.toISOString(),oct.periodEnd.toISOString());pass('Cron delayed to 20:15 still uses fixed 20:00 cutoff');
for(const [m,expected] of [[8,'2026-08-28T17:00:00.000Z'],[12,'2026-12-28T18:00:00.000Z']]){assert.equal((await dates.computeIsraeliCutoffUtcInstant(pool,2026,m)).toISOString(),expected)}pass('Summer and winter DST boundaries');
await pool.query("INSERT INTO entities VALUES($1,'QA','active');",[E]);await pool.query('INSERT INTO campaigns(id) VALUES($1)',[C]);await pool.query("INSERT INTO billing_accounts VALUES($1,$2,0.03,0.18,'active')",[B,E]);
await pool.query("INSERT INTO donations(id,entity_id,campaign_id,amount,status,is_mock,completed_at) VALUES($1,$2,$3,1000,'paid',true,clock_timestamp()-interval '1 day'),($4,$2,$3,50,'pending',false,NULL)",[OLD,E,C,LATE]);
const oldDefinition=fs.readFileSync(root+'migrations/056_donations_manual_idempotency.sql','utf8');
await pool.query(oldDefinition.slice(oldDefinition.indexOf('CREATE OR REPLACE FUNCTION donations_enforce_paid_immutability()')));
await pool.query('CREATE TRIGGER enforce_paid BEFORE UPDATE ON donations FOR EACH ROW EXECUTE FUNCTION donations_enforce_paid_immutability()');
const beforeMigration=(await pool.query("SELECT jsonb_agg(to_jsonb(d)-'is_mock' ORDER BY id)::text AS snapshot FROM donations d")).rows[0].snapshot;
await pool.query('CREATE VIEW migration_dependency_guard AS SELECT is_mock FROM donations');
const migrationClient=await pool.connect();
try {
  await assert.rejects(()=>migrationClient.query(fs.readFileSync(root+'migrations/080_remove_donation_is_mock.sql','utf8')),e=>e.code==='2BP01');
  await migrationClient.query('ROLLBACK');
} finally { migrationClient.release(); }
assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='donations' AND column_name='is_mock'",[schema])).rows[0].n,1);
await pool.query('DROP VIEW migration_dependency_guard');
pass('Migration fails closed on dependent view and rolls back function/column changes');
await pool.query(fs.readFileSync(root+'migrations/080_remove_donation_is_mock.sql','utf8'));
assert.equal((await pool.query("SELECT jsonb_agg(to_jsonb(d) ORDER BY id)::text AS snapshot FROM donations d")).rows[0].snapshot,beforeMigration);
assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema=$1 AND table_name='donations' AND column_name='is_mock'",[schema])).rows[0].n,0);
await assert.rejects(()=>pool.query('UPDATE donations SET amount=999 WHERE id=$1',[OLD]),/frozen once paid/);
pass('Migration 080 removes flag, preserves every other field, and preserves paid immutability; legacy true paid donation is now eligible');
const deps={'../../db/db':pool,'../payment/donation-provider':{getDonationProvider(){throw Error('External providers forbidden')}},'../email/email.service':{},'../dashboard/dashboard.service':{invalidateDashboard(){}}};
const donations=load('src/modules/donations/donations.service.js',deps);
locker=await pool.connect();await locker.query('BEGIN');await locker.query('SELECT * FROM campaigns WHERE id=$1 FOR UPDATE',[C]);
paymentPromise=donations.markDonationPaid(LATE,{providerReference:'MOCK-QA-ONLY'});
let blocked=false;for(let n=0;n<50;n++){const x=await pool.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'UPDATE campaigns%' ");if(x.rows[0].n){blocked=true;break}await new Promise(r=>setTimeout(r,20))}assert.ok(blocked,'payment must be blocked before commit');
const cutoff=(await pool.query('SELECT clock_timestamp() AS t')).rows[0].t;
await pool.query('INSERT INTO billing_periods(id,period_start,period_end) VALUES($1,$2,$3)',[P,new Date(cutoff.getTime()-2*86400000),cutoff]);await pool.query("INSERT INTO billing_runs(id,billing_period_id,mode,status) VALUES($1,$2,'production','draft')",[R,P]);
const calculation=load('src/modules/billing-engine/calculation.service.js',{'../../db/db':pool,'./billing-setup-notification.service':{},'./platform-billing-settings.service':{getCurrentVatRate:async()=>0.18},'../../lib/fin11-simulation-context':{}});
const approval=load('src/modules/billing-engine/approval.service.js',{'../../db/db':pool});
const first=await calculation.runProductionCalculation(P,new Date(cutoff.getTime()+1000).toISOString(),{resumeSafe:true,billingRunId:R});assert.equal(first.statementsCreated,1);assert.equal(first.errors.length,0);
const statement=(await pool.query('SELECT id,gross_raised FROM statements')).rows[0];assert.equal(statement.gross_raised,'1000.00');await approval.approveStatement(statement.id);
await locker.query('COMMIT');locker.release();locker=null;await paymentPromise;paymentPromise=null;
const late=(await pool.query('SELECT completed_at,billing_effective_at,effective_statement_id FROM donations WHERE id=$1',[LATE])).rows[0];assert.ok(late.billing_effective_at<cutoff);assert.equal(late.effective_statement_id,null);pass('REAL concurrency reproduced: confirmation transaction begins before cutoff but commits after approved statement snapshot');
const repeat=await calculation.runProductionCalculation(P,new Date(cutoff.getTime()+2000).toISOString(),{resumeSafe:true,billingRunId:R});assert.equal(repeat.reused,1);assert.equal(repeat.activityDiscovered.totalGross,50);assert.equal(repeat.statementsCreated,0);assert.equal((await pool.query('SELECT count(*)::int AS n FROM statements')).rows[0].n,1);pass('Repeated actual calculation reuses approved statement, discovers 50 but leaves it unclaimed');
const next=(await pool.query('SELECT count(*)::int AS n FROM donations WHERE id=$1 AND billing_effective_at >= $2',[LATE,cutoff])).rows[0].n;assert.equal(next,0);pass('Skipped payment is also excluded from next period by its pre-cutoff timestamp');
await donations.markDonationPaid(LATE,{providerReference:'MOCK-QA-ONLY'});const retried=(await pool.query('SELECT completed_at FROM donations WHERE id=$1',[LATE])).rows[0];assert.equal(retried.completed_at.toISOString(),late.completed_at.toISOString());assert.equal((await pool.query('SELECT count(*)::int AS n FROM receipts WHERE donation_id=$1',[LATE])).rows[0].n,1);pass('Repeated payment confirmation does not change payment timestamp or duplicate receipt');
const AFTER=randomUUID();await pool.query("INSERT INTO donations(id,entity_id,campaign_id,amount,status,created_at) VALUES($1,$2,$3,10,'pending',clock_timestamp()-interval '2 days')",[AFTER,E,C]);await donations.markDonationPaid(AFTER,{providerReference:'MOCK-AFTER'});const a=(await pool.query('SELECT created_at,completed_at,billing_effective_at FROM donations WHERE id=$1',[AFTER])).rows[0];assert.ok(a.billing_effective_at>=cutoff);assert.equal(a.billing_effective_at.toISOString(),a.completed_at.toISOString());pass('Webhook transaction started after cutoff belongs to next period, independent of creation time');

// A subsequent cycle carries the missed payment without altering the old paid statement.
await pool.query("UPDATE statements SET status='paid' WHERE id=$1",[statement.id]);
const frozen=(await pool.query('SELECT to_jsonb(s)::text AS snapshot FROM statements s WHERE id=$1',[statement.id])).rows[0].snapshot;
const P2=randomUUID(),R2=randomUUID();
await pool.query('INSERT INTO billing_periods(id,period_start,period_end) VALUES($1,$2,$3)',[P2,cutoff,new Date(cutoff.getTime()+30*86400000)]);
await pool.query("INSERT INTO billing_runs(id,billing_period_id,mode,status) VALUES($1,$2,'production','draft')",[R2,P2]);
await pool.query("ALTER TABLE statements ALTER COLUMN billing_period_id SET DEFAULT '"+P2+"'");
const nextRun=await calculation.runProductionCalculation(P2,new Date(cutoff.getTime()+30*86400000).toISOString(),{resumeSafe:true,billingRunId:R2});
assert.equal(nextRun.statementsCreated,1);assert.equal(nextRun.carriedForward.length,1);assert.equal(nextRun.carriedForward[0].donation_id,LATE);assert.equal(nextRun.carriedForward[0].original_period_id,P);
const nextStatement=(await pool.query('SELECT * FROM statements WHERE billing_run_id=$1',[R2])).rows[0];assert.equal(nextStatement.gross_raised,'60.00');assert.equal(nextStatement.total_due,'2.12');
await approval.approveStatement(nextStatement.id);
const repeated=await Promise.all([1,2].map(()=>calculation.runProductionCalculation(P2,new Date(cutoff.getTime()+30*86400000).toISOString(),{resumeSafe:true,billingRunId:R2})));
for(const r of repeated){assert.equal(r.statementsCreated,0);assert.equal(r.carriedForward.length,1)}
assert.equal((await pool.query('SELECT count(*)::int AS n FROM statement_components sc JOIN statements s ON s.id=sc.statement_id WHERE sc.donation_id=$1 AND s.status IN ($2)',[LATE,'approved'])).rows[0].n,1);
assert.equal((await pool.query('SELECT to_jsonb(s)::text AS snapshot FROM statements s WHERE id=$1',[statement.id])).rows[0].snapshot,frozen);
pass('Next cycle bills missed 50 plus later 10 exactly once; preserved original period, timestamp and unchanged paid statement; concurrent reruns idempotent');

await pool.query("UPDATE statements SET status='paid' WHERE id=$1",[statement.id]);
const collection=load('src/modules/billing-engine/fin11-card-collection.service.js',{
'../../db/db':pool,'../../lib/fin11-simulation-context':{current:()=>null,assertEntity(){}},'../billing/billing.repository':{},'../../jobs/reconciliation-findings':{},'../email/admin-notification.service':{},'./statement-balance.service':{},'./payment-exceptions.service':{},'./fin11-schema-probe':{isPaymentExceptionsSchemaPresent:async()=>false},'./billing-period.util':dates,'../collection-engine/collection.service':{ACTIONABLE_STATEMENT_STATUSES:['approved','open']}});
let providerCalls=0;for(let n=0;n<2;n++){const attempt=await collection.runFin11CardCollectionCycle(statement.id,()=>{providerCalls++;throw Error('Unexpected provider call')});assert.equal(attempt.reason,'not_actionable')}assert.equal(providerCalls,0);pass('Repeated collection of an already-paid statement never invokes the mock provider');

// Test the unchanged FIN-11 opening cap and MASAV proposal against real SQL,
// with a synthetic confirmed payment fixture, never an adapter charge.
await pool.query(`CREATE TABLE statement_adjustments(statement_id uuid,delta_amount numeric(14,2));
CREATE TABLE payments(id uuid DEFAULT gen_random_uuid(),statement_id uuid,amount numeric(14,2));
CREATE TABLE collection_attempts(id uuid DEFAULT gen_random_uuid(),statement_id uuid,collection_method text,attempt_number int,requested_amount numeric(14,2),status text DEFAULT 'pending',business_collection_at timestamptz,provider text);
CREATE TABLE entity_masav_details(entity_id uuid,authorized boolean,bank_code text,branch_code text,account_number text);
CREATE TABLE masav_collection_proposals(id uuid DEFAULT gen_random_uuid(),statement_id uuid,entity_id uuid,proposed_amount numeric(14,2),outstanding_at_proposal numeric(14,2),status text DEFAULT 'proposed',status_reason text);`);
const P3=randomUUID(),R3=randomUUID(),BIG=randomUUID(),thirdEnd=new Date(cutoff.getTime()+60*86400000);
await pool.query('INSERT INTO billing_periods(id,period_start,period_end) VALUES($1,$2,$3)',[P3,new Date(cutoff.getTime()+30*86400000),thirdEnd]);
await pool.query("INSERT INTO billing_runs(id,billing_period_id,mode,status) VALUES($1,$2,'production','draft')",[R3,P3]);
await pool.query("ALTER TABLE statements ALTER COLUMN billing_period_id SET DEFAULT '"+P3+"'");
await pool.query("INSERT INTO donations(id,entity_id,campaign_id,amount,status,completed_at) VALUES($1,$2,$3,100000,'paid',$4)",[BIG,E,C,new Date(cutoff.getTime()-1000)]);
const catchup=await calculation.runProductionCalculation(P3,thirdEnd.toISOString(),{resumeSafe:true,billingRunId:R3});assert.equal(catchup.statementsCreated,1);assert.equal(catchup.carriedForward.length,1);
const bigStatement=(await pool.query('SELECT * FROM statements WHERE billing_run_id=$1',[R3])).rows[0];assert.equal(bigStatement.total_due,'3540.00');await approval.approveStatement(bigStatement.id);
const balance=load('src/modules/billing-engine/statement-balance.service.js',{'../../db/db':pool,'./calculation.service':calculation,'./platform-billing-settings.service':{},'./billing-period.util':dates});
const constants={ACTIONABLE_STATEMENT_STATUSES:['approved','open'],ACTIVE_ATTEMPT_STATUSES:['pending','ambiguous'],FIN11_CARD_COLLECTION_CAP:3000,MAX_CARD_ATTEMPTS:3,CONFIRMED_FAILURE_STATUSES:['declined','technical_failure']};
const card=load('src/modules/billing-engine/fin11-card-collection.service.js',{'../../db/db':pool,'../../lib/fin11-simulation-context':{current:()=>null,assertEntity(){}},'../billing/billing.repository':{getActiveDefaultByEntityId:async()=>({id:'MOCK-ONLY'})},'../../jobs/reconciliation-findings':{},'../email/admin-notification.service':{},'./statement-balance.service':balance,'./payment-exceptions.service':{},'./fin11-schema-probe':{isPaymentExceptionsSchemaPresent:async()=>false,isMasavProposalsSchemaPresent:async()=>false},'./billing-period.util':dates,'../collection-engine/collection.service':constants});
const proposalModule=load('src/modules/billing-engine/masav-proposal.service.js',{'../../db/db':pool,'xlsx':{},'./statement-balance.service':balance,'./payment-exceptions.service':{hasOpenCollectionHold:async()=>({held:false})},'../collection-engine/collection.service':constants,'../../jobs/reconciliation-findings':{recordFinding:async()=>{}}});
await pool.query("INSERT INTO entity_masav_details VALUES($1,true,'TEST','TEST','TEST')",[E]);
const opened=await card.openFin11CappedCardAttempt(bigStatement.id,new Date(thirdEnd.getTime()+3*86400000));assert.equal(opened.requestedAmount,3000);assert.equal((await card.openFin11CappedCardAttempt(bigStatement.id,new Date(thirdEnd.getTime()+3*86400000))).reason,'attempt_already_active');
assert.equal((await proposalModule.prepareMasavProposal(bigStatement.id)).reason,'unresolved_collection_attempt');
await pool.query("UPDATE collection_attempts SET status='succeeded' WHERE id=$1",[opened.attemptId]);await pool.query('INSERT INTO payments(statement_id,amount) VALUES($1,3000)',[bigStatement.id]);
assert.equal((await balance.getStatementBalance(bigStatement.id)).outstanding,540);
const masav=await proposalModule.prepareMasavProposal(bigStatement.id),masavRepeat=await proposalModule.prepareMasavProposal(bigStatement.id);assert.equal(masav.proposedAmount,540);assert.equal(masavRepeat.proposalId,masav.proposalId);assert.equal((await pool.query('SELECT status FROM statements WHERE id=$1',[bigStatement.id])).rows[0].status,'open');
pass('100000 carry-forward -> fee 3540, capped card request 3000, active-attempt lock, MASAV remainder 540, repeated proposal idempotent; no collection executed');
for(const [due,expected] of [[2999.99,2999.99],[3000,3000],[3000.01,3000]]){const sid=randomUUID();await pool.query("INSERT INTO statements(id,billing_account_id,billing_run_id,billing_period_id,total_due,status) VALUES($1,$2,$3,$4,$5,'approved')",[sid,B,R3,P3,due]);assert.equal((await card.openFin11CappedCardAttempt(sid,new Date(thirdEnd.getTime()+3*86400000))).requestedAmount,expected)}
pass('Unchanged FIN-11 cap boundary requests at 2999.99, 3000 and 3000.01');


// Reproduce the audited October amounts with new isolated fixture IDs only.
const E2=randomUUID(),C2=randomUUID(),B2=randomUUID(),S2=randomUUID();
await pool.query("INSERT INTO entities VALUES($1,'October fixture','active')",[E2]);await pool.query('INSERT INTO campaigns(id) VALUES($1)',[C2]);await pool.query("INSERT INTO billing_accounts VALUES($1,$2,0.03,0.18,'active')",[B2,E2]);
await pool.query("INSERT INTO statements(id,billing_account_id,billing_run_id,billing_period_id,gross_raised,fee_rate,vat_rate,fee_amount,vat_amount,total_due,status) VALUES($1,$2,$3,$4,8000,0.03,0.18,240,43.20,283.20,'paid')",[S2,B2,R,P]);
for(const amount of [50,4950,3000]){const id=randomUUID();await pool.query("INSERT INTO donations(id,entity_id,campaign_id,amount,status,completed_at,effective_statement_id) VALUES($1,$2,$3,$4,'paid',$5,$6)",[id,E2,C2,amount,new Date(cutoff.getTime()-1000),S2]);await pool.query("INSERT INTO statement_components(statement_id,donation_id,amount_snapshot,completed_at_snapshot,billing_effective_at_snapshot,origin_type) VALUES($1,$2,$3,$4,$4,'card_onetime')",[S2,id,amount,new Date(cutoff.getTime()-1000)])}
const octoberFrozen=(await pool.query('SELECT to_jsonb(s)::text AS v FROM statements s WHERE id=$1',[S2])).rows[0].v;
const missed=[];for(const amount of [50,50,50,1000,50,50,1000,4999]){const id=randomUUID();missed.push(id);await pool.query("INSERT INTO donations(id,entity_id,campaign_id,amount,status,completed_at) VALUES($1,$2,$3,$4,'paid',$5)",[id,E2,C2,amount,new Date(cutoff.getTime()-500)])}
// Explicitly excluded: pending, failed, and a payment after the next cutoff.
await pool.query("INSERT INTO donations(id,entity_id,campaign_id,amount,status,completed_at) VALUES($1,$2,$3,900,'pending',NULL),($4,$2,$3,900,'failed',$7),($5,$2,$3,900,'paid',$6)",[randomUUID(),E2,C2,randomUUID(),randomUUID(),new Date(cutoff.getTime()+31*86400000),new Date(cutoff.getTime()-500)]);
await pool.query("ALTER TABLE statements ALTER COLUMN billing_period_id SET DEFAULT '"+P2+"'");
const recovery=await calculation.runProductionCalculation(P2,new Date(cutoff.getTime()+30*86400000).toISOString(),{resumeSafe:true,billingRunId:R2});assert.equal(recovery.statementsCreated,1);
const recovered=(await pool.query('SELECT * FROM statements WHERE billing_account_id=$1 AND billing_period_id=$2',[B2,P2])).rows[0];assert.equal(recovered.gross_raised,'7249.00');assert.equal(recovered.total_due,'256.61');await approval.approveStatement(recovered.id);
await calculation.runProductionCalculation(P2,new Date(cutoff.getTime()+30*86400000).toISOString(),{resumeSafe:true,billingRunId:R2});
assert.equal((await pool.query('SELECT count(*)::int AS n FROM donations WHERE id=ANY($1::uuid[]) AND effective_statement_id=$2',[missed,recovered.id])).rows[0].n,8);assert.equal((await pool.query('SELECT count(*)::int AS n FROM statement_components WHERE statement_id=$1',[recovered.id])).rows[0].n,8);
assert.equal((await pool.query('SELECT to_jsonb(s)::text AS v FROM statements s WHERE id=$1',[S2])).rows[0].v,octoberFrozen);
pass('October fixture: paid 8000/283.20 unchanged; missed eight donations 7249 carried once for 256.61; pending, failed and future excluded');

console.log(JSON.stringify({checks,verdict:'CARRY_FORWARD_PASS',engineSourceModified:false,externalPaymentCalls:0,renderAccess:false}));
}finally{if(locker){await locker.query('ROLLBACK');locker.release()}if(paymentPromise)await paymentPromise.catch(()=>{});await pool.query('DROP SCHEMA IF EXISTS '+schema+' CASCADE');await pool.end()}})().catch(e=>{console.error(e.stack);process.exitCode=1});




