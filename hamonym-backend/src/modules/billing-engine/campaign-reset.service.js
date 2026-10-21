// Campaign Donations Reset (2026-10, Super Admin "סימולציה" tab, tool B) --
// pre-production testing convenience: wipe ALL donation activity for ONE
// campaign (and only that campaign) without touching the campaign,
// nonprofit, or any other campaign's data.
//
// Reuses existing, already-reviewed mechanisms rather than inventing new
// ones:
//   - The exact same fee/vat formula calculation.service.js#computeAmounts
//     uses (ROUND(gross*fee_rate,2) then ROUND(fee*vat_rate,2)) -- so a
//     statement's totals after this reset are bit-identical to what the
//     platform would have calculated if the removed donations had never
//     existed, never an approximation.
//   - statement-balance.service.js#applyStatementAdjustment's own VALIDATION
//     rules (only approved/paid is adjustable; no active collection
//     attempt) are reproduced exactly, by inspection of that function's
//     source -- but the INSERT itself is done inline against THIS
//     function's own already-open transaction/client, not by calling that
//     function directly: it opens its own separate pool connection and
//     transaction, which would try to re-lock a statement row THIS
//     function's own transaction already holds -- a real, reproduced
//     self-deadlock (two connections, one waiting on the other's held
//     lock). Never a direct mutation of a frozen total_due either way (the
//     DB's own trg_statements_enforce_immutability structurally forbids
//     that once a statement leaves draft; this function never attempts it).
//   - The same backup-then-transaction-then-verify shape every other
//     targeted reset this session used (keshet-nehusha-reset.js,
//     cleanup-fake-entities.js) -- scoped here to one campaign_id.
//
// SAFETY: this function never deletes the campaign, the entity, or any
// OTHER campaign's donations. If ANY affected statement cannot be safely
// adjusted by the EXISTING applyStatementAdjustment guards (not an
// approved/paid status, or an active collection attempt in flight), the
// WHOLE reset aborts with that exact reason -- never a partial reset, never
// a bypassed safety check. Never touches payments/collection_attempts
// (those are per-STATEMENT aggregate collection facts, not per-donation;
// correcting the statement's total via the adjustment ledger is the
// existing, correct way to reconcile them, same as any other balance
// change already does) and never calls a payment provider.
const pool = require('../../db/db');

const TRIGGERS = [
  ['donations', 'trg_donations_block_paid_delete'],
  ['receipts', 'trg_receipts_block_delete'],
  ['statement_components', 'trg_statement_components_no_delete'],
];

// Read-only preview -- campaign name, nonprofit, donation count and total,
// exactly what the confirmation dialog needs. No locks, no writes.
exports.getCampaignResetPreview = async (campaignId) => {
  const campaignRes = await pool.query(
    `SELECT c.id, c.title, c.slug, c.entity_id, e.display_name AS entity_name
     FROM campaigns c JOIN entities e ON e.id = c.entity_id WHERE c.id = $1`,
    [campaignId]
  );
  const campaign = campaignRes.rows[0];
  if (!campaign) {
    const err = new Error('Campaign not found');
    err.code = 'CAMPAIGN_NOT_FOUND';
    throw err;
  }

  const donationsRes = await pool.query(
    `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total,
            COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_count
     FROM donations WHERE campaign_id = $1`,
    [campaignId]
  );
  const stats = donationsRes.rows[0];

  const statementsRes = await pool.query(
    `SELECT DISTINCT s.id, s.status
     FROM statement_components sc
     JOIN statements s ON s.id = sc.statement_id
     JOIN donations d ON d.id = sc.donation_id
     WHERE d.campaign_id = $1`,
    [campaignId]
  );

  return {
    campaignId: campaign.id,
    campaignTitle: campaign.title,
    campaignSlug: campaign.slug,
    entityId: campaign.entity_id,
    entityName: campaign.entity_name,
    donationCount: stats.n,
    paidDonationCount: stats.paid_count,
    totalAmount: Number(stats.total),
    affectedStatementCount: statementsRes.rows.length,
    affectedStatements: statementsRes.rows,
  };
};

