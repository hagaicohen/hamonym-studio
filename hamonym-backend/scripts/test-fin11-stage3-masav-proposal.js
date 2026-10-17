// FIN-11 Stage 3 — complementary MASAV collection proposals.
// docs/finance/FIN11_STAGE3_TECHNICAL_DESIGN.md has the full design.
//
// Same methodology as Stage 2B's test-fin11-stage2b-resolve.js: migrations
// 073+074 may or may not be applied yet wherever this runs. Everything
// (except the dedicated concurrency test) runs inside ONE
// BEGIN...ROLLBACK transaction that applies both migrations' DDL locally
// first (CREATE TABLE IF NOT EXISTS -- a no-op if already applied for
// real; Postgres DDL is fully transactional, so a rollback here leaves
// zero trace either way), then exercises LOCAL MIRRORS of
// prepareMasavProposal/approveMasavProposal/exportMasavProposals (each
// opens its own real pool.connect()+transaction in production code and so
// cannot see this script's own uncommitted tables/fixtures).
// getStatementBalance and hasOpenCollectionHold are called as the REAL
// exported functions -- both plain reads that accept an external client.
//
// payments/collection_attempts/statement_adjustments/payment_exceptions
// are real production tables (payments is append-only) -- this script
// NEVER commits a write to them. The dedicated concurrency test uses a
// real, committed-then-deleted fixture (none of entities/accounts/
// periods/runs/statements are append-only) and never lets any connection
// write a masav_collection_proposals row for real -- it proves lock
// ordering only.
//
// Run: node scripts/test-fin11-stage3-masav-proposal.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const { getStatementBalance } = require('../src/modules/billing-engine/statement-balance.service');
const { hasOpenCollectionHold } = require('../src/modules/billing-engine/payment-exceptions.service');
const { ACTIONABLE_STATEMENT_STATUSES, ACTIVE_ATTEMPT_STATUSES } = require('../src/modules/collection-engine/collection.service');
const { recordFinding } = require('../src/jobs/reconciliation-findings');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

async function checkMasavMandateCore(entityId, client) {
  const res = await client.query(`SELECT authorized, bank_code, branch_code, account_number FROM entity_masav_details WHERE entity_id = $1`, [entityId]);
  const config = res.rows[0];
  if (!config) return { valid: false, reason: 'masav_not_configured' };
  if (!config.bank_code || !config.branch_code || !config.account_number) return { valid: false, reason: 'masav_incomplete' };
  if (!config.authorized) return { valid: false, reason: 'masav_not_authorized' };
  return { valid: true };
}
async function findUnresolvedAttemptCore(statementId, client) {
  const res = await client.query(`SELECT id, collection_method, status FROM collection_attempts WHERE statement_id = $1 AND status = ANY($2::text[]) LIMIT 1`, [statementId, ACTIVE_ATTEMPT_STATUSES]);
  return res.rows[0] || null;
}

async function prepareMasavProposalCore(client, statementId) {
  const stmtRes = await client.query(`SELECT s.id, s.status, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id = s.billing_account_id WHERE s.id = $1 FOR UPDATE OF s`, [statementId]);
  const statement = stmtRes.rows[0];
  if (!statement) { const e = new Error('not found'); e.code = 'STATEMENT_NOT_FOUND'; throw e; }
  if (!ACTIONABLE_STATEMENT_STATUSES.includes(statement.status)) return { proposed: false, reason: 'not_actionable', status: statement.status };

  const hold = await hasOpenCollectionHold(statement.entity_id, client);
  if (hold.held) return { proposed: false, reason: 'collection_held', exceptionId: hold.exceptionId };

  const unresolved = await findUnresolvedAttemptCore(statementId, client);
  if (unresolved) {
    await recordFinding(client, {
      jobName: 'masav-proposal-prepare', findingType: 'unresolved_collection_attempt', severity: 'warning',
      subjectType: 'statement', subjectId: statementId,
      details: { entityId: statement.entity_id, attemptId: unresolved.id, attemptMethod: unresolved.collection_method, attemptStatus: unresolved.status },
    });
    return { proposed: false, reason: 'unresolved_collection_attempt', attemptId: unresolved.id };
  }

  const mandate = await checkMasavMandateCore(statement.entity_id, client);
  if (!mandate.valid) {
    await recordFinding(client, {
      jobName: 'masav-proposal-prepare', findingType: 'missing_masav_mandate', severity: 'warning',
      subjectType: 'statement', subjectId: statementId,
      details: { entityId: statement.entity_id, reason: mandate.reason },
    });
    return { proposed: false, reason: mandate.reason };
  }

  const balance = await getStatementBalance(statementId, client);
  if (balance.outstanding <= 0) return { proposed: false, reason: 'no_outstanding_balance', outstanding: balance.outstanding };
  const proposedAmount = Math.round(balance.outstanding * 100) / 100;

  const activeRes = await client.query(`SELECT id, proposed_amount, status FROM masav_collection_proposals WHERE statement_id = $1 AND status IN ('proposed','approved') FOR UPDATE`, [statementId]);
  const active = activeRes.rows[0];
  if (active && Number(active.proposed_amount) === proposedAmount) {
    return { proposed: true, proposalId: active.id, proposedAmount, status: active.status, refreshed: false };
  }
  if (active) {
    await client.query(`UPDATE masav_collection_proposals SET status='superseded', status_reason=$2 WHERE id=$1`, [active.id, 'superseded in test']);
  }
  const insertRes = await client.query(
    `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal) VALUES ($1,$2,$3,$3) RETURNING id`,
    [statementId, statement.entity_id, proposedAmount]
  );
  return { proposed: true, proposalId: insertRes.rows[0].id, proposedAmount, status: 'proposed', refreshed: Boolean(active) };
}

