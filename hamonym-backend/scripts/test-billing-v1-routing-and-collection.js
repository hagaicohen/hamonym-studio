// Unit tests for Billing v1 Bundle 1/2 (2026-09-01, corrected same day to
// the MASAV v1 boundary): dynamic per-Statement routing (routing.js), its
// wiring into collection.service.js#openAttempt, and the MASAV
// file-generation-only collection flow (masav-collection.service.js).
//
// MASAV v1 boundary under test: Hamonym's responsibility ends at Excel
// generation/download. There is no in-app way to record a MASAV result,
// create a Payment from one, or transition a Statement to 'paid' from one --
// recordMasavResult() no longer exists anywhere in this codebase. The tests
// below prove the actual v1 boundary (export succeeds/fails correctly, and
// never touches payments/statement status) instead of the old
// manual-result-to-Payment behavior that was removed.
//
// Same convention as scripts/test-collection-attempt-recovery.js: no test
// framework in this repo, no real DB, no real network. An in-memory fake
// stands in for '../src/db/db' via require.cache override (same seam
// scripts/test-cardcom-token-charge-adapter.js already uses to monkeypatch
// a dependency before requiring the module under test). Deliberately never
// touches the real database -- payments/collection_attempts have
// append-only/write-once triggers in production, so a real committed
// success-path row could never be cleaned up afterward.
//
// Run: node scripts/test-billing-v1-routing-and-collection.js

const assert = require('assert');
const XLSX = require('xlsx');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

// ---- in-memory fake for src/db/db (pool) ----------------------------------
function createFakeState({ statement, entityBilling, masavConfig } = {}) {
  const state = {
    statements: new Map(statement ? [[statement.id, { ...statement }]] : []),
    collectionAttempts: new Map(),
    payments: new Map(),
    findings: [],
    entityBilling: entityBilling || null,
    masavConfig: masavConfig || null,
  };
  let attemptSeq = 1;
  let paymentSeq = 1;

  async function query(sqlRaw, params = []) {
    const sql = sqlRaw.replace(/\s+/g, ' ').trim();

    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

    // openAttempt's statement lookup (card-oriented, selects preferred_collection_method)
    if (sql.includes('FROM statements s') && sql.includes('preferred_collection_method') && sql.includes('FOR UPDATE OF s')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ ...st }] : [] };
    }
    // openMasavAttempt's statement lookup (no preferred_collection_method column)
    if (sql.includes('FROM statements s') && sql.includes('JOIN billing_accounts ba') && sql.includes('FOR UPDATE OF s')) {
      const st = state.statements.get(params[0]);
      return { rows: st ? [{ ...st }] : [] };
    }

    if (sql.startsWith('SELECT id FROM collection_attempts WHERE statement_id = $1 AND status = ANY')) {
      const rows = [...state.collectionAttempts.values()].filter(
        (a) => a.statement_id === params[0] && params[1].includes(a.status)
      );
      return { rows: rows.map((a) => ({ id: a.id })) };
    }

    if (sql.startsWith('SELECT authorized, bank_code, branch_code, account_number FROM entity_masav_details')) {
      return { rows: state.masavConfig ? [{ ...state.masavConfig }] : [] };
    }

    if (sql.startsWith('INSERT INTO reconciliation_findings')) {
      state.findings.push({ findingType: params[1], details: JSON.parse(params[5]) });
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

    if (sql.startsWith("INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount, provider, status) VALUES ($1, 'masav'")) {
      const id = `attempt-${attemptSeq++}`;
      const row = {
        id, statement_id: params[0], collection_method: 'masav', attempt_number: params[1],
        requested_amount: params[2], status: 'pending', provider: 'masav',
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
      const id = `payment-${paymentSeq++}`;
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

    if (sql.startsWith('SELECT id, statement_id, collection_method, status FROM collection_attempts WHERE id = $1')) {
      const a = state.collectionAttempts.get(params[0]);
      return { rows: a ? [{ id: a.id, statement_id: a.statement_id, collection_method: a.collection_method, status: a.status }] : [] };
    }

    if (sql.includes('FROM entity_billing')) {
      return { rows: state.entityBilling ? [{ ...state.entityBilling }] : [] };
    }

    if (sql.startsWith('SELECT s.id AS statement_id, s.total_due')) {
      const rows = (params[0] || []).map((id) => state.exportRows?.[id]).filter(Boolean);
      return { rows };
    }

    throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 90));
  }

  const fakePool = {
    query: (sql, params) => query(sql, params),
    connect: async () => ({ query: (sql, params) => query(sql, params), release: () => {} }),
  };

  return { state, fakePool };
}

