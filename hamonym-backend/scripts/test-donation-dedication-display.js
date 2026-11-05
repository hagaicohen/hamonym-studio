// Proves the donation dedication (donations.note, reused unchanged --
// previously write-only / admin-manual-entry only) now comes back out of
// every read path that was extended to surface it: the live-donation toast
// poll, the campaign's public donor list, the donor's own "my donations"
// list, the entity admin's donation list/drawer, and the receipt view
// (joined in from donations -- the receipts table itself is untouched, no
// schema change). Also proves an anonymous donation still returns its
// dedication even though its donor name is masked server-side.
//
// Uses a single BEGIN...ROLLBACK transaction on one dedicated client, never
// COMMIT -- donations.status='paid' rows are permanently un-deletable/
// un-updatable by DB trigger (migration 055), so a fixture that commits a
// 'paid' row can never be cleaned up again. Runs the exact SQL from
// donations.service.js's getLiveDonations/getCampaignDonors/getMyDonations/
// getEntityDonations/getReceipt directly against the transactional client --
// keep this in sync with those functions if they change.
//
// Run: node scripts/test-donation-dedication-display.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const anyUserRes = await client.query('SELECT id FROM users LIMIT 1');
    if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy FKs');
    const anyUserId = anyUserRes.rows[0].id;

    const suffix = Date.now();
    const slug = `zzz-test-dedication-${suffix}`;

    const entityRes = await client.query(
      `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
       VALUES ('ZZZ_TEST dedication display', 'association', 'active', $1) RETURNING id`,
      [anyUserId]
    );
    const entityId = entityRes.rows[0].id;

    const campRes = await client.query(
      `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1,$2,'ZZZ_TEST dedication campaign','published') RETURNING id`,
      [entityId, slug]
    );
    const campaignId = campRes.rows[0].id;

    const namedRes = await client.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, completed_at, is_anonymous, note, donor_user_id)
       VALUES ($1,$2,80,'ZZZ_TEST Named Donor','paid',NOW(),false,'לכבוד אמא שלי',$3) RETURNING id`,
      [campaignId, entityId, anyUserId]
    );
    const namedDonationId = namedRes.rows[0].id;

    const anonRes = await client.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, completed_at, is_anonymous, note)
       VALUES ($1,$2,40,'ZZZ_TEST Anon Donor','paid',NOW(),true,'לזכר יוסי') RETURNING id`,
      [campaignId, entityId]
    );
    const anonDonationId = anonRes.rows[0].id;

    await client.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, completed_at, is_anonymous)
       VALUES ($1,$2,25,'ZZZ_TEST No Dedication','paid',NOW(),false)`,
      [campaignId, entityId]
    );

    await client.query(
      `INSERT INTO receipts (donation_id, entity_id, campaign_id, amount, donor_name, donor_email)
       VALUES ($1,$2,$3,80,'ZZZ_TEST Named Donor','zzz-test@example.com') RETURNING id`,
      [namedDonationId, entityId, campaignId]
    );

    await check('getLiveDonations SQL returns note for a paid donation', async () => {
      const r = await client.query(
        `SELECT d.donor_name AS name, d.amount::float AS amount, d.completed_at, d.is_anonymous, d.note
         FROM donations d JOIN campaigns c ON c.id = d.campaign_id JOIN entities e ON e.id = c.entity_id
         WHERE c.slug = $1 AND d.status = 'paid' AND d.completed_at > $2
           AND c.status = 'published' AND e.status = 'active'
           AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
         ORDER BY d.completed_at ASC`,
        [slug, new Date(0)]
      );
      assert.strictEqual(r.rows.length, 3);
      const named = r.rows.find((x) => x.name === 'ZZZ_TEST Named Donor');
      assert.strictEqual(named.note, 'לכבוד אמא שלי');
    });

    await check('getCampaignDonors SQL masks anonymous name but still returns the dedication', async () => {
      const r = await client.query(
        `WITH camp AS (
           SELECT d.id, d.donor_name, d.amount::float AS amount, d.completed_at, d.is_anonymous, d.note
           FROM donations d JOIN campaigns c ON c.id = d.campaign_id JOIN entities e ON e.id = c.entity_id
           WHERE c.slug = $1 AND d.status = 'paid'
             AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
         )
         SELECT CASE WHEN camp.is_anonymous THEN 'תורם/ת אנונימי/ת' ELSE camp.donor_name END AS name,
                camp.amount, camp.is_anonymous, camp.note
         FROM camp ORDER BY camp.completed_at DESC`,
        [slug]
      );
      const anon = r.rows.find((x) => x.amount === 40);
      assert.strictEqual(anon.name, 'תורם/ת אנונימי/ת');
      assert.strictEqual(anon.note, 'לזכר יוסי');
      const noDedication = r.rows.find((x) => x.amount === 25);
      assert.strictEqual(noDedication.note, null);
    });

    await check('getMyDonations SQL returns the donor\'s own dedication', async () => {
      const r = await client.query(
        `SELECT d.id, d.amount, d.note FROM donations d WHERE d.donor_user_id = $1 AND d.status = 'paid'`,
        [anyUserId]
      );
      const mine = r.rows.find((x) => x.id === namedDonationId);
      assert.ok(mine, 'fixture donation must be findable by donor_user_id');
      assert.strictEqual(mine.note, 'לכבוד אמא שלי');
    });

    await check('getEntityDonations SQL (admin list) returns note for every row regardless of anonymity', async () => {
      const r = await client.query(
        `SELECT d.id, d.is_anonymous, d.note FROM donations d WHERE d.entity_id = $1 ORDER BY d.amount DESC`,
        [entityId]
      );
      assert.strictEqual(r.rows.length, 3);
      const anon = r.rows.find((x) => x.id === anonDonationId);
      assert.strictEqual(anon.is_anonymous, true);
      assert.strictEqual(anon.note, 'לזכר יוסי');
    });

    await check('getReceipt SQL (joined to donations, receipts table itself untouched) returns note', async () => {
      const r = await client.query(
        `SELECT r.id, r.donor_name, d.note
         FROM receipts r JOIN donations d ON d.id = r.donation_id
         WHERE r.donation_id = $1`,
        [namedDonationId]
      );
      assert.strictEqual(r.rows.length, 1);
      assert.strictEqual(r.rows[0].note, 'לכבוד אמא שלי');
    });

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
