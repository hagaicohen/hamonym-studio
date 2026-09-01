// Unit tests for the Billing readiness correction (2026-09-02):
// calculation.service.js's activity-discovery/readiness stages and
// billing-setup-notification.service.js's dedup + admin-resolution, plus a
// proof that the pre-existing Approval-time protection is sufficient to
// prevent duplicate financial consumption from a recalculated period (no
// new backend guard was needed there — see calculation.service.js's own
// header comment on this correction).
//
// Same convention as scripts/test-billing-v1-routing-and-collection.js: no
// test framework, no real DB, no real network. An in-memory fake stands in
// for '../src/db/db' (and, here, also '../src/modules/email/email.service')
// via require.cache override. Deliberately never touches the real database
// — statement_components/payments are append-only and paid donations can
// never be deleted (migration 055's trg_donations_block_paid_delete), so a
// real committed Statement in this codebase can never be cleaned up after a
// test run.
//
// Run: node scripts/test-billing-readiness-calculation.js

const assert = require('assert');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---- in-memory fake for src/db/db (pool) + src/modules/email/email.service ----
function createFakeState() {
  return {
    periods: new Map(),
    runs: new Map(),
    accounts: new Map(),
    donations: new Map(),
    entities: new Map(),
    statements: new Map(),
    components: [],
    setupNotifications: new Map(),
    userEntities: [],
    users: new Map(),
    seq: { run: 1, statement: 1, component: 1, notification: 1 },
  };
}

