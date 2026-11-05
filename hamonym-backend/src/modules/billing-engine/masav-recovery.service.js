'use strict';
// Manual bank-result finalization and retry preparation. No provider operations.
const pool = require('../../db/db');
const { getStatementBalance } = require('./statement-balance.service');
const fail = code => Object.assign(new Error(code), { code });
const money = value => (value / 100).toFixed(2);
const cents = value => Math.round(Number(value) * 100);
function validateConfirmation({reference, confirmedAt, confirmed, superAdminUserId}) {
 if (confirmed !== true || !superAdminUserId || typeof reference !== 'string'
  || !/^[A-Za-z0-9._:/-]{3,120}$/.test(reference) || typeof confirmedAt !== 'string'
  || !Number.isFinite(Date.parse(confirmedAt))) throw fail('INVALID_MASAV_RESULT');
}
async function finalizeInstruction(input) {
 validateConfirmation(input);
 const {instructionId, reference, confirmedAt, superAdminUserId} = input;
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[reference]);
  const instruction = (await client.query('SELECT * FROM masav_export_instructions WHERE id=$1 FOR UPDATE',[instructionId])).rows[0];
  if (!instruction) throw fail('MASAV_INSTRUCTION_NOT_FOUND');
  const previous = (await client.query('SELECT * FROM masav_instruction_finalizations WHERE instruction_id=$1 OR reference=$2',[instructionId,reference])).rows;
  if (previous.length) {
   const same = previous.length===1 && previous[0].instruction_id===instructionId && previous[0].reference===reference
    && new Date(previous[0].confirmed_at).toISOString()===new Date(confirmedAt).toISOString();
   if (!same) throw fail('MASAV_RESULT_REFERENCE_CONFLICT');
   await client.query('COMMIT'); return {...previous[0],replayed:true};
  }
  const amounts = (await client.query('SELECT COALESCE(SUM(amount),0) amount, MAX(confirmed_at) last_confirmed FROM masav_collection_results WHERE instruction_id=$1',[instructionId])).rows[0];
  if (amounts.last_confirmed && Date.parse(confirmedAt)<Date.parse(amounts.last_confirmed)) throw fail('INVALID_MASAV_RESULT');
  const referenceOwner = await client.query('SELECT 1 FROM masav_collection_results WHERE reference=$1 AND instruction_id<>$2',[reference,instructionId]);
  if (referenceOwner.rowCount) throw fail('MASAV_RESULT_REFERENCE_CONFLICT');
  const collected=cents(amounts.amount),original=cents(instruction.total_amount);
  if (collected>original) throw fail('MASAV_RESULT_EXCEEDS_OUTSTANDING');
  const outcome=collected===original?'completed':collected===0?'failed':'partial';
  const result=(await client.query(`INSERT INTO masav_instruction_finalizations(instruction_id,reference,outcome,collected_amount,original_remaining,confirmed_at,recorded_by)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[instructionId,reference,outcome,money(collected),money(original-collected),confirmedAt,superAdminUserId])).rows[0];
  await client.query('COMMIT');return {...result,replayed:false};
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
async function prepareRetry({instructionId, confirmed, superAdminUserId}) {
 if (confirmed!==true || !superAdminUserId) throw fail('INVALID_MASAV_RESULT');
 const client=await pool.connect();
 try {
  await client.query('BEGIN');
  const instruction=(await client.query('SELECT id FROM masav_export_instructions WHERE id=$1 FOR UPDATE',[instructionId])).rows[0];
  if (!instruction) throw fail('MASAV_INSTRUCTION_NOT_FOUND');
  const final=(await client.query('SELECT * FROM masav_instruction_finalizations WHERE instruction_id=$1',[instructionId])).rows[0];
  if (!final) throw fail('MASAV_RESULTS_NOT_FINALIZED');
  if (final.outcome==='completed') throw fail('MASAV_NO_RETRY_BALANCE');
  const existing=(await client.query('SELECT 1 FROM masav_retry_requests WHERE instruction_id=$1',[instructionId])).rowCount;
  if (existing) {
   const proposals=(await client.query('SELECT p.id,p.status,p.proposed_amount,r.statement_id FROM masav_retry_proposals r JOIN masav_collection_proposals p ON p.id=r.proposal_id WHERE original_instruction_id=$1 ORDER BY p.created_at,p.id',[instructionId])).rows;
   await client.query('COMMIT');return {replayed:true,proposals};
  }
  const components=(await client.query('SELECT statement_id,amount FROM masav_export_components WHERE instruction_id=$1 ORDER BY statement_id',[instructionId])).rows;
  for (const component of components) await client.query('SELECT id FROM statements WHERE id=$1 FOR UPDATE',[component.statement_id]);
  await client.query('INSERT INTO masav_retry_requests(instruction_id,requested_by) VALUES($1,$2)',[instructionId,superAdminUserId]);
  const proposals=[];
  for (const component of components) {
   const allocated=(await client.query(`SELECT COALESCE(SUM(a.amount),0) amount FROM masav_result_allocations a JOIN masav_collection_results r ON r.id=a.result_id WHERE r.instruction_id=$1 AND a.statement_id=$2`,[instructionId,component.statement_id])).rows[0];
   const residual=cents(component.amount)-cents(allocated.amount);
   const balance=await getStatementBalance(component.statement_id,client);
   if (residual<=0 || balance.outstanding<=0) continue;
   if (cents(balance.outstanding)>residual) throw fail('MASAV_RETRY_BALANCE_CONFLICT');
   const prepared=await require('./masav-proposal.service').prepareMasavProposal(component.statement_id,client);
   if (!prepared.proposed) throw fail('MASAV_RETRY_BLOCKED_'+prepared.reason);
   await client.query(`INSERT INTO masav_retry_proposals(proposal_id,original_instruction_id,statement_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[prepared.proposalId,instructionId,component.statement_id]);
   proposals.push({id:prepared.proposalId,statement_id:component.statement_id,proposed_amount:prepared.proposedAmount,status:prepared.status});
  }
  if (!proposals.length) throw fail('MASAV_NO_RETRY_BALANCE');
  await client.query('COMMIT');return {replayed:false,proposals};
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
async function listInstructions() {
 // One consistent read-only snapshot: amounts and outcomes must never straddle finalization/retry commits.
 const client=await pool.connect();
 try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const instructions=(await client.query(`SELECT i.id,i.batch_id,i.total_amount,i.ordinal,i.entity_id,e.display_name entity_name,b.created_at,b.consolidation_mode,
    f.outcome,f.reference final_reference,f.confirmed_at finalized_at,f.original_remaining,
    COALESCE((SELECT SUM(amount) FROM masav_collection_results r WHERE r.instruction_id=i.id),0) collected_amount,
    EXISTS(SELECT 1 FROM masav_retry_requests rr WHERE rr.instruction_id=i.id) retry_requested
   FROM masav_export_instructions i JOIN masav_export_batches b ON b.id=i.batch_id JOIN entities e ON e.id=i.entity_id
   LEFT JOIN masav_instruction_finalizations f ON f.instruction_id=i.id ORDER BY b.created_at DESC,i.ordinal`)).rows;
  for (const instruction of instructions) {
   const components=(await client.query(`SELECT c.statement_id,c.billing_period_id,c.amount,p.period_start,p.period_end,
     COALESCE((SELECT SUM(a.amount) FROM masav_result_allocations a JOIN masav_collection_results r ON r.id=a.result_id WHERE r.instruction_id=c.instruction_id AND a.statement_id=c.statement_id),0) collected_amount
    FROM masav_export_components c JOIN billing_periods p ON p.id=c.billing_period_id WHERE c.instruction_id=$1 ORDER BY p.period_end,p.period_start,c.statement_id`,[instruction.id])).rows;
   let outstanding=0;
   for (const component of components) {
    const balance=await getStatementBalance(component.statement_id,client);
    component.outstanding_amount=money(Math.max(0,Math.min(cents(component.amount)-cents(component.collected_amount),cents(balance.outstanding))));
    outstanding+=cents(component.outstanding_amount);
   }
   instruction.components=components;instruction.outstanding_amount=money(outstanding);
   instruction.status=instruction.outcome || (cents(instruction.collected_amount)>0 && cents(instruction.collected_amount)<cents(instruction.total_amount)?'partial':'pending');
   instruction.finalized=!!instruction.outcome;
   instruction.retry_eligible=['partial','failed'].includes(instruction.outcome) && !instruction.retry_requested && outstanding>0;
   instruction.allocations=(await client.query(`SELECT a.statement_id,a.amount,a.payment_id,r.reference,r.confirmed_at FROM masav_result_allocations a JOIN masav_collection_results r ON r.id=a.result_id WHERE r.instruction_id=$1 ORDER BY r.created_at,r.id,a.statement_id`,[instruction.id])).rows;
   instruction.parent_instruction_ids=(await client.query(`SELECT DISTINCT rp.original_instruction_id FROM masav_export_components c JOIN masav_retry_proposals rp ON rp.proposal_id=c.proposal_id WHERE c.instruction_id=$1`,[instruction.id])).rows.map(r=>r.original_instruction_id);
  }
  await client.query('COMMIT');return instructions;
 } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
module.exports={finalizeInstruction,prepareRetry,listInstructions};
