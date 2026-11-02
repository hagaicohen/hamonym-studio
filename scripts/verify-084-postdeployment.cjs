// Read-only post-deployment verification; never imports application startup/jobs.
const fs=require('fs');
const root='C:/DEV/HamonymStudio/hamonym-backend';
require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});
const {Client}=require(root+'/node_modules/pg');
const dir='C:/Users/hagai/hamonym-backups/organization-084-20261102T065717251Z';
const q=s=>'"'+s.replace(/"/g,'""')+'"';
(async()=>{
 const c=new Client({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,application_name:'084-readonly-verification'});
 try{
 await c.connect();await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await c.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='20s'");
 const expected=JSON.parse(fs.readFileSync(dir+'/before.json','utf8'));
 const cols=JSON.parse(fs.readFileSync(dir+'/original-columns.json','utf8'));
 const changed=[];let unchanged=0;
 for(const t of expected){const names=cols.filter(x=>x.schema===t.schema&&x.name===t.name).map(x=>q(x.column));const a=(await c.query(`SELECT count(*)::text AS count,md5(COALESCE(string_agg(fingerprint,'' ORDER BY fingerprint),'')) AS hash FROM (SELECT md5(row_to_json(t)::text) AS fingerprint FROM (SELECT ${names.join(',')} FROM ${q(t.schema)}.${q(t.name)}) t) rows`)).rows[0];if(a.count!==t.count||a.hash!==t.hash)changed.push({schema:t.schema,table:t.name,before:t.count,after:a.count});else unchanged++;}
 console.log(JSON.stringify({unchangedTables:unchanged,changedTables:changed}));
 console.log('identityIndex',JSON.stringify((await c.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='entities_legal_identity_unique'")).rows));
 console.log('identityColumns',JSON.stringify((await c.query("SELECT column_name,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name='entities' AND column_name IN ('registration_jurisdiction','identifier_type','normalized_registration_number')")).rows));
 console.log('entities',JSON.stringify((await c.query('SELECT count(*) total,count(*) FILTER(WHERE deleted_at IS NULL) nondeleted FROM entities')).rows));
 console.log('recentJobs',JSON.stringify((await c.query('SELECT job_name,status,started_at,finished_at FROM job_runs ORDER BY COALESCE(started_at,finished_at) DESC NULLS LAST LIMIT 8')).rows));
 await c.query('COMMIT');
 }finally{await c.end();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
