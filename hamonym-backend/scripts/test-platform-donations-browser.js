// Regression coverage for donations.service.js#getPlatformDonations --
// Platform Admin's cross-entity, read-only donations browser (2026-09-15
// product decision: "תרومות" should primarily let an operator find/
// identify a real donation, not just show engine health).
//
// Real-DB fixture, following the same convention as
// scripts/test-billing-bulk-approval-live-fixture.js: only 'pending'
// donations are ever created here (never 'paid') specifically so cleanup
// stays possible -- migration 055's trg_donations_block_paid_delete blocks
// deleting a 'paid' row with no is_mock exception, so a real paid donation
// created by this script could never be cleaned up again.
//
// Run: node scripts/test-platform-donations-browser.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const donationsService = require('../src/modules/donations/donations.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FIXTURE_TAG = `ZZZ_TEST_DONATIONS_BROWSER_${Date.now()}`;
const SUPER_ADMIN_USER_ID = 17;

async function main() {
  const fixture = { entityId: null, campaignId: null, donationIds: [] };

  try {
    const entity = await pool.query(
      `INSERT INTO entities (display_name, created_by_user_id, status, entity_type)
       VALUES ($1, $2, 'active', 'association') RETURNING id`,
      [FIXTURE_TAG, SUPER_ADMIN_USER_ID]
    );
    fixture.entityId = entity.rows[0].id;

    const campaign = await pool.query(
      `INSERT INTO campaigns (entity_id, title, slug, status, target_amount)
       VALUES ($1, $2, $3, 'published', 1000) RETURNING id`,
      [fixture.entityId, FIXTURE_TAG, `zzz-test-donations-browser-${Date.now()}`]
    );
    fixture.campaignId = campaign.rows[0].id;

    // A real (non-mock) pending donation this test's filters should find.
    const realDonation = await pool.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, is_mock, created_at)
       VALUES ($1, $2, 77.00, $3, 'pending', false, NOW()) RETURNING id`,
      [fixture.campaignId, fixture.entityId, `${FIXTURE_TAG} donor`]
    );
    fixture.donationIds.push(realDonation.rows[0].id);

    // A mock donation on the SAME campaign/entity -- must never appear,
    // regardless of any other filter.
    const mockDonation = await pool.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, is_mock, created_at)
       VALUES ($1, $2, 999.00, $3, 'pending', true, NOW()) RETURNING id`,
      [fixture.campaignId, fixture.entityId, `${FIXTURE_TAG} mock donor`]
    );
    fixture.donationIds.push(mockDonation.rows[0].id);

    await check('finds the real donation by entityId filter, excludes the mock one on the same entity', async () => {
      const res = await donationsService.getPlatformDonations({ entityId: fixture.entityId, page: 0, limit: 25 });
      assert.strictEqual(res.total, 1, 'is_mock=true donation must never be counted, even scoped to its own entity');
      assert.strictEqual(res.donations[0].id, realDonation.rows[0].id);
      assert.strictEqual(res.donations[0].entity_name, FIXTURE_TAG);
      assert.strictEqual(res.donations[0].campaign_title, FIXTURE_TAG);
      assert.strictEqual(Number(res.donations[0].amount), 77);
      assert.strictEqual(res.donations[0].is_recurring, false);
    });

    await check('search matches donor name', async () => {
      const res = await donationsService.getPlatformDonations({ search: `${FIXTURE_TAG} donor`, page: 0, limit: 25 });
      assert.strictEqual(res.total, 1);
      assert.strictEqual(res.donations[0].id, realDonation.rows[0].id);
    });

    await check('search matches campaign title', async () => {
      const res = await donationsService.getPlatformDonations({ search: FIXTURE_TAG, campaignId: fixture.campaignId, page: 0, limit: 25 });
      assert.strictEqual(res.total, 1);
    });

    await check('search matches association (entity) display name', async () => {
      const res = await donationsService.getPlatformDonations({ search: FIXTURE_TAG, entityId: fixture.entityId, page: 0, limit: 25 });
      assert.strictEqual(res.total, 1);
    });

    await check('status filter scopes correctly (pending finds it, paid does not)', async () => {
      const pendingRes = await donationsService.getPlatformDonations({ entityId: fixture.entityId, status: 'pending', page: 0, limit: 25 });
      assert.strictEqual(pendingRes.total, 1);
      const paidRes = await donationsService.getPlatformDonations({ entityId: fixture.entityId, status: 'paid', page: 0, limit: 25 });
      assert.strictEqual(paidRes.total, 0);
    });

    await check('pagination envelope shape matches every other Platform Admin list endpoint', async () => {
      const res = await donationsService.getPlatformDonations({ entityId: fixture.entityId, page: 0, limit: 25 });
      assert.ok('donations' in res && 'total' in res && 'page' in res && 'limit' in res);
      assert.strictEqual(res.page, 0);
      assert.strictEqual(res.limit, 25);
    });
  } finally {
    // Cleanup -- safe because every donation created here is 'pending',
    // never 'paid' (see header comment).
    if (fixture.donationIds.length) await pool.query(`DELETE FROM donations WHERE id = ANY($1::uuid[])`, [fixture.donationIds]);
    if (fixture.campaignId) await pool.query(`DELETE FROM campaigns WHERE id = $1`, [fixture.campaignId]);
    if (fixture.entityId) await pool.query(`DELETE FROM entities WHERE id = $1`, [fixture.entityId]);
  }

  await check('cleanup verification: zero residue', async () => {
    const { rows } = await pool.query(`SELECT count(*) FROM entities WHERE display_name = $1`, [FIXTURE_TAG]);
    assert.strictEqual(Number(rows[0].count), 0);
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
