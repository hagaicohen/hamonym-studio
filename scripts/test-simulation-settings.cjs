'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const front=path.join(__dirname,'..'),ts=require(path.join(front,'node_modules/typescript'));
function fixture(){
  const file='src/app/modules/platform/pages/platform-general-settings-page/platform-general-settings-page.component.ts';
  const js=ts.transpileModule(fs.readFileSync(path.join(front,file),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,experimentalDecorators:true}}).outputText;
  const state={calls:[],reads:0};
  const status={simulationEnabled:false,overrideActive:false,collectionAuthorized:false,businessNow:'2026-10-22T10:00:00Z',realNow:'2026-10-22T10:00:00Z'};
  const service={getStatus:()=>({subscribe(h){state.reads++;h.next({...status});}})};
  for(const name of ['setEnabled','setFixed','reset'])service[name]=(...args)=>({subscribe(h){state.calls.push({name,args});state.handler=h;}});
  const module={exports:{}};
  vm.runInNewContext(js,{module,exports:module.exports,Intl,Date,require(name){
    if(name==='@angular/core')return {Component:()=>()=>{},inject:token=>token.name==='SimulationClockService'?service:{get:()=>({subscribe(h){h.next({setting:{vat_rate:0.18}});}})}};
    const names={'@angular/common':['CommonModule'],'@angular/forms':['FormsModule'],'../../services/billing-settings.service':['BillingSettingsService'],'../../services/simulation-clock.service':['SimulationClockService']};
    assert.ok(names[name],'Blocked unexpected import '+name);return Object.fromEntries(names[name].map(n=>[n,{[n]:class{}}[n]]));
  }});
  const page=new module.exports.PlatformGeneralSettingsPageComponent();return {page,state,status};
}
test('opening settings only reads clock and VAT; never requests campaigns or mutates time',()=>{
  const {page,state}=fixture();page.ngOnInit();assert.equal(state.reads,1);assert.equal(state.calls.length,0);assert.equal(page.clockStatus.simulationEnabled,false);
});
test('admin can enable a clock with FIN-11 authorization off; repeated submission blocked',()=>{
  const {page,state,status}=fixture();page.ngOnInit();page.toggleSimulation();page.toggleSimulation();
  assert.equal(state.calls.length,1);assert.equal(state.calls[0].name,'setEnabled');assert.deepEqual(Array.from(state.calls[0].args),[true]);
  state.handler.next({...status,simulationEnabled:true});assert.equal(page.clockStatus.simulationEnabled,true);assert.equal(page.clockStatus.collectionAuthorized,false);assert.equal(page.clockActionBusy,false);
  page.toggleSimulation();assert.deepEqual(Array.from(state.calls[1].args),[false]);
});
test('activation failure is shown in app and does not pretend clock enabled',()=>{
  const {page,state}=fixture();page.ngOnInit();page.toggleSimulation();state.handler.error({error:{error:'יש להחיל מיגרציה 076'}});
  assert.equal(page.clockStatus.simulationEnabled,false);assert.equal(page.clockActionBusy,false);assert.match(page.clockActionError,/076/);
});
test('time updates require enabled clock and block repeated submit; reset remains clock-only',()=>{
  const {page,state,status}=fixture();page.ngOnInit();page.fixedDateInput='2026-10-28';page.fixedTimeInput='20:00';page.setClockFixed();assert.equal(state.calls.length,0);
  page.clockStatus={...status,simulationEnabled:true};page.setClockFixed();page.setClockFixed();assert.equal(state.calls.length,1);assert.equal(state.calls[0].name,'setFixed');
  state.handler.next({...status,simulationEnabled:true,overrideActive:true});page.resetClock();assert.equal(state.calls[1].name,'reset');
  state.handler.next({...status,simulationEnabled:true});assert.equal(page.fixedDateInput,'');assert.equal(page.clockStatus.overrideActive,false);
});
test('Israel time display is independent of browser timezone',()=>{
  const {page}=fixture();assert.match(page.fmtDateTime('2026-10-28T18:00:00Z'),/20:00/);
});
test('reset explanation replaces unavailable picker and misleading payment promise',()=>{
  const html=fs.readFileSync(path.join(front,'src/app/modules/platform/pages/platform-general-settings-page/platform-general-settings-page.component.html'),'utf8');
  assert.match(html,/איפוס תרומות אינו זמין במסד הנתונים המשותף/);assert.doesNotMatch(html,/onCampaignComboSelect|confirmCampaignReset|לעולם לא על חיובים אמיתיים|הפקדים למטה מוצגים לידיעה בלבד/);
  assert.match(html,/עדכון הזמן עשוי להפעיל בקשת חיוב/);
});
