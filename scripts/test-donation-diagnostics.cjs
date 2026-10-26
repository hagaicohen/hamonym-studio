'use strict';
// No real database, environment, HTTP client or payment provider is loaded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = process.env.HAMONYM_ADMIN_BACKEND_ROOT;
if (!root) throw new Error('Set HAMONYM_ADMIN_BACKEND_ROOT');
const diagnostic = require(path.join(root, 'src/modules/donations/failure-diagnostics'));
function fixture(providerResult, readRow) {
  const queries = [], payloads = [], module = { exports: {} };
  const db = { query: async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('FROM campaigns c')) return { rows: [{ id: 'c', entity_id: 'e', entity_status: 'active', title: 'Test', rewards: [], cardcom_terminal_number: 'test', cardcom_api_username: 'fixture', cardcom_api_password_encrypted: 'fixture', cardcom_connection_status: 'success' }] };
    if (sql.includes('INSERT INTO donations')) return { rows: [{ id: 'd' }] };
    if (sql.includes('FROM donations d WHERE d.id=$1')) return { rows: readRow ? [readRow] : [] };
    return { rows: [] };
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/modules/donations/donations.service.js'), 'utf8'), {
    module, exports: module.exports, process: { env: {} }, console: { log() {}, error() {} }, Date, Map, Set,
    require(name) {
      if (name === './failure-diagnostics') return diagnostic;
      if (name.endsWith('/db')) return db;
      if (name.endsWith('/donation-provider')) return { getDonationProvider: () => ({ createLowProfile: async payload => { payloads.push(payload); if (providerResult instanceof Error) throw providerResult; return providerResult; } }) };
      if (name.endsWith('/recurring.service')) return { createSignup: async () => 'recurring-fixture' };
      if (name.endsWith('/email.service')) return {};
      throw new Error('Unexpected dependency: ' + name);
    },
  });
  return { api: module.exports, queries, payloads };
}
const donation = { campaignId: 'c', amount: 1000, donor: { name: 'Fixture', email: 'fixture@example.test', phone: '000000000', idNumber: '123456782' } };
for (const recurring of [false, true]) {
  test(`provider rejection persists sanitized diagnostic, recurring=${recurring}`, async () => {
    const { api, queries, payloads } = fixture({ ResponseCode: 605, Description: 'SECRET API token donor@example.test' });
    await assert.rejects(api.createDonation({ ...donation, recurring }));
    const update = queries.find(q => q.sql.includes("status='failed'"));
    assert.equal(update.params[0], 'd');
    assert.equal(diagnostic.readFailureDiagnostic(update.params[1]).providerCode, 605);
    assert.equal(diagnostic.readFailureDiagnostic(update.params[1]).reason, 'api_user_blocked');
    assert.ok(diagnostic.readFailureDiagnostic(update.params[1]).failedAt);
    assert.doesNotMatch(update.params[1], /SECRET|token|donor@/);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].Document.TaxId, donation.donor.idNumber);
  });
  test(`success leaves payment initialization unchanged, recurring=${recurring}`, async () => {
    const { api, queries } = fixture({ ResponseCode: 0, LowProfileId: 'lp', Url: 'https://fixture.test' });
    const result = await api.createDonation({ ...donation, recurring, embedded: true });
    assert.equal(result.lowProfileId, 'lp'); assert.equal(result.url, 'https://fixture.test');
    assert.equal(queries.filter(q => q.sql.includes("status='failed'")).length, 0);
  });
}
test('transport errors capture only allowlisted metadata, not exception details', async () => {
  const error = Object.assign(new Error('secret password and donor'), { code: 'ETIMEDOUT', response: { data: { Description: 'secret raw response' } } });
  const { api, queries } = fixture(error);
  await assert.rejects(api.createDonation(donation));
  const stored = queries.find(q => q.sql.includes("status='failed'")).params[1];
  assert.equal(diagnostic.readFailureDiagnostic(stored).reason, 'provider_connection_failed');
  assert.doesNotMatch(stored, /secret|password|donor|Description/);
});
test('unknown code and historical raw errors never become invented diagnoses', () => {
  const value = diagnostic.captureInitializationFailure({ code: 1234, Description: 'secret' });
  assert.equal(diagnostic.readFailureDiagnostic(value).reason, 'unknown');
  assert.equal(diagnostic.readFailureDiagnostic(value).providerCode, 1234);
  for (const legacy of [null, '', 'Cardcom 605', 'secret token', '{bad json}']) assert.equal(diagnostic.readFailureDiagnostic(legacy), null);
  const unsafe = diagnostic.captureInitializationFailure({ code: '605 token=secret' });
  assert.equal(diagnostic.readFailureDiagnostic(unsafe).providerCode, null);
  assert.doesNotMatch(unsafe, /secret/);
});
test('Admin detail projection returns sanitized fields only and uses SELECT only', async () => {
  const { api, queries } = fixture(null, { id: 'd', status: 'failed', receipt_id: null, failure_reason: 'legacy secret 605', donor_email: 'secret@example.test', token: 'secret' });
  const result = await api.getPlatformDonationDiagnostics('d');
  assert.equal(result.failure_diagnostic, null);
  assert.doesNotMatch(JSON.stringify(result), /secret|token|donor_email|failure_reason/);
  assert.equal(queries.length, 1); assert.match(queries[0].sql.trim(), /^SELECT/);
});
test('diagnostic route is guarded by existing Super Admin middleware', () => {
  const routes = fs.readFileSync(path.join(root, 'src/modules/platform/cardcom-ops/cardcom-ops.routes.js'), 'utf8');
  assert.ok(routes.indexOf('router.use(requireSuperAdmin)') < routes.indexOf("router.get('/donations/:id'"));
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/middleware/require-super-admin.js'), 'utf8'), { module });
  let status, proceeded = false;
  const response = { status(code) { status = code; return this; }, json() {} };
  module.exports({ user: { isSuperAdmin: false } }, response, () => { proceeded = true; });
  assert.equal(status, 403); assert.equal(proceeded, false);
  module.exports({ user: { isSuperAdmin: true } }, response, () => { proceeded = true; });
  assert.equal(proceeded, true);
});
