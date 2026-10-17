// FIN-11 Stage 4 — card collection orchestration + scheduling.
// docs/finance/FIN11_STAGE4_TECHNICAL_DESIGN.md has the full design.
//
// Methodology: migrations 073/074 are already applied for real on this DB
// (2026-10-17) -- no in-transaction DDL bootstrap is needed (unlike the
// earlier Stage 2B/3 test files, written before that was true).
//
// Two fixture styles, matching which write each test needs -- the exact
// same split test-fin11-stage2b-resolve.js/test-fin11-stage3-masav-proposal.js
// already established, for the exact same reason:
//   - PART 1: REAL, committed-then-deleted fixtures (entities/accounts/
//     entity_billing/statements/collection_attempts -- none append-only) +
//     the REAL exported functions, for every test whose adapter outcome is
//     declined/technical_failure/ambiguous. None of those write a
//     `payments` row, so cleanup is always complete. (An earlier version of
//     this file DID let a 'succeeded' outcome run against real committed
//     fixtures -- payments blocks DELETE, so that created one permanent
//     test row; see FIN11_IMPLEMENTATION_STATUS.md's incident note. Fixed
//     here by moving every 'succeeded'/overpayment scenario to Part 2.)
//   - PART 2: ONE BEGIN...ROLLBACK transaction with LOCAL MIRRORS of
//     openFin11CappedCardAttempt and resolveAttempt (both open their own
//     real pool.connect() in production code and so cannot see this
//     script's own uncommitted fixtures) -- the only safe way to exercise
//     a 'succeeded' outcome or an overpayment (statement_adjustments is
//     also append-only) without creating anything permanent.
//
// Run: node scripts/test-fin11-stage4-orchestration.js
require('dotenv').config();
const pool = require('../src/db/db');
const { ACTIONABLE_STATEMENT_STATUSES } = require('../src/modules/collection-engine/collection.service');
const {
  openFin11CappedCardAttempt,
  runFin11CardCollectionCycle,
  collectWithRetries,
  MAX_CARD_ATTEMPTS,
} = require('../src/modules/billing-engine/fin11-card-collection.service');
const cardCollectionJob = require('../src/jobs/fin11-card-collection.job');
const retrySweepJob = require('../src/jobs/fin11-card-retry-sweep.job');
const masavPrepareJob = require('../src/jobs/fin11-masav-prepare.job');
const { hasOpenCollectionHold } = require('../src/modules/billing-engine/payment-exceptions.service');
const { getStatementBalance } = require('../src/modules/billing-engine/statement-balance.service');
const { resolveSelectedMonthBoundary } = require('../src/modules/billing-engine/billing-period.util');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

function fakeAdapter(outcomes) {
  let i = 0;
  return {
    charge: async () => {
      const o = outcomes[Math.min(i, outcomes.length - 1)];
      i++;
      return typeof o === 'function' ? o() : o;
    },
  };
}

