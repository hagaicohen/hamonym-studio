// B5 — Stale Pending Donations (docs/CARDCOM_OPERATIONAL_PROCESSES.md).
// A donation stuck in 'pending' past a normal checkout window usually just
// means the donor abandoned checkout — but it can also mean Cardcom
// actually completed the charge and the webhook that should have told us
// never arrived (B4, Lost Webhook Detection, is this job's by-product, not
// a separate one). Uses GetLpResult, the same call payment.handler.js
// already makes for the live webhook — Verified, not a new API surface.
//
// Detect-only, per the explicit policy for this first pass: writes a
// reconciliation_findings row, never calls markDonationPaid itself. Repair
// stays a deliberate admin action (or a later, explicitly-approved phase).
const cardcomClient = require('../modules/payment/cardcom/cardcom.client');
const { resolveCardcomCredentials } = require('../modules/donations/donations.service');

const STALE_AFTER_HOURS = 2;

module.exports = {
  name: 'stale-pending-donations',
  timeoutMs: 3 * 60 * 1000,
  handler: async (db) => {
    const res = await db.query(
      `SELECT id, low_profile_id, campaign_id, amount
       FROM donations
       WHERE status = 'pending'
         AND low_profile_id IS NOT NULL
         AND created_at < NOW() - INTERVAL '${STALE_AFTER_HOURS} hours'
       ORDER BY created_at ASC
       LIMIT 50`
    );

    let checked = 0;
    let stillPendingAtCardcom = 0;
    let lostWebhookFindings = 0;
    let lookupFailed = 0;

    for (const row of res.rows) {
      checked++;
      try {
        const credentials = await resolveCardcomCredentials(row.id);
        const result = await cardcomClient.getLpResult({ ...credentials, lowProfileId: row.low_profile_id });

        if (result?.ResponseCode === 0 && result?.TranzactionId) {
          // Cardcom says this succeeded — Hamonym never heard about it.
          await db.query(
            `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details)
             VALUES ('stale-pending-donations', 'lost_webhook_paid', 'critical', 'donation', $1, $2)`,
            [row.id, JSON.stringify({ lowProfileId: row.low_profile_id, cardcomTranzactionId: result.TranzactionId, amount: row.amount })]
          );
          lostWebhookFindings++;
        } else {
          stillPendingAtCardcom++;
        }
      } catch (err) {
        lookupFailed++;
        await db.query(
          `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details)
           VALUES ('stale-pending-donations', 'lookup_failed', 'warning', 'donation', $1, $2)`,
          [row.id, JSON.stringify({ error: err.message })]
        );
      }
    }

    return { checked, stillPendingAtCardcom, lostWebhookFindings, lookupFailed };
  },
};
