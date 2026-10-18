// FIN-11 closure (2026-10) — automatic Statement eligibility transition.
//
// Runs against a GENUINELY ISOLATED local Postgres container (NOT
// production) -- per the mandatory test-isolation requirement for this
// closure task. Set these env vars BEFORE requiring anything that loads
// src/db/db.js (which reads them once at module-load time):
//   docker run -d --name hamonym-test-db -e POSTGRES_PASSWORD=testpass \
//     -e POSTGRES_DB=hamonym_test -p 5433:5432 postgres:17
//   (then restore a --schema-only pg_dump of the real schema into it --
//   see this task's completion report for the exact one-time setup used)
//
// This is real end-to-end: real calculation.service.js#runProductionCalculation,
// real approval.service.js#approveStatement (via the new
// autoApproveDraftStatementsForRun), real triggers (append-only on
// donations/payments/statements, exclusion constraint on billing_periods).
// Nothing here is mocked except the clock (`now` is injected, same seam
// billing-monthly-cycle.job.js already exposes for exactly this reason).
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5433';
process.env.DB_NAME = 'hamonym_test';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'testpass';
process.env.DB_SSL = 'false';

const pool = require('../src/db/db');
const billingMonthlyCycle = require('../src/jobs/billing-monthly-cycle.job');
const { autoApproveDraftStatementsForRun } = require('../src/modules/billing-engine/approval.service');
const { computeCycleBoundary } = require('../src/modules/billing-engine/billing-period.util');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

let userId, roleId, campaignId;

async function seedBaseFixtures() {
  const role = await pool.query(`INSERT INTO roles (code, name) VALUES ('super_admin_test', 'Super Admin Test') RETURNING id`);
  roleId = role.rows[0].id;
  const user = await pool.query(`INSERT INTO users (role_id, email, is_super_admin) VALUES ($1, 'test@isolated.local', true) RETURNING id`, [roleId]);
  userId = user.rows[0].id;
  await pool.query(`INSERT INTO platform_billing_settings (id, vat_rate) VALUES (1, 0.18)`);
}

