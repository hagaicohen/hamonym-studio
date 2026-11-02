// Restore only into the task's existing --network none Docker container.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{execFileSync}=require('child_process');
const [directory,container]=process.argv.slice(2);
if(!directory || !/^hamonym-084-restore-\d+$/.test(container||''))throw new Error('Explicit backup directory and task restore container required');
function docker(args,options={}){return execFileSync('docker',args,{encoding:'utf8',windowsHide:true,...options});}
const quote=value=>'"'+value.replace(/"/g,'""')+'"';
const hashQuery=table=>`SELECT count(*)::text AS count,md5(COALESCE(string_agg(fingerprint,'' ORDER BY fingerprint),'')) AS hash FROM (SELECT md5(row_to_json(t)::text) AS fingerprint FROM ${quote(table.schema)}.${quote(table.name)} t) rows`;
function query(sql){return docker(['exec','-i',container,'psql','-h','127.0.0.1','-U','supabase_admin','-d','backup_verify','-X','-A','-t','-v','ON_ERROR_STOP=1'],{input:sql});}
(async()=>{
 const isolation=JSON.parse(docker(['inspect',container,'--format','{{json .HostConfig.NetworkMode}}']));if(isolation!=='none')throw new Error('Restore container is not isolated');
 const archive=path.join(directory,'database.dump');const sha256=crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');if(sha256!==fs.readFileSync(path.join(directory,'database.dump.sha256'),'utf8').trim())throw new Error('Archive checksum mismatch');
 docker(['exec',container,'dropdb','-h','127.0.0.1','-U','supabase_admin','--if-exists','backup_verify']);
 docker(['exec',container,'createdb','-h','127.0.0.1','-U','supabase_admin','backup_verify']);
 const log=fs.openSync(path.join(directory,'pg-restore-admin.log'),'w');
 try{docker(['exec',container,'pg_restore','--host=127.0.0.1','--username=supabase_admin','--dbname=backup_verify','--no-owner','--exit-on-error','/tmp/database.dump'],{stdio:['ignore','ignore',log]});}finally{fs.closeSync(log);}
 const expected=JSON.parse(fs.readFileSync(path.join(directory,'before.json'),'utf8'));
 const inventory=JSON.parse(query("SELECT json_agg(json_build_object('schema',n.nspname,'name',c.relname) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema';"));
 if(JSON.stringify(inventory)!==JSON.stringify(expected.map(({schema,name})=>({schema,name}))))throw new Error('Restored table inventory differs');
 for(const table of expected){const actual=JSON.parse(query("SET TIME ZONE 'UTC';SELECT row_to_json(result) FROM ("+hashQuery(table)+') result;').trim().split('\n').pop());if(actual.count!==table.count||actual.hash!==table.hash)throw new Error('Restored rows differ: '+table.schema+'.'+table.name);}
 fs.writeFileSync(path.join(directory,'verification.json'),JSON.stringify({result:'PASS',directory,container,sha256,tables:expected.length,network:'none',restoreRole:'existing supabase_admin',verifiedAt:new Date().toISOString()},null,2));
 if(fs.existsSync(path.join(directory,'FAILED.txt')))fs.renameSync(path.join(directory,'FAILED.txt'),path.join(directory,'initial-restore-failure.txt'));
 console.log('PASS: full backup restored with existing local admin; '+expected.length+' table inventories, counts and content hashes match. '+directory);
})().catch(e=>{console.error('STOP: '+e.message);process.exitCode=1;});
