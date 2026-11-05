const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const pg=require('pg');
const backend=path.resolve(process.env.HAMONYM_ORG_LIFECYCLE_BACKEND || path.join(__dirname,'..'));
const container='hamonym-test-db';
const env=JSON.parse(execFileSync('docker',['inspect',container,'--format','{{json .Config.Env}}'],{encoding:'utf8'}));
const values=Object.fromEntries(env.map(v=>{const i=v.indexOf('=');return [v.slice(0,i),v.slice(i+1)];}));
const portText=execFileSync('docker',['port',container,'5432'],{encoding:'utf8'});
const port=Number(portText.match(/:(\d+)/)[1]);
const config={host:'127.0.0.1',port,user:values.POSTGRES_USER||'postgres',password:values.POSTGRES_PASSWORD};
const database=`hamonym_org_identity_${Date.now()}`;assert.match(database,/^hamonym_org_identity_\d+$/);
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
 await pool.query('CREATE UNIQUE INDEX entities_registration_number_key ON entities(registration_number) WHERE deleted_at IS NULL');
 await check('migration preflight rejects formatted collisions atomically',async()=>{
  await pool.query("INSERT INTO entities(entity_type,registration_number) VALUES('association','001-234'),('association','001 234')");
  const client=await pool.connect();try {await client.query('BEGIN');await assert.rejects(client.query(fs.readFileSync(path.join(backend,'migrations/084_entity_legal_identity.sql'),'utf8')),/identities collide/);await client.query('ROLLBACK');} finally {client.release();}
  assert.equal((await pool.query("SELECT count(*) FROM information_schema.columns WHERE table_name='entities' AND column_name='identifier_type'")).rows[0].count,'0');
  assert.equal((await pool.query('SELECT count(*) FROM entities')).rows[0].count,'2');
  await pool.query('DELETE FROM entities');
 });
 await check('migration preflight rejects unknown identity types without guessing',async()=>{
  await pool.query("INSERT INTO entities(entity_type,registration_number) VALUES('unknown','123')");
  const client=await pool.connect();try {await client.query('BEGIN');await assert.rejects(client.query(fs.readFileSync(path.join(backend,'migrations/084_entity_legal_identity.sql'),'utf8')),/Unmapped entity type/);await client.query('ROLLBACK');} finally {client.release();}
  await pool.query('DELETE FROM entities');
 });
 await pool.query("INSERT INTO entities(id,entity_type,registration_number,status,deleted_at) VALUES('legacy-live','association','555-555','draft',NULL),('legacy-deleted','association','555-555','deleted',now())");
 await pool.query(fs.readFileSync(path.join(backend,'migrations/084_entity_legal_identity.sql'),'utf8'));
 assert.equal((await pool.query("SELECT registration_number FROM entities WHERE id='legacy-live'")).rows[0].registration_number,'555-555');
 const db={connect:()=>pool.connect(),query:(sql,args)=>{if(failAudit&&/INSERT INTO platform_audit_log/.test(sql))throw new Error('simulated audit failure');return pool.query(sql,args);}};
 // Wrap transaction queries too: rollback must restore the status when audit fails.
 db.connect=async()=>{const client=await pool.connect();return {release:()=>client.release(),query:(sql,args)=>{if(failAudit&&/INSERT INTO platform_audit_log/.test(sql))return Promise.reject(new Error('simulated audit failure'));return client.query(sql,args);}};};
 const ownership=load('src/middleware/entity-permission.middleware.js',{'../db/db':db});
 const lifecycle=require(path.join(backend,'src/modules/entities/organization-lifecycle'));
 const entities=load('src/modules/entities/entities.service.js',{'../../db/db':db,'../../lib/supabase':{},'../../middleware/entity-permission.middleware':ownership,'../email/email.service':{queue:()=>{}},'./organization-lifecycle':lifecycle,'./entity-identity':require(path.join(backend,'src/modules/entities/entity-identity'))});
 const platform=load('src/modules/platform/platform.service.js',{'../../db/db':db,'../entities/entities.service':entities,'../entities/organization-lifecycle':lifecycle,'../email/email.service':{queue:()=>{}},'../billing-engine/billing-setup-notification.service':{resolveEntityAdmins:async()=>[]},'../billing-engine/provisioning.service':{createBillingAccount:async()=>{provisioned++;}},'../campaigns/campaigns.service':{publishRequestedCampaigns:async()=>{published++;return [];}}});
 const identity=require(path.join(backend,'src/modules/entities/entity-identity'));
 const controller=load('src/modules/entities/entities.controller.js',{'./entities.service':entities,'./entity-identity':identity});
 const response=()=>({statusCode:200,status(value){this.statusCode=value;return this;},json(body){this.body=body;}});
 let serial=0;
 const create=(data={},userId=10)=>entities.createEntity({userId,data:{...profile,registration_number:String(++serial),...data}});
 await check('normalization preserves leading zeroes and matches PostgreSQL for separator variants',async()=>{
  for(const value of ['001-234',' 001 234 ','001–234','001—234','001―234','001−234','001\u00a0234','001\u200b234','',' - ']) {
   assert.equal((await pool.query('SELECT public.hamonym_normalize_registration($1) AS n',[value])).rows[0].n,identity.normalize(value));
  }
 });
 await check('identical names with distinct numbers are allowed',async()=>{const a=await create(),b=await create();assert.equal(a.legal_name,b.legal_name);assert.notEqual(a.id,b.id);});
 let existing;
 await check('format variants and every non-deleted status block another identity',async()=>{
  existing=await create({registration_number:'001-234'});
  for(const status of ['draft','pending_review','changes_requested','active','rejected','suspended']) {
   await pool.query('UPDATE entities SET status=$1 WHERE id=$2',[status,existing.id]);
   await assert.rejects(create({registration_number:' 001 234 '}),e=>e.code==='DUPLICATE_LEGAL_IDENTIFIER');
  }
 });
 await check('membership exposes only a management ID, strangers get no organization details',async()=>{
  const owner=await entities.checkRegistrationAvailability({userId:10,entityType:'association',registrationNumber:'001234'});
  assert.equal(owner.available,false);assert.equal(owner.existingEntityId,existing.id);
  const other=await entities.checkRegistrationAvailability({userId:11,entityType:'association',registrationNumber:'001234'});
  assert.equal(JSON.stringify(other),JSON.stringify({available:false}));
  const count=(await pool.query('SELECT count(*) FROM user_entities WHERE user_id=11')).rows[0].count;assert.equal(count,'0');
 });
 await check('Super Admin management scope comes from verified request permissions, not request body',async()=>{
  const res=response();await controller.checkRegistrationAvailability({user:{id:9,isSuperAdmin:true},body:{entityType:'association',registrationNumber:'001234'}},res);
  assert.equal(res.body.existingEntityId,existing.id);assert.equal(res.body.managementScope,'platform');
  const stranger=response();await controller.checkRegistrationAvailability({user:{id:11},body:{entityType:'association',registrationNumber:'001234',canManagePlatform:true}},stranger);
  assert.equal(stranger.body.existingEntityId,undefined);
 });
 await check('availability exclusion requires membership and unchanged own identity is available',async()=>{
  await assert.rejects(entities.checkRegistrationAvailability({userId:11,entityType:'association',registrationNumber:'001234',excludeEntityId:existing.id}),e=>e.status===403);
  assert.equal((await entities.checkRegistrationAvailability({userId:10,entityType:'association',registrationNumber:'001234',excludeEntityId:existing.id})).available,true);
 });
 await check('updates reject another number but allow formatting the same owned number',async()=>{
  const other=await create();
  await assert.rejects(entities.updateEntity({entityId:other.id,userId:10,data:{...other,registration_number:'001234'}}),e=>e.code==='DUPLICATE_LEGAL_IDENTIFIER');
  assert.equal((await pool.query('SELECT registration_number FROM entities WHERE id=$1',[other.id])).rows[0].registration_number,other.registration_number);
  const changed=await entities.updateEntity({entityId:existing.id,userId:10,data:{...existing,registration_number:'001 234'}});assert.equal((await pool.query('SELECT normalized_registration_number FROM entities WHERE id=$1',[changed.id])).rows[0].normalized_registration_number,'001234');
 });
 await check('direct SQL and parallel creates cannot bypass uniqueness',async()=>{
  await assert.rejects(pool.query("INSERT INTO entities(entity_type,registration_number) VALUES('association','001234')"),e=>e.code==='23505'&&e.constraint==='entities_legal_identity_unique');
  const results=await Promise.allSettled([create({registration_number:'009999'}),create({registration_number:'009-999'})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.ok(identity.isDuplicate(results.find(r=>r.status==='rejected').reason));
 });
 await check('parallel identity edits cannot claim the same new number',async()=>{
  const a=await create(),b=await create();
  const results=await Promise.allSettled([entities.updateEntity({entityId:a.id,userId:10,data:{...a,registration_number:'007777'}}),entities.updateEntity({entityId:b.id,userId:10,data:{...b,registration_number:'007-777'}})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.ok(identity.isDuplicate(results.find(r=>r.status==='rejected').reason));
 });
 await check('scope prevents lifecycle type changes from bypassing business-number identity',async()=>{
  await create({entity_type:'sole_exempt',registration_number:'654321'});
  await assert.rejects(create({entity_type:'sole_registered',registration_number:'654-321'}),e=>identity.isDuplicate(e));
  const company=await create({entity_type:'chalatz',registration_number:'654321'});assert.equal(company.identifier_type,'company_number');
 });
 await check('soft deletion releases a number; conflicting restore is blocked without data loss',async()=>{
  await pool.query('UPDATE entities SET deleted_at=now() WHERE id=$1',[existing.id]);
  const replacement=await create({registration_number:'001234'});
  await assert.rejects(pool.query('UPDATE entities SET deleted_at=NULL WHERE id=$1',[existing.id]),e=>e.code==='23505');
  assert.ok((await pool.query('SELECT deleted_at FROM entities WHERE id=$1',[existing.id])).rows[0].deleted_at);
  assert.equal((await pool.query('SELECT count(*) FROM entities WHERE id=ANY($1)',[[existing.id,replacement.id]])).rows[0].count,'2');
 });
 await check('scope fields cannot be forged and unsupported types fail closed',async()=>{
  await assert.rejects(pool.query("UPDATE entities SET registration_jurisdiction='OTHER' WHERE id=$1",[existing.id]),e=>e.code==='428C9');
  await assert.rejects(create({entity_type:'invented'}),e=>e.code==='INVALID_IDENTIFIER_SCOPE');
 });
 await check('controllers distinguish identity duplicate from request-review 409 and unrelated unique errors',async()=>{
  const res=response();await controller.createEntity({user:{id:11},body:{...profile,registration_number:'001234'}},res);
  assert.equal(res.statusCode,409);assert.equal(res.body.code,'DUPLICATE_LEGAL_IDENTIFIER');assert.equal(res.body.existingEntityId,undefined);
  assert.equal(identity.isDuplicate({code:'23505',constraint:'unrelated_key'}),false);
  const review=response();await controller.requestReview({params:{id:existing.id},user:{id:10}},review);assert.notEqual(review.body.code,'DUPLICATE_LEGAL_IDENTIFIER');
 });
 await check('rollback fails safely when new namespaces conflict with the old raw-number index',async()=>{
  const client=await pool.connect();try {await client.query('BEGIN');await assert.rejects(client.query(fs.readFileSync(path.join(backend,'scripts/rollback-084-entity-identity.sql'),'utf8')),/Rollback blocked/);await client.query('ROLLBACK');} finally {client.release();}
  assert.ok((await pool.query("SELECT 1 FROM pg_indexes WHERE indexname='entities_legal_identity_unique'")).rows.length);
 });
 await check('rollback preserves raw records when compatible and migration can be reapplied',async()=>{
  await pool.query("UPDATE entities SET registration_number='different-company-number' WHERE entity_type='chalatz'");
  const before=(await pool.query('SELECT id,entity_type,registration_number,status,deleted_at FROM entities ORDER BY id')).rows;
  await pool.query('BEGIN');await pool.query(fs.readFileSync(path.join(backend,'scripts/rollback-084-entity-identity.sql'),'utf8'));await pool.query('COMMIT');
  const after=(await pool.query('SELECT id,entity_type,registration_number,status,deleted_at FROM entities ORDER BY id')).rows;assert.deepEqual(after,before);
  await pool.query('BEGIN');await pool.query(fs.readFileSync(path.join(backend,'migrations/084_entity_legal_identity.sql'),'utf8'));await pool.query('COMMIT');
 });
 console.log(`${assertions} identity PostgreSQL checks PASS; local disposable database only.`);

})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(pool)await pool.end();if(createdDatabase)await admin.query(`DROP DATABASE IF EXISTS "${database}"`);await admin.end();});
