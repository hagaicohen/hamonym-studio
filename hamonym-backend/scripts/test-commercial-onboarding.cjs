const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const policy = require('../src/modules/entities/commercial-entity');
function load(file, dependencies) {
 const exports = {};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), {
  exports, require: name => {
   if (Object.hasOwn(dependencies,name)) return dependencies[name];
   throw new Error('Unexpected dependency: '+name);
  }, console, process: {env:{}}, Buffer, URL, setTimeout,
 });
 return exports;
}
(async () => {
 let count=0;
 for (const type of ['association','chalatz','political_party_registered','sole_exempt','sole_registered','company']) {
  let billing=0, publication=0; const queries=[];
  const client={release(){},async query(sql){queries.push(sql);
   if(sql.startsWith('SELECT status'))return {rows:[{status:'pending_review'}]};
   if(sql.includes('UPDATE entities'))return {rows:[{id:'entity',entity_type:type,status:'active'}]};
   if(sql.includes('INSERT INTO platform_audit_log'))return {rows:[{id:'audit'}]};
   return {rows:[]};
  }};
  const service=load('../src/modules/platform/platform.service.js',{
   '../entities/organization-lifecycle':require('../src/modules/entities/organization-lifecycle'),
   '../entities/commercial-entity':policy, crypto:require('node:crypto'),jsonwebtoken:{},bcrypt:{},
   '../../db/db':{connect:async()=>client},'../entities/entities.service':{},
   '../ambassadors/ambassadors.service':{},'../donations/donations.service':{},
   '../email/email.service':{},'../email/admin-notification.service':{},
   '../billing-engine/provisioning.service':{createBillingAccount:async args=>{billing++;assert.equal(args.feeRate,.03)}},
   '../campaigns/campaigns.service':{publishRequestedCampaigns:async(id,c)=>{publication++;assert.equal(c,client);return []}},
   '../billing-engine/billing-setup-notification.service':{resolveEntityAdmins:async()=>[]},
  });
  await service.approve('entity',9,'Approved');
  assert.equal(billing,policy.isCommercialEntity(type)?0:1);assert.equal(publication,1);
  assert(queries.includes('COMMIT'));count++;
 }
 const verified={entity_id:'entity',entity_type:'company',cardcom_connection_status:'success',cardcom_terminal_number:'test',cardcom_api_username:'test',cardcom_api_password_encrypted:'test'};
 const active={fee_rate:'0',enforcement_status:'active'};
 for(const [account,entity] of [[null,verified],[{...active,enforcement_status:'suspended'},verified],[active,{...verified,cardcom_connection_status:'skipped'}],[active,{...verified,cardcom_api_password_encrypted:null}]]) {
  await assert.rejects(policy.assertCommercialPaymentReady({query:async()=>({rows:account?[account]:[]})},entity),e=>e.code==='COMMERCIAL_PAYMENT_NOT_READY');count++;
 }
 await policy.assertCommercialPaymentReady({query:async()=>({rows:[active]})},verified);count++;
 await policy.assertCommercialPaymentReady({query(){throw Error('Nonprofit must not query billing')}},{entity_type:'association'});count++;
 const donation=load('../src/modules/donations/donations.service.js',{
  '../../db/db':{query:async sql=>{if(sql.includes('FROM campaigns c'))return {rows:[{...verified,entity_status:'active'}]};if(sql.startsWith('SELECT fee_rate'))return {rows:[]};throw Error('Unexpected write/query');}},
  '../payment/donation-provider':{},'../email/email.service':{},'../entities/commercial-entity':policy,
 });
 await assert.rejects(donation.createDonation({campaignId:'test',donor:{},amount:10}),e=>e.code==='COMMERCIAL_PAYMENT_NOT_READY');count++;
 const identity=require('../src/modules/entities/entity-identity');
 assert.deepEqual(identity.scope('company'),{jurisdiction:'IL',identifierType:'company_number'});count++;
 console.log(`PASS: ${count} commercial/nonprofit approval, publication and payment mock scenarios; no database/provider access`);
})().catch(error=>{console.error(error);process.exitCode=1});
