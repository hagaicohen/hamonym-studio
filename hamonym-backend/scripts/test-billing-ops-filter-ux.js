// Regression coverage for the 2026-09-17 Billing Ops "כל החיובים" filter
// UX work, in the order it actually happened:
//   1. listPeriods() excludes retired periods (found live: three real
//      retired sub-second test/harness periods from 2026-08-28 were
//      showing up as confusing raw timestamp ranges in the חודש filter),
//      and excludes non-retired rows that aren't a genuine calendar month
//      (same sub-second harness shape, as a structural backstop).
//   1b. A same-day 12-month bounded-horizon rule was tried (to hide the
//      permanent 2099-08 Donation->Billing E2E fixture) and then REVERTED:
//      real Billing history must stay queryable indefinitely, and no
//      existing period/run property can reliably distinguish "artificial
//      test period" from "genuine old/future period" (investigated and
//      confirmed -- see that conversation). So listPeriods() no longer has
//      any time-horizon bound; 1e below now asserts a far-future genuine
//      calendar month IS included, not excluded.
//   2. The real fix for 2099-08 (and for "does this month have any
//      charges" in general) is architectural: "כל החיובים" no longer
//      drives its חודש control from listPeriods() at all. The operator
//      picks ANY calendar month via a native month/year input, and
//      listStatements()'s new `month` ("YYYY-MM") param resolves it to
//      real calendar boundaries and matches Statements directly -- a
//      month with no billing_periods row just returns zero rows, never
//      creating one. See section 3 below.
//   2b. listStatements()'s status filter accepts the same two operational
//      buckets the מצב column already displays ('pending_collection'/
//      'collection_failed', splitting status IN ('approved','open')
//      exactly like operationalStateLabel()/isCollectionFailed() already
//      do on the frontend) -- never a second, diverging definition.
//
// Uses the exact same live-fixture pattern as every other scripts/test-
// billing-*.js script: real DB, real service functions, periods placed at
// offsets relative to the real current month (never a fixed year, so this
// stays meaningful and collision-free no matter when it's run), cleanup in
// `finally`, zero-residue verification.
//
// Run: node scripts/test-billing-ops-filter-ux.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const billingOpsService = require('../src/modules/platform/billing-ops/billing-ops.service');

// Calendar-month boundary offset from the REAL current month (not a fixed
// year), so this test's "within horizon" / "beyond horizon" cases stay
// meaningful no matter when it's run. Offsets are chosen far enough from
// "now" (>= 6 months either way) to stay clear of whatever real near-term
// operational periods happen to exist at run time.
function monthBoundaryOffset(offsetMonths) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m + offsetMonths, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + offsetMonths + 1, 1, 0, 0, 0, 0));
  return { start: start.toISOString(), end: end.toISOString() };
}

// "YYYY-MM" for the same offset -- the exact value shape the frontend's
// native <input type="month"> sends as listStatements()'s `month` param.
function monthKeyOffset(offsetMonths) {
  const { start } = monthBoundaryOffset(offsetMonths);
  return start.slice(0, 7);
}

