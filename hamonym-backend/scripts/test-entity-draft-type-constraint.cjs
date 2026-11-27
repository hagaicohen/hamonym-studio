// Isolated, synthetic fixtures only. No provider calls or shared database access.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const container='hamonym-086-restore-1793822033591';
const base='hamonym_company_verify_1794243110269';
function sql(database,input){return execFileSync('docker',['exec','-i',container,'psql','-U','supabase_admin','-d',database,'-X','-q','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe']});}
(async()=>{
 const result=sql(base+'_rollback',`BEGIN;
 DO $$ DECLARE kind text; violated text; BEGIN
 FOREACH kind IN ARRAY ARRAY['sole_exempt','sole_registered'] LOOP
  BEGIN
   INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status)
   VALUES ('Synthetic card-step prerequisite',9,kind,'190987654','draft');
   RAISE EXCEPTION 'Expected type constraint rejection';
  EXCEPTION WHEN check_violation THEN
   GET STACKED DIAGNOSTICS violated = CONSTRAINT_NAME;
   IF violated <> 'entities_entity_type_check' THEN RAISE EXCEPTION 'Unexpected constraint'; END IF;
  END;
 END LOOP;
 INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status)
 VALUES ('Synthetic nonprofit prerequisite',9,'association','190987655','draft');
 END $$;
 ROLLBACK;`);
 console.log('PASS: pre-migration schema rejects both sole-proprietor types with SQLSTATE 23514/entities_entity_type_check; nonprofit draft succeeds');
 sql(base,`BEGIN;
 INSERT INTO public.entities(display_name,created_by_user_id,entity_type,registration_number,status) VALUES
 ('Synthetic exempt prerequisite',9,'sole_exempt','190987654','draft'),
 ('Synthetic registered prerequisite',9,'sole_registered','190987655','draft'),
 ('Synthetic nonprofit prerequisite',9,'association','190987655','draft');
 ROLLBACK;`);
 console.log('PASS: already-migrated isolated schema accepts nonprofit and both proprietor drafts; synthetic fixtures rolled back; no migration executed');
 const controller={};let logged=false;
 const error=Object.assign(new Error('synthetic constraint failure'),{code:'23514',constraint:'entities_entity_type_check'});
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/modules/entities/entities.controller.js'),'utf8'),{exports:controller,console:{error(){logged=true}},require:name=>name==='./entity-identity'?require('../src/modules/entities/entity-identity'):name==='./entities.service'?{createEntity:async()=>{throw error}}:(()=>{throw Error('Unexpected dependency')})()});
 let status,body;const response={status(value){status=value;return this},json(value){body=value;return this}};
 await controller.createEntity({user:{id:9},body:{entity_type:'sole_exempt'}},response);
 assert.equal(status,500);assert.equal(body.error,'Failed to create entity');assert(logged);
 console.log('PASS: POST /api/entities controller converts this DB exception to the reported HTTP 500; no billing account or CardCom path invoked');
})().catch(error=>{console.error('FAIL',error.code||error.name);process.exitCode=1});
