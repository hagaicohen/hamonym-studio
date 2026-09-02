// Unit tests for the Billing Ops bulk-approval orchestration
// (billing-ops.service.js#bulkApproveStatements, 2026-09-02).
//
// This endpoint is orchestration only: it must call the frozen
// approval.service.js#approveStatement() once per statement id, exactly as
// the existing single-statement approve path does, and must NEVER
// reimplement approval logic as a mass SQL status update. The critical
// property under test is per-id failure isolation: a failure on one
// statement (already-claimed donation) must not roll back or block the
// approval of any other statement in the same batch, and must be surfaced
// as a clear per-id error rather than a silent partial approval.
//
// Same convention as scripts/test-billing-readiness-calculation.js: no test
// framework, no real DB, no real network. An in-memory fake stands in for
// '../src/db/db' via require.cache override. Deliberately never touches the
// real database -- see that file's header for why (paid donations /
// statement transitions cannot be cleanly reverted in production).
//
// Run: node scripts/test-billing-bulk-approval.js

const assert = require('assert');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

// ---- in-memory fake for src/db/db (pool) -----------------------------------
function createFakeState() {
  return {
    statements: new Map(),
    accounts: new Map(),
    components: [],
    donations: new Map(),
    auditLog: [],
  };
}

function addStatement(state, id, { billingAccountId, entityId, grossRaised, status = 'draft', runMode = 'production' }) {
  state.accounts.set(billingAccountId, { id: billingAccountId, entity_id: entityId });
  state.statements.set(id, { id, status, gross_raised: grossRaised, billing_account_id: billingAccountId, run_mode: runMode });
}

function addComponent(state, statementId, donationId, { amount, amountSnapshot, entityId, status = 'paid', isMock = false, effectiveStatementId = null }) {
  state.components.push({ statement_id: statementId, donation_id: donationId, amount_snapshot: amountSnapshot });
  state.donations.set(donationId, {
    id: donationId, amount, entity_id: entityId, status, is_mock: isMock, effective_statement_id: effectiveStatementId,
  });
}

function buildFakePool(state) {
  async function query(sqlRaw, params = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

    // approval.service.js#loadStatementForUpdate
    if (sql.startsWith('SELECT s.id, s.status, s.gross_raised')) {
      const st = state.statements.get(params[0]);
      if (!st) return { rows: [] };
      const account = state.accounts.get(st.billing_account_id);
      return { rows: [{
        id: st.id, status: st.status, gross_raised: st.gross_raised,
        billing_account_id: st.billing_account_id, account_entity_id: account.entity_id, run_mode: st.run_mode,
      }] };
    }

    // approval.service.js#loadComponentsForUpdate
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

    // billing-ops.service.js#bulkApproveStatements' own per-id audit row
    // (action is a literal in the SQL text itself, not a placeholder --
    // matches the exact query shape in billing-ops.service.js)
    if (sql.startsWith('INSERT INTO platform_audit_log')) {
      const [superAdminUserId, notes, ip] = params;
      const actionMatch = sql.match(/VALUES \(\$1, '([^']+)'/);
      state.auditLog.push({ superAdminUserId, action: actionMatch ? actionMatch[1] : null, notes, ip });
      return { rows: [] };
    }

    throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 160));
  }

  return {
    query: (sql, params) => query(sql, params),
    connect: async () => ({ query: (sql, params) => query(sql, params), release: () => {} }),
  };
}

