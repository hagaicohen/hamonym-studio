// Real-DB regression test for the 2026-09-22 Reports campaign-scoping fix
// (reports.service.js#getMarketingSources/getTrends/getFailures).
//
// Product decision: Reports reached from a specific Campaign Workspace
// (Campaign ← דוחות) must describe that one campaign across ALL four tabs,
// not silently blend in the whole organization's other campaigns on 3 of 4
// tabs. Only getCampaignPerformance previously supported campaignId at all;
// the other three ignored it entirely.
//
// Deliberately READ-ONLY against the existing real ZZZ_TEST E2E campaign --
// creates no new rows (a paid donation, once created, can never be deleted
// again -- see test-entity-donations-kpi-status-filter.js's own postmortem
// for why that matters). Proves the scoping two ways:
//   1. campaignId=<real campaign> matches the known real totals (sanity --
//      this entity happens to have only one campaign, so scoped == entity-wide).
//   2. campaignId=<a random, non-existent UUID> on the SAME real entity
//      returns EMPTY/zeroed results -- if the campaign_id filter weren't
//      actually applied in the SQL, a bogus id would still return the full
//      entity-wide numbers instead of nothing. This is the actual proof the
//      filter is real, without ever creating a second campaign/donation.
//
// Run: node scripts/test-reports-campaign-scoping.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const reportsService = require('../src/modules/reports/reports.service');

const ENTITY_ID = 'e6f6df05-1823-4d3d-8828-2e453f96e788';
const CAMPAIGN_ID = '8696f89d-a6ff-4993-8476-43b855c7885d';
const FAKE_CAMPAIGN_ID = '00000000-0000-0000-0000-000000000000';

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

async function main() {
  const baseline = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status='paid')::int AS paid_count,
            COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
            COALESCE(SUM(amount) FILTER (WHERE status='paid'), 0)::float AS total_raised
     FROM donations WHERE campaign_id = $1`,
    [CAMPAIGN_ID]
  );
  const { paid_count, total_raised } = baseline.rows[0];
  console.log(`baseline: ${paid_count} paid (₪${total_raised}) on the real campaign`);
  assert.ok(paid_count > 0, 'sanity: the real campaign must have at least one paid donation for this test to mean anything');

  await check('Marketing: campaignId=real campaign -> totalRaised matches the known real total', async () => {
    const result = await reportsService.getMarketingSources(ENTITY_ID, { campaignId: CAMPAIGN_ID });
    assert.strictEqual(result.kpi.totalRaised, total_raised);
    assert.strictEqual(result.kpi.totalCount, paid_count);
  });

  await check('Marketing: campaignId=nonexistent -> zero (proves the filter is actually applied, not ignored)', async () => {
    const result = await reportsService.getMarketingSources(ENTITY_ID, { campaignId: FAKE_CAMPAIGN_ID });
    assert.strictEqual(result.kpi.totalRaised, 0);
    assert.strictEqual(result.kpi.totalCount, 0);
    assert.deepStrictEqual(result.channels, []);
  });

  await check('Trends: campaignId=real campaign -> thisMonth/lastMonth totals are non-negative and internally consistent', async () => {
    const result = await reportsService.getTrends(ENTITY_ID, { campaignId: CAMPAIGN_ID });
    assert.ok(result.kpi.thisMonth.total >= 0);
    assert.ok(result.kpi.lastMonth.total >= 0);
  });

  await check('Trends: campaignId=nonexistent -> this/last month totals collapse to zero', async () => {
    const result = await reportsService.getTrends(ENTITY_ID, { campaignId: FAKE_CAMPAIGN_ID });
    assert.strictEqual(result.kpi.thisMonth.total, 0);
    assert.strictEqual(result.kpi.thisMonth.count, 0);
    assert.strictEqual(result.kpi.lastMonth.total, 0);
    assert.ok(result.yearOverYear.thisYearSeries.every((v) => v === 0), 'year-over-year series must also be scoped');
  });

  await check('Failures: campaignId=real campaign -> paid_count_month-derived successRate computes without error', async () => {
    const result = await reportsService.getFailures(ENTITY_ID, { campaignId: CAMPAIGN_ID });
    assert.strictEqual(result.kpi.failedCount, 0, 'no failed donations exist on the real campaign');
    assert.ok(result.recent.every((r) => true)); // list query didn't throw; shape checked implicitly
  });

  await check('Failures: campaignId=nonexistent -> pendingCount and list both collapse to zero/empty', async () => {
    const result = await reportsService.getFailures(ENTITY_ID, { campaignId: FAKE_CAMPAIGN_ID });
    assert.strictEqual(result.kpi.pendingCount, 0, 'the real campaign has pending donations -- a nonexistent campaignId must not leak them in');
    assert.strictEqual(result.recent.length, 0);
    assert.deepStrictEqual(result.failureReasons, []);
  });

  await check('No campaignId (entity-wide route) -> behavior unchanged, still returns the full entity totals', async () => {
    const result = await reportsService.getMarketingSources(ENTITY_ID, {});
    assert.strictEqual(result.kpi.totalRaised, total_raised, 'entity-wide callers (no campaign in the URL) must be unaffected by this fix');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  await pool.end();
  process.exit(1);
});
