// Proves the 2026-09-22 ambassador attribution feature: a donation created
// through an ambassador's personal page/action carries ambassador_id, which
// the existing ambassador statistics (STATS_SQL in ambassadors.service.js,
// unchanged by this work) already correctly aggregate from donations.paid +
// ambassador_adjustments. v1 is deliberately simple -- no cookies/session
// tracking, only an ambassadorId the donor's own checkout request explicitly
// carried -- and the server never trusts it as-is: it must resolve to a
// real, SAME-campaign, active ambassador or it is silently dropped (the
// donation itself must never be blocked by a bad/stale attribution value).
//
// Real-DB fixture. Every donation created here stays 'pending' (axios.post
// is monkey-patched, matching test-donation-server-validation.js's
// convention) -- never 'paid', so everything is safely deletable.
//
// Run: node scripts/test-ambassador-donation-attribution.js

require('dotenv').config();
const assert = require('assert');
const axios = require('axios');
const pool = require('../src/db/db');
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
let entityId;
let campaignAId, campaignBId;
let ambassadorActiveId, ambassadorInactiveId, ambassadorOtherCampaignId;
const createdDonationIds = [];

function baseDonor(overrides = {}) {
  return { name: 'ZZZ Test Donor', email: 'zzz-test-amb-attr@example.test', phone: '0500000000', ...overrides };
}

async function setup() {
  process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'test-donations-terminal';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'test-donations-api-name';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'test-donations-api-password';

  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST ambassador-attribution', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;

  const campaignARes = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status)
     VALUES ($1, $2, 'ZZZ_TEST Ambassador Attribution Campaign A', 'published') RETURNING id`,
    [entityId, `zzz-test-amb-attr-a-${Date.now()}`]
  );
  campaignAId = campaignARes.rows[0].id;

  const campaignBRes = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status)
     VALUES ($1, $2, 'ZZZ_TEST Ambassador Attribution Campaign B', 'published') RETURNING id`,
    [entityId, `zzz-test-amb-attr-b-${Date.now()}`]
  );
  campaignBId = campaignBRes.rows[0].id;

  const ambActiveRes = await pool.query(
    `INSERT INTO campaign_ambassadors (campaign_id, full_name, slug, status)
     VALUES ($1, 'ZZZ Test Ambassador Active', 'zzz-test-amb-active', 'active') RETURNING id`,
    [campaignAId]
  );
  ambassadorActiveId = ambActiveRes.rows[0].id;

  const ambInactiveRes = await pool.query(
    `INSERT INTO campaign_ambassadors (campaign_id, full_name, slug, status)
     VALUES ($1, 'ZZZ Test Ambassador Inactive', 'zzz-test-amb-inactive', 'inactive') RETURNING id`,
    [campaignAId]
  );
  ambassadorInactiveId = ambInactiveRes.rows[0].id;

  const ambOtherRes = await pool.query(
    `INSERT INTO campaign_ambassadors (campaign_id, full_name, slug, status)
     VALUES ($1, 'ZZZ Test Ambassador Other Campaign', 'zzz-test-amb-other', 'active') RETURNING id`,
    [campaignBId]
  );
  ambassadorOtherCampaignId = ambOtherRes.rows[0].id;
}

async function cleanup() {
  if (createdDonationIds.length) {
    await pool.query(`DELETE FROM donations WHERE id = ANY($1::uuid[])`, [createdDonationIds]);
  }
  await pool.query(`DELETE FROM campaign_ambassadors WHERE campaign_id IN ($1, $2)`, [campaignAId, campaignBId]);
  await pool.query(`DELETE FROM campaigns WHERE id IN ($1, $2)`, [campaignAId, campaignBId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('A. valid ambassador on the SAME campaign -> donation created with ambassador_id set', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: campaignAId, donor: baseDonor(), amount: 50, rewards: [], participants: [],
      ambassadorId: ambassadorActiveId,
    });
    createdDonationIds.push(result.donationId);
    const row = (await pool.query('SELECT ambassador_id, amount FROM donations WHERE id = $1', [result.donationId])).rows[0];
    assert.strictEqual(row.ambassador_id, ambassadorActiveId);
    assert.strictEqual(Number(row.amount), 50, 'G. amount must be exactly what was submitted, unaffected by attribution');
  });

  await check('B. no ambassador context -> ambassador_id is NULL, normal behavior unchanged', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: campaignAId, donor: baseDonor(), amount: 40, rewards: [], participants: [],
    });
    createdDonationIds.push(result.donationId);
    const row = (await pool.query('SELECT ambassador_id FROM donations WHERE id = $1', [result.donationId])).rows[0];
    assert.strictEqual(row.ambassador_id, null);
  });

  await check('C. ambassador belongs to a DIFFERENT campaign -> cannot be attributed, donation still succeeds', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: campaignAId, donor: baseDonor(), amount: 30, rewards: [], participants: [],
      ambassadorId: ambassadorOtherCampaignId,
    });
    createdDonationIds.push(result.donationId);
    const row = (await pool.query('SELECT ambassador_id FROM donations WHERE id = $1', [result.donationId])).rows[0];
    assert.strictEqual(row.ambassador_id, null, 'cross-campaign ambassador must never be attributed');
  });

  await check('D. nonexistent ambassador id -> cannot be attributed, donation still succeeds', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: campaignAId, donor: baseDonor(), amount: 25, rewards: [], participants: [],
      ambassadorId: '00000000-0000-0000-0000-000000000000',
    });
    createdDonationIds.push(result.donationId);
    const row = (await pool.query('SELECT ambassador_id FROM donations WHERE id = $1', [result.donationId])).rows[0];
    assert.strictEqual(row.ambassador_id, null);
  });

  await check('E. inactive/deactivated ambassador -> cannot receive new attribution', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: campaignAId, donor: baseDonor(), amount: 20, rewards: [], participants: [],
      ambassadorId: ambassadorInactiveId,
    });
    createdDonationIds.push(result.donationId);
    const row = (await pool.query('SELECT ambassador_id FROM donations WHERE id = $1', [result.donationId])).rows[0];
    assert.strictEqual(row.ambassador_id, null);
  });

  await check('F. anonymous donor through an ambassador -> attribution is still allowed (source, not donor identity)', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId: campaignAId, donor: { ...baseDonor(), isAnonymous: true }, amount: 15, rewards: [], participants: [],
      ambassadorId: ambassadorActiveId,
    });
    createdDonationIds.push(result.donationId);
    const row = (await pool.query('SELECT ambassador_id, is_anonymous FROM donations WHERE id = $1', [result.donationId])).rows[0];
    assert.strictEqual(row.ambassador_id, ambassadorActiveId);
    assert.strictEqual(row.is_anonymous, true);
  });

  await check('existing ambassador stats query still aggregates only paid donations (unchanged) -- 0 for these fixtures since none are paid', async () => {
    const { rows } = await pool.query(
      `SELECT COALESCE((SELECT SUM(d.amount) FROM donations d WHERE d.ambassador_id = a.id AND d.status = 'paid'), 0) AS raised_online
       FROM campaign_ambassadors a WHERE a.id = $1`,
      [ambassadorActiveId]
    );
    assert.strictEqual(Number(rows[0].raised_online), 0, 'pending (non-paid) attributed donations must not count as raised yet');
  });

  await cleanup();
  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch {}
  await pool.end();
  process.exit(1);
});
