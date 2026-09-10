// Proves "מה עושים עכשיו" (Billing v1 simplicity decision, 2026-09-10):
// billing-ops.service.js#nextActionLabel is a pure presentation function
// over already-authoritative facts (readiness from evaluateCollectionReadiness
// -> routing.js, statement.status, latest_attempt_status) -- it invents no
// new state and makes no financial decision, only picks which existing
// fact to show as Hebrew text.
//
// Part 1: pure unit tests, no DB. Part 2: one real-DB smoke test proving
// listStatements actually attaches next_action end to end, including
// reproducing the real production case this was built for (a statement
// under the CARD threshold with no active card instrument).
//
// Run: node scripts/test-billing-next-action-label.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { nextActionLabel, listStatements } = require('../src/modules/platform/billing-ops/billing-ops.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

async function pureTests() {
  await check('paid statement -> שולם, regardless of readiness', () => {
    assert.strictEqual(nextActionLabel({ status: 'paid' }, null, null), 'שולם');
  });

  await check('draft statement -> ממתין לאישור, regardless of readiness', () => {
    assert.strictEqual(nextActionLabel({ status: 'draft' }, null, null), 'ממתין לאישור');
  });

  await check('approved, card route, ready -> מוכן לגבייה', () => {
    const label = nextActionLabel({ status: 'approved' }, { route: 'card', ready: true }, null);
    assert.strictEqual(label, 'מוכן לגבייה');
  });

  await check('approved, card route, not ready (no instrument) -> חסר כרטיס אשראי', () => {
    const label = nextActionLabel({ status: 'approved' }, { route: 'card', ready: false, reason: 'no_active_payment_instrument' }, null);
    assert.strictEqual(label, 'חסר כרטיס אשראי');
  });

  await check('open, card route, ready, but latest attempt declined -> הגבייה נכשלה — נסה שוב (not מוכן לגבייה)', () => {
    const label = nextActionLabel({ status: 'open' }, { route: 'card', ready: true }, 'declined');
    assert.strictEqual(label, 'הגבייה נכשלה — נסה שוב');
  });

  await check('open, card route, ready, latest attempt not_found_confirmed -> also surfaces as a failure to retry', () => {
    const label = nextActionLabel({ status: 'open' }, { route: 'card', ready: true }, 'not_found_confirmed');
    assert.strictEqual(label, 'הגבייה נכשלה — נסה שוב');
  });

  await check('approved, masav route, not ready (not authorized) -> ממתין לאישור מס״ב', () => {
    const label = nextActionLabel({ status: 'approved' }, { route: 'masav', ready: false, reason: 'masav_not_authorized' }, null);
    assert.strictEqual(label, 'ממתין לאישור מס״ב');
  });

  await check('approved, masav route, ready -> ייצוא מס״ב', () => {
    const label = nextActionLabel({ status: 'approved' }, { route: 'masav', ready: true }, null);
    assert.strictEqual(label, 'ייצוא מס״ב');
  });
}

const RUN_TAG = `zzz-test-next-action-${Date.now()}`;
const ids = { entityId: null, accountId: null, periodId: null, runId: null, statementId: null };

async function realDbSmokeTest() {
  await check('listStatements attaches next_action end-to-end for a real statement with no card instrument -- reproduces the ₪7.33 production case', async () => {
    const entity = await pool.query(
      `INSERT INTO entities (display_name, status, entity_type, created_by_user_id) VALUES ($1, 'active', 'association', 1) RETURNING id`,
      [RUN_TAG]
    );
    ids.entityId = entity.rows[0].id;

    const account = await pool.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate) VALUES ($1, 0.03, 0.18) RETURNING id`,
      [ids.entityId]
    );
    ids.accountId = account.rows[0].id;

    const period = await pool.query(
      `INSERT INTO billing_periods (period_start, period_end) VALUES ($1, $2) RETURNING id`,
      ['2099-09-01T00:00:00.000Z', '2099-09-02T00:00:00.000Z']
    );
    ids.periodId = period.rows[0].id;

    const run = await pool.query(
      `INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)
       VALUES ($1, 'production', $2, 'draft', NOW()) RETURNING id`,
      [ids.periodId, '2099-09-01T00:00:00.000Z']
    );
    ids.runId = run.rows[0].id;

    const stmt = await pool.query(
      `INSERT INTO statements (billing_account_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1, $2, 100, 0.03, 0.18, 3, 0.54, 3.54, 'approved') RETURNING id`,
      [ids.accountId, ids.runId]
    );
    ids.statementId = stmt.rows[0].id;

    // No entity_billing row -- same "no card connected" state as the real
    // production statement this feature was built to surface.
    const rows = await listStatements({ periodId: ids.periodId });
    const row = rows.find((r) => r.id === ids.statementId);
    assert.ok(row, 'fixture statement must appear in listStatements');
    assert.strictEqual(row.next_action, 'חסר כרטיס אשראי');
  });
}

async function cleanup() {
  if (ids.statementId) await pool.query(`DELETE FROM statements WHERE id = $1`, [ids.statementId]);
  if (ids.runId) await pool.query(`DELETE FROM billing_runs WHERE id = $1`, [ids.runId]);
  if (ids.periodId) await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [ids.periodId]);
  if (ids.accountId) await pool.query(`DELETE FROM billing_accounts WHERE id = $1`, [ids.accountId]);
  if (ids.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
}

async function verifyZeroResidue() {
  if (!ids.entityId) return;
  const n = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id = $1`, [ids.entityId]);
  assert.strictEqual(n.rows[0].n, 0, 'fixture entity residue');
}

async function main() {
  await pureTests();
  try {
    await realDbSmokeTest();
  } finally {
    await cleanup();
    await verifyZeroResidue();
    console.log('Fixture cleanup verified: zero residue.');
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch (_) {}
  process.exitCode = 1;
  await pool.end();
});