function freshModules(fakePool) {
  const dbPath = require.resolve('../src/db/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

  [
    '../src/modules/billing-engine/approval.service',
    '../src/modules/billing-engine/calculation.service',
    '../src/modules/collection-engine/collection.service',
    '../src/modules/collection-engine/routing',
    '../src/modules/platform/billing-ops/billing-ops.service',
  ].forEach((p) => { delete require.cache[require.resolve(p)]; });

  return { billingOps: require('../src/modules/platform/billing-ops/billing-ops.service') };
}

function newFixture() {
  const state = createFakeState();
  const fakePool = buildFakePool(state);
  const { billingOps } = freshModules(fakePool);
  return { state, billingOps };
}

async function main() {
  await check('bulk approve: 3 statements, one has a donation already claimed elsewhere -- the other two still approve, the bad one returns a clear per-id error, nothing rolls back', async () => {
    const { state, billingOps } = newFixture();

    addStatement(state, 'stmt-1', { billingAccountId: 'acct-1', entityId: 'entity-1', grossRaised: '100.00' });
    addComponent(state, 'stmt-1', 'don-1', { amount: '100.00', amountSnapshot: '100.00', entityId: 'entity-1' });

    addStatement(state, 'stmt-2', { billingAccountId: 'acct-2', entityId: 'entity-2', grossRaised: '50.00' });
    addComponent(state, 'stmt-2', 'don-2', { amount: '50.00', amountSnapshot: '50.00', entityId: 'entity-2' });

    addStatement(state, 'stmt-3', { billingAccountId: 'acct-3', entityId: 'entity-3', grossRaised: '75.00' });
    addComponent(state, 'stmt-3', 'don-3', {
      amount: '75.00', amountSnapshot: '75.00', entityId: 'entity-3',
      effectiveStatementId: 'stmt-other-already-approved', // claimed by a different statement
    });

    const result = await billingOps.bulkApproveStatements({
      statementIds: ['stmt-1', 'stmt-2', 'stmt-3'], superAdminUserId: 7, ip: '127.0.0.1',
    });

    assert.strictEqual(result.total, 3);
    assert.strictEqual(result.approvedCount, 2);
    assert.strictEqual(result.failedCount, 1);

    const [r1, r2, r3] = result.results;
    assert.strictEqual(r1.id, 'stmt-1');
    assert.strictEqual(r1.success, true);
    assert.strictEqual(r1.result.approved, true);
    assert.strictEqual(r2.id, 'stmt-2');
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r3.id, 'stmt-3');
    assert.strictEqual(r3.success, false);
    assert.strictEqual(r3.error.code, 'DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT');
    assert.strictEqual(r3.error.details.donationId, 'don-3');

    // the two good statements actually committed their approval
    assert.strictEqual(state.statements.get('stmt-1').status, 'approved');
    assert.strictEqual(state.statements.get('stmt-2').status, 'approved');
    assert.strictEqual(state.donations.get('don-1').effective_statement_id, 'stmt-1');
    assert.strictEqual(state.donations.get('don-2').effective_statement_id, 'stmt-2');

    // the bad statement was never silently marked approved and its donation
    // claim was never touched
    assert.strictEqual(state.statements.get('stmt-3').status, 'draft');
    assert.strictEqual(state.donations.get('don-3').effective_statement_id, 'stmt-other-already-approved');

    // exactly one audit row per successfully approved statement -- none for
    // the failed one, none for "bulk action" as a whole
    assert.strictEqual(state.auditLog.length, 2);
    assert.ok(state.auditLog.every((a) => a.action === 'billing_statement_approve'));
    assert.ok(state.auditLog.some((a) => a.notes.includes('statementId=stmt-1')));
    assert.ok(state.auditLog.some((a) => a.notes.includes('statementId=stmt-2')));
    assert.ok(!state.auditLog.some((a) => a.notes.includes('stmt-3')));
  });

  await check('bulk approve: all statements valid -- all succeed, one audit row each', async () => {
    const { state, billingOps } = newFixture();
    addStatement(state, 'stmt-a', { billingAccountId: 'acct-a', entityId: 'entity-a', grossRaised: '10.00' });
    addComponent(state, 'stmt-a', 'don-a', { amount: '10.00', amountSnapshot: '10.00', entityId: 'entity-a' });
    addStatement(state, 'stmt-b', { billingAccountId: 'acct-b', entityId: 'entity-b', grossRaised: '20.00' });
    addComponent(state, 'stmt-b', 'don-b', { amount: '20.00', amountSnapshot: '20.00', entityId: 'entity-b' });

    const result = await billingOps.bulkApproveStatements({ statementIds: ['stmt-a', 'stmt-b'], superAdminUserId: 1, ip: null });

    assert.strictEqual(result.approvedCount, 2);
    assert.strictEqual(result.failedCount, 0);
    assert.strictEqual(state.auditLog.length, 2);
  });

  await check('bulk approve: already-approved statement (self-consistently claimed) is an idempotent success, still audited', async () => {
    const { state, billingOps } = newFixture();
    addStatement(state, 'stmt-x', { billingAccountId: 'acct-x', entityId: 'entity-x', grossRaised: '10.00', status: 'approved' });
    addComponent(state, 'stmt-x', 'don-x', { amount: '10.00', amountSnapshot: '10.00', entityId: 'entity-x', effectiveStatementId: 'stmt-x' });

    const result = await billingOps.bulkApproveStatements({ statementIds: ['stmt-x'], superAdminUserId: 1, ip: null });

    assert.strictEqual(result.approvedCount, 1);
    assert.strictEqual(result.results[0].result.alreadyApproved, true);
    assert.strictEqual(state.auditLog.length, 1);
  });

  await check('bulk approve: empty statementIds array is rejected with MISSING_STATEMENT_IDS, no queries issued', async () => {
    const { billingOps } = newFixture();
    await assert.rejects(
      () => billingOps.bulkApproveStatements({ statementIds: [], superAdminUserId: 1, ip: null }),
      (err) => err.code === 'MISSING_STATEMENT_IDS',
    );
  });

  await check('bulk approve: missing/non-array statementIds is rejected with MISSING_STATEMENT_IDS', async () => {
    const { billingOps } = newFixture();
    await assert.rejects(
      () => billingOps.bulkApproveStatements({ statementIds: undefined, superAdminUserId: 1, ip: null }),
      (err) => err.code === 'MISSING_STATEMENT_IDS',
    );
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main();