// =============================================================================
// PART 1 — real committed fixtures, real functions, confirmed-failure/
// ambiguous outcomes only (never 'succeeded' -- never writes `payments`).
// =============================================================================
async function part1() {
  const setup = await pool.connect();
  let userId;
  let m = 0;
  let periodCounter = 0;
  const periodIds = new Map();
  const createdEntityIds = [];
  const createdAccountIds = [];
  const createdStatementIds = [];
  const createdRunIds = [];
  const createdBillingIds = [];

  async function getPeriod(start, end) {
    const key = `${start.toISOString()}|${end.toISOString()}`;
    if (periodIds.has(key)) return periodIds.get(key);
    const r = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
    periodIds.set(key, r.rows[0].id);
    return r.rows[0].id;
  }
  async function makeEntity() {
    m++;
    const e = await setup.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_fin11_stage4_${m}_${Date.now()}`, userId]);
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
    periodCounter++;
    const offset = periodCounter * 4;
    const start = new Date(Date.UTC(2211, 0, 1 + offset));
    const end = new Date(Date.UTC(2211, 0, 2 + offset));
    const periodId = await getPeriod(start, end);
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

  try {
    const userRes = await setup.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    userId = userRes.rows[0].id;

    // --- 1. Capped at FIN11_CARD_COLLECTION_CAP, not full outstanding ----
    const e1 = await makeEntity();
    await makePaymentInstrument(e1.entityId);
    const s1 = await makeStatement(e1.accountId, 5000);
    const opened1 = await openFin11CappedCardAttempt(s1);
    check('1. openFin11CappedCardAttempt caps requestedAmount at 3000 when outstanding (5000) exceeds the cap', opened1.skipped === false && opened1.requestedAmount === 3000, JSON.stringify(opened1));

    // --- 2. No cap applied when outstanding is below the cap ------------
    const e2 = await makeEntity();
    await makePaymentInstrument(e2.entityId);
    const s2 = await makeStatement(e2.accountId, 1200);
    const opened2 = await openFin11CappedCardAttempt(s2);
    check('2. requestedAmount equals the full outstanding (1200) when it is below the cap', opened2.skipped === false && opened2.requestedAmount === 1200, JSON.stringify(opened2));

    // --- 3. Confirmed failure (declined) -> retried; ambiguous -> NOT retried, loop stops ---
    const e3 = await makeEntity();
    await makePaymentInstrument(e3.entityId);
    const s3 = await makeStatement(e3.accountId, 1000);
    const adapter3 = fakeAdapter([
      { outcome: 'declined', failureReason: 'insufficient_funds' },
      { outcome: 'ambiguous', failureReason: 'transport_timeout' },
    ]);
    const cycles3 = await collectWithRetries(s3, () => adapter3);
    check('3. first confirmed decline is retried (2 cycles attempted)', cycles3.length === 2, JSON.stringify(cycles3.map(c => c.resolved?.outcome || c.reason)));
    check('3a. loop stops after an AMBIGUOUS outcome -- never retried blind', cycles3[1].resolved?.outcome === 'ambiguous', JSON.stringify(cycles3[1]));
    check('3b. exactly 2 collection_attempts rows exist for this statement (no extra retry attempted)', (await setup.query(`SELECT COUNT(*) FROM collection_attempts WHERE statement_id=$1`, [s3])).rows[0].count === '2');

    // --- 4. 3 confirmed failures in a row -> exhausted, Super Admin finding, no 4th attempt ---
    const e4 = await makeEntity();
    await makePaymentInstrument(e4.entityId);
    const s4 = await makeStatement(e4.accountId, 1000);
    const adapter4 = fakeAdapter([
      { outcome: 'declined', failureReason: 'd1' },
      { outcome: 'technical_failure', failureReason: 'd2' },
      { outcome: 'declined', failureReason: 'd3' },
    ]);
    const cycles4 = await collectWithRetries(s4, () => adapter4);
    check('4. exactly 3 real confirmed-failure charge cycles, plus 1 trailing no-charge exhaustion check (4 total)', cycles4.length === MAX_CARD_ATTEMPTS + 1, JSON.stringify(cycles4.length));
    check('4a. the first 3 were actual charge cycles; the trailing 4th is a skip, never a 4th charge', cycles4.slice(0, 3).every(c => c.skipped === false) && cycles4[3].skipped === true && cycles4[3].reason === 'max_attempts_reached', JSON.stringify(cycles4));
    const attemptsCount4 = (await setup.query(`SELECT COUNT(*) FROM collection_attempts WHERE statement_id=$1`, [s4])).rows[0].count;
    check('4b. exactly 3 collection_attempts rows exist -- never a 4th, despite the 4th loop pass', attemptsCount4 === '3', attemptsCount4);
    const afterExhaustion4 = await openFin11CappedCardAttempt(s4);
    check('4c. a further call after exhaustion is ALSO skipped (max_attempts_reached), not a 4th attempt -- idempotent/no-duplicate', afterExhaustion4.skipped === true && afterExhaustion4.reason === 'max_attempts_reached', JSON.stringify(afterExhaustion4));
    const finding4 = await setup.query(`SELECT * FROM reconciliation_findings WHERE job_name='fin11-card-collection' AND finding_type='fin11_card_attempts_exhausted' AND subject_id=$1`, [s4]);
    check('4d. the Super Admin alert was recorded exactly once (by collectWithRetries\' own trailing pass, not duplicated by the extra manual call above)', finding4.rows.length === 1, JSON.stringify(finding4.rows[0]));

    // --- 5. fin11-card-collection.job.js targets the right period/statements, ignores others ---
    const e5 = await makeEntity();
    await makePaymentInstrument(e5.entityId);
    const targetYear = 2112, targetMonth = 3;
    const { periodStart: tStart, periodEnd: tEnd } = await resolveSelectedMonthBoundary(setup, targetYear, targetMonth);
    const tPeriod = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [tStart, tEnd]);
    const tPeriodId = tPeriod.rows[0].id;
    periodIds.set(`${tStart.toISOString()}|${tEnd.toISOString()}`, tPeriodId);
    const tRun = await setup.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [tPeriodId]);
    createdRunIds.push(tRun.rows[0].id);
    const s5 = await setup.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,900,'approved') RETURNING id`,
      [e5.accountId, tPeriodId, tRun.rows[0].id, (900 / 1.18).toFixed(2), (900 - 900 / 1.18).toFixed(2)]
    );
    createdStatementIds.push(s5.rows[0].id);
    const jobNow = new Date(tEnd.getTime() + 60 * 60 * 1000); // 1 hour after the real cutoff instant
    const adapter5 = fakeAdapter([{ outcome: 'technical_failure', failureReason: 'd' }]); // never succeeds -- exhausts after 3, never writes `payments`
    const jobResult5 = await cardCollectionJob.handler(setup, { now: jobNow, resolveAdapter: () => adapter5 });
    check('5. job targets exactly the one statement in the correct (just-closed) period', jobResult5.statementsConsidered === 1 && jobResult5.confirmedFailureExhausted === 1, JSON.stringify(jobResult5));
    check('5a. job result references the correct period id', jobResult5.periodId === tPeriodId, jobResult5.periodId);

    // --- 6. fin11-card-retry-sweep.job.js: candidate detection, confirmed-only ---
    const candidates6 = await retrySweepJob.findRetryCandidates(setup);
    check('6. retry sweep does NOT find s3 (last attempt=ambiguous -- confirmed-only policy)', !candidates6.includes(s3), JSON.stringify({ s3, candidates6 }));
    check('6a. retry sweep does NOT find s4/s5 (both already exhausted at 3 attempts)', !candidates6.includes(s4) && !candidates6.includes(s5));

    const e6 = await makeEntity();
    await makePaymentInstrument(e6.entityId);
    const s6 = await makeStatement(e6.accountId, 1000);
    await runFin11CardCollectionCycle(s6, () => fakeAdapter([{ outcome: 'declined', failureReason: 'd' }]));
    const candidates6b = await retrySweepJob.findRetryCandidates(setup);
    check('6b. a statement with exactly 1 confirmed-failed attempt (budget remaining) IS a retry candidate', candidates6b.includes(s6), JSON.stringify(candidates6b));
    // The fake adapter keeps confirming failures -- collectWithRetries (same
    // function the sweep calls) correctly keeps retrying immediately, up to
    // the real 3-attempt cap, since CardCom is synchronous and a confirmed
    // failure is known right away (no documented minimum spacing between
    // attempts, only the 3-total cap -- see fin11-card-collection.service.js
    // header). So one sweep call on a statement with 1 existing attempt and
    // 2 remaining goes straight to exhaustion, not a single extra attempt.
    const sweepResult6 = await retrySweepJob.handler(setup, { resolveAdapter: () => fakeAdapter([{ outcome: 'technical_failure', failureReason: 'd2' }]) });
    check('6c. retry sweep handler retries the candidate through to exhaustion (3 total, confirmed-only, never a 4th)', sweepResult6.candidatesFound === 1 && sweepResult6.confirmedFailureExhausted === 1, JSON.stringify(sweepResult6));
    const attemptsAfterSweep6 = (await setup.query(`SELECT COUNT(*) FROM collection_attempts WHERE statement_id=$1`, [s6])).rows[0].count;
    check('6d. s6 now has exactly 3 attempts total (1 before the sweep + 2 more from this one sweep call, capped, never a 4th)', attemptsAfterSweep6 === '3', attemptsAfterSweep6);

    return { createdEntityIds, createdAccountIds, createdStatementIds, createdRunIds, createdBillingIds, periodIds, userId };
  } finally {
    // Cleanup -- none of these tables is append-only, and no `payments`
    // row was ever created in this part (every outcome used here is
    // declined/technical_failure/ambiguous).
    await setup.query(`DELETE FROM reconciliation_findings WHERE subject_id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM collection_attempts WHERE statement_id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM statements WHERE id = ANY($1::uuid[])`, [createdStatementIds]).catch(() => {});
    await setup.query(`DELETE FROM billing_runs WHERE id = ANY($1::uuid[])`, [createdRunIds]).catch(() => {});
    await setup.query(`DELETE FROM entity_billing WHERE id = ANY($1::uuid[])`, [createdBillingIds]).catch(() => {});
    await setup.query(`DELETE FROM billing_accounts WHERE id = ANY($1::uuid[])`, [createdAccountIds]).catch(() => {});
    await setup.query(`DELETE FROM entities WHERE id = ANY($1::uuid[])`, [createdEntityIds]).catch(() => {});
    for (const periodId of periodIds.values()) {
      await setup.query(`DELETE FROM billing_periods WHERE id = $1`, [periodId]).catch(() => {});
    }
    setup.release();
  }
}

