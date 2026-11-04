// Registration draft deletion against a disposable local PostgreSQL database
// (docker container hamonym-test-db). Never point this at a shared database.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const pg=require('pg');
const backend=path.resolve(__dirname,'..');
const container='hamonym-test-db';
const env=JSON.parse(execFileSync('docker',['inspect',container,'--format','{{json .Config.Env}}'],{encoding:'utf8'}));
const values=Object.fromEntries(env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const port=Number(execFileSync('docker',['port',container,'5432'],{encoding:'utf8'}).match(/:(\d+)/)[1]);
const config={host:'127.0.0.1',port,user:values.POSTGRES_USER||'postgres',password:values.POSTGRES_PASSWORD};
const database=`hamonym_draft_delete_${Date.now()}`;assert.match(database,/^hamonym_draft_delete_\d+$/);
const admin=new pg.Pool({...config,database:'postgres'});let pool;let createdDatabase=false;let assertions=0;
function load(relative,deps){const file=path.join(backend,relative);const module={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,require:id=>Object.hasOwn(deps,id)?deps[id]:{},console,process:{env:{}},Date,Buffer,Set,Map,Object,JSON,Number,String,Array,Error},{filename:file});return module.exports;}
const profile={entity_type:'association',legal_name:'Draft org',display_name:'Draft',email:'owner@example.test',phone:'0500000000'};
async function check(name,fn){await fn();assertions++;console.log(`PASS ${name}`);}
const response=()=>({statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;}});
(async()=>{
 await admin.query(`CREATE DATABASE "${database}"`);createdDatabase=true;pool=new pg.Pool({...config,database,max:8});
 const source=fs.readFileSync(path.join(backend,'src/modules/entities/entities.service.js'),'utf8');
 const insert=source.match(/INSERT INTO entities\s*\(([\s\S]*?)\)\s*VALUES/)[1];
 const update=source.slice(source.indexOf('exports.updateEntity'));
 const returning=update.match(/RETURNING\s*\n\s*id,([\s\S]*?)`/)[1];
 const cols=new Set([...insert.split(','),...('id,'+returning).split(','),'flagged_for_review','flagged_for_review_reason','flagged_for_review_at','deleted_at','deleted_by','updated_at','created_at','requires_completion','missing_fields','association_certificate_data','tax_document_data','logo_data','registration_document_data']);
 const booleans=new Set(['is_profile_complete','onboarding_completed','cardcom_is_production','flagged_for_review','requires_completion','is_hidden']);
 const timestamps=new Set(['updated_at','created_at','flagged_for_review_at','deleted_at','onboarding_completed_at','cardcom_last_verified_at']);
 const columns=[...new Set([...cols].map(x=>x.trim()).filter(Boolean))].map(c=>{assert.match(c,/^[a-z_]+$/);return `"${c}" `+(c==='id'?"text PRIMARY KEY DEFAULT md5(random()::text)":booleans.has(c)?'boolean DEFAULT false':timestamps.has(c)?'timestamptz DEFAULT NULL':['secondary_categories','campaign_types'].includes(c)?'text[]':c==='missing_fields'?"jsonb DEFAULT '[]'::jsonb":c.endsWith('_data')?'bytea':c==='onboarding_step'?'integer':'text');});
 await pool.query(`CREATE TABLE entities (${columns.join(',')});
  CREATE TABLE users(id int PRIMARY KEY,full_name text); INSERT INTO users VALUES(10,'Owner'),(11,'Member');
  CREATE TABLE user_entities(user_id int REFERENCES users(id),entity_id text REFERENCES entities(id),role text);
  CREATE TABLE campaigns(id serial PRIMARY KEY,entity_id text REFERENCES entities(id),deleted_at timestamptz,deleted_by int,updated_at timestamptz);
  CREATE TABLE entity_roles(entity_id text REFERENCES entities(id),role text);
  CREATE TABLE entity_billing(id serial PRIMARY KEY,entity_id text REFERENCES entities(id),status text);`);
 await pool.query(fs.readFileSync(path.join(backend,'migrations/084_entity_legal_identity.sql'),'utf8'));
 const db={connect:()=>pool.connect(),query:(sql,args)=>pool.query(sql,args)};
 const ownership=load('src/middleware/entity-permission.middleware.js',{'../db/db':db});
 const entities=load('src/modules/entities/entities.service.js',{'../../db/db':db,'../../lib/supabase':{},'../../middleware/entity-permission.middleware':ownership,'../email/email.service':{queue:()=>{}},'./organization-lifecycle':require(path.join(backend,'src/modules/entities/organization-lifecycle')),'./entity-identity':require(path.join(backend,'src/modules/entities/entity-identity'))});
 const controller=load('src/modules/entities/entities.controller.js',{'./entities.service':entities,'./entity-identity':require(path.join(backend,'src/modules/entities/entity-identity'))});
 const routes=fs.readFileSync(path.join(backend,'src/modules/entities/entities.routes.js'),'utf8');
 const row=async id=>(await pool.query('SELECT status,deleted_at,deleted_by,association_certificate_url FROM entities WHERE id=$1',[id])).rows[0];
 const draft=async(n)=>{const e=await entities.createEntity({userId:10,data:{...profile,registration_number:`5800000${n}`,legal_name:`Draft ${n}`}});await pool.query('INSERT INTO user_entities VALUES(11,$1,$2)',[e.id,'member']);return e;};
 const del=async(id,user)=>{const res=response();await controller.deleteRegistrationDraft({params:{id},user:{id:user}},res);return res;};

 let a,b;
 await check('route is dedicated and authenticated',async()=>{assert.match(routes,/router\.delete\(\s*'\/:id\/draft-registration',\s*requireAuth,\s*controller\.deleteRegistrationDraft\s*\)/);});
 await check('a new registration creates a separate draft; the existing one is untouched',async()=>{
  a=await draft(1);b=await draft(2);assert.notEqual(a.id,b.id);
  assert.equal((await pool.query("SELECT count(*)::int n FROM entities WHERE status='draft' AND deleted_at IS NULL")).rows[0].n,2);
  assert.equal((await row(a.id)).status,'draft');
 });
 await check('only the creator can delete (a member gets 403, nothing changes)',async()=>{
  const res=await del(a.id,11);assert.equal(res.statusCode,403);assert.equal(res.body.code,'NOT_DRAFT_CREATOR');assert.equal((await row(a.id)).deleted_at,null);
 });
 await check('non-draft statuses are refused with 409',async()=>{
  for(const status of ['pending_review','changes_requested','active','rejected','suspended']){
   await pool.query('UPDATE entities SET status=$2 WHERE id=$1',[a.id,status]);
   const res=await del(a.id,10);assert.equal(res.statusCode,409);assert.equal(res.body.code,'NOT_A_DRAFT');
   const r=await row(a.id);assert.equal(r.status,status);assert.equal(r.deleted_at,null);
  }
  await pool.query("UPDATE entities SET status='draft' WHERE id=$1",[a.id]);
 });
 await check('a draft with any campaign (even a deleted one) is protected',async()=>{
  await pool.query('INSERT INTO campaigns(entity_id,deleted_at) VALUES($1,now())',[a.id]);
  const res=await del(a.id,10);assert.equal(res.statusCode,409);assert.equal(res.body.code,'DRAFT_HAS_CAMPAIGNS');assert.equal((await row(a.id)).deleted_at,null);
  await pool.query('DELETE FROM campaigns WHERE entity_id=$1',[a.id]);
 });
 await check('partner entities are never deleted through this endpoint',async()=>{
  await pool.query("INSERT INTO entity_roles VALUES($1,'partner')",[a.id]);
  const res=await del(a.id,10);assert.equal(res.statusCode,404);assert.equal((await row(a.id)).deleted_at,null);
  await pool.query('DELETE FROM entity_roles WHERE entity_id=$1',[a.id]);
 });
 await check('creator deletes own draft: soft delete only, related rows and documents kept',async()=>{
  await pool.query("UPDATE entities SET association_certificate_url='https://files.example/cert.pdf' WHERE id=$1",[a.id]);
  await pool.query("INSERT INTO entity_billing(entity_id,status) VALUES($1,'active')",[a.id]);
  const res=await del(a.id,10);assert.equal(res.statusCode,200);assert.equal(res.body.entity.id,a.id);
  const r=await row(a.id);assert.equal(r.status,'deleted');assert.ok(r.deleted_at);assert.equal(String(r.deleted_by),'10');
  assert.equal(r.association_certificate_url,'https://files.example/cert.pdf');
  assert.equal((await pool.query('SELECT status FROM entity_billing WHERE entity_id=$1',[a.id])).rows[0].status,'active');
  assert.equal((await pool.query('SELECT count(*)::int n FROM user_entities WHERE entity_id=$1',[a.id])).rows[0].n,2);
  assert.equal((await row(b.id)).deleted_at,null);
 });
 await check('deleting again or an unknown id is 404',async()=>{
  assert.equal((await del(a.id,10)).statusCode,404);
  assert.equal((await del('does-not-exist',10)).statusCode,404);
 });
 await check('deleted draft leaves the user list filter (deleted_at IS NULL); the other draft stays',async()=>{
  assert.match(source.slice(source.indexOf('exports.getMyEntities'),source.indexOf('exports.getMyEntities')+6000),/AND e\.deleted_at IS NULL/);
  const ids=(await pool.query("SELECT e.id FROM entities e JOIN user_entities ue ON ue.entity_id=e.id WHERE ue.user_id=10 AND e.deleted_at IS NULL AND e.status='draft'")).rows.map(r=>r.id);
  assert.deepEqual(ids,[b.id]);
 });
 console.log(`${assertions} registration draft deletion PostgreSQL checks PASS; disposable local database only.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(pool)await pool.end();if(createdDatabase)await admin.query(`DROP DATABASE IF EXISTS "${database}"`);await admin.end();});
