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
const { recordFinding } = require('./reconciliation-findings');

const STALE_AFTER_HOURS = 2;

module.exports = {
  name: 'stale-pending-donations',
  // Approved production schedule (Operational Policy, 2026-08-16): hourly,
  // automatic — real Cardcom cost (GetLpResult per row) rules out something
  // tighter like every-15-min, but this is the "real money, undetected"
  // finding of the four, so daily was judged too slow. Not wired to a
  // scheduler yet.
  schedule: '0 * * * *',
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
          await recordFinding(db, {
            jobName: 'stale-pending-donations',
            findingType: 'lost_webhook_paid',
            severity: 'critical',
            subjectType: 'donation',
            subjectId: row.id,
            details: { lowProfileId: row.low_profile_id, cardcomTranzactionId: result.TranzactionId, amount: row.amount },
          });
          lostWebhookFindings++;
        } else {
          stillPendingAtCardcom++;
        }
      } catch (err) {
        lookupFailed++;
        await recordFinding(db, {
          jobName: 'stale-pending-donations',
          findingType: 'lookup_failed',
          severity: 'warning',
          subjectType: 'donation',
          subjectId: row.id,
          details: { error: err.message },
        });
      }
    }

    // Auto-resolve: a donation stops being a candidate for either finding
    // type the moment it's no longer 'pending' (paid via webhook-recovery,
    // marked failed, etc.) — rechecked directly per finding's own subject,
    // not "missing from this run's LIMIT 50", so it's correct even when
    // more than 50 rows are stale at once.
    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'stale-pending-donations' AND f.resolved_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.id = f.subject_id AND d.status = 'pending')`
    );

    return { checked, stillPendingAtCardcom, lostWebhookFindings, lookupFailed, autoResolved: resolvedRes.rowCount };
  },
};
