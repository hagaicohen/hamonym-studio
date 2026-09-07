// Unit tests for the manual "check with provider" (reconcile) admin action
// (Billing v1 post-launch hardening, 2026-09-07):
// billing-ops.service.js#reconcileCollectionAttempt.
//
// Why this exists: a real Super Admin manually triggered collection on
// Statement 5ae9f0cf-2f4b-4c28-9b03-4eb54c88a329 (entity ישראלס) and CardCom
// returned an HTTP 401 synchronously, leaving exactly one collection_attempts
// row (technical_failure). The user has since fixed the live CardCom
// credentials in Render and wants a safe, UI-triggerable way to ask CardCom
// (read-only, via the SAME ExternalUniqTranId/attemptId) whether it now
// recognizes that attempt -- without ever creating a new charge attempt.
//
// Same convention as scripts/test-billing-ops-collection-readiness.js: no
// test framework, no real DB, no real network. The fake pool is a superset
// of that file's, extended with the two queries reconcileCollectionAttempt
// itself issues (the attempt lookup by id, and the post-resolve re-read of
// the attempt/statement rows). The 'card' adapter slot is monkey-patched via
// require.cache on adapters/get-adapter.js so these tests can never reach
// the real CardCom adapter/client, proving no real network call is possible
// even with real HAMONYM_CARDCOM_* credentials configured in .env.
//
// Run: node scripts/test-billing-collection-attempt-reconcile.js

const assert = require('assert');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function createFakeState({ statement, attempt, payments, entityBilling } = {}) {
  const state = {
    statements: new Map(statement ? [[statement.id, { ...statement }]] : []),
    collectionAttempts: new Map(attempt ? [[attempt.id, { ...attempt }]] : []),
    payments: new Map((payments || []).map((p) => [p.id, { ...p }])),
    entityBilling: entityBilling || null,
    auditLogs: [],
  };
  let newAttemptSeq = 1;

  async function query(sqlRaw, params = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

    // collection.service.js#openAttempt's own statement lookup (FOR UPDATE)
    // -- needed by the "fresh attempt not blocked" proof below, which calls
    // openAttempt directly after a reconcile resolution.
    if (sql.includes('FROM statements s') && sql.includes('JOIN billing_accounts ba') && sql.includes('FOR UPDATE OF s')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ ...st }] : [] };
    }

    // openAttempt's ACTIVE_ATTEMPT_STATUSES guard -- the exact predicate
    // this fix must not leave 'not_found_confirmed' rows blocked by.
    if (sql.startsWith('SELECT id FROM collection_attempts WHERE statement_id = $1 AND status = ANY')) {
      const rows = [...state.collectionAttempts.values()].filter(
        (a) => a.statement_id === params[0] && params[1].includes(a.status)
      );
      return { rows: rows.map((a) => ({ id: a.id })) };
    }

    if (sql.startsWith('SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next')) {
      const existing = [...state.collectionAttempts.values()].filter((a) => a.statement_id === params[0]);
      const next = existing.length ? Math.max(...existing.map((a) => a.attempt_number)) + 1 : 1;
      return { rows: [{ next }] };
    }

    if (sql.startsWith('INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount) VALUES')) {
      const id = `attempt-new-${newAttemptSeq++}`;
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

    // billingRepository.getActiveDefaultByEntityId -- openAttempt's card
    // payment-instrument lookup.
    if (sql.includes('FROM entity_billing')) {
      return { rows: state.entityBilling ? [{ ...state.entityBilling }] : [] };
    }

    // reconcileCollectionAttempt's own initial attempt lookup
    if (sql.startsWith('SELECT id, statement_id, collection_method, status FROM collection_attempts WHERE id = $1')) {
      const a = state.collectionAttempts.get(params[0]);
      return { rows: a ? [{ ...a }] : [] };
    }

    // reconcileCollectionAttempt's post-resolve re-read
    if (sql.startsWith('SELECT status, provider_reference, provider_raw_status, failure_reason FROM collection_attempts WHERE id = $1')) {
      const a = state.collectionAttempts.get(params[0]);
      return { rows: a ? [{ status: a.status, provider_reference: a.provider_reference, provider_raw_status: a.provider_raw_status, failure_reason: a.failure_reason }] : [] };
    }
    if (sql.startsWith('SELECT status FROM statements WHERE id = $1')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ status: st.status }] : [] };
    }

    // resolveAttempt's own queries (collection.service.js)
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
      // payments.collection_attempt_id UNIQUE / (provider, provider_reference)
      // UNIQUE -- enforced here exactly like the real DB constraints, so a
      // second identical insert throws the same 23505 unique_violation a
      // real duplicate resolveAttempt() call would hit in production.
      const dup = [...state.payments.values()].find(
        (p) => p.collection_attempt_id === params[1]
          || (p.provider === params[3] && p.provider_reference === params[4])
      );
      if (dup) {
        const e = new Error('duplicate key value violates unique constraint');
        e.code = '23505';
        throw e;
      }
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
    if (sql.startsWith("UPDATE statements SET status = 'paid' WHERE id = $1")) {
      const st = state.statements.get(params[0]);
      if (st) st.status = 'paid';
      return { rows: [] };
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
    '../src/modules/collection-engine/collection.service',
    '../src/modules/collection-engine/routing',
    '../src/modules/billing/billing.repository',
    '../src/modules/platform/billing-ops/billing-ops.service',
    '../src/modules/platform/billing-ops/error-status',
  ].forEach((p) => { delete require.cache[require.resolve(p)]; });

  return {
    billingOpsService: require('../src/modules/platform/billing-ops/billing-ops.service'),
    errorStatus: require('../src/modules/platform/billing-ops/error-status'),
    collectionService: require('../src/modules/collection-engine/collection.service'),
  };
}

