'use strict';
const pool=require('../../db/db'),XLSX=require('xlsx'),{createHash}=require('node:crypto');
const {getStatementBalance}=require('./statement-balance.service');const {hasOpenCollectionHold}=require('./payment-exceptions.service');
const fail=(code)=>Object.assign(new Error(code),{code});
const cents=value=>{if(typeof value==='number'){if(!Number.isFinite(value)||value<0||Math.abs(value*100-Math.round(value*100))>0.001)throw fail('INVALID_EXPORT_AMOUNT');return Math.round(value*100);}const m=/^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));if(!m)throw fail('INVALID_EXPORT_AMOUNT');return Number(m[1])*100+Number((m[2]||'').padEnd(2,'0'));};
const money=value=>(value/100).toFixed(2);
function manifest(rows,mode){
 const groups=new Map();for(const row of rows){const key=mode==='entity'?row.entity_id:row.entity_id+':'+row.billing_period_id;let group=groups.get(key);if(!group){group={entityId:row.entity_id,entityName:row.entity_name,amountCents:0,bank:row,components:[]};groups.set(key,group);}group.amountCents+=cents(row.amount);group.components.push({proposalId:row.proposal_id,statementId:row.statement_id,periodId:row.billing_period_id,periodStart:row.period_start,periodEnd:row.period_end,amount:row.amount});}
 const instructions=[...groups.values()];const token=createHash('sha256').update(JSON.stringify({mode,rows})).digest('hex');
 return {mode,previewToken:token,totalAmount:money(instructions.reduce((sum,row)=>sum+row.amountCents,0)),organizationCount:new Set(rows.map(row=>row.entity_id)).size,periodCount:new Set(rows.map(row=>row.billing_period_id)).size,instructions};
}
function periodDescription(component){
 const end=new Date(component.periodEnd),parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Jerusalem',day:'numeric',hour:'numeric',hourCycle:'h23'}).formatToParts(end);
 const get=type=>Number(parts.find(p=>p.type===type)?.value),date=get('day')===28&&get('hour')===20?end:new Date(component.periodStart);
 return new Intl.DateTimeFormat('he-IL',{timeZone:'Asia/Jerusalem',month:'2-digit',year:'numeric'}).format(date);
}
function publicManifest(m,excluded){return {...m,instructions:m.instructions.map((g,index)=>({ordinal:index+1,entityId:g.entityId,entityName:g.entityName,amount:money(g.amountCents),bankLast4:String(g.bank.account_number).slice(-4),components:g.components})),excluded};}
async function execute(options,guards){
 const {superAdminUserId,previewOnly=false,expectedPreviewToken}=options;if(!previewOnly&&!superAdminUserId)throw fail('MISSING_ADMIN_USER');
 const client=await pool.connect();try{await client.query(previewOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
 const setting=(await client.query('SELECT masav_consolidation_mode FROM platform_billing_settings WHERE id=1'+(previewOnly?'':' FOR SHARE'))).rows[0];
 const mode=setting?.masav_consolidation_mode;if(!['entity','period'].includes(mode))throw fail('MASAV_EXPORT_SCHEMA_REQUIRED');
 let ids=options.proposalIds;if(ids===undefined)ids=(await client.query("SELECT id FROM masav_collection_proposals WHERE status='approved' ORDER BY statement_id,id")).rows.map(row=>row.id);
 if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'||! /^[0-9a-f-]{36}$/i.test(id)))throw fail('INVALID_PROPOSAL_IDS');if(new Set(ids).size!==ids.length)throw fail('DUPLICATE_PROPOSAL_IDS');
 if(!ids.length&&!previewOnly)throw fail('MISSING_PROPOSAL_IDS');
 const peeks=ids.length?(await client.query('SELECT id,statement_id FROM masav_collection_proposals WHERE id=ANY($1::uuid[]) ORDER BY statement_id,id',[ids])).rows:[];
 if(peeks.length!==ids.length)throw fail('PROPOSAL_NOT_FOUND');
 const rows=[],excluded=[];
 for(const peek of peeks){
  const statement=(await client.query('SELECT s.id,s.status,s.billing_period_id,ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE s.id=$1'+(previewOnly?'':' FOR UPDATE OF s'),[peek.statement_id])).rows[0];
  const proposal=(await client.query('SELECT * FROM masav_collection_proposals WHERE id=$1'+(previewOnly?'':' FOR UPDATE'),[peek.id])).rows[0];
  let reason=proposal.status!=='approved'?'PROPOSAL_NOT_APPROVED':!['approved','open'].includes(statement.status)?'STATEMENT_NOT_ACTIONABLE':null;
  const balance=await getStatementBalance(statement.id,client);const mandate=await guards.checkMasavMandate(statement.entity_id,client);
  const exported=await guards.hasExportedMasavProposal(statement.id,client),hold=await hasOpenCollectionHold(statement.entity_id,client),unresolved=await guards.findUnresolvedAttempt(statement.id,client);
  reason=reason|| (exported.exists?'MASAV_ALREADY_EXPORTED':hold.held?'COLLECTION_HELD':unresolved?'UNRESOLVED_COLLECTION_ATTEMPT':!mandate.valid?mandate.reason:balance.outstanding<=0?'NO_OUTSTANDING_BALANCE':cents(balance.outstanding)!==cents(proposal.proposed_amount)?'PROPOSAL_STALE_AT_EXPORT':null);
  if(reason){if(!previewOnly)throw fail(reason);excluded.push({proposalId:proposal.id,statementId:statement.id,entityId:statement.entity_id,reason});continue;}
  const detail=(await client.query(`SELECT e.display_name AS entity_name,e.contact_full_name,e.contact_email,emd.bank_code,emd.branch_code,emd.account_number,emd.authorized,bp.period_start,bp.period_end
    FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id JOIN entities e ON e.id=ba.entity_id JOIN billing_periods bp ON bp.id=s.billing_period_id
    JOIN entity_masav_details emd ON emd.entity_id=ba.entity_id WHERE s.id=$1`+(previewOnly?'':' FOR SHARE OF emd'),[statement.id])).rows[0];
  if(!detail?.authorized||!detail.bank_code||!detail.branch_code||!detail.account_number)throw fail('NOT_AUTHORIZED');
  rows.push({...detail,entity_id:statement.entity_id,billing_period_id:statement.billing_period_id,proposal_id:proposal.id,statement_id:statement.id,amount:proposal.proposed_amount});
 }
 const m=manifest(rows,mode);if(previewOnly){await client.query('COMMIT');return publicManifest(m,excluded);}
 if(expectedPreviewToken&&expectedPreviewToken!==m.previewToken)throw fail('MASAV_PREVIEW_CHANGED');
 if(!rows.length)throw fail('NO_ELIGIBLE_INSTRUCTIONS');
 const batch=(await client.query('INSERT INTO masav_export_batches(consolidation_mode,total_amount,created_by) VALUES($1,$2,$3) RETURNING id',[mode,m.totalAmount,superAdminUserId])).rows[0].id;
 const fileRows=[],trace=[];
 for(let index=0;index<m.instructions.length;index++){
  const group=m.instructions[index],bank=group.bank;
  const instruction=(await client.query('INSERT INTO masav_export_instructions(batch_id,entity_id,ordinal,total_amount,bank_snapshot) VALUES($1,$2,$3,$4,$5::jsonb) RETURNING id',[batch,group.entityId,index+1,money(group.amountCents),JSON.stringify({bank:bank.bank_code,branch:bank.branch_code,account:bank.account_number})])).rows[0].id;
  const labels=[];
  for(const component of group.components){
   await client.query('INSERT INTO masav_export_components(instruction_id,proposal_id,statement_id,billing_period_id,amount) VALUES($1,$2,$3,$4,$5)',[instruction,component.proposalId,component.statementId,component.periodId,component.amount]);
   await client.query("UPDATE masav_collection_proposals SET status='exported',exported_at=now(),exported_by_user_id=$2 WHERE id=$1",[component.proposalId,superAdminUserId]);
   await client.query("INSERT INTO platform_audit_log(super_admin_user_id,entity_id,action,notes) VALUES($1,$2,'masav_proposal_exported',$3)",[superAdminUserId,group.entityId,JSON.stringify({batchId:batch,instructionId:instruction,proposalId:component.proposalId,statementId:component.statementId,amount:component.amount})]);
   labels.push(periodDescription(component));
   const retrySource=(await client.query('SELECT original_instruction_id FROM masav_retry_proposals WHERE proposal_id=$1',[component.proposalId])).rows[0];
   trace.push([instruction,group.entityName,component.statementId,component.proposalId,component.periodId,new Date(component.periodStart).toISOString(),new Date(component.periodEnd).toISOString(),Number(component.amount),retrySource?.original_instruction_id || '']);
  }
  fileRows.push([bank.bank_code,bank.branch_code,bank.account_number,Number(money(group.amountCents)),'T','1',group.entityName,bank.contact_full_name||'',bank.contact_email||'',[...new Set(labels)].join(', '),instruction]);
 }
 const book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet([
  ['מספר בנק', 'מספר סניף', 'מספר חשבון בסניף', 'סכום', 'ברירת מחדל', 'מטבע - 1 = ש"ח', 'חברה', 'איש קשר', 'מייל', 'תיאור מוצר', 'הערות'],
  ['bank','branch','account','sum','tranmode','currency','company','contact','email','pdesc','remarks'],...fileRows]);
 for(let row=2;row<fileRows.length+2;row++)for(const col of [0,1,2]){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];cell.t='s';cell.z='@';cell.v=String(cell.v);}
 XLSX.utils.book_append_sheet(book,sheet,'MASAV');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Instruction','Organization','Statement','Proposal','Billing period','Period start','Period end','Amount','Original instruction'],...trace]),'Debt allocations');
 const buffer=XLSX.write(book,{type:'buffer',bookType:'xlsx',cellStyles:true});await client.query('COMMIT');return buffer;
 }catch(e){await client.query('ROLLBACK').catch(()=>{});throw e;}finally{client.release();}
}
module.exports={execute};
