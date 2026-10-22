'use strict';
// VM imports fail closed: no application DB, jobs or payment providers are loaded.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
function load(file,mocks,extra={}) {
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'),{module,exports:module.exports,Date,
    require(name){assert.ok(Object.hasOwn(mocks,name),'Blocked import '+name);return mocks[name];},...extra});
  return module.exports;
}
function fixture(options={}) {
  let row=options.row;
  const state={queries:[],dispatches:[],released:0,locked:options.locked??true};
  const db={async query(sql,args=[]){
    state.queries.push(sql);
    assert.doesNotMatch(sql,/\b(simulation_clock|fin11_simulation_clock|donations|receipts|payments|collection_attempts|ALTER|DISABLE|DELETE|TRUNCATE)\b/i);
    if(sql.includes('pg_try_advisory_lock'))return {rows:[{acquired:state.locked}]};
    if(sql.includes('pg_advisory_unlock'))return {rows:[]};
    if(sql.startsWith('SELECT fixed_at')) {if(options.missing)throw Object.assign(Error('missing'),{code:'42703'});return {rows:row?[{...row}]:[]};}
    if(sql.startsWith('INSERT')) {row={fixed_at:null,...row,enabled:args[0]};return {rows:[]};}
    if(sql.startsWith('UPDATE')) {row.fixed_at=sql.includes('fixed_at=NULL')?null:args[0];return {rows:[]};}
    assert.fail('Unexpected query '+sql);
  },release(){state.released++;}};
  const service=load('src/modules/billing-engine/business-clock-simulation.service.js',{
    '../../db/db':{query:db.query,connect:async()=>db},
    '../../lib/clock':{realNow:()=>new Date('2026-10-22T10:00:00Z')},
    '../../lib/fin11-simulation-context':options.scope || {configuration(){if(!options.authorized)throw Object.assign(Error('gated'),{code:'FIN11_SIMULATION_FORBIDDEN'});return {}; }},
    './fin11-simulation.service':{advance:async(...args)=>{state.dispatches.push(args);return {results:[],skipped:'already_dispatched'};}},
  });
  return {service,state,get row(){return row;}};
}
test('enable/disable is persisted independently of FIN-11 and never dispatches',async()=>{
  const f=fixture();assert.equal((await f.service.status()).simulationEnabled,false);
  let status=await f.service.setEnabled(true,7);assert.equal(status.simulationEnabled,true);assert.equal(status.collectionAuthorized,false);assert.equal(status.overrideActive,false);
  await f.service.setFixed('2026-10-28T20:00:00+02:00',7);
  status=await f.service.setEnabled(false,7);assert.equal(status.simulationEnabled,false);assert.equal(status.overrideActive,false);assert.equal(status.businessNow.toISOString(),'2026-10-22T10:00:00.000Z');
  assert.equal(f.row.fixed_at,'2026-10-28T18:00:00.000Z');assert.equal(f.state.dispatches.length,0);
});
test('clock-only advance and return to real time never run jobs',async()=>{
  const f=fixture({row:{enabled:true,fixed_at:null}});
  let s=await f.service.setFixed('2026-10-28T20:00:00+02:00',7);assert.equal(s.overrideActive,true);assert.equal(s.businessNow,'2026-10-28T18:00:00.000Z');
  s=await f.service.reset(7);assert.equal(s.simulationEnabled,true);assert.equal(s.overrideActive,false);assert.equal(f.state.dispatches.length,0);
});
test('valid FIN-11 authorization delegates unchanged to durable, scoped dispatch',async()=>{
  const f=fixture({authorized:true,row:{enabled:true}});
  const s=await f.service.setFixed('2026-10-28T20:00:00+02:00',7);
  assert.equal(s.collectionAuthorized,true);assert.equal(s.skipped,'already_dispatched');assert.deepEqual(Array.from(f.state.dispatches[0]),['2026-10-28T18:00:00.000Z',7]);
});
test('activation with collection authorization still does not dispatch',async()=>{
  const f=fixture({authorized:true});await f.service.setEnabled(true,7);await f.service.setEnabled(false,7);assert.equal(f.state.dispatches.length,0);
});
test('missing actor, invalid enabled value and invalid time cannot write',async()=>{
  const f=fixture();await assert.rejects(f.service.setEnabled(true,null),{code:'SUPER_ADMIN_REQUIRED'});
  await assert.rejects(f.service.setEnabled('true',7),{code:'INVALID_ENABLED'});
  await assert.rejects(f.service.setFixed('2026-10-28T20:00:00',7),{code:'INVALID_TIME'});assert.equal(f.state.queries.length,0);
});
test('disabled clock refuses advance and reset',async()=>{
  const f=fixture({row:{enabled:false}});
  await assert.rejects(f.service.setFixed('2026-10-28T18:00:00Z',7),{code:'CLOCK_DISABLED'});
  await assert.rejects(f.service.reset(7),{code:'CLOCK_DISABLED'});assert.equal(f.state.dispatches.length,0);assert.ok(!f.state.queries.some(s=>s.startsWith('UPDATE')));
});
test('concurrent clock action and missing migration fail closed',async()=>{
  const busy=fixture({locked:false});await assert.rejects(busy.service.setEnabled(true,7),{code:'CLOCK_BUSY'});assert.equal(busy.state.released,1);
  const missing=fixture({missing:true});await assert.rejects(missing.service.status(),{code:'SIMULATION_MIGRATION_REQUIRED'});await assert.rejects(missing.service.setEnabled(true,7),{code:'SIMULATION_MIGRATION_REQUIRED'});
});
test('production reader still reads only the unchanged legacy clock and off-mode has zero queries',async()=>{
  const clock=load('src/lib/clock.js',{}, {process:{env:{HAMONYM_SIMULATION_MODE:'on'}}});
  const future='2099-01-01T00:00:00Z';
  const result=await clock.now({query:async sql=>{assert.match(sql,/FROM simulation_clock WHERE id = 1/);assert.doesNotMatch(sql,/admin_simulation_clock/);return {rows:[]};}});assert.ok(result.getUTCFullYear()<2099);
  const legacy=await clock.now({query:async()=>({rows:[{fixed_at:future}]})});assert.equal(legacy.toISOString(),'2099-01-01T00:00:00.000Z');
  const off=load('src/lib/clock.js',{}, {process:{env:{}}});await off.now({query:()=>assert.fail('production off-mode queried DB')});
});
test('all simulation routes enforce Super Admin before any handler',async()=>{
  const routes=[];let guard;
  const router={use(fn){guard=fn;},get(p,fn){routes.push(fn);},post(p,fn){routes.push(fn);}};
  load('src/modules/platform/fin11-simulation/fin11-simulation.routes.js',{'express':{Router:()=>router},'../../../middleware/require-super-admin':function requireSuperAdmin(req,res,next){if(req.superAdmin)next();else res.status(403);},'../../billing-engine/business-clock-simulation.service':new Proxy({}, {get(){return ()=>assert.fail('Unauthorized service call');}})});
  let status;guard({}, {status(n){status=n;}},()=>assert.fail('Non-admin passed'));assert.equal(status,403);assert.equal(routes.length,4);
});

