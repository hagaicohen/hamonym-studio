// Real-DB regression test for two independent fixes recovered from the
// stale local worktree (2026-10-09, final dirty-recovery slice):
//
// 1. donation `note` -- Checkout V2 (already shipped) collects a donor
//    dedication message and sends it as `note` on createDonation, but the
//    backend silently dropped the field entirely (not destructured in
//    either the controller or the service). Fixed to persist it into the
//    existing donations.note column (previously write-only from the admin
//    manual-entry flow) -- no schema change, no new display surface.
//
// 2. admin `completedAt` sort -- the already-shipped PaidDonationToastComponent
//    sends sortBy=completedAt to GET /api/donations/entity/:id, but
//    SORT_COLUMNS had no such key, so it silently fell back to
//    `d.created_at` -- wrong when a donation sits 'pending' for a while
//    (webhook lag) before flipping to 'paid'.
//
// axios.post is monkey-patched so createDonation never makes a real CardCom
// call (same convention as test-donation-server-validation.js). No donation
// here is ever marked 'paid', so cleanup is unrestricted.
//
// Run: node scripts/test-donation-note-and-completedat-sort.js

require('dotenv').config();
const assert = require('assert');
const axios = require('axios');
const db = require('../src/db/db');

let failures = 0;
let passed = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log('      ', err.message);
  }
}

function mockCardcomSuccess() {
  axios.post = async () => ({ data: { ResponseCode: 0, LowProfileId: 'test-lpid-' + Math.random().toString(36).slice(2), Url: 'https://example.test/lp' } });
}