let failures = 0;
let passed = 0;
function check(name, fn) {
  return Promise.resolve().then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DATA_DO_NOT_USE_billing-filter-ux-${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17;

async function main() {
  const fixture = {
    entityId: null, accountId: null, periodId: null, runId: null,
    entityId2: null, accountId2: null,
    activeStmtId: null, retiredPeriodId: null,
    pendingStmtId: null, failedStmtId: null, attemptId: null,
    nearFuturePeriodId: null, farFuturePeriodId: null,
    technicalPeriodId: null, pastLegitPeriodId: null,
    pastLegitRunId: null, pastLegitStmtId: null,
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

    // A second account is required because `statements` has a unique
    // constraint on (billing_account_id, billing_period_id) -- one
    // statement per account per period -- so the two test statements
    // (pending vs. failed) need two distinct accounts.
    const entity2 = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [`${FIXTURE_TAG}_2`, SUPER_ADMIN_USER_ID]
    );
    fixture.entityId2 = entity2.rows[0].id;

    const account2 = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [fixture.entityId2]
    );
    fixture.accountId2 = account2.rows[0].id;

    // ---- 1. retired-period exclusion -------------------------------------
    // Offset 9 (a genuine calendar month, within the 12-month horizon) so
    // this pair is unaffected by the bounded-horizon rule added in 1c-1f
    // below -- that rule is exercised separately, on its own dedicated
    // fixture periods, not conflated with the retired/active pair here.
    const activeWindow = monthBoundaryOffset(9);
    const period = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [activeWindow.start, activeWindow.end]
    );
    fixture.periodId = period.rows[0].id;

    const retiredSubWindowStart = new Date(new Date(activeWindow.start).getTime() + 10 * 3600 * 1000);
    const retiredSubWindowEnd = new Date(retiredSubWindowStart.getTime() + 1000);
    const retiredPeriod = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end, retired) VALUES ($1, $2, true) RETURNING id`,
      [retiredSubWindowStart.toISOString(), retiredSubWindowEnd.toISOString()]
    );
    fixture.retiredPeriodId = retiredPeriod.rows[0].id;

    await check('1a. listPeriods() excludes a retired period', async () => {
      const periods = await billingOpsService.listPeriods();
      const ids = periods.map((p) => p.id);
      assert.ok(!ids.includes(fixture.retiredPeriodId), 'retired period must not be returned');
    });

    await check('1b. listPeriods() still returns the active (non-retired) period', async () => {
      const periods = await billingOpsService.listPeriods();
      const ids = periods.map((p) => p.id);
      assert.ok(ids.includes(fixture.periodId), 'active period must still be returned');
    });

    // ---- 1c. calendar-shape + bounded-horizon exclusions -----------------
    const pastLegit = monthBoundaryOffset(-6);
    const pastLegitPeriod = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [pastLegit.start, pastLegit.end]
    );
    fixture.pastLegitPeriodId = pastLegitPeriod.rows[0].id;

    const nearFuture = monthBoundaryOffset(6);
    const nearFuturePeriod = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [nearFuture.start, nearFuture.end]
    );
    fixture.nearFuturePeriodId = nearFuturePeriod.rows[0].id;

    const farFuture = monthBoundaryOffset(1800); // 150 years out -- a genuine calendar month, must still be listed (no horizon bound)
    const farFuturePeriod = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [farFuture.start, farFuture.end]
    );
    fixture.farFuturePeriodId = farFuturePeriod.rows[0].id;

    // A non-retired but non-calendar-shaped period (sub-second window,
    // like the real 2026-08-28 harness residue) -- placed in its own
    // distinct month (offset 8) so its tiny range can't overlap the
    // full-month nearFuture/farFuture periods above.
    const technicalWindow = monthBoundaryOffset(8);
    const technicalStart = new Date(new Date(technicalWindow.start).getTime() + 10 * 3600 * 1000);
    const technicalEnd = new Date(technicalStart.getTime() + 1000);
    const technicalPeriod = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [technicalStart.toISOString(), technicalEnd.toISOString()]
    );
    fixture.technicalPeriodId = technicalPeriod.rows[0].id;

    await check('1c. listPeriods() includes a genuine calendar month 6 months in the past', async () => {
      const ids = (await billingOpsService.listPeriods()).map((p) => p.id);
      assert.ok(ids.includes(fixture.pastLegitPeriodId));
    });

    await check('1d. listPeriods() includes a genuine calendar month 6 months in the future (within the operational horizon)', async () => {
      const ids = (await billingOpsService.listPeriods()).map((p) => p.id);
      assert.ok(ids.includes(fixture.nearFuturePeriodId));
    });

    await check('1e. listPeriods() INCLUDES a genuine calendar month 150 years out -- no time-horizon bound (reverted 2026-09-17): real history/legitimate far-future periods are never hidden by date range', async () => {
      const ids = (await billingOpsService.listPeriods()).map((p) => p.id);
      assert.ok(ids.includes(fixture.farFuturePeriodId));
    });

    await check('1f. listPeriods() excludes a non-retired, non-calendar-shaped (sub-second) technical period', async () => {
      const ids = (await billingOpsService.listPeriods()).map((p) => p.id);
      assert.ok(!ids.includes(fixture.technicalPeriodId));
    });

    const runAsOf = new Date(new Date(activeWindow.start).getTime() + 14 * 24 * 3600 * 1000).toISOString();
    const run = await pool.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [fixture.periodId, runAsOf]
    );
    fixture.runId = run.rows[0].id;

    // ---- 2. status-filter operational buckets ----------------------------
    // Both statements route to 'card' (total_due well under the threshold).
    const pendingStmt = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 100, 0.03, 0.18, 3, 0.54, 3.54, 'approved') RETURNING id`,
      [fixture.accountId, fixture.runId]
    );
    fixture.pendingStmtId = pendingStmt.rows[0].id;
    // No collection_attempts row at all -- "never tried yet", must still
    // read as pending_collection, not accidentally excluded by a NULL
    // latest_attempt_status (the exact bug caught before this shipped).

    const failedStmt = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 200, 0.03, 0.18, 6, 1.08, 7.08, 'approved') RETURNING id`,
      [fixture.accountId2, fixture.runId]
    );
    fixture.failedStmtId = failedStmt.rows[0].id;

    const attempt = await pool.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount, provider, status)
       VALUES ($1, 'card', 1, 7.08, 'cardcom', 'declined') RETURNING id`,
      [fixture.failedStmtId]
    );
    fixture.attemptId = attempt.rows[0].id;

    await check('2a. status=pending_collection: includes the never-attempted card statement, excludes the failed one', async () => {
      const rows = await billingOpsService.listStatements({ periodId: fixture.periodId, status: 'pending_collection' });
      const ids = rows.map((r) => r.id);
      assert.ok(ids.includes(fixture.pendingStmtId), 'never-attempted statement must be pending_collection');
      assert.ok(!ids.includes(fixture.failedStmtId), 'declined statement must NOT be pending_collection');
    });

    await check('2b. status=collection_failed: includes only the declined statement', async () => {
      const rows = await billingOpsService.listStatements({ periodId: fixture.periodId, status: 'collection_failed' });
      const ids = rows.map((r) => r.id);
      assert.ok(ids.includes(fixture.failedStmtId), 'declined statement must be collection_failed');
      assert.ok(!ids.includes(fixture.pendingStmtId), 'never-attempted statement must NOT be collection_failed');
    });

    await check('2c. status=approved (raw, unmapped) is a plain exact match on statements.status -- both rows returned, unchanged behavior', async () => {
      const rows = await billingOpsService.listStatements({ periodId: fixture.periodId, status: 'approved' });
      const ids = rows.map((r) => r.id);
      assert.ok(ids.includes(fixture.pendingStmtId) && ids.includes(fixture.failedStmtId));
    });

    await check('2d. status=draft: no rows for this period (both fixture statements are approved) -- proves raw values still filter normally', async () => {
      const rows = await billingOpsService.listStatements({ periodId: fixture.periodId, status: 'draft' });
      assert.strictEqual(rows.length, 0);
    });

    await check('2e. no status filter: both statements returned', async () => {
      const rows = await billingOpsService.listStatements({ periodId: fixture.periodId });
      assert.strictEqual(rows.length, 2);
    });

    // ---- 3. month/year filter (2026-09-17 month-picker redesign) --------
    // A real Statement in an old historical month (pastLegitPeriodId, 6
    // months in the past -- created back in section 1c), proving history
    // stays queryable indefinitely, not just "the current period".
    const pastLegitRun = await pool.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [fixture.pastLegitPeriodId, pastLegit.start]
    );
    fixture.pastLegitRunId = pastLegitRun.rows[0].id;

    const pastLegitStmt = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 50, 0.03, 0.18, 1.5, 0.27, 1.77, 'approved') RETURNING id`,
      [fixture.accountId, fixture.pastLegitRunId]
    );
    fixture.pastLegitStmtId = pastLegitStmt.rows[0].id;

    await check('3a. month filter: an old historical month with a real charge returns it', async () => {
      const rows = await billingOpsService.listStatements({ month: monthKeyOffset(-6) });
      const ids = rows.map((r) => r.id);
      assert.ok(ids.includes(fixture.pastLegitStmtId), 'historical month statement must be returned');
    });

    await check('3b. month filter: the current fixture month returns exactly its two statements, same as filtering by periodId', async () => {
      const rows = await billingOpsService.listStatements({ month: monthKeyOffset(9) });
      const ids = rows.map((r) => r.id).sort();
      assert.deepStrictEqual(ids, [fixture.pendingStmtId, fixture.failedStmtId].sort());
    });

    await check('3c. month filter combines correctly with status: month + collection_failed returns only the declined one', async () => {
      const rows = await billingOpsService.listStatements({ month: monthKeyOffset(9), status: 'collection_failed' });
      assert.deepStrictEqual(rows.map((r) => r.id), [fixture.failedStmtId]);
    });

    await check('3d. month filter: a month with no billing_periods row at all returns zero rows, and creates nothing', async () => {
      const emptyMonthKey = monthKeyOffset(50); // far enough out to have no fixture/real period
      const emptyBoundary = monthBoundaryOffset(50);
      const before = await pool.query(`SELECT count(*) FROM billing_periods WHERE period_start = $1`, [emptyBoundary.start]);
      assert.strictEqual(Number(before.rows[0].count), 0, 'sanity: no period should pre-exist for this offset');

      const rows = await billingOpsService.listStatements({ month: emptyMonthKey });
      assert.strictEqual(rows.length, 0);

      const after = await pool.query(`SELECT count(*) FROM billing_periods WHERE period_start = $1`, [emptyBoundary.start]);
      assert.strictEqual(Number(after.rows[0].count), 0, 'a read-only month filter must never create a billing_periods row');
    });

    await check('3e. month filter: an invalid "YYYY-MM" value is rejected with INVALID_MONTH, not a silent wrong result', async () => {
      let threw = null;
      try {
        await billingOpsService.listStatements({ month: '2026-13' });
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, 'month=2026-13 must throw');
      assert.strictEqual(threw.code, 'INVALID_MONTH');
    });
  } finally {
    if (fixture.attemptId) await pool.query(`DELETE FROM collection_attempts WHERE id = $1`, [fixture.attemptId]);
    if (fixture.pendingStmtId) await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.pendingStmtId]);
    if (fixture.failedStmtId) await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.failedStmtId]);
    if (fixture.pastLegitStmtId) await pool.query(`DELETE FROM statements WHERE id = $1`, [fixture.pastLegitStmtId]);
    if (fixture.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.runId]);
    if (fixture.pastLegitRunId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.pastLegitRunId]);
    if (fixture.retiredPeriodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.retiredPeriodId]);
    if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
    if (fixture.pastLegitPeriodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.pastLegitPeriodId]);
    if (fixture.nearFuturePeriodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.nearFuturePeriodId]);
    if (fixture.farFuturePeriodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.farFuturePeriodId]);
    if (fixture.technicalPeriodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.technicalPeriodId]);
    if (fixture.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
    if (fixture.accountId2) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId2]);
    if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);
    if (fixture.entityId2) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId2]);

    await check('cleanup verification: zero residue', async () => {
      const periodIds = [
        fixture.periodId, fixture.retiredPeriodId, fixture.pastLegitPeriodId,
        fixture.nearFuturePeriodId, fixture.farFuturePeriodId, fixture.technicalPeriodId,
      ].filter(Boolean);
      const stmtIds = [fixture.pendingStmtId, fixture.failedStmtId, fixture.pastLegitStmtId].filter(Boolean);
      const runIds = [fixture.runId, fixture.pastLegitRunId].filter(Boolean);
      const [ca, s, r, p, a, e] = await Promise.all([
        pool.query(`SELECT id FROM collection_attempts WHERE statement_id = ANY($1::uuid[])`, [stmtIds]),
        pool.query(`SELECT id FROM statements WHERE id = ANY($1::uuid[])`, [stmtIds]),
        pool.query(`SELECT id FROM billing_runs WHERE id = ANY($1::uuid[])`, [runIds]),
        pool.query(`SELECT id FROM billing_periods WHERE id = ANY($1::uuid[])`, [periodIds]),
        pool.query(`SELECT id FROM billing_accounts WHERE id = ANY($1::uuid[])`, [[fixture.accountId, fixture.accountId2].filter(Boolean)]),
        pool.query(`SELECT id FROM entities WHERE id = ANY($1::uuid[])`, [[fixture.entityId, fixture.entityId2].filter(Boolean)]),
      ]);
      assert.strictEqual(ca.rows.length, 0, 'collection_attempts residue');
      assert.strictEqual(s.rows.length, 0, 'statements residue');
      assert.strictEqual(r.rows.length, 0, 'billing_runs residue');
      assert.strictEqual(p.rows.length, 0, 'billing_periods residue');
      assert.strictEqual(a.rows.length, 0, 'billing_accounts residue');
      assert.strictEqual(e.rows.length, 0, 'entities residue');
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
