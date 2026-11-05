'use strict';
const pool = require('../../db/db');
const { getStatementBalance } = require('./statement-balance.service');
const { resolveAttempt } = require('../collection-engine/collection.service');
const fail = code => Object.assign(new Error(code), { code });
function cents(value) {
 const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
 if (!match) throw fail('INVALID_MASAV_RESULT');
 return Number(match[1])*100 + Number((match[2] || '').padEnd(2,'0'));
}
function allocateFifo(debts, amount) {
 let remaining = cents(amount);
 if (!remaining) throw fail('INVALID_MASAV_RESULT');
 const allocations = [];
 for (const debt of debts) {
  const allocated = Math.min(remaining, cents(debt.available));
  if (allocated) allocations.push({ statementId: debt.statementId, amount: (allocated/100).toFixed(2) });
  remaining -= allocated;
 }
 if (remaining) throw fail('MASAV_RESULT_EXCEEDS_OUTSTANDING');
 return allocations;
}
async function recordConfirmedResult({instructionId, reference, amount, confirmedAt, confirmed, superAdminUserId}) {
 if (confirmed !== true || typeof reference !== 'string' || !/^[A-Za-z0-9._:/-]{3,120}$/.test(reference)
  || !Number.isFinite(Date.parse(confirmedAt))) throw fail('INVALID_MASAV_RESULT');
 const amountCents = cents(amount);
 if (!amountCents) throw fail('INVALID_MASAV_RESULT');
 const client = await pool.connect();
 try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[reference]);
  const finalReferenceOwner=await client.query('SELECT 1 FROM masav_instruction_finalizations WHERE reference=$1 AND instruction_id<>$2',[reference,instructionId]);
  if(finalReferenceOwner.rowCount) throw fail('MASAV_RESULT_REFERENCE_CONFLICT');
  const previous = (await client.query('SELECT * FROM masav_collection_results WHERE reference=$1',[reference])).rows[0];
  if (previous) {
   if (previous.instruction_id !== instructionId || cents(previous.amount)!==amountCents || new Date(previous.confirmed_at).toISOString()!==new Date(confirmedAt).toISOString()) throw fail('MASAV_RESULT_REFERENCE_CONFLICT');
   const allocations=(await client.query('SELECT statement_id AS "statementId",amount,payment_id AS "paymentId" FROM masav_result_allocations WHERE result_id=$1',[previous.id])).rows;
   await client.query('COMMIT'); return {id:previous.id,allocations,replayed:true};
  }
  const instruction=(await client.query('SELECT id FROM masav_export_instructions WHERE id=$1 FOR UPDATE',[instructionId])).rows[0];
  if (!instruction) throw fail('MASAV_INSTRUCTION_NOT_FOUND');
  if ((await client.query('SELECT 1 FROM masav_instruction_finalizations WHERE instruction_id=$1',[instructionId])).rowCount) throw fail('MASAV_INSTRUCTION_FINALIZED');
  const components=(await client.query(`SELECT c.statement_id,c.amount,p.period_end,p.period_start FROM masav_export_components c JOIN billing_periods p ON p.id=c.billing_period_id WHERE instruction_id=$1 ORDER BY p.period_end,p.period_start,c.statement_id`,[instructionId])).rows;
  // Lock Statements in stable order, then allocate by original billing-period chronology.
  for (const id of [...new Set(components.map(c=>c.statement_id))].sort()) await client.query('SELECT id FROM statements WHERE id=$1 FOR UPDATE',[id]);
  const debts=[];
  for (const component of components) {
   const allocated=(await client.query(`SELECT COALESCE(SUM(a.amount),0) AS amount FROM masav_result_allocations a JOIN masav_collection_results r ON r.id=a.result_id WHERE r.instruction_id=$1 AND a.statement_id=$2`,[instructionId,component.statement_id])).rows[0];
   const balance=await getStatementBalance(component.statement_id,client);
   const available=Math.min(cents(component.amount)-cents(allocated.amount),Math.round(balance.outstanding*100));
   if (available<0) throw fail('MASAV_RESULT_BALANCE_CONFLICT');
   debts.push({statementId:component.statement_id,available:(available/100).toFixed(2)});
  }
  const allocations=allocateFifo(debts,amount);
  const result=(await client.query('INSERT INTO masav_collection_results(instruction_id,reference,amount,confirmed_at,recorded_by) VALUES($1,$2,$3,$4,$5) RETURNING id',[instructionId,reference,(amountCents/100).toFixed(2),confirmedAt,superAdminUserId])).rows[0];
  for (const allocation of allocations) {
   const unresolved=await client.query("SELECT id FROM collection_attempts WHERE statement_id=$1 AND status IN ('pending','ambiguous')",[allocation.statementId]);
   if (unresolved.rowCount) throw fail('MASAV_RESULT_UNRESOLVED_ATTEMPT');
   const attempt=(await client.query(`INSERT INTO collection_attempts(statement_id,collection_method,attempt_number,status,provider,requested_amount) SELECT $1,'masav',COALESCE(MAX(attempt_number),0)+1,'pending','masav',$2 FROM collection_attempts WHERE statement_id=$1 RETURNING id`,[allocation.statementId,allocation.amount])).rows[0];
   await resolveAttempt(attempt.id,allocation.statementId,{outcome:'succeeded',providerReference:result.id+':'+allocation.statementId,providerRawStatus:'manual_confirmed'},client);
   const payment=(await client.query('SELECT id FROM payments WHERE collection_attempt_id=$1',[attempt.id])).rows[0];
   await client.query('INSERT INTO masav_result_allocations(result_id,statement_id,payment_id,amount) VALUES($1,$2,$3,$4)',[result.id,allocation.statementId,payment.id,allocation.amount]);
   allocation.paymentId=payment.id;
  }
  await client.query('COMMIT'); return {id:result.id,allocations,replayed:false};
 } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
}
module.exports={allocateFifo,recordConfirmedResult};
