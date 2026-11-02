// Complete read-only shared backup; restoration is into a network-isolated container.
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{execFileSync}=require('child_process');
const root='C:/DEV/HamonymStudio/hamonym-backend';
require(root+'/node_modules/dotenv').config({path:root+'/.env',quiet:true});
const {Client}=require(root+'/node_modules/pg');
const stamp=new Date().toISOString().replace(/[-:.]/g,'');
const directory=path.join(os.homedir(),'hamonym-backups','organization-084-'+stamp);
const container='hamonym-084-restore-'+Date.now();
const image='supabase/postgres:17.6.1.136';
const config={host:process.env.DB_HOST,port:process.env.DB_PORT,database:process.env.DB_NAME,user:process.env.DB_USER,password:process.env.DB_PASSWORD,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:10000};
const client=new Client(config);
const pgEnv={PGHOST:config.host,PGPORT:String(config.port||5432),PGDATABASE:config.database,PGUSER:config.user,PGPASSWORD:config.password,PGSSLMODE:'require'};
const environmentArgs=Object.keys(pgEnv).flatMap(key=>['--env',key]);
const quote=value=>'"'+value.replace(/"/g,'""')+'"';
function docker(args,options={}){return execFileSync('docker',args,{encoding:'utf8',windowsHide:true,...options});}
function isolated(sql){return docker(['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-d','backup_verify','-X','-A','-t','-v','ON_ERROR_STOP=1'],{input:sql});}
const hashQuery=table=>`SELECT count(*)::text AS count,md5(COALESCE(string_agg(fingerprint,'' ORDER BY fingerprint),'')) AS hash FROM (SELECT md5(row_to_json(t)::text) AS fingerprint FROM ${quote(table.schema)}.${quote(table.name)} t) rows`;
let restored=false;
(async()=>{
 await client.connect();
 const activity=(await client.query("SELECT application_name,state FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND backend_type='client backend' AND (state IS DISTINCT FROM 'idle' OR xact_start IS NOT NULL)")).rows;
 if(activity.length)throw new Error('Active/unknown client transactions remain: '+JSON.stringify(activity));
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await client.query("SET LOCAL TIME ZONE 'UTC'");
 const snapshot=(await client.query('SELECT pg_export_snapshot() AS id')).rows[0].id;
 const tables=(await client.query("SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema' ORDER BY 1,2")).rows;
 fs.mkdirSync(directory,{recursive:true});
 const counts=[];
 for(const table of tables)counts.push({...table,...(await client.query(hashQuery(table))).rows[0]});
 const roles=(await client.query("SELECT rolname FROM pg_roles WHERE rolname NOT LIKE 'pg_%' ORDER BY rolname")).rows.map(r=>r.rolname);
 fs.writeFileSync(path.join(directory,'before.json'),JSON.stringify(counts,null,2));
 console.log('No active client transactions. Backup directory: '+directory);
 const dumpLog=fs.openSync(path.join(directory,'pg-dump.log'),'w');
 try{docker(['run','--rm',...environmentArgs,'--volume',directory+':/backup',image,'pg_dump','--format=custom','--snapshot='+snapshot,'--file=/backup/database.dump'],{env:{...process.env,...pgEnv},stdio:['ignore','ignore',dumpLog]});}finally{fs.closeSync(dumpLog);}
 const roleLog=fs.openSync(path.join(directory,'roles.log'),'w');
 try{docker(['run','--rm',...environmentArgs,'--volume',directory+':/backup',image,'pg_dumpall','--roles-only','--no-role-passwords','--file=/backup/roles.sql'],{env:{...process.env,...pgEnv},stdio:['ignore','ignore',roleLog]});}finally{fs.closeSync(roleLog);}
 await client.query('COMMIT');
 const archive=path.join(directory,'database.dump');
 const sha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');fs.writeFileSync(path.join(directory,'database.dump.sha256'),sha256+'\n');
 const list=docker(['run','--rm','--network','none','--volume',directory+':/backup:ro',image,'pg_restore','--list','/backup/database.dump']);fs.writeFileSync(path.join(directory,'archive-list.txt'),list);
 if(!list.includes('campaign_reset_private'))throw new Error('Private schema missing from backup archive');
 const password=crypto.randomBytes(24).toString('hex');
 docker(['run','--detach','--name',container,'--network','none','--env','POSTGRES_PASSWORD','--env','PGDATA=/var/lib/postgresql/data',image,'postgres','-D','/var/lib/postgresql/data'],{env:{...process.env,POSTGRES_PASSWORD:password}});
 let ready=false;for(let i=0;i<40;i++){try{docker(['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres'],{stdio:'ignore'});ready=true;break;}catch{await new Promise(r=>setTimeout(r,1000));}}
 if(!ready)throw new Error('Isolated restore container did not become ready');
 docker(['exec',container,'createdb','-h','127.0.0.1','-U','postgres','backup_verify']);
 for(const role of roles){if(role==='postgres')continue;docker(['exec','-i',container,'psql','-h','127.0.0.1','-U','postgres','-d','backup_verify','-X','-v','ON_ERROR_STOP=1'],{input:`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=${"'"+role.replace(/'/g,"''")+"'"}) THEN CREATE ROLE ${quote(role)} NOLOGIN; END IF; END $$;`});}
 docker(['cp',archive,container+':/tmp/database.dump']);
 const restoreLog=fs.openSync(path.join(directory,'pg-restore.log'),'w');
 try{docker(['exec',container,'pg_restore','--host=127.0.0.1','--username=postgres','--dbname=backup_verify','--no-owner','--exit-on-error','/tmp/database.dump'],{stdio:['ignore','ignore',restoreLog]});}finally{fs.closeSync(restoreLog);}
 const restoredTables=JSON.parse(isolated("SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema';"));
 if(JSON.stringify(restoredTables)!==JSON.stringify(tables))throw new Error('Restored table inventory differs');
 for(const table of counts){const actual=JSON.parse(isolated("SET TIME ZONE 'UTC'; SELECT row_to_json(result) FROM ("+hashQuery(table)+') result;').trim().split('\n').pop());if(actual.count!==table.count||actual.hash!==table.hash)throw new Error('Restored rows differ: '+table.schema+'.'+table.name);}
 restored=true;
 fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify({result:'PASS',directory,container,image,sha256,tables:tables.length,network:'none',rolePasswords:'not included; managed roles preserved on source',verifiedAt:new Date().toISOString()},null,2));
 console.log('PASS full archive restored; all '+tables.length+' table counts and row hashes match, including private schemas. Container: '+container);
})().catch(error=>{fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'FAILED.txt'),error.message);console.error('STOP backup verification failed: '+error.message);console.error('Diagnostic files: '+directory);process.exitCode=1;}).finally(async()=>{await client.end();if(!restored)console.error('No shared migration or application deployment was performed.');});
