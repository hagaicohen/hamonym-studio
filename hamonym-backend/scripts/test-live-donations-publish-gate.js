// Proves the 2026-09-10 fix to getLiveDonations (Production Launch
// Readiness pass): before this fix, the live-donation-toast polling
// endpoint (GET /api/donations/campaign/:slug/live, public/unauthenticated)
// filtered only on is_hidden/deleted_at -- NOT on campaign.status/entity.status
// -- unlike every sibling public campaign query (getCampaignBySlugPublic,
// discoverCampaigns), which also require status='published'/'active'. That
// let an unauthenticated caller who knew/guessed the slug of a draft (not
// yet published) campaign with existing paid donations retrieve donor
// names/amounts for it, even though the campaign page itself 404s.
//
// Uses a single BEGIN...ROLLBACK transaction on one dedicated client,
// never COMMIT -- deliberately, not for speed. donations.status='paid' rows
// are permanently un-deletable and un-updatable by DB trigger (migration
// 055, financial integrity) -- a fixture that commits a 'paid' row can never
// be cleaned up again. Runs the exact WHERE clause from
// donations.service.js#getLiveDonations directly against the transactional
// client (the exported function itself uses the shared pool, a different
// connection that can't see this transaction's uncommitted rows) -- keep
// this SQL in sync with that function if it changes.
//
// Run: node scripts/test-live-donations-publish-gate.js

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

const LIVE_DONATIONS_SQL = `
  SELECT d.donor_name AS name, d.amount::float AS amount, d.completed_at, d.is_anonymous
  FROM donations d
  JOIN campaigns c ON c.id = d.campaign_id
  JOIN entities  e ON e.id = c.entity_id
  WHERE c.slug = $1
    AND d.status = 'paid'
    AND d.completed_at > $2
    AND c.status = 'published' AND e.status = 'active'
    AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
  ORDER BY d.completed_at ASC
  LIMIT 10`;

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const anyUserRes = await client.query('SELECT id FROM users LIMIT 1');
    if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
    const anyUserId = anyUserRes.rows[0].id;

    const suffix = Date.now();
    const draftSlug = `zzz-test-draft-${suffix}`;
    const publishedSlug = `zzz-test-published-${suffix}`;

    const entityRes = await client.query(
      `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
       VALUES ('ZZZ_TEST live-donations gate', 'association', 'active', $1) RETURNING id`,
      [anyUserId]
    );
    const entityId = entityRes.rows[0].id;

    const draftRes = await client.query(
      `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1,$2,'ZZZ_TEST draft campaign','draft') RETURNING id`,
      [entityId, draftSlug]
    );
    const draftCampaignId = draftRes.rows[0].id;

    const pubRes = await client.query(
      `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1,$2,'ZZZ_TEST published campaign','published') RETURNING id`,
      [entityId, publishedSlug]
    );
    const publishedCampaignId = pubRes.rows[0].id;

    for (const [campaignId, name] of [[draftCampaignId, 'ZZZ_TEST Draft Donor'], [publishedCampaignId, 'ZZZ_TEST Published Donor']]) {
      await client.query(
        `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, completed_at)
         VALUES ($1,$2,50,$3,'paid',NOW())`,
        [campaignId, entityId, name]
      );
    }

    await check('draft campaign: getLiveDonations query returns zero rows (was leaking before the fix)', async () => {
      const r = await client.query(LIVE_DONATIONS_SQL, [draftSlug, new Date(0)]);
      assert.strictEqual(r.rows.length, 0, 'a draft campaign must not expose live donation data publicly');
    });

    await check('published campaign: getLiveDonations query still returns the real paid donation', async () => {
      const r = await client.query(LIVE_DONATIONS_SQL, [publishedSlug, new Date(0)]);
      assert.strictEqual(r.rows.length, 1, 'a published campaign must keep working normally');
      assert.strictEqual(r.rows[0].name, 'ZZZ_TEST Published Donor');
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
