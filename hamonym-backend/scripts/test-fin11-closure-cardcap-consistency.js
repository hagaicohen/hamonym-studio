// FIN-11 final production readiness (2026-10) -- card-cap consistency.
// Business decision: FIN-11's ₪3,000 cap, not the legacy ₪3,540 routing
// threshold, is THE rule for how much ANY card attempt may ever request.
// Runs against the genuinely isolated local Postgres container (see
// test-fin11-closure-autoapproval.js's header for setup) -- zero
// production writes.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = process.env.HAMONYM_FIN11_TEST_DB || 'hamonym_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'testpass';
process.env.DB_SSL = 'false';

const pool = require('../src/db/db');
const { openAttempt, FIN11_CARD_COLLECTION_CAP } = require('../src/modules/collection-engine/collection.service');
const { openMasavAttempt } = require('../src/modules/collection-engine/masav-collection.service');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

let userId, roleId;

async function seedBase() {
  const role = await pool.query(`INSERT INTO roles (code, name) VALUES ('t_role', 'T') RETURNING id`);
  roleId = role.rows[0].id;
  const user = await pool.query(`INSERT INTO users (role_id, email, is_super_admin) VALUES ($1, 't@isolated.local', true) RETURNING id`, [roleId]);
  userId = user.rows[0].id;
  await pool.query(`INSERT INTO platform_billing_settings (id, vat_rate) VALUES (1, 0.18) ON CONFLICT(id) DO NOTHING`);
}

async function makeEntity(name) {
  const e = await pool.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [name, userId]);
  return e.rows[0].id;
}
async function makeBillingAccount(entityId) {
  const ba = await pool.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
  return ba.rows[0].id;
}
async function makePaymentInstrument(entityId) {
  await pool.query(
    `INSERT INTO entity_billing (entity_id, provider, token, last4, exp_month, exp_year, card_holder_name, is_default, status)
     VALUES ($1,'cardcom','tok-zzz-test','4242',12,2030,'Test',true,'active')`,
    [entityId]
  );
}
let periodCounter = 0;
async function makeStatement(accountId, totalDue) {
  periodCounter++;
  const offset = periodCounter * 4;
  const start = new Date(Date.UTC(2295, 0, 1 + offset));
  const end = new Date(Date.UTC(2295, 0, 2 + offset));
  const p = await pool.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
  const run = await pool.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [p.rows[0].id]);
  const fee = (totalDue / 1.18).toFixed(2);
  const vat = (totalDue - totalDue / 1.18).toFixed(2);
  const s = await pool.query(
    `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
     VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,$6,'approved') RETURNING id`,
    [accountId, p.rows[0].id, run.rows[0].id, fee, vat, totalDue]
  );
  return s.rows[0].id;
}
const fakeResolveAdapter = () => ({ NOT_IMPLEMENTED: false });

async function main() {
  await seedBase();

  check('0. FIN11_CARD_COLLECTION_CAP is still exactly 3000 -- the single source of truth', FIN11_CARD_COLLECTION_CAP === 3000);

  // === Test A: the exact conflict -- a Statement in the ₪3,000-3,540 band,
  // legacy-routed to card (total_due <= 3540, the OLD threshold) =====
  const eA = await makeEntity('ZZZ_TEST_cardcap_band');
  await makePaymentInstrument(eA);
  const baA = await makeBillingAccount(eA);
  const sA = await makeStatement(baA, 3300); // between 3000 and 3540
  const openedA = await openAttempt(sA, fakeResolveAdapter);
  check('A1. the legacy manual path still opens a card attempt for this Statement (still <= 3,540, unrelated routing behavior unchanged)', openedA.skipped === false && openedA.method === 'card', JSON.stringify(openedA));
  check('A2. the requested amount is capped at ₪3,000, NOT the full ₪3,300 outstanding -- the actual fix', openedA.requestedAmount === 3000, `requestedAmount=${openedA.requestedAmount}`);
  const rowA = await pool.query(`SELECT requested_amount FROM collection_attempts WHERE id = $1`, [openedA.attemptId]);
  check('A3. the capped amount is what was actually written to collection_attempts (what the real charge call would use)', Number(rowA.rows[0].requested_amount) === 3000, rowA.rows[0].requested_amount);

  // === Test B: below the cap -- unchanged, no cap applied (regression) ===
  const eB = await makeEntity('ZZZ_TEST_cardcap_below');
  await makePaymentInstrument(eB);
  const baB = await makeBillingAccount(eB);
  const sB = await makeStatement(baB, 1200);
  const openedB = await openAttempt(sB, fakeResolveAdapter);
  check('B1. a Statement below the cap still requests its full outstanding (1200) -- unrelated historical behavior unchanged', openedB.requestedAmount === 1200, `requestedAmount=${openedB.requestedAmount}`);

  // === Test C: MASAV is NOT capped -- it legitimately requests the full residual ===
  const eC = await makeEntity('ZZZ_TEST_cardcap_masav_uncapped');
  const baC = await makeBillingAccount(eC);
  await pool.query(`UPDATE billing_accounts SET preferred_collection_method = 'masav' WHERE id = $1`, [baC]);
  await pool.query(
    `INSERT INTO entity_masav_details (entity_id, bank_code, branch_code, account_number, authorized, authorized_by, authorized_at)
     VALUES ($1,'12','345','6789012',true,$2,NOW())`,
    [eC, userId]
  );
  const sC = await makeStatement(baC, 5000); // above the 3,540 threshold -> masav-routed
  const openedC = await openMasavAttempt(sC);
  check('C1. a masav-routed Statement opens successfully', openedC.skipped === false, JSON.stringify(openedC));
  const rowC = await pool.query(`SELECT requested_amount FROM collection_attempts WHERE id = $1`, [openedC.attemptId]);
  check('C2. MASAV requests the FULL outstanding (5000), never capped at 3,000 -- the cap is a card-only rule', Number(rowC.rows[0].requested_amount) === 5000, rowC.rows[0].requested_amount);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) console.log('FAILURES:', failed);

  await pool.end();
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
