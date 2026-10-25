'use strict';
// Local PostgreSQL + real Express donation routes. Never loads dotenv or remote providers.
const assert=require('node:assert/strict'),Module=require('node:module'),http=require('node:http'),fs=require('node:fs');
process.env.NODE_PATH='C:/DEV/HamonymStudio/hamonym-backend/node_modules';Module._initPaths();
Object.assign(process.env,{DB_HOST:'127.0.0.1',DB_PORT:'5433',DB_NAME:'hamonym_single_clock_release_20261025',DB_USER:'postgres',DB_PASSWORD:'testpass',DB_SSL:'false',EMAIL_PROVIDER:'stub',FRONTEND_URL:'http://localhost:4200'});
for(const name of Object.keys(process.env))if(/CARDCOM|DATABASE_URL|FIN11_SIMULATION|PAYMENT_PROVIDER/.test(name))delete process.env[name];
const root=process.env.HAMONYM_ADMIN_BACKEND_ROOT;if(!root)throw Error('Backend root required');
let external=0;const request=http.request;
http.request=function(options,...args){const host=typeof options==='string'?new URL(options).hostname:options?.hostname||options?.host;if(!['127.0.0.1','localhost'].includes(host)){external++;throw Error('External HTTP forbidden');}return request.call(this,options,...args);};
require('node:https').request=()=>{external++;throw Error('External HTTPS forbidden');};
const original=Module._load;Module._load=function(name,parent,...args){if(name==='dotenv')throw Error('dotenv forbidden');if(/email\/email.service$/.test(name))return {queue(){}};return original.call(this,name,parent,...args);};
// Test the exact task-only donation service, excluding unrelated diagnostic edits.
if(process.env.HAMONYM_APPROVED_DONATION_SOURCE){const file=root+'/src/modules/donations/donations.service.js';const m=new Module(file,module);m.filename=file;m.paths=Module._nodeModulePaths(root+'/src/modules/donations');require.cache[file]=m;m._compile(fs.readFileSync(process.env.HAMONYM_APPROVED_DONATION_SOURCE,'utf8'),file);m.loaded=true;}
const db=require(root+'/src/db/db'),express=require('express');let server;
const post=(path,body)=>new Promise((resolve,reject)=>{const data=JSON.stringify(body);const req=http.request({hostname:'127.0.0.1',port:server.address().port,path,method:'POST',headers:{'content-type':'application/json','content-length':Buffer.byteLength(data)}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(text)}));});req.on('error',reject);req.end(data);});
(async()=>{
 assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,'hamonym_single_clock_release_20261025');
 const tag='checkout_'+Date.now();const role=(await db.query("INSERT INTO roles(code,name) VALUES($1,'Isolated') RETURNING id",[tag])).rows[0].id;
 const admin=(await db.query("INSERT INTO users(role_id,email,is_super_admin) VALUES($1,$2,true) RETURNING id",[role,tag+'@isolated.local'])).rows[0].id;
 const entity=(await db.query("INSERT INTO entities(display_name,created_by_user_id,status) VALUES($1,$2,'active') RETURNING id",[tag,admin])).rows[0].id;
 const campaign=(await db.query("INSERT INTO campaigns(entity_id,slug,title) VALUES($1,$2,'Mock checkout fixture') RETURNING id",[entity,tag])).rows[0].id;
 await db.query("INSERT INTO billing_accounts(entity_id,fee_rate,vat_rate,preferred_collection_method,enforcement_status) VALUES($1,.03,.18,'card','active')",[entity]);
 await db.query("INSERT INTO entity_billing(entity_id,token,exp_month,exp_year,is_default,status) VALUES($1,'MOCK_ONLY','12','2030',true,'active')",[entity]);
 const clock=require(root+'/src/modules/billing-engine/business-clock-simulation.service');await clock.setFixed('2026-10-28T19:59:00+02:00',admin);
 const app=express();app.use(express.json());app.use('/api/donations',require(root+'/src/modules/donations/donations.routes'));server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.on('listening',resolve));
 const donor={name:'Test Donor',email:'test@isolated.local',phone:'0500000000',idNumber:'024884132'};
 const create=await post('/api/donations',{campaignId:campaign,donor,amount:5100,embedded:true});assert.equal(create.status,200,JSON.stringify(create.body));assert.equal(create.body.paymentProvider,'mock');
 const id=create.body.donationId,session=new URL(create.body.url).searchParams.get('session');assert.match(session,/^hamonym-mock:/);
 assert.equal((await db.query('SELECT status FROM donations WHERE id=$1',[id])).rows[0].status,'pending');
 const complete=()=>post('/api/donations/mock-complete',{id,session,status:'paid'});
 const [one,two]=await Promise.all([complete(),complete()]);assert.equal(one.status,200,JSON.stringify(one.body));assert.equal(two.status,200,JSON.stringify(two.body));
 assert.equal((await db.query('SELECT count(*)::int AS n FROM receipts WHERE donation_id=$1',[id])).rows[0].n,1);
 const paid=(await db.query('SELECT status,is_mock,provider_reference,provider_charged_at,completed_at FROM donations WHERE id=$1',[id])).rows[0];assert.equal(paid.status,'paid');assert.equal(paid.is_mock,false);assert.match(paid.provider_reference,/^mock:paid:hamonym-mock:/);assert.equal(paid.provider_charged_at.toISOString(),'2026-10-28T17:59:00.000Z');assert.notEqual(paid.completed_at.toISOString(),paid.provider_charged_at.toISOString());
 assert.equal(Number((await db.query('SELECT current_amount FROM campaigns WHERE id=$1',[campaign])).rows[0].current_amount),5100);
 assert.equal((await post('/api/donations/mock-complete',{id,session,status:'failed'})).status,409);
 const history=(await db.query("INSERT INTO donations(campaign_id,entity_id,amount,status,low_profile_id) VALUES($1,$2,50,'pending','historical-real-session') RETURNING id",[campaign,entity])).rows[0].id;
 assert.equal((await post('/api/donations/mock-complete',{id:history,session,status:'paid'})).status,403);assert.equal((await db.query('SELECT status FROM donations WHERE id=$1',[history])).rows[0].status,'pending');
 const failed=await post('/api/donations',{campaignId:campaign,donor,amount:20});const failedSession=new URL(failed.body.url).searchParams.get('session');assert.equal((await post('/api/donations/mock-complete',{id:failed.body.donationId,session:failedSession,status:'failed'})).status,200);assert.equal((await db.query('SELECT count(*)::int AS n FROM receipts WHERE donation_id=$1',[failed.body.donationId])).rows[0].n,0);
 const cutoff=await clock.setFixed('2026-10-28T20:08:00+02:00',admin);assert.equal(cutoff.results[0].status,'success',JSON.stringify(cutoff));
 const statement=(await db.query('SELECT s.id,s.status,s.total_due FROM statements s JOIN billing_accounts b ON b.id=s.billing_account_id WHERE b.entity_id=$1',[entity])).rows[0];assert.equal(statement.status,'paid');assert.equal(Number(statement.total_due),180.54);
 const api=await require(root+'/src/modules/platform/collection-ops/collection-ops.service').getFinancialOverview({year:2026,month:10});assert.equal(api.cutoffPassed,true);
 await clock.setFixed('2026-10-28T20:08:00+02:00',admin);assert.equal((await db.query('SELECT count(*)::int AS n FROM payments WHERE statement_id=$1',[statement.id])).rows[0].n,1);
 const recurring=await post('/api/donations',{campaignId:campaign,donor,amount:100,recurring:true,installments:3});assert.equal(recurring.status,200,JSON.stringify(recurring.body));const recurringSession=new URL(recurring.body.url).searchParams.get('session');assert.equal((await post('/api/donations/mock-complete',{id:recurring.body.donationId,session:recurringSession,status:'paid'})).status,200);
 const instruction=(await db.query('SELECT ri.* FROM recurring_instructions ri JOIN donations d ON d.recurring_instruction_id=ri.id WHERE d.id=$1',[recurring.body.donationId])).rows[0];assert.equal(instruction.status,'active',instruction.failure_reason);assert.ok(instruction.cardcom_recurring_id<0);assert.equal(instruction.total_installments,3);
 await require(root+'/src/modules/donations/recurring.service').pauseRecurring(instruction.id);await require(root+'/src/modules/donations/recurring.service').resumeRecurring(instruction.id);
 assert.equal((await db.query('SELECT status FROM recurring_instructions WHERE id=$1',[instruction.id])).rows[0].status,'active');
 assert.equal(external,0);console.log(JSON.stringify({result:'PASS',httpCheckout:true,concurrentCompletion:true,receiptCount:1,historicalPaymentUnchanged:true,failedPaymentNoReceipt:true,statementId:statement.id,mockFee:180.54,billingApi:true,idempotency:true,recurringSignupPauseResume:true,externalCalls:external}));
})().catch(error=>{console.error('FAIL',error.code||'',error.message,error.stack);process.exitCode=1;}).finally(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await db.end();process.exit(process.exitCode||0);});