function buildFakePool(state) {
  async function query(sqlRaw, params = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

    if (sql.startsWith('SELECT period_start, period_end FROM billing_periods')) {
      const p = state.periods.get(params[0]);
      return { rows: p ? [{ ...p }] : [] };
    }

    if (sql.startsWith('INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at)')) {
      const id = `run-${state.seq.run++}`;
      state.runs.set(id, { id, billing_period_id: params[0], result_summary: null });
      return { rows: [{ id }] };
    }

    if (sql.startsWith('SELECT d.entity_id, e.display_name, COUNT(*)::int AS donation_count')) {
      const [start, end] = params;
      const byEntity = new Map();
      for (const d of state.donations.values()) {
        const e = state.entities.get(d.entity_id);
        if (!e || e.status !== 'active') continue;
        if (d.status !== 'paid' || d.is_mock) continue;
        if (!(d.billing_effective_at >= start && d.billing_effective_at < end)) continue;
        if (d.effective_statement_id !== null) continue;
        const cur = byEntity.get(d.entity_id) || { entity_id: d.entity_id, display_name: e.display_name, donation_count: 0, grossNum: 0 };
        cur.donation_count += 1;
        cur.grossNum += Number(d.amount);
        byEntity.set(d.entity_id, cur);
      }
      const rows = [...byEntity.values()].map((r) => ({
        entity_id: r.entity_id, display_name: r.display_name,
        donation_count: r.donation_count, gross_amount: r.grossNum.toFixed(2),
      }));
      return { rows };
    }

    if (sql.startsWith('SELECT id, entity_id, fee_rate, vat_rate FROM billing_accounts')) {
      const rows = [...state.accounts.values()]
        .filter((a) => a.enforcement_status === 'active')
        .map((a) => ({ id: a.id, entity_id: a.entity_id, fee_rate: a.fee_rate, vat_rate: a.vat_rate }));
      return { rows };
    }

    if (sql.startsWith('SELECT id, amount, billing_effective_at, completed_at, recurring_instruction_id, source FROM donations')) {
      const [entityId, start, end] = params;
      const rows = [...state.donations.values()]
        .filter((d) => d.entity_id === entityId && d.status === 'paid' && !d.is_mock
          && d.billing_effective_at >= start && d.billing_effective_at < end
          && d.effective_statement_id === null)
        .sort((a, b) => a.billing_effective_at.localeCompare(b.billing_effective_at))
        .map((d) => ({
          id: d.id, amount: d.amount, billing_effective_at: d.billing_effective_at,
          completed_at: d.completed_at, recurring_instruction_id: d.recurring_instruction_id, source: d.source,
        }));
      return { rows };
    }

    if (sql.startsWith('WITH agg AS')) {
      const [donationIds, feeRate, vatRate] = params;
      const gross = donationIds.reduce((sum, id) => sum + Number(state.donations.get(id).amount), 0);
      const feeAmount = roundMoney(gross * feeRate);
      const vatAmount = roundMoney(feeAmount * vatRate);
      const totalDue = roundMoney(feeAmount + vatAmount);
      return { rows: [{
        gross_raised: gross.toFixed(2), fee_amount: feeAmount.toFixed(2),
        vat_amount: vatAmount.toFixed(2), total_due: totalDue.toFixed(2),
      }] };
    }

    if (sql.startsWith('INSERT INTO statements (')) {
      const id = `stmt-${state.seq.statement++}`;
      const [billingAccountId, billingRunId, grossRaised, feeRate, vatRate, feeAmount, vatAmount, totalDue] = params;
      state.statements.set(id, {
        id, billing_account_id: billingAccountId, billing_run_id: billingRunId,
        gross_raised: grossRaised, fee_rate: feeRate, vat_rate: vatRate,
        fee_amount: feeAmount, vat_amount: vatAmount, total_due: totalDue, status: 'draft',
      });
      return { rows: [{ id }] };
    }

    if (sql.startsWith('INSERT INTO statement_components (')) {
      const id = `comp-${state.seq.component++}`;
      const [statementId, donationId, amountSnapshot] = params;
      state.components.push({ id, statement_id: statementId, donation_id: donationId, amount_snapshot: amountSnapshot });
      return { rows: [{ id }] };
    }

    if (sql.startsWith('SELECT entity_id, enforcement_status FROM billing_accounts')) {
      const ids = params[0];
      const rows = [...state.accounts.values()]
        .filter((a) => ids.includes(a.entity_id))
        .map((a) => ({ entity_id: a.entity_id, enforcement_status: a.enforcement_status }));
      return { rows };
    }

    if (sql.startsWith('INSERT INTO billing_setup_notifications')) {
      const [entityId, billingPeriodId, blockingReason, donationCount, grossAmount] = params;
      const key = `${entityId}|${billingPeriodId}|${blockingReason}`;
      if (state.setupNotifications.has(key)) return { rows: [] };
      const id = `notif-${state.seq.notification++}`;
      state.setupNotifications.set(key, {
        id, entity_id: entityId, billing_period_id: billingPeriodId, blocking_reason: blockingReason,
        donation_count: donationCount, gross_amount: grossAmount, notified_admin_count: 0,
      });
      return { rows: [{ id }] };
    }

    if (sql.startsWith('SELECT u.id, u.email, u.full_name FROM user_entities')) {
      const entityId = params[0];
      const rows = state.userEntities
        .filter((ue) => ue.entity_id === entityId && ue.role === 'owner')
        .map((ue) => state.users.get(ue.user_id))
        .filter((u) => u && u.is_active)
        .map((u) => ({ id: u.id, email: u.email, full_name: u.full_name }));
      return { rows };
    }

    if (sql.startsWith('UPDATE billing_setup_notifications SET notified_admin_count')) {
      const [id, count] = params;
      for (const row of state.setupNotifications.values()) {
        if (row.id === id) row.notified_admin_count = count;
      }
      return { rows: [] };
    }

    if (sql.startsWith('UPDATE billing_runs SET result_summary')) {
      const [id, summaryJson] = params;
      const run = state.runs.get(id);
      if (run) run.result_summary = JSON.parse(summaryJson);
      return { rows: [] };
    }

    // ---- approval.service.js support (duplicate-protection proof) ----
    if (sql.startsWith('SELECT s.id, s.status, s.gross_raised')) {
      const st = state.statements.get(params[0]);
      if (!st) return { rows: [] };
      const account = state.accounts.get(st.billing_account_id);
      return { rows: [{
        id: st.id, status: st.status, gross_raised: st.gross_raised,
        billing_account_id: st.billing_account_id, account_entity_id: account.entity_id, run_mode: 'production',
      }] };
    }

    if (sql.startsWith('SELECT sc.donation_id, sc.amount_snapshot')) {
      const rows = state.components
        .filter((c) => c.statement_id === params[0])
        .sort((a, b) => a.donation_id.localeCompare(b.donation_id))
        .map((c) => {
          const d = state.donations.get(c.donation_id);
          return {
            donation_id: c.donation_id, amount_snapshot: c.amount_snapshot,
            donation_status: d.status, is_mock: d.is_mock, amount: d.amount,
            entity_id: d.entity_id, effective_statement_id: d.effective_statement_id,
          };
        });
      return { rows };
    }

    if (sql.startsWith('UPDATE donations SET effective_statement_id')) {
      const [statementId, donationId] = params;
      const d = state.donations.get(donationId);
      if (d.effective_statement_id !== null && d.effective_statement_id !== statementId) {
        throw new Error(`donation ${donationId} already has an effective statement -- write-once`);
      }
      d.effective_statement_id = statementId;
      return { rows: [] };
    }

    if (sql.startsWith("UPDATE statements SET status = 'approved'")) {
      const st = state.statements.get(params[0]);
      if (st) st.status = 'approved';
      return { rows: [] };
    }

    throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 160));
  }

  return {
    query: (sql, params) => query(sql, params),
    connect: async () => ({ query: (sql, params) => query(sql, params), release: () => {} }),
  };
}

