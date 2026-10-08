// Real-DB regression test for campaign slug reuse after soft-delete
// (migration 069_campaign_slug_unique_active_only.sql, 2026-09-24).
//
// The old plain UNIQUE constraint (campaigns_slug_key) covered every row
// regardless of deleted_at, so a soft-deleted campaign's slug stayed
// permanently unavailable even though the campaign itself is gone from
// every user-facing view. Replaced with a partial unique index
// (campaigns_slug_unique_active, slug WHERE deleted_at IS NULL) --
// checkSlugAvailable (campaigns.service.js) updated to match.
//
// That schema change opens exactly one new failure mode: restoreCampaign
// (platform.service.js) can now collide with a different campaign that took
// the freed slug while the original was deleted. Covered here too (platform
// .controller.js's statusFor gets the matching 'Campaign slug already
// exists' -> 409 case).
//
// Everything created here is throwaway and fully deleted at the end.
//
// Run: node scripts/test-campaign-slug-reuse.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { checkSlugAvailable } = require('../src/modules/campaigns/campaigns.service');
const platformService = require('../src/modules/platform/platform.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const RUN_TAG = `zzz-slug-reuse-${Date.now()}`;
let userId, superAdminId, entityId;
const campaignIds = [];

async function makeCampaign(slug) {
  const res = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, target_amount, cover_image_url, hero_type, campaign_lifecycle)
     VALUES ($1, 'ZZZ Test Slug Reuse', $2, 'draft', 1000, 'https://example.test/cover.jpg', 'image', 'one-time')
     RETURNING id`,
    [entityId, slug]
  );
  campaignIds.push(res.rows[0].id);
  return res.rows[0].id;
}

async function setup() {
  const userRes = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Slug Reuse Owner', true) RETURNING id`,
    [`${RUN_TAG}-owner@example.invalid`]
  );
  userId = userRes.rows[0].id;

  const saRes = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, is_super_admin) VALUES (1, $1, 'ZZZ Slug Reuse SuperAdmin', true, true) RETURNING id`,
    [`${RUN_TAG}-sa@example.invalid`]
  );
  superAdminId = saRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id) VALUES ('ZZZ_TEST slug-reuse', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [userId, entityId]);
}

async function cleanup() {
  if (campaignIds.length) await pool.query(`DELETE FROM platform_audit_log WHERE campaign_id = ANY($1::uuid[])`, [campaignIds]);
  if (campaignIds.length) await pool.query(`DELETE FROM campaigns WHERE id = ANY($1::uuid[])`, [campaignIds]);
  if (entityId) {
    await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
    await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
  }
  await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [[userId, superAdminId].filter(Boolean)]);
}

async function main() {
  await setup();

  const slug = `${RUN_TAG}-x`;
  let campaignA, campaignB, campaignRestoreHappy;

  await check('A/C. active campaign slug X: checkSlugAvailable reports X unavailable', async () => {
    campaignA = await makeCampaign(slug);
    const available = await checkSlugAvailable({ slug });
    assert.strictEqual(available, false, 'slug held by an active campaign must be reported unavailable');
  });

  await check('E. the owning campaign excluding itself is still reported available (self-exclusion unaffected by this change)', async () => {
    const available = await checkSlugAvailable({ slug, excludeId: campaignA });
    assert.strictEqual(available, true, 'excludeId must still work exactly as before');
  });

  await check('F. DB-level uniqueness still rejects two ACTIVE rows with the same slug, independent of the app check', async () => {
    await assert.rejects(
      pool.query(
        `INSERT INTO campaigns (entity_id, title, slug, status, target_amount, cover_image_url, hero_type, campaign_lifecycle)
         VALUES ($1, 'ZZZ Test Slug Reuse Dup', $2, 'draft', 1000, 'https://example.test/cover.jpg', 'image', 'one-time')`,
        [entityId, slug]
      ),
      (err) => err.code === '23505'
    );
  });

  await check('B/D. soft-deleting campaign A frees the slug: checkSlugAvailable now reports X available', async () => {
    await pool.query(`UPDATE campaigns SET deleted_at = NOW() WHERE id = $1`, [campaignA]);
    const available = await checkSlugAvailable({ slug });
    assert.strictEqual(available, true, 'a slug held only by a soft-deleted campaign must be reported available');
  });

  await check('B. a NEW active campaign can now take the freed slug', async () => {
    campaignB = await makeCampaign(slug);
    const row = await pool.query(`SELECT slug, deleted_at FROM campaigns WHERE id = $1`, [campaignB]);
    assert.strictEqual(row.rows[0].slug, slug);
    assert.strictEqual(row.rows[0].deleted_at, null);
  });

  await check('G. restoring the ORIGINAL campaign A now collides with campaign B -- clean error, not a raw DB message', async () => {
    await assert.rejects(
      platformService.restoreCampaign(campaignA, superAdminId, 'ZZZ test restore', '127.0.0.1'),
      /Campaign slug already exists/
    );
    const after = await pool.query(`SELECT deleted_at FROM campaigns WHERE id = $1`, [campaignA]);
    assert.ok(after.rows[0].deleted_at !== null, 'campaign A must remain soft-deleted -- the collision must not partially apply');
  });

  await check('G (continued). campaign B is completely unaffected by the failed restore attempt on A', async () => {
    const row = await pool.query(`SELECT slug, deleted_at FROM campaigns WHERE id = $1`, [campaignB]);
    assert.strictEqual(row.rows[0].slug, slug);
    assert.strictEqual(row.rows[0].deleted_at, null);
  });

  await check('G (happy path). restoring a campaign whose slug was NOT reused still succeeds normally', async () => {
    const happySlug = `${RUN_TAG}-happy`;
    campaignRestoreHappy = await makeCampaign(happySlug);
    await pool.query(`UPDATE campaigns SET deleted_at = NOW() WHERE id = $1`, [campaignRestoreHappy]);
    const restored = await platformService.restoreCampaign(campaignRestoreHappy, superAdminId, 'ZZZ test restore happy', '127.0.0.1');
    assert.strictEqual(restored.deleted_at, null);
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
