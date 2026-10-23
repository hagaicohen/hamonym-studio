'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){const handlers={},calls=[];let guard;const router={use(fn){guard=fn;},get(p,fn){handlers.get=fn;},post(p,fn){handlers.post=fn;}};
 const service={preview:async id=>{calls.push(['preview',id]);return {available:false,code:'RESET_APPROVAL_REQUIRED'};},reset:async(...args)=>{calls.push(['reset',...args]);return {reset:true,backupId:'backup'};}};
 const mocks={express:{Router:()=>router},'../../../middleware/require-super-admin':(req,res,next)=>req.user?.isSuperAdmin?next():res.status(403),'../../billing-engine/campaign-test-reset.service':service};
 const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/modules/platform/campaign-reset/campaign-reset.routes.js'),'utf8'),{module,require(n){assert.ok(mocks[n],'Unmocked import '+n);return mocks[n];}});
 async function request(method,admin=true){const req={params:{id:'campaign'},user:{id:7,isSuperAdmin:admin},body:{confirmed:true}},res={statusCode:200,status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};let pass=false;guard(req,res,()=>pass=true);if(pass)await handlers[method](req,res);return res;}
 return {request,calls,service};}
test('non-admin cannot inspect or reset records',async()=>{const f=fixture();assert.equal((await f.request('get',false)).statusCode,403);assert.equal((await f.request('post',false)).statusCode,403);assert.equal(f.calls.length,0);});
test('preview accurately returns missing record-set approval',async()=>{const f=fixture();const r=await f.request('get');assert.equal(r.body.status.available,false);assert.equal(r.body.status.code,'RESET_APPROVAL_REQUIRED');});
test('reset uses authenticated administrator, not request-supplied actor',async()=>{const f=fixture();const r=await f.request('post');assert.equal(r.body.result.backupId,'backup');assert.equal(f.calls[0][3],7);});
test('transaction failure is returned as failure, never success',async()=>{const f=fixture();f.service.reset=async()=>{throw Object.assign(Error('stale'),{status:409,code:'RESET_PREVIEW_STALE'});};const r=await f.request('post');assert.equal(r.statusCode,409);assert.equal(r.body.code,'RESET_PREVIEW_STALE');assert.equal(r.body.result,undefined);});
