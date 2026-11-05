'use strict';
// Fail-closed tests: no real database, payment adapter or external service import.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function load(file, mocks = {}, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, Date, console,
    require: (name) => { if (name.endsWith('/fin11-simulation-context')) return { current: () => undefined, assertEntity() {} }; assert.ok(Object.hasOwn(mocks, name), `Blocked import: ${name}`); return mocks[name]; },
    ...extra,
  }, { filename: file });
  return module.exports;
}
function fixture() {
  const state = { status: 'open', outstanding: 143.37, collected: 0, held: false, masav: null, card: true, routed: 'card', auditFails: false, charges: 0, outcome: 'declined' };
  const attempts = [1, 2, 3].map((n) => ({ id: `a${n}`, attempt_number: n, status: 'declined', collection_method: 'card', requested_amount: 143.37, provider: 'cardcom' }));
  const audit = [], payments = [], queries = [];
  let lock = Promise.resolve();
  const pool = { async connect() {
    let unlock, inserted, audited, committed = false;
    const client = { release() {}, async query(sql, args) {
      queries.push(sql);
      if (sql === 'BEGIN') return { rows: [] };
      if (sql.includes('FOR UPDATE OF s')) {
        const previous = lock;
        lock = new Promise((resolve) => { unlock = resolve; });
        await previous;
        return { rows: [{ id: 's1', entity_id: 'e1', status: state.status, total_due: 143.37 }] };
      }
      if (sql === 'COMMIT' || sql === 'ROLLBACK') {
        if (sql === 'COMMIT') committed = true;
        if (sql === 'ROLLBACK' && !committed) {
          if (inserted) attempts.splice(attempts.indexOf(inserted), 1);
          if (audited) audit.splice(audit.indexOf(audited), 1);
        }
        if (unlock) { unlock(); unlock = null; }
        return { rows: [] };
      }
      if (sql.includes("AND status = 'succeeded'")) return { rows: attempts.filter((a) => a.status === 'succeeded') };
      if (sql.includes('SELECT id FROM collection_attempts')) return { rows: attempts.filter((a) => ['pending', 'ambiguous'].includes(a.status)) };
      if (sql.includes('SELECT id, status FROM collection_attempts') || sql.includes('SELECT status FROM collection_attempts')) return { rows: attempts.filter((a) => a.collection_method === 'card').slice().reverse() };
      if (sql.includes('MAX(attempt_number)')) return { rows: [{ next: attempts.length + 1 }] };
      if (sql.includes('INSERT INTO collection_attempts')) {
        inserted = { id: `a${attempts.length+1}`, attempt_number: args[2], collection_method: args[1], requested_amount: args[3], status: 'pending', provider: 'cardcom' };
        attempts.push(inserted); return { rows: [inserted] };
      }
      if (sql.includes('INSERT INTO platform_audit_log')) {
        if (state.auditFails) throw Error('mock audit failure');
        audited = { user: args[0], entity: args[1], notes: JSON.parse(args[2]) };
        audit.push(audited); return { rows: [] };
      }
      if (sql.includes('UPDATE collection_attempts')) {
        const row = attempts.find((a) => a.id === args[0]);
        row.status = args[1]; row.provider_reference = args[2]; return { rows: [] };
      }
      if (sql.includes('SELECT requested_amount, provider')) return { rows: [attempts.find((a) => a.id === args[0])] };
      if (sql.includes('INSERT INTO payments')) {
        if (payments.some((p) => p.attemptId === args[1])) { const err = Error('duplicate'); err.code = '23505'; throw err; }
        payments.push({ attemptId: args[1], amount: args[2] });
        state.collected += args[2]; state.outstanding = Math.round((state.outstanding - args[2]) * 100) / 100;
        return { rows: [] };
      }
      if (sql.includes('UPDATE statements')) { state.status = sql.includes("'paid'") ? 'paid' : 'open'; return { rows: [] }; }
      throw Error(`Unexpected SQL: ${sql}`);
    } };
    return client;
  } };
  const balance = { getStatementBalance: async () => ({ outstanding: state.outstanding, adjustedTotal: 143.37, collected: state.collected }) };
  const schema = { isPaymentExceptionsSchemaPresent: async () => true, isMasavProposalsSchemaPresent: async () => true };
  const hold = { hasOpenCollectionHold: async () => ({ held: state.held }) };
  const masav = { hasExportedMasavProposal: async () => ({ exists: state.masav === 'exported' }), hasActiveMasavProposal: async () => ({ exists: !!state.masav }) };
  const adapter = { charge: async () => {
    state.charges++;
    if (state.outcome === 'throw') throw Error('connection lost');
    return { outcome: state.outcome, providerReference: `ref${attempts.length}` };
  } };
  const engine = load('src/modules/collection-engine/collection.service.js', {
    '../../db/db': pool,
    '../billing/billing.repository': { getActiveDefaultByEntityId: async () => state.card ? { token: 'fake' } : null },
    './adapters/get-adapter': () => adapter,
    './routing': { resolveCollectionMethod: async () => ({ method: state.routed }) },
    '../../jobs/reconciliation-findings': { recordFinding: async () => {} },
    '../billing-engine/statement-balance.service': balance,
    '../billing-engine/payment-exceptions.service': hold,
    '../billing-engine/fin11-schema-probe': schema,
    '../billing-engine/masav-proposal.service': masav,
    '../billing-engine/fin11-card-collection.service': { notifyExhaustedCardStatement: async () => {} },
  });
  const automatic = load('src/modules/billing-engine/fin11-card-collection.service.js', {
    '../../db/db': pool,
    '../billing/billing.repository': { getActiveDefaultByEntityId: async () => ({ token: 'fake' }) },
    '../../jobs/reconciliation-findings': { recordFinding: async () => {} },
    '../email/admin-notification.service': { queueAdminNotification: () => {} },
    './statement-balance.service': balance, './payment-exceptions.service': hold, './fin11-schema-probe': schema,
    './masav-proposal.service': masav,
    './billing-period.util': { computeAttemptDueInstant: async () => ({ dueAt: new Date(0), maxAttempts: 3 }) },
    '../collection-engine/collection.service': engine,
  });
  const authorization = { isSuperAdmin: true, superAdminUserId: 42, confirmed: true, reason: 'API block removed; retry approved', expectedAttemptId: 'a3', expectedOutstanding: 143.37, ip: 'mock' };
  const retry = (overrides = {}) => engine.runSuperAdminManualCardRetry('s1', { ...authorization, ...overrides });
  return { state, attempts, audit, payments, queries, engine, automatic, retry };
}
test('authorized fourth attempt records consent, preserves history, and saves real success', async () => {
  const f = fixture(); f.state.outcome = 'succeeded';
  const before = JSON.stringify(f.attempts);
  const result = await f.retry();
  assert.equal(result.outcome, 'succeeded'); assert.equal(f.state.status, 'paid');
  assert.equal(f.state.outstanding, 0); assert.equal(f.state.charges, 1);
  assert.equal(f.attempts.length, 4); assert.equal(JSON.stringify(f.attempts.slice(0, 3)), before);
  assert.equal(f.payments[0].amount, 143.37);
  assert.equal(f.audit[0].user, 42); assert.equal(f.audit[0].notes.attemptId, 'a4');
  assert.equal(f.audit[0].notes.expectedAttemptId, 'a3'); assert.ok(f.audit[0].notes.reason);
  assert.ok(f.queries.findIndex((q) => q.includes('INSERT INTO platform_audit_log')) < f.queries.indexOf('COMMIT'));
});
test('failed manual attempt never replenishes automatic allowance or deletes history', async () => {
  const f = fixture();
  assert.equal((await f.retry()).outcome, 'declined');
  assert.equal((await f.automatic.collectWithRetries('s1', () => assert.fail('automatic charge forbidden')))[0].reason, 'max_attempts_reached');
  assert.equal((await f.engine.runCollectionForStatement('s1')).reason, 'max_attempts_reached');
  assert.equal(f.state.charges, 1); assert.equal(f.attempts.length, 4); assert.equal(f.audit.length, 1);
});
test('same confirmation is stale even after a fast failed manual attempt', async () => {
  const f = fixture(); await f.retry();
  assert.equal((await f.retry()).reason, 'manual_retry_stale_or_ineligible');
  assert.equal(f.state.charges, 1); assert.equal(f.audit.length, 1);
});
test('concurrent requests serialize on the existing Statement lock and charge once', async () => {
  const f = fixture();
  const results = await Promise.all([f.retry(), f.retry()]);
  assert.equal(f.state.charges, 1); assert.equal(f.attempts.length, 4);
  assert.equal(results.filter((r) => r.skipped).length, 1); assert.equal(f.audit.length, 1);
});
for (const change of [{ isSuperAdmin: false }, { superAdminUserId: null }, { confirmed: false }, { reason: '' }, { expectedAttemptId: '' }, { expectedOutstanding: 0 }]) test(`invalid authorization rejected: ${JSON.stringify(change)}`, async () => {
  const f = fixture(); await assert.rejects(f.retry(change));
  assert.equal(f.state.charges, 0); assert.equal(f.queries.length, 0);
});
for (const [label, configure] of [
  ['paid', (f) => { f.state.status = 'paid'; f.state.outstanding = 0; }],
  ['changed balance', (f) => { f.state.outstanding = 140; }],
  ['pending', (f) => { f.attempts[2].status = 'pending'; }],
  ['ambiguous', (f) => { f.attempts[2].status = 'ambiguous'; }],
  ['previous MASAV success', (f) => { f.attempts.push({ id: 'masav1', attempt_number: 4, collection_method: 'masav', status: 'succeeded' }); }],
  ['previous success', (f) => { f.attempts[0].status = 'succeeded'; }],
  ['hold', (f) => { f.state.held = true; }],
  ['no card', (f) => { f.state.card = false; }],
  ['MASAV route', (f) => { f.state.routed = 'masav'; }],
  ['MASAV proposed', (f) => { f.state.masav = 'proposed'; }],
  ['MASAV approved', (f) => { f.state.masav = 'approved'; }],
  ['MASAV exported', (f) => { f.state.masav = 'exported'; }],
  ['before exhaustion', (f) => { f.attempts.pop(); }],
]) test(`financial guard preserved: ${label}`, async () => {
  const f = fixture(); configure(f); assert.equal((await f.retry()).skipped, true);
  assert.equal(f.state.charges, 0); assert.equal(f.audit.length, 0);
});
test('audit failure rolls back the new intent before any provider call', async () => {
  const f = fixture(); f.state.auditFails = true;
  await assert.rejects(f.retry(), /mock audit failure/);
  assert.equal(f.state.charges, 0); assert.equal(f.attempts.length, 3);
});
test('lost provider response remains ambiguous and blocks further manual collection', async () => {
  const f = fixture(); f.state.outcome = 'throw';
  assert.equal((await f.retry()).outcome, 'ambiguous');
  assert.equal((await f.retry({ expectedAttemptId: 'a4' })).reason, 'attempt_already_active');
  assert.equal(f.state.charges, 1);
  await f.engine.resolveAttempt('a4', 's1', { outcome: 'succeeded', providerReference: 'reconciled' });
  assert.equal(f.state.status, 'paid'); assert.equal(f.payments.length, 1);
});
test('ordinary callers cannot supply a general bypass flag', async () => {
  const f = fixture();
  assert.equal((await f.engine.runCollectionForStatement('s1', { manualRetry: true })).reason, 'max_attempts_reached');
  assert.equal((await f.engine.openAttempt('s1', () => ({}), { manualRetry: true })).reason, 'max_attempts_reached');
  assert.equal(f.state.charges, 0);
});
test('existing route middleware denies non-Super Admin and controller uses trusted identity', async () => {
  const guard = load('src/middleware/require-super-admin.js');
  let status;
  guard({ user: { isSuperAdmin: false } }, { status: (s) => { status = s; return { json() {} }; } }, () => assert.fail('must deny'));
  assert.equal(status, 403);
  let captured;
  const ctrl = load('src/modules/platform/billing-ops/billing-ops.controller.js', {
    './billing-ops.service': { triggerCollection: async (args) => { captured = args; return {}; } },
    '../../billing-engine/statement-balance.service': {}, './error-status': { statusFor: () => 500 },
  });
  await ctrl.triggerCollection({ params: { id: 's1' }, user: { id: 42, isSuperAdmin: true }, body: { manualRetry: true, superAdminUserId: 999, isSuperAdmin: false }, ip: 'mock' }, { json() {} });
  assert.equal(captured.superAdminUserId, 42); assert.equal(captured.isSuperAdmin, true);
});
// Exercise the actual TypeScript component without Angular bootstrapping/network.
function uiFixture() {
  const front = process.env.HAMONYM_TEST_FRONTEND_ROOT || path.join(root, '..', 'hamonym-app');
  const ts = require(path.join(front, 'node_modules/typescript'));
  const file = 'src/app/modules/platform/pages/platform-collection-ops-page/platform-collection-ops-page.component.ts';
  const js = ts.transpileModule(fs.readFileSync(path.join(front, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
  }).outputText;
  const state = { calls: 0, confirmed: true, prompts: [], refreshes: 0 };
  const billing = { retryCardManually: (...args) => { state.calls++; state.args = args; return { subscribe: (handlers) => { state.handlers = handlers; } }; } };
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports,
    window: { confirm: (text) => { state.prompts.push(text); return state.confirmed; } },
    require: (name) => {
      if (name === '@angular/core') return { Component: () => () => {}, inject: (token) => token.name === 'BillingOpsService' ? billing : {} };
      const tokens = {
        '@angular/common': ['CommonModule'], '@angular/forms': ['FormsModule'], '@angular/router': ['ActivatedRoute', 'Router', 'RouterModule'],
        '../../services/billing-ops.service': ['BillingOpsService'], '../../services/finance-ops.service': ['FinanceOpsService'],
        '../../services/collection-ops.service': ['CollectionOpsService'], '../../services/billing-provisioning.service': ['BillingProvisioningService'],
        '../../services/simulation-clock.service': ['SimulationClockService'],
        '../../../../shared/directives/money-input.directive': ['MoneyInputDirective'],
        '../../components/entity-combobox/entity-combobox.component': ['EntityComboboxComponent'],
      };
      assert.ok(tokens[name], `Blocked UI import: ${name}`);
      return Object.fromEntries(tokens[name].map((key) => [key, { [key]: class {} }[key]]));
    },
  });
  const page = new module.exports.PlatformCollectionOpsPageComponent();
  page.refreshDrawer = () => state.refreshes++;
  const item = { statementId: 's1', entityName: 'Mock nonprofit', amount: 143.37, previousAttempts: 3, latestAttemptId: 'a3', manualRetryEligible: true, manualRetryAmount: 143.37 };
  const dialog = { showModal() {}, close() {} };
  return { page, state, item, dialog };
}
test('UI requires reason and confirmation, displays obligation, blocks repeated submissions and refreshes actual result', () => {
  const { page, state, item, dialog } = uiFixture();
  page.retryCardManually(item); assert.equal(state.calls, 0);
  page.openManualRetry(item, dialog); page.closeManualRetry();
  page.retryCardManually(item); assert.equal(state.calls, 0);
  page.openManualRetry(item, dialog); page.manualRetryReason = 'block removed';
  page.retryCardManually(item); assert.equal(page.manualRetryItem, item);
  assert.equal(state.prompts.length, 0);
  assert.equal(page.attentionActionBusy, true); page.retryCardManually(item); assert.equal(state.calls, 1);
  state.handlers.next({ result: { outcome: 'succeeded' } });
  assert.equal(page.attentionActionBusy, false); assert.match(page.manualRetryResult, /הצליחה/); assert.equal(state.refreshes, 1);
});
test('UI failure/uncertainty never reports success or auto-resubmits', () => {
  for (const result of [{ outcome: 'declined' }, { outcome: 'ambiguous' }, { skipped: true }]) {
    const { page, state, item, dialog } = uiFixture(); page.openManualRetry(item, dialog); page.manualRetryReason = 'confirmed';
    page.retryCardManually(item); state.handlers.next({ result });
    assert.doesNotMatch(page.manualRetryResult, /הצליחה/); assert.equal(state.calls, 1);
    assert.equal(state.refreshes, 1);
  }
  const { page, state, item, dialog } = uiFixture(); page.openManualRetry(item, dialog); page.manualRetryReason = 'confirmed';
  page.retryCardManually(item); state.handlers.error({});
  assert.match(page.manualRetryResult, /היסטוריית/); assert.equal(state.calls, 1); assert.equal(state.refreshes, 1);
});
