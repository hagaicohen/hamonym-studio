// FIN-11 Stage 2B — resolveAttempt hardening + payment exceptions.
// docs/finance/FIN11_STAGE2B_TECHNICAL_DESIGN.md has the full design.
//
// Methodology: migration 073 (payment_exceptions/payment_exception_actions)
// may or may not be applied yet in whatever DB this runs against. Every
// test (except the dedicated concurrency test) runs inside ONE
// BEGIN...ROLLBACK transaction that applies migration 073's DDL locally
// first (`CREATE TABLE IF NOT EXISTS` -- a no-op if already applied for
// real elsewhere; Postgres DDL is fully transactional either way, so a
// rollback here leaves zero trace regardless), then creates fixtures, then
// exercises LOCAL MIRRORS of resolveAttempt / openAttempt's hold-check /
// overrideCollectionHold / resolvePaymentException -- all of which open
// their own real pool.connect()+transaction in production code and so
// cannot see this script's own uncommitted tables/fixtures.
// getStatementBalance and hasOpenCollectionHold are called as the REAL
// exported functions -- both plain reads that accept an external client
// and have no transaction of their own.
//
// payments/collection_attempts/statement_adjustments are real,
// already-append-only production tables -- this script NEVER commits a
// write to them. The one dedicated concurrency test uses a real,
// committed-then-deleted entity/account/period/run/statement fixture (none
// of those are append-only) and deliberately never lets either connection
// reach the 'succeeded' branch, so it never creates a payment either.
//
// Run: node scripts/test-fin11-stage2b-resolve.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const { getStatementBalance } = require('../src/modules/billing-engine/statement-balance.service');
const { hasOpenCollectionHold } = require('../src/modules/billing-engine/payment-exceptions.service');
const { recordFinding } = require('../src/jobs/reconciliation-findings');
const { ACTIVE_ATTEMPT_STATUSES } = require('../src/modules/collection-engine/collection.service');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

