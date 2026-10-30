// FIN-11 Stage 3 (2026-10) — Complementary MASAV collection proposals.
// docs/finance/FIN11_STAGE3_TECHNICAL_DESIGN.md has the full design.
//
// Deliberately SEPARATE from masav-collection.service.js's existing
// openMasavAttempt/listBlockedStatements/listActionableMasavStatements/
// generateExportExcel -- none of those are modified, none of their
// collection_attempts(collection_method='masav') rows are read or written
// here. That module serves the OLD binary routing model (masav instead of
// card, above the ₪3,540 threshold, driven by routing.js). This module is
// the NEW, parallel mechanism FIN-11 actually needs: MASAV as a
// COMPLEMENT to card on the SAME Statement, proposed from the real
// getStatementBalance() outstanding -- never a fixed "total minus ₪3,000"
// assumption (rule A of this stage's brief). generateExportExcel's
// Excel-building logic (column layout, text-formatting fix) IS reused
// verbatim by exportMasavProposals below -- only the amount source and the
// eligibility/duplicate-prevention gating differ.
//
// Every write-function here follows the established lock order of this
// whole codebase: Statement row first (FOR UPDATE OF s), then any
// masav_collection_proposals row -- same order openAttempt/
// applyStatementAdjustment/foldLateDonationsIntoStatement/resolveAttempt
// all already use, so none of them can ever deadlock against this module.
// CORRECTED (2026-10, integration-gap review): the first version of
// approveMasavProposal/exportMasavProposals locked the proposal row FIRST
// (by proposalId, the caller's input) and the Statement second -- the
// REVERSE of prepareMasavProposal's own order, a genuine deadlock risk
// under real concurrency. Fixed: both now do a non-locking peek for
// statement_id, lock the Statement, THEN lock the proposal row -- Statement
// always first, with no exception, matching every other write path.
const pool = require('../../db/db');
const { getStatementBalance } = require('./statement-balance.service');
const { hasOpenCollectionHold } = require('./payment-exceptions.service');
const { ACTIONABLE_STATEMENT_STATUSES, ACTIVE_ATTEMPT_STATUSES } = require('../collection-engine/collection.service');
const { recordFinding } = require('../../jobs/reconciliation-findings');

// Same mandate check routing.js#resolveCollectionMethod already performs
// for the old masav routing decision -- mirrored here verbatim rather than
// imported, because routing.js's function decides CARD VS MASAV for the
// old binary model (and reads `statement.total_due` against the ₪3,540
// threshold as part of that decision, which is not relevant here at all).
// This is only the mandate-validity fragment of that logic, not the
// routing decision itself. bank_code/branch_code/account_number are
// NOT NULL at the DB level (confirmed: information_schema), so a row
// existing with any of those null is not actually possible -- checked
// defensively anyway, for exact parity with the existing code's own shape.
async function checkMasavMandate(entityId, client) {
  const res = await client.query(
    `SELECT authorized, bank_code, branch_code, account_number FROM entity_masav_details WHERE entity_id = $1`,
    [entityId]
  );
  const config = res.rows[0];
  if (!config) return { valid: false, reason: 'masav_not_configured' };
  if (!config.bank_code || !config.branch_code || !config.account_number) return { valid: false, reason: 'masav_incomplete' };
  if (!config.authorized) return { valid: false, reason: 'masav_not_authorized' };
  return { valid: true };
}

// Rule B: "unresolved" means ANY collection_attempts row still pending/
// ambiguous on this Statement, regardless of method -- the exact same
// ACTIVE_ATTEMPT_STATUSES check openAttempt/openMasavAttempt both already
// use as their mutual-exclusion gate. Reused verbatim (not re-derived)
// so this module can never define "unresolved" more narrowly than the
// rest of the system already does. A timeout/ambiguous outcome is NEVER
// treated as a confirmed failure -- it stays excluded until a human or
// the existing reconciliation job resolves it to a real terminal status.
async function findUnresolvedAttempt(statementId, client) {
  const res = await client.query(
    `SELECT id, collection_method, status FROM collection_attempts WHERE statement_id = $1 AND status = ANY($2::text[]) LIMIT 1`,
    [statementId, ACTIVE_ATTEMPT_STATUSES]
  );
  return res.rows[0] || null;
}