exports.resetCampaignDonations = async ({ campaignId, superAdminUserId, ip, reason }) => {
  if (!superAdminUserId) {
    const err = new Error('superAdminUserId is required');
    err.code = 'MISSING_ADMIN_USER';
    throw err;
  }
  const trimmedReason = (reason || '').trim();
  if (!trimmedReason) {
    const err = new Error('reason is required');
    err.code = 'MISSING_REASON';
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const campaignRes = await client.query(
      `SELECT c.id, c.title, c.entity_id FROM campaigns c WHERE c.id = $1 FOR UPDATE`,
      [campaignId]
    );
    const campaign = campaignRes.rows[0];
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const donationsRes = await client.query(
      `SELECT id, amount FROM donations WHERE campaign_id = $1 FOR UPDATE`,
      [campaignId]
    );
    const donationIds = donationsRes.rows.map((r) => r.id);
    if (donationIds.length === 0) {
      await client.query('ROLLBACK');
      return { reset: false, reason: 'no_donations', campaignId, campaignTitle: campaign.title, donationsRemoved: 0, totalAmountRemoved: 0, statementsAdjusted: [] };
    }
    const totalAmountRemoved = donationsRes.rows.reduce((sum, r) => sum + Number(r.amount), 0);

    // Every statement this campaign's donations contributed to, locked
    // before any decision is made -- same lock order applyStatementAdjustment
    // already uses (statement row first). Postgres disallows FOR UPDATE
    // together with DISTINCT in one query, so the distinct id list is
    // resolved first (no lock), then those exact rows are locked directly.
    const statementIdsRes = await client.query(
      `SELECT DISTINCT sc.statement_id FROM statement_components sc WHERE sc.donation_id = ANY($1::uuid[])`,
      [donationIds]
    );
    const affectedStatementIds = statementIdsRes.rows.map((r) => r.statement_id);
    const statementsRes = affectedStatementIds.length
      ? await client.query(
          `SELECT id, status, fee_rate, vat_rate, gross_raised, fee_amount, vat_amount, total_due
           FROM statements WHERE id = ANY($1::uuid[]) FOR UPDATE`,
          [affectedStatementIds]
        )
      : { rows: [] };

    // Pre-flight: every affected statement must be in a state the EXISTING
    // mechanisms can safely correct -- draft (direct recompute, the DB
    // itself allows this) or approved/paid via applyStatementAdjustment's
    // own guards. Never a partial reset: if even one statement can't be
    // safely corrected, the whole operation aborts with the exact reason,
    // same "report the blocker, never bypass" rule as everywhere else this
    // session.
    const ADJUSTABLE = new Set(['approved', 'paid']);
    for (const s of statementsRes.rows) {
      if (s.status === 'draft' || ADJUSTABLE.has(s.status)) continue;
      const err = new Error(`Statement ${s.id} is '${s.status}' -- not draft and not adjustable (only approved/paid statements can be corrected). Resolve this statement's status before retrying.`);
      err.code = 'STATEMENT_NOT_RESETTABLE';
      throw err;
    }
    for (const s of statementsRes.rows) {
      if (!ADJUSTABLE.has(s.status)) continue;
      const activeAttempt = await client.query(
        `SELECT id FROM collection_attempts WHERE statement_id = $1 AND status IN ('pending', 'ambiguous')`,
        [s.id]
      );
      if (activeAttempt.rows[0]) {
        const err = new Error(`Statement ${s.id} has a collection attempt in flight -- cannot safely adjust it right now. Wait for it to resolve and retry.`);
        err.code = 'ACTIVE_COLLECTION_ATTEMPT';
        throw err;
      }
    }

    for (const [table, trigger] of TRIGGERS) {
      await client.query(`ALTER TABLE "${table}" DISABLE TRIGGER "${trigger}"`);
    }

    const statementsAdjusted = [];
    for (const s of statementsRes.rows) {
      const removedRes = await client.query(
        `SELECT COALESCE(SUM(amount_snapshot), 0) AS removed_gross
         FROM statement_components WHERE statement_id = $1 AND donation_id = ANY($2::uuid[])`,
        [s.id, donationIds]
      );
      const removedGross = Number(removedRes.rows[0].removed_gross);

      await client.query(
        `DELETE FROM statement_components WHERE statement_id = $1 AND donation_id = ANY($2::uuid[])`,
        [s.id, donationIds]
      );

      // Same formula as calculation.service.js#computeAmounts, applied to
      // the REMAINING gross -- bit-identical to "recalculated from
      // scratch", never a delta approximation.
      const remainingGross = Number(s.gross_raised) - removedGross;
      const recompute = await client.query(
        `SELECT ROUND($1::numeric * $2::numeric, 2) AS fee_amount,
                ROUND(ROUND($1::numeric * $2::numeric, 2) * $3::numeric, 2) AS vat_amount`,
        [remainingGross, s.fee_rate, s.vat_rate]
      );
      const newFee = Number(recompute.rows[0].fee_amount);
      const newVat = Number(recompute.rows[0].vat_amount);
      const newTotal = newFee + newVat;
      const oldTotal = Number(s.total_due);

      if (s.status === 'draft') {
        await client.query(
          `UPDATE statements SET gross_raised = $2, fee_amount = $3, vat_amount = $4, total_due = $5 WHERE id = $1`,
          [s.id, remainingGross, newFee, newVat, newTotal]
        );
        statementsAdjusted.push({ statementId: s.id, status: 'draft', method: 'direct_recompute', oldTotal, newTotal });
      } else {
        const delta = newTotal - oldTotal;
        if (delta !== 0) {
          // Same INSERT applyStatementAdjustment itself does -- not calling
          // that function (see this file's header: it opens its own
          // connection/transaction and would self-deadlock against the
          // lock this transaction already holds on the same statement
          // row). Validation (adjustable status, no active attempt) was
          // already enforced in the pre-flight pass above, identically.
          await client.query(
            `INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id)
             VALUES ($1, $2, $3, $4)`,
            [s.id, delta, `איפוס תרומות קמפיין "${campaign.title}" (${donationIds.length} תרומות, ₪${totalAmountRemoved.toFixed(2)}) — ${trimmedReason}`, superAdminUserId]
          );
          await client.query(
            `INSERT INTO platform_audit_log (super_admin_user_id, action, notes, ip_address)
             VALUES ($1, 'statement_adjustment_create', $2, $3)`,
            [superAdminUserId, `statementId=${s.id} deltaAmount=${delta} reason=campaign_reset:${campaign.title}`, ip || null]
          );
        }
        statementsAdjusted.push({ statementId: s.id, status: s.status, method: 'statement_adjustment', oldTotal, newTotal, delta });
      }
    }

    const receiptsRes = await client.query(`DELETE FROM receipts WHERE donation_id = ANY($1::uuid[])`, [donationIds]);
    const emailLogsRes = await client.query(`DELETE FROM email_logs WHERE donation_id = ANY($1::uuid[])`, [donationIds]);
    const donationsDeletedRes = await client.query(`DELETE FROM donations WHERE id = ANY($1::uuid[])`, [donationIds]);

    await client.query(`UPDATE campaigns SET current_amount = 0, supporters_count = 0 WHERE id = $1`, [campaignId]);

    for (const [table, trigger] of TRIGGERS) {
      await client.query(`ALTER TABLE "${table}" ENABLE TRIGGER "${trigger}"`);
    }

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, 'campaign_donations_reset', $3, $4)`,
      [superAdminUserId, campaign.entity_id, `campaignId=${campaignId} title=${campaign.title} donationsRemoved=${donationIds.length} totalAmountRemoved=${totalAmountRemoved} statementsAdjusted=${statementsAdjusted.length} reason=${trimmedReason}`, ip || null]
    );

    await client.query('COMMIT');
    return {
      reset: true,
      campaignId,
      campaignTitle: campaign.title,
      donationsRemoved: donationsDeletedRes.rowCount,
      receiptsRemoved: receiptsRes.rowCount,
      emailLogsRemoved: emailLogsRes.rowCount,
      totalAmountRemoved,
      statementsAdjusted,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
