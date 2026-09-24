// Proves the 2026-09-24 donor-chosen installment count feature end to end
// at the service layer: donor picks N months on MinimalDonationPageComponent
// -> POST /api/donations {recurring:true, installments:N} -> createDonation
// stores it on recurring_instructions.donor_requested_installments ->
// completeSignup() (called after the first LowProfile charge succeeds)
// reads it and sends CardCom's RecurringPayment.aspx Create call with
// TotalNumOfBills = N - 1 (the first of N charges already happened via
// LowProfile; CardCom's own Recurring engine bills the remaining N-1 -- see
// recurring.service.js's own comment, verified 2026-08-14 against a real
// CardCom RecurringId). This is exactly the off-by-one the user flagged:
// must NOT come out as N total instead of N-1 remaining.
//
// Both CardCom HTTP calls are mocked (axios.post) -- no real network call,
// donation stays a real DB row but is never actually charged.
//
// Run: node scripts/test-donor-installments.js

require('dotenv').config();
const assert = require('assert');
const axios = require('axios');
const pool = require('../src/db/db');
const { createCampaign, updateCampaign } = require('../src/modules/campaigns/campaigns.service');
const { createDonation } = require('../src/modules/donations/donations.service');
const { completeSignup } = require('../src/modules/donations/recurring.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let capturedRecurringCall = null;

function mockCardcom() {
  axios.post = async (url, body) => {
    if (String(url).includes('RecurringPayment.aspx')) {
      const params = new URLSearchParams(String(body));
      capturedRecurringCall = {
        totalNumOfBills: params.get('RecurringPayments.TotalNumOfBills'),
      };
      return { data: 'ResponseCode=0&AccountId=1&Recurring0.RecurringId=999001' };
    }
    // LowProfile/Create
    return {
      data: {
        ResponseCode: 0,
        LowProfileId: 'test-lpid-' + Math.random().toString(36).slice(2),
        Url: 'https://example.test/lp',
      },
    };
  };
}

let userId;
let entityId, campaignId;

async function setup() {
  process.env.HAMONYM_DONATIONS_CARDCOM_TERMINAL = 'test-donations-terminal';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_NAME = 'test-donations-api-name';
  process.env.HAMONYM_DONATIONS_CARDCOM_API_PASSWORD = 'test-donations-api-password';

  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST donor-installments', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [userId, entityId]);

  const campaign = await createCampaign({
    userId,
    data: {
      entity_id: entityId,
      title: 'ZZZ_TEST donor-installments campaign',
      slug: `zzz-test-donor-installments-${Date.now()}`,
      layout: { pageFormat: 'minimal' },
    },
  });
  campaignId = campaign.id;
  await updateCampaign({
    userId,
    campaignId,
    data: { cover_image_url: 'https://example.test/hero.jpg', target_amount: 1000 },
  });
}

async function cleanup() {
  // donations.recurring_instruction_id FKs to recurring_instructions —
  // donations must go first.
  await pool.query(`DELETE FROM donations WHERE campaign_id = $1`, [campaignId]);
  await pool.query(`DELETE FROM recurring_instructions WHERE campaign_id = $1`, [campaignId]);
  await pool.query(`DELETE FROM campaigns WHERE id = $1`, [campaignId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function runCase(amount, months) {
  mockCardcom();
  capturedRecurringCall = null;

  const result = await createDonation({
    campaignId,
    donor: { name: 'ZZZ Test Donor', email: 'zzz-test-donor-installments@example.test', phone: '0500000000' },
    amount,
    rewards: [],
    participants: [],
    recurring: true,
    installments: months,
  });

  // Embedded OpenFields spike contract (2026-09-24) — the DEFAULT (no
  // `embedded` flag sent) response must be byte-for-byte what it always
  // was: {url, donationId}, nothing more. This is the redirect checkout's
  // own real request shape — proving it's untouched matters more here than
  // testing the new field itself.
  assert.ok(result.url, 'the existing redirect flow\'s `url` must still be present');
  assert.strictEqual(result.lowProfileId, undefined, 'lowProfileId must NOT appear unless embedded:true was requested');

  const donationId = result.donationId;
  const donationRow = (await pool.query('SELECT recurring_instruction_id FROM donations WHERE id=$1', [donationId])).rows[0];
  const instructionId = donationRow.recurring_instruction_id;

  const before = (await pool.query('SELECT donor_requested_installments FROM recurring_instructions WHERE id=$1', [instructionId])).rows[0];
  assert.strictEqual(before.donor_requested_installments, months, `donor_requested_installments must be stored as ${months}`);

  await completeSignup(donationId);

  const after = (await pool.query('SELECT status, total_installments FROM recurring_instructions WHERE id=$1', [instructionId])).rows[0];
  assert.strictEqual(after.total_installments, months, `total_installments must equal the donor's ${months}-month choice (total, including the LowProfile charge)`);

  if (months === 1) {
    assert.strictEqual(after.status, 'completed', 'a 1-month choice must short-circuit — the single charge already happened via LowProfile');
    assert.strictEqual(capturedRecurringCall, null, 'no Recurring Create call should ever fire for months=1');
  } else {
    assert.ok(capturedRecurringCall, 'Recurring Create call must have fired');
    assert.strictEqual(Number(capturedRecurringCall.totalNumOfBills), months - 1,
      `TotalNumOfBills sent to CardCom must be ${months - 1} (months - 1), never ${months} — the first charge already happened via LowProfile`);
  }
}

// Embedded OpenFields spike (2026-09-24) — proves the `embedded:true`
// contract is purely additive: same donation/recurring_instructions
// creation path as always, `url` still present (fallback stays usable),
// and `lowProfileId` appears ONLY now, with no terminal number/API name/
// credentials anywhere in the response.
async function runEmbeddedCase(amount, recurring, months) {
  mockCardcom();
  const result = await createDonation({
    campaignId,
    donor: { name: 'ZZZ Test Donor', email: 'zzz-test-donor-installments@example.test', phone: '0500000000' },
    amount,
    rewards: [],
    participants: [],
    recurring,
    installments: recurring ? months : undefined,
    embedded: true,
  });

  assert.ok(result.url, 'url must still be present alongside lowProfileId — redirect stays a usable fallback');
  assert.ok(result.lowProfileId, 'lowProfileId must be present when embedded:true');
  assert.strictEqual(result.terminalNumber, undefined, 'no terminal number should ever be returned');
  assert.strictEqual(result.apiName, undefined, 'no API name should ever be returned');
  assert.strictEqual(result.apiPassword, undefined, 'no credential should ever be returned');

  if (recurring) {
    const donationRow = (await pool.query('SELECT recurring_instruction_id FROM donations WHERE id=$1', [result.donationId])).rows[0];
    const before = (await pool.query('SELECT donor_requested_installments FROM recurring_instructions WHERE id=$1', [donationRow.recurring_instruction_id])).rows[0];
    assert.strictEqual(before.donor_requested_installments, months, 'embedded:true must not change how donor_requested_installments is stored');
  }
}

async function main() {
  await setup();

  await check('50 ₪ × 3 months -> TotalNumOfBills = 2', () => runCase(50, 3));
  await check('50 ₪ × 12 months -> TotalNumOfBills = 11', () => runCase(50, 12));
  await check('50 ₪ × 7 months (manual entry) -> TotalNumOfBills = 6', () => runCase(50, 7));
  await check('50 ₪ × 1 month -> Recurring Create skipped entirely, no off-by-one possible', () => runCase(50, 1));

  await check('embedded:true, one-time donation -> lowProfileId present, no credentials leaked', () => runEmbeddedCase(50, false, undefined));
  await check('embedded:true, monthly × 12 -> lowProfileId present AND donor_requested_installments still correct', () => runEmbeddedCase(50, true, 12));

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