// Prepares (or refreshes) exactly one MASAV collection proposal for one
// Statement. Never writes a payment, never touches collection_attempts,
// never contacts any provider. Safe to call repeatedly (idempotent): if
// an active proposal already exists with the SAME amount, it is left
// alone; if the real balance changed, the old one is superseded and a
// fresh one is prepared in the same transaction.
async function prepareMasavProposal(statementId, transactionClient = null) {
  const client = transactionClient || await pool.connect();
  try {
    if (!transactionClient) await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT s.id, s.status, ba.entity_id
       FROM statements s
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [statementId]
    );
    const statement = stmtRes.rows[0];
    if (!statement) {
      const err = new Error('Statement not found');
      err.code = 'STATEMENT_NOT_FOUND';
      throw err;
    }

    if (!ACTIONABLE_STATEMENT_STATUSES.includes(statement.status)) {
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: false, reason: 'not_actionable', status: statement.status };
    }

    // An exported instruction is unresolved exposure, not permission to prepare a second file.
    // Reuse the existing guard under the same Statement lock used by approval/export.
    const exported = await hasExportedMasavProposal(statementId, client);
    if (exported.exists) {
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: false, reason: 'awaiting_masav_results', proposalId: exported.proposalId };
    }

    // Rule D: respect an open Stage 2B overpayment hold -- entity-wide,
    // same function openAttempt/getFin11CappedCardProposal already call.
    const hold = await hasOpenCollectionHold(statement.entity_id, client);
    if (hold.held) {
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: false, reason: 'collection_held', exceptionId: hold.exceptionId };
    }

    // Rule B: a pending/ambiguous attempt (card OR masav, any method) is
    // unresolved financial exposure -- never include its amount, and
    // raise a visible, investigable exception rather than silently
    // skipping (section 4.4 of the brief: "clear exception reasons").
    const unresolved = await findUnresolvedAttempt(statementId, client);
    if (unresolved) {
      await recordFinding(client, {
        jobName: 'masav-proposal-prepare',
        findingType: 'unresolved_collection_attempt',
        severity: 'warning',
        subjectType: 'statement',
        subjectId: statementId,
        details: { entityId: statement.entity_id, attemptId: unresolved.id, attemptMethod: unresolved.collection_method, attemptStatus: unresolved.status },
      });
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: false, reason: 'unresolved_collection_attempt', attemptId: unresolved.id };
    }

    // Rule E: a missing/incomplete/unauthorized mandate must surface as
    // an actionable exception, not disappear silently.
    const mandate = await checkMasavMandate(statement.entity_id, client);
    if (!mandate.valid) {
      await recordFinding(client, {
        jobName: 'masav-proposal-prepare',
        findingType: 'missing_masav_mandate',
        severity: 'warning',
        subjectType: 'statement',
        subjectId: statementId,
        details: { entityId: statement.entity_id, reason: mandate.reason },
      });
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: false, reason: mandate.reason };
    }

    // Rule A: the real, current outstanding balance -- includes every
    // payment already collected (by ANY method, including a prior capped
    // card collection), every legitimate statement_adjustment (including
    // Stage 1 late-donation folds), never a fixed "total minus ₪3,000"
    // assumption.
    const balance = await getStatementBalance(statementId, client);
    if (balance.outstanding <= 0) {
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: false, reason: 'no_outstanding_balance', outstanding: balance.outstanding };
    }
    const proposedAmount = Math.round(balance.outstanding * 100) / 100;

    const activeRes = await client.query(
      `SELECT id, proposed_amount, status FROM masav_collection_proposals WHERE statement_id = $1 AND status IN ('proposed','approved') FOR UPDATE`,
      [statementId]
    );
    const active = activeRes.rows[0];

    if (active && Number(active.proposed_amount) === proposedAmount) {
      // Idempotent re-run, nothing changed -- return the existing proposal.
      if (!transactionClient) await client.query('COMMIT');
      return { proposed: true, proposalId: active.id, proposedAmount, status: active.status, refreshed: false };
    }

    if (active) {
      // Balance moved since the last proposal (or eligibility changed) --
      // never silently overwrite a stored amount. Supersede, keep full
      // history, prepare a fresh one.
      await client.query(
        `UPDATE masav_collection_proposals SET status = 'superseded', status_reason = $2 WHERE id = $1`,
        [active.id, `superseded: outstanding changed from ${active.proposed_amount} to ${proposedAmount}, or re-prepared`]
      );
    }

    const insertRes = await client.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal)
       VALUES ($1, $2, $3, $3) RETURNING id`,
      [statementId, statement.entity_id, proposedAmount]
    );


    await client.query(`INSERT INTO masav_retry_proposals(proposal_id,original_instruction_id,statement_id)
      SELECT $1,r.instruction_id,$2 FROM masav_retry_requests r
      JOIN masav_export_components c ON c.instruction_id=r.instruction_id AND c.statement_id=$2
      ORDER BY r.created_at DESC,r.instruction_id LIMIT 1 ON CONFLICT DO NOTHING`,[insertRes.rows[0].id,statementId]);
    if (!transactionClient) await client.query('COMMIT');
    return { proposed: true, proposalId: insertRes.rows[0].id, proposedAmount, status: 'proposed', refreshed: Boolean(active) };
  } catch (err) {
    if (!transactionClient) await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    if (!transactionClient) client.release();
  }
}

// Bulk wrapper, sequential (same reasoning as masav-collection.service.js
// #ensureAttemptsForExport: each call's own Statement-row lock is acquired
// and released one at a time; a handful of Statements per monthly cycle
// makes this negligible).
async function prepareMasavProposalsForStatements(statementIds) {
  const results = [];
  for (const statementId of statementIds) {
    const result = await prepareMasavProposal(statementId);
    results.push({ statementId, ...result });
  }
  return results;
}

// Read-only preview for the Super Admin workflow (section 4.1/4.2 of the
// brief) -- per-entity balance/eligibility is already captured on the
// proposal row itself (outstanding_at_proposal) plus a live join for
// current display context.
async function listMasavProposals({ status } = {}) {
  const where = status ? `WHERE mp.status = $1` : '';
  const params = status ? [status] : [];
  const { rows } = await pool.query(
    `SELECT mp.id, mp.statement_id, mp.entity_id, mp.proposed_amount, mp.outstanding_at_proposal,
            mp.status, mp.status_reason, mp.created_at, mp.approved_at, mp.exported_at,
            e.display_name AS entity_name, s.total_due, s.status AS statement_status,
            bp.period_start, bp.period_end, ec.instruction_id, ei.batch_id, eb.consolidation_mode AS export_mode
     FROM masav_collection_proposals mp
     JOIN entities e ON e.id = mp.entity_id
     JOIN statements s ON s.id = mp.statement_id
     JOIN billing_periods bp ON bp.id = s.billing_period_id
     LEFT JOIN masav_export_components ec ON ec.proposal_id=mp.id
     LEFT JOIN masav_export_instructions ei ON ei.id=ec.instruction_id
     LEFT JOIN masav_export_batches eb ON eb.id=ei.batch_id
     ${where}
     ORDER BY mp.created_at DESC`,
    params
  );
  return rows;
}

// Explicit Super Admin approval (rule C / section 4.5). RE-VERIFIES
// freshness at the moment of approval -- never approves a stale number.
// If anything changed since prepare, this proposal is superseded instead
// of approved, and the caller is told to re-prepare.
async function approveMasavProposal({ proposalId, superAdminUserId, reason }) {
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

    // Lock order fix (2026-10, integration-gap review): the Statement must
    // ALWAYS be locked first, same as prepareMasavProposal and every other
    // write function in this codebase (openAttempt, applyStatementAdjustment,
    // foldLateDonationsIntoStatement, resolveAttempt). The original version
    // of this function locked the proposal row FIRST (by proposalId, since
    // that's the caller's input) and the Statement second -- a REAL
    // deadlock risk against prepareMasavProposal, which locks the Statement
    // first and then (when refreshing an existing active proposal) the
    // proposal row second. Fixed by a non-locking peek for statement_id,
    // THEN locking the Statement, THEN locking the proposal row itself.
    const peekRes = await client.query(`SELECT statement_id FROM masav_collection_proposals WHERE id = $1`, [proposalId]);
    if (!peekRes.rows[0]) { const err = new Error('Proposal not found'); err.code = 'PROPOSAL_NOT_FOUND'; throw err; }

    const stmtRes = await client.query(`SELECT s.id, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id = s.billing_account_id WHERE s.id = $1 FOR UPDATE OF s`, [peekRes.rows[0].statement_id]);
    const statement = stmtRes.rows[0];

    const propRes = await client.query(`SELECT * FROM masav_collection_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
    const proposal = propRes.rows[0];
    if (!proposal) { const err = new Error('Proposal not found'); err.code = 'PROPOSAL_NOT_FOUND'; throw err; }
    if (proposal.status !== 'proposed') { const err = new Error(`Proposal is ${proposal.status}, not proposed`); err.code = 'PROPOSAL_NOT_PROPOSED'; throw err; }

    const hold = await hasOpenCollectionHold(statement.entity_id, client);
    const unresolved = await findUnresolvedAttempt(proposal.statement_id, client);
    const mandate = await checkMasavMandate(statement.entity_id, client);
    const balance = await getStatementBalance(proposal.statement_id, client);
    const currentOutstanding = Math.round(balance.outstanding * 100) / 100;

    const exported = await hasExportedMasavProposal(proposal.statement_id, client);
    const staleReason = exported.exists ? 'awaiting_masav_results' : hold.held ? 'collection_held'
      : unresolved ? 'unresolved_collection_attempt'
      : !mandate.valid ? mandate.reason
      : currentOutstanding !== Number(proposal.proposed_amount) ? 'outstanding_changed'
      : null;

    if (staleReason) {
      await client.query(`UPDATE masav_collection_proposals SET status = 'superseded', status_reason = $2 WHERE id = $1`, [proposalId, `approval blocked: ${staleReason}`]);
      await client.query('COMMIT');
      return { approved: false, reason: staleReason, proposalId, needsRePrepare: true };
    }

    await client.query(
      `UPDATE masav_collection_proposals SET status = 'approved', approved_at = NOW(), approved_by_user_id = $2 WHERE id = $1`,
      [proposalId, superAdminUserId]
    );
    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes) VALUES ($1, $2, 'masav_proposal_approved', $3)`,
      [superAdminUserId, statement.entity_id, `proposalId=${proposalId} amount=${proposal.proposed_amount} reason=${trimmedReason}`]
    );

    await client.query('COMMIT');
    return { approved: true, proposalId, proposedAmount: Number(proposal.proposed_amount) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Builds the export file for a batch of ALREADY-APPROVED proposals.
// Re-verifies each proposal is still 'approved' (locked) and flips it to
// 'exported' atomically with building the file -- a second export attempt
// on the same proposal fails at the status check (duplicate-export
// prevention structural, not just a UI convention). Reuses the exact
// column layout / text-formatting fix from masav-collection.service.js
// #generateExportExcel -- only the amount source (the approved proposal,
// never a fixed total/cap assumption) and the join (entity_masav_details
// for bank details, same as the existing function) are specific to this
// path.
async function exportMasavProposals(options) {
  return require('./masav-export.service').execute(options,{checkMasavMandate,findUnresolvedAttempt,hasExportedMasavProposal});
}
async function previewMasavExport(options={}) {
  return require('./masav-export.service').execute({...options,previewOnly:true},{checkMasavMandate,findUnresolvedAttempt,hasExportedMasavProposal});
}

// Integration-gap fix #1: the OLD, pre-FIN-11 masav-collection.service.js
// #openMasavAttempt has no awareness of this module's proposals at all --
// it could open a legacy masav collection_attempts row on a Statement that
// already has an active (proposed/approved/exported) FIN-11 proposal,
// risking two uncoordinated MASAV processes on the same debt. Called from
// openMasavAttempt (that module now requires this one) -- never the other
// direction, so no circular require.
async function hasActiveMasavProposal(statementId, client = pool) {
  const res = await client.query(
    `SELECT id, status FROM masav_collection_proposals WHERE statement_id = $1 AND status IN ('proposed','approved','exported') LIMIT 1`,
    [statementId]
  );
  return res.rows.length > 0 ? { exists: true, proposalId: res.rows[0].id, status: res.rows[0].status } : { exists: false };
}

// Shared exposure guard: exported instructions remain locked until their
// actual bank results are explicitly finalized AND a residual-only retry
// request commits atomically with its new proposals. A legacy export without
// journal metadata stays locked. Original exported rows are never rewritten.
async function hasExportedMasavProposal(statementId, client = pool) {
  const res = await client.query(
    `SELECT p.id FROM masav_collection_proposals p
 LEFT JOIN masav_export_components c ON c.proposal_id=p.id
 WHERE p.statement_id=$1 AND p.status='exported'
 AND NOT EXISTS(SELECT 1 FROM masav_instruction_finalizations f
   JOIN masav_retry_requests r ON r.instruction_id=f.instruction_id
   WHERE f.instruction_id=c.instruction_id AND f.outcome IN ('partial','failed')) LIMIT 1`,
    [statementId]
  );
  return res.rows.length > 0 ? { exists: true, proposalId: res.rows[0].id } : { exists: false };
}

module.exports = {
  prepareMasavProposal,
  prepareMasavProposalsForStatements,
  listMasavProposals,
  approveMasavProposal,
  exportMasavProposals,
  previewMasavExport,
  checkMasavMandate,
  findUnresolvedAttempt,
  hasActiveMasavProposal,
  hasExportedMasavProposal,
};