// =============================================================================
// PART 2 — ONE BEGIN...ROLLBACK transaction, local mirrors of
// openFin11CappedCardAttempt + resolveAttempt (both open their own
// connection in production, so cannot see this transaction's fixtures).
// Covers 'succeeded' and overpayment -- the two scenarios that would
// otherwise write an append-only payments/statement_adjustments row.
// =============================================================================
async function openFin11CappedCardAttemptCore(client, statementId) {
  const stmtRes = await client.query(`SELECT s.*, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE s.id=$1 FOR UPDATE OF s`, [statementId]);
  const statement = stmtRes.rows[0];
  const hold = await hasOpenCollectionHold(statement.entity_id, client);
  if (hold.held) return { skipped: true, reason: 'entity_collection_held', exceptionId: hold.exceptionId };
  if (!ACTIONABLE_STATEMENT_STATUSES.includes(statement.status)) return { skipped: true, reason: 'not_actionable', status: statement.status };
  const activeRes = await client.query(`SELECT id FROM collection_attempts WHERE statement_id=$1 AND status = ANY($2::text[])`, [statementId, ['pending', 'ambiguous']]);
  if (activeRes.rows[0]) return { skipped: true, reason: 'attempt_already_active', attemptId: activeRes.rows[0].id };
  const attemptsRes = await client.query(`SELECT status FROM collection_attempts WHERE statement_id=$1 AND collection_method='card' ORDER BY attempt_number DESC`, [statementId]);
  if (attemptsRes.rows.length > 0) {
    const latest = attemptsRes.rows[0].status;
    if (!['declined', 'technical_failure'].includes(latest)) return { skipped: true, reason: 'latest_attempt_not_a_confirmed_failure', latestStatus: latest };
    if (attemptsRes.rows.length >= MAX_CARD_ATTEMPTS) return { skipped: true, reason: 'max_attempts_reached', attemptsSoFar: attemptsRes.rows.length };
  }
  const balance = await getStatementBalance(statementId, client);
  const outstanding = Math.round(balance.outstanding * 100) / 100;
  if (outstanding <= 0) return { skipped: true, reason: 'no_outstanding_balance', outstanding };
  // Read via the SAME transaction client, not billingRepository (which
  // hardcodes the global pool and would not see this transaction's own
  // uncommitted entity_billing fixture row).
  const piRes = await client.query(`SELECT id, provider, token, last4, exp_month, exp_year, card_holder_name FROM entity_billing WHERE entity_id=$1 AND is_default=true AND status='active' LIMIT 1`, [statement.entity_id]);
  const paymentInstrument = piRes.rows[0] || null;
  if (!paymentInstrument) return { skipped: true, reason: 'no_active_payment_instrument' };
  const requestedAmount = Math.round(Math.min(outstanding, 3000) * 100) / 100;
  const nextRes = await client.query(`SELECT COALESCE(MAX(attempt_number),0)+1 AS next FROM collection_attempts WHERE statement_id=$1`, [statementId]);
  const attemptNumber = nextRes.rows[0].next;
  const insertRes = await client.query(`INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount) VALUES ($1,'card',$2,$3) RETURNING id`, [statementId, attemptNumber, requestedAmount]);
  if (statement.status === 'approved') await client.query(`UPDATE statements SET status='open' WHERE id=$1`, [statementId]);
  return { skipped: false, attemptId: insertRes.rows[0].id, attemptNumber, requestedAmount, entityId: statement.entity_id, paymentInstrument };
}