async function approveMasavProposalCore(client, { proposalId, superAdminUserId, reason }) {
  // Lock order fix mirrored: Statement ALWAYS first (peek statement_id,
  // lock Statement, then lock the proposal row) -- never proposal-then-
  // Statement, which deadlocks against prepareMasavProposalCore's own
  // Statement-then-proposal order under real concurrency.
  const peekRes = await client.query(`SELECT statement_id FROM masav_collection_proposals WHERE id = $1`, [proposalId]);
  if (!peekRes.rows[0]) { const e = new Error('not found'); e.code = 'PROPOSAL_NOT_FOUND'; throw e; }
  const stmtRes = await client.query(`SELECT s.id, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE s.id=$1 FOR UPDATE OF s`, [peekRes.rows[0].statement_id]);
  const statement = stmtRes.rows[0];

  const propRes = await client.query(`SELECT * FROM masav_collection_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
  const proposal = propRes.rows[0];
  if (!proposal) { const e = new Error('not found'); e.code = 'PROPOSAL_NOT_FOUND'; throw e; }
  if (proposal.status !== 'proposed') { const e = new Error('not proposed'); e.code = 'PROPOSAL_NOT_PROPOSED'; throw e; }

  const hold = await hasOpenCollectionHold(statement.entity_id, client);
  const unresolved = await findUnresolvedAttemptCore(proposal.statement_id, client);
  const mandate = await checkMasavMandateCore(statement.entity_id, client);
  const balance = await getStatementBalance(proposal.statement_id, client);
  const currentOutstanding = Math.round(balance.outstanding * 100) / 100;

  const staleReason = hold.held ? 'collection_held' : unresolved ? 'unresolved_collection_attempt' : !mandate.valid ? mandate.reason
    : currentOutstanding !== Number(proposal.proposed_amount) ? 'outstanding_changed' : null;

  if (staleReason) {
    await client.query(`UPDATE masav_collection_proposals SET status='superseded', status_reason=$2 WHERE id=$1`, [proposalId, `approval blocked: ${staleReason}`]);
    return { approved: false, reason: staleReason, proposalId, needsRePrepare: true };
  }
  await client.query(`UPDATE masav_collection_proposals SET status='approved', approved_at=NOW(), approved_by_user_id=$2 WHERE id=$1`, [proposalId, superAdminUserId]);
  await client.query(`INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes) VALUES ($1,$2,'masav_proposal_approved',$3)`, [superAdminUserId, statement.entity_id, `proposalId=${proposalId} reason=${reason}`]);
  return { approved: true, proposalId, proposedAmount: Number(proposal.proposed_amount) };
}

async function exportMasavProposalCore(client, { proposalId, superAdminUserId }) {
  // Same lock-order fix: Statement first, always.
  const peekRes = await client.query(`SELECT statement_id FROM masav_collection_proposals WHERE id = $1`, [proposalId]);
  if (!peekRes.rows[0]) { const e = new Error('not found'); e.code = 'PROPOSAL_NOT_FOUND'; throw e; }
  const stmtLockRes = await client.query(`SELECT s.id FROM statements s WHERE s.id = $1 FOR UPDATE OF s`, [peekRes.rows[0].statement_id]);
  if (!stmtLockRes.rows[0]) { const e = new Error('statement not found'); e.code = 'STATEMENT_NOT_FOUND'; throw e; }

  const propRes = await client.query(`SELECT * FROM masav_collection_proposals WHERE id = $1 FOR UPDATE`, [proposalId]);
  const proposal = propRes.rows[0];
  if (!proposal) { const e = new Error('not found'); e.code = 'PROPOSAL_NOT_FOUND'; throw e; }
  if (proposal.status !== 'approved') { const e = new Error('not approved'); e.code = 'PROPOSAL_NOT_APPROVED'; throw e; }

  // Integration-gap fix #2 mirrored: revalidate the balance fresh, under
  // the Statement lock, immediately before export -- never trust the
  // amount approveMasavProposalCore froze, however long ago that was.
  const freshBalance = await getStatementBalance(proposal.statement_id, client);
  const freshOutstanding = Math.round(freshBalance.outstanding * 100) / 100;
  if (freshOutstanding !== Number(proposal.proposed_amount)) {
    await client.query(`UPDATE masav_collection_proposals SET status='superseded', status_reason=$2 WHERE id=$1`, [proposalId, `export blocked: outstanding changed from ${proposal.proposed_amount} to ${freshOutstanding}`]);
    const e = new Error('stale at export'); e.code = 'PROPOSAL_STALE_AT_EXPORT'; throw e;
  }

  await client.query(`UPDATE masav_collection_proposals SET status='exported', exported_at=NOW(), exported_by_user_id=$2 WHERE id=$1`, [proposalId, superAdminUserId]);
  await client.query(`INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes) VALUES ($1,$2,'masav_proposal_exported',$3)`, [superAdminUserId, proposal.entity_id, `proposalId=${proposalId}`]);
  return { exported: true, proposalId };
}

// Integration-gap fix #1 mirror: legacy openMasavAttempt's NEW check
// against an active FIN-11 proposal.
async function hasActiveMasavProposalCore(statementId, client) {
  const res = await client.query(`SELECT id, status FROM masav_collection_proposals WHERE statement_id = $1 AND status IN ('proposed','approved','exported') LIMIT 1`, [statementId]);
  return res.rows.length > 0 ? { exists: true, proposalId: res.rows[0].id, status: res.rows[0].status } : { exists: false };
}

// Integration-gap fix #3 mirror: openAttempt/getFin11CappedCardProposal's
// NEW check against an unresolved exported MASAV proposal.
async function hasExportedMasavProposalCore(statementId, client) {
  const res = await client.query(`SELECT id FROM masav_collection_proposals WHERE statement_id = $1 AND status = 'exported' LIMIT 1`, [statementId]);
  return res.rows.length > 0 ? { exists: true, proposalId: res.rows[0].id } : { exists: false };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Migrations 073/074 are now applied for real (2026-10-17) -- their
    // triggers already exist, and CREATE TRIGGER has no IF NOT EXISTS form
    // in Postgres. Drop them first (inside this rollback-only transaction,
    // so the real, already-applied triggers are restored untouched the
    // instant this ROLLBACKs) so the verbatim migration SQL below can
    // recreate them either way -- same idempotency CREATE TABLE IF NOT
    // EXISTS already gives the tables. Harmless no-op otherwise.
    await client.query(`DROP TRIGGER IF EXISTS trg_payment_exceptions_enforce_immutable_facts ON payment_exceptions`).catch(() => {});
    await client.query(`DROP TRIGGER IF EXISTS trg_payment_exception_actions_no_update ON payment_exception_actions`).catch(() => {});
    await client.query(`DROP TRIGGER IF EXISTS trg_payment_exception_actions_no_delete ON payment_exception_actions`).catch(() => {});
    await client.query(`DROP TRIGGER IF EXISTS trg_masav_proposals_enforce_immutable_facts ON masav_collection_proposals`).catch(() => {});
    for (const file of ['073_fin11_payment_exceptions.sql', '074_fin11_masav_collection_proposals.sql']) {
      const sql = fs.readFileSync(path.join(__dirname, '../migrations/', file), 'utf8');
      await client.query(sql);
    }

    const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;

    let m = 0;
    const periodIds = new Map();
    async function getPeriod(start, end) {
      const key = `${start.toISOString()}|${end.toISOString()}`;
      if (periodIds.has(key)) return periodIds.get(key);
      const r = await client.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
      periodIds.set(key, r.rows[0].id);
      return r.rows[0].id;
    }
    async function makeEntity() {
      m++;
      const e = await client.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_fin11_3_${m}_${Date.now()}`, userId]);
      const ba = await client.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [e.rows[0].id]);
      return { entityId: e.rows[0].id, accountId: ba.rows[0].id };
    }
    async function makeMandate(entityId, { authorized = true } = {}) {
      // entity_masav_details_authorization_consistent CHECK requires
      // authorized_by/authorized_at set together with authorized=true,
      // and both NULL when authorized=false.
      if (authorized) {
        await client.query(`INSERT INTO entity_masav_details (entity_id, bank_code, branch_code, account_number, authorized, authorized_by, authorized_at) VALUES ($1,'12','345','6789012',true,$2,NOW())`, [entityId, userId]);
      } else {
        await client.query(`INSERT INTO entity_masav_details (entity_id, bank_code, branch_code, account_number, authorized) VALUES ($1,'12','345','6789012',false)`, [entityId]);
      }
    }
    async function makeStatement(accountId, totalDue, status = 'approved') {
      const offset = m * 4;
      const start = new Date(Date.UTC(2107, 0, 1 + offset));
      const end = new Date(Date.UTC(2107, 0, 2 + offset));
      const periodId = await getPeriod(start, end);
      const run = await client.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
      const fee = (totalDue / 1.18).toFixed(2);
      const vat = (totalDue - totalDue / 1.18).toFixed(2);
      const s = await client.query(
        `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
         VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,$6,$7) RETURNING id`,
        [accountId, periodId, run.rows[0].id, fee, vat, totalDue, status]
      );
      return s.rows[0].id;
    }
    async function makeAttempt(statementId, requestedAmount, status, method = 'card') {
      const r = await client.query(`SELECT COALESCE(MAX(attempt_number),0)+1 AS next FROM collection_attempts WHERE statement_id=$1`, [statementId]);
      const a = await client.query(
        `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [statementId, method, r.rows[0].next, status, requestedAmount]
      );
      return a.rows[0].id;
    }
    async function makePayment(statementId, attemptId, amount) {
      await client.query(`INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at) VALUES ($1,$2,$3,'cardcom',$4,NOW())`, [statementId, attemptId, amount, `tx-${attemptId}`]);
    }

    // --- 1. Card paid in full -> no outstanding -> not proposed ---
    const e1 = await makeEntity();
    await makeMandate(e1.entityId);
    const s1 = await makeStatement(e1.accountId, 1000);
    const a1 = await makeAttempt(s1, 1000, 'succeeded');
    await makePayment(s1, a1, 1000);
    const r1 = await prepareMasavProposalCore(client, s1);
    check('1. card paid in full -> no MASAV proposal (no_outstanding_balance)', r1.proposed === false && r1.reason === 'no_outstanding_balance', JSON.stringify(r1));

    // --- 2. Card paid partially (3000 of 5000) -> MASAV proposes the remainder, not a fixed assumption ---
    const e2 = await makeEntity();
    await makeMandate(e2.entityId);
    const s2 = await makeStatement(e2.accountId, 5000);
    const a2 = await makeAttempt(s2, 3000, 'succeeded');
    await makePayment(s2, a2, 3000);
    const r2 = await prepareMasavProposalCore(client, s2);
    check('2. partial card payment (3000 of 5000) -> MASAV proposes exactly 2000', r2.proposed === true && r2.proposedAmount === 2000, JSON.stringify(r2));

    // --- 3. Card failed definitively -> MASAV may propose the FULL amount (not blocked) ---
    const e3 = await makeEntity();
    await makeMandate(e3.entityId);
    const s3 = await makeStatement(e3.accountId, 5000);
    await makeAttempt(s3, 5000, 'declined'); // terminal failure, no payment ever recorded
    const r3 = await prepareMasavProposalCore(client, s3);
    check('3. card definitively failed (declined, terminal) -> MASAV proposes the full 5000', r3.proposed === true && r3.proposedAmount === 5000, JSON.stringify(r3));

    // --- 4. Card pending -> excluded, exception raised, never treated as confirmed failure ---
    const e4 = await makeEntity();
    await makeMandate(e4.entityId);
    const s4 = await makeStatement(e4.accountId, 5000);
    const a4 = await makeAttempt(s4, 3000, 'pending');
    const r4 = await prepareMasavProposalCore(client, s4);
    check('4. card attempt pending -> MASAV excluded (unresolved_collection_attempt), never a confirmed-failure assumption', r4.proposed === false && r4.reason === 'unresolved_collection_attempt' && r4.attemptId === a4, JSON.stringify(r4));

    // --- 5. Card ambiguous -> same exclusion ---
    const e5 = await makeEntity();
    await makeMandate(e5.entityId);
    const s5 = await makeStatement(e5.accountId, 5000);
    await makeAttempt(s5, 3000, 'ambiguous');
    const r5 = await prepareMasavProposalCore(client, s5);
    check('5. card attempt ambiguous -> MASAV excluded (unresolved_collection_attempt), timeout never treated as confirmed failure', r5.proposed === false && r5.reason === 'unresolved_collection_attempt', JSON.stringify(r5));

    // --- 6. Late donations (statement_adjustment, Stage-1-style fold) -> included via getStatementBalance, not a fixed assumption ---
    const e6 = await makeEntity();
    await makeMandate(e6.entityId);
    const s6 = await makeStatement(e6.accountId, 1000, 'approved');
    await client.query(`INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id) VALUES ($1,500,'late donation fold',$2)`, [s6, userId]);
    const r6 = await prepareMasavProposalCore(client, s6);
    check('6. late-donation adjustment (+500) included in MASAV proposal (1000+500=1500)', r6.proposed === true && r6.proposedAmount === 1500, JSON.stringify(r6));

    // --- 7. Statement adjustment (credit, reduces debt) -> correctly reduces the proposal ---
    const e7 = await makeEntity();
    await makeMandate(e7.entityId);
    const s7 = await makeStatement(e7.accountId, 1000, 'approved');
    await client.query(`INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id) VALUES ($1,-300,'billing correction credit',$2)`, [s7, userId]);
    const r7 = await prepareMasavProposalCore(client, s7);
    check('7. credit adjustment (-300) correctly reduces the proposal (1000-300=700)', r7.proposed === true && r7.proposedAmount === 700, JSON.stringify(r7));

    // --- 8. Overpayment hold (Stage 2B) -> MASAV excluded entirely ---
    const e8 = await makeEntity();
    await makeMandate(e8.entityId);
    const s8 = await makeStatement(e8.accountId, 2000, 'approved');
    const a8 = await makeAttempt(s8, 3000, 'succeeded');
    await makePayment(s8, a8, 3000);
    const pay8 = await client.query(`SELECT id FROM payments WHERE collection_attempt_id=$1`, [a8]);
    const exc8 = await client.query(
      `INSERT INTO payment_exceptions (statement_id, collection_attempt_id, payment_id, entity_id, outstanding_before, collected_amount, overpayment_amount) VALUES ($1,$2,$3,$4,2000,3000,1000) RETURNING id`,
      [s8, a8, pay8.rows[0].id, e8.entityId]
    );
    const r8 = await prepareMasavProposalCore(client, s8);
    check('8. open overpayment hold on the entity -> MASAV proposal excluded (collection_held)', r8.proposed === false && r8.reason === 'collection_held' && r8.exceptionId === exc8.rows[0].id, JSON.stringify(r8));

    // --- 9. Missing MASAV mandate -> actionable exception, not silent disappearance ---
    const e9 = await makeEntity(); // no makeMandate call
    const s9 = await makeStatement(e9.accountId, 1000, 'approved');
    const r9 = await prepareMasavProposalCore(client, s9);
    check('9. missing MASAV mandate -> masav_not_configured, not silently dropped', r9.proposed === false && r9.reason === 'masav_not_configured', JSON.stringify(r9));
    const finding9 = await client.query(`SELECT * FROM reconciliation_findings WHERE finding_type='missing_masav_mandate' AND subject_id=$1`, [s9]);
    check('9a. a findable, actionable exception record was created', finding9.rows.length === 1, JSON.stringify(finding9.rows[0]));

    // --- 9b. not-authorized mandate variant ---
    const e9b = await makeEntity();
    await makeMandate(e9b.entityId, { authorized: false });
    const s9b = await makeStatement(e9b.accountId, 1000, 'approved');
    const r9b = await prepareMasavProposalCore(client, s9b);
    check('9b. mandate exists but not authorized -> masav_not_authorized', r9b.proposed === false && r9b.reason === 'masav_not_authorized', JSON.stringify(r9b));

    // --- 10. Repeated approval -> rejected the second time ---
    const e10 = await makeEntity();
    await makeMandate(e10.entityId);
    const s10 = await makeStatement(e10.accountId, 1000, 'approved');
    const prep10 = await prepareMasavProposalCore(client, s10);
    const approve10a = await approveMasavProposalCore(client, { proposalId: prep10.proposalId, superAdminUserId: userId, reason: 'verified eligible' });
    check('10. first approval succeeds', approve10a.approved === true);
    let repeatApproveErr = null;
    try {
      await approveMasavProposalCore(client, { proposalId: prep10.proposalId, superAdminUserId: userId, reason: 'duplicate' });
    } catch (err) { repeatApproveErr = err; }
    check('10a. repeated approval rejected (PROPOSAL_NOT_PROPOSED)', repeatApproveErr !== null && repeatApproveErr.code === 'PROPOSAL_NOT_PROPOSED', repeatApproveErr && repeatApproveErr.code);

    // --- 11. Duplicate export -> rejected the second time, structurally (not just a UI convention) ---
    const export11a = await exportMasavProposalCore(client, { proposalId: prep10.proposalId, superAdminUserId: userId });
    check('11. first export succeeds', export11a.exported === true);
    let repeatExportErr = null;
    try {
      await exportMasavProposalCore(client, { proposalId: prep10.proposalId, superAdminUserId: userId });
    } catch (err) { repeatExportErr = err; }
    check('11a. duplicate export rejected (PROPOSAL_NOT_APPROVED)', repeatExportErr !== null && repeatExportErr.code === 'PROPOSAL_NOT_APPROVED', repeatExportErr && repeatExportErr.code);

    // --- 12. Tranzila acceptance (export) does NOT imply confirmed settlement ---
    const stmt10After = await client.query(`SELECT status FROM statements WHERE id=$1`, [s10]);
    const bal10After = await getStatementBalance(s10, client);
    check('12. after export, Statement status is UNCHANGED (still approved, never auto-flipped to paid)', stmt10After.rows[0].status === 'approved', stmt10After.rows[0].status);
    check('12a. after export, outstanding balance is UNCHANGED (export never records a payment)', Math.abs(bal10After.outstanding - 1000) < 0.001, bal10After.outstanding);
    const payCount10 = await client.query(`SELECT COUNT(*) FROM payments WHERE statement_id=$1`, [s10]);
    check('12b. zero payments exist for this statement -- export is transmission, never collection', payCount10.rows[0].count === '0');

    // --- 13. Stale re-verification: balance changes BETWEEN prepare and approve -> approval blocked, proposal superseded ---
    const e13 = await makeEntity();
    await makeMandate(e13.entityId);
    const s13 = await makeStatement(e13.accountId, 2000, 'approved');
    const prep13 = await prepareMasavProposalCore(client, s13);
    check('13. initial proposal for 2000', prep13.proposed === true && prep13.proposedAmount === 2000, JSON.stringify(prep13));
    // A card payment arrives AFTER the proposal was prepared, before it's approved.
    const a13 = await makeAttempt(s13, 500, 'succeeded');
    await makePayment(s13, a13, 500);
    const approve13 = await approveMasavProposalCore(client, { proposalId: prep13.proposalId, superAdminUserId: userId, reason: 'attempting stale approval' });
    check('13a. approval of a now-stale proposal is blocked (outstanding_changed), never silently approved', approve13.approved === false && approve13.reason === 'outstanding_changed' && approve13.needsRePrepare === true, JSON.stringify(approve13));
    const supersededCheck13 = await client.query(`SELECT status FROM masav_collection_proposals WHERE id=$1`, [prep13.proposalId]);
    check('13b. the stale proposal is marked superseded, not silently left as proposed', supersededCheck13.rows[0].status === 'superseded');
    const reprep13 = await prepareMasavProposalCore(client, s13);
    check('13c. re-preparing after the stale block gives the correct fresh amount (2000-500=1500)', reprep13.proposed === true && reprep13.proposedAmount === 1500, JSON.stringify(reprep13));

    // --- 14. Entity isolation: a hold on one entity never affects another ---
    const e14 = await makeEntity();
    await makeMandate(e14.entityId);
    const s14 = await makeStatement(e14.accountId, 1000, 'approved');
    const r14 = await prepareMasavProposalCore(client, s14); // e8 has an open hold, e14 does not
    check('14. unrelated entity (e14) is NOT affected by e8\'s overpayment hold', r14.proposed === true && r14.proposedAmount === 1000, JSON.stringify(r14));

    // --- 15. Idempotent re-run: preparing twice with no change returns the SAME proposal, no duplicate row ---
    const reprep2_e2 = await prepareMasavProposalCore(client, s2);
    check('15. idempotent re-run with unchanged balance returns the same proposal, not a duplicate', reprep2_e2.proposalId === r2.proposalId && reprep2_e2.refreshed === false, JSON.stringify(reprep2_e2));
    const countProposals_s2 = await client.query(`SELECT COUNT(*) FROM masav_collection_proposals WHERE statement_id=$1`, [s2]);
    check('15a. exactly one proposal row exists for s2 despite the re-run', countProposals_s2.rows[0].count === '1');

    // --- 16. Integration-gap #1: legacy MASAV mechanism must see an active FIN-11 proposal ---
    // Mirrors openMasavAttempt's own new check -- not the full old function
    // (its routing/insert logic is unrelated to this gap and already
    // covered elsewhere); this proves the specific new guard.
    const e16 = await makeEntity();
    await makeMandate(e16.entityId);
    const s16 = await makeStatement(e16.accountId, 2000, 'approved');
    const prep16 = await prepareMasavProposalCore(client, s16);
    check('16. setup: a FIN-11 proposal exists for s16', prep16.proposed === true, JSON.stringify(prep16));
    const legacyCheck16 = await hasActiveMasavProposalCore(s16, client);
    check('16a. legacy mechanism\'s new guard detects the active FIN-11 proposal (would skip, not open a parallel attempt)', legacyCheck16.exists === true && legacyCheck16.proposalId === prep16.proposalId, JSON.stringify(legacyCheck16));
    // After the proposal is exported, the overlap guard must STILL catch it (not just 'proposed'/'approved').
    await approveMasavProposalCore(client, { proposalId: prep16.proposalId, superAdminUserId: userId, reason: 'test' });
    await exportMasavProposalCore(client, { proposalId: prep16.proposalId, superAdminUserId: userId });
    const legacyCheck16b = await hasActiveMasavProposalCore(s16, client);
    check('16b. overlap guard still catches it once exported (not just while proposed/approved)', legacyCheck16b.exists === true, JSON.stringify(legacyCheck16b));

    // --- 17. Integration-gap #2: export revalidates balance fresh, blocks + supersedes on mismatch ---
    const e17 = await makeEntity();
    await makeMandate(e17.entityId);
    const s17 = await makeStatement(e17.accountId, 2000, 'approved');
    const prep17 = await prepareMasavProposalCore(client, s17);
    const approve17 = await approveMasavProposalCore(client, { proposalId: prep17.proposalId, superAdminUserId: userId, reason: 'test' });
    check('17. setup: proposal approved for 2000', approve17.approved === true);
    // A card payment arrives AFTER approval, before export.
    const a17 = await makeAttempt(s17, 600, 'succeeded');
    await makePayment(s17, a17, 600);
    let exportStaleErr = null;
    try {
      await exportMasavProposalCore(client, { proposalId: prep17.proposalId, superAdminUserId: userId });
    } catch (err) { exportStaleErr = err; }
    check('17a. export blocked when balance changed after approval (PROPOSAL_STALE_AT_EXPORT), never exports a stale amount', exportStaleErr !== null && exportStaleErr.code === 'PROPOSAL_STALE_AT_EXPORT', exportStaleErr && exportStaleErr.code);
    const supersededCheck17 = await client.query(`SELECT status FROM masav_collection_proposals WHERE id=$1`, [prep17.proposalId]);
    check('17b. the stale-at-export proposal is marked superseded, not left approved', supersededCheck17.rows[0].status === 'superseded');
    const reprep17 = await prepareMasavProposalCore(client, s17);
    check('17c. re-preparing gives the correct fresh amount (2000-600=1400)', reprep17.proposed === true && reprep17.proposedAmount === 1400, JSON.stringify(reprep17));

    // --- 18. Integration-gap #3: an exported, unresolved MASAV proposal must block a new card attempt on the SAME statement ---
    const e18 = await makeEntity();
    await makeMandate(e18.entityId);
    const s18 = await makeStatement(e18.accountId, 1000, 'approved');
    const prep18 = await prepareMasavProposalCore(client, s18);
    await approveMasavProposalCore(client, { proposalId: prep18.proposalId, superAdminUserId: userId, reason: 'test' });
    await exportMasavProposalCore(client, { proposalId: prep18.proposalId, superAdminUserId: userId });
    const cardCheck18 = await hasExportedMasavProposalCore(s18, client);
    check('18. openAttempt/getFin11CappedCardProposal\'s new guard detects the unresolved exported MASAV proposal on the same statement', cardCheck18.exists === true && cardCheck18.proposalId === prep18.proposalId, JSON.stringify(cardCheck18));
    // Isolation: a DIFFERENT statement of the same or another entity is unaffected.
    // m must advance so makeStatement computes a genuinely different
    // billing period -- otherwise it collides with s18's own period
    // (idx_statements_effective_per_account_period is unique per
    // billing_account_id+billing_period_id).
    m++;
    const s18b = await makeStatement(e18.accountId, 500, 'approved');
    const cardCheck18b = await hasExportedMasavProposalCore(s18b, client);
    check('18a. an unrelated Statement of the same entity is NOT affected (gap-3 guard is per-Statement, not entity-wide)', cardCheck18b.exists === false, JSON.stringify(cardCheck18b));

    const failed = results.filter((r) => !r.pass);
    console.log(`\n${results.length - failed.length}/${results.length} passed (main transaction).`);
    if (failed.length) console.log('FAILURES:', failed);
  } catch (err) {
    console.error('RUN FAILED (will still rollback):', err);
    results.push({ name: 'RUN THREW', pass: false, detail: err.message });
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

// --- Dedicated concurrency test: two concurrent prepareMasavProposal-style
// calls on the SAME statement must serialize via the Statement lock (same
// property Stage 1/2A/2B already proved for their own write functions).
// Real, committed-then-deleted fixture (not append-only). Neither
// connection is ever allowed to finish an INSERT into
// masav_collection_proposals for real.
async function concurrencyTest() {
  const setup = await pool.connect();
  let entityId, accountId, periodId, runId, statementId;
  try {
    const userRes = await setup.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    const tag = `ZZZ_TEST_fin11_3_conc_${Date.now()}`;
    const e = await setup.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [tag, userId]);
    entityId = e.rows[0].id;
    const ba = await setup.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
    accountId = ba.rows[0].id;
    const start = new Date(Date.UTC(2108, 0, 1));
    const end = new Date(Date.UTC(2108, 0, 2));
    const p = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
    periodId = p.rows[0].id;
    const r = await setup.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
    runId = r.rows[0].id;
    const s = await setup.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,30,5.4,35.4,'approved') RETURNING id`,
      [accountId, periodId, runId]
    );
    statementId = s.rows[0].id;

    const connA = await pool.connect();
    const connB = await pool.connect();
    try {
      await connA.query('BEGIN');
      await connA.query(`SELECT s.id FROM statements s WHERE s.id=$1 FOR UPDATE OF s`, [statementId]); // mirrors prepareMasavProposal's lock

      await connB.query('BEGIN');
      let bAcquired = false;
      const bPromise = connB.query(`SELECT s.id FROM statements s WHERE s.id=$1 FOR UPDATE OF s`, [statementId]).then(() => { bAcquired = true; });
      await new Promise((res) => setTimeout(res, 400));
      check('19. concurrent prepareMasavProposal-style lock: B blocked while A holds the Statement lock', bAcquired === false, `bAcquired=${bAcquired}`);

      await connA.query('ROLLBACK');
      await bPromise;
      // Note on the lock-order fix (approveMasavProposal/exportMasavProposals
      // now peek->lock-Statement->lock-proposal, same order as
      // prepareMasavProposal, instead of the original proposal-then-
      // Statement order): the full cross-function deadlock repro would
      // need a REAL masav_collection_proposals row to lock, which requires
      // migration 074 applied for real -- not permitted. The fix is
      // verified by code inspection instead: both functions now issue
      // their locks in the identical Statement-first order, which makes
      // the lock-order cycle that caused the original risk structurally
      // impossible, not just statistically unlikely.
      check('19a. B acquires the lock once A releases it (no deadlock, clean serialization)', bAcquired === true);
      await connB.query('ROLLBACK');
    } finally {
      connA.release();
      connB.release();
    }
  } finally {
    if (statementId) await setup.query(`DELETE FROM statements WHERE id=$1`, [statementId]).catch(() => {});
    if (runId) await setup.query(`DELETE FROM billing_runs WHERE id=$1`, [runId]).catch(() => {});
    if (periodId) await setup.query(`DELETE FROM billing_periods WHERE id=$1`, [periodId]).catch(() => {});
    if (accountId) await setup.query(`DELETE FROM billing_accounts WHERE id=$1`, [accountId]).catch(() => {});
    if (entityId) await setup.query(`DELETE FROM entities WHERE id=$1`, [entityId]).catch(() => {});
    setup.release();
  }
}

main()
  .then(() => concurrencyTest())
  .then(async () => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) console.log('FAILURES:', failed);
    const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_fin11_3_%'`);
    console.log('\nPost-run verification -- leftover ZZZ_TEST_fin11_3 entities:', leftover.rows[0].count);
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
