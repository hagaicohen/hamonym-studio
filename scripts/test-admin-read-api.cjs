'use strict';
// Run with HAMONYM_ADMIN_BACKEND_ROOT pointing to the edited backend. No DB modules are loaded.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const backend = process.env.HAMONYM_ADMIN_BACKEND_ROOT;
if (!backend) throw new Error('Set HAMONYM_ADMIN_BACKEND_ROOT to the edited hamonym-backend directory');
function service(file, respond) {
  const queries = [], module = { exports: {} };
  const db = { query: async (sql, params) => { assert.match(sql.trim(), /^SELECT\b/); assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CALL)\b/i); queries.push({ sql, params }); return { rows: respond(sql, params) }; }, connect: () => assert.fail('No database connections') };
  const forbidden = new Proxy(function () { assert.fail('Unexpected external dependency executed'); }, { get: () => forbidden });
  vm.runInNewContext(fs.readFileSync(path.join(backend, file), 'utf8'), { module, exports: module.exports, require: name => name.endsWith('/db') ? db : name === './failure-diagnostics' ? require(path.join(backend, 'src/modules/donations/failure-diagnostics')) : forbidden, console, Date, Set, Map, Object, Number }, { filename: file });
  return { api: module.exports, queries };
}
test('donation read API returns a full filtered paid-only summary independent of pagination', async () => {
  const { api, queries } = service('src/modules/donations/donations.service.js', sql => sql.includes('AS paid_count') ? [{ total: 5, paid_count: 1, failed_count: 4, paid_amount: 143.37 }] : [{ id: 'succeeded', amount: 143.37, status: 'paid', payment_method: 'card' }]);
  const result = await api.getPlatformDonations({ page: 4, limit: 1 });
  assert.equal(result.adminListVersion, 1); assert.equal(result.total, 5); assert.equal(result.donations.length, 1);
  assert.equal(result.summary.paidAmount, 143.37); assert.equal(result.summary.paidCount, 1); assert.equal(result.summary.failedCount, 4);
  assert.equal(queries.length, 2); assert.match(queries[1].sql, /SUM\(d.amount\) FILTER \(WHERE d.status = 'paid'\)/);
  assert.doesNotMatch(queries[1].sql, /LIMIT|OFFSET/); assert.match(queries[0].sql, /d.is_mock = false/);
});
test('donation filters bind dates and payment method; recurring filter is validated, never interpolated from input', async () => {
  const { api, queries } = service('src/modules/donations/donations.service.js', sql => sql.includes('AS paid_count') ? [{ total: 0, paid_count: 0, failed_count: 0, paid_amount: 0 }] : []);
  const attack = "' OR 1=1--";
  await api.getPlatformDonations({ search: attack, dateFrom: '2026-10-01', dateTo: '2026-10-31', recurring: 'true', paymentMethod: 'card' });
  for (const query of queries) { assert.doesNotMatch(query.sql, /' OR 1=1--/); assert.ok(query.params.includes('%' + attack + '%')); assert.ok(query.params.includes('2026-10-01')); assert.ok(query.params.includes('2026-10-31')); assert.ok(query.params.includes('card')); assert.match(query.sql, /Asia\/Jerusalem/); assert.match(query.sql, /d.recurring_instruction_id IS NOT NULL/); }
});
test('card method requires provider/recurring evidence; NULL source is never assumed to prove a card payment', async () => {
  const { api, queries } = service('src/modules/donations/donations.service.js', sql => sql.includes('AS paid_count') ? [{ total: 0, paid_count: 0, failed_count: 0, paid_amount: 0 }] : []);
  await api.getPlatformDonations({});
  assert.match(queries[0].sql, /WHEN d.low_profile_id IS NOT NULL OR d.recurring_instruction_id IS NOT NULL THEN 'card' ELSE NULL END/);
  assert.match(queries[0].sql, /SELECT r.id FROM receipts r WHERE r.donation_id = d.id/);
  const projection = queries[0].sql.slice(0, queries[0].sql.indexOf('FROM donations d'));
  assert.doesNotMatch(projection, /donor_email|donor_phone|card_token|api_password|provider_raw|provider_reference/);
});
test('Super Admin list exposes safe diagnostics and never legacy raw error text', async () => {
  const { api } = service('src/modules/donations/donations.service.js', sql => sql.includes('AS paid_count') ? [{ total: 1, paid_count: 0, failed_count: 1, paid_amount: 0 }] : [{ id: 'failed', status: 'failed', failure_reason: 'raw secret token 605' }]);
  const result = await api.getPlatformDonations({});
  assert.equal(result.donations[0].failure_reason, null);
  assert.equal(result.donations[0].failure_diagnostic, null);
  assert.doesNotMatch(JSON.stringify(result), /raw secret|token 605/);
});
test('campaign list exposes end date and bound nonprofit-name search without altering campaign mutations', async () => {
  const { api, queries } = service('src/modules/platform/platform.service.js', sql => sql.includes('c.end_date,') ? [] : [{ total: 0 }]);
  const result = await api.getCampaigns({ search: 'עמותה', sortBy: 'progress', sortDir: 'desc', dateFrom: '2026-10-01', dateTo: '2026-10-31' });
  assert.equal(result.adminListVersion, 1); assert.match(queries[0].sql, /c\.end_date/); assert.match(queries[0].sql, /OR e.display_name ILIKE/);
  assert.match(queries[0].sql, /ORDER BY CASE WHEN c.target_amount > 0 THEN c.current_amount \/ c.target_amount ELSE 0 END DESC, c.id/);
  assert.ok(queries[1].params.includes('2026-10-31')); assert.match(queries[1].sql, /Asia\/Jerusalem/);
});
test('user role, entity, account status and full-admin filters combine without changing permissions', async () => {
  const { api, queries } = service('src/modules/platform/platform.service.js', sql => sql.includes('json_agg') ? [] : [{ total: 0 }]);
  const result = await api.getUsers({ roleId: 2, entityId: 'entity-test', status: 'disabled', superAdminOnly: true });
  assert.equal(result.adminListVersion, 1);
  for (const query of queries) { assert.match(query.sql, /u.is_active = false/); assert.match(query.sql, /u.is_super_admin = true/); assert.match(query.sql, /EXISTS \(SELECT 1 FROM user_entities/); assert.ok(query.params.includes(2)); assert.ok(query.params.includes('entity-test')); }
  assert.match(queries[0].sql, /json_build_object\('entity_id', e.id, 'entity_name', e.display_name, 'role', ue.role\)/);
  assert.doesNotMatch(queries[0].sql, /password_hash|password_reset_token/);
});
test('invalid date syntax is rejected before any database query', async () => {
  const { api, queries } = service('src/modules/donations/donations.service.js', () => []);
  await assert.rejects(api.getPlatformDonations({ dateFrom: "2026-10-01');DROP TABLE donations;--" }), /תאריך/); assert.equal(queries.length, 0);
});
test('new filter parameters are wired only into existing read controllers', async () => {
  const captured = [], module = { exports: {} };
  const svc = { getCampaigns: async query => { captured.push(query); return {}; }, getUsers: async query => { captured.push(query); return {}; } };
  vm.runInNewContext(fs.readFileSync(path.join(backend, 'src/modules/platform/platform.controller.js'), 'utf8'), { module, exports: module.exports, require: name => name === './platform.service' ? svc : {}, console });
  const response = { json: () => {}, status: () => assert.fail('Unexpected read error') };
  await module.exports.getCampaigns({ query: { dateFrom: '2026-10-01', dateTo: '2026-10-31' } }, response);
  await module.exports.getUsers({ query: { entityId: 'e', superAdminOnly: '1', status: 'active', roleId: '2' } }, response);
  assert.equal(captured[0].dateFrom, '2026-10-01'); assert.equal(captured[1].entityId, 'e'); assert.equal(captured[1].superAdminOnly, true); assert.equal(captured[1].roleId, 2);
});
