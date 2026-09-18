// Proves the 2026-09-18 fix: an entity in 'pending_review' (or any status
// other than 'active') may build/edit/preview a campaign draft, but may NOT
// publish it or accept a real donation. Before this fix, updateCampaign's
// publish-validation block (title/slug/hero/goal/date-range) had no check on
// the OWNING ENTITY's approval status at all -- a brand-new, still-unreviewed
// association could publish a live, public, donation-accepting campaign
// before any Super Admin ever looked at it. donations.service.js#createDonation
// and the public campaign-read paths (getCampaignBySlugPublic,
// discoverCampaigns, getLiveDonations) already had this same entity_status
// check from an earlier pass (2026-09-10) -- this closes the one remaining
// gap, at the publish transition itself.
//
// Real-DB fixture. Donations created here stay 'pending' (never 'paid') --
// axios.post is monkey-patched so no real CardCom call is made -- so
// everything is safely deleted at the end.
//
// Run: node scripts/test-entity-approval-fundraising-gate.js

require('dotenv').config();
const assert = require('assert');
const axios = require('axios');
const pool = require('../src/db/db');
const { createCampaign, updateCampaign } = require('../src/modules/campaigns/campaigns.service');
const { createDonation } = require('../src/modules/donations/donations.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function mockCardcomSuccess() {
  axios.post = async () => ({ data: { ResponseCode: 0, LowProfileId: 'test-lpid-' + Math.random().toString(36).slice(2), Url: 'https://example.test/lp' } });
}

let userId;
let pendingEntityId, pendingCampaignId, pendingDonationId;
let activeEntityId, activeCampaignId, activeDonationId;

async function setup() {
  process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'test-donations-terminal';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'test-donations-api-name';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'test-donations-api-password';

  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  userId = anyUserRes.rows[0].id;

  const pendingEntityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST entity-approval-gate pending', 'association', 'pending_review', $1) RETURNING id`,
    [userId]
  );
  pendingEntityId = pendingEntityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [userId, pendingEntityId]);

  const activeEntityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST entity-approval-gate active', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  activeEntityId = activeEntityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [userId, activeEntityId]);
}

async function cleanup() {
  if (pendingDonationId) await pool.query(`DELETE FROM donations WHERE id = $1`, [pendingDonationId]);
  if (activeDonationId) await pool.query(`DELETE FROM donations WHERE id = $1`, [activeDonationId]);
  await pool.query(`DELETE FROM campaigns WHERE entity_id IN ($1,$2)`, [pendingEntityId, activeEntityId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id IN ($1,$2)`, [pendingEntityId, activeEntityId]);
  await pool.query(`DELETE FROM entities WHERE id IN ($1,$2)`, [pendingEntityId, activeEntityId]);
}

async function main() {
  await setup();

  // ---- pending_review entity: prepare freely, fundraise never ----

  await check('pending_review entity: create campaign draft is allowed', async () => {
    const campaign = await createCampaign({
      userId,
      data: { entity_id: pendingEntityId, title: 'ZZZ_TEST pending draft', slug: `zzz-test-pending-${Date.now()}` },
    });
    pendingCampaignId = campaign.id;
    assert.ok(pendingCampaignId);
  });

  await check('pending_review entity: edit campaign draft is allowed', async () => {
    const result = await updateCampaign({ userId, campaignId: pendingCampaignId, data: { manager_name: 'ZZZ Test Manager' } });
    assert.strictEqual(result.manager_name, 'ZZZ Test Manager');
  });

  await check('pending_review entity: filling publish-readiness fields is allowed (still a draft)', async () => {
    const result = await updateCampaign({
      userId,
      campaignId: pendingCampaignId,
      data: { cover_image_url: 'https://example.test/hero.jpg', target_amount: 1000 },
    });
    assert.strictEqual(Number(result.target_amount), 1000);
  });

  await check('pending_review entity: publish is denied', async () => {
    let threw = null;
    try {
      await updateCampaign({ userId, campaignId: pendingCampaignId, data: { status: 'published' } });
    } catch (err) { threw = err; }
    assert.ok(threw, 'publish must be rejected for a non-active entity');
    assert.strictEqual(threw.message, 'Entity is not approved to fundraise yet');
    const row = (await pool.query('SELECT status FROM campaigns WHERE id=$1', [pendingCampaignId])).rows[0];
    assert.strictEqual(row.status, 'draft', 'campaign must not have actually transitioned to published');
  });

  await check('pending_review entity: donation initiation is denied', async () => {
    mockCardcomSuccess();
    let threw = null;
    try {
      await createDonation({
        campaignId: pendingCampaignId,
        donor: { name: 'ZZZ Test Donor', email: 'zzz-test-gate@example.test', phone: '0500000000' },
        amount: 100,
        rewards: [],
        participants: [],
      });
    } catch (err) { threw = err; }
    assert.ok(threw, 'donation must be rejected for a non-active entity');
    assert.strictEqual(threw.message, 'Entity not approved');
  });

  // ---- active entity: normal behavior is unaffected ----

  await check('active entity: create + edit + publish still works normally', async () => {
    const campaign = await createCampaign({
      userId,
      data: { entity_id: activeEntityId, title: 'ZZZ_TEST active draft', slug: `zzz-test-active-${Date.now()}` },
    });
    activeCampaignId = campaign.id;
    await updateCampaign({
      userId,
      campaignId: activeCampaignId,
      data: { cover_image_url: 'https://example.test/hero.jpg', target_amount: 1000 },
    });
    const result = await updateCampaign({ userId, campaignId: activeCampaignId, data: { status: 'published' } });
    assert.strictEqual(result.status, 'published');
  });

  await check('active entity: donation initiation still works normally', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: activeCampaignId,
      donor: { name: 'ZZZ Test Donor', email: 'zzz-test-gate@example.test', phone: '0500000000' },
      amount: 100,
      rewards: [],
      participants: [],
    });
    activeDonationId = result.donationId || result.id;
    assert.ok(activeDonationId, 'a real donation flow must still produce a donation id');
  });

  await cleanup();
  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch {}
  process.exit(1);
});
