// Real-DB, real-function proof for ensureAttemptsForExport() (2026-09-16
// MASAV export UX simplification): the operator no longer opens a
// "collection attempt" as a separate step ("פתיחת ניסיון גבייה" removed
// from the UI) -- exportSelected() now calls this once per selected
// Statement to reuse-or-create the attempt export requires, before
// generateExportExcel(). This script proves ensureAttemptsForExport()
// itself, on top of the already-proven openMasavAttempt()/
// generateExportExcel() behavior covered by
// scripts/test-masav-e2e-live-fixture.js -- so this stays narrowly scoped
// to the new bulk wrapper's own behavior: correct per-statement routing of
// ready vs. not-ready, no duplicate attempts across repeated calls, and
// that export succeeds for a Statement whose attempt was created this way
// (never manually opened).
//
// Run: node scripts/test-masav-export-auto-attempt.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const masavConfigService = require('../src/modules/billing-engine/masav-config.service');
const masavCollectionService = require('../src/modules/collection-engine/masav-collection.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_masav-auto-attempt-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17; // test-scoped-admin@example.com, same fixture actor as other live-fixture scripts.
const TOTAL_DUE = 6000; // > CARD_MASAV_THRESHOLD (3540)

// Self-cleaning on partial failure -- found live, 2026-09-16: an earlier
// version of this function let a later step's failure (e.g. a
// billing_periods bounds collision with another script's still-live
// fixture) leak the entity+billing_account rows already created by the
// steps before it, since the caller's Object.assign() never ran and those
// ids were never captured anywhere. Two such orphaned entities sat in the
// DB until found by a later residue sweep. Now tracks everything it
// creates locally and deletes it (FK-safe order) before rethrowing.
async function makeFixtureStatement(label, dayOfMonth) {
  const created = { entityId: null, accountId: null, periodId: null, runId: null, statementId: null };
  try {
    const entity = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [`${FIXTURE_TAG}_${label}`, SUPER_ADMIN_USER_ID]
    );
    created.entityId = entity.rows[0].id;

    const account = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [created.entityId]
    );
    created.accountId = account.rows[0].id;

    // Far-future window, collision-proof with real periods; a distinct day
    // per fixture statement avoids billing_periods' own (period_start,
    // period_end) uniqueness constraint when this script creates more than
    // one period in the same run.
    const day = String(dayOfMonth).padStart(2, '0');
    const periodStart = `2099-07-${day}T00:00:00.000Z`;
    const periodEnd = `2099-07-${String(dayOfMonth + 1).padStart(2, '0')}T00:00:00.000Z`;
    const period = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [periodStart, periodEnd]
    );
    created.periodId = period.rows[0].id;

    const run = await pool.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [created.periodId, periodStart]
    );
    created.runId = run.rows[0].id;

    const stmt = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, $3, 0.03, 0.18, $3, 0, $3, 'approved') RETURNING id, status`,
      [created.accountId, created.runId, TOTAL_DUE]
    );
    assert.strictEqual(stmt.rows[0].status, 'approved');
    created.statementId = stmt.rows[0].id;

    return created;
  } catch (err) {
    if (created.statementId) await pool.query(`DELETE FROM statements WHERE id = $1`, [created.statementId]);
    if (created.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [created.runId]);
    if (created.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [created.periodId]);
    if (created.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [created.accountId]);
    if (created.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [created.entityId]);
    throw err;
  }
}

async function main() {
  const ready = { entityId: null, accountId: null, periodId: null, runId: null, statementId: null };
  const notReady = { entityId: null, accountId: null, periodId: null, runId: null, statementId: null };

  try {
    // Days 10/15 -- deliberately distinct from create-masav-export-ui-
    // fixture.js's own day 1/5 window, since that script's fixture may be
    // live in the DB at the same time this one runs.
    Object.assign(ready, await makeFixtureStatement('ready', 10));
    Object.assign(notReady, await makeFixtureStatement('not_ready', 15));

    // ready: bank details + explicit authorization -- routing.js will
    // resolve this to 'masav'.
    await masavConfigService.upsertBankDetails({
      entityId: ready.entityId, bankCode: '12', branchCode: '345', accountNumber: '000999888',
      accountHolderName: FIXTURE_TAG, actorUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
    });
    await masavConfigService.authorize({
      entityId: ready.entityId, superAdminUserId: SUPER_ADMIN_USER_ID, notes: 'fixture', ip: '127.0.0.1',
    });

    // not_ready: bank details saved, but never authorized -- still blocked.
    await masavConfigService.upsertBankDetails({
      entityId: notReady.entityId, bankCode: '12', branchCode: '345', accountNumber: '000111222',
      accountHolderName: FIXTURE_TAG, actorUserId: SUPER_ADMIN_USER_ID, ip: '127.0.0.1',
    });

    await check('1. ensureAttemptsForExport([ready, not_ready]) in one call: creates a real attempt for the ready Statement, skips the not-ready one with the true reason -- never fabricates readiness', async () => {
      const results = await masavCollectionService.ensureAttemptsForExport([ready.statementId, notReady.statementId]);
      assert.strictEqual(results.length, 2);

      const readyResult = results.find((r) => r.statementId === ready.statementId);
      assert.strictEqual(readyResult.skipped, false);
      assert.ok(readyResult.attemptId);
      ready.attemptId = readyResult.attemptId;

      const notReadyResult = results.find((r) => r.statementId === notReady.statementId);
      assert.strictEqual(notReadyResult.skipped, true);
      assert.strictEqual(notReadyResult.reason, 'masav_not_authorized');
      assert.strictEqual(notReadyResult.attemptId, undefined);

      const { rows: readyAttempts } = await pool.query(`SELECT id, status FROM collection_attempts WHERE statement_id = $1`, [ready.statementId]);
      assert.strictEqual(readyAttempts.length, 1);
      assert.strictEqual(readyAttempts[0].status, 'pending');

      const { rows: notReadyAttempts } = await pool.query(`SELECT id FROM collection_attempts WHERE statement_id = $1`, [notReady.statementId]);
      assert.strictEqual(notReadyAttempts.length, 0, 'no attempt row for a Statement that is not actually MASAV-ready');
    });

    await check('2. calling ensureAttemptsForExport again for the same ready Statement reuses the existing attempt -- idempotent, no duplicate row (proves "select -> export" is safe to click more than once)', async () => {
      const results = await masavCollectionService.ensureAttemptsForExport([ready.statementId]);
      assert.strictEqual(results.length, 1);
      assert.strictEqual(results[0].skipped, true);
      assert.strictEqual(results[0].reason, 'attempt_already_active');
      assert.strictEqual(results[0].attemptId, ready.attemptId);

      const { rows: attempts } = await pool.query(`SELECT id FROM collection_attempts WHERE statement_id = $1`, [ready.statementId]);
      assert.strictEqual(attempts.length, 1, 'still exactly one attempt row -- no duplicate created');
    });

    await check('3. generateExportExcel succeeds for the ready Statement using only the attempt ensureAttemptsForExport created -- the operator never had to open it by hand', async () => {
      const buffer = await masavCollectionService.generateExportExcel([ready.statementId]);
      assert.ok(Buffer.isBuffer(buffer) && buffer.length > 0);
    });

    await check('4. generateExportExcel still refuses the not-ready Statement (its own independent guard, unchanged/unweakened)', async () => {
      await assert.rejects(
        () => masavCollectionService.generateExportExcel([notReady.statementId]),
        (err) => err.code === 'NOT_AUTHORIZED',
      );
    });
  } finally {
    for (const fixture of [ready, notReady]) {
      if (fixture.statementId) {
        // Test 1 deliberately exercises the blocked branch of
        // ensureAttemptsForExport() -> openMasavAttempt(), which calls
        // recordFinding() for 'masav_blocked_pending_authorization' on the
        // not-ready Statement -- that finding row is its own residue, not
        // covered by any other DELETE below (found live, orphaned, on
        // 2026-09-16: it surfaced as a real "דורש טיפול" card entry on the
        // "החודש" tab after a run of this script, since nothing had ever
        // cleaned it up).
        await pool.query(`DELETE FROM reconciliation_findings WHERE subject_type = 'statement' AND subject_id = $1`, [fixture.statementId]);
        await pool.query(`DELETE FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]);
        await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.statementId]);
      }
      if (fixture.entityId) {
        await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [fixture.entityId]);
        await pool.query(`DELETE FROM entity_masav_details WHERE entity_id = $1`, [fixture.entityId]);
      }
      if (fixture.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.runId]);
      if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
      if (fixture.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
      if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);
    }

    await check('cleanup verification: zero residue for both fixture entities', async () => {
      for (const fixture of [ready, notReady]) {
        const [ca, emd, s, r, p, a, e, aud, rf] = await Promise.all([
          fixture.statementId ? pool.query(`SELECT id FROM collection_attempts WHERE statement_id = $1`, [fixture.statementId]) : { rows: [] },
          fixture.entityId ? pool.query(`SELECT id FROM entity_masav_details WHERE entity_id = $1`, [fixture.entityId]) : { rows: [] },
          fixture.statementId ? pool.query(`SELECT id FROM statements WHERE id = $1`, [fixture.statementId]) : { rows: [] },
          fixture.runId ? pool.query(`SELECT id FROM billing_runs WHERE id = $1`, [fixture.runId]) : { rows: [] },
          fixture.periodId ? pool.query(`SELECT id FROM billing_periods WHERE id = $1`, [fixture.periodId]) : { rows: [] },
          fixture.accountId ? pool.query(`SELECT id FROM billing_accounts WHERE id = $1`, [fixture.accountId]) : { rows: [] },
          fixture.entityId ? pool.query(`SELECT id FROM entities WHERE id = $1`, [fixture.entityId]) : { rows: [] },
          fixture.entityId ? pool.query(`SELECT id FROM platform_audit_log WHERE entity_id = $1`, [fixture.entityId]) : { rows: [] },
          fixture.statementId ? pool.query(`SELECT id FROM reconciliation_findings WHERE subject_type = 'statement' AND subject_id = $1`, [fixture.statementId]) : { rows: [] },
        ]);
        assert.strictEqual(ca.rows.length, 0, 'collection_attempts residue');
        assert.strictEqual(emd.rows.length, 0, 'entity_masav_details residue');
        assert.strictEqual(s.rows.length, 0, 'statements residue');
        assert.strictEqual(r.rows.length, 0, 'billing_runs residue');
        assert.strictEqual(p.rows.length, 0, 'billing_periods residue');
        assert.strictEqual(a.rows.length, 0, 'billing_accounts residue');
        assert.strictEqual(e.rows.length, 0, 'entities residue');
        assert.strictEqual(rf.rows.length, 0, 'reconciliation_findings residue');
        assert.strictEqual(aud.rows.length, 0, 'platform_audit_log residue');
      }
    });
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.end().catch(() => {});
  process.exit(1);
});