test('real gate checks remain independent: absent flag, missing allowlist or wrong Sandbox pin never dispatch',async()=>{
  const {createHash}=require('node:crypto');
  const api='unit-test-api',terminal='1000';
  const base={HAMONYM_SIMULATION_MODE:'on',FIN11_SIMULATION_COLLECTION_ENABLED:'true',FIN11_SIMULATION_ENTITY_IDS:'93b16891-ba84-43b6-815e-31cbf749cba0',FIN11_SANDBOX_VERIFIED:'true',HAMONYM_CARDCOM_TERMINAL:terminal,HAMONYM_CARDCOM_API_NAME:api,FIN11_SANDBOX_IDENTITY_SHA256:createHash('sha256').update(terminal+String.fromCharCode(0)+api).digest('hex')};
  for(const patch of [{FIN11_SIMULATION_COLLECTION_ENABLED:undefined},{HAMONYM_SIMULATION_MODE:undefined},{FIN11_SIMULATION_ENTITY_IDS:''},{FIN11_SANDBOX_VERIFIED:undefined},{HAMONYM_CARDCOM_TERMINAL:'2000'},{FIN11_SANDBOX_IDENTITY_SHA256:'bad'},{HAMONYM_CARDCOM_API_NAME:'different'}]){
    const scope=load('src/lib/fin11-simulation-context.js',{'node:async_hooks':require('node:async_hooks'),'node:crypto':require('node:crypto')},{process:{env:{...base,...patch}}});
    const f=fixture({scope});await f.service.setEnabled(true,7);const state=await f.service.setFixed('2026-10-28T18:00:00Z',7);
    assert.equal(state.simulationEnabled,true);assert.equal(state.collectionAuthorized,false);assert.equal(f.state.dispatches.length,0);
  }
});