// --- Local mirror of the hardened resolveAttempt (identical logic) -------
async function resolveAttemptCore(client, attemptId, statementId, outcome) {
  const stmtRes = await client.query(
    `SELECT s.id, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id = s.billing_account_id WHERE s.id = $1 FOR UPDATE OF s`,
    [statementId]
  );
  const statement = stmtRes.rows[0];
  if (!statement) { const e = new Error('not found'); e.code = 'STATEMENT_NOT_FOUND'; throw e; }

  await client.query(
    `UPDATE collection_attempts SET status=$2, provider_reference=$3, provider_raw_status=$4, failure_reason=$5, resolved_at=NOW() WHERE id=$1`,
    [attemptId, outcome.outcome, outcome.providerReference || null, outcome.providerRawStatus || null, outcome.failureReason || null]
  );

  let statementStatus = null;
  let overpayment = null;
  if (outcome.outcome === 'succeeded') {
    const attemptRes = await client.query(`SELECT requested_amount, provider FROM collection_attempts WHERE id = $1`, [attemptId]);
    const attempt = attemptRes.rows[0];
    const collectedAmount = Number(attempt.requested_amount);

    const balanceBeforePayment = await getStatementBalance(statementId, client);
    const outstandingBeforePayment = balanceBeforePayment.outstanding;

    await client.query(
      `INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at) VALUES ($1,$2,$3,$4,$5,NOW())`,
      [statementId, attemptId, collectedAmount, attempt.provider, outcome.providerReference]
    );

    const overpaymentAmount = Math.max(0, collectedAmount - outstandingBeforePayment);
    if (overpaymentAmount > 0) {
      const paymentIdRes = await client.query(`SELECT id FROM payments WHERE collection_attempt_id = $1`, [attemptId]);
      const exceptionRes = await client.query(
        `INSERT INTO payment_exceptions (statement_id, collection_attempt_id, payment_id, entity_id, outstanding_before, collected_amount, overpayment_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [statementId, attemptId, paymentIdRes.rows[0].id, statement.entity_id, outstandingBeforePayment, collectedAmount, overpaymentAmount]
      );
      const exceptionId = exceptionRes.rows[0].id;
      await recordFinding(client, {
        jobName: 'collection-resolve', findingType: 'overpayment_detected', severity: 'critical',
        subjectType: 'statement', subjectId: statementId,
        details: { attemptId, exceptionId, entityId: statement.entity_id, collectedAmount, outstandingBeforePayment, overpaymentAmount },
      });
      overpayment = { exceptionId, overpaymentAmount, collectedAmount, outstandingBeforePayment };
    }

    const balanceAfterPayment = await getStatementBalance(statementId, client);
    if (balanceAfterPayment.collected >= balanceAfterPayment.adjustedTotal) {
      await client.query(`UPDATE statements SET status = 'paid' WHERE id = $1`, [statementId]);
      statementStatus = 'paid';
    }
  }
  return { attemptId, outcome: outcome.outcome, statementStatus, overpayment };
}

async function overrideCollectionHoldCore(client, { exceptionId, superAdminUserId, reason }) {
  const excRes = await client.query(`SELECT id, status FROM payment_exceptions WHERE id = $1 FOR UPDATE`, [exceptionId]);
  const exception = excRes.rows[0];
  if (!exception) { const e = new Error('not found'); e.code = 'EXCEPTION_NOT_FOUND'; throw e; }
  if (exception.status !== 'open') { const e = new Error('not open'); e.code = 'EXCEPTION_NOT_OPEN'; throw e; }
  await client.query(`UPDATE payment_exceptions SET hold_new_collection = false WHERE id = $1`, [exceptionId]);
  await client.query(`INSERT INTO payment_exception_actions (exception_id, action_type, super_admin_user_id, reason) VALUES ($1,'override_hold',$2,$3)`, [exceptionId, superAdminUserId, reason]);
  return { exceptionId, holdLifted: true };
}

async function resolvePaymentExceptionCore(client, { exceptionId, resolutionType, superAdminUserId, reason }) {
  const excRes = await client.query(`SELECT id, status FROM payment_exceptions WHERE id = $1 FOR UPDATE`, [exceptionId]);
  const exception = excRes.rows[0];
  if (!exception) { const e = new Error('not found'); e.code = 'EXCEPTION_NOT_FOUND'; throw e; }
  if (exception.status !== 'open') { const e = new Error('not open'); e.code = 'EXCEPTION_NOT_OPEN'; throw e; }
  await client.query(`UPDATE payment_exceptions SET status = 'resolved', hold_new_collection = false WHERE id = $1`, [exceptionId]);
  await client.query(`INSERT INTO payment_exception_actions (exception_id, action_type, super_admin_user_id, reason) VALUES ($1,$2,$3,$4)`, [exceptionId, resolutionType, superAdminUserId, reason]);
  return { exceptionId, status: 'resolved', resolutionType };
}

// Local mirror of openAttempt's NEW hold-check prefix only (the rest of
// openAttempt is unchanged and already covered by earlier test suites).
async function openAttemptHoldCheck(client, statementId) {
  const stmtRes = await client.query(`SELECT s.id, s.status, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE s.id=$1 FOR UPDATE OF s`, [statementId]);
  const statement = stmtRes.rows[0];
  const hold = await hasOpenCollectionHold(statement.entity_id, client);
  if (hold.held) return { skipped: true, reason: 'entity_collection_held', exceptionId: hold.exceptionId };
  return { skipped: false };
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Migration 073 is now applied for real (2026-10-17) -- these triggers
    // already exist there, and CREATE TRIGGER has no IF NOT EXISTS form in
    // Postgres. Drop them first (inside this rollback-only transaction, so
    // the real, already-applied trigger is restored untouched the instant
    // this ROLLBACKs) so the verbatim migration SQL below can recreate them
    // either way -- same idempotency CREATE TABLE IF NOT EXISTS already
    // gives the tables themselves. Harmless no-op if the table/trigger
    // doesn't exist yet (first-time run against a genuinely unmigrated DB).
    await client.query(`DROP TRIGGER IF EXISTS trg_payment_exceptions_enforce_immutable_facts ON payment_exceptions`).catch(() => {});
    await client.query(`DROP TRIGGER IF EXISTS trg_payment_exception_actions_no_update ON payment_exception_actions`).catch(() => {});
    await client.query(`DROP TRIGGER IF EXISTS trg_payment_exception_actions_no_delete ON payment_exception_actions`).catch(() => {});
    const migrationSql = fs.readFileSync(path.join(__dirname, '../migrations/073_fin11_payment_exceptions.sql'), 'utf8');
    await client.query(migrationSql);

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
      const e = await client.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_fin11_2b_${m}_${Date.now()}`, userId]);
      const ba = await client.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [e.rows[0].id]);
      return { entityId: e.rows[0].id, accountId: ba.rows[0].id };
    }
    async function makeStatement(accountId, totalDue, status = 'approved') {
      const offset = m * 4;
      const start = new Date(Date.UTC(2105, 0, 1 + offset));
      const end = new Date(Date.UTC(2105, 0, 2 + offset));
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
    async function makeAttempt(statementId, requestedAmount, status = 'pending') {
      const r = await client.query(`SELECT COALESCE(MAX(attempt_number),0)+1 AS next FROM collection_attempts WHERE statement_id=$1`, [statementId]);
      const a = await client.query(
        `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount) VALUES ($1,'card',$2,$3,$4) RETURNING id`,
        [statementId, r.rows[0].next, status, requestedAmount]
      );
      return a.rows[0].id;
    }

    // --- 1. Normal successful card collection, exact balance ---
    const e1 = await makeEntity();
    const s1 = await makeStatement(e1.accountId, 1000);
    const a1 = await makeAttempt(s1, 1000);
    const r1 = await resolveAttemptCore(client, a1, s1, { outcome: 'succeeded', providerReference: 'tx-2b-1' });
    check('1. exact-balance payment -> succeeded, statement flips to paid, no overpayment', r1.statementStatus === 'paid' && r1.overpayment === null, JSON.stringify(r1));

    // --- 2. Partial payment (card-cap scenario: 3000 of 5000) ---
    const e2 = await makeEntity();
    const s2 = await makeStatement(e2.accountId, 5000);
    const a2 = await makeAttempt(s2, 3000);
    const r2 = await resolveAttemptCore(client, a2, s2, { outcome: 'succeeded', providerReference: 'tx-2b-2' });
    const bal2 = await getStatementBalance(s2, client);
    check('2. partial payment -> statement stays open, no overpayment', r2.statementStatus === null && r2.overpayment === null, JSON.stringify(r2));
    check('2a. outstanding correctly reduced to 2000', Math.abs(bal2.outstanding - 2000) < 0.001, bal2.outstanding);

    // --- 3. Verified overpayment: a stale attempt resolves for 3000 while only 1000 was still outstanding ---
    const e3 = await makeEntity();
    const s3 = await makeStatement(e3.accountId, 3000);
    const aPrior3 = await makeAttempt(s3, 2000, 'succeeded');
    await client.query(`INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at) VALUES ($1,$2,2000,'cardcom','tx-3-prior',NOW())`, [s3, aPrior3]);
    const a3 = await makeAttempt(s3, 3000);
    const r3 = await resolveAttemptCore(client, a3, s3, { outcome: 'succeeded', providerReference: 'tx-2b-3' });
    check('3. verified overpayment detected: full 3000 recorded, not clamped', r3.overpayment !== null && r3.overpayment.overpaymentAmount === 2000 && r3.overpayment.collectedAmount === 3000, JSON.stringify(r3));
    const payments3 = await client.query(`SELECT SUM(amount) AS total FROM payments WHERE statement_id=$1`, [s3]);
    check('3a. full amount actually recorded (2000+3000=5000, never clamped to 1000)', Number(payments3.rows[0].total) === 5000, payments3.rows[0].total);
    const exc3 = await client.query(`SELECT * FROM payment_exceptions WHERE statement_id=$1`, [s3]);
    check('3b. exactly one payment_exceptions row, status=open, hold_new_collection=true', exc3.rows.length === 1 && exc3.rows[0].status === 'open' && exc3.rows[0].hold_new_collection === true, JSON.stringify(exc3.rows[0]));
    const adj3 = await client.query(`SELECT COUNT(*) FROM statement_adjustments WHERE statement_id=$1`, [s3]);
    check('3c. no statement_adjustment created to disguise the overpayment', adj3.rows[0].count === '0');
    const finding3 = await client.query(`SELECT * FROM reconciliation_findings WHERE finding_type='overpayment_detected' AND subject_id=$1`, [s3]);
    check('3d. Super Admin alert (reconciliation_findings) created, severity critical', finding3.rows.length === 1 && finding3.rows[0].severity === 'critical');
    const exceptionId3 = exc3.rows[0].id;

    // --- 4. requested_amount is the only verified "actual collected" source ---
    const e4 = await makeEntity();
    const s4 = await makeStatement(e4.accountId, 1500);
    const a4 = await makeAttempt(s4, 1500);
    const r4 = await resolveAttemptCore(client, a4, s4, { outcome: 'succeeded', providerReference: 'tx-2b-4', amount: 999999 });
    const pay4 = await client.query(`SELECT amount FROM payments WHERE collection_attempt_id=$1`, [a4]);
    check('4. a stray "amount" field on outcome is ignored -- only requested_amount is ever trusted (no invented provider amount)', Number(pay4.rows[0].amount) === 1500, pay4.rows[0].amount);

    // --- 5. duplicate resolution of the SAME attempt (realistic equivalent of a duplicate webhook) ---
    const e5 = await makeEntity();
    const s5 = await makeStatement(e5.accountId, 1000);
    const a5 = await makeAttempt(s5, 1000);
    await resolveAttemptCore(client, a5, s5, { outcome: 'succeeded', providerReference: 'tx-2b-5' });
    await client.query('SAVEPOINT sp_dup');
    let duplicateErr = null;
    try {
      await resolveAttemptCore(client, a5, s5, { outcome: 'succeeded', providerReference: 'tx-2b-5' });
    } catch (err) {
      duplicateErr = err;
      await client.query('ROLLBACK TO SAVEPOINT sp_dup');
    }
    check('5. duplicate resolution of the same attempt rejected at the DB level (UNIQUE collection_attempt_id), not double-recorded', duplicateErr !== null && duplicateErr.code === '23505', duplicateErr && duplicateErr.code);
    const payCount5 = await client.query(`SELECT COUNT(*) FROM payments WHERE collection_attempt_id=$1`, [a5]);
    check('5a. exactly one payment recorded for the attempt despite the duplicate resolution attempt', payCount5.rows[0].count === '1');

    // --- 6. Adjusted Statement balance: overpayment computed against adjustedTotal, including a legitimate adjustment ---
    const e6 = await makeEntity();
    const s6 = await makeStatement(e6.accountId, 1000, 'approved');
    await client.query(`INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id) VALUES ($1,500,'late donation fold',$2)`, [s6, userId]);
    // adjustedTotal = 1500; an attempt requesting exactly 1500 must NOT be flagged as overpayment.
    const a6 = await makeAttempt(s6, 1500);
    const r6 = await resolveAttemptCore(client, a6, s6, { outcome: 'succeeded', providerReference: 'tx-2b-6' });
    check('6. payment exactly matching adjustedTotal (1000+500) is NOT an overpayment', r6.overpayment === null && r6.statementStatus === 'paid', JSON.stringify(r6));

    // --- 7. pending/ambiguous attempts are treated as unresolved financial exposure (existing guard, re-verified here) ---
    const e7 = await makeEntity();
    const s7 = await makeStatement(e7.accountId, 1000, 'approved');
    await makeAttempt(s7, 1000, 'ambiguous');
    const activeCheck7 = await client.query(`SELECT id FROM collection_attempts WHERE statement_id=$1 AND status = ANY($2::text[])`, [s7, ACTIVE_ATTEMPT_STATUSES]);
    check('7. an ambiguous attempt is matched by ACTIVE_ATTEMPT_STATUSES (still counted as unresolved exposure, blocks a new attempt)', activeCheck7.rows.length === 1);

    // --- 8. Correct hold on NEW collection after overpayment -- entity-wide, including an unrelated Statement of the SAME entity ---
    const s3b = await makeStatement(e3.accountId, 500, 'approved'); // same entity as the overpayment in test 3
    const hold8 = await openAttemptHoldCheck(client, s3b);
    check('8. a DIFFERENT statement of the SAME (overpaid) entity is held from new collection', hold8.skipped === true && hold8.reason === 'entity_collection_held' && hold8.exceptionId === exceptionId3, JSON.stringify(hold8));

    // --- 9. Isolation: an unrelated entity is NOT affected by e3's hold ---
    const hold9 = await openAttemptHoldCheck(client, s1); // s1 belongs to e1, unrelated to e3's overpayment
    check('9. an unrelated entity/statement is NOT held', hold9.skipped === false, JSON.stringify(hold9));

    // --- 10. Explicit administrator override lifts the hold WITHOUT resolving the exception ---
    await overrideCollectionHoldCore(client, { exceptionId: exceptionId3, superAdminUserId: userId, reason: 'verified with CardCom, safe to resume while investigation continues' });
    const hold10 = await openAttemptHoldCheck(client, s3b);
    const exc10 = await client.query(`SELECT status, hold_new_collection FROM payment_exceptions WHERE id=$1`, [exceptionId3]);
    check('10. after override, new collection is no longer held', hold10.skipped === false, JSON.stringify(hold10));
    check('10a. the exception itself remains OPEN (override != resolution)', exc10.rows[0].status === 'open' && exc10.rows[0].hold_new_collection === false, JSON.stringify(exc10.rows[0]));
    const actions10 = await client.query(`SELECT action_type, super_admin_user_id FROM payment_exception_actions WHERE exception_id=$1`, [exceptionId3]);
    check('10b. an append-only override_hold action is recorded with the admin identity', actions10.rows.length === 1 && actions10.rows[0].action_type === 'override_hold' && Number(actions10.rows[0].super_admin_user_id) === Number(userId), JSON.stringify(actions10.rows));

    // --- 11. Resolving the exception records a decision only -- never pretends a refund/credit executed ---
    const resolve11 = await resolvePaymentExceptionCore(client, { exceptionId: exceptionId3, resolutionType: 'resolve_credit', superAdminUserId: userId, reason: 'credit applied manually against next month per Super Admin decision' });
    check('11. resolution recorded as resolve_credit', resolve11.status === 'resolved' && resolve11.resolutionType === 'resolve_credit');
    const exc11 = await client.query(`SELECT status, hold_new_collection FROM payment_exceptions WHERE id=$1`, [exceptionId3]);
    check('11a. exception status flips to resolved', exc11.rows[0].status === 'resolved');
    // Resolving a second time must fail -- an exception is decided once, not re-decided silently.
    let secondResolveErr = null;
    try {
      await resolvePaymentExceptionCore(client, { exceptionId: exceptionId3, resolutionType: 'resolve_refund', superAdminUserId: userId, reason: 'duplicate attempt' });
    } catch (err) { secondResolveErr = err; }
    check('11b. resolving an already-resolved exception is rejected (EXCEPTION_NOT_OPEN)', secondResolveErr !== null && secondResolveErr.code === 'EXCEPTION_NOT_OPEN', secondResolveErr && secondResolveErr.code);

    // --- 12. Immutable-facts trigger: the frozen detection facts cannot be altered, even by a direct UPDATE ---
    let immutableErr = null;
    try {
      await client.query(`UPDATE payment_exceptions SET collected_amount = 1 WHERE id = $1`, [exceptionId3]);
    } catch (err) { immutableErr = err; }
    check('12. attempting to alter a frozen detection fact (collected_amount) is rejected by the trigger', immutableErr !== null, immutableErr && immutableErr.message);

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

// --- Dedicated concurrency test: proves the NEW Statement-lock in
// resolveAttempt actually serializes two concurrent resolutions on the same
// Statement. Uses a real, committed-then-deleted fixture (same precedent as
// Stage 1/2A's own concurrency tests) -- entities/accounts/periods/runs/
// statements/collection_attempts are NOT append-only, so they are deleted
// for real afterward. Crucially, NEITHER connection is ever allowed to
// reach the 'succeeded' branch for real, so no payment (append-only) is
// ever created -- this test proves lock ordering only, not the full
// resolve path (already proven above, safely, inside the rollback).
async function concurrencyTest() {
  const setup = await pool.connect();
  let entityId, accountId, periodId, runId, statementId;
  try {
    const userRes = await setup.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    const tag = `ZZZ_TEST_fin11_2b_conc_${Date.now()}`;
    const e = await setup.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [tag, userId]);
    entityId = e.rows[0].id;
    const ba = await setup.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
    accountId = ba.rows[0].id;
    const start = new Date(Date.UTC(2106, 0, 1));
    const end = new Date(Date.UTC(2106, 0, 2));
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
      await connA.query(`SELECT s.id FROM statements s WHERE s.id=$1 FOR UPDATE OF s`, [statementId]); // mirrors resolveAttempt's new lock

      await connB.query('BEGIN');
      let bAcquired = false;
      const bPromise = connB.query(`SELECT s.id FROM statements s WHERE s.id=$1 FOR UPDATE OF s`, [statementId]).then(() => { bAcquired = true; });
      await new Promise((r2) => setTimeout(r2, 400));
      check('13. concurrent resolveAttempt-style lock: B blocked while A holds the Statement lock', bAcquired === false, `bAcquired=${bAcquired}`);

      await connA.query('ROLLBACK');
      await bPromise;
      check('13a. B acquires the lock once A releases it (no deadlock, clean serialization)', bAcquired === true);
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
    const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_fin11_2b_%'`);
    console.log('\nPost-run verification -- leftover ZZZ_TEST_fin11_2b entities:', leftover.rows[0].count);
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
