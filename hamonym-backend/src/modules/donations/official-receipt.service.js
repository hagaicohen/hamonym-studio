const db = require('../../db/db');
const { evaluateGateV1 } = require('../payment/verification-gate');
const client = require('../payment/cardcom/document.client');
const unavailable = () => Object.assign(new Error('Official receipt unavailable'), { status: 404 });
async function authorize(receiptId, userId, proof = null) {
  const { rows } = await db.query(
    `SELECT r.id AS receipt_id, d.id, d.amount, d.status, d.low_profile_id,
            d.provider_reference, d.entity_id, d.provider_row_id, ri.cardcom_account_id
     FROM receipts r JOIN donations d ON d.id=r.donation_id
     LEFT JOIN recurring_instructions ri ON ri.id=d.recurring_instruction_id
     JOIN users u ON u.id=$2 AND u.is_active=true AND u.deleted_at IS NULL
     WHERE r.id=$1 AND (
       u.is_super_admin=true OR
       EXISTS(SELECT 1 FROM user_entities ue WHERE ue.user_id=u.id AND ue.entity_id=d.entity_id) OR
       (d.donor_user_id=u.id AND u.donation_proof_version::text=$3 AND u.email_verified_at IS NOT NULL AND LOWER(u.donation_verified_email)=LOWER(u.email)
        AND LOWER(d.donor_email)=LOWER(u.email))
     )`, [receiptId, userId, proof]);
  if (!rows[0]) throw unavailable();
  return rows[0];
}
exports.authorize = authorize;
exports.captureVerified = async (donationId, result, credentials) => {
  const info = result?.DocumentInfo || result?.TranzactionInfo;
  if (info?.ResponseCode !== 0 || !Number.isSafeInteger(Number(info.DocumentNumber)) ||
      Number(info.DocumentNumber) <= 0 ||
      !/^(?:[A-Za-z][A-Za-z0-9]{0,63}|[1-9][0-9]{0,5})$/.test(String(info.DocumentType || '')) ||
      info.DocumentType === 'Error' || !credentials.terminalNumber || !result.TranzactionId) return false;
  const { rows } = await db.query(
    `INSERT INTO receipt_documents
       (receipt_id, provider_terminal, document_number, document_type, transaction_reference)
     SELECT r.id,$2,$3,$4,$5 FROM receipts r JOIN donations d ON d.id=r.donation_id
     WHERE d.id=$1 AND d.status='paid' AND d.provider_reference::text=$5
     ON CONFLICT(provider_terminal, document_type, document_number) DO NOTHING RETURNING id`,
    [donationId, String(credentials.terminalNumber), info.DocumentNumber, String(info.DocumentType), String(result.TranzactionId)]);
  return rows.length > 0;
};
exports.metadata = async (receiptId, userId, proof = null) => {
  await authorize(receiptId, userId, proof);
  const { rows } = await db.query(
    `SELECT id, document_number, document_type, document_status, issued_at
     FROM receipt_documents WHERE receipt_id=$1 ORDER BY recorded_at DESC,id`, [receiptId]);
  return { id: receiptId, documents: rows, available: rows.some(row => row.document_status === 'available') };
};
exports.pdf = async (receiptId, userId, proof = null) => {
  const donation = await authorize(receiptId, userId, proof);
  if (String(donation.low_profile_id || '').startsWith('hamonym-mock:') || String(donation.provider_reference || '').startsWith('mock:')) throw unavailable();
  const donationService = require('./donations.service');
  const credentials = await donationService.resolveCardcomCredentials(donation.id);
  let documents = (await db.query(
    `SELECT * FROM receipt_documents WHERE receipt_id=$1 AND document_status='available'
     ORDER BY recorded_at DESC,id LIMIT 1`, [receiptId])).rows;
  if (!documents.length && donation.status === 'paid' && donation.low_profile_id) {
    const result = await require('../payment/donation-provider').getDonationProvider().getLpResult({
      ...credentials, lowProfileId: donation.low_profile_id,
    });
    if (result?.ResponseCode === 0 &&
        String(result.TranzactionId) === String(donation.provider_reference) &&
        evaluateGateV1({ result, donation, donationId: donation.id }).pass) {
      await exports.captureVerified(donation.id, result, credentials);
      documents = (await db.query(
        `SELECT * FROM receipt_documents WHERE receipt_id=$1 AND document_status='available'
         ORDER BY recorded_at DESC,id LIMIT 1`, [receiptId])).rows;
    }
  }
  if (!documents.length && donation.status === 'paid' && Number(donation.cardcom_account_id) > 0 && donation.provider_reference) {
    const document = await client.recurringDocument(credentials, donation);
    if (document) {
      await exports.captureVerified(donation.id, document, credentials);
      documents = (await db.query(
        `SELECT * FROM receipt_documents WHERE receipt_id=$1 AND document_status='available'
         ORDER BY recorded_at DESC,id LIMIT 1`, [receiptId])).rows;
    }
  }
  if (!documents.length || String(documents[0].provider_terminal) !== String(credentials.terminalNumber)) throw unavailable();
  return client.getPdf(credentials, documents[0]);
};
