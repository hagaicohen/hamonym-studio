// Unit tests for collection-attempt-reconciliation.job.js's recovery logic
// (2026-08-30) -- the orchestration that turns a stuck 'ambiguous'/'pending'
// collection_attempts row into a resolved one via the CardCom adapter's
// reconcile(), now that reconcile() is live-verified against the real API.
//
// No real DB, no real network call: db.query is a routing fake keyed on
// distinctive SQL substrings, and getAdapter/resolveAttemptFn are injected
// fakes (same seam collection.service.js already uses for its own tests).
// Deliberately does NOT hit the real database -- a real payments row cannot
// be deleted afterward (migration 059's append-only trigger), so exercising
// the real success path against production would create exactly the
// irreversible test fact this session has been avoiding throughout. The
// underlying primitives (adapter classification, resolveAttempt's own
// atomicity/uniqueness handling) were already proven separately -- see
// scripts/test-cardcom-token-charge-adapter.js and the prior session's own
// collection.service.js testing.
//
// Run: node scripts/test-collection-attempt-recovery.js

const assert = require('assert');
const { reconcileStuckAttempts } = require('../src/jobs/collection-attempt-reconciliation.job');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return fn()
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

// candidateRows: what the main SELECT should return this run.
function fakeDb(candidateRows) {
  const calls = { findingInserts: [] };
  const db = {
    calls,
    query: async (sql, params) => {
      if (sql.includes('FROM collection_attempts') && sql.includes("status = 'ambiguous'")) {
        return { rows: candidateRows };
      }
      if (sql.includes('INSERT INTO reconciliation_findings')) {
        calls.findingInserts.push({ jobName: params[0], findingType: params[1], subjectId: params[4] });
        return { rows: [] };
      }
      if (sql.includes('FROM statements s') && sql.includes('total_due')) {
        return { rows: [] }; // no overpaid statements in these tests
      }
      if (sql.includes('UPDATE reconciliation_findings')) {
        return { rowCount: 0 };
      }
      throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 60));
    },
  };
  return db;
}

async function run() {
  await check('provider-success recovered (simulates: CardCom charged, Hamonym crashed before recording it) -> resolveAttempt called once, reconciled', async () => {
    const row = { id: 'attempt-1', statement_id: 'stmt-1', status: 'ambiguous', collection_method: 'card' };
    const db = fakeDb([row]);
    let resolveCalls = [];
    const getAdapter = () => ({ reconcile: async ({ attemptId }) => {
      assert.strictEqual(attemptId, 'attempt-1', 'must reconcile using the SAME attemptId, never a new one');
      return { outcome: 'succeeded', providerReference: '999' };
    }});
    const resolveAttemptFn = async (attemptId, statementId, outcome) => {
      resolveCalls.push({ attemptId, statementId, outcome });
      return { attemptId, outcome: outcome.outcome, statementStatus: 'paid' };
    };
    const result = await reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn });
    assert.strictEqual(result.reconciled, 1);
    assert.strictEqual(resolveCalls.length, 1);
    assert.strictEqual(resolveCalls[0].attemptId, 'attempt-1');
    assert.strictEqual(resolveCalls[0].statementId, 'stmt-1');
  });

  await check('transport ambiguity (reconcile lookup itself throws) -> left untouched, recorded as a finding, resolveAttempt never called', async () => {
    const row = { id: 'attempt-2', statement_id: 'stmt-2', status: 'ambiguous', collection_method: 'card' };
    const db = fakeDb([row]);
    const getAdapter = () => ({ reconcile: async () => { throw new Error('network down'); } });
    let resolveCalled = false;
    const resolveAttemptFn = async () => { resolveCalled = true; };
    const result = await reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn });
    assert.strictEqual(result.lookupFailed, 1);
    assert.strictEqual(resolveCalled, false);
    assert.strictEqual(db.calls.findingInserts.length, 1);
    assert.strictEqual(db.calls.findingInserts[0].findingType, 'collection_attempt_stuck');
  });

  await check('not_found preserves ambiguity -- never treated as declined, never recharged', async () => {
    const row = { id: 'attempt-3', statement_id: 'stmt-3', status: 'pending', collection_method: 'card' };
    const db = fakeDb([row]);
    const getAdapter = () => ({ reconcile: async () => ({ outcome: 'not_found' }) });
    let resolveCalled = false;
    const resolveAttemptFn = async () => { resolveCalled = true; };
    const result = await reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn });
    assert.strictEqual(result.stillUnresolved, 1);
    assert.strictEqual(resolveCalled, false);
  });

  await check('concurrent reconciliation race: resolveAttempt hits unique_violation (23505) -> counted as raceLost, not a crash, not double-processed', async () => {
    const row = { id: 'attempt-4', statement_id: 'stmt-4', status: 'ambiguous', collection_method: 'card' };
    const db = fakeDb([row]);
    const getAdapter = () => ({ reconcile: async () => ({ outcome: 'succeeded', providerReference: '111' }) });
    const resolveAttemptFn = async () => { const e = new Error('duplicate key'); e.code = '23505'; throw e; };
    const result = await reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn });
    assert.strictEqual(result.raceLost, 1);
    assert.strictEqual(result.reconciled, 0);
  });

  await check('a genuine non-race error from resolveAttempt is NOT swallowed', async () => {
    const row = { id: 'attempt-5', statement_id: 'stmt-5', status: 'ambiguous', collection_method: 'card' };
    const db = fakeDb([row]);
    const getAdapter = () => ({ reconcile: async () => ({ outcome: 'succeeded', providerReference: '222' }) });
    const resolveAttemptFn = async () => { throw new Error('unexpected DB error'); };
    await assert.rejects(() => reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn }), /unexpected DB error/);
  });

  await check('unsupported/unimplemented adapter (e.g. masav) -> skipped safely, recorded as stuck, no crash', async () => {
    const row = { id: 'attempt-6', statement_id: 'stmt-6', status: 'ambiguous', collection_method: 'masav' };
    const db = fakeDb([row]);
    const getAdapter = () => null; // masav has no reconcile() today
    const result = await reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn: async () => { throw new Error('should not be called'); } });
    assert.strictEqual(result.stuckFound, 1);
    assert.strictEqual(result.reconciled, 0);
  });

  await check('repeated run after successful resolution is a clean no-op (idempotent by construction: resolved rows no longer match the candidate query)', async () => {
    const db = fakeDb([]); // nothing ambiguous/pending anymore
    const result = await reconcileStuckAttempts(db, {});
    assert.strictEqual(result.checked, 0);
    assert.strictEqual(result.reconciled, 0);
  });

  await check('declined outcome also finalizes via resolveAttempt (not just succeeded)', async () => {
    const row = { id: 'attempt-7', statement_id: 'stmt-7', status: 'ambiguous', collection_method: 'card' };
    const db = fakeDb([row]);
    const getAdapter = () => ({ reconcile: async () => ({ outcome: 'declined', failureReason: 'cardcom_response_3' }) });
    let capturedOutcome = null;
    const resolveAttemptFn = async (attemptId, statementId, outcome) => { capturedOutcome = outcome; return { outcome: outcome.outcome }; };
    const result = await reconcileStuckAttempts(db, { getAdapter, resolveAttemptFn });
    assert.strictEqual(result.reconciled, 1);
    assert.strictEqual(capturedOutcome.outcome, 'declined');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
