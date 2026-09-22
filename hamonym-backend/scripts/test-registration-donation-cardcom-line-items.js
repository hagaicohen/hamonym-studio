// Real-DB regression test for the 2026-09-22 Registration submission fix
// (donations.service.js#createDonation) -- every real Registration submission
// was rejected with INVALID_REWARD (400) because the frontend sent a
// synthetic, id-less {title, minimumAmount} `rewards` entry per participant
// so Cardcom's invoice would show what was registered for, and the
// reward-catalog id validation (added 2026-08-31, unrelated hardening) then
// rejected it outright for having no real catalog id. Found live via a real
// browser E2E submission attempt.
//
// Fix: registration participants get their own Cardcom line items, built
// server-side from registrationOptionsById (registration_options, already
// validated) -- `rewards` no longer needs to carry them at all.
//
// Everything created here is throwaway and fully deleted at the end
// (verified by re-querying).
//
// Run: node scripts/test-registration-donation-cardcom-line-items.js

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

let capturedPayload = null;
function mockCardcomSuccess() {
  axios.post = async (url, payload) => {
    capturedPayload = payload;
    return { data: { ResponseCode: 0, LowProfileId: 'test-lpid-' + Math.random().toString(36).slice(2), Url: 'https://example.test/lp' } };
  };
}

let entityId, campaignId, optionAId, optionBId;
let rewardCatalogId;
const createdDonationIds = [];

