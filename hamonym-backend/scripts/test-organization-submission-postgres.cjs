const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const pg=require('pg');
const backend=path.resolve(__dirname,'..');
const container='hamonym-test-db';
const env=JSON.parse(execFileSync('docker',['inspect',container,'--format','{{json .Config.Env}}'],{encoding:'utf8'}));
const values=Object.fromEntries(env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const portText=execFileSync('docker',['port',container,'5432'],{encoding:'utf8'});
const port=Number(portText.match(/:(\d+)/)[1]);
const config={host:'127.0.0.1',port,user:values.POSTGRES_USER||'postgres',password:values.POSTGRES_PASSWORD};
const database=`hamonym_org_lifecycle_${Date.now()}`;assert.match(database,/^hamonym_org_lifecycle_\d+$/);
const admin=new pg.Pool({...config,database:'postgres'});let pool;let createdDatabase=false;let assertions=0,published=0,provisioned=0,failAudit=false;
function load(relative,deps){const file=path.join(backend,relative);const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>Object.hasOwn(deps,id)?deps[id]:{},console,process:{env:{}},Date,Buffer,Set,Map,Object,JSON,Number,String,Array,Error},{filename:file});return module.exports;}
const profile={entity_type:'association',legal_name:'Test org',registration_number:'123456',display_name:'Test',email:'owner@example.test',phone:'0500000000',description:'Test purpose'};
async function check(name,fn){await fn();assertions++;console.log(`PASS ${name}`);}
(async()=>{
 await admin.query(`CREATE DATABASE "${database}"`);createdDatabase=true;pool=new pg.Pool({...config,database,max:8});
 const source=fs.readFileSync(path.join(backend,'src/modules/entities/entities.service.js'),'utf8');
 const insert=source.match(/INSERT INTO entities\s*\(([\s\S]*?)\)\s*VALUES/)[1];
 const update=source.slice(source.indexOf('exports.updateEntity'));
 const returning=update.match(/RETURNING\s*\n\s*id,([\s\S]*?)`/)[1];
 const cols=new Set([...insert.split(','),...('id,'+returning).split(','),'flagged_for_review','flagged_for_review_reason','flagged_for_review_at','deleted_at','updated_at','created_at','requires_completion','missing_fields','association_certificate_data','tax_document_data','logo_data','registration_document_data']);
 const booleans=new Set(['is_profile_complete','onboarding_completed','cardcom_is_production','flagged_for_review','requires_completion','is_hidden']);
 const timestamps=new Set(['updated_at','created_at','flagged_for_review_at','deleted_at','onboarding_completed_at','cardcom_last_verified_at']);
 const columns=[...new Set([...cols].map(x=>x.trim()).filter(Boolean))].map(c=>{assert.match(c,/^[a-z_]+$/);return `"${c}" `+(c==='id'?"text PRIMARY KEY DEFAULT md5(random()::text)":booleans.has(c)?'boolean DEFAULT false':timestamps.has(c)?'timestamptz DEFAULT NULL':['secondary_categories','campaign_types'].includes(c)?'text[]':c==='missing_fields'?"jsonb DEFAULT '[]'::jsonb":c.endsWith('_data')?'bytea':c==='onboarding_step'?'integer':'text');});
 await pool.query(`CREATE TABLE entities (${columns.join(',')}); CREATE TABLE users(id int PRIMARY KEY,full_name text,is_super_admin boolean); INSERT INTO users VALUES(9,'Admin',true),(10,'Owner',false),(11,'Other',false); CREATE TABLE user_entities(user_id int REFERENCES users(id),entity_id text REFERENCES entities(id),role text); CREATE TABLE platform_audit_log(id bigserial PRIMARY KEY,super_admin_user_id int REFERENCES users(id),entity_id text REFERENCES entities(id),action text,notes text,reason_tags text[],ip_address text,created_at timestamptz DEFAULT now(),acknowledged_at timestamptz);`);
 const db={connect:()=>pool.connect(),query:(sql,args)=>{if(failAudit&&/INSERT INTO platform_audit_log/.test(sql))throw new Error('simulated audit failure');return pool.query(sql,args);}};
 // Wrap transaction queries too: rollback must restore the status when audit fails.
 db.connect=async()=>{const client=await pool.connect();return {release:()=>client.release(),query:(sql,args)=>{if(failAudit&&/INSERT INTO platform_audit_log/.test(sql))return Promise.reject(new Error('simulated audit failure'));return client.query(sql,args);}};};
 const ownership=load('src/middleware/entity-permission.middleware.js',{'../db/db':db});
 const lifecycle=require(path.join(backend,'src/modules/entities/organization-lifecycle'));
 const entities=load('src/modules/entities/entities.service.js',{'../../db/db':db,'../../lib/supabase':{},'../../middleware/entity-permission.middleware':ownership,'../email/email.service':{queue:()=>{}},'./organization-lifecycle':lifecycle});
 let a,b;
 await check('complete draft creation never submits, even with a client completion flag',async()=>{a=await entities.createEntity({userId:10,data:{...profile,is_profile_complete:true}});assert.equal(a.status,'draft');assert.equal(a.is_profile_complete,true);});
 await check('saving complete profile remains a draft',async()=>{a=await entities.updateEntity({entityId:a.id,userId:10,data:{...profile,...a,description:'Saved description'}});assert.equal(a.status,'draft');});
 await check('incomplete/whitespace profiles cannot submit and rollback safely',async()=>{b=await entities.createEntity({userId:10,data:{...profile,registration_number:'other',description:'  ',is_profile_complete:true}});assert.equal(b.is_profile_complete,false);await assert.rejects(entities.requestReview(b.id,10),e=>e.code==='PROFILE_INCOMPLETE');assert.equal((await pool.query('SELECT status FROM entities WHERE id=$1',[b.id])).rows[0].status,'draft');});
 await check('another user cannot submit or edit this organization',async()=>{await assert.rejects(entities.requestReview(a.id,11),e=>e.status===403);await assert.rejects(entities.updateEntity({entityId:a.id,userId:11,data:profile}),/Unauthorized/);});
 await check('concurrent explicit submissions serialize and return the same pending state',async()=>{const rows=await Promise.all([entities.requestReview(a.id,10),entities.requestReview(a.id,10)]);assert.equal(rows[0].status,'pending_review');assert.equal(rows[1].status,'pending_review');assert.equal(rows[0].updated_at.getTime(),rows[1].updated_at.getTime());});
 await check('saved corrections require explicit resubmission',async()=>{
  await pool.query("UPDATE entities SET status='changes_requested' WHERE id=$1",[a.id]);
  const saved=await entities.updateEntity({entityId:a.id,userId:10,data:{...a,...profile}});
  assert.equal(saved.status,'changes_requested');assert.equal((await entities.requestReview(a.id,10)).status,'pending_review');
 });
 await check('rejected and active organizations cannot submit',async()=>{
  for(const status of ['rejected','active']) {
   await pool.query('UPDATE entities SET status=$2 WHERE id=$1',[a.id,status]);
   await assert.rejects(entities.requestReview(a.id,10),e=>e.status===409);
  }
 });
 await check('controller returns useful validation and transition errors',async()=>{
  const controller=load('src/modules/entities/entities.controller.js',{'./entities.service':entities});
  const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}});
  let res=response();await controller.requestReview({params:{id:a.id},user:{id:11}},res);assert.equal(res.statusCode,403);
  res=response();await controller.requestReview({params:{id:b.id},user:{id:10}},res);assert.equal(res.statusCode,400);assert.equal(res.body.code,'PROFILE_INCOMPLETE');
  res=response();await controller.requestReview({params:{id:a.id},user:{id:10}},res);assert.equal(res.statusCode,409);assert.equal(res.body.code,'INVALID_TRANSITION');
 });
 console.log(`${assertions} organization submission PostgreSQL checks PASS; disposable local database only.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(pool)await pool.end();if(createdDatabase)await admin.query(`DROP DATABASE IF EXISTS "${database}"`);await admin.end();});