function baseAttempt(overrides) {
  return {
    id: 'attempt-1', statement_id: 'stmt-1', collection_method: 'card', attempt_number: 1,
    requested_amount: '0.28', status: 'technical_failure', provider: 'cardcom',
    provider_reference: null, provider_raw_status: 'http_401', failure_reason: 'cardcom_http_401',
    resolved_at: null, ...overrides,
  };
}

function baseStatement(overrides) {
  return { id: 'stmt-1', total_due: '0.28', status: 'open', entity_id: 'entity-1', ...overrides };
}

async function run() {
  // ---- 1. not_found -------------------------------------------------

  await check('technical_failure attempt, provider now returns not_found -> attempt left untouched (not_found is not a valid collection_attempts.status), Statement stays open, zero Payments', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement(), attempt: baseAttempt() });
    let resolveArgs = null;
    const fakeCardAdapter = {
      reconcile: async ({ attemptId }) => {
        assert.strictEqual(attemptId, 'attempt-1', 'must reconcile using the SAME attemptId, never a new one');
        return { outcome: 'not_found', providerRawStatus: '-1000:not found' };
      },
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);
    const result = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });

    assert.strictEqual(result.outcome, 'not_found');
    assert.strictEqual(result.attemptStatus, 'technical_failure', 'attempt status must remain exactly as it was -- never overwritten with the invalid value "not_found"');
    assert.strictEqual(result.statementStatus, 'open');
    assert.strictEqual(state.statements.get('stmt-1').status, 'open');
    assert.strictEqual(state.payments.size, 0);
    assert.strictEqual(state.collectionAttempts.get('attempt-1').status, 'technical_failure', 'the underlying row itself must be untouched');
    assert.strictEqual(state.auditLogs.length, 1, 'the check itself is still audit-logged even though nothing changed');
  });

  // ---- 1b. not_found_confirmed (2026-09-07 reconcile classification fix) --

  await check('technical_failure attempt, provider now returns not_found_confirmed (CardCom ResponseCode 9998) -> attempt IS updated to not_found_confirmed (unlike plain not_found), Statement stays open, zero Payments', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement(), attempt: baseAttempt() });
    const fakeCardAdapter = {
      reconcile: async ({ attemptId }) => {
        assert.strictEqual(attemptId, 'attempt-1', 'must reconcile using the SAME attemptId, never a new one');
        return {
          outcome: 'not_found_confirmed',
          providerRawStatus: 'http_400 (ResponseCode=9998, Description=ExternalUniqTranId not found - there is not successful transaction for this ExternalUniqTranId)',
          failureReason: 'cardcom_lookup_http_400 (ResponseCode=9998, Description=ExternalUniqTranId not found - there is not successful transaction for this ExternalUniqTranId)',
        };
      },
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);
    const result = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });

    assert.strictEqual(result.outcome, 'not_found_confirmed');
    assert.strictEqual(result.attemptStatus, 'not_found_confirmed', 'unlike plain not_found, this outcome IS persisted as the row status');
    assert.strictEqual(result.statementStatus, 'open', 'Statement must never be marked paid for this outcome');
    assert.strictEqual(state.statements.get('stmt-1').status, 'open');
    assert.strictEqual(state.payments.size, 0, 'no Payment must ever be created for this outcome');
    assert.strictEqual(state.collectionAttempts.get('attempt-1').status, 'not_found_confirmed');
    assert.strictEqual(state.auditLogs.length, 1);
  });

  await check('after a not_found_confirmed resolution, a fresh openAttempt() call for the SAME Statement is NOT blocked -- opens a brand-new attempt with a new id (proves ACTIVE_ATTEMPT_STATUSES does not include the new status)', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement(),
      attempt: baseAttempt(),
      entityBilling: { id: 'eb-1', provider: 'cardcom', token: 'tok', last4: '1234', exp_month: 9, exp_year: 2027 },
    });
    const fakeCardAdapter = {
      reconcile: async () => ({ outcome: 'not_found_confirmed', providerRawStatus: 'http_400 (ResponseCode=9998)' }),
    };
    const { billingOpsService, collectionService } = freshModules(fakePool, fakeCardAdapter);

    const reconcileResult = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });
    assert.strictEqual(reconcileResult.attemptStatus, 'not_found_confirmed');
    assert.strictEqual(state.collectionAttempts.size, 1, 'sanity: still exactly one attempt before the fresh call');

    // Concretely exercise collection.service.js#openAttempt (the real
    // ACTIVE_ATTEMPT_STATUSES guard, not just asserting the string isn't in
    // the array) for the SAME Statement, using a bare fake adapter (only
    // NOT_IMPLEMENTED is read by openAttempt itself -- charge() is never
    // called here, no real collection is attempted).
    const fakeCardAdapterForNewAttempt = { NOT_IMPLEMENTED: false };
    const opened = await collectionService.openAttempt('stmt-1', (method) => {
      assert.strictEqual(method, 'card');
      return fakeCardAdapterForNewAttempt;
    });

    assert.strictEqual(opened.skipped, false, `a fresh attempt must open, got skipped: ${opened.reason}`);
    assert.notStrictEqual(opened.attemptId, 'attempt-1', 'must be a brand-new attempt id, never the old resolved one');
    assert.strictEqual(opened.attemptNumber, 2);
    assert.strictEqual(state.collectionAttempts.size, 2, 'the old not_found_confirmed row and the new pending row must both exist');
    assert.strictEqual(state.collectionAttempts.get('attempt-1').status, 'not_found_confirmed', 'the old attempt is left exactly as reconcile resolved it');
    assert.strictEqual(state.collectionAttempts.get(opened.attemptId).status, 'pending');
  });

  // ---- 2. succeeded (CardCom recovery case) --------------------------

  await check('technical_failure attempt, provider now returns succeeded -> exactly one Payment created, correct amount, Statement transitions to paid', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement(), attempt: baseAttempt() });
    const fakeCardAdapter = {
      reconcile: async ({ attemptId }) => {
        assert.strictEqual(attemptId, 'attempt-1');
        return { outcome: 'succeeded', providerReference: 'TRAN-999', providerRawStatus: '0:OK' };
      },
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);
    const result = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });

    assert.strictEqual(result.outcome, 'succeeded');
    assert.strictEqual(result.attemptStatus, 'succeeded');
    assert.strictEqual(result.statementStatus, 'paid');
    assert.strictEqual(state.payments.size, 1);
    const payment = [...state.payments.values()][0];
    assert.strictEqual(payment.amount, '0.28');
    assert.strictEqual(payment.provider_reference, 'TRAN-999');
    assert.strictEqual(state.statements.get('stmt-1').status, 'paid');
  });

  // ---- 3. lookup itself fails -> ambiguous ---------------------------

  await check('technical_failure attempt, the reconcile lookup call itself fails -> outcome ambiguous, no Payment, attempt reflects ambiguous', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement(), attempt: baseAttempt() });
    const fakeCardAdapter = {
      reconcile: async () => { throw new Error('cardcom_lookup_transport_error: still 401'); },
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);
    const result = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });

    assert.strictEqual(result.outcome, 'ambiguous');
    assert.strictEqual(result.attemptStatus, 'ambiguous');
    assert.strictEqual(result.statementStatus, 'open');
    assert.strictEqual(state.payments.size, 0);
    assert.ok(result.failureReason && result.failureReason.includes('still 401'));
  });

  // ---- 4. idempotency: calling it twice with succeeded -----------------

  await check('calling reconcileCollectionAttempt TWICE with a succeeded outcome both times -> still exactly ONE Payment, second call does not crash', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement(), attempt: baseAttempt() });
    const fakeCardAdapter = {
      reconcile: async () => ({ outcome: 'succeeded', providerReference: 'TRAN-999', providerRawStatus: '0:OK' }),
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);

    const first = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });
    assert.strictEqual(first.outcome, 'succeeded');
    assert.strictEqual(state.payments.size, 1);

    // Second call must not throw despite the underlying unique_violation --
    // resolveAttempt's own UPDATE still runs, but the payments INSERT hits
    // the (provider, provider_reference) uniqueness the fake pool enforces
    // exactly like the real DB. collection.service.js#resolveAttempt does
    // not itself catch 23505 (only the reconciliation job does, as a
    // "someone else already resolved it" race outcome) -- so if this
    // second call actually threw, that would prove reconcileCollectionAttempt
    // is not safe to call twice. Assert it does NOT throw.
    let second;
    let threw = null;
    try {
      second = await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });
    } catch (err) {
      threw = err;
    }
    assert.strictEqual(threw, null, `second reconcile call must not crash: ${threw && threw.message}`);
    assert.strictEqual(state.payments.size, 1, 'still exactly one Payment after the second call');
    assert.strictEqual(second.outcome, 'succeeded');
  });

  // ---- 5. masav attempt -> rejected ----------------------------------

  await check('calling it on a masav-method attempt -> rejected RECONCILE_NOT_SUPPORTED_FOR_METHOD, getAdapter never consulted', async () => {
    const { fakePool } = createFakeState({
      statement: baseStatement({ id: 'stmt-2' }),
      attempt: baseAttempt({ id: 'attempt-2', statement_id: 'stmt-2', collection_method: 'masav', status: 'technical_failure' }),
    });
    // No fake adapter registered -- if getAdapter('card') (or any adapter)
    // were ever consulted, requiring the real registry would throw on an
    // unexpected method before reaching any assertion below, proving the
    // masav stub's (non-existent) reconcile is never invoked.
    const { billingOpsService } = freshModules(fakePool);
    await assert.rejects(
      () => billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-2', superAdminUserId: 'admin-1' }),
      (err) => { assert.strictEqual(err.code, 'RECONCILE_NOT_SUPPORTED_FOR_METHOD'); return true; }
    );
  });

  // ---- 6. nonexistent attempt -----------------------------------------

  await check('calling it on a nonexistent attempt id -> ATTEMPT_NOT_FOUND', async () => {
    const { fakePool } = createFakeState();
    const { billingOpsService } = freshModules(fakePool);
    await assert.rejects(
      () => billingOpsService.reconcileCollectionAttempt({ attemptId: 'does-not-exist', superAdminUserId: 'admin-1' }),
      (err) => { assert.strictEqual(err.code, 'ATTEMPT_NOT_FOUND'); return true; }
    );
  });

  // ---- 7. never mints a new ExternalUniqTranId -------------------------

  await check('the reconcile call is always made with the SAME attemptId as the one being reconciled -- the core safety property', async () => {
    const { fakePool } = createFakeState({ statement: baseStatement(), attempt: baseAttempt() });
    let seenAttemptId = null;
    const fakeCardAdapter = {
      reconcile: async ({ attemptId }) => { seenAttemptId = attemptId; return { outcome: 'not_found' }; },
    };
    const { billingOpsService } = freshModules(fakePool, fakeCardAdapter);
    await billingOpsService.reconcileCollectionAttempt({ attemptId: 'attempt-1', superAdminUserId: 'admin-1' });
    assert.strictEqual(seenAttemptId, 'attempt-1', 'reconcile() must be called with the exact attemptId requested, never a freshly generated id');
  });

  // ---- error-status.js mapping ------------------------------------------

  await check('error-status.js: RECONCILE_NOT_SUPPORTED_FOR_METHOD maps to 409, ATTEMPT_NOT_FOUND maps to 404', async () => {
    const { fakePool } = createFakeState();
    const { errorStatus } = freshModules(fakePool);
    assert.strictEqual(errorStatus.statusFor({ code: 'RECONCILE_NOT_SUPPORTED_FOR_METHOD' }), 409);
    assert.strictEqual(errorStatus.statusFor({ code: 'ATTEMPT_NOT_FOUND' }), 404);
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