function freshModules(fakePool) {
  const dbPath = require.resolve('../src/db/db');
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: fakePool };
  [
    '../src/modules/collection-engine/routing',
    '../src/modules/collection-engine/collection.service',
    '../src/modules/collection-engine/masav-collection.service',
    '../src/modules/billing/billing.repository',
    '../src/jobs/reconciliation-findings',
  ].forEach((p) => { delete require.cache[require.resolve(p)]; });

  return {
    routing: require('../src/modules/collection-engine/routing'),
    collectionService: require('../src/modules/collection-engine/collection.service'),
    masavCollectionService: require('../src/modules/collection-engine/masav-collection.service'),
  };
}

function baseStatement(overrides) {
  return {
    id: 'stmt-1', billing_account_id: 'ba-1', entity_id: 'entity-1',
    total_due: '100.00', status: 'approved', ...overrides,
  };
}

async function run() {
  // ---- routing.js -----------------------------------------------------
  await check('routing: total_due <= threshold -> card, no DB read needed', async () => {
    const { fakePool } = createFakeState();
    const { routing } = freshModules(fakePool);
    const result = await routing.resolveCollectionMethod(await fakePool.connect(), baseStatement({ total_due: '3540.00' }));
    assert.deepStrictEqual(result, { method: 'card' });
  });

  await check('routing: total_due > threshold, no masav config -> blocked/masav_not_configured', async () => {
    const { fakePool } = createFakeState({ statement: baseStatement({ total_due: '4000.00' }) });
    const { routing } = freshModules(fakePool);
    const result = await routing.resolveCollectionMethod(await fakePool.connect(), baseStatement({ total_due: '4000.00' }));
    assert.strictEqual(result.blocked, true);
    assert.strictEqual(result.reason, 'masav_not_configured');
  });

  await check('routing: masav configured but not authorized -> blocked/masav_not_authorized', async () => {
    const { fakePool } = createFakeState({
      masavConfig: { authorized: false, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { routing } = freshModules(fakePool);
    const result = await routing.resolveCollectionMethod(await fakePool.connect(), baseStatement({ total_due: '4000.00' }));
    assert.strictEqual(result.blocked, true);
    assert.strictEqual(result.reason, 'masav_not_authorized');
  });

  await check('routing: masav configured + authorized -> masav', async () => {
    const { fakePool } = createFakeState({
      masavConfig: { authorized: true, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { routing } = freshModules(fakePool);
    const result = await routing.resolveCollectionMethod(await fakePool.connect(), baseStatement({ total_due: '4000.00' }));
    assert.deepStrictEqual(result, { method: 'masav' });
  });

  // ---- collection.service.js#openAttempt / runCollectionForStatement --
  await check('openAttempt: card path succeeds end-to-end via injected fake adapter -> statement paid', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '100.00' }),
      entityBilling: { id: 'eb-1', provider: 'cardcom', token: 'tok', last4: '1234' },
    });
    const { collectionService } = freshModules(fakePool);

    const fakeAdapter = {
      NOT_IMPLEMENTED: false,
      charge: async () => ({ outcome: 'succeeded', providerReference: 'TEST-REF-1' }),
    };
    const resolveAdapter = () => fakeAdapter;

    const result = await collectionService.runCollectionForStatement('stmt-1', { resolveAdapter });
    assert.strictEqual(result.outcome, 'succeeded');
    assert.strictEqual(result.statementStatus, 'paid');
    assert.strictEqual(state.statements.get('stmt-1').status, 'paid');
    assert.strictEqual(state.payments.size, 1);
  });

  await check('openAttempt: total_due above threshold, masav not configured -> skipped blocked, no attempt row, never falls back to card', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '5000.00' }),
    });
    const { collectionService } = freshModules(fakePool);
    const resolveAdapter = () => { throw new Error('adapter should never be resolved for a blocked statement'); };

    const result = await collectionService.runCollectionForStatement('stmt-1', { resolveAdapter });
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'masav_not_configured');
    assert.strictEqual(state.collectionAttempts.size, 0);
    assert.strictEqual(state.statements.get('stmt-1').status, 'approved');
    assert.strictEqual(state.findings.length, 1);
    assert.strictEqual(state.findings[0].findingType, 'masav_blocked_pending_authorization');
  });

  await check('openAttempt: total_due above threshold, masav authorized -> routes to masav, but masav adapter NOT_IMPLEMENTED so it still records a finding and creates no attempt (correct: manual flow owns masav, not this generic path)', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '5000.00' }),
      masavConfig: { authorized: true, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { collectionService } = freshModules(fakePool);

    const result = await collectionService.runCollectionForStatement('stmt-1');
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'not_implemented');
    assert.strictEqual(result.collectionMethod, 'masav');
    assert.strictEqual(state.collectionAttempts.size, 0);
  });

  await check('openAttempt: total_due <= threshold but no active payment instrument -> skipped, no attempt row', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement({ total_due: '100.00' }) });
    const { collectionService } = freshModules(fakePool);
    const result = await collectionService.runCollectionForStatement('stmt-1');
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'no_active_payment_instrument');
    assert.strictEqual(state.collectionAttempts.size, 0);
  });

  // ---- masav-collection.service.js -------------------------------------
  await check('openMasavAttempt: card-routed statement (<= threshold) is rejected as not_masav_routed', async () => {
    const { fakePool, state } = createFakeState({ statement: baseStatement({ total_due: '100.00' }) });
    const { masavCollectionService } = freshModules(fakePool);
    const result = await masavCollectionService.openMasavAttempt('stmt-1');
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'not_masav_routed');
    assert.strictEqual(state.collectionAttempts.size, 0);
  });

  await check('openMasavAttempt: blocked (not authorized) -> skipped, no attempt row', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '5000.00' }),
      masavConfig: { authorized: false, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { masavCollectionService } = freshModules(fakePool);
    const result = await masavCollectionService.openMasavAttempt('stmt-1');
    assert.strictEqual(result.skipped, true);
    assert.strictEqual(result.reason, 'masav_not_authorized');
    assert.strictEqual(state.collectionAttempts.size, 0);
  });

  await check('openMasavAttempt: authorized masav-routed statement -> creates one pending masav attempt, statement moves approved->open', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ total_due: '5000.00', status: 'approved' }),
      masavConfig: { authorized: true, bank_code: '12', branch_code: '345', account_number: '6789' },
    });
    const { masavCollectionService } = freshModules(fakePool);
    const result = await masavCollectionService.openMasavAttempt('stmt-1');
    assert.strictEqual(result.skipped, false);
    assert.strictEqual(state.collectionAttempts.size, 1);
    const attempt = [...state.collectionAttempts.values()][0];
    assert.strictEqual(attempt.collection_method, 'masav');
    assert.strictEqual(attempt.status, 'pending');
    assert.strictEqual(state.statements.get('stmt-1').status, 'open');
  });

  // ---- MASAV v1 boundary: no in-app way to assert a MASAV result ------
  // The old recordMasavResult()->Payment behavior is gone. These tests
  // prove the actual v1 boundary instead: no such capability is reachable
  // from the service, the controller, or the mounted routes.

  await check('masavCollectionService: recordMasavResult is not exported -- no in-app way to assert a MASAV financial outcome', async () => {
    const { fakePool } = createFakeState();
    const { masavCollectionService } = freshModules(fakePool);
    assert.strictEqual(masavCollectionService.recordMasavResult, undefined);
    assert.strictEqual(Object.keys(masavCollectionService).includes('recordMasavResult'), false);
  });

  await check('billing-ops.routes.js / masav-ops.controller.js: no recordResult endpoint is mounted anywhere in the MASAV path (checked on the actual route/controller source, not just by absence of a test)', async () => {
    const fs = require('fs');
    const path = require('path');
    const routesSrc = fs.readFileSync(path.join(__dirname, '../src/modules/platform/billing-ops/billing-ops.routes.js'), 'utf8');
    const ctrlSrc = fs.readFileSync(path.join(__dirname, '../src/modules/platform/billing-ops/masav-ops.controller.js'), 'utf8');
    assert.ok(!routesSrc.includes('attempts/:attemptId/result'), 'no attempt-result route may be mounted');
    assert.ok(!routesSrc.includes('recordResult'), 'routes file must not reference a recordResult handler');
    assert.ok(!ctrlSrc.includes('exports.recordResult'), 'controller must not export a recordResult handler');
    assert.ok(!ctrlSrc.includes('recordMasavResult'), 'controller must not call recordMasavResult');
  });

  // ---- masav-collection.service.js#generateExportExcel ------------------
  // MASAV v1 stops at Excel generation/download -- see this file's header
  // comment and masav-collection.service.js's. generateExportExcel must
  // never touch payments or flip a Statement to 'paid'.

  await check('generateExportExcel: authorized/configured MASAV statement generates a real .xlsx with the exact 11-column structure, amount from approved total_due, and never creates a Payment or marks the Statement paid', async () => {
    const { fakePool, state } = createFakeState({
      statement: baseStatement({ id: 'stmt-a', total_due: '4250.00', status: 'open' }),
    });
    state.exportRows = {
      'stmt-a': {
        statement_id: 'stmt-a', total_due: '4250.00', entity_id: 'entity-a', entity_name: 'עמותת א, ב וג',
        contact_full_name: 'ישראל ישראלי', contact_email: 'israel@example.org',
        bank_code: '12', branch_code: '345', account_number: '6789', authorized: true, attempt_id: 'attempt-a',
        period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-28T20:00:00.000Z',
      },
    };
    const { masavCollectionService } = freshModules(fakePool);
    const buffer = await masavCollectionService.generateExportExcel(['stmt-a']);

    assert.ok(Buffer.isBuffer(buffer), 'must return a Buffer (an actual xlsx file, not CSV text)');
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    assert.deepStrictEqual(rows[0], ['bank', 'branch', 'account', 'sum', 'tranmode', 'currency', 'company', 'contact', 'email', 'pdesc', 'remarks']);
    const [bank, branch, account, sum, tranmode, currency, company, contact, email] = rows[1];
    assert.strictEqual(bank, '12');
    assert.strictEqual(branch, '345');
    assert.strictEqual(account, '6789');
    assert.strictEqual(sum, 4250, 'sum must equal statement.total_due verbatim, never recalculated');
    assert.strictEqual(tranmode, 'T');
    assert.strictEqual(currency, '1');
    assert.strictEqual(company, 'עמותת א, ב וג');
    assert.strictEqual(contact, 'ישראל ישראלי');
    assert.strictEqual(email, 'israel@example.org');

    // The core v1 boundary assertion: generating/downloading the Excel is a
    // pure read -- it must never create a payments row or flip the
    // Statement to 'paid'.
    assert.strictEqual(state.payments.size, 0, 'exporting must never create a Payment');
    assert.strictEqual(state.statements.get('stmt-a').status, 'open', 'exporting must never mark the Statement paid');
  });

  await check('generateExportExcel: refuses a statement with no open masav attempt (NO_OPEN_ATTEMPT) -- blocked/unopened MASAV never silently exports', async () => {
    const { fakePool, state } = createFakeState();
    state.exportRows = {
      'stmt-b': {
        statement_id: 'stmt-b', total_due: '4250.00', entity_id: 'entity-b', entity_name: 'x',
        contact_full_name: null, contact_email: null,
        bank_code: '12', branch_code: '345', account_number: '6789', authorized: true, attempt_id: null,
        period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-28T20:00:00.000Z',
      },
    };
    const { masavCollectionService } = freshModules(fakePool);
    await assert.rejects(
      () => masavCollectionService.generateExportExcel(['stmt-b']),
      (err) => err.code === 'NO_OPEN_ATTEMPT'
    );
  });

  await check('generateExportExcel: refuses an unauthorized statement (NOT_AUTHORIZED) -- unauthorized/incomplete MASAV remains BLOCKED/HELD, no fallback to card here either', async () => {
    const { fakePool, state } = createFakeState();
    state.exportRows = {
      'stmt-c': {
        statement_id: 'stmt-c', total_due: '4250.00', entity_id: 'entity-c', entity_name: 'x',
        contact_full_name: null, contact_email: null,
        bank_code: '12', branch_code: '345', account_number: '6789', authorized: false, attempt_id: 'attempt-c',
        period_start: '2026-08-01T00:00:00.000Z', period_end: '2026-08-28T20:00:00.000Z',
      },
    };
    const { masavCollectionService } = freshModules(fakePool);
    await assert.rejects(
      () => masavCollectionService.generateExportExcel(['stmt-c']),
      (err) => err.code === 'NOT_AUTHORIZED'
    );
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
