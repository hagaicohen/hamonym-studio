// FIN-11 Production consolidation (2026-10) — safely unify legacy and
// FIN-11 collection entry points, without activating any job or changing
// financial architecture.
//
// Two concrete gaps this closes, both found while mapping the existing
// screens for the Super Admin "ניהול גבייה" redesign:
//
//   1. collection.service.js#openAttempt (the legacy manual "גבה"/"נסה
//      גבייה שוב" button on the Statement drawer) had no awareness of
//      FIN-11's business-approved card-retry policy (MAX_CARD_ATTEMPTS=3,
//      retry only after a CONFIRMED failure) -- a Super Admin could click
//      it past the cap FIN-11's own openFin11CappedCardAttempt enforces.
//      Fixed by moving those constants into collection.service.js (single
//      source of truth, fin11-card-collection.service.js now imports them)
//      and enforcing the same guard inside openAttempt itself, card method
//      only, a no-op on every Statement's first attempt.
//
//   2. masav-collection.service.js#generateExportExcel (the legacy MASAV
//      "הפקת קובץ ייצוא" button) only checked openMasavAttempt's guard at
//      attempt-open time -- but ensureAttemptsForExport and export are two
//      separate HTTP calls, leaving a window where a FIN-11 proposal could
//      become active in between. Fixed by re-checking hasActiveMasavProposal
//      immediately before building the file.
//
// Neither fix touches any read-only endpoint (statement/attempt history,
// listStatements, listMasavProposals, exception history all unchanged) --
// "preserve historical read-only access" per the brief.
//
// Methodology: real, committed-then-deleted fixtures (same convention as
// test-fin11-stage4-orchestration.js Part 1) -- collection_attempts rows
// with 'declined'/'technical_failure'/'succeeded' status are inserted
// DIRECTLY via SQL (never via resolveAttempt), so no `payments` row is
// ever created and cleanup is always complete (payments/collection_
// attempts success-paths are append-only in production).
//
// Run: node scripts/test-fin11-collection-consolidation.js
require('dotenv').config();
const pool = require('../src/db/db');
const { openAttempt, MAX_CARD_ATTEMPTS, CONFIRMED_FAILURE_STATUSES } = require('../src/modules/collection-engine/collection.service');
const { generateExportExcel } = require('../src/modules/collection-engine/masav-collection.service');
const XLSX = require('xlsx');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

const fakeResolveAdapter = () => ({ NOT_IMPLEMENTED: false });

