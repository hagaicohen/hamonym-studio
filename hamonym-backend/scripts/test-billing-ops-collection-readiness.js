// Unit tests for the Billing Collection UX truthfulness fix (2026-09-02):
// billing-ops.service.js#evaluateCollectionReadiness / getStatementDetail /
// triggerCollection's new defense-in-depth pre-check.
//
// Same convention as scripts/test-billing-v1-routing-and-collection.js: no
// test framework, no real DB, no real network. The fake db pool is a
// superset of that file's -- it additionally handles billing-ops.service.js's
// own getStatementDetail/triggerCollection queries. The 'card' adapter slot
// is monkey-patched via require.cache on adapters/get-adapter.js so the
// "ready" happy-path test never loads (and so can never call) the real
// CardCom adapter/client -- proven by the fact these tests pass with the
// real HAMONYM_CARDCOM_* credentials still configured in .env and never
// touch the network.
//
// Run: node scripts/test-billing-ops-collection-readiness.js

const assert = require('assert');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function createFakeState({ statement, entityBilling, masavConfig } = {}) {
  const state = {
    statements: new Map(statement ? [[statement.id, { ...statement }]] : []),
    collectionAttempts: new Map(),
    payments: new Map(),
    auditLogs: [],
    entityBilling: entityBilling || null,
    masavConfig: masavConfig || null,
  };
  let attemptSeq = 1;

  async function query(sqlRaw, params = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

    // billing-ops.service.js#triggerCollection's pre-check statement lookup
    if (sql.startsWith('SELECT s.total_due, ba.entity_id')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ total_due: st.total_due, entity_id: st.entity_id }] : [] };
    }

    // billing-ops.service.js#getStatementDetail's statement lookup
    if (sql.includes('ba.preferred_collection_method AS account_declared_method')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ ...st }] : [] };
    }

    if (sql.startsWith('SELECT * FROM collection_attempts WHERE statement_id')) {
      return { rows: [...state.collectionAttempts.values()].filter((a) => a.statement_id === params[0]) };
    }
    if (sql.startsWith('SELECT * FROM payments WHERE statement_id')) {
      return { rows: [...state.payments.values()].filter((p) => p.statement_id === params[0]) };
    }
    if (sql.startsWith('SELECT count(*)::int AS n FROM statement_components')) {
      return { rows: [{ n: 0 }] };
    }

    // routing.js masav config lookup
    if (sql.startsWith('SELECT authorized, bank_code, branch_code, account_number FROM entity_masav_details')) {
      return { rows: state.masavConfig ? [{ ...state.masavConfig }] : [] };
    }

    // billing.repository.js#getActiveDefaultByEntityId
    if (sql.includes('FROM entity_billing')) {
      return { rows: state.entityBilling ? [{ ...state.entityBilling }] : [] };
    }

    // collection.service.js#openAttempt's statement lookup (card-oriented)
    if (sql.includes('FROM statements s') && sql.includes('preferred_collection_method') && sql.includes('FOR UPDATE OF s')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ ...st }] : [] };
    }

    if (sql.startsWith('SELECT id FROM collection_attempts WHERE statement_id = $1 AND status = ANY')) {
      const rows = [...state.collectionAttempts.values()].filter(
        (a) => a.statement_id === params[0] && params[1].includes(a.status)
      );
      return { rows: rows.map((a) => ({ id: a.id })) };
    }

    if (sql.startsWith('INSERT INTO reconciliation_findings')) {
      return { rows: [] };
    }

    if (sql.startsWith('SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next')) {
      const existing = [...state.collectionAttempts.values()].filter((a) => a.statement_id === params[0]);
      const next = existing.length ? Math.max(...existing.map((a) => a.attempt_number)) + 1 : 1;
      return { rows: [{ next }] };
    }

    if (sql.startsWith('INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount) VALUES')) {
      const id = `attempt-${attemptSeq++}`;
      const row = {
        id, statement_id: params[0], collection_method: params[1], attempt_number: params[2],
        requested_amount: params[3], status: 'pending', provider: 'cardcom',
        provider_reference: null, provider_raw_status: null, failure_reason: null, resolved_at: null,
      };
      state.collectionAttempts.set(id, row);
      return { rows: [{ id, attempt_number: row.attempt_number }] };
    }

    if (sql.startsWith("UPDATE statements SET status = 'open' WHERE id = $1")) {
      const st = state.statements.get(params[0]);
      if (st) st.status = 'open';
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE statements SET status = 'paid' WHERE id = $1")) {
      const st = state.statements.get(params[0]);
      if (st) st.status = 'paid';
      return { rows: [] };
    }

    if (sql.startsWith('UPDATE collection_attempts SET status = $2, provider_reference = $3')) {
      const a = state.collectionAttempts.get(params[0]);
      if (a) {
        a.status = params[1];
        a.provider_reference = params[2];
        a.provider_raw_status = params[3];
        a.failure_reason = params[4];
        a.resolved_at = new Date().toISOString();
      }
      return { rows: [] };
    }

    if (sql.startsWith('SELECT requested_amount, provider FROM collection_attempts WHERE id = $1')) {
      const a = state.collectionAttempts.get(params[0]);
      return { rows: a ? [{ requested_amount: a.requested_amount, provider: a.provider }] : [] };
    }

    if (sql.startsWith('INSERT INTO payments')) {
      const id = `payment-${state.payments.size + 1}`;
      state.payments.set(id, {
        id, statement_id: params[0], collection_attempt_id: params[1], amount: params[2],
        provider: params[3], provider_reference: params[4],
      });
      return { rows: [] };
    }

    if (sql.startsWith('SELECT COALESCE(SUM(amount), 0) AS total')) {
      const paid = [...state.payments.values()].filter((p) => p.statement_id === params[0]);
      const total = paid.reduce((sum, p) => sum + Number(p.amount), 0);
      const st = state.statements.get(params[0]);
      return { rows: [{ total, total_due: st.total_due }] };
    }

    if (sql.startsWith('INSERT INTO platform_audit_log')) {
      state.auditLogs.push({ params });
      return { rows: [] };
    }

    throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 120));
  }

  const fakePool = {
    query: (sql, params) => query(sql, params),
    connect: async () => ({ query: (sql, params) => query(sql, params), release: () => {} }),
  };

  return { state, fakePool };
}

