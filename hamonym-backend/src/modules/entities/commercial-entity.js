const isCommercialEntity = type => ['sole_exempt', 'sole_registered', 'company'].includes(type);

// Approval is not billing activation. Existing explicit account provisioning
// supplies fee_rate; never infer commercial terms from the nonprofit default.
async function assertCommercialPaymentReady(db, entity) {
  if (!isCommercialEntity(entity.entity_type)) return;
  const account = (await db.query(
    'SELECT fee_rate, enforcement_status FROM billing_accounts WHERE entity_id = $1',
    [entity.entity_id]
  )).rows[0];
  if (!account || account.fee_rate == null || account.enforcement_status !== 'active' ||
      entity.cardcom_connection_status !== 'success' || !entity.cardcom_terminal_number ||
      !entity.cardcom_api_username || !entity.cardcom_api_password_encrypted) {
    throw Object.assign(new Error('Commercial payment setup is incomplete'),
      {status: 409, code: 'COMMERCIAL_PAYMENT_NOT_READY'});
  }
}
module.exports = {isCommercialEntity, assertCommercialPaymentReady};