async function main() {
  const setup = await pool.connect();
  let userId;
  let periodCounter = 0;
  const periodIds = [];
  const createdEntityIds = [];
  const createdAccountIds = [];
  const createdStatementIds = [];
  const createdRunIds = [];
  const createdBillingIds = [];

  async function makePeriod() {
    periodCounter++;
    const offset = periodCounter * 4;
    const start = new Date(Date.UTC(2212, 0, 1 + offset));
    const end = new Date(Date.UTC(2212, 0, 2 + offset));
    const r = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
    periodIds.push(r.rows[0].id);
    return r.rows[0].id;
  }
  async function makeEntity() {
    const e = await setup.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_collection_consolidation_${Date.now()}_${Math.random().toString(36).slice(2)}`, userId]);
    const ba = await setup.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [e.rows[0].id]);
    createdEntityIds.push(e.rows[0].id);
    createdAccountIds.push(ba.rows[0].id);
    return { entityId: e.rows[0].id, accountId: ba.rows[0].id };
  }
  async function makePaymentInstrument(entityId) {
    const b = await setup.query(
      `INSERT INTO entity_billing (entity_id, provider, token, last4, exp_month, exp_year, card_holder_name, is_default, status)
       VALUES ($1,'cardcom','tok-zzz-test','4242',12,2030,'ZZZ Test',true,'active') RETURNING id`,
      [entityId]
    );
    createdBillingIds.push(b.rows[0].id);
  }
  async function makeStatement(accountId, totalDue, status = 'approved') {
    const periodId = await makePeriod();
    const run = await setup.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
    createdRunIds.push(run.rows[0].id);
    const fee = (totalDue / 1.18).toFixed(2);
    const vat = (totalDue - totalDue / 1.18).toFixed(2);
    const s = await setup.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,$6,$7) RETURNING id`,
      [accountId, periodId, run.rows[0].id, fee, vat, totalDue, status]
    );
    createdStatementIds.push(s.rows[0].id);
    return s.rows[0].id;
  }
  async function insertCardAttempt(statementId, attemptNumber, status) {
    await setup.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount, status)
       VALUES ($1,'card',$2,1000,$3)`,
      [statementId, attemptNumber, status]
    );
  }

  try {
    const userRes = await setup.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    userId = userRes.rows[0].id;

    // --- 1. First card attempt on a Statement with no history -- guard is a no-op ---
    const e1 = await makeEntity();
    await makePaymentInstrument(e1.entityId);
    const s1 = await makeStatement(e1.accountId, 1000);
    const open1 = await openAttempt(s1, fakeResolveAdapter);
    check('1. first card attempt on a fresh Statement opens exactly as before the guard', open1.skipped === false && open1.attemptNumber === 1 && open1.method === 'card', JSON.stringify(open1));

    // --- 2. 2 prior confirmed-failure attempts, still under the cap -- retry allowed ---
    const e2 = await makeEntity();
    await makePaymentInstrument(e2.entityId);
    const s2 = await makeStatement(e2.accountId, 1000);
    await insertCardAttempt(s2, 1, 'declined');
    await insertCardAttempt(s2, 2, 'technical_failure');
    const open2 = await openAttempt(s2, fakeResolveAdapter);
    check('2. a 3rd attempt (still < MAX_CARD_ATTEMPTS) is allowed after 2 confirmed failures', open2.skipped === false && open2.attemptNumber === 3, JSON.stringify(open2));

    // --- 3. 3 prior confirmed-failure attempts -- legacy path now refuses the 4th, same as FIN-11's own cap ---
    const e3 = await makeEntity();
    await makePaymentInstrument(e3.entityId);
    const s3 = await makeStatement(e3.accountId, 1000);
    await insertCardAttempt(s3, 1, 'declined');
    await insertCardAttempt(s3, 2, 'declined');
    await insertCardAttempt(s3, 3, 'technical_failure');
    const open3 = await openAttempt(s3, fakeResolveAdapter);
    check('3. legacy openAttempt refuses a 4th card attempt once MAX_CARD_ATTEMPTS is reached', open3.skipped === true && open3.reason === 'max_attempts_reached' && open3.attemptsSoFar === 3, JSON.stringify(open3));
    const countAfter3 = await setup.query(`SELECT COUNT(*) FROM collection_attempts WHERE statement_id = $1`, [s3]);
    check('3a. no 4th row was inserted -- still exactly 3 attempts, history untouched', countAfter3.rows[0].count === '3', countAfter3.rows[0].count);
    const finding3 = await setup.query(`SELECT * FROM reconciliation_findings WHERE job_name = 'collection-router' AND finding_type = 'fin11_card_attempts_exhausted' AND subject_id = $1`, [s3]);
    check('3b. the SAME finding type FIN-11\'s own cap uses is recorded for the manual path too', finding3.rows.length === 1, JSON.stringify(finding3.rows[0]));

    // --- 4. latest attempt is NOT a confirmed failure (e.g. succeeded, but a balance remains) -- never auto-retry ---
    const e4 = await makeEntity();
    await makePaymentInstrument(e4.entityId);
    const s4 = await makeStatement(e4.accountId, 1000);
    await insertCardAttempt(s4, 1, 'succeeded'); // no `payments` row written -- outstanding stays the full total_due
    const open4 = await openAttempt(s4, fakeResolveAdapter);
    check('4. a latest attempt that is not a CONFIRMED failure (e.g. succeeded) blocks a new attempt even with balance remaining', open4.skipped === true && open4.reason === 'latest_attempt_not_a_confirmed_failure' && open4.latestStatus === 'succeeded', JSON.stringify(open4));

    // --- 5. legacy export of a Statement with an active FIN-11 MASAV proposal must fail closed ---
    const e5 = await makeEntity();
    await setup.query(
      `INSERT INTO entity_masav_details (entity_id, bank_code, branch_code, account_number, authorized, authorized_by, authorized_at)
       VALUES ($1,'12','345','6789012',true,$2,NOW())`,
      [e5.entityId, userId]
    );
    const s5 = await makeStatement(e5.accountId, 5000);
    const attempt5 = await setup.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount, provider, status)
       VALUES ($1,'masav',1,5000,'masav','pending') RETURNING id`,
      [s5]
    );
    const proposal5 = await setup.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status, approved_at, approved_by_user_id)
       VALUES ($1,$2,5000,5000,'approved',NOW(),$3) RETURNING id`,
      [s5, e5.entityId, userId]
    );
    let export5Err = null;
    try {
      await generateExportExcel([s5]);
    } catch (err) {
      export5Err = err;
    }
    check('5. legacy generateExportExcel refuses to export a Statement with an active FIN-11 proposal', export5Err?.code === 'FIN11_PROPOSAL_ACTIVE', export5Err?.code);
    await setup.query(`DELETE FROM masav_collection_proposals WHERE id = $1`, [proposal5.rows[0].id]);
    await setup.query(`DELETE FROM collection_attempts WHERE id = $1`, [attempt5.rows[0].id]);

    // --- 6. regression: the exact same Statement exports fine once no FIN-11 proposal is active ---
    const attempt6 = await setup.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount, provider, status)
       VALUES ($1,'masav',2,5000,'masav','pending') RETURNING id`,
      [s5]
    );
    const buffer6 = await generateExportExcel([s5]);
    const workbook6 = XLSX.read(buffer6, { type: 'buffer' });
    check('6. regression -- legacy export still succeeds normally once no FIN-11 proposal is active', Buffer.isBuffer(buffer6) && workbook6.SheetNames.includes('MASAV'), `length=${buffer6?.length}`);
    await setup.query(`DELETE FROM collection_attempts WHERE id = $1`, [attempt6.rows[0].id]);
  } finally {
    await setup.query(`DELETE FROM reconciliation_findings WHERE subject_id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM masav_collection_proposals WHERE statement_id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM collection_attempts WHERE statement_id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM statements WHERE id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM billing_runs WHERE id = ANY($1::uuid[])`, [createdRunIds]).catch(() => {});
    await setup.query(`DELETE FROM entity_billing WHERE id = ANY($1::uuid[])`, [createdBillingIds]).catch(() => {});
    await setup.query(`DELETE FROM entity_masav_details WHERE entity_id = ANY($1::uuid[])`, [createdEntityIds]).catch(() => {});
    await setup.query(`DELETE FROM billing_accounts WHERE id = ANY($1::uuid[])`, [createdAccountIds]).catch(() => {});
    await setup.query(`DELETE FROM entities WHERE id = ANY($1::uuid[])`, [createdEntityIds]).catch(() => {});
    for (const periodId of periodIds) {
      await setup.query(`DELETE FROM billing_periods WHERE id = $1`, [periodId]).catch(() => {});
    }
    setup.release();
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);

  const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_collection_consolidation%'`);
  console.log(`\nPost-run verification -- leftover ZZZ_TEST_collection_consolidation entities: ${leftover.rows[0].count}`);

  await pool.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
