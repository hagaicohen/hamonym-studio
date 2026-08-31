// Adversarial tests for WP1 (Donation Engine closure, 2026-08-31): server-
// side validation of donation amount and reward selection in
// donations.service.js#createDonation. Uses a REAL temporary entity+campaign
// fixture (rewards catalog needs real campaign.rewards JSONB to validate
// against) but every donation created here is either rejected before
// insertion or stays 'pending' -- never marked 'paid' -- so everything is
// safely deleted at the end. donations/campaigns/entities have no
// append-only trigger for non-paid rows (only 'paid' donations are
// protected), unlike payments/statement_components elsewhere in this
// codebase. axios.post is monkey-patched so no real CardCom call is made.
//
// Run: node scripts/test-donation-server-validation.js

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
  const anyUserRes = await db.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK -- cannot build test fixture');
  const anyUserId = anyUserRes.rows[0].id;

  const entityRes = await db.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id) VALUES ('WP1 Test Entity', 'association', 'active', $1) RETURNING id`,
    [anyUserId]
  );
  const entityId = entityRes.rows[0].id;

  const campaignRes = await db.query(
    `INSERT INTO campaigns (entity_id, slug, title, status, rewards)
     VALUES ($1, $2, 'WP1 Test Campaign', 'active', $3::jsonb)
     RETURNING id`,
    [
      entityId,
      'wp1-test-campaign-' + Date.now(),
      JSON.stringify([
        { id: 'r1', title: 'Real Reward 100', minimumAmount: 100, stock: 5 },
        { id: 'r2', title: 'Real Reward Unlimited', minimumAmount: 50, stock: null },
        { id: 'r3', title: 'Sold Out Reward', minimumAmount: 10, stock: 0 },
      ]),
    ]
  );
  const campaignId = campaignRes.rows[0].id;

  const createdDonationIds = [];
  const donationsService = require('../src/modules/donations/donations.service');

  function baseDonor() {
    return { name: 'Test Donor', email: 'wp1-test@example.test', phone: '0500000000' };
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

  await check('valid donation, no rewards -> succeeds', async () => {
    const result = await tryCreate({ amount: 150 });
    assert.ok(result.donationId);
    const row = (await db.query('SELECT amount FROM donations WHERE id=$1', [result.donationId])).rows[0];
    assert.strictEqual(Number(row.amount), 150);
  });

  await check('amount = 0 -> rejected, no donation row created', async () => {
    const before = (await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId])).rows[0].c;
    await assert.rejects(() => tryCreate({ amount: 0 }), (e) => e.code === 'INVALID_AMOUNT');
    const after = (await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId])).rows[0].c;
    assert.strictEqual(after, before);
  });

  await check('negative amount -> rejected', async () => {
    await assert.rejects(() => tryCreate({ amount: -50 }), (e) => e.code === 'INVALID_AMOUNT');
  });

  await check('non-numeric amount -> rejected', async () => {
    await assert.rejects(() => tryCreate({ amount: 'a lot of money' }), (e) => e.code === 'INVALID_AMOUNT');
  });

  await check('reward id not in campaign catalog -> rejected, no donation row created', async () => {
    const before = (await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId])).rows[0].c;
    await assert.rejects(
      () => tryCreate({ amount: 500, rewards: [{ id: 'does-not-exist', title: 'Forged Reward', minimumAmount: 1 }] }),
      (e) => e.code === 'INVALID_REWARD'
    );
    const after = (await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId])).rows[0].c;
    assert.strictEqual(after, before);
  });

  await check('reward with no id -> rejected (cannot validate against catalog)', async () => {
    await assert.rejects(
      () => tryCreate({ amount: 500, rewards: [{ title: 'No Id Reward', minimumAmount: 1 }] }),
      (e) => e.code === 'INVALID_REWARD'
    );
  });

  await check('client-forged minimumAmount is ignored -- real catalog minimum enforced against amount', async () => {
    // Client claims reward r1 (real minimum 100) but lies that it only
    // costs 0.01, and only donates 1 -- must be rejected using the SERVER's
    // minimum (100), not the client's forged one.
    await assert.rejects(
      () => tryCreate({ amount: 1, rewards: [{ id: 'r1', title: 'HACKED TITLE', minimumAmount: 0.01 }] }),
      (e) => e.code === 'AMOUNT_BELOW_REWARDS_MINIMUM'
    );
  });

  await check('valid reward claim -> stored reward reflects catalog values, not client-supplied ones', async () => {
    const result = await tryCreate({
      amount: 150,
      rewards: [{ id: 'r1', title: 'CLIENT LIES ABOUT TITLE', minimumAmount: 1 }],
    });
    const row = (await db.query('SELECT rewards FROM donations WHERE id=$1', [result.donationId])).rows[0];
    assert.strictEqual(row.rewards[0].title, 'Real Reward 100');
    assert.strictEqual(Number(row.rewards[0].minimumAmount), 100);
  });

  await check('sold-out reward (stock=0) -> rejected even with zero prior paid claims', async () => {
    await assert.rejects(
      () => tryCreate({ amount: 500, rewards: [{ id: 'r3', title: 'Sold Out Reward', minimumAmount: 10 }] }),
      (e) => e.code === 'REWARD_OUT_OF_STOCK'
    );
  });

  await check('unlimited-stock reward (stock=null) -> never rejected for availability', async () => {
    const result = await tryCreate({ amount: 200, rewards: [{ id: 'r2', title: 'x', minimumAmount: 1 }] });
    assert.ok(result.donationId);
  });

  await check('multiple units of the same reward requested in one donation are counted together', async () => {
    // r1 has stock 5; requesting 6 units at once (even with zero prior
    // claims) must be rejected.
    const rewardsArr = Array.from({ length: 6 }, () => ({ id: 'r1', title: 'x', minimumAmount: 1 }));
    await assert.rejects(
      () => tryCreate({ amount: 1000, rewards: rewardsArr }),
      (e) => e.code === 'REWARD_OUT_OF_STOCK'
    );
  });

  // Cleanup -- none of these donations were ever marked 'paid', so they
  // (and the fixtures) can be safely deleted. Verify that premise first.
  const paidCount = (await db.query(
    `SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1 AND status='paid'`,
    [campaignId]
  )).rows[0].c;
  if (paidCount > 0) {
    console.log(`\nABORTING CLEANUP: ${paidCount} donation(s) unexpectedly reached 'paid' status -- these cannot be deleted and must be left for manual inspection.`);
  } else {
    await db.query('DELETE FROM donations WHERE campaign_id=$1', [campaignId]);
    await db.query('DELETE FROM campaigns WHERE id=$1', [campaignId]);
    await db.query('DELETE FROM entities WHERE id=$1', [entityId]);
    console.log('\nCleanup: test fixtures (entity, campaign, all non-paid donations) deleted.');
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await db.end?.();
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
