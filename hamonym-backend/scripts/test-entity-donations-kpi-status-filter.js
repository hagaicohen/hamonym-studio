// Real-DB regression test for the 2026-09-22 fix to
// donations.service.js#getEntityDonations -- the KPI summary cards (total
// raised, paid/failed/pending counts, avg amount) used to share the SAME
// status-filtered WHERE clause as the list query. Filtering the list to one
// status (e.g. "pending") made every summary card read ₪0/0, since a
// `FILTER (WHERE d.status = 'paid')` over a result set already restricted to
// status='pending' can only ever be empty. Found live: filtering the real
// Donations manager UI to "pending" zeroed out total raised / paid count /
// avg amount, which should stay stable regardless of the list's own filter.
//
// Deliberately READ-ONLY against the existing real ZZZ_TEST E2E campaign
// (its dataset -- 3 paid totalling ₪182, 3 pending -- was already manually
// verified against this exact same live campaign this session). Creates no
// new rows: an earlier version of this script inserted throwaway `status =
// 'paid'` fixture rows directly, which cannot actually be cleaned up --
// donations_block_paid_delete() permanently blocks deleting any paid
// donation regardless of how it became paid. That mistake is why
// `ZZZ_TEST donations-kpi-status-filter` (3 stuck paid rows + its campaign/
// entity) now permanently exists in the DB; documented, not hidden.
//
// Run: node scripts/test-entity-donations-kpi-status-filter.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const donationsService = require('../src/modules/donations/donations.service');

const ENTITY_ID = 'e6f6df05-1823-4d3d-8828-2e453f96e788';
const CAMPAIGN_ID = '8696f89d-a6ff-4993-8476-43b855c7885d';

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function approx(actual, expected, msg) {
  assert.ok(Math.abs(actual - expected) < 0.005, `${msg}: expected ~${expected}, got ${actual}`);
}

async function main() {
  // Confirm the known baseline hasn't drifted before asserting against it
  // (this campaign is live E2E evidence other people/scripts could touch).
  const baseline = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE status='paid')::int AS paid_count,
            COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
            COALESCE(SUM(amount) FILTER (WHERE status='paid'), 0)::float AS total_raised
     FROM donations WHERE campaign_id = $1`,
    [CAMPAIGN_ID]
  );
  const { paid_count, pending_count, total_raised } = baseline.rows[0];
  console.log(`baseline: ${paid_count} paid (₪${total_raised}), ${pending_count} pending`);

  await check('A. status=all -> KPI summary matches the known real totals', async () => {
    const result = await donationsService.getEntityDonations(ENTITY_ID, { status: 'all', campaignId: CAMPAIGN_ID });
    assert.strictEqual(result.kpi.paidCount, paid_count);
    approx(result.kpi.totalRaised, total_raised, 'totalRaised');
    assert.strictEqual(result.kpi.pendingCount, pending_count);
  });

  await check('B. status=pending -> KPI summary STILL reflects the real paid totals (the actual bug)', async () => {
    const result = await donationsService.getEntityDonations(ENTITY_ID, { status: 'pending', campaignId: CAMPAIGN_ID });
    assert.strictEqual(result.kpi.paidCount, paid_count, 'paid count must not collapse to 0 just because the list is filtered to pending');
    approx(result.kpi.totalRaised, total_raised, 'total raised must not collapse to ₪0');
    assert.strictEqual(result.kpi.pendingCount, pending_count);
    // The LIST and its own pagination total DO respect the filter.
    assert.ok(result.donations.length > 0, 'sanity: this campaign has pending rows to show');
    assert.ok(result.donations.every((d) => d.status === 'pending'));
    assert.strictEqual(result.kpi.total, pending_count, 'pagination total matches the FILTERED list, not the unfiltered one');
  });

  await check('C. status=paid -> KPI summary unchanged, list filtered to only paid rows', async () => {
    const result = await donationsService.getEntityDonations(ENTITY_ID, { status: 'paid', campaignId: CAMPAIGN_ID });
    assert.strictEqual(result.kpi.paidCount, paid_count);
    approx(result.kpi.totalRaised, total_raised, 'totalRaised');
    assert.strictEqual(result.donations.length, paid_count);
    assert.ok(result.donations.every((d) => d.status === 'paid'));
    assert.strictEqual(result.kpi.total, paid_count);
  });

  await check('D. status=failed -> KPI summary unchanged (real paid totals), list correctly empty (no failed rows exist)', async () => {
    const result = await donationsService.getEntityDonations(ENTITY_ID, { status: 'failed', campaignId: CAMPAIGN_ID });
    assert.strictEqual(result.kpi.paidCount, paid_count);
    approx(result.kpi.totalRaised, total_raised, 'totalRaised');
    assert.strictEqual(result.donations.length, 0);
    assert.strictEqual(result.kpi.total, 0);
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
