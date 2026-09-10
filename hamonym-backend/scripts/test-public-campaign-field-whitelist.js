// Proves the 2026-09-10 fix to getCampaignBySlugPublic (Production Launch
// Readiness pass): the public campaign detail query is `SELECT c.*` (kept,
// since the real public page renders most of the row), but a handful of
// internal-only fields (is_locked, is_featured, deleted_by,
// hidden_by_entity_cascade) are now stripped before the row leaves the
// server -- previously spilled to any unauthenticated caller.
//
// Real-DB fixture (campaigns table only, no donations -- no financial-
// immutability concerns), cleaned up after.
//
// Run: node scripts/test-public-campaign-field-whitelist.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { getCampaignBySlugPublic } = require('../src/modules/campaigns/campaigns.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let entityId, campaignId, slug;

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  const anyUserId = anyUserRes.rows[0].id;
  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST public-campaign-whitelist', 'association', 'active', $1) RETURNING id`,
    [anyUserId]
  );
  entityId = entityRes.rows[0].id;
  slug = `zzz-test-whitelist-${Date.now()}`;
  const campaignRes = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status, is_locked, is_featured)
     VALUES ($1,$2,'ZZZ_TEST whitelist campaign','published', true, true) RETURNING id`,
    [entityId, slug]
  );
  campaignId = campaignRes.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM campaigns WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('public campaign response omits is_locked/is_featured/deleted_by/hidden_by_entity_cascade', async () => {
    const campaign = await getCampaignBySlugPublic(slug);
    assert.ok(campaign, 'fixture campaign must be found');
    assert.strictEqual(campaign.is_locked, undefined);
    assert.strictEqual(campaign.is_featured, undefined);
    assert.strictEqual(campaign.deleted_by, undefined);
    assert.strictEqual(campaign.hidden_by_entity_cascade, undefined);
  });

  await check('public campaign response still includes normal public fields', async () => {
    const campaign = await getCampaignBySlugPublic(slug);
    assert.strictEqual(campaign.title, 'ZZZ_TEST whitelist campaign');
    assert.strictEqual(campaign.slug, slug);
    assert.strictEqual(campaign.status, 'published');
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
