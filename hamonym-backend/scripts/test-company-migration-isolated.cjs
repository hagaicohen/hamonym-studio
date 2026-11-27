const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const container='hamonym-086-restore-1793822033591';
const target='hamonym_company_verify_'+Date.now();
const run=(args,input)=>execFileSync('docker',['exec',...(input?['-i']:[]),container,...args],{encoding:'utf8',input,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});
const sql=(database,input)=>run(['psql','-U','supabase_admin','-d',database,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input);
try {
 const dump=run(['pg_dump','-U','supabase_admin','-d','backup_verify','--schema-only','--no-owner','--no-acl','--no-publications','--no-subscriptions']);
 sql('postgres',`CREATE DATABASE ${target};`);
 console.log('Isolated schema-only database: '+target);
 sql(target,dump);
 console.log('PASS schema-only clone of existing restore');
 const forward=fs.readFileSync('docs/migration-proposals/company-identity.proposed.sql','utf8');
 const backward=fs.readFileSync('docs/migration-proposals/company-identity.rollback.proposed.sql','utf8');
 const schema=()=>run(['pg_dump','-U','supabase_admin','-d',target,'--schema-only','--no-owner','--no-acl','--no-publications','--no-subscriptions']).replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\\(un)?restrict /.test(l)).join('\n');
 const before=schema();
 sql(target,forward);const once=schema();sql(target,forward);assert.equal(schema(),once);
 console.log('PASS migration and idempotency');
 sql(target,`BEGIN;
 INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status) VALUES
 ('Synthetic association',9,'association','580-123 456','draft'),
 ('Synthetic exempt',9,'sole_exempt','123-456 789','draft'),
 ('Synthetic registered',9,'sole_registered','987654321','pending_review'),
 ('Synthetic company',9,'company','510123456','draft');
 DO $$ BEGIN
 IF (SELECT count(*) FROM public.entities WHERE registration_jurisdiction='IL' AND identifier_type=CASE entity_type WHEN 'association' THEN 'association_number' WHEN 'company' THEN 'company_number' ELSE 'business_number' END)<>4 THEN RAISE EXCEPTION 'mapping mismatch'; END IF;
 BEGIN
 INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status) VALUES ('Duplicate',9,'sole_registered','123456789','rejected');
 RAISE EXCEPTION 'duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
 INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status) VALUES ('Duplicate company namespace',9,'chalatz','510-123 456','suspended');
 RAISE EXCEPTION 'company/chalatz duplicate accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 END $$;
 ROLLBACK;`);
 console.log('PASS four mappings and normalized cross-status/cross-type uniqueness');
 // Persist only synthetic company fixture to prove rollback refuses history loss.
 sql(target,"INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status) VALUES ('Synthetic rollback guard',9,'company','510999999','draft');");
 let refused=false;try{sql(target,backward)}catch(e){refused=String(e.stderr).includes('Company records exist');}
 assert(refused);console.log('PASS rollback blocks company records');
 // A second schema-only database has no company rows; never delete fixtures.
 const rollbackDb=target+'_rollback';sql('postgres',`CREATE DATABASE ${rollbackDb};`);
 sql(rollbackDb,dump);sql(rollbackDb,forward);sql(rollbackDb,backward);sql(rollbackDb,backward);
 const rollbackSchema=run(['pg_dump','-U','supabase_admin','-d',rollbackDb,'--schema-only','--no-owner','--no-acl','--no-publications','--no-subscriptions']).replace(/\r\n/g,'\n').split('\n').filter(l=>!/^\\(un)?restrict /.test(l)).join('\n');
 assert.equal(rollbackSchema,before);console.log('PASS exact schema rollback and rollback idempotency');
 console.log('PASS all checks; isolated databases retained; original restore unmodified');
} catch(e){console.error('FAIL '+e.message.slice(0,500));if(e.stderr)console.error(String(e.stderr).slice(-1800));process.exitCode=1;}


