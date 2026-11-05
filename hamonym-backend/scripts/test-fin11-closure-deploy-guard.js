// FIN-11 controlled production deployment (2026-10) -- proves the
// deployment-safety guard itself: with FIN11_AUTO_APPROVAL_ENABLED left
// UNSET (the real state in every environment until someone deliberately
// sets it in Render), billing-monthly-cycle.job.js's handler must behave
// BYTE-FOR-BYTE as it did before the auto-approval stage existed --
// create the period, run calculation, and stop. This is the exact claim
// "deploying this commit does not itself activate automatic Statement
// approval" -- tested, not asserted.
//
// Runs against the genuinely isolated local Postgres container (see
// test-fin11-closure-autoapproval.js's header for setup). Deliberately
// does NOT set FIN11_AUTO_APPROVAL_ENABLED at all.
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = 'hamonym_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'testpass';
process.env.DB_SSL = 'false';

const pool = require('../src/db/db');
const billingMonthlyCycle = require('../src/jobs/billing-monthly-cycle.job');
const { computeCycleBoundary } = require('../src/modules/billing-engine/billing-period.util');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

let userId;

async function seedBase() {
  const role = await pool.query(`INSERT INTO roles (code, name) VALUES ('t_role_guard', 'T') RETURNING id`);
  const user = await pool.query(`INSERT INTO users (role_id, email, is_super_admin) VALUES ($1,'guard@isolated.local',true) RETURNING id`, [role.rows[0].id]);
  userId = user.rows[0].id;
  await pool.query(`INSERT INTO platform_billing_settings (id, vat_rate) VALUES (1, 0.18)`);
}

async function main() {
  check('0. precondition: FIN11_AUTO_APPROVAL_ENABLED is genuinely unset in this process (the real default)', process.env.FIN11_AUTO_APPROVAL_ENABLED === undefined, `value=${process.env.FIN11_AUTO_APPROVAL_ENABLED}`);

  await seedBase();

  const { periodStart, periodEnd } = await computeCycleBoundary(pool, 2301, 1); // a different far-future month than the autoapproval test, to avoid any cross-test period collision
  const midWindow = new Date(periodStart.getTime() + 5 * 24 * 60 * 60 * 1000);
  const now = new Date(periodEnd.getTime() + 60 * 60 * 1000);

  const e = await pool.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ('ZZZ_TEST_deploy_guard', $1, 'active') RETURNING id`, [userId]);
  const entityId = e.rows[0].id;
  const c = await pool.query(`INSERT INTO campaigns (entity_id, slug, title) VALUES ($1, 'deploy-guard-test', 'Test') RETURNING id`, [entityId]);
  const ba = await pool.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
  await pool.query(`INSERT INTO donations (campaign_id, entity_id, amount, status, completed_at) VALUES ($1,$2,'1000.00','paid',$3)`, [c.rows[0].id, entityId, midWindow]);

  const result = await billingMonthlyCycle.handler(pool, { now });

  check('1. calculation still runs normally -- the guard does not disable calculation, only auto-approval', result.calculationRan === true && result.statementsCreated === 1, JSON.stringify(result));
  check('2. the job reports autoApprovalEnabled=false -- visible in job_runs.result_summary for anyone auditing a real run', result.autoApprovalEnabled === false, JSON.stringify(result));
  check('3. zero statements auto-approved, zero failures recorded -- the auto-approval step never ran at all', result.statementsAutoApproved === 0 && result.statementsAutoApprovalFailed === 0, JSON.stringify(result));

  const stmt = (await pool.query(`SELECT status FROM statements WHERE billing_account_id = $1`, [ba.rows[0].id])).rows[0];
  check('4. the real Statement this run created is still "draft" -- NOT auto-approved, exactly the pre-FIN-11-closure behavior', stmt.status === 'draft', stmt.status);

  const donation = (await pool.query(`SELECT effective_statement_id FROM donations WHERE entity_id = $1`, [entityId])).rows[0];
  check('5. the donation is NOT claimed (effective_statement_id still NULL) -- approveStatement() was never called', donation.effective_statement_id === null, JSON.stringify(donation));

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
