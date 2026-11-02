// Explicit deployment tool. Default rehearses against the network-isolated restore.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const [directory,backend,mode]=process.argv.slice(2);
if(!directory||!backend||!['rehearse','apply-shared'].includes(mode))throw new Error('backup directory, backend path, rehearse|apply-shared required');
const verified=JSON.parse(fs.readFileSync(path.join(directory,'verification.json'),'utf8'));if(verified.result!=='PASS')throw new Error('Backup verification required');
const migration=fs.readFileSync(path.join(backend,'migrations/084_entity_legal_identity.sql'),'utf8');
const rollback=fs.readFileSync(path.join(backend,'scripts/rollback-084-entity-identity.sql'),'utf8');
const sha256=crypto.createHash('sha256').update(migration).digest('hex');
const expected=JSON.parse(fs.readFileSync(path.join(directory,'before.json'),'utf8'));
const q=value=>'"'+value.replace(/"/g,'""')+'"';
function local(sql){return execFileSync('docker',['exec','-i',verified.container,'psql','-h','127.0.0.1','-U','supabase_admin','-d','backup_verify','-X','-A','-t','-v','ON_ERROR_STOP=1'],{encoding:'utf8',windowsHide:true,input:sql});}
const columnsSql="SELECT n.nspname AS schema,c.relname AS name,a.attname AS column FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' AND a.attnum>0 AND NOT a.attisdropped ORDER BY n.nspname,c.relname,a.attnum";
const hashSql=(table,columns)=>`SELECT count(*)::text AS count,md5(COALESCE(string_agg(fingerprint,'' ORDER BY fingerprint),'')) AS hash FROM (SELECT md5(row_to_json(t)::text) AS fingerprint FROM (SELECT ${columns.map(q).join(',')} FROM ${q(table.schema)}.${q(table.name)}) t) rows`;
const schemaSql="SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='entities_legal_identity_unique'";
const guardSql="SELECT application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)";
const technicalSql="SELECT (SELECT relacl::text FROM pg_class WHERE oid='public.entities'::regclass) AS entity_acl,(SELECT count(*) FROM pg_constraint WHERE contype='f' AND convalidated) AS validated_fks,(SELECT md5(string_agg(oid::text||':'||tgenabled::text,',' ORDER BY oid)) FROM pg_trigger WHERE NOT tgisinternal) AS trigger_states";
const localRows=sql=>JSON.parse(local('SELECT COALESCE(json_agg(result),\'[]\'::json) FROM ('+sql+') result;').trim());
(async()=>{
 if(mode==='rehearse'){
  const network=execFileSync('docker',['inspect',verified.container,'--format','{{.HostConfig.NetworkMode}}'],{encoding:'utf8'}).trim();if(network!=='none')throw new Error('Restore container must remain isolated');
  const columns=localRows(columnsSql);fs.writeFileSync(path.join(directory,'original-columns.json'),JSON.stringify(columns,null,2));
  local('BEGIN;'+migration+'COMMIT;');
  if(!localRows(schemaSql).length)throw new Error('Rehearsed index missing');
  for(const table of expected){const names=columns.filter(c=>c.schema===table.schema&&c.name===table.name).map(c=>c.column);const actual=localRows(hashSql(table,names))[0];if(actual.count!==table.count||actual.hash!==table.hash)throw new Error('Rehearsal modified original records: '+table.schema+'.'+table.name);}
  local('BEGIN;'+rollback+'COMMIT;');if(localRows(schemaSql).length)throw new Error('Rehearsal rollback did not remove new index');
  local('BEGIN;'+migration+'COMMIT;');
  fs.writeFileSync(path.join(directory,'rehearsal.json'),JSON.stringify({result:'PASS',sha256,originalTablesPreserved:expected.length,rollback:'PASS',reapplied:'PASS',verifiedAt:new Date().toISOString()},null,2));
  console.log('PASS restored-database migration, original data hashes, rollback and reapplication.');return;
 }
 const rehearsal=JSON.parse(fs.readFileSync(path.join(directory,'rehearsal.json'),'utf8'));if(rehearsal.result!=='PASS'||rehearsal.sha256!==sha256)throw new Error('Exact migration rehearsal required');
 const root='C:/DEV/HamonymStudio/hamonym-backend';require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});const {Client}=require(root+'/node_modules/pg');
 const client=new Client({host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:30000});
 let begun=false,committed=false;
 try{
  await client.connect();const activity=(await client.query(guardSql)).rows;if(activity.length)throw new Error('Active/unknown writers: '+JSON.stringify(activity));
  const existing=(await client.query("SELECT to_regclass('public.entities_legal_identity_unique') AS identity_index")).rows[0];if(existing.identity_index)throw new Error('084 already exists; refusing reexecution');
  const owner=(await client.query("SELECT r.rolname AS owner,has_schema_privilege(current_user,'public','CREATE') AS can_create FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='public.entities'::regclass")).rows[0];
  if(!owner.can_create)throw new Error('Current role cannot create migration objects');
  const columns=JSON.parse(fs.readFileSync(path.join(directory,'original-columns.json'),'utf8'));
  const technicalBefore=(await client.query(technicalSql)).rows[0];
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');begun=true;await client.query("SET LOCAL TIME ZONE 'UTC';SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s'");
  for(const table of expected){const names=columns.filter(c=>c.schema===table.schema&&c.name===table.name).map(c=>c.column);const actual=(await client.query(hashSql(table,names))).rows[0];if(actual.count!==table.count||actual.hash!==table.hash)throw new Error('Shared data changed since verified backup: '+table.schema+'.'+table.name);}
  await client.query(migration);
  const index=(await client.query(schemaSql)).rows;if(index.length!==1)throw new Error('084 unique index verification failed');
  const generated=(await client.query("SELECT column_name,is_generated FROM information_schema.columns WHERE table_schema='public' AND table_name='entities' AND column_name IN ('registration_jurisdiction','identifier_type','normalized_registration_number')")).rows;if(generated.length!==3||generated.some(c=>c.is_generated!=='ALWAYS'))throw new Error('Generated identity fields not installed');
  for(const table of expected){const names=columns.filter(c=>c.schema===table.schema&&c.name===table.name).map(c=>c.column);const actual=(await client.query(hashSql(table,names))).rows[0];if(actual.count!==table.count||actual.hash!==table.hash)throw new Error('Migration changed original data: '+table.schema+'.'+table.name);}
  const technicalAfter=(await client.query(technicalSql)).rows[0];if(JSON.stringify(technicalAfter)!==JSON.stringify(technicalBefore))throw new Error('Existing permissions, FK validation or trigger states changed');
  await client.query('COMMIT');committed=true;begun=false;
  fs.writeFileSync(path.join(directory,'migration-084.json'),JSON.stringify({result:'PASS',sha256,appliedAt:new Date().toISOString(),index,generated,originalTablesPreserved:expected.length,existingPermissionsConstraintsTriggers:'unchanged'},null,2));
  console.log('PASS shared migration 084 committed; '+expected.length+' original table inventories/content hashes unchanged.');
 }catch(error){if(begun&&!committed)await client.query('ROLLBACK');throw error;}finally{await client.end();}
})().catch(e=>{console.error('STOP: '+e.message);process.exitCode=1;});
