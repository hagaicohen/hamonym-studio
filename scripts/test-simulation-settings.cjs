'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const front=path.join(__dirname,'..'),ts=require(path.join(front,'node_modules/typescript'));
function fixture(){
 const file='src/app/modules/platform/pages/platform-general-settings-page/platform-general-settings-page.component.ts';
 const js=ts.transpileModule(fs.readFileSync(path.join(front,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
 const state={calls:[],reads:0,campaignReads:0,statusReads:[],handlers:[],resetCalls:[]};
 const status={simulationEnabled:false,overrideActive:false,collectionAuthorized:false,businessNow:'2026-10-22T10:00:00Z',realNow:'2026-10-22T10:00:00Z'};
 const clock={getStatus:()=>({subscribe(h){state.reads++;h.next({...status});}})};
 for(const name of ['setEnabled','setFixed','reset'])clock[name]=(...args)=>({subscribe(h){state.calls.push({name,args});state.handler=h;}});
 const tokens={SimulationClockService:clock,BillingSettingsService:{get:()=>({subscribe(h){h.next({setting:{vat_rate:0.18}});}})},PlatformService:{getCampaigns:()=>({subscribe(h){state.campaignReads++;state.listHandler=h;h.next({campaigns:[{id:'c1',title:'קמפיין בדיקה'}]});}})},CampaignResetService:{getStatus:id=>({subscribe(h){state.statusReads.push(id);state.handlers.push(h);}}),reset:(...args)=>({subscribe(h){state.resetCalls.push(args);state.resetHandler=h;}})}};
 const module={exports:{}};
 vm.runInNewContext(js,{module,exports:module.exports,Intl,Date,require(name){
  if(name==='@angular/core')return {Component:()=>()=>{},inject:token=>{assert.ok(tokens[token.name],'Unexpected service '+token.name);return tokens[token.name];}};
  const names={'@angular/common':['CommonModule'],'@angular/forms':['FormsModule'],'../../services/billing-settings.service':['BillingSettingsService'],'../../services/simulation-clock.service':['SimulationClockService'],'../../services/platform.service':['PlatformService'],'../../services/campaign-reset.service':['CampaignResetService']};
  assert.ok(names[name],'Blocked unexpected import '+name);return Object.fromEntries(names[name].map(n=>[n,{[n]:class{}}[n]]));
 }});
 return {page:new module.exports.PlatformGeneralSettingsPageComponent(),state,status};
}
test('opening settings reads clock and named campaigns only; prefills Israel time',()=>{
 const {page,state}=fixture();page.ngOnInit();assert.equal(state.reads,1);assert.equal(state.campaignReads,1);assert.equal(state.calls.length,0);assert.equal(page.campaigns[0].title,'קמפיין בדיקה');assert.equal(page.fixedTimeInput,'13:00');
});
test('one set-fixed request activates simulation server-side and blocks repeated submission',()=>{
 const {page,state,status}=fixture();page.ngOnInit();page.fixedDateInput='2026-10-28';page.fixedTimeInput='20:00';page.setClockFixed();page.setClockFixed();
 assert.equal(state.calls.length,1);assert.equal(state.calls[0].name,'setFixed');assert.equal(state.calls[0].args[0],'2026-10-28T18:00:00.000Z');
 state.handler.next({...status,simulationEnabled:true,overrideActive:true});assert.equal(page.clockStatus.simulationEnabled,true);assert.equal(page.clockStatus.collectionAuthorized,false);assert.equal(page.clockActionBusy,false);
 page.resetClock();assert.equal(state.calls[1].name,'reset');state.handler.next({...status,simulationEnabled:true});assert.equal(page.clockStatus.overrideActive,false);
});
test('time conversion uses Israel DST; invalid or missing time never submits',()=>{
 const {page,state}=fixture();page.ngOnInit();page.fixedDateInput='2026-07-28';page.fixedTimeInput='20:00';page.setClockFixed();assert.equal(state.calls[0].args[0],'2026-07-28T17:00:00.000Z');
 state.handler.error({});page.fixedDateInput='invalid';page.setClockFixed();assert.equal(state.calls.length,1);assert.ok(page.clockActionError);assert.equal(page.clockActionBusy,false);
 page.fixedDateInput='';page.setClockFixed();assert.equal(state.calls.length,1);
});
test('set-fixed failure does not pretend simulation was enabled',()=>{
 const {page,state}=fixture();page.ngOnInit();page.setClockFixed();state.handler.error({error:{error:'עדכון הזמן נכשל'}});assert.equal(page.clockStatus.simulationEnabled,false);assert.equal(page.clockActionBusy,false);assert.match(page.clockActionError,/נכשל/);
});
test('campaign selection reads actual unavailable status and ignores stale responses',()=>{
 const {page,state}=fixture();page.ngOnInit();page.selectCampaign('c1');page.selectCampaign('c2');state.handlers[0].next({status:{available:false,message:'old'}});assert.equal(page.campaignResetStatus,null);
 state.handlers[1].next({status:{campaignId:'c2',available:false,message:'נדרשת סביבת בדיקה מבודדת'}});assert.equal(page.campaignResetStatus.available,false);assert.equal(page.campaignStatusLoading,false);assert.equal(state.calls.length,0);
 page.selectCampaign('');assert.equal(page.campaignResetStatus,null);
});
test('campaign API and list errors are explicit; never imply reset success',()=>{
 const {page,state}=fixture();page.ngOnInit();page.selectCampaign('c1');state.handlers[0].error({status:404});assert.match(page.campaignStatusError,/לא בוצע איפוס/);assert.equal(page.campaignResetStatus,null);
 state.listHandler.error({});assert.ok(page.campaignsError);assert.equal(page.campaignsLoading,false);assert.equal(state.calls.length,0);
});
test('template has direct clock controls, named selector and explicit disabled reset status',()=>{
 const html=fs.readFileSync(path.join(front,'src/app/modules/platform/pages/platform-general-settings-page/platform-general-settings-page.component.html'),'utf8');
 assert.doesNotMatch(html,/toggleSimulation|הפעל סימולציה|!clockStatus.simulationEnabled/);assert.match(html,/campaign.title/);assert.match(html,/campaignResetStatus.message/);assert.match(html,/!campaignResetStatus.available/);assert.match(html,/resetTypedTitle !== campaignResetStatus.campaignTitle/);assert.match(html,/חזור לזמן אמת/);
});

test('reset requires exact campaign title, reason, approval and confirmation; blocks duplicate and target changes',()=>{
 const {page,state}=fixture();page.ngOnInit();page.selectCampaign('c1');const status={campaignId:'c1',campaignTitle:'קמפיין בדיקה',available:true,snapshotHash:'a'.repeat(64),counts:{donations:4,payments:1},recordIds:{donations:['d1']},totalRecords:5};state.handlers[0].next({status});
 page.confirmCampaignReset();assert.equal(state.resetCalls.length,0);page.resetConfirmOpen=true;page.resetReason='בדיקת איפוס';page.resetTypedTitle='wrong';page.confirmCampaignReset();assert.equal(state.resetCalls.length,0);
 page.resetTypedTitle=status.campaignTitle;page.confirmCampaignReset();page.confirmCampaignReset();page.selectCampaign('other');assert.equal(page.selectedCampaignId,'c1');assert.equal(state.resetCalls.length,1);
 assert.deepEqual(Array.from(state.resetCalls[0]),['c1','בדיקת איפוס',status.campaignTitle,status.snapshotHash]);state.resetHandler.next({result:{reset:true,backupId:'saved-backup'}});assert.equal(page.resetBusy,false);assert.match(page.resetResult,/saved-backup/);assert.equal(state.campaignReads,2);assert.equal(state.statusReads.length,2);
});
test('unapproved resets never submit; backend failure displays actual error and refreshes status without retry',()=>{
 const {page,state}=fixture();page.ngOnInit();page.selectCampaign('c1');state.handlers[0].next({status:{campaignId:'c1',campaignTitle:'test',available:false}});page.resetConfirmOpen=true;page.resetReason='test reset';page.resetTypedTitle='test';page.confirmCampaignReset();assert.equal(state.resetCalls.length,0);
 page.campaignResetStatus={campaignId:'c1',campaignTitle:'test',available:true,snapshotHash:'a'.repeat(64)};page.confirmCampaignReset();state.resetHandler.error({error:{error:'הנתונים השתנו'}});assert.match(page.resetError,/השתנו/);assert.equal(state.resetCalls.length,1);assert.equal(page.resetBusy,false);assert.equal(state.statusReads.length,2);
});
