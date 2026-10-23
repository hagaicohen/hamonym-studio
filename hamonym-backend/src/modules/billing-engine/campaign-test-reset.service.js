'use strict';
const pool = require('../../db/db');
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
function fail(code, status=409) { return Object.assign(new Error(code), { code, status }); }
const messages = {
 RESET_DISABLED:'איפוס בדיקות כבוי. נדרש אישור מפורש לפני הפעלה.',
 RESET_APPROVAL_REQUIRED:'נדרש אישור חד־פעמי לרשומות המדויקות המוצגות.',
 RESET_PREVIEW_STALE:'הנתונים השתנו מאז התצוגה המקדימה. יש לרענן ולקבל אישור חדש.',
 MIXED_CAMPAIGN_STATEMENT:'קיים חיוב משותף לכמה קמפיינים. האיפוס נחסם כדי לשמור על הרשומות האחרות.',
 PROVIDER_OPERATION_UNRESOLVED:'קיימת פעולת תשלום פתוחה או לא ודאית. יש להשלים התאמה לפני איפוס.',
 RECURRING_CAMPAIGN_UNSUPPORTED:'קיימת הוראת קבע. נדרשת בדיקה נפרדת מול ספק התשלום לפני איפוס.',
 PAYMENT_EXCEPTION_REQUIRES_REVIEW:'קיימת חריגת תשלום המחייבת בדיקה לפני איפוס.',
 MASAV_REQUIRES_REVIEW:'קיימת פעילות מס״ב המחייבת בדיקה לפני איפוס.',
 RESET_MIGRATION_REQUIRED:'מנגנון האיפוס טרם הותקן במסד הנתונים.',
 NOTHING_TO_RESET:'אין רשומות לאיפוס בקמפיין זה.',
 BACKUP_NOT_CONFIGURED:'לא הוגדרה תיקיית גיבוי מוגנת מחוץ למאגר הקוד.',
 RESET_CONFIRMATION_REQUIRED:'נדרש אישור מפורש, שם הקמפיין וסיבה למחיקה.',
 RESET_NOT_AUTHORIZED:'אין הרשאה לביצוע האיפוס.',
 CAMPAIGN_NOT_FOUND:'הקמפיין לא נמצא.',
 CROSS_ENTITY_RECORD:'נמצאו רשומות המשויכות לעמותה אחרת. נדרשת בדיקה לפני איפוס.',
 CROSS_CAMPAIGN_DEPENDENCY:'נמצאה תלות ברשומות קמפיין אחר. לא ניתן לאפס אותן אוטומטית.',
 CAMPAIGN_TOTALS_INCONSISTENT:'סיכומי הקמפיין אינם תואמים לתרומות. נדרשת התאמה לפני איפוס.',
 SNAPSHOT_TOO_LARGE:'היקף הרשומות גדול מדי לאיפוס מהממשק. נדרש גיבוי וביצוע מבוקר נפרד.',
 UNREVIEWED_FOREIGN_KEY:'קיימת תלות נוספת בסכימה המחייבת בדיקה. לא בוצעה מחיקה.',
};
function normalize(err) {
 if (messages[err.code]) return Object.assign(err,{message:messages[err.code]});
 for(const code of Object.keys(messages)) if(String(err.message).includes(code)) return Object.assign(fail(code,code==='RESET_NOT_AUTHORIZED'?403:code==='CAMPAIGN_NOT_FOUND'?404:409),{message:messages[code]});
 if(['42883','42P01'].includes(err.code)) return Object.assign(fail('RESET_MIGRATION_REQUIRED',503),{message:messages.RESET_MIGRATION_REQUIRED});
 if(['55P03','40001','40P01'].includes(err.code)) return Object.assign(fail('RESET_BUSY'),{message:'קיימת פעילות מקבילה. האיפוס בוטל ללא מחיקה.'});
 return Object.assign(fail('RESET_FAILED',503),{message:'לא ניתן להשלים או לאמת את האיפוס. יש לרענן ולבדוק את הגיבוי לפני ניסיון נוסף.'});
}
async function snapshot(db,id) {
 if(typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw fail('CAMPAIGN_NOT_FOUND',404);
 const {rows}=await db.query('SELECT public.campaign_test_reset_snapshot($1)::text AS snapshot_text',[id]);
 const text=rows[0].snapshot_text;
 if(Buffer.byteLength(text,'utf8')>10*1024*1024) throw fail('SNAPSHOT_TOO_LARGE');
 return {text,data:JSON.parse(text),hash:createHash('sha256').update(text,'utf8').digest('hex')};
}
async function approval(db,id,hash) {
 const {rows}=await db.query('SELECT 1 FROM public.campaign_reset_approvals WHERE campaign_id=$1 AND (allow_repeated_resets OR (snapshot_sha256=$2 AND used_at IS NULL)) AND expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.users WHERE id=approved_by AND is_super_admin)',[id,hash]);return !!rows[0];
}
async function preview(id) {
 try {
  const s=await snapshot(pool,id);const counts=Object.fromEntries(Object.entries(s.data.tables).map(([t,rows])=>[t,rows.length]));
  const empty=counts.donations===0;
  const enabled=process.env.CAMPAIGN_TEST_RESET_ENABLED==='true';
  const approved=await approval(pool,id,s.hash);
  let code=empty?'NOTHING_TO_RESET':!enabled?'RESET_DISABLED':!approved?'RESET_APPROVAL_REQUIRED':null;
  if(!code){try{backupDirectory();}catch(err){code='BACKUP_NOT_CONFIGURED';}}
  return {campaignId:id,campaignTitle:s.data.campaign.title,available:!code,code,message:code?messages[code]:'האיפוס מאושר לרשומות המוצגות בלבד.',
   snapshotHash:s.hash,counts,totalRecords:Object.values(counts).reduce((a,b)=>a+b,0),
   recordIds:Object.fromEntries(Object.entries(s.data.tables).map(([t,rows])=>[t,rows.map(r=>String(r.id))]))};
 }catch(err){throw normalize(err);}
}
function backupDirectory() {
 const configured=process.env.CAMPAIGN_TEST_RESET_BACKUP_DIR;
 if(!configured||!path.isAbsolute(configured))throw fail('BACKUP_NOT_CONFIGURED');
 const dir=fs.realpathSync(configured);
 for(let p=dir;;p=path.dirname(p)){if(fs.existsSync(path.join(p,'.git')))throw fail('BACKUP_NOT_CONFIGURED');if(path.dirname(p)===p)break;}
 if(process.platform!=='win32'&&(fs.statSync(dir).mode&0o077)!==0)throw fail('BACKUP_NOT_CONFIGURED');
 return dir;
}
function backup(s) {
 const dir=backupDirectory();
 const file=path.join(dir,'campaign-reset-'+randomUUID()+'.json');
 const fd=fs.openSync(file,'wx',0o600);
 try{fs.writeFileSync(fd,s.text,'utf8');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==s.hash)throw fail('BACKUP_VERIFICATION_FAILED');
 return file;
}
async function reset(id,input,actorId) {
 let client;
 try {
  if(process.env.CAMPAIGN_TEST_RESET_ENABLED!=='true')throw fail('RESET_DISABLED',403);
  if(!actorId||input?.confirmed!==true||typeof input.reason!=='string'||input.reason.trim().length<3
    ||typeof input.campaignTitle!=='string'||!/^[a-f0-9]{64}$/.test(input.expectedSnapshotHash||''))throw fail('RESET_CONFIRMATION_REQUIRED',400);
  client=await pool.connect();await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='15s'");
  const s=await snapshot(client,id);
  if(s.hash!==input.expectedSnapshotHash)throw fail('RESET_PREVIEW_STALE');
  if(s.data.campaign.title!==input.campaignTitle)throw fail('RESET_CONFIRMATION_REQUIRED',400);
  if(!await approval(client,id,s.hash))throw fail('RESET_APPROVAL_REQUIRED');
  const file=backup(s); // fsync + hash verification finish BEFORE any financial DELETE.
  const {rows}=await client.query('SELECT public.execute_campaign_test_reset($1,$2,$3,$4,$5) AS result',[id,s.hash,actorId,input.reason.trim(),file]);
  const result=rows[0].result;
  if(result?.reset!==true||Object.entries(s.data.tables).some(([t,records])=>result.deleted[t]!==records.length))throw fail('RESET_VERIFICATION_FAILED');
  await client.query('COMMIT');return result;
 }catch(err){if(client)await client.query('ROLLBACK').catch(()=>{});throw normalize(err);}
 finally{if(client)client.release();}
}
module.exports={preview,reset};
