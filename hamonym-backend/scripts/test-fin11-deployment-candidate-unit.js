'use strict';
// Candidate-only read-side contract tests; imports fail closed, never load a DB.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
function load(file, mocks) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, Date,
    require(name) { assert.ok(Object.hasOwn(mocks, name), `Blocked import: ${name}`); return mocks[name]; },
  }, { filename: file });
  return module.exports;
}
function fixture(hasPeriod = true, overrides = {}) {
  const periodStart = new Date('2026-10-01T00:00:00Z'), periodEnd = new Date('2026-10-28T18:00:00Z');
  const queries = [];
  const db = { query: async (sql) => {
    assert.match(sql.trim(), /^(SELECT|WITH)\b/);
    assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/);
    queries.push(sql);
    let rows;
    if (sql.includes('GROUP BY d.entity_id')) rows = [];
    else if (sql.includes('AS gross_raised') && sql.includes('FROM donations')) rows = [{ donation_count: 6, gross_raised: '1000' }];
    else if (sql.includes('FROM billing_periods WHERE period_start')) rows = hasPeriod ? [{ id: 'p1', period_start: periodStart, period_end: periodEnd }] : [];
    else if (sql.includes('WITH stmt AS')) rows = [{ statement_count: 1, billed_original: '143.37', adjustment_total: '0', collected_total: '0', in_process_total: '0', open_total: '143.37', ...overrides.aggregate }];
    else if (sql.includes('s.billing_period_id !=')) rows = [{ statement_count: 0, outstanding_total: '0' }];
    else if (sql.includes('SELECT s.id, ba.entity_id')) {
      assert.match(sql, /JOIN billing_accounts ba ON ba.id = s.billing_account_id/);
      assert.doesNotMatch(sql, /\bs\.entity_id\b/);
      rows = [{ id: 's1', entity_id: 'e1', total_due: '143.37', adj: '0', collected: '0', confirmed_card_collected: '0', confirmed_masav_collected: '0', last_attempt_method: 'card', last_attempt_status: 'technical_failure', ...overrides.overview }];
    } else if (sql.includes('AS attempted')) rows = [{ attempted: true }];
    else if (sql.includes("rf.finding_type = 'fin11_card_attempts_exhausted'")) rows = [{ finding_id: 1, statement_id: 's1', entity_name: 'Mock nonprofit', statement_status: 'open', total_due: '143.37', outstanding: '143.37', card_attempt_count: 3, failed_card_attempt_count: 3, successful_card_attempt_count: 0, latest_card_attempt_id: 'a3', manual_retry_safe: true, ...overrides.finding }];
    else if (sql.includes("rf.finding_type = 'statement_auto_approval_failed'")) rows = [];
    else assert.fail(`Unexpected query: ${sql}`);
    return { rows };
  } };
  const service = load('src/modules/platform/collection-ops/collection-ops.service.js', {
    '../../../db/db': db,
    '../../../jobs': {},
    '../../billing-engine/payment-exceptions.service': { listPaymentExceptions: async () => overrides.exceptions || [] },
    '../../billing-engine/masav-proposal.service': { listMasavProposals: async () => [] },
    '../../collection-engine/masav-collection.service': { listBlockedStatements: async () => [] },
    '../../billing-engine/platform-billing-settings.service': { getCurrentVatRate: async () => 0.18 },
    '../../billing-engine/billing-period.util': { resolveSelectedMonthBoundary: async (_, year, month) => {
      assert.equal(year, 2026); assert.equal(month, 10); return { periodStart, periodEnd };
    } },
    '../../collection-engine/routing': {},
    '../../../lib/clock': { now: async () => new Date('2026-11-02T18:00:00Z') },
  });
  return { service, queries };
}
test('Frontend 1537946 year/month overview contract with a real-shaped statement', async () => {
  const { service, queries } = fixture();
  const overview = await service.getFinancialOverview({ year: 2026, month: 10 });
  assert.equal(overview.period.id, 'p1'); assert.equal(overview.hasStatements, true);
  assert.equal(overview.totalBilled, 143.37); assert.equal(overview.cardOutstanding, 143.37);
  assert.equal(overview.cardCollected, 0); assert.equal(overview.masavOutstanding, 0);
  assert.equal(overview.periodDonations.grossRaised, 1000);
  assert.equal(overview.cardCollectionFailed, true); assert.equal(overview.cutoffPassed, true);
  assert.equal(overview.collectionAttempted, true); assert.ok(queries.length > 0);
});
test('unbilled month preserves nullable overview contract without creating a period', async () => {
  const { service } = fixture(false);
  const overview = await service.getFinancialOverview({ year: 2026, month: 10 });
  assert.equal(overview.hasStatements, false); assert.equal(overview.period.id, null);
  assert.equal(overview.totalBilled, null); assert.equal(overview.paidConfirmed, null);
  assert.equal(overview.collectionAttempted, false);
});
test('needs-attention supplies consent fields used by Frontend 1537946', async () => {
  const { service } = fixture();
  const attention = await service.getNeedsAttention();
  const item = attention.categories.find((c) => c.category === 'card_attempts_exhausted').items[0];
  assert.equal(item.manualRetryEligible, true); assert.equal(item.latestAttemptId, 'a3');
  assert.equal(item.previousAttempts, 3); assert.equal(item.amount, 143.37);
  assert.equal(item.manualRetryAmount, 143.37); assert.equal(item.statementId, 's1');
});
test('startup, routes, scheduler registration, dependencies and schema are unchanged from verified main', () => {
  const files = ['src/server.js', 'src/modules/platform/platform.routes.js',
    'src/modules/platform/billing-ops/billing-ops.routes.js', 'src/jobs/index.js',
    'src/jobs/cron-entry.js', 'package.json', 'package-lock.json'];
  for (const file of files) {
    const original = execFileSync('git', ['show', `81d3168:hamonym-backend/${file}`], { cwd: root });
    assert.equal(original.toString().replace(/\r\n/g, '\n'), fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n'), `Changed deployment surface: ${file}`);
  }
  const migrationDiff = execFileSync('git', ['diff', '81d3168', '--name-only', '--', 'hamonym-backend/migrations'], { cwd: root }).toString();
  assert.equal(migrationDiff.trim(), '');
  for (const file of ['src/modules/billing-engine/campaign-reset.service.js', 'src/lib/simulation-clock-admin.js',
    'src/modules/platform/campaign-reset/campaign-reset.routes.js', 'src/modules/platform/simulation-clock/simulation-clock.routes.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), false);
  }
});


test('paid after four failures and one success has consistent totals and no collection intervention', async () => {
  const { service } = fixture(true, {
    aggregate: { collected_total: '143.37', open_total: '0' },
    overview: { collected: '143.37', confirmed_card_collected: '143.37', last_attempt_status: 'succeeded' },
    finding: { statement_status: 'paid', outstanding: '0', card_attempt_count: 5, failed_card_attempt_count: 4, successful_card_attempt_count: 1 },
  });
  const overview = await service.getFinancialOverview({ year: 2026, month: 10 });
  assert.equal(overview.paidConfirmed, 143.37); assert.equal(overview.cardCollected, 143.37);
  assert.equal(overview.openBalance, 0); assert.equal(overview.cardOutstanding, 0);
  assert.equal(overview.cardCollectionFailed, false);
  const attention = await service.getNeedsAttention();
  assert.equal(attention.totalCount, 0);
  assert.equal(attention.categories.find(c => c.category === 'card_attempts_exhausted').count, 0);
});

test('zero balance without status catchup and retired debt do not retain exhausted alerts', async () => {
  for (const finding of [{ statement_status: 'open', outstanding: '0' }, { statement_status: 'paid', outstanding: '143.37' }, { statement_status: 'abandoned', outstanding: '143.37' }]) {
    const { service } = fixture(true, { finding });
    assert.equal((await service.getNeedsAttention()).totalCount, 0);
  }
});

test('remaining debt retains alert while total, failed and successful attempts remain distinct', async () => {
  const { service, queries } = fixture(true, { finding: { card_attempt_count: 5, failed_card_attempt_count: 4, successful_card_attempt_count: 1, manual_retry_safe: false } });
  const attention = await service.getNeedsAttention();
  const item = attention.categories.find(c => c.category === 'card_attempts_exhausted').items[0];
  assert.equal(attention.totalCount, 1); assert.equal(item.previousAttempts, 5);
  assert.equal(item.failedAttempts, 4); assert.equal(item.successfulAttempts, 1);
  assert.ok(item.reason.startsWith('4 ')); assert.equal(item.manualRetryEligible, false);
  const sql = queries.find(q => q.includes('AS failed_card_attempt_count'));
  assert.match(sql, /status IN \('declined', 'technical_failure'\)/);
  assert.match(sql, /status = 'succeeded'\) AS successful_card_attempt_count/);
});


test('statement table projects confirmed methods and latest timestamp solely from payment ledger', async () => {
  let query;
  const row = { id: 's1', status: 'paid', collected: '143.37', confirmed_collection_methods: ['card'], latest_collection_at: '2026-10-22T12:53:11.262Z' };
  const service = load('src/modules/platform/billing-ops/billing-ops.service.js', {
    '../../../db/db': { query: async (sql) => { query = sql; assert.match(sql.trim(), /^WITH/); return { rows: [row] }; } },
    '../../billing-engine/calculation.service': {}, '../../billing-engine/approval.service': {},
    '../../collection-engine/collection.service': {}, '../../collection-engine/routing': { CARD_MASAV_THRESHOLD: 3540 },
    '../../billing/billing.repository': {}, '../../collection-engine/adapters/get-adapter': {},
    '../../billing-engine/billing-period.util': {},
  });
  const rows = await service.listStatements({ periodId: 'p1' });
  assert.equal(rows[0].collected, '143.37'); assert.equal(rows[0].status, 'paid');
  assert.deepEqual(rows[0].confirmed_collection_methods, ['card']);
  assert.equal(rows[0].latest_collection_at, '2026-10-22T12:53:11.262Z');
  const methods = query.slice(query.indexOf('ARRAY(SELECT DISTINCT'), query.indexOf('AS confirmed_collection_methods'));
  assert.match(methods, /FROM payments p/); assert.match(methods, /ca.id = p.collection_attempt_id/);
  assert.doesNotMatch(methods, /routed_method|masav_collection_proposals|entity_masav_details/);
  assert.match(query, /MAX\(p.received_at\) FROM payments p WHERE p.statement_id = s.id/);
});


test('partial mixed confirmed payments are split by payment channel, never last attempted route', async () => {
  const { service, queries } = fixture(true, {
    aggregate: { collected_total: '60', open_total: '83.37' },
    overview: { collected: '60', confirmed_card_collected: '40', confirmed_masav_collected: '20', last_attempt_method: 'card' },
    finding: { outstanding: '83.37' },
  });
  const overview = await service.getFinancialOverview({ year: 2026, month: 10 });
  assert.equal(overview.cardCollected, 40); assert.equal(overview.masavCollected, 20);
  assert.equal(overview.paidConfirmed, 60); assert.equal(overview.openBalance, 83.37);
  const sql = queries.find(q => q.includes('AS confirmed_masav_collected'));
  assert.match(sql, /FROM payments p JOIN collection_attempts ca ON ca.id = p.collection_attempt_id/);
  assert.equal((await service.getNeedsAttention()).totalCount, 1);
});

test('a genuinely open payment exception remains actionable after a statement is paid', async () => {
  const { service } = fixture(true, {
    finding: { statement_status: 'paid', outstanding: '0' },
    exceptions: [{ id: 'exception1', statement_id: 's1', entity_name: 'Mock nonprofit', overpayment_amount: '10' }],
  });
  const attention = await service.getNeedsAttention();
  assert.equal(attention.totalCount, 1);
  assert.equal(attention.categories.find(c => c.category === 'open_overpayment_exception').count, 1);
  assert.equal(attention.categories.find(c => c.category === 'card_attempts_exhausted').count, 0);
});
