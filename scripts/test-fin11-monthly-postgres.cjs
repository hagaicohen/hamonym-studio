'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
process.env.NODE_PATH='C:/DEV/HamonymStudio/hamonym-backend/node_modules';Module._initPaths();
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'5433',DB_NAME:'hamonym_test',DB_USER:'postgres',DB_PASSWORD:'testpass',DB_SSL:'false',HAMONYM_SIMULATION_MODE:'on',FIN11_SIMULATION_COLLECTION_ENABLED:'true',FIN11_SIMULATION_PAYMENT_PROVIDER:'mock',FIN11_SIMULATION_AUTO_APPROVAL_ENABLED:'true',FIN11_AUTO_APPROVAL_ENABLED:'false',ENABLE_JOB_SCHEDULER:'false',EMAIL_PROVIDER:'stub'});
for(const key of Object.keys(process.env))if(/CARDCOM|DATABASE_URL/.test(key))delete process.env[key];
let externalCalls=0;
for(const proto of ['node:http','node:https'])require(proto).request=()=>{externalCalls++;throw Error('External HTTP forbidden');};
const root=process.env.HAMONYM_ADMIN_BACKEND_ROOT; if(!root)throw Error('HAMONYM_ADMIN_BACKEND_ROOT is required');
const originalLoad=Module._load;
Module._load=function(name,parent,...args){
 if(name==='dotenv')throw Error('dotenv is forbidden');
 if(name.includes('cardcom-token-charge.adapter'))return {charge:async()=>{externalCalls++;throw Error('CardCom forbidden');},reconcile:async()=>{externalCalls++;throw Error('CardCom forbidden');}};
 return originalLoad.call(this,name,parent,...args);
};
const pool=require(root+'/src/db/db');
(async()=>{
 assert.equal((await pool.query('SELECT current_database() name,inet_server_addr() host')).rows[0].name,'hamonym_test');
 const tag='fin11_'+Date.now();
 const role=(await pool.query("INSERT INTO roles(code,name) VALUES($1,'Isolated test') RETURNING id",[tag])).rows[0].id;
 const admin=(await pool.query("INSERT INTO users(role_id,email,is_super_admin) VALUES($1,$2,true) RETURNING id",[role,tag+'@isolated.local'])).rows[0].id;
 const entity=(await pool.query("INSERT INTO entities(display_name,created_by_user_id,status) VALUES($1,$2,'active') RETURNING id",[tag,admin])).rows[0].id;
 const campaign=(await pool.query("INSERT INTO campaigns(entity_id,slug,title) VALUES($1,$2,'Isolated simulator') RETURNING id",[entity,tag])).rows[0].id;
 await pool.query("INSERT INTO billing_accounts(entity_id,fee_rate,vat_rate,preferred_collection_method,enforcement_status) VALUES($1,.03,.18,'card','active')",[entity]);
 await pool.query("INSERT INTO entity_billing(entity_id,token,exp_month,exp_year,is_default,status) VALUES($1,'FIN11_MOCK_NOT_A_PROVIDER_TOKEN','12','2030',true,'active')",[entity]);
 await pool.query("INSERT INTO donations(campaign_id,entity_id,amount,status,is_mock,completed_at) VALUES($1,$2,5100,'paid',false,'2026-10-20T10:00Z')",[campaign,entity]);
 await pool.query('INSERT INTO platform_billing_settings(id,vat_rate) VALUES(1,.18) ON CONFLICT(id) DO NOTHING');
 process.env.FIN11_SIMULATION_ENTITY_IDS=entity;
 const clock=require(root+'/src/modules/billing-engine/business-clock-simulation.service');
 const api=require(root+'/src/modules/platform/collection-ops/collection-ops.service');
 await pool.query('DELETE FROM admin_simulation_clock'); await pool.query('DELETE FROM fin11_simulation_clock'); const baseline=await api.getFinancialOverview({year:2026,month:10}); const before=await clock.setFixed('2026-10-28T19:59:00+02:00',admin);
 console.log('BEFORE',JSON.stringify(before));
 assert.equal((await pool.query('SELECT count(*)::int n FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows[0].n,0);
 const after=await clock.setFixed('2026-10-28T20:08:00+02:00',admin);
 console.log('AFTER',JSON.stringify(after));
 const statements=(await pool.query('SELECT s.id,s.status,s.total_due FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows;
 console.log('STATEMENTS',JSON.stringify(statements));assert.equal(statements.length,1);assert.equal(statements[0].status,'paid');assert.equal(Number(statements[0].total_due),180.54);
 const sid=statements[0].id;
 const attempts=(await pool.query('SELECT status,provider,business_collection_at,created_at FROM collection_attempts WHERE statement_id=$1',[sid])).rows;
 console.log('ATTEMPTS',JSON.stringify(attempts));assert.equal(attempts.length,1);assert.equal(attempts[0].provider,'fin11_mock');assert.equal(attempts[0].status,'succeeded');assert.equal(attempts[0].business_collection_at.toISOString(),'2026-10-28T18:08:00.000Z');
 const payments=(await pool.query('SELECT amount FROM payments WHERE statement_id=$1',[sid])).rows;assert.equal(payments.length,1);assert.equal(Number(payments[0].amount),180.54);
 const overview=await api.getFinancialOverview({year:2026,month:10});console.log('OVERVIEW',JSON.stringify(overview));assert.equal(Math.round((overview.paidConfirmed-baseline.paidConfirmed)*100),18054);assert.equal(Math.round((overview.cardCollected-baseline.cardCollected)*100),18054);assert.equal(overview.cutoffPassed,true);assert.equal(overview.openBalance,0);
 const history=await api.searchStatementHistory({entityId:entity});console.log('HISTORY',JSON.stringify(history));
 const repeat=await clock.setFixed('2026-10-28T20:08:00+02:00',admin);assert.equal(repeat.skipped,'already_dispatched');
 await clock.setFixed('2026-10-28T20:09:00+02:00',admin);
 assert.equal((await pool.query('SELECT count(*)::int n FROM collection_attempts WHERE statement_id=$1',[sid])).rows[0].n,1);
 assert.equal((await pool.query('SELECT count(*)::int n FROM payments WHERE statement_id=$1',[sid])).rows[0].n,1);
 assert.equal((await pool.query('SELECT count(*)::int n FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows[0].n,1);
 assert.equal(externalCalls,0);console.log('PASS full monthly simulator, API, repeated and later clock deduplication; external requests=0');
 // Exercise production entry point on the same isolated PostgreSQL, never its payment provider.
 const monthly=require(root+'/src/jobs/billing-monthly-cycle.job');
 process.env.HAMONYM_SIMULATION_MODE='off'; process.env.FIN11_SIMULATION_COLLECTION_ENABLED='false';
 async function productionCase(year, authorized, failFirst) {
   const slug='production_'+year+'_'+Date.now();
   const e=(await pool.query("INSERT INTO entities(display_name,created_by_user_id,status) VALUES($1,$2,'active') RETURNING id",[slug,admin])).rows[0].id;
   const c=(await pool.query("INSERT INTO campaigns(entity_id,slug,title) VALUES($1,$2,'Production path fixture') RETURNING id",[e,slug])).rows[0].id;
   const account=(await pool.query("INSERT INTO billing_accounts(entity_id,fee_rate,vat_rate,preferred_collection_method,enforcement_status) VALUES($1,.03,.18,'card','active') RETURNING id",[e])).rows[0].id;
   await pool.query("INSERT INTO donations(campaign_id,entity_id,amount,status,is_mock,completed_at) VALUES($1,$2,5100,'paid',false,$3)",[c,e,`${year}-10-20T10:00Z`]);
   process.env.FIN11_AUTO_APPROVAL_ENABLED=String(authorized);
   const originalConnect=pool.connect.bind(pool);let failed=false;
   if(failFirst)pool.connect=(...args)=>{if(typeof args[0]==='function')return originalConnect(...args);return originalConnect(...args).then(client=>{const query=client.query.bind(client);client.query=async(sql,params)=>{if(!failed&&sql.includes('INSERT INTO statements')&&params[0]===account){failed=true;throw Object.assign(new Error('isolated partial failure'),{code:'TEST_INJECTED'});}return query(sql,params);};const release=client.release.bind(client);client.release=(...args)=>{client.query=query;return release(...args);};return client;});};
   let first;
   try {first=await monthly.handler(pool,{now:new Date(`${year}-10-28T18:08Z`)});}finally{pool.connect=originalConnect;}
   if(failFirst){assert.equal(failed,true);assert.equal(first.statementsCreated,0);first=await monthly.handler(pool,{now:new Date(`${year}-10-28T18:08Z`)});assert.equal(first.statementsCreated,1);}
   const rows=(await pool.query('SELECT id,status,total_due FROM statements WHERE billing_account_id=$1',[account])).rows;
   assert.equal(rows.length,1);assert.equal(rows[0].status,authorized?'approved':'draft');assert.equal(Number(rows[0].total_due),180.54);
   const again=await monthly.handler(pool,{now:new Date(`${year}-10-28T18:09Z`)});assert.equal(again.reason,'already_calculated');
   assert.equal((await pool.query('SELECT count(*)::int n FROM collection_attempts WHERE statement_id=$1',[rows[0].id])).rows[0].n,0);
   console.log('PASS production authorization='+authorized+', partial recovery='+failFirst+', no collection scheduling');
 }
 const year=2700+Math.floor(Math.random()*1000);
 await productionCase(year,false,false);await productionCase(year+1,true,true);
 assert.equal(externalCalls,0);
})().catch(e=>{console.error('FAIL',e.code||'',e.message,e.stack);process.exitCode=1;}).finally(async()=>{await pool.end();process.exit(process.exitCode||0);});