function freshModules(fakePool, fakeEmail) {
  const dbPath = require.resolve('../src/db/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

  const emailPath = require.resolve('../src/modules/email/email.service');
  require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: fakeEmail };

  [
    '../src/modules/billing-engine/billing-setup-notification.service',
    '../src/modules/billing-engine/calculation.service',
    '../src/modules/billing-engine/approval.service',
  ].forEach((p) => { delete require.cache[require.resolve(p)]; });

  return {
    calculation: require('../src/modules/billing-engine/calculation.service'),
    approval: require('../src/modules/billing-engine/approval.service'),
  };
}

function addEntity(state, id, displayName, status = 'active') {
  state.entities.set(id, { id, display_name: displayName, status });
}

function addAccount(state, id, entityId, { feeRate = 0.03, vatRate = 0.18, enforcementStatus = 'active' } = {}) {
  state.accounts.set(id, { id, entity_id: entityId, fee_rate: feeRate, vat_rate: vatRate, enforcement_status: enforcementStatus });
}

function addDonation(state, id, entityId, amount, billingEffectiveAt) {
  state.donations.set(id, {
    id, entity_id: entityId, amount: Number(amount).toFixed(2),
    billing_effective_at: billingEffectiveAt, completed_at: billingEffectiveAt,
    recurring_instruction_id: null, source: null,
    status: 'paid', is_mock: false, effective_statement_id: null,
  });
}

function addOwner(state, userId, entityId, email) {
  state.users.set(userId, { id: userId, email, full_name: 'Test Owner', is_active: true });
  state.userEntities.push({ user_id: userId, entity_id: entityId, role: 'owner' });
}

const PERIOD_ID = 'period-1';
const PERIOD_START = '2030-01-01T00:00:00.000Z';
const PERIOD_END = '2030-02-01T00:00:00.000Z';

function newFixture() {
  const state = createFakeState();
  state.periods.set(PERIOD_ID, { period_start: PERIOD_START, period_end: PERIOD_END });
  const fakePool = buildFakePool(state);
  const fakeEmail = { calls: [], queue: (payload) => { fakeEmail.calls.push(payload); } };
  const mods = freshModules(fakePool, fakeEmail);
  return { state, fakeEmail, ...mods };
}

