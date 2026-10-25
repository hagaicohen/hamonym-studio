'use strict';
const assert=require('node:assert/strict');
const Module=require('node:module');
process.env.NODE_PATH='C:/DEV/HamonymStudio/hamonym-backend/node_modules';Module._initPaths();
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'5433',DB_NAME:'hamonym_single_clock_release_20261025',DB_USER:'postgres',DB_PASSWORD:'testpass',DB_SSL:'false',ENABLE_JOB_SCHEDULER:'false',EMAIL_PROVIDER:'stub'});
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
 assert.equal((await pool.query('SELECT current_database() name,inet_server_addr() host')).rows[0].name,'hamonym_single_clock_release_20261025');
 const tag='fin11_'+Date.now();
 const role=(await pool.query("INSERT INTO roles(code,name) VALUES($1,'Isolated test') RETURNING id",[tag])).rows[0].id;
 const admin=(await pool.query("INSERT INTO users(role_id,email,is_super_admin) VALUES($1,$2,true) RETURNING id",[role,tag+'@isolated.local'])).rows[0].id;
 const entity=(await pool.query("INSERT INTO entities(display_name,created_by_user_id,status) VALUES($1,$2,'active') RETURNING id",[tag,admin])).rows[0].id;
 const campaign=(await pool.query("INSERT INTO campaigns(entity_id,slug,title) VALUES($1,$2,'Isolated simulator') RETURNING id",[entity,tag])).rows[0].id;
 await pool.query("INSERT INTO billing_accounts(entity_id,fee_rate,vat_rate,preferred_collection_method,enforcement_status) VALUES($1,.03,.18,'card','active')",[entity]);
 await pool.query("INSERT INTO entity_billing(entity_id,token,exp_month,exp_year,is_default,status) VALUES($1,'FIN11_MOCK_NOT_A_PROVIDER_TOKEN','12','2030',true,'active')",[entity]);
 await pool.query("INSERT INTO donations(campaign_id,entity_id,amount,status,is_mock,completed_at) VALUES($1,$2,5100,'paid',false,'2026-10-20T10:00Z')",[campaign,entity]);
 await pool.query('INSERT INTO platform_billing_settings(id,vat_rate) VALUES(1,.18) ON CONFLICT(id) DO NOTHING');
 // Load the actual Hamonym clock with a controlled wall clock, not an Admin override.
 const fs=require('node:fs'),vm=require('node:vm');let wallAt='2026-10-28T17:59:00Z';
 const NativeDate=Date;class WallDate extends NativeDate {constructor(...args){super(...(args.length?args:[wallAt]));} static now(){return NativeDate.parse(wallAt);}}
 const clockFile=root+'/src/lib/clock.js';const clockModule={exports:{}};
 vm.runInNewContext(fs.readFileSync(clockFile,'utf8'),{module:clockModule,exports:clockModule.exports,Date:WallDate,Intl,process:{env:process.env}},{filename:clockFile});
 require(clockFile);require.cache[require.resolve(clockFile)].exports=clockModule.exports;
 const jobs=require(root+'/src/jobs');
 const tick=async()=>{const result=await jobs.run('billing-monthly-cycle',{triggeredBy:'isolated-real-clock-test'});assert.equal(result.status,'success');return result.result;};
 const engine=require(root+'/src/modules/collection-engine/collection.service');
 // Job modules have already captured resolveAttempt, so inject one failed finalization at the DB boundary instead.

 const api=require(root+'/src/modules/platform/collection-ops/collection-ops.service');
 await pool.query('DELETE FROM admin_simulation_clock'); await pool.query('DELETE FROM fin11_simulation_clock'); const baseline=await api.getFinancialOverview({year:2026,month:10}); const before=await tick();
 console.log('BEFORE',JSON.stringify(before));
 assert.equal((await pool.query('SELECT count(*)::int n FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows[0].n,0);
 wallAt='2026-10-28T18:08:00Z';
 const connect=pool.connect.bind(pool);let injected=false;
 pool.connect=(...args)=>{if(typeof args[0]==='function')return connect(...args);return connect(...args).then(client=>{const query=client.query.bind(client),release=client.release.bind(client);client.query=async(sql,params)=>{if(!injected && sql.includes('UPDATE collection_attempts') && sql.includes('provider_reference')){injected=true;throw Object.assign(new Error('isolated finalization crash'),{code:'TEST_CRASH'});}return query(sql,params);};client.release=(...args)=>{client.query=query;return release(...args);};return client;});};
 let interrupted;try{interrupted=await tick();}finally{pool.connect=connect;}
 assert.equal(injected,true,'Crash must be injected after opening the attempt');
 const pending=(await pool.query("SELECT ca.id FROM collection_attempts ca JOIN statements s ON s.id=ca.statement_id JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE ba.entity_id=$1 AND ca.status='pending'",[entity])).rows;
 assert.equal(pending.length,1);const pendingId=pending[0].id;
 const after=await tick();assert.equal(after.results[1].result.recovered,1);

 console.log('AFTER',JSON.stringify(after));
 const statements=(await pool.query('SELECT s.id,s.status,s.total_due FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows;
 console.log('STATEMENTS',JSON.stringify(statements));assert.equal(statements.length,1);assert.equal(statements[0].status,'paid');assert.equal(Number(statements[0].total_due),180.54);
 const sid=statements[0].id;
 const attempts=(await pool.query('SELECT status,provider,business_collection_at,created_at FROM collection_attempts WHERE statement_id=$1',[sid])).rows;
 console.log('ATTEMPTS',JSON.stringify(attempts));assert.equal(attempts.length,1);assert.equal(attempts[0].provider,'fin11_mock');assert.equal(attempts[0].status,'succeeded');assert.equal(attempts[0].business_collection_at.toISOString(),'2026-10-28T18:08:00.000Z');
 const payments=(await pool.query('SELECT amount FROM payments WHERE statement_id=$1',[sid])).rows;assert.equal(payments.length,1);assert.equal(Number(payments[0].amount),180.54);
 const overview=await api.getFinancialOverview({year:2026,month:10});console.log('OVERVIEW',JSON.stringify(overview));assert.equal(Math.round((overview.paidConfirmed-baseline.paidConfirmed)*100),18054);assert.equal(Math.round((overview.cardCollected-baseline.cardCollected)*100),18054);assert.equal(overview.cutoffPassed,true);assert.equal(overview.openBalance,0);
 const history=await api.searchStatementHistory({entityId:entity});console.log('HISTORY',JSON.stringify(history));
 const repeat=await tick();
 wallAt='2026-10-28T18:09:00Z';await tick();
 assert.equal((await pool.query('SELECT count(*)::int n FROM collection_attempts WHERE statement_id=$1',[sid])).rows[0].n,1);
 assert.equal((await pool.query('SELECT count(*)::int n FROM payments WHERE statement_id=$1',[sid])).rows[0].n,1);
 assert.equal((await pool.query('SELECT count(*)::int n FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows[0].n,1);
 assert.equal(externalCalls,0);assert.equal((await pool.query('SELECT id FROM collection_attempts WHERE statement_id=$1',[sid])).rows[0].id,pendingId);console.log('PASS scheduler entry + real-clock source, mock fee 180.54, interrupted finalization recovery, repeated ticks, same attempt; no Admin override or external request');
})().catch(e=>{console.error('FAIL',e.code||'',e.message,e.stack);process.exitCode=1;}).finally(async()=>{await pool.end();process.exit(process.exitCode||0);});