async function run() {
  process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'test-donations-terminal';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'test-donations-api-name';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'test-donations-api-password';

  const anyUserRes = await db.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  const anyUserId = anyUserRes.rows[0].id;

  const RUN_TAG = `zzz-note-sort-${Date.now()}`;

  const entityRes = await db.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id) VALUES ($1, 'association', 'active', $2) RETURNING id`,
    [`ZZZ_TEST ${RUN_TAG}`, anyUserId]
  );
  const entityId = entityRes.rows[0].id;

  const campaignRes = await db.query(
    `INSERT INTO campaigns (entity_id, slug, title, status, rewards) VALUES ($1, $2, 'ZZZ Test Campaign', 'active', '[]'::jsonb) RETURNING id`,
    [entityId, `${RUN_TAG}-campaign`]
  );
  const campaignId = campaignRes.rows[0].id;

  const createdDonationIds = [];
  const donationsService = require('../src/modules/donations/donations.service');

  function baseDonor() {
    return { name: 'Test Donor', email: `${RUN_TAG}@example.test`, phone: '0500000000' };
  }

  async function tryCreate(overrides) {
    mockCardcomSuccess();
    const result = await donationsService.createDonation({
      campaignId,
      donor: baseDonor(),
      amount: 100,
      rewards: [],
      participants: [],
      ...overrides,
    });
    if (result?.donationId) createdDonationIds.push(result.donationId);
    return result;
  }

  /* ---------- note ---------- */

  await check('createDonation with an explicit note persists it exactly as sent', async () => {
    const result = await tryCreate({ amount: 120, note: 'לזכרו של אבי היקר' });
    const row = (await db.query('SELECT note FROM donations WHERE id=$1', [result.donationId])).rows[0];
    assert.strictEqual(row.note, 'לזכרו של אבי היקר');
  });

  await check('createDonation with no note at all does not break creation -- stored as NULL', async () => {
    const result = await tryCreate({ amount: 130 });
    assert.ok(result.donationId);
    const row = (await db.query('SELECT note FROM donations WHERE id=$1', [result.donationId])).rows[0];
    assert.strictEqual(row.note, null);
  });

  await check('createDonation with an empty-string note stores NULL, not an empty string', async () => {
    const result = await tryCreate({ amount: 140, note: '' });
    const row = (await db.query('SELECT note FROM donations WHERE id=$1', [result.donationId])).rows[0];
    assert.strictEqual(row.note, null);
  });

  await check('unrelated fields (amount, donor name) are unaffected by adding a note', async () => {
    const result = await tryCreate({ amount: 150, note: 'תרומה לכבוד יום הולדת' });
    const row = (await db.query('SELECT amount, donor_name FROM donations WHERE id=$1', [result.donationId])).rows[0];
    assert.strictEqual(Number(row.amount), 150);
    assert.strictEqual(row.donor_name, 'Test Donor');
  });

  /* ---------- completedAt sort ---------- */

  // Three rows with created_at/completed_at deliberately out of step with
  // each other, so an ORDER BY on the wrong column is distinguishable from
  // the right one. None are 'paid' (freely deletable); completed_at is set
  // directly since this is testing sort behavior, not the paid-transition
  // path itself.
  const t0 = new Date('2026-01-01T00:00:00Z');
  const rowSpecs = [
    { label: 'A', created_at: new Date(t0.getTime() + 0),  completed_at: new Date(t0.getTime() + 30 * 60000) }, // created 1st, completed 3rd
    { label: 'B', created_at: new Date(t0.getTime() + 60000), completed_at: new Date(t0.getTime() + 0) },        // created 2nd, completed 1st
    { label: 'C', created_at: new Date(t0.getTime() + 120000), completed_at: new Date(t0.getTime() + 15 * 60000) }, // created 3rd, completed 2nd
  ];
  const sortFixtureIds = {};
  for (const spec of rowSpecs) {
    const res = await db.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, rewards, is_mock, created_at, completed_at)
       VALUES ($1,$2,10,$3,'pending','[]'::jsonb,true,$4,$5) RETURNING id`,
      [campaignId, entityId, `ZZZ Sort ${spec.label}`, spec.created_at, spec.completed_at]
    );
    sortFixtureIds[spec.label] = res.rows[0].id;
    createdDonationIds.push(res.rows[0].id);
  }

  await check('sortBy=completedAt orders by d.completed_at, not d.created_at', async () => {
    const { donations } = await donationsService.getEntityDonations(entityId, {
      sortBy: 'completedAt', sortDir: 'asc', limit: 50,
    });
    const sortRows = donations.filter((d) => d.donor_name?.startsWith('ZZZ Sort'));
    const order = sortRows.map((d) => d.donor_name.replace('ZZZ Sort ', ''));
    // completed_at ascending: B (t+0), C (t+15m), A (t+30m)
    assert.deepStrictEqual(order, ['B', 'C', 'A'], `expected completed_at order B,C,A -- got ${order.join(',')}`);
  });

  await check('sortBy=completedAt no longer silently falls back to created_at (orders differ from created_at)', async () => {
    const byCompleted = await donationsService.getEntityDonations(entityId, { sortBy: 'completedAt', sortDir: 'asc', limit: 50 });
    const byCreated = await donationsService.getEntityDonations(entityId, { sortBy: 'date', sortDir: 'asc', limit: 50 });
    const orderCompleted = byCompleted.donations.filter((d) => d.donor_name?.startsWith('ZZZ Sort')).map((d) => d.donor_name);
    const orderCreated = byCreated.donations.filter((d) => d.donor_name?.startsWith('ZZZ Sort')).map((d) => d.donor_name);
    assert.notDeepStrictEqual(orderCompleted, orderCreated, 'completedAt and created_at orderings must actually differ for this fixture, proving completedAt is not falling back to created_at');
  });

  await check('existing sortBy=date (created_at) still behaves exactly as before', async () => {
    const { donations } = await donationsService.getEntityDonations(entityId, { sortBy: 'date', sortDir: 'asc', limit: 50 });
    const sortRows = donations.filter((d) => d.donor_name?.startsWith('ZZZ Sort'));
    const order = sortRows.map((d) => d.donor_name.replace('ZZZ Sort ', ''));
    // created_at ascending: A (t+0), B (t+1m), C (t+2m)
    assert.deepStrictEqual(order, ['A', 'B', 'C'], `expected created_at order A,B,C -- got ${order.join(',')}`);
  });

  await check('existing sortBy=amount still behaves exactly as before (unaffected by the new SORT_COLUMNS entry)', async () => {
    const { donations } = await donationsService.getEntityDonations(entityId, { sortBy: 'amount', sortDir: 'desc', limit: 50, campaignId });
    assert.ok(donations.length > 0);
    for (let i = 1; i < donations.length; i++) {
      assert.ok(donations[i - 1].amount >= donations[i].amount, 'amount sort must still be descending');
    }
  });

  // Cleanup -- nothing here ever reached 'paid'.
  const paidCount = (await db.query(
    `SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1 AND status='paid'`,
    [campaignId]
  )).rows[0].c;
  if (paidCount > 0) {
    console.log(`\nABORTING CLEANUP: ${paidCount} donation(s) unexpectedly reached 'paid' status.`);
  } else {
    await db.query('DELETE FROM donations WHERE campaign_id=$1', [campaignId]);
    await db.query('DELETE FROM campaigns WHERE id=$1', [campaignId]);
    await db.query('DELETE FROM entities WHERE id=$1', [entityId]);
    console.log('\nCleanup: test fixtures deleted.');
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await db.end?.();
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