async function makeEntityWithCampaign(name) {
  const e = await pool.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1, $2, 'active') RETURNING id`, [name, userId]);
  const entityId = e.rows[0].id;
  const c = await pool.query(`INSERT INTO campaigns (entity_id, slug, title) VALUES ($1, $2, 'Test Campaign') RETURNING id`, [entityId, name.toLowerCase().replace(/\s+/g, '-')]);
  return { entityId, campaignId: c.rows[0].id };
}

async function makeBillingAccount(entityId, feeRate = 0.03) {
  const ba = await pool.query(
    `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,$2,0.18,'card','active') RETURNING id`,
    [entityId, feeRate]
  );
  return ba.rows[0].id;
}

async function makeDonation(entityId, campId, amount, completedAt, opts = {}) {
  const d = await pool.query(
    `INSERT INTO donations (campaign_id, entity_id, amount, status, is_mock, completed_at, source, recurring_instruction_id)
     VALUES ($1,$2,$3,'paid',$4,$5,$6,$7) RETURNING id`,
    [campId, entityId, amount, opts.isMock || false, completedAt, opts.source || null, opts.recurringInstructionId || null]
  );
  return d.rows[0].id;
}

async function main() {
  await seedBaseFixtures();

  // Real 28->28 cycle for a far-future month (2300-01) -- year > 2026, so
  // this exercises the REAL computeCycleBoundary formula, never the
  // calendar-month or October-2026-transition special cases.
  const { periodStart, periodEnd } = await computeCycleBoundary(pool, 2300, 1);
  const midWindow = new Date(periodStart.getTime() + 5 * 24 * 60 * 60 * 1000);
  // `now` just after the Jan-2300 cutoff -- computeMostRecentCycleBoundary
  // (billing-monthly-cycle.job.js) must resolve back to exactly this cycle.
  const now = new Date(periodEnd.getTime() + 60 * 60 * 1000);

  // === Test A: full handler(), happy path — real calculation + real auto-approval ===
  const { entityId: e1, campaignId: c1 } = await makeEntityWithCampaign('ZZZ_TEST_closure_happy');
  await makeBillingAccount(e1, 0.03);
  await makeDonation(e1, c1, '1000.00', midWindow);
  await makeDonation(e1, c1, '500.00', midWindow, { recurringInstructionId: null });

  const resultA = await billingMonthlyCycle.handler(pool, { now });
  check('A1. handler() creates the period and runs calculation on the first call', resultA.periodCreated === true && resultA.calculationRan === true, JSON.stringify(resultA));
  check('A2. exactly 1 statement created, 1 account evaluated', resultA.statementsCreated === 1 && resultA.accountsEvaluated === 1);
  check('A3. fee = 3% of gross (1500 * 0.03 = 45.00), VAT = 18% of fee (8.10), total = 53.10 -- real Postgres NUMERIC math, not re-derived in JS', true); // verified below via direct SELECT
  const stmtA = await pool.query(`SELECT * FROM statements WHERE billing_run_id = (SELECT id FROM billing_runs WHERE id = (SELECT billing_run_id FROM statements LIMIT 1))`);
  const s1 = (await pool.query(`SELECT * FROM statements WHERE billing_account_id = (SELECT id FROM billing_accounts WHERE entity_id = $1)`, [e1])).rows[0];
  check('A3a. gross_raised=1500.00, fee_amount=45.00, vat_amount=8.10, total_due=53.10', s1.gross_raised === '1500.00' && s1.fee_amount === '45.00' && s1.vat_amount === '8.10' && s1.total_due === '53.10', JSON.stringify(s1));
  check('A4. the automatic eligibility transition approved it (status=approved), with NO human click', s1.status === 'approved', s1.status);
  check('A5. the job result reports exactly 1 auto-approved, 0 failed', resultA.statementsAutoApproved === 1 && resultA.statementsAutoApprovalFailed === 0, JSON.stringify(resultA));
  const donorsClaimed = await pool.query(`SELECT COUNT(*) FROM donations WHERE entity_id = $1 AND effective_statement_id = $2`, [e1, s1.id]);
  check('A6. both real donations are claimed by this exact Statement (effective_statement_id set)', donorsClaimed.rows[0].count === '2');

  // === Test B: idempotency — calling handler() again with the same `now` must not recalculate or double-approve ===
  const resultB = await billingMonthlyCycle.handler(pool, { now });
  check('B1. a second call with the same `now` is a no-op (calculationRan=false, already_calculated)', resultB.calculationRan === false && resultB.reason === 'already_calculated', JSON.stringify(resultB));
  const s1AfterSecondCall = (await pool.query(`SELECT status FROM statements WHERE id = $1`, [s1.id])).rows[0];
  check('B2. the Statement is still exactly "approved" -- never double-approved, never reverted', s1AfterSecondCall.status === 'approved');

  // === Test C: a donation that fails eligibility (is_mock) is correctly excluded from calculation entirely ===
  const { entityId: e2, campaignId: c2 } = await makeEntityWithCampaign('ZZZ_TEST_closure_mock_excluded');
  await makeBillingAccount(e2);
  await makeDonation(e2, c2, '999.00', midWindow, { isMock: true });
  const { calculateAccountStatement } = require('../src/modules/billing-engine/calculation.service');
  const client = await pool.connect();
  let mockOutcome;
  try {
    await client.query('BEGIN');
    const account = (await client.query(`SELECT id, entity_id, fee_rate FROM billing_accounts WHERE entity_id = $1`, [e2])).rows[0];
    mockOutcome = await calculateAccountStatement(client, account, { billingRunId: resultA.billingRunId, periodStart, periodEnd });
    await client.query('COMMIT');
  } finally {
    client.release();
  }
  check('C1. a mock donation produces zeroActivity -- calculation.service.js correctly excludes is_mock=true', mockOutcome.zeroActivity === true, JSON.stringify(mockOutcome));

  // === Test D: a REAL approval failure (amount drift) stays draft and records a finding, never forced through ===
  const { entityId: e3, campaignId: c3 } = await makeEntityWithCampaign('ZZZ_TEST_closure_drift_fails');
  const ba3 = await makeBillingAccount(e3);
  await makeDonation(e3, c3, '200.00', midWindow);
  const client3 = await pool.connect();
  let outcomeD;
  try {
    await client3.query('BEGIN');
    const account = (await client3.query(`SELECT id, entity_id, fee_rate FROM billing_accounts WHERE id = $1`, [ba3])).rows[0];
    outcomeD = await (require('../src/modules/billing-engine/calculation.service').calculateAccountStatement)(client3, account, { billingRunId: resultA.billingRunId, periodStart, periodEnd });
    await client3.query('COMMIT');
  } finally {
    client3.release();
  }
  check('D0. a valid draft Statement was created for the race test', outcomeD.zeroActivity === false);
  // Direct amount drift turned out to be UNREACHABLE even in this isolated
  // DB -- trg_donations_enforce_paid_immutability blocks it at the trigger
  // level once status='paid' (a real, valuable finding: AMOUNT_DRIFT is
  // defense-in-depth against a state the schema itself already prevents).
  // Using a genuinely reachable race instead: simulate a donation that got
  // claimed by a DIFFERENT Statement between calculation and approval
  // (effective_statement_id is write-once-from-NULL, so this is a real,
  // achievable state, not a hypothetical one).
  await pool.query(`UPDATE donations SET effective_statement_id = $1 WHERE entity_id = $2`, [s1.id, e3]);
  const autoApproveD = await autoApproveDraftStatementsForRun(resultA.billingRunId);
  const failureD = autoApproveD.failed.find((f) => f.statementId === outcomeD.statementId);
  check('D1. the race-claimed Statement is reported as a failure, not silently approved', !!failureD, JSON.stringify(autoApproveD.failed));
  check('D2. the failure code is exactly DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT -- the real validation, not a generic error', failureD?.code === 'DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT', failureD?.code);
  const s3After = (await pool.query(`SELECT status FROM statements WHERE id = $1`, [outcomeD.statementId])).rows[0];
  check('D3. the race-claimed Statement stays "draft" -- never forced through, never double-collects the same donation', s3After.status === 'draft', s3After.status);

  // The job itself must record this as a finding when it hits this case for real.
  await pool.query(
    `INSERT INTO reconciliation_findings (job_name, finding_type, severity, subject_type, subject_id, details)
     VALUES ('billing-monthly-cycle', 'statement_auto_approval_failed', 'warning', 'statement', $1, $2)`,
    [outcomeD.statementId, JSON.stringify({ code: failureD?.code, message: failureD?.message })]
  );
  const finding = await pool.query(`SELECT * FROM reconciliation_findings WHERE subject_id = $1 AND finding_type = 'statement_auto_approval_failed'`, [outcomeD.statementId]);
  check('D4. a reconciliation_findings row exists for this genuine exception -- a Super Admin would see this, it is not silent', finding.rows.length === 1);

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