// fakeCardAdapter === undefined leaves the real adapter registry in place
// (only safe for tests that never reach an actual adapter.charge call).
function freshModules(fakePool, fakeCardAdapter) {
  const dbPath = require.resolve('../src/db/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };

  const getAdapterPath = require.resolve('../src/modules/collection-engine/adapters/get-adapter');
  if (fakeCardAdapter) {
    require.cache[getAdapterPath] = {
      id: getAdapterPath, filename: getAdapterPath, loaded: true,
      exports: (method) => {
        if (method === 'card') return fakeCardAdapter;
        throw new Error('test fake adapter registry: unexpected method ' + method);
      },
    };
  } else {
    delete require.cache[getAdapterPath];
  }

  [
    '../src/modules/collection-engine/routing',
    '../src/modules/collection-engine/collection.service',
    '../src/modules/billing/billing.repository',
    '../src/jobs/reconciliation-findings',
    '../src/modules/platform/billing-ops/billing-ops.service',
    '../src/modules/platform/billing-ops/error-status',
  ].forEach((p) => { delete require.cache[require.resolve(p)]; });

  return {
    billingOpsService: require('../src/modules/platform/billing-ops/billing-ops.service'),
    errorStatus: require('../src/modules/platform/billing-ops/error-status'),
  };
}

function baseStatement(overrides) {
  return {
    id: 'stmt-1', billing_account_id: 'ba-1', entity_id: 'entity-1',
    total_due: '0.28', status: 'approved', entity_name: 'ישראלס', ...overrides,
  };
}

async function run() {
  // ---- getStatementDetail: readiness must be the real, computed state ---

  await check('getStatementDetail: card route + active instrument -> readiness.ready=true, routed_method=card', async () => {
    const { fakePool } = createFakeState({
      statement: baseStatement({ total_due: '0.28' }),
      entityBilling: { id: 'eb-1', provider: 'cardcom', token: 'tok', last4: '1234' },
    });
    const { billingOpsService } = freshModules(fakePool);
    const detail = await billingOpsService.getStatementDetail('stmt-1');
    assert.deepStrictEqual(detail.readiness, { route: 'card', ready: true, reason: null });
    assert.strictEqual(detail.routed_method, 'card');
  });

  await check('getStatementDetail: card route + NO instrument -> readiness.ready=false/no_active_payment_instrument, never defaults to blocked/חסום', async () => {
    const { fakePool } = createFakeState({
      statement: baseStatement({ total_due: '7.33', id: 'stmt-2', entity_id: 'entity-2' }),
    });
    const { billingOpsService } = freshModules(fakePool);
    const detail = await billingOpsService.getStatementDetail('stmt-2');
    assert.deepStrictEqual(detail.readiness, { route: 'card', ready: false, reason: 'no_active_payment_instrument' });
    assert.strictEqual(detail.routed_method, 'card', 'route must stay "card" (the true routing decision), not the old misleading "blocked" default');
  });

  await check('getStatementDetail: total_due above threshold, masav not configured -> readiness.route=masav, ready=false/masav_not_configured', async () => {
    const { fakePool } = createFakeState({
      statement: baseStatement({ total_due: '5000.00', id: 'stmt-3' }),
    });
    const { billingOpsService } = freshModules(fakePool);
    const detail = await billingOpsService.getStatementDetail('stmt-3');
    assert.deepStrictEqual(detail.readiness, { route: 'masav', ready: false, reason: 'masav_not_configured' });
  });

  await check('getStatementDetail: total_due above threshold, masav configured+authorized -> readiness.ready=true', async () => {
    const { fakePool } = createFakeState({
      statement: baseStatement({ total_due: '5000.00', id: 'stmt-4' }),
      masavConfig: { authorized: true, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { billingOpsService } = freshModules(fakePool);
    const detail = await billingOpsService.getStatementDetail('stmt-4');
    assert.deepStrictEqual(detail.readiness, { route: 'masav', ready: true, reason: null });
  });

  // ---- triggerCollection: defense-in-depth pre-check --------------------

  await check('triggerCollection: card route, NO instrument -> rejected NOT_COLLECTION_READY before collection engine runs, no attempt row, no CardCom adapter ever resolved', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '7.33', entity_id: 'entity-2' }),
    });
    // No fake adapter registered at all -- if the pre-check failed to stop
    // execution and the real adapter registry were ever consulted for
    // anything beyond this rejection, requiring the real cardcom adapter
    // module would still be harmless (it only throws on missing terminal
    // config or is never invoked), but the assertion below on
    // collectionAttempts.size is the actual proof nothing ran.
    const { billingOpsService } = freshModules(fakePool);
    await assert.rejects(
      () => billingOpsService.triggerCollection({ statementId: 'stmt-1', superAdminUserId: 'admin-1' }),
      (err) => {
        assert.strictEqual(err.code, 'NOT_COLLECTION_READY');
        assert.strictEqual(err.details.route, 'card');
        assert.strictEqual(err.details.reason, 'no_active_payment_instrument');
        return true;
      }
    );
    assert.strictEqual(state.collectionAttempts.size, 0, 'no collection_attempts row may be created for a rejected request');
    assert.strictEqual(state.statements.get('stmt-1').status, 'approved', 'Statement must remain approved, never flipped to open');
    assert.strictEqual(state.auditLogs.length, 0, 'a rejected pre-check must not log a billing_collection_trigger audit row');
  });

  await check('triggerCollection: masav route (above threshold) -> rejected NOT_COLLECTION_READY, this endpoint never actions masav', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '5000.00' }),
      masavConfig: { authorized: true, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { billingOpsService } = freshModules(fakePool);
    await assert.rejects(
      () => billingOpsService.triggerCollection({ statementId: 'stmt-1', superAdminUserId: 'admin-1' }),
      (err) => { assert.strictEqual(err.code, 'NOT_COLLECTION_READY'); assert.strictEqual(err.details.route, 'masav'); return true; }
    );
    assert.strictEqual(state.collectionAttempts.size, 0);
  });

  await check('triggerCollection: unknown statement id -> STATEMENT_NOT_FOUND, never reaches readiness check or collection engine', async () => {
    const { fakePool } = createFakeState();
    const { billingOpsService } = freshModules(fakePool);
    await assert.rejects(
      () => billingOpsService.triggerCollection({ statementId: 'does-not-exist', superAdminUserId: 'admin-1' }),
      (err) => { assert.strictEqual(err.code, 'STATEMENT_NOT_FOUND'); return true; }
    );
  });

  await check('triggerCollection: card route, active instrument present -> pre-check passes, real collection pipeline still runs end to end (regression: new guard must not block the genuinely ready path)', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '0.28' }),
      entityBilling: { id: 'eb-1', provider: 'cardcom', token: 'tok', last4: '1234' },
    });
    let chargeCalls = 0;
    const fakeCardAdapter = {
      NOT_IMPLEMENTED: false,
      charge: async () => { chargeCalls++; return { outcome: 'succeeded', providerReference: 'TEST-REF-READY' }; },
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);
    const result = await billingOpsService.triggerCollection({ statementId: 'stmt-1', superAdminUserId: 'admin-1' });
    assert.strictEqual(chargeCalls, 1, 'the fake adapter (never the real CardCom adapter) must be the one actually called');
    assert.strictEqual(result.outcome, 'succeeded');
    assert.strictEqual(result.statementStatus, 'paid');
    assert.strictEqual(state.statements.get('stmt-1').status, 'paid');
    assert.strictEqual(state.auditLogs.length, 1, 'a genuinely-run collection must still be audit-logged exactly as before');
  });

  // ---- error-status.js mapping ------------------------------------------

  await check('error-status.js: NOT_COLLECTION_READY maps to 409', async () => {
    const { fakePool } = createFakeState();
    const { errorStatus } = freshModules(fakePool);
    assert.strictEqual(errorStatus.statusFor({ code: 'NOT_COLLECTION_READY' }), 409);
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