async function setup() {
  process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'test-donations-terminal';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'test-donations-api-name';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'test-donations-api-password';

  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  const userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST registration-cardcom-line-items', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;

  const campaignRes = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status)
     VALUES ($1, $2, 'ZZZ_TEST Registration Cardcom Line Items', 'published') RETURNING id`,
    [entityId, `zzz-test-reg-lineitems-${Date.now()}`]
  );
  campaignId = campaignRes.rows[0].id;

  const optARes = await pool.query(
    `INSERT INTO registration_options (campaign_id, title, price, is_active)
     VALUES ($1, 'ZZZ Test 5km', 10, true) RETURNING id`,
    [campaignId]
  );
  optionAId = optARes.rows[0].id;

  const optBRes = await pool.query(
    `INSERT INTO registration_options (campaign_id, title, price, is_active)
     VALUES ($1, 'ZZZ Test 10km', 25, true) RETURNING id`,
    [campaignId]
  );
  optionBId = optBRes.rows[0].id;

  // A real Offering/reward on the same campaign, for the mixed-checkout test
  // (registration participant + an actually-selected reward together).
  rewardCatalogId = 'zzz-test-reward-1';
  await pool.query(
    `UPDATE campaigns SET rewards = $1 WHERE id = $2`,
    [JSON.stringify([{ id: rewardCatalogId, title: 'ZZZ Test Tote Bag', minimumAmount: 20, stock: null }]), campaignId]
  );
}

async function cleanup() {
  if (createdDonationIds.length) {
    await pool.query(
      `DELETE FROM registration_participants WHERE registration_order_id IN
        (SELECT id FROM registration_orders WHERE donation_id = ANY($1::uuid[]))`,
      [createdDonationIds]
    );
    await pool.query(`DELETE FROM registration_orders WHERE donation_id = ANY($1::uuid[])`, [createdDonationIds]);
    await pool.query(`DELETE FROM donations WHERE id = ANY($1::uuid[])`, [createdDonationIds]);
  }
  await pool.query(`DELETE FROM registration_options WHERE campaign_id = $1`, [campaignId]);
  await pool.query(`DELETE FROM campaigns WHERE id = $1`, [campaignId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

function baseDonor(overrides = {}) {
  return { name: 'ZZZ Test Registrant', email: 'zzz-test-registration@example.test', phone: '0500000000', ...overrides };
}

async function main() {
  await setup();

  await check('A. a real Registration submission (exact bug shape) no longer throws INVALID_REWARD', async () => {
    mockCardcomSuccess();
    // This is exactly what checkout-modal.component.ts sends for a pure
    // registration checkout after the fix: rewards is empty, the option
    // selection travels only through participants.
    const result = await createDonation({
      campaignId, donor: baseDonor(), amount: 10, rewards: [],
      participants: [{ name: 'ZZZ Test Participant', registrationOptionId: optionAId, shirtSize: 'M' }],
    });
    createdDonationIds.push(result.donationId);
    assert.ok(result.donationId, 'donation must be created, not rejected');
  });

  await check('B. registration_order + registration_participant were created correctly', async () => {
    const donationId = createdDonationIds[0];
    const order = await pool.query('SELECT * FROM registration_orders WHERE donation_id = $1', [donationId]);
    assert.strictEqual(order.rows.length, 1, 'exactly one registration_order');
    const participant = await pool.query('SELECT * FROM registration_participants WHERE registration_order_id = $1', [order.rows[0].id]);
    assert.strictEqual(participant.rows.length, 1, 'exactly one registration_participant');
    assert.strictEqual(participant.rows[0].name, 'ZZZ Test Participant');
    assert.strictEqual(participant.rows[0].shirt_size, 'M');
    assert.strictEqual(participant.rows[0].option_title, 'ZZZ Test 5km', 'option_title snapshot from the DB catalog, not the client');
  });

  await check('C. the Cardcom line item was built from the server-validated option (price=10), not from the client', async () => {
    assert.ok(capturedPayload, 'a Cardcom payload must have been captured');
    const products = capturedPayload.Document.Products;
    const line = products.find(p => p.Description.includes('ZZZ Test 5km'));
    assert.ok(line, `expected a line item for the registration option, got: ${JSON.stringify(products)}`);
    assert.strictEqual(line.UnitCost, 10);
    assert.strictEqual(capturedPayload.Amount, 10, 'the actual charged Amount is unaffected -- still donationAmount directly');
  });

  await check('C2. amount sanity: one ₪10 participant, no extra donation -> registration price counted EXACTLY ONCE, top-up is ₪0', async () => {
    const products = capturedPayload.Document.Products;
    assert.strictEqual(products.length, 1, `expected exactly one line item (no top-up, no double-count), got: ${JSON.stringify(products)}`);
    const sum = products.reduce((s, p) => s + p.UnitCost, 0);
    assert.strictEqual(sum, 10, 'sum of all Cardcom line items must equal the charged Amount exactly');
    assert.strictEqual(sum, capturedPayload.Amount);
  });

  await check('D. donations.rewards stays empty for a pure registration (no fake reward entries persisted)', async () => {
    const donationId = createdDonationIds[0];
    const row = await pool.query('SELECT rewards FROM donations WHERE id = $1', [donationId]);
    assert.deepStrictEqual(row.rows[0].rewards, [], 'no synthetic reward rows should ever be stored for a pure registration');
  });

  await check('E. two participants with different options -> two separate, correctly priced line items, base top-up added on top', async () => {
    mockCardcomSuccess();
    const result = await createDonation({
      campaignId, donor: baseDonor(), amount: 40, rewards: [],
      participants: [
        { name: 'ZZZ Test Participant 1', registrationOptionId: optionAId, shirtSize: 'S' },
        { name: 'ZZZ Test Participant 2', registrationOptionId: optionBId },
      ],
    });
    createdDonationIds.push(result.donationId);
    const products = capturedPayload.Document.Products;
    assert.strictEqual(products.length, 3, `expected 2 participant lines + 1 top-up line, got: ${JSON.stringify(products)}`);
    const line1 = products.find(p => p.Description.includes('ZZZ Test 5km'));
    const line2 = products.find(p => p.Description.includes('ZZZ Test 10km'));
    assert.strictEqual(line1.UnitCost, 10);
    assert.strictEqual(line2.UnitCost, 25);
    const topUp = products.find(p => !p.Description.includes('ZZZ Test'));
    assert.strictEqual(topUp.UnitCost, 5, '40 - 10 - 25 = 5 leftover top-up, matching the existing (unchanged) amount-not-reconciled-to-options behavior');
  });

  await check('G. mixed checkout (registration participant + a real selected reward + top-up) -> each amount counted exactly once, sum matches Amount', async () => {
    mockCardcomSuccess();
    // Mirrors checkout-modal.component.ts's combined path: cartOfferings (a
    // real, id-based reward) go through `rewards`; the carried-over
    // registration participant goes through `participants` only -- never
    // both mixed into the same synthetic entry.
    const result = await createDonation({
      campaignId, donor: baseDonor(), amount: 35,
      rewards: [{ id: rewardCatalogId, title: 'client-sent title (must be ignored)', minimumAmount: 999 }],
      participants: [{ name: 'ZZZ Test Participant', registrationOptionId: optionAId }],
    });
    createdDonationIds.push(result.donationId);
    const products = capturedPayload.Document.Products;
    assert.strictEqual(capturedPayload.Amount, 35);
    const regLine = products.find(p => p.Description.includes('ZZZ Test 5km'));
    const rewardLine = products.find(p => p.Description.includes('ZZZ Test Tote Bag'));
    const topUp = products.find(p => !p.Description.includes('ZZZ Test'));
    assert.strictEqual(regLine.UnitCost, 10, 'registration price server-derived, not doubled');
    assert.strictEqual(rewardLine.UnitCost, 20, 'reward price from the real catalog by id, client-sent 999 ignored');
    assert.strictEqual(topUp.UnitCost, 5, '35 - 10 - 20 = 5 leftover top-up');
    const sum = products.reduce((s, p) => s + p.UnitCost, 0);
    assert.strictEqual(sum, 35, 'sum of all line items must equal the charged Amount -- nothing counted twice, nothing missing');
  });

  await check('F. an invalid registrationOptionId still fails cleanly BEFORE any donation is created (unrelated pre-existing guard, unaffected)', async () => {
    await assert.rejects(
      createDonation({
        campaignId, donor: baseDonor(), amount: 10, rewards: [],
        participants: [{ name: 'ZZZ Test Participant', registrationOptionId: '00000000-0000-0000-0000-000000000000' }],
      }),
      /registration options are invalid/
    );
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