// Verbatim mirror of collection.service.js#resolveAttempt's current logic
// (same precedent as test-fin11-stage2b-resolve.js's own resolveAttemptCore).
async function resolveAttemptCore(client, attemptId, statementId, outcome) {
  const stmtRes = await client.query(`SELECT s.id, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE s.id=$1 FOR UPDATE OF s`, [statementId]);
  const statement = stmtRes.rows[0];

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
      [statementId, attemptId, collectedAmount, attempt.provider || 'cardcom', outcome.providerReference]
    );

    const overpaymentAmount = Math.max(0, collectedAmount - outstandingBeforePayment);
    if (overpaymentAmount > 0) {
      const paymentIdRes = await client.query(`SELECT id FROM payments WHERE collection_attempt_id = $1`, [attemptId]);
      const exceptionRes = await client.query(
        `INSERT INTO payment_exceptions (statement_id, collection_attempt_id, payment_id, entity_id, outstanding_before, collected_amount, overpayment_amount)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [statementId, attemptId, paymentIdRes.rows[0].id, statement.entity_id, outstandingBeforePayment, collectedAmount, overpaymentAmount]
      );
      overpayment = { exceptionId: exceptionRes.rows[0].id, overpaymentAmount, collectedAmount, outstandingBeforePayment };
    }

    const balanceAfterPayment = await getStatementBalance(statementId, client);
    if (balanceAfterPayment.collected >= balanceAfterPayment.adjustedTotal) {
      await client.query(`UPDATE statements SET status = 'paid' WHERE id = $1`, [statementId]);
      statementStatus = 'paid';
    }
  }
  return { attemptId, outcome: outcome.outcome, statementStatus, overpayment };
}

async function part2() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    let m = 0;
    let periodCounter = 0;
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
      const e = await client.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_fin11_stage4_p2_${m}_${Date.now()}`, userId]);
      const ba = await client.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [e.rows[0].id]);
      await client.query(`INSERT INTO entity_billing (entity_id, provider, token, last4, exp_month, exp_year, card_holder_name, is_default, status) VALUES ($1,'cardcom','tok-zzz-test','4242',12,2030,'ZZZ Test',true,'active')`, [e.rows[0].id]);
      return { entityId: e.rows[0].id, accountId: ba.rows[0].id };
    }
    async function makeStatement(accountId, totalDue, status = 'approved') {
      periodCounter++;
      const offset = periodCounter * 4;
      const start = new Date(Date.UTC(2113, 0, 1 + offset));
      const end = new Date(Date.UTC(2113, 0, 2 + offset));
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

    // --- 7. Success stops after exactly 1 cycle, flips statement to paid, records the CAPPED amount ---
    const e7 = await makeEntity();
    const s7 = await makeStatement(e7.accountId, 800); // below cap -- full outstanding collected in one go
    const opened7 = await openFin11CappedCardAttemptCore(client, s7);
    check('7. setup: capped attempt opened for the full (below-cap) outstanding', opened7.skipped === false && opened7.requestedAmount === 800, JSON.stringify(opened7));
    const resolved7 = await resolveAttemptCore(client, opened7.attemptId, s7, { outcome: 'succeeded', providerReference: 'tx-7' });
    check('7a. resolveAttempt flips the Statement to paid, no overpayment', resolved7.statementStatus === 'paid' && resolved7.overpayment === null, JSON.stringify(resolved7));
    const payRow7 = await client.query(`SELECT amount FROM payments WHERE collection_attempt_id=$1`, [opened7.attemptId]);
    check('7b. the recorded payment amount equals the CAPPED requested amount (800), not a different number', Number(payRow7.rows[0].amount) === 800, payRow7.rows[0].amount);

    // --- 8. Re-run after success is idempotent -- no second attempt, no duplicate charge ---
    const rerun8 = await openFin11CappedCardAttemptCore(client, s7);
    check('8. re-running after a successful collection is skipped (not_actionable -- already paid), never a duplicate charge', rerun8.skipped === true && rerun8.reason === 'not_actionable', JSON.stringify(rerun8));

    // --- 9. Capped collection overpays when a late credit adjustment shrinks the balance afterward ---
    const e9 = await makeEntity();
    const s9a = await makeStatement(e9.accountId, 3000); // == cap, so requestedAmount will be exactly 3000
    const s9b = await makeStatement(e9.accountId, 500); // a DIFFERENT statement of the SAME entity
    const opened9 = await openFin11CappedCardAttemptCore(client, s9a);
    check('9. setup: capped attempt opened at exactly 3000 (== outstanding == cap)', opened9.requestedAmount === 3000, JSON.stringify(opened9));
    // Late credit adjustment arrives between open and resolve (same scenario
    // Stage 2B/3 already proved for the uncapped path) -- direct INSERT,
    // same as the real applyStatementAdjustment would write, bypassing only
    // its ADJUSTABLE_STATEMENT_STATUSES guard (irrelevant to what THIS test
    // verifies: resolveAttempt's own overpayment detection on a capped
    // amount) and its real transaction (this one already holds the lock).
    await client.query(`INSERT INTO statement_adjustments (statement_id, delta_amount, reason, created_by_user_id) VALUES ($1,-2000,'ZZZ_TEST late credit, stage4 overpayment test',$2)`, [s9a, userId]);
    const resolved9 = await resolveAttemptCore(client, opened9.attemptId, s9a, { outcome: 'succeeded', providerReference: 'tx-9' });
    check('9a. the full 3000 is recorded, never clamped, and a 2000 overpayment is correctly detected (3000 collected - 1000 now-adjusted outstanding)', resolved9.overpayment && resolved9.overpayment.overpaymentAmount === 2000 && resolved9.overpayment.collectedAmount === 3000, JSON.stringify(resolved9));

    const hold9b = await openFin11CappedCardAttemptCore(client, s9b);
    check('9b. a DIFFERENT statement of the SAME (now overpaid) entity is held from a new capped attempt', hold9b.skipped === true && hold9b.reason === 'entity_collection_held' && hold9b.exceptionId === resolved9.overpayment.exceptionId, JSON.stringify(hold9b));

    const e9c = await makeEntity();
    const s9c = await makeStatement(e9c.accountId, 500);
    const unrelated9c = await openFin11CappedCardAttemptCore(client, s9c);
    check('9c. an UNRELATED entity is NOT affected by e9\'s overpayment hold', unrelated9c.skipped === false, JSON.stringify(unrelated9c));

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// PART 3 — pure-logic / lightweight DB-read tests, no fixtures needed.
// =============================================================================
async function part3() {
  // --- 10. previousIsraelYearMonth -- timezone-safety reuse, no new date math invented ---
  const novSixUtc = new Date('2026-11-06T10:00:00.000Z'); // well inside Israel day 6 regardless of DST
  const prevYM = masavPrepareJob.previousIsraelYearMonth(novSixUtc);
  check('10. previousIsraelYearMonth(Nov 6) resolves to October (the month whose 28th-cutoff this complements)', prevYM.year === 2026 && prevYM.month === 10, JSON.stringify(prevYM));
  const janSixUtc = new Date('2027-01-06T10:00:00.000Z');
  const prevYM2 = masavPrepareJob.previousIsraelYearMonth(janSixUtc);
  check('10a. year-boundary case: previousIsraelYearMonth(Jan 6) resolves to December of the PREVIOUS year', prevYM2.year === 2026 && prevYM2.month === 12, JSON.stringify(prevYM2));

  // --- 11. fin11-masav-prepare.job.js targets the correct prior-month period (no fixtures -- period_not_found is itself a valid, checkable outcome) ---
  const farFutureNow = new Date(Date.UTC(2114, 1, 6, 10, 0, 0)); // Feb 6, 2114 -- a period that was never created anywhere
  const masavResult11 = await masavPrepareJob.handler(pool, { now: farFutureNow });
  check('11. masav-prepare job correctly reports period_not_found for a period nothing ever created (never silently proposes against the wrong period)', masavResult11.reason === 'period_not_found' && masavResult11.statementsConsidered === 0, JSON.stringify(masavResult11));
}

async function main() {
  await part1();
  await part2();
  await part3();
}

main()
  .then(async () => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) console.log('FAILURES:', failed);
    const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_fin11_stage4%'`);
    console.log('\nPost-run verification -- leftover ZZZ_TEST_fin11_stage4 entities:', leftover.rows[0].count);
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch(async (err) => {
    console.error('FATAL:', err);
    const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_fin11_stage4%'`).catch(() => null);
    if (leftover) console.log('leftover ZZZ_TEST_fin11_stage4 entities at time of failure:', leftover.rows[0].count);
    process.exit(1);
  });
