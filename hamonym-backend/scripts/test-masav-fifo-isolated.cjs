'use strict';
const assert=require('node:assert/strict');assert.match(process.env.DB_NAME,/^hamonym_masav_fifo_20261030(?:_v2)?$/);assert.equal(process.env.DB_HOST,'127.0.0.1');
for(const name of ['node:http','node:https'])require(name).request=()=>{throw Error('External calls forbidden')};
const db=require('../src/db/db'),svc=require('../src/modules/billing-engine/masav-result.service');
(async()=>{try{
assert.deepEqual(svc.allocateFifo([{statementId:'Nov',available:'540'},{statementId:'Dec',available:'540'},{statementId:'Jan',available:'540'}],'900'),[{statementId:'Nov',amount:'540.00'},{statementId:'Dec',amount:'360.00'}]);console.log('PASS exact approved FIFO example');
const instruction=(await db.query("SELECT i.id FROM masav_export_instructions i JOIN masav_export_components c ON c.instruction_id=i.id GROUP BY i.id HAVING COUNT(*)=3 AND SUM(c.amount)=1520 LIMIT 1")).rows[0];
const user=(await db.query('SELECT id FROM users ORDER BY id LIMIT 1')).rows[0].id;
const input={instructionId:instruction.id,reference:'isolated-fifo-900',amount:'900',confirmedAt:'2027-04-06T09:00:00Z',confirmed:true,superAdminUserId:user};
await assert.rejects(svc.recordConfirmedResult({...input,confirmed:false}),e=>e.code==='INVALID_MASAV_RESULT');console.log('PASS unconfirmed results rejected');
const concurrent=await Promise.all([svc.recordConfirmedResult(input),svc.recordConfirmedResult(input)]);assert.equal(concurrent.filter(x=>x.replayed).length,1);assert.deepEqual(concurrent[0].allocations.map(a=>a.amount),['440.00','460.00']);console.log('PASS confirmed FIFO and concurrent duplicate protection');
await assert.rejects(svc.recordConfirmedResult({...input,amount:'901'}),e=>e.code==='MASAV_RESULT_REFERENCE_CONFLICT');
await assert.rejects(svc.recordConfirmedResult({...input,reference:'isolated-overpayment',amount:'621'}),e=>e.code==='MASAV_RESULT_EXCEEDS_OUTSTANDING');console.log('PASS mismatched references and excess amounts rejected');
const final=await svc.recordConfirmedResult({...input,reference:'isolated-final-620',amount:'620'});assert.deepEqual(final.allocations.map(a=>a.amount),['80.00','540.00']);
assert.equal((await db.query('SELECT COUNT(*)::int n FROM masav_result_allocations')).rows[0].n,4);assert.equal((await db.query('SELECT SUM(amount)::text total FROM masav_result_allocations')).rows[0].total,'1520.00');
assert.equal((await db.query('SELECT COUNT(*)::int n FROM masav_result_allocations a JOIN payments p ON p.id=a.payment_id WHERE a.amount<>p.amount OR a.statement_id<>p.statement_id')).rows[0].n,0);console.log('PASS remaining debts settled with exact immutable payment trace');
console.log('PASS isolated tests only; external requests forbidden');
}finally{await db.end()}})().catch(e=>{console.error(e);process.exitCode=1});
