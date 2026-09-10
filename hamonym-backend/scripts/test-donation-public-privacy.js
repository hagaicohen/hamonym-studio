// Proves the 2026-09-10 Launch Closure fix to getDonationPublic
// (donations.service.js): the public, unauthenticated donation-success
// endpoint (GET /api/donations/public/:id) previously returned donor_email
// and donor_user_id to anyone holding the donation UUID, indefinitely --
// not just the donor themselves right after paying. Both are now stripped;
// the one real use of donor_user_id (deciding whether to show the "create
// an account" prompt) is served by a has_account boolean instead, which
// reveals nothing.
//
// Uses a non-'paid' status so this fixture stays freely cleanable (a
// 'paid' donation is permanently un-deletable by DB trigger -- see
// migration 055 and the comment in test-live-donations-publish-gate.js).
// getDonationPublic filters on donation id only, not status, so this is a
// faithful test of the actual query.
//
// Run: node scripts/test-donation-public-privacy.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { getDonationPublic } = require('../src/modules/donations/donations.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let userId, entityId, campaignId, linkedDonationId, unlinkedDonationId;

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST donation-public-privacy', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;

  const campaignRes = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1,$2,'ZZZ_TEST privacy campaign','published') RETURNING id`,
    [entityId, `zzz-test-donation-privacy-${Date.now()}`]
  );
  campaignId = campaignRes.rows[0].id;

  const linkedRes = await pool.query(
    `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, donor_email, donor_user_id, status)
     VALUES ($1,$2,50,'ZZZ_TEST Linked Donor','zzz-test-linked@example.test',$3,'pending') RETURNING id`,
    [campaignId, entityId, userId]
  );
  linkedDonationId = linkedRes.rows[0].id;

  const unlinkedRes = await pool.query(
    `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, donor_email, status)
     VALUES ($1,$2,50,'ZZZ_TEST Unlinked Donor','zzz-test-unlinked@example.test','pending') RETURNING id`,
    [campaignId, entityId]
  );
  unlinkedDonationId = unlinkedRes.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM donations WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM campaigns WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('public response for an account-linked donation contains neither donor_email nor donor_user_id', async () => {
    const d = await getDonationPublic(linkedDonationId);
    assert.ok(d, 'fixture donation must be found');
    assert.strictEqual(d.donor_email, undefined);
    assert.strictEqual(d.donor_user_id, undefined);
    assert.strictEqual(d.has_account, true, 'has_account must be true for a donation linked to a user');
  });

  await check('public response for an unlinked donation also omits donor_email/donor_user_id, has_account is false', async () => {
    const d = await getDonationPublic(unlinkedDonationId);
    assert.ok(d);
    assert.strictEqual(d.donor_email, undefined);
    assert.strictEqual(d.donor_user_id, undefined);
    assert.strictEqual(d.has_account, false);
  });

  await check('public response still includes non-sensitive donation fields', async () => {
    const d = await getDonationPublic(unlinkedDonationId);
    assert.strictEqual(d.donor_name, 'ZZZ_TEST Unlinked Donor');
    assert.strictEqual(d.campaign_title, 'ZZZ_TEST privacy campaign');
    assert.strictEqual(Number(d.amount), 50);
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
