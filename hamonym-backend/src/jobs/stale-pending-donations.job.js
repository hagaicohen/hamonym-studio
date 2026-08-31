// B5 — Stale Pending Donations (docs/CARDCOM_OPERATIONAL_PROCESSES.md).
// A donation stuck in 'pending' past a normal checkout window usually just
// means the donor abandoned checkout — but it can also mean Cardcom
// actually completed the charge and the webhook that should have told us
// never arrived (B4, Lost Webhook Detection, is this job's by-product, not
// a separate one). Uses GetLpResult, the same call payment.handler.js
// already makes for the live webhook — Verified, not a new API surface.
//
// 2026-08-31 (Donation Engine closure WP3): upgraded from detect-only to
// detect-AND-repair. Originally this only recorded a finding when CardCom
// showed a successful transaction, leaving `markDonationPaid` to a human
// every time ("Repair stays a deliberate admin action... for this first
// pass" — that pass is now closed). It now calls payment.handler.js#handle
// with a reconstructed payload ({ReturnValue, LowProfileId}) instead of
// duplicating GetLpResult+Gate v1+markDonationPaid logic here — the exact
// same function the live webhook calls, so a donation recovered by this job
// converges to identical state (Gate v1 checked, campaign aggregate,
// receipt, recurring-signup completion) as one recovered by a real
// redelivered webhook. This never blind-retries a charge: it only ever
// calls a read-only GetLpResult and finalizes locally from CardCom's own
// authoritative answer, exactly the same safety property the live webhook
// path already has.
//
// Still explicitly NOT handled here (a business decision, not a technical
// one — see the Donation Engine closure report): converting an old pending
// donation to 'failed'. A donation that stays not-paid-at-Cardcom forever
// just stays 'pending' — deciding when that should become 'failed' is
// deliberately left open.
const paymentHandler = require('../modules/payment/handlers/payment.handler');
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
    let recovered = 0;
    let stillPendingAtCardcom = 0;
    let gateHeld = 0;
    let alreadyPaid = 0;
    let lookupFailed = 0;

    for (const row of res.rows) {
      checked++;
      try {
        const outcome = await paymentHandler.handle({
          ReturnValue: String(row.id),
          LowProfileId: row.low_profile_id,
        });

        if (outcome.outcome === 'paid') {
          recovered++;
          await recordFinding(db, {
            jobName: 'stale-pending-donations',
            findingType: 'lost_webhook_recovered',
            severity: 'warning', // recovered, not an open problem -- visibility record
            subjectType: 'donation',
            subjectId: row.id,
            details: { lowProfileId: row.low_profile_id, amount: row.amount },
          });
        } else if (outcome.outcome === 'verification_hold') {
          // payment.handler.js's own holdForVerification already recorded a
          // critical gate_v1_mismatch finding -- do not duplicate it here.
          gateHeld++;
        } else if (outcome.outcome === 'already_paid') {
          // Race with something else (e.g. a live webhook that arrived
          // moments before this job ran) -- markDonationPaid's own
          // `status != 'paid'` guard made this a no-op, exactly as intended.
          alreadyPaid++;
        } else {
          // 'not_paid_at_cardcom' or any other non-final outcome -- Cardcom
          // itself doesn't yet show a successful transaction for this
          // LowProfileId. Nothing to do; stays 'pending' for a later run.
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

    // Separate, narrower problem (2026-08-31, Donation Engine closure WP3):
    // a donation that crashed BEFORE low_profile_id was even persisted has
    // no Cardcom query key at all -- GetLpResult needs a LowProfileId, and
    // there is no API to look up "did some LowProfile session exist for
    // ReturnValue=X" the other way around. This is NOT auto-recoverable;
    // per the explicit instruction not to guess, this is surfaced as a
    // finding for human review rather than silently invisible (the gap the
    // audit found: the old query's own `low_profile_id IS NOT NULL` filter
    // meant these rows were never even looked at).
    const noLowProfileIdRes = await db.query(
      `SELECT id FROM donations
       WHERE status = 'pending' AND low_profile_id IS NULL
         AND created_at < NOW() - INTERVAL '${STALE_AFTER_HOURS} hours'
       ORDER BY created_at ASC
       LIMIT 50`
    );
    for (const row of noLowProfileIdRes.rows) {
      await recordFinding(db, {
        jobName: 'stale-pending-donations',
        findingType: 'pending_donation_missing_low_profile_id',
        severity: 'warning',
        subjectType: 'donation',
        subjectId: row.id,
        details: { note: 'No LowProfileId was ever persisted -- Cardcom cannot be queried for this donation by any known key. Requires manual investigation, not auto-recoverable.' },
      });
    }

    // Auto-resolve: a donation stops being a candidate for any of these
    // finding types the moment it's no longer 'pending' — rechecked
    // directly per finding's own subject, not "missing from this run's
    // LIMIT 50", so it's correct even when more than 50 rows are stale at
    // once.
    const resolvedRes = await db.query(
      `UPDATE reconciliation_findings f
       SET resolved_at = NOW(), resolved_by = 'system'
       WHERE f.job_name = 'stale-pending-donations' AND f.resolved_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.id = f.subject_id AND d.status = 'pending')`
    );

    return {
      checked, recovered, stillPendingAtCardcom, gateHeld, alreadyPaid, lookupFailed,
      missingLowProfileIdFound: noLowProfileIdRes.rows.length,
      autoResolved: resolvedRes.rowCount,
    };
  },
};
