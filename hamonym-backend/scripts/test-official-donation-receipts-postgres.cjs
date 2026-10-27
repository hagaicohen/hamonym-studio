// Isolated PostgreSQL + fixture CardCom responses. Never loads dotenv or contacts CardCom.
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
for (const key of Object.keys(process.env)) if (/CARDCOM|DATABASE_URL|SUPABASE|DB_|EMAIL_|JWT_SECRET/.test(key)) delete process.env[key];
Object.assign(process.env, { DB_HOST:'127.0.0.1', DB_PORT:'5433', DB_NAME:'hamonym_receipts_verify_20261027',
  DB_USER:'postgres', DB_PASSWORD:'testpass', DB_SSL:'false', JWT_SECRET:'isolated-receipts-test-only',
  EMAIL_ENABLED:'true', EMAIL_PROVIDER:'resend', FRONTEND_URL:'http://localhost:4200' });
require('node:https').request = () => { throw new Error('External HTTPS forbidden'); };
const axios = require('axios');
let calls = 0, current = null, pdfFailure = false, emailed, recurringFixture, transactionId=7001, documentOffset=0;
const recurringAccount = crypto.randomInt(100000, 2000000000);
const recurringId = crypto.randomInt(100000, 2000000000);
const documentNumber = crypto.randomInt(100000, 2000000000);
const pdf = Buffer.from('%PDF-1.4\nfixture-official-provider-document');
axios.defaults.adapter = async config => {
  calls++;
  const url = new URL(config.url, config.baseURL);
  let data;
  if (url.pathname.endsWith('/LowProfile/Create')) {
    const body = JSON.parse(config.data);
    assert.equal(String(body.TerminalNumber), '200266');
    assert.equal(body.Document.TaxId, '123456782');
    data = { ResponseCode:0, LowProfileId:crypto.randomUUID(), Url:'https://example.invalid/unused' };
  } else if (url.pathname.endsWith('/LowProfile/GetLpResult')) {
    assert(current);
    data = { ResponseCode:0, TranzactionId:transactionId, ReturnValue:current.id, LowProfileId:current.low_profile_id,
      TranzactionInfo:{ ResponseCode:0, Amount:Number(current.amount), CoinId:1 },
      DocumentInfo:{ ResponseCode:0, DocumentNumber:documentNumber+documentOffset, DocumentType:'DonationReceipt' } };
  } else if (url.pathname.endsWith('/RecuringPayments/GetRecurringPaymentHistory')) {
    data = { ResponseCode:0, RecurringPaymentHistory: recurringFixture ? [recurringFixture] : [] };
  } else if (url.pathname.toLowerCase().endsWith('/getdocumentpdf.aspx')) {
    assert.equal(config.maxRedirects,0); data=pdf;
  } else if (url.pathname.endsWith('/Documents/CreateDocumentUrl')) {
    if (pdfFailure) throw new Error('fixture-private-error');
    const body = JSON.parse(config.data);
    assert.equal(body.DocumentType, 'DonationReceipt');
    data = { ResponseCode:0, DocUrl:'https://secure.cardcom.solutions/api/v11/documents/DownloadDoc/?fixture=1' };
  } else if (url.pathname.startsWith('/api/v11/documents/DownloadDoc/')) {
    assert.equal(config.maxRedirects,0);
    data = pdf;
  } else throw new Error('Unexpected external operation in isolated test: '+url.pathname);
  return { data, status:200, statusText:'OK', headers:{}, config };
};
require(root+'/src/modules/payment/pilot-provider-boundary').install(axios);
const db = require(root+'/src/db/db');
const email = require(root+'/src/modules/email/email.service');
email.send = async payload => { emailed=payload; return {status:'sent'}; };
email.queue = () => { throw new Error('Internal receipt email must not be sent'); };
const express = require('express');
const app=express();app.use(express.json());
app.get('/session-probe',require(root+'/src/middleware/require-auth'),(req,res)=>res.json({id:req.user.id}));
app.use('/auth',require(root+'/src/routes/auth.routes'));
app.use('/api/donations',require(root+'/src/modules/donations/donations.routes'));
const donations = require(root+'/src/modules/donations/donations.service');
const official = require(root+'/src/modules/donations/official-receipt.service');
let server, base;
async function api(method,route,body,token) {
 const result=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const contentType=result.headers.get('content-type')||'';
 return {status:result.status,body:contentType.includes('application/json')?await result.json():Buffer.from(await result.arrayBuffer()),headers:result.headers};
}
(async()=>{
 assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name,process.env.DB_NAME);
 const campaign=(await db.query('SELECT id,entity_id FROM campaigns LIMIT 1')).rows[0];
 assert(campaign);
 await db.query("UPDATE entities SET status='active',cardcom_terminal_number='200266',cardcom_api_username='isolated-user',cardcom_api_password_encrypted='isolated-pass',cardcom_connection_status='success' WHERE id=$1",[campaign.entity_id]);
 server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));base='http://127.0.0.1:'+server.address().port;
 const emailAddress='receipt-'+crypto.randomUUID()+'@example.invalid';
 const donor={name:'Receipt fixture',email:emailAddress,phone:'0500000000',idNumber:'123456782'};
 const initialized=await api('POST','/api/donations',{campaignId:campaign.id,donor,amount:100,embedded:true});
 assert.equal(initialized.status,200,JSON.stringify(initialized.body));
 assert(initialized.body.lowProfileId);assert(!initialized.body.paymentProvider);
 current=(await db.query('SELECT * FROM donations WHERE id=$1',[initialized.body.donationId])).rows[0];
 const handler=require(root+'/src/modules/payment/handlers/payment.handler');
 assert.equal((await handler.handle({ReturnValue:current.id,LowProfileId:current.low_profile_id})).outcome,'paid');
 assert.equal((await handler.handle({ReturnValue:current.id,LowProfileId:current.low_profile_id})).outcome,'already_paid');
 const receipt=(await db.query('SELECT id FROM receipts WHERE donation_id=$1',[current.id])).rows[0];
 assert(receipt);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM receipt_documents WHERE receipt_id=$1',[receipt.id])).rows[0].n,1);
 const createUser=async (email,name)=>api('POST','/auth/register',{email,password:'isolated-test-password',full_name:name});
 const owner=await createUser(emailAddress,'Owner');assert.equal(owner.status,200);let token=owner.body.token; const oldToken=token;
 assert.equal((await db.query('SELECT donor_user_id FROM donations WHERE id=$1',[current.id])).rows[0].donor_user_id,null);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id)).status,401);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,token)).status,404);
 assert.equal((await api('GET','/api/donations/my',null,token)).body.donations.length,0);
 const prior=(await db.query("INSERT INTO donations(campaign_id,entity_id,amount,status,donor_email) VALUES($1,$2,25,'pending',$3) RETURNING id",[campaign.id,campaign.entity_id,emailAddress])).rows[0].id;
 // Admin list must expose the same receipt as donor history without dropping unreceipted donations.
 const adminPaid=await donations.getPlatformDonations({campaignId:campaign.id,status:'paid',limit:1000});
 assert.equal(adminPaid.donations.find(d=>d.id===current.id).receipt_id,receipt.id);
 assert.equal(new Set(adminPaid.donations.map(d=>d.id)).size,adminPaid.donations.length);
 const adminPending=await donations.getPlatformDonations({campaignId:campaign.id,status:'pending',limit:1000});
 assert.equal(adminPending.donations.find(d=>d.id===prior).receipt_id,null);
 assert.equal(adminPaid.total,(await db.query("SELECT count(*)::int AS n FROM donations WHERE campaign_id=$1 AND status='paid'",[campaign.id])).rows[0].n);
 const request=await api('POST','/auth/me/donation-verification',{},token);assert.equal(request.status,200);
 const verification=new URL(emailed.data.verificationUrl).searchParams.get('verification');
 const stored=(await db.query('SELECT donation_verification_hash FROM users WHERE id=$1',[owner.body.user.id])).rows[0].donation_verification_hash;
 assert.notEqual(stored,verification);assert.equal(stored,crypto.createHash('sha256').update(verification).digest('hex'));
 const outsider=await createUser('other-'+crypto.randomUUID()+'@example.invalid','Other');
 assert.equal((await api('POST','/auth/me/verify-donations',{token:verification},outsider.body.token)).status,400);
 const passwordBefore=(await db.query('SELECT password_hash FROM users WHERE id=$1',[owner.body.user.id])).rows[0].password_hash;
 const verified=await api('POST','/auth/me/verify-donations',{token:verification},token);assert.equal(verified.status,200);
 token=verified.body.token;assert(token&&token!==oldToken);
 assert.equal((await api('GET','/api/donations/my',null,oldToken)).body.donations.length,0);
 const oldCalls=calls;
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id,null,oldToken)).status,404);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,oldToken)).status,404);
 assert.equal(calls,oldCalls);
 assert.equal((await db.query('SELECT password_hash FROM users WHERE id=$1',[owner.body.user.id])).rows[0].password_hash,passwordBefore);
 const jwt=require('jsonwebtoken');
 const oldClaims=jwt.verify(oldToken,process.env.JWT_SECRET),newClaims=jwt.verify(token,process.env.JWT_SECRET);
 assert.equal(oldClaims.exp,newClaims.exp);assert.equal(oldClaims.roleId,newClaims.roleId);
 assert.equal((await api('GET','/session-probe',null,oldToken)).status,200);
 assert.equal((await api('POST','/auth/me/verify-donations',{token:verification},token)).status,400);
 const mine=(await api('GET','/api/donations/my',null,token)).body.donations;
 assert(mine.some(d=>d.id===current.id&&d.status==='paid'));assert(mine.some(d=>d.id===prior&&d.status==='pending'));
 const metadata=await api('GET','/api/donations/receipt/'+receipt.id,null,token);assert.equal(metadata.status,200);assert(metadata.body.available);
 assert(!JSON.stringify(metadata.body).match(/isolated-pass|DocUrl|DocumentUrl|donor_email/));
 const downloaded=await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,token);
 assert.equal(downloaded.status,200);assert.deepEqual(downloaded.body,pdf);assert.equal(downloaded.headers.get('cache-control'),'private, no-store');
 const before=calls;assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,outsider.body.token)).status,404);assert.equal(calls,before);
 const admin=await createUser('admin-'+crypto.randomUUID()+'@example.invalid','Admin');
 await db.query('INSERT INTO user_entities(user_id,entity_id,role) VALUES($1,$2,\'manager\')',[admin.body.user.id,campaign.entity_id]);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,admin.body.token)).status,200);
 const superAdmin=await createUser('super-'+crypto.randomUUID()+'@example.invalid','Super');
 await db.query('UPDATE users SET is_super_admin=true WHERE id=$1',[superAdmin.body.user.id]);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,superAdmin.body.token)).status,200);
 pdfFailure=true;
 const failed=await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,token);assert.equal(failed.status,503);assert(!JSON.stringify(failed.body).includes('fixture-private-error'));
 assert.equal((await db.query('SELECT status FROM donations WHERE id=$1',[current.id])).rows[0].status,'paid');
 const client=require(root+'/src/modules/payment/cardcom/document.client');
 for(const url of ['http://secure.cardcom.solutions/x','https://127.0.0.1/x','https://user:pass@secure.cardcom.solutions/x','https://evil.example/x'])assert.throws(()=>client.safeDocumentUrl(url));
 const unbacked=(await db.query('SELECT id FROM receipts WHERE id<>$1 LIMIT 1',[receipt.id])).rows[0];
 if(unbacked){assert.equal((await api('GET','/api/donations/receipt/'+unbacked.id,null,superAdmin.body.token)).body.available,false);}

 // Missing later recurring documents are recovered only by an exact verified history row.
 pdfFailure=false;
 const ri=(await db.query(`INSERT INTO recurring_instructions(entity_id,campaign_id,donor_name,donor_email,amount,status,cardcom_account_id,cardcom_recurring_id)
   VALUES($1,$2,'Recurring fixture',$3,20,'active',$4,$5) RETURNING id`,[campaign.entity_id,campaign.id,emailAddress,recurringAccount,recurringId])).rows[0];
 const recurringDonation=(await db.query(`INSERT INTO donations(campaign_id,entity_id,amount,status,donor_email,recurring_instruction_id,provider_reference,provider_row_id)
   VALUES($1,$2,20,'paid',$3,$4,'8008','6789') RETURNING id`,[campaign.id,campaign.entity_id,emailAddress,ri.id])).rows[0];
 const recurringReceipt=await donations.finalizePaidDonation(recurringDonation.id);
 recurringFixture={Status:'SUCCESSFUL',RowID:6789,AccountID:recurringAccount,TerminalNumber:200266,TranzactionId:8008,
   FinalDebitCoinID:1,SumToBill:20,DocumentType:3,DocumentNumber:documentNumber+1};
 assert.equal((await api('GET','/api/donations/receipt/'+recurringReceipt.id+'/pdf',null,token)).status,200);
 const saved=(await db.query('SELECT * FROM receipt_documents WHERE receipt_id=$1',[recurringReceipt.id])).rows[0];
 assert.equal(saved.document_type,'3'); assert.equal(saved.transaction_reference,'8008');
 assert.equal((await api('GET','/api/donations/receipt/'+recurringReceipt.id+'/pdf',null,token)).status,200);
 assert.equal((await db.query('SELECT count(*)::int AS n FROM receipt_documents WHERE receipt_id=$1',[recurringReceipt.id])).rows[0].n,1);
 const rejected=await client.recurringDocument({terminalNumber:200266,apiName:'fixture',apiPassword:'fixture'},
   {provider_row_id:'6789',cardcom_account_id:recurringAccount,provider_reference:'8008',amount:21});
 assert.equal(rejected,null);
 const recurringService=require(root+'/src/modules/donations/recurring.service');
 assert.equal(await recurringService.verifyOwnership(ri.id,owner.body.user.id),false);
 assert.equal(await recurringService.verifyOwnership(ri.id,owner.body.user.id,newClaims.donationProofVersion),true);
 assert.equal((await recurringService.getMyRecurringInstructions(owner.body.user.id)).length,0);
 // A second email proof revokes only prior donor-access grants.
 await db.query('UPDATE users SET donation_verification_sent_at=NULL WHERE id=$1',[owner.body.user.id]);
 assert.equal((await api('POST','/auth/me/donation-verification',{},token)).status,200);
 const nextProof=new URL(emailed.data.verificationUrl).searchParams.get('verification');
 const refreshed=await api('POST','/auth/me/verify-donations',{token:nextProof},token);assert.equal(refreshed.status,200);
 assert.equal((await api('GET','/api/donations/receipt/'+recurringReceipt.id,null,token)).status,404);
 token=refreshed.body.token;
 assert.equal((await api('GET','/api/donations/receipt/'+recurringReceipt.id,null,token)).status,200);
 // Authorization always uses current account state and current ownership.
 await db.query('UPDATE users SET is_active=false WHERE id=$1',[owner.body.user.id]);
 assert.equal((await api('GET','/api/donations/receipt/'+recurringReceipt.id,null,token)).status,404);
 assert.equal((await api('GET','/api/donations/my',null,token)).body.donations.length,0);
 await db.query('UPDATE users SET is_active=true WHERE id=$1',[owner.body.user.id]);
 await db.query('UPDATE donations SET donor_user_id=$2 WHERE id=$1',[recurringDonation.id,outsider.body.user.id]);
 assert.equal((await api('GET','/api/donations/receipt/'+recurringReceipt.id,null,token)).status,404);
 await db.query('UPDATE donations SET donor_user_id=$2 WHERE id=$1',[recurringDonation.id,owner.body.user.id]);
 // Known cancellation metadata never resurrects the old document through a repeated lookup.
 await db.query("UPDATE receipt_documents SET document_status='cancelled' WHERE receipt_id=$1",[receipt.id]);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,token)).status,404);
 assert.equal((await db.query('SELECT status FROM donations WHERE id=$1',[current.id])).rows[0].status,'paid');

 // A subsequent completed donation appears immediately in the same verified account.
 const firstDonation=current.id;
 transactionId=7002;documentOffset=2;
 const second=await api('POST','/api/donations',{campaignId:campaign.id,donor,amount:30,embedded:true});
 assert.equal(second.status,200);
 current=(await db.query('SELECT * FROM donations WHERE id=$1',[second.body.donationId])).rows[0];
 assert.equal((await handler.handle({ReturnValue:current.id,LowProfileId:current.low_profile_id})).outcome,'paid');
 const afterSecond=(await api('GET','/api/donations/my',null,token)).body.donations;
 assert(afterSecond.some(d=>d.id===firstDonation&&d.status==='paid'));
 assert(afterSecond.some(d=>d.id===current.id&&d.status==='paid'));
 assert.equal((await api('POST','/auth/me/donation-verification',{},token)).status,429);
 // Changing an account email does not grant access under an old verification.
 await db.query('UPDATE users SET email=$2 WHERE id=$1',[owner.body.user.id,'changed-'+crypto.randomUUID()+'@example.invalid']);
 assert.equal((await api('GET','/api/donations/my',null,token)).body.donations.length,0);
 assert.equal((await api('GET','/api/donations/receipt/'+receipt.id+'/pdf',null,token)).status,404);
 console.log(JSON.stringify({result:'PASS',adminListReceiptAssociation:true,unreceiptedDonationsPreserved:true,database:process.env.DB_NAME,checkoutTerminal:200266,realProviderWithFixtureTransport:true,verifiedPayment:true,officialPdfBytesUnchanged:true,
 donorOwnershipVerification:true,preVerificationSessionsRejected:true,scopedProofRotation:true,passwordHashUnchanged:true,jwtExpiryPreserved:true,currentOwnershipChecked:true,guestHistoryLinked:true,secondPaidDonationInHistory:true,changedEmailRejected:true,singleUseToken:true,wrongAccountRejected:true,donorAndOrganizationAndSuperAdminAuthorization:true,
 duplicateDocumentPrevented:true,recurringIndividualReceipt:true,recurringAmountMismatchRejected:true,cancelledDocumentNotResurrected:true,paymentUnaffectedByDocumentFailure:true,externalPaymentCalls:0}));
})().catch(error=>{console.error('FAIL',error.code||'',error.message,error.stack);process.exitCode=1;}).finally(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));await db.end();
});
