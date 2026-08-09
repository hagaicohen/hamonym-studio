const db = require('../../../db/db');

// Marks a webhook event already claimed by idempotency.service.js as
// processed — success or failure. Read/write enrichment of the audit trail
// only, no business logic (mirrors the Responsibility split in
// docs/CARDCOM_INTEGRATION.md).
exports.recordProcessed = async (eventId, { error } = {}) => {
  if (!eventId) return;

  await db.query(
    `UPDATE cardcom_webhook_events SET processed_at = NOW(), error = $1 WHERE id = $2`,
    [error || null, eventId]
  );
};
