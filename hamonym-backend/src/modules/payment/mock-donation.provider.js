// Test-only transport. New persistent mock sessions use the existing donation ledger.
const {randomUUID,createHash}=require('node:crypto');
const db=()=>require('../../db/db');
const PREFIX='hamonym-mock:';
const reference=(id,status='paid')=>'mock:'+status+':'+id;
const valid=id=>typeof id==='string' && /^hamonym-mock:[0-9a-f-]{36}$/.test(id);
const fail=(code,status=409)=>Object.assign(new Error(code),{code,status});
async function createLowProfile(payload){
 if(!payload.ReturnValue||!Number.isFinite(Number(payload.Amount))||Number(payload.Amount)<=0)throw fail('INVALID_MOCK_PAYMENT',400);
 const id=PREFIX+randomUUID();const url=new URL('/mock-payment',process.env.FRONTEND_URL||'http://localhost:4200');
 url.searchParams.set('id',payload.ReturnValue);url.searchParams.set('amount',String(payload.Amount));url.searchParams.set('session',id);
 return {ResponseCode:0,LowProfileId:id,Url:url.toString()};
}
async function getLpResult({lowProfileId}={}){
 if(!valid(lowProfileId))return {ResponseCode:9998,Description:'No confirmed mock donor transaction'};
 const row=(await db().query('SELECT id,amount,provider_reference FROM donations WHERE low_profile_id=$1',[lowProfileId])).rows[0];
 if(!row||row.provider_reference!==reference(lowProfileId))return {ResponseCode:9998,Description:'Mock payment not confirmed'};
 return {ResponseCode:0,LowProfileId:lowProfileId,ReturnValue:row.id,TranzactionId:reference(lowProfileId),TranzactionInfo:{ResponseCode:0,Amount:Number(row.amount),CoinId:1}};
}
async function confirm({donationId,session,status}){
 if(!valid(session)||!['paid','failed'].includes(status))throw fail('INVALID_MOCK_SESSION',400);
 const client=await db().connect();try{await client.query('BEGIN');
 const row=(await client.query('SELECT id,status,low_profile_id,provider_reference FROM donations WHERE id=$1 FOR UPDATE',[donationId])).rows[0];
 if(!row||row.low_profile_id!==session)throw fail('DONATION_NOT_A_NEW_MOCK_SESSION',403);
 const ref=reference(session,status);
 if(row.provider_reference && row.provider_reference!==ref)throw fail('MOCK_RESULT_ALREADY_CONFIRMED');
 if(row.status!=='pending' && row.status!==status)throw fail('MOCK_RESULT_ALREADY_FINAL');
 if(row.status==='pending'){const at=await require('../../lib/clock').now(client);await client.query('UPDATE donations SET provider_reference=$1,provider_charged_at=COALESCE(provider_charged_at,$3) WHERE id=$2',[ref,donationId,at]);}
 await client.query('COMMIT');return {ReturnValue:donationId,LowProfileId:session,TranzactionId:ref,RecordType:'Payment'};
 }catch(error){await client.query('ROLLBACK').catch(()=>{});throw error;}finally{client.release();}
}
async function createRecurring(args){
 if(!valid(args.lowProfileDealGuid))throw fail('NOT_A_MOCK_RECURRING_SIGNUP');
 const row=(await db().query("SELECT recurring_instruction_id FROM donations WHERE low_profile_id=$1 AND status='paid' AND provider_reference=$2",[args.lowProfileDealGuid,reference(args.lowProfileDealGuid)])).rows[0];
 if(!row||String(row.recurring_instruction_id)!==String(args.returnValue))throw fail('MOCK_RECURRING_SIGNUP_NOT_CONFIRMED');
 const id=-(createHash('sha256').update(String(args.returnValue)).digest().readUInt32BE(0)%2147483646+1);
 const collision=(await db().query('SELECT id FROM recurring_instructions WHERE cardcom_recurring_id=$1 AND id<>$2',[id,args.returnValue])).rows[0];
 if(collision)throw fail('MOCK_RECURRING_ID_CONFLICT');
 return {ResponseCode:'0',AccountId:id,'Recurring0.RecurringId':id};
}
async function updateRecurring(args){
 const id=args.recurringId;if(!Number.isInteger(Number(id))||Number(id)>=0)throw fail('NOT_A_MOCK_RECURRING_INSTRUCTION');
 const row=(await db().query("SELECT ri.id FROM recurring_instructions ri WHERE ri.cardcom_recurring_id=$1 AND EXISTS(SELECT 1 FROM donations d WHERE d.recurring_instruction_id=ri.id AND d.low_profile_id LIKE 'hamonym-mock:%' AND d.status='paid')",[id])).rows[0];
 if(!row)throw fail('NOT_A_MOCK_RECURRING_INSTRUCTION');return {ResponseCode:'0'};
}
async function getRecurringPaymentHistory({accountId}={}){
 if(!Number.isInteger(Number(accountId))||Number(accountId)>=0)return {ResponseCode:9998,Description:'No confirmed mock recurring history'};
 const row=(await db().query("SELECT ri.* FROM recurring_instructions ri WHERE ri.cardcom_account_id=$1 AND ri.cardcom_recurring_id<0 AND EXISTS(SELECT 1 FROM donations d WHERE d.recurring_instruction_id=ri.id AND d.low_profile_id LIKE 'hamonym-mock:%' AND d.status='paid')",[accountId])).rows[0];
 if(!row)return {ResponseCode:9998,Description:'No confirmed mock recurring history'};
 const represented=(await db().query("SELECT provider_reference,amount,completed_at FROM donations WHERE recurring_instruction_id=$1 AND status='paid' AND provider_reference LIKE 'mock-recurring:%'",[row.id])).rows;
 const history=represented.map(d=>({RecurringId:row.cardcom_recurring_id,Status:'SUCCESSFUL',SumToBill:Number(d.amount),TranzactionId:d.provider_reference,CreateDate:d.completed_at}));
 return {ResponseCode:0,RecurringPaymentHistory:history};
}
module.exports={name:'mock',createLowProfile,getLpResult,confirm,createRecurring,updateRecurring,getRecurringPaymentHistory};
