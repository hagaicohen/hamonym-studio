'use strict';
// Isolated UI tests: Angular services, dialog and HTTP are mocked.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
function uiFixture() {
  const front = path.join(__dirname, '..');
  const ts = require(path.join(front, 'node_modules/typescript'));
  const file = 'src/app/modules/platform/pages/platform-collection-ops-page/platform-collection-ops-page.component.ts';
  const js = ts.transpileModule(fs.readFileSync(path.join(front, file), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, experimentalDecorators: true },
  }).outputText;
  const state = { calls: 0, confirmed: true, prompts: [], refreshes: 0 };
  const billing = { retryCardManually: (...args) => { state.calls++; state.args = args; return { subscribe: (handlers) => { state.handlers = handlers; } }; } };
  const module = { exports: {} };
  vm.runInNewContext(js, { module, exports: module.exports,
    window: { confirm: (text) => { throw Error('Browser confirmation forbidden'); } },
    require: (name) => {
      if (name === '@angular/core') return { Component: () => () => {}, inject: (token) => token.name === 'BillingOpsService' ? billing : {} };
      const tokens = {
        '@angular/common': ['CommonModule'], '@angular/forms': ['FormsModule'], '@angular/router': ['Router', 'RouterModule'],
        '../../services/billing-ops.service': ['BillingOpsService'], '../../services/finance-ops.service': ['FinanceOpsService'],
        '../../services/collection-ops.service': ['CollectionOpsService'], '../../services/billing-provisioning.service': ['BillingProvisioningService'],
        '../../services/simulation-clock.service': ['SimulationClockService'],
        '../../components/entity-combobox/entity-combobox.component': ['EntityComboboxComponent'],
      };
      assert.ok(tokens[name], `Blocked UI import: ${name}`);
      return Object.fromEntries(tokens[name].map((key) => [key, { [key]: class {} }[key]]));
    },
  });
  const page = new module.exports.PlatformCollectionOpsPageComponent();
  page.refreshDrawer = () => state.refreshes++;
  const item = { statementId: 's1', entityName: 'Mock nonprofit', amount: 143.37, previousAttempts: 3, latestAttemptId: 'a3', manualRetryEligible: true, manualRetryAmount: 143.37 };
  const dialog = { showModal() { state.open = true; }, close() { state.open = false; } };
  return { page, state, item, dialog };
}

test('opening and cancelling never charges; reason and modal target are required', () => {
  const { page, state, item, dialog } = uiFixture();
  page.manualRetryReason = 'reason'; page.retryCardManually(item);
  assert.equal(state.calls, 0);
  page.openManualRetry(item, dialog);
  assert.equal(state.open, true);
  page.retryCardManually(item); assert.equal(state.calls, 0);
  page.manualRetryReason = '   '; page.retryCardManually(item); assert.equal(state.calls, 0);
  page.closeManualRetry(); assert.equal(state.open, false);
  page.manualRetryReason = 'reason'; page.retryCardManually(item); assert.equal(state.calls, 0);
});

test('confirmation preserves payload and blocks duplicate requests, cancellation and target changes while busy', () => {
  const { page, state, item, dialog } = uiFixture();
  page.openManualRetry(item, dialog); page.manualRetryReason = '  API restored  ';
  page.retryCardManually({ ...item }); assert.equal(state.calls, 0);
  page.retryCardManually(item);
  assert.deepEqual(Array.from(state.args), ['s1', 'API restored', 'a3', 143.37]);
  page.closeManualRetry(); assert.equal(state.open, true);
  page.openManualRetry({ ...item }, dialog); assert.equal(page.manualRetryItem, item);
  page.retryCardManually(item); assert.equal(state.calls, 1);
  state.handlers.next({ result: { outcome: 'succeeded' } });
  assert.equal(page.attentionActionBusy, false); assert.equal(state.open, false);
  assert.equal(page.manualRetryItem, null); assert.equal(state.refreshes, 1);
  assert.match(page.manualRetryResult, /הצליחה/);
  page.retryCardManually(item); assert.equal(state.calls, 1);
});

test('ineligible obligations cannot open the confirmation or charge', () => {
  for (const overrides of [{ manualRetryEligible: false }, { latestAttemptId: null }]) {
    const { page, state, item, dialog } = uiFixture();
    page.openManualRetry({ ...item, ...overrides }, dialog);
    assert.equal(state.open, undefined); assert.equal(page.manualRetryItem, null);
    assert.equal(state.calls, 0);
  }
});

test('failure, uncertainty and transport error show application feedback and never auto-retry', () => {
  for (const result of [{ outcome: 'declined' }, { outcome: 'ambiguous' }, { outcome: 'technical_failure' }, { skipped: true }, null]) {
    const { page, state, item, dialog } = uiFixture();
    page.openManualRetry(item, dialog); page.manualRetryReason = 'reason'; page.retryCardManually(item);
    if (result) state.handlers.next({ result }); else state.handlers.error({});
    assert.equal(state.calls, 1); assert.equal(state.refreshes, 1); assert.equal(state.open, false);
    assert.equal(page.attentionActionBusy, false); assert.ok(page.manualRetryResult);
    assert.doesNotMatch(page.manualRetryResult, /הצליחה/);
    page.retryCardManually(item); assert.equal(state.calls, 1);
  }
});

test('modal template exposes obligation, required reason, warning, cancel and guarded confirm', () => {
  const html = fs.readFileSync(path.join(__dirname, '../src/app/modules/platform/pages/platform-collection-ops-page/platform-collection-ops-page.component.html'), 'utf8');
  const modal = html.slice(0, html.indexOf('</dialog>'));
  for (const value of ['dir="rtl"', 'item.entityName', 'item.amount', 'item.previousAttempts', 'CardCom', 'required', 'ביטול', 'אשר גבייה', 'attentionActionBusy || !manualRetryReason.trim()', 'closeManualRetry()']) assert.ok(modal.includes(value), value);
});
