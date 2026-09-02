// Real-DB integration smoke test for the new bulk-approval orchestration
// (billing-ops.service.js#bulkApproveStatements, 2026-09-02) -- proves the
// endpoint's per-id failure isolation against the ACTUAL schema/triggers
// (production_run trigger, immutability trigger, statement status CHECK),
// not just the mocked pool used by scripts/test-billing-bulk-approval.js.
//
// Deliberately never creates a genuinely APPROVABLE statement (i.e. one
// with real statement_components pointing at a paid, non-mock donation).
// Reason: statement_components is unconditionally append-only at the DB
// level (migration 054's trg_statement_components_no_delete/no_update --
// no exception for status, no exception for test data) and a paid donation
// can never be deleted (migration 055's trg_donations_block_paid_delete).
// A real successful approval in this script would therefore leave
// permanent, un-cleanable residue -- exactly what this script exists to
// avoid. The success path and the "one bad id doesn't block the others"
// property are already proven against a mocked pool in
// scripts/test-billing-bulk-approval.js; this script instead proves the
// three cleanly-failing validation paths (NO_COMPONENTS,
// CANNOT_APPROVE_ABANDONED, STATEMENT_NOT_FOUND) actually behave this way
// against the real database, and that the fixture created to prove it
// leaves zero residue afterward.
//
// Requires real DB credentials in .env (DB_HOST/DB_NAME/DB_USER/DB_PASSWORD)
// -- same as running the server itself. Every fixture row is deleted again
// in a finally block, and re-queried afterward to confirm zero residue,
// even if an assertion above it fails.
//
// Run: node scripts/test-billing-bulk-approval-live-fixture.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const billingOps = require('../src/modules/platform/billing-ops/billing-ops.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `bulk-approve-fixture-${Date.now()}`;

async function main() {
  const fixture = { entityId: null, accountId: null, periodId: null, runId: null, statementIds: [] };

  try {
    // ---- fixture setup (never touches donations/statement_components) ----
    const entity = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, 17, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG]
    );
    fixture.entityId = entity.rows[0].id;

    const account = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [fixture.entityId]
    );
    fixture.accountId = account.rows[0].id;

    // Far-future, narrow window -- effectively impossible to collide with a
    // real billing period, and the exclusion constraint would fail this
    // script cleanly (not silently) if it ever somehow did.
    const periodStart = '2099-01-01T00:00:00.000Z';
    const periodEnd = '2099-01-02T00:00:00.000Z';
    const period = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      [periodStart, periodEnd]
    );
    fixture.periodId = period.rows[0].id;

    const run = await pool.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [fixture.periodId, periodStart]
    );
    fixture.runId = run.rows[0].id;

    // stmt-a: draft, zero components -> approveStatement must fail with
    // NO_COMPONENTS before touching anything else.
    const stmtA = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due)
       VALUES ($1, $2, 0, 0.03, 0.18, 0, 0, 0) RETURNING id`,
      [fixture.accountId, fixture.runId]
    );
    fixture.statementIds.push(stmtA.rows[0].id);

    // stmt-b: created directly as 'abandoned' (terminal) -> must fail with
    // CANNOT_APPROVE_ABANDONED.
    const stmtB = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 0, 0.03, 0.18, 0, 0, 0, 'abandoned') RETURNING id`,
      [fixture.accountId, fixture.runId]
    );
    fixture.statementIds.push(stmtB.rows[0].id);

    // stmt-c: not a real row at all -> must fail with STATEMENT_NOT_FOUND.
    const nonExistentId = '00000000-0000-4000-8000-000000000000';

    const [stmtAId, stmtBId] = fixture.statementIds;

    await check('bulk approve against the real DB: 3 statements, each fails a different real validation/existence check, isolated per id', async () => {
      const result = await billingOps.bulkApproveStatements({
        statementIds: [stmtAId, stmtBId, nonExistentId],
        superAdminUserId: 17,
        ip: '127.0.0.1',
      });

      assert.strictEqual(result.total, 3);
      assert.strictEqual(result.approvedCount, 0);
      assert.strictEqual(result.failedCount, 3);

      const [rA, rB, rC] = result.results;
      assert.strictEqual(rA.id, stmtAId);
      assert.strictEqual(rA.success, false);
      assert.strictEqual(rA.error.code, 'NO_COMPONENTS');

      assert.strictEqual(rB.id, stmtBId);
      assert.strictEqual(rB.success, false);
      assert.strictEqual(rB.error.code, 'CANNOT_APPROVE_ABANDONED');

      assert.strictEqual(rC.id, nonExistentId);
      assert.strictEqual(rC.success, false);
      assert.strictEqual(rC.error.code, 'STATEMENT_NOT_FOUND');
    });

    await check('nothing was silently approved -- both real fixture statements are unchanged in the DB', async () => {
      const { rows } = await pool.query(`SELECT id, status FROM statements WHERE id = ANY($1::uuid[])`, [fixture.statementIds]);
      const byId = Object.fromEntries(rows.map((r) => [r.id, r.status]));
      assert.strictEqual(byId[stmtAId], 'draft');
      assert.strictEqual(byId[stmtBId], 'abandoned');
    });

    await check('no audit log row was written for any of the three failed ids', async () => {
      const { rows } = await pool.query(
        `SELECT id FROM platform_audit_log WHERE notes LIKE $1 OR notes LIKE $2`,
        [`%statementId=${stmtAId}%`, `%statementId=${stmtBId}%`]
      );
      assert.strictEqual(rows.length, 0);
    });
  } finally {
    // ---- cleanup: statement_components was never touched, so every row
    // created above is a plain, unconditionally deletable fixture row.
    if (fixture.statementIds.length) {
      await pool.query(`DELETE FROM statements WHERE id = ANY($1::uuid[])`, [fixture.statementIds]);
    }
    if (fixture.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [fixture.runId]);
    if (fixture.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [fixture.periodId]);
    if (fixture.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [fixture.accountId]);
    if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);

    await check('cleanup verification: zero residue -- every fixture row is gone', async () => {
      const [s, r, p, a, e] = await Promise.all([
        fixture.statementIds.length
          ? pool.query(`SELECT id FROM statements WHERE id = ANY($1::uuid[])`, [fixture.statementIds])
          : { rows: [] },
        fixture.runId ? pool.query(`SELECT id FROM billing_runs WHERE id = $1`, [fixture.runId]) : { rows: [] },
        fixture.periodId ? pool.query(`SELECT id FROM billing_periods WHERE id = $1`, [fixture.periodId]) : { rows: [] },
        fixture.accountId ? pool.query(`SELECT id FROM billing_accounts WHERE id = $1`, [fixture.accountId]) : { rows: [] },
        fixture.entityId ? pool.query(`SELECT id FROM entities WHERE id = $1`, [fixture.entityId]) : { rows: [] },
      ]);
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
