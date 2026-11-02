// Isolated local PostgreSQL only. Shared .env and external providers are never loaded.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const backend=process.env.HAMONYM_ORG_LIFECYCLE_BACKEND || path.resolve(__dirname,'..');
const pg=require('pg');
const env=JSON.parse(execFileSync('docker',['inspect','hamonym-test-db','--format','{{json .Config.Env}}'],{encoding:'utf8'}));
const values=Object.fromEntries(env.map(v=>{const i=v.indexOf('=');return[v.slice(0,i),v.slice(i+1)];}));
const port=Number(execFileSync('docker',['port','hamonym-test-db','5432'],{encoding:'utf8'}).match(/:(\d+)/)[1]);
const config={host:'127.0.0.1',port,user:values.POSTGRES_USER||'postgres',password:values.POSTGRES_PASSWORD};
const database=`hamonym_org_drafts_${Date.now()}`;
const admin=new pg.Pool({...config,database:'postgres'});let pool,created=false,count=0;
function load(file,deps){const module={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(backend,file),'utf8'),{module,exports:module.exports,require:id=>{if(Object.hasOwn(deps,id))return deps[id];throw new Error('Blocked dependency '+id);},console,process:{env:{}},Date,Buffer,Set,Map,Object,JSON,Number,String,Array,Error});return module.exports;}
async function check(name,fn){await fn();count++;console.log('PASS '+name);}
(async()=>{
 await admin.query(`CREATE DATABASE "${database}"`);created=true;pool=new pg.Pool({...config,database});
 await pool.query(`CREATE TABLE entities(id text PRIMARY KEY,status text,display_name text,legal_name text,created_at timestamptz DEFAULT now(),deleted_at timestamptz,is_hidden boolean DEFAULT false,flagged_for_review boolean DEFAULT false,association_certificate_name text,tax_document_name text,entity_type text DEFAULT 'association',cardcom_connection_status text,logo_url text,ga_measurement_id text,cardcom_terminal_number text,cardcom_api_username text,cardcom_api_password_encrypted text);
 CREATE TABLE entity_roles(entity_id text,role text);CREATE TABLE user_entities(user_id int,entity_id text);
 INSERT INTO entities(id,status,display_name) VALUES('pending','pending_review','Same name'),('abandoned','draft','Same name');
 INSERT INTO user_entities VALUES(9,'pending'),(9,'abandoned');`);
 const source=fs.readFileSync(path.join(backend,'src/modules/campaigns/campaigns.service.js'),'utf8');
 const columns=source.match(/INSERT INTO campaigns\s*\(([\s\S]*?)\)\s*VALUES/)[1].split(',').map(c=>c.trim());
 const bools=new Set(['show_entity_name','show_logo','show_hero_title','show_hero_subtitle','enable_suggested_amounts','allow_custom_amount','allow_monthly_donation']);
 const jsons=new Set(['layout','hero_text_style','hero_cta_config','rewards','sponsors','ambassadors','updates','blocks']);
 await pool.query(`CREATE TABLE campaigns(id text PRIMARY KEY DEFAULT md5(random()::text),${columns.map(c=>{assert.match(c,/^[a-z_]+$/);return c+' '+(['suggested_amounts','monthly_amounts'].includes(c)?'numeric[]':bools.has(c)?'boolean':jsons.has(c)?'jsonb':c==='target_amount'?'numeric':'text');}).join(',')},created_at timestamptz DEFAULT now(),current_amount numeric DEFAULT 0,supporters_count int DEFAULT 0,is_locked boolean DEFAULT false,is_hidden boolean DEFAULT false,deleted_at timestamptz,published_at timestamptz,publish_requested_at timestamptz,updated_at timestamptz);
 CREATE TABLE registration_options(id text,campaign_id text,key text,title text,description text,price numeric,sort_order int);`);
 const db={query:(sql,args)=>pool.query(sql,args)};
 const campaigns=load('src/modules/campaigns/campaigns.service.js',{
  '../../db/db':db,'../../middleware/entity-permission.middleware':{isEntityMember:async(user,id)=>(await pool.query('SELECT 1 FROM user_entities WHERE user_id=$1 AND entity_id=$2',[user,id])).rows.length>0},
  './entity-categories':{isValidCategoryId:()=>true},'../ambassadors/ambassadors.service':{},'../dashboard/dashboard.service':{invalidateDashboard:()=>{}},
 });
 const donations=load('src/modules/donations/donations.service.js',{'../../db/db':db,'../payment/donation-provider':{getDonationProvider:()=>{throw new Error('External provider must not be reached');}},'../email/email.service':{}});
 const attention=load('src/modules/platform/dashboard-read.service.js',{'../../db/db':{query:async(sql,args)=>{
  if(sql.includes('AS reason'))return pool.query(sql,args);
  if(sql.includes('AS active_entities'))return{rows:[{active_entities:0,active_campaigns:0}]};
  if(sql.includes(') events'))return{rows:[]};
  throw new Error('Unexpected dashboard query');
 }},'./collection-ops/collection-ops.service':{}});
 await check('one submitted organization plus an abandoned draft produces one review task',async()=>{
  const result=await attention.getOverview({permissions:['organizations']});assert.equal(result.attention.length,1);assert.equal(result.attention[0].id,'organization:pending');assert.equal(result.kpis.attentionCount,1);
 });
 await check('soft-deleted pending organizations do not reappear in review tasks',async()=>{
  await pool.query("INSERT INTO entities(id,status,deleted_at) VALUES('deleted-pending','pending_review',now())");
  assert.equal((await attention.getOverview({permissions:['organizations']})).attention.length,1);
 });
 let campaign;
 for(const status of ['draft','pending_review','changes_requested','rejected','suspended','active']){
  await check(status+': creation ignores forged published status and saves a draft',async()=>{
   await pool.query('UPDATE entities SET status=$1 WHERE id=$2',[status,'pending']);
   campaign=await campaigns.createCampaign({userId:9,data:{entity_id:'pending',status:'published',title:'Draft',slug:'test-'+status,target_amount:100,layout:{pageFormat:'minimal'}}});assert.equal(campaign.status,'draft');
  });
  await check(status+': owner can edit without publishing or changing organization status',async()=>{
   const result=await campaigns.updateCampaign({userId:9,campaignId:campaign.id,data:{title:'Updated draft'}});assert.equal(result.status,'draft');assert.equal((await pool.query("SELECT status FROM entities WHERE id='pending'")).rows[0].status,status);
  });
  if(status!=='active'){
   await check(status+': direct API publication and checkout are blocked',async()=>{
    await assert.rejects(campaigns.updateCampaign({userId:9,campaignId:campaign.id,data:{status:'published'}}),/not approved/);
    await assert.rejects(donations.createDonation({campaignId:campaign.id,amount:1}),/Entity not approved/);
    assert.equal((await pool.query('SELECT status FROM campaigns WHERE id=$1',[campaign.id])).rows[0].status,'draft');
   });
   await check(status+': public direct slug is hidden even for a previously published campaign',async()=>{
    await pool.query("UPDATE campaigns SET status='published' WHERE id=$1",[campaign.id]);
    assert.equal(await campaigns.getCampaignBySlugPublic(campaign.slug),null);
    const discovered=await campaigns.discoverCampaigns({});assert.equal(discovered.total,0);assert.equal(discovered.campaigns.length,0);
    await pool.query("UPDATE campaigns SET status='draft' WHERE id=$1",[campaign.id]);
   });
  }
 }
 await check('active organization uses existing manual publication path',async()=>{
  const result=await campaigns.updateCampaign({userId:9,campaignId:campaign.id,data:{status:'published'}});assert.equal(result.status,'published');assert.ok(await campaigns.getCampaignBySlugPublic(campaign.slug));
 });
 await check('publication intent stays draft until existing approval publication hook runs',async()=>{
  const draft=await campaigns.createCampaign({userId:9,data:{entity_id:'pending',title:'Ready',slug:'approval-ready',target_amount:100,layout:{pageFormat:'minimal'}}});
  await pool.query("UPDATE entities SET status='pending_review' WHERE id='pending'");await campaigns.requestPublish({userId:9,campaignId:draft.id});
  assert.equal((await pool.query('SELECT status FROM campaigns WHERE id=$1',[draft.id])).rows[0].status,'draft');
  await pool.query("UPDATE entities SET status='active' WHERE id='pending'");const ids=await campaigns.publishRequestedCampaigns('pending');assert.ok(ids.includes(draft.id));
  assert.equal((await pool.query('SELECT status FROM campaigns WHERE id=$1',[draft.id])).rows[0].status,'published');
 });
 await check('unrelated organization ownership cannot be used to create or edit',async()=>{
  await assert.rejects(campaigns.createCampaign({userId:10,data:{entity_id:'pending'}}),/Unauthorized/);
  await assert.rejects(campaigns.updateCampaign({userId:10,campaignId:campaign.id,data:{title:'Intrusion'}}),/Unauthorized/);
 });
 console.log(`${count} isolated PostgreSQL organization/campaign checks PASS`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(pool)await pool.end();if(created)await admin.query(`DROP DATABASE "${database}"`);await admin.end();});
