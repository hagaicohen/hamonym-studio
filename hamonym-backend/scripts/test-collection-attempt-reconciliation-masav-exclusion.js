// Real-DB, real-SQL proof that collection-attempt-reconciliation.job.js's
// candidate query excludes MASAV attempts (2026-09-10 fix) -- unlike
// scripts/test-collection-attempt-recovery.js (deliberately mocked, see its
// own header comment), this script runs the actual SQL against the real
// database so the WHERE clause itself is what's being proven, not a JS
// simulation of it.
//
// Root cause this fixes: a MASAV collection_attempt has no in-app-reachable
// transition out of 'pending' after Excel export by design (masav-
// collection.service.js's "STATE AFTER EXPORT" comment -- submission/result
// handling is manual, outside Hamonym, for the life of v1). Before this fix,
// every such attempt eventually matched the job's generic "pending past 2
// hours" branch, found no MASAV adapter, and generated a permanent hourly
// critical finding for what is actually the intended terminal state.
//
// Uses the exact fixture chain scripts/test-masav-e2e-live-fixture.js
// established (entity -> billing_account -> billing_period -> billing_run
// -> statement, statement created directly at status='approved' rather
// than via approveStatement() -- same reason: no statement_components row
// is ever created, so everything here stays cleanly deletable). Both
// collection_attempts rows are created directly via SQL, never via a real
// charge()/openMasavAttempt() call, and getAdapter/resolveAttemptFn are
// injected fakes -- no real CardCom call, no real Payment, nothing
// irreversible.
//
// Run: node scripts/test-collection-attempt-reconciliation-masav-exclusion.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { reconcileStuckAttempts } = require('../src/jobs/collection-attempt-reconciliation.job');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_masav-exclusion-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17; // same fixture actor used by test-masav-e2e-live-fixture.js

async function main() {
  const fixture = {
    entityId: null, accountId: null, periodId: null, runId: null,
    statementId: null, cardAttemptId: null, masavAttemptId: null,
  };

  try {
    const entity = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
    );
    fixture.entityId = entity.rows[0].id;

    const account = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [fixture.entityId]
    );
    fixture.accountId = account.rows[0].id;

    // Far-future, narrow window -- effectively impossible to collide with a
    // real billing period or another fixture script's own window.
    const period = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      ['2099-07-01T00:00:00.000Z', '2099-07-02T00:00:00.000Z']
    );
    fixture.periodId = period.rows[0].id;

    const run = await pool.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [fixture.periodId, '2099-07-01T00:00:00.000Z']
    );
    fixture.runId = run.rows[0].id;

    const stmt = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 100, 0.03, 0.18, 3, 0.54, 3.54, 'approved') RETURNING id`,
      [fixture.accountId, fixture.runId]
    );
    fixture.statementId = stmt.rows[0].id;

    // Both attempts are "pending" for 3 hours -- past STUCK_AFTER_HOURS (2).
    // A masav attempt sitting like this is the intended, permanent, correct
    // v1 post-export state -- not stuck. A card attempt sitting like this
    // genuinely is stuck and must still be caught.
    const cardAttempt = await pool.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount, initiated_at)
       VALUES ($1, 'card', 1, 'pending', 3.54, NOW() - INTERVAL '3 hours') RETURNING id`,
      [fixture.statementId]
    );
    fixture.cardAttemptId = cardAttempt.rows[0].id;

    const masavAttempt = await pool.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount, initiated_at)
       VALUES ($1, 'masav', 2, 'pending', 3.54, NOW() - INTERVAL '3 hours') RETURNING id`,
      [fixture.statementId]
    );
    fixture.masavAttemptId = masavAttempt.rows[0].id;

    await check('real SQL: the masav attempt is excluded from the candidate set entirely; the card attempt is still selected', async () => {
      // getAdapter returns null unconditionally -- simulates "no adapter
      // available" so a selected row falls straight into stuckForFinding,
      // making it trivial to see exactly which real rows the SQL selected.
      const result = await reconcileStuckAttempts(pool, {
        getAdapter: () => null,
        resolveAttemptFn: async () => { throw new Error('should never be called -- no successful reconcile in this test'); },
      });

      const findings = await pool.query(
        `SELECT subject_id FROM reconciliation_findings WHERE job_name = 'collection-attempt-reconciliation' AND finding_type = 'collection_attempt_stuck' AND subject_id = ANY($1)`,
        [[fixture.cardAttemptId, fixture.masavAttemptId]]
      );
      const flaggedIds = findings.rows.map((r) => r.subject_id);

      assert.ok(flaggedIds.includes(fixture.cardAttemptId), 'the genuinely stuck CARD attempt must still be flagged');
      assert.ok(!flaggedIds.includes(fixture.masavAttemptId), 'the MASAV attempt must NEVER be flagged -- pending-after-export is its intended terminal state');
      assert.ok(result.checked >= 1, 'sanity: the job actually ran against real candidates this run');
    });
  } finally {
    await pool.query(`DELETE FROM reconciliation_findings WHERE subject_id = ANY($1)`, [[fixture.cardAttemptId, fixture.masavAttemptId].filter(Boolean)]);
    if (fixture.statementId) await pool.query(`DELETE FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]);
    if (fixture.statementId) await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.statementId]);
    if (fixture.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.runId]);
    if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
    if (fixture.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
    if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);

    const residue = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id = $1`, [fixture.entityId]);
    assert.strictEqual(residue.rows[0].n, 0, 'fixture entity residue');
    console.log('Fixture cleanup verified: zero residue.');
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL', err);
  process.exitCode = 1;
  await pool.end();
});
