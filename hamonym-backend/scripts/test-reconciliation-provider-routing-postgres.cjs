'use strict';
// Real SQL + existing resolver, isolated PostgreSQL only; no external provider access.
const assert=require('node:assert/strict'),crypto=require('node:crypto');
assert.equal(process.env.DB_HOST,'127.0.0.1');assert.equal(process.env.DB_PORT,'5433');assert.match(process.env.DB_NAME||'',/^hamonym_remove_mock_integration_/);
require('node:https').request=()=>{throw Error('External provider forbidden')};
const db=require('../src/db/db');const job=require('../src/jobs/collection-attempt-reconciliation.job');const ops=require('../src/modules/platform/billing-ops/billing-ops.service');
(async()=>{try{
const user=(await db.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0].id;const year=2200+crypto.randomInt(1000);const start=year+'-01-01T00:00:00Z',end=year+'-02-01T00:00:00Z';
const period=(await db.query('INSERT INTO billing_periods(period_start,period_end) VALUES($1,$2) RETURNING id',[start,end])).rows[0].id;
const run=(await db.query("INSERT INTO billing_runs(billing_period_id,mode,as_of,status,started_at) VALUES($1,'production',now(),'draft',now()) RETURNING id",[period])).rows[0].id;
const ids={};for(const [label,provider,method] of [['mock','fin11_mock','card'],['real','cardcom','card'],['unknown','unknown','card'],['masav','cardcom','masav']]){
 const entity=(await db.query("INSERT INTO entities(display_name,created_by_user_id,status) VALUES($1,$2,'active') RETURNING id",['ZZZ_TEST_RECON_'+label+'_'+crypto.randomUUID(),user])).rows[0].id;
 const account=(await db.query("INSERT INTO billing_accounts(entity_id,fee_rate,vat_rate,preferred_collection_method,enforcement_status) VALUES($1,0.03,0.18,'card','active') RETURNING id",[entity])).rows[0].id;
 const stmt=(await db.query("INSERT INTO statements(billing_account_id,billing_period_id,billing_run_id,gross_raised,fee_rate,vat_rate,fee_amount,vat_amount,total_due,status) VALUES($1,$2,$3,1000,0.03,0.18,30,5.4,35.4,'approved') RETURNING id",[account,period,run])).rows[0].id;
 const attempt=(await db.query("INSERT INTO collection_attempts(statement_id,collection_method,attempt_number,status,requested_amount,provider,initiated_at) VALUES($1,$2,1,'pending',35.4,$3,'2020-01-01') RETURNING id",[stmt,method,provider])).rows[0].id;ids[label]={entity,stmt,attempt};
}
const scoped={query:(sql,args)=>db.query(sql.includes('SELECT ca.id, ca.statement_id')?sql.replace("WHERE ca.collection_method",'WHERE ca.id=ANY($2::uuid[]) AND ca.collection_method'):sql,sql.includes('SELECT ca.id, ca.statement_id')?[...args,Object.values(ids).map(x=>x.attempt)]:args)};
const first=await job.reconcileStuckAttempts(scoped,{now:new Date('2026-10-29')});assert.equal(first.checked,3);assert.equal(first.reconciled,1);assert.equal(first.lookupFailed,2);console.log('PASS real SQL routes mock only; CardCom blocked; unknown blocked; MASAV excluded');
const payment=await db.query('SELECT provider,amount FROM payments WHERE collection_attempt_id=$1',[ids.mock.attempt]);assert.equal(payment.rows.length,1);assert.equal(payment.rows[0].provider,'fin11_mock');assert.equal(Number(payment.rows[0].amount),35.4);assert.equal((await db.query('SELECT status FROM statements WHERE id=$1',[ids.mock.stmt])).rows[0].status,'paid');console.log('PASS existing resolver records correct mock payment and closes statement');
await job.reconcileStuckAttempts(scoped,{now:new Date('2026-10-29')});await ops.reconcileCollectionAttempt({attemptId:ids.mock.attempt,superAdminUserId:user});assert.equal((await db.query('SELECT count(*)::int n FROM payments WHERE collection_attempt_id=$1',[ids.mock.attempt])).rows[0].n,1);console.log('PASS repeated Cron and manual reconciliation preserve exactly one payment');
await assert.rejects(()=>ops.reconcileCollectionAttempt({attemptId:ids.real.attempt,superAdminUserId:user}),{code:'REAL_COLLECTION_DISABLED_DURING_PILOT'});await assert.rejects(()=>ops.reconcileCollectionAttempt({attemptId:ids.unknown.attempt,superAdminUserId:user}),{code:'RECONCILE_PROVIDER_UNKNOWN'});for(const label of ['real','unknown','masav'])assert.equal((await db.query('SELECT status FROM collection_attempts WHERE id=$1',[ids[label].attempt])).rows[0].status,'pending');console.log('PASS blocked providers remain financially unchanged; no mock fallback');
console.log(JSON.stringify({result:'PASS',checks:4,database:process.env.DB_NAME,externalProviderCalls:0}));
}finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
