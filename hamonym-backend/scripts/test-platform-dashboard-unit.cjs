// Isolated Dashboard regression tests. All DB and collection-service imports
// are fail-closed mocks: no dotenv, live database, scheduler or provider access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function fixture(overrides = {}) {
  const state = { queries: [], financeReads: 0 };
  const donors = overrides.donors || [
    { name: 'תורם לדוגמה', firstDonationAt: '2026-10-05T21:30:00Z', firstDonationAmount: '100.25' },
    { name: null, firstDonationAt: '2026-10-06T10:00:00Z', firstDonationAmount: null },
  ];
  const db = { async query(sql, params) {
    assert.match(sql.trim(), /^(WITH|SELECT)\b/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CALL)\b/i);
    state.queries.push({ sql, params });
    if (overrides.fail && sql.includes(overrides.fail)) throw new Error('read failed');
    if (sql.includes('AS active_entities')) return { rows: [{ active_entities: 2, active_campaigns: 3 }] };
    if (sql.includes('first_donations AS')) return { rows: [{ month_start: '2026-10-01T00:00:00Z', month_end: '2026-11-01T00:00:00Z', donations_month: '350.75', new_donors: donors }] };
    if (sql.includes('points AS')) return { rows: overrides.trend || [{ date: '2026-09-30', value: 50, current: false }, { date: '2026-10-01', value: 100, current: true }] };
    if (sql.includes('FROM entities e') && sql.includes('AS reason')) return { rows: overrides.organizations || [{ id: 'org-1', name: 'עמותה לבדיקה', reason: 'ממתינה לאישור' }] };
    if (sql.includes('FROM reconciliation_findings rf')) return { rows: overrides.uncertain || [] };
    if (sql.includes(') events')) return { rows: overrides.activity || [
      { id: '1', kind: 'organization', subject_id: 'org-1', name: 'עמותה לדוגמה', action: 'approve', ts: '2026-10-22T10:00:00Z' },
      { id: '2', kind: 'donation', subject_id: '5f9fb2b7-7d39-44db-92a0-f450b552e2e4', name: 'קמפיין לדוגמה', detail: '143.37', ts: '2026-10-22T09:00:00Z' },
    ] };
    throw new Error('Unexpected query: ' + sql);
  } };
  const collectionOps = {
    async getNeedsAttention() { state.financeReads++; return overrides.attention || { categories: [] }; },
    async getFinancialReportPreview(args) { state.financeReads++; assert.equal(Object.keys(args).length, 0); return overrides.financialRows || [
      { status: 'approved', outstanding: 143.37 }, { status: 'open', outstanding: 20 },
      { status: 'paid', outstanding: 0 }, { status: 'draft', outstanding: 900 },
      { status: 'written_off', outstanding: 40 }, { status: 'open', outstanding: -5 },
    ]; },
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'src/modules/platform/dashboard-read.service.js'), 'utf8'), {
    module, exports: module.exports, Date,
    require(name) {
      if (name === '../../db/db') return db;
      if (name === './collection-ops/collection-ops.service') return collectionOps;
      throw new Error('Blocked unmocked import: ' + name);
    },
  });
  return { service: module.exports, state };
}
module.exports = { fixture };
if (require.main === module) {
  const { test } = require('node:test');
  test('donor card and Drawer share one result, first-paid date and amount; missing amounts stay missing', async () => {
    const { service, state } = fixture(); const result = await service.getOverview({ isSuperAdmin: true });
    assert.equal(result.kpis.newDonorsThisMonth, result.newDonors.length);
    assert.equal(result.newDonors[0].firstDonationAmount, 100.25);
    assert.equal(result.newDonors[1].firstDonationAmount, null);
    const sql = state.queries.find(q => q.sql.includes('first_donations AS')).sql;
    assert.match(sql, /DISTINCT ON/); assert.match(sql, /WHERE status = 'paid'/);
    assert.match(sql, /ORDER BY .*created_at, id/);
    assert.match(sql, /f.created_at >= b.start_at AND f.created_at < b.end_at/);
    assert.equal(result.kpis.donationsMonth, 350.75);
  });
  test('empty donors are genuinely zero in both card and Drawer', async () => {
    const result = await fixture({ donors: [] }).service.getOverview({ isSuperAdmin: true });
    assert.equal(result.kpis.newDonorsThisMonth, 0); assert.equal(result.newDonors.length, 0);
  });
  test('fees reuse ledger report balances; exclude drafts, written-off, paid and overpaid balances', async () => {
    const { service, state } = fixture(); const result = await service.getOverview({ isSuperAdmin: true });
    assert.equal(result.kpis.feesOutstanding, 163.37); assert.equal(state.financeReads, 2);
  });
  test('paid-after-failure history does not fabricate a collection alert', async () => {
    const result = await fixture({ organizations: [], financialRows: [{ status: 'paid', outstanding: 0 }] }).service.getOverview({ isSuperAdmin: true });
    assert.equal(result.kpis.feesOutstanding, 0); assert.equal(result.attention.length, 0); assert.equal(result.kpis.attentionCount, 0);
  });
  test('uncertain provider result remains visible even without outstanding debt', async () => {
    const { service, state } = fixture({ organizations: [], financialRows: [], uncertain: [{ id: 9, subject_type: 'collection_attempt', statement_id: 's1', entity_name: 'עמותה לבירור' }] });
    const result = await service.getOverview({ isSuperAdmin: true });
    assert.equal(result.kpis.feesOutstanding, 0); assert.equal(result.kpis.attentionCount, 1);
    assert.equal(result.attention[0].query.statementId, 's1');
    const sql = state.queries.find(q => q.sql.includes('FROM reconciliation_findings rf')).sql;
    assert.match(sql, /rf.resolved_at IS NULL/); assert.match(sql, /ca.status IN \('pending', 'ambiguous'\)/);
    assert.doesNotMatch(sql, /outstanding/);
  });
  test('financial attention is reused with concrete statement links and matching task count', async () => {
    const result = await fixture({ attention: { categories: [{ category: 'masav_blocked', items: [{ entityName: 'עמותה', reason: 'פרטים חסרים', nextAction: 'השלם פרטים', statementId: 's2' }] }] } }).service.getOverview({ isSuperAdmin: true });
    assert.equal(result.kpis.attentionCount, result.attention.length); assert.equal(result.attention[1].query.statementId, 's2');
  });
  for (const [range, span] of [['7d', '7 days'], ['30d', '30 days'], ['12m', '12 months']]) {
    test('trend ' + range + ' uses paid actual records and Israel calendar buckets plus previous period', async () => {
      const { service, state } = fixture(); const result = await service.getOverview({ range, isSuperAdmin: true });
      const sql = state.queries.find(q => q.sql.includes('points AS')).sql;
      assert.ok(sql.includes(span)); assert.match(sql, /Asia\/Jerusalem/); assert.match(sql, /d.status = 'paid'/);
      assert.equal(result.trend.total, 100); assert.equal(result.trend.previousTotal, 50); assert.equal(result.trend.points.length, 1);
    });
  }
  test('invalid trend input is rejected before queries; SQL fragments are never request text', async () => {
    const { service, state } = fixture(); await assert.rejects(service.getOverview({ range: "1; DROP TABLE donations" }), /Invalid dashboard range/); assert.equal(state.queries.length, 0);
  });
  test('scoped administrators never receive donor identities or financial details', async () => {
    const { service, state } = fixture(); const result = await service.getOverview({ permissions: ['campaigns'] });
    assert.equal(result.kpis.newDonorsThisMonth, null); assert.equal(result.newDonors.length, 0);
    assert.equal(result.kpis.feesOutstanding, null); assert.equal(result.trend, null); assert.equal(state.financeReads, 0);
    assert.equal(state.queries.length, 2); assert.deepEqual(Array.from(state.queries[1].params), [false, true, false]);
  });
  test('business events exclude technical audit actions and preserve cents and valid destinations', async () => {
    const { service, state } = fixture(); const result = await service.getOverview({ isSuperAdmin: true });
    assert.equal(result.activity[1].amount, 143.37); assert.equal(result.activity[1].query.status, 'paid');
    assert.equal(result.activity[0].route.join('/'), '/platform/organizations/org-1');
    const sql = state.queries.find(q => q.sql.includes(') events')).sql;
    assert.match(sql, /a.action IN/); assert.match(sql, /LIMIT 8/); assert.doesNotMatch(sql, /is_mock/);
  });
  test('Dashboard donation link applies the same Israel month boundaries without payment imports', async () => {
    const queries = [], module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'src/modules/donations/donations.service.js'), 'utf8'), {
      module, exports: module.exports, console, process: { env: {} },
      require(name) {
        if (name === '../../db/db') return { async query(sql, args) {
          assert.match(sql.trim(), /^SELECT/); queries.push({ sql, args });
          return { rows: sql.includes('count(*)::int AS total') ? [{ total: 0 }] : [] };
        } };
        if (name === '../payment/donation-provider') return { getDonationProvider() { throw new Error('Blocked payment provider'); } };
        if (name === '../email/email.service') return {};
        throw new Error('Blocked import: ' + name);
      },
    });
    const result = await module.exports.getPlatformDonations({ status: 'paid', period: 'this_month_israel' });
    assert.equal(result.total, 0); assert.equal(queries.length, 2);
    for (const q of queries) {
      assert.match(q.sql, /Asia\/Jerusalem/); assert.doesNotMatch(q.sql, /is_mock/);
      assert.match(q.sql, /d.created_at </); assert.ok(q.args.includes('paid'));
    }
    const donorSql = fixture(); await donorSql.service.getOverview({ isSuperAdmin: true });
    assert.match(donorSql.state.queries.find(q => q.sql.includes('first_donations AS')).sql, /Asia\/Jerusalem/);
  });
  test('read failures propagate as errors, never fabricated zero values', async () => {
    await assert.rejects(fixture({ fail: 'first_donations AS' }).service.getOverview({ isSuperAdmin: true }), /read failed/);
  });
}
