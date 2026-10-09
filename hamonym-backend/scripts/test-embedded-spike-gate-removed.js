// Real-DB regression test for removing the obsolete Embedded Donation
// Spike gate (2026-10-09, Pilot Payment Blocker fix).
//
// History: the gate was introduced 2026-09-24 as protection for an isolated
// spike ("not yet wired into the real checkout"). Three days later Checkout
// V2 shipped and adopted the exact same `embedded:true` mechanism as its
// permanent, standard architecture -- but the gate was never revisited.
// Result: every real Checkout V2 donation would be rejected before any
// DB/CardCom activity unless ALLOW_EMBEDDED_DONATION_SPIKE=true happened to
// be set in the environment.
//
// `embedded` itself is NOT removed -- it still controls whether the
// response includes `lowProfileId`, which OpenfieldsFormComponent requires
// for tokenization. Only the obsolete opt-in environment gate is removed.
//
// axios.post is monkey-patched so no real CardCom call is made (same
// convention as test-donation-server-validation.js). No donation here is
// ever marked 'paid', so cleanup is unrestricted.
//
// Run: node scripts/test-embedded-spike-gate-removed.js

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

  const RUN_TAG = `zzz-embedded-gate-${Date.now()}`;

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

  const originalEnvValue = process.env.ALLOW_EMBEDDED_DONATION_SPIKE;

  await check('A. embedded=true with ALLOW_EMBEDDED_DONATION_SPIKE ABSENT -- not rejected, lowProfileId returned', async () => {
    delete process.env.ALLOW_EMBEDDED_DONATION_SPIKE;
    const result = await tryCreate({ amount: 110, embedded: true });
    assert.ok(result.donationId, 'donation must be created, not rejected by the old gate');
    assert.ok(result.lowProfileId, 'embedded:true must still return lowProfileId');
  });

  await check("B. embedded=true with ALLOW_EMBEDDED_DONATION_SPIKE='false' -- same result, obsolete var has no effect", async () => {
    process.env.ALLOW_EMBEDDED_DONATION_SPIKE = 'false';
    const result = await tryCreate({ amount: 120, embedded: true });
    assert.ok(result.donationId);
    assert.ok(result.lowProfileId);
  });

  await check('C. embedded=false or omitted -- unchanged: no lowProfileId in the response', async () => {
    delete process.env.ALLOW_EMBEDDED_DONATION_SPIKE;
    const result = await tryCreate({ amount: 130 });
    assert.ok(result.donationId);
    assert.strictEqual(result.lowProfileId, undefined, 'lowProfileId must only appear when embedded:true was sent');
    assert.ok(result.url, 'the redirect-flow url must still be returned as before');
  });

  await check('D. existing validation still runs normally -- an invalid amount is still rejected even with embedded=true', async () => {
    const before = (await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId])).rows[0].c;
    await assert.rejects(() => tryCreate({ amount: 0, embedded: true }), (e) => e.code === 'INVALID_AMOUNT');
    const after = (await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId])).rows[0].c;
    assert.strictEqual(after, before, 'removing the spike gate must not bypass server-side validation');
  });

  if (originalEnvValue === undefined) delete process.env.ALLOW_EMBEDDED_DONATION_SPIKE;
  else process.env.ALLOW_EMBEDDED_DONATION_SPIKE = originalEnvValue;

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