async function main() {
  // ---- 1: no billing_account -- activity discovered, reported, blocked, no Statement ----
  await check('no billing_account: activity discovered + blocked + no Statement', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addDonation(state, 'don-1', 'entity-a', 100, '2030-01-05T00:00:00.000Z');
    addDonation(state, 'don-2', 'entity-a', 115, '2030-01-10T00:00:00.000Z');
    addOwner(state, 1, 'entity-a', 'owner-a@example.invalid');

    const result = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(result.statementsCreated, 0);
    assert.strictEqual(result.accountsEvaluated, 0);
    assert.strictEqual(result.blockedEntities.length, 1);
    assert.strictEqual(result.blockedEntities[0].reason, 'no_billing_account');
    assert.strictEqual(result.blockedEntities[0].donationCount, 2);
    assert.strictEqual(result.blockedEntities[0].grossAmount, '215.00');
    assert.strictEqual(result.activityDiscovered.entitiesWithActivity, 1);
    assert.strictEqual(result.activityDiscovered.totalDonations, 2);
    assert.strictEqual(result.activityDiscovered.totalGross, 215);
    assert.strictEqual(state.statements.size, 0);
    assert.strictEqual(fakeEmail.calls.length, 1);
    assert.strictEqual(fakeEmail.calls[0].to, 'owner-a@example.invalid');
    assert.strictEqual(fakeEmail.calls[0].template, 'billing-setup-required');
  });

  // ---- 2: suspended billing_account -- blocked with correct reason, no Statement ----
  await check('suspended billing_account: blocked with account_suspended, no Statement', async () => {
    const { state, calculation } = newFixture();
    addEntity(state, 'entity-b', 'עמותה ב');
    addAccount(state, 'acct-b', 'entity-b', { enforcementStatus: 'suspended' });
    addDonation(state, 'don-3', 'entity-b', 50, '2030-01-05T00:00:00.000Z');

    const result = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(result.accountsEvaluated, 0);
    assert.strictEqual(result.statementsCreated, 0);
    assert.strictEqual(result.blockedEntities.length, 1);
    assert.strictEqual(result.blockedEntities[0].reason, 'account_suspended');
    assert.strictEqual(state.statements.size, 0);
  });

  // ---- 3: active billing_account -- normal calculation + Statement ----
  await check('active billing_account: normal Statement creation', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-c', 'עמותה ג');
    addAccount(state, 'acct-c', 'entity-c', { feeRate: 0.03, vatRate: 0.18, enforcementStatus: 'active' });
    addDonation(state, 'don-4', 'entity-c', 200, '2030-01-05T00:00:00.000Z');

    const result = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(result.accountsEvaluated, 1);
    assert.strictEqual(result.statementsCreated, 1);
    assert.strictEqual(result.blockedEntities.length, 0);
    const stmt = [...state.statements.values()][0];
    assert.strictEqual(stmt.gross_raised, '200.00');
    assert.strictEqual(stmt.fee_amount, '6.00');
    assert.strictEqual(stmt.vat_amount, '1.08');
    assert.strictEqual(stmt.total_due, '7.08');
    assert.strictEqual(fakeEmail.calls.length, 0); // ---- test 12: fully configured -> no blocked-setup notification
  });

  // ---- 4: mixed period -- configured continues, unconfigured blocked, one doesn't stop the other ----
  await check('mixed period: configured continues, unconfigured blocked independently', async () => {
    const { state, calculation } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addEntity(state, 'entity-b', 'עמותה ב');
    addEntity(state, 'entity-c', 'עמותה ג');
    addAccount(state, 'acct-b', 'entity-b', { enforcementStatus: 'suspended' });
    addAccount(state, 'acct-c', 'entity-c', { enforcementStatus: 'active' });
    addDonation(state, 'don-a', 'entity-a', 30, '2030-01-05T00:00:00.000Z');
    addDonation(state, 'don-b', 'entity-b', 40, '2030-01-05T00:00:00.000Z');
    addDonation(state, 'don-c', 'entity-c', 50, '2030-01-05T00:00:00.000Z');

    const result = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(result.accountsEvaluated, 1);
    assert.strictEqual(result.statementsCreated, 1);
    assert.strictEqual(result.blockedEntities.length, 2);
    const reasons = result.blockedEntities.map((b) => `${b.entityId}:${b.reason}`).sort();
    assert.deepStrictEqual(reasons, ['entity-a:no_billing_account', 'entity-b:account_suspended']);
  });

  // ---- 5: activity discovery alone never consumes donations ----
  await check('discovery alone: never sets effective_statement_id for blocked entities', async () => {
    const { state, calculation } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addDonation(state, 'don-1', 'entity-a', 100, '2030-01-05T00:00:00.000Z');

    await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(state.donations.get('don-1').effective_statement_id, null);
  });

  // ---- 6: provisioning after block -- rerun creates the proper Statement exactly once ----
  await check('rerun after provisioning: exactly one Statement for previously blocked activity', async () => {
    const { state, calculation } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addDonation(state, 'don-1', 'entity-a', 60, '2030-01-05T00:00:00.000Z');
    addDonation(state, 'don-2', 'entity-a', 40, '2030-01-06T00:00:00.000Z');

    const run1 = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);
    assert.strictEqual(run1.blockedEntities.length, 1);
    assert.strictEqual(state.statements.size, 0);

    // operator provisions the account in between runs
    addAccount(state, 'acct-a', 'entity-a', { feeRate: 0.03, vatRate: 0.18, enforcementStatus: 'active' });

    const run2 = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);
    assert.strictEqual(run2.blockedEntities.length, 0);
    assert.strictEqual(run2.statementsCreated, 1);
    assert.strictEqual(state.statements.size, 1);
    const stmt = [...state.statements.values()][0];
    assert.strictEqual(stmt.gross_raised, '100.00');
    const compDonationIds = state.components.filter((c) => c.statement_id === stmt.id).map((c) => c.donation_id).sort();
    assert.deepStrictEqual(compDonationIds, ['don-1', 'don-2']);
  });

  // ---- 7: rerun/duplicate protection -- pre-existing Approval-time guard is sufficient ----
  await check('duplicate-Statement protection: second competing draft cannot be approved', async () => {
    const { state, calculation, approval } = newFixture();
    addEntity(state, 'entity-c', 'עמותה ג');
    addAccount(state, 'acct-c', 'entity-c', { feeRate: 0.03, vatRate: 0.18, enforcementStatus: 'active' });
    addDonation(state, 'don-4', 'entity-c', 200, '2030-01-05T00:00:00.000Z');

    // Two production calculations before either Statement is approved --
    // the documented, known-safe-at-approval-time scenario (see
    // calculation.service.js's own header comment): both runs see the same
    // still-unconsumed donation and each create their own draft Statement.
    await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);
    await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);
    assert.strictEqual(state.statements.size, 2);
    const [stmtA, stmtB] = [...state.statements.values()];

    const approveA = await approval.approveStatement(stmtA.id);
    assert.strictEqual(approveA.approved, true);

    await assert.rejects(
      () => approval.approveStatement(stmtB.id),
      (err) => err.code === 'DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT',
    );

    // exactly one financial consumption of the underlying donation
    assert.strictEqual(state.donations.get('don-4').effective_statement_id, stmtA.id);
  });

  // ---- 8/9/10/11/12: notification targeting, dedup, no invented amounts, activity gating ----
  await check('blocked entity notification targets the correct entity administrator', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addEntity(state, 'entity-x', 'עמותה אחרת');
    addDonation(state, 'don-1', 'entity-a', 100, '2030-01-05T00:00:00.000Z');
    addOwner(state, 1, 'entity-a', 'owner-a@example.invalid');
    addOwner(state, 2, 'entity-x', 'owner-x@example.invalid'); // decoy: unrelated entity, no activity

    await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(fakeEmail.calls.length, 1);
    assert.strictEqual(fakeEmail.calls[0].to, 'owner-a@example.invalid');
    assert.strictEqual(fakeEmail.calls[0].entityId, 'entity-a');
  });

  await check('repeated calculation of same period + same blocking condition does not duplicate notification', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addDonation(state, 'don-1', 'entity-a', 100, '2030-01-05T00:00:00.000Z');
    addOwner(state, 1, 'entity-a', 'owner-a@example.invalid');

    const run1 = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);
    const run2 = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(fakeEmail.calls.length, 1);
    assert.strictEqual(run1.blockedEntities[0].notification.sent, true);
    assert.strictEqual(run2.blockedEntities[0].notification.sent, false);
    assert.strictEqual(run2.blockedEntities[0].notification.reason, 'already_notified');
  });

  await check('missing commercial terms: notification never invents an amount owed', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-a', 'עמותה א');
    addDonation(state, 'don-1', 'entity-a', 215, '2030-01-05T00:00:00.000Z');
    addOwner(state, 1, 'entity-a', 'owner-a@example.invalid');

    await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(fakeEmail.calls.length, 1);
    const { data } = fakeEmail.calls[0];
    assert.ok('donationCount' in data);
    assert.ok('grossAmount' in data);
    for (const forbidden of ['feeAmount', 'vatAmount', 'totalDue', 'fee_rate', 'vat_rate', 'feeRate', 'vatRate']) {
      assert.ok(!(forbidden in data), `notification data must never include ${forbidden}`);
    }
  });

  await check('entity with no eligible activity: no Billing-setup notification', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-d', 'עמותה ללא פעילות');
    addOwner(state, 1, 'entity-d', 'owner-d@example.invalid');
    // no donations at all for entity-d

    const result = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(result.blockedEntities.length, 0);
    assert.strictEqual(fakeEmail.calls.length, 0);
  });

  await check('fully configured entity: no blocked-setup notification', async () => {
    const { state, calculation, fakeEmail } = newFixture();
    addEntity(state, 'entity-c', 'עמותה ג');
    addAccount(state, 'acct-c', 'entity-c', { enforcementStatus: 'active' });
    addDonation(state, 'don-4', 'entity-c', 200, '2030-01-05T00:00:00.000Z');
    addOwner(state, 1, 'entity-c', 'owner-c@example.invalid');

    const result = await calculation.runProductionCalculation(PERIOD_ID, PERIOD_START);

    assert.strictEqual(result.blockedEntities.length, 0);
    assert.strictEqual(fakeEmail.calls.length, 0);
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main();
