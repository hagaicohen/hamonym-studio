// Real-DB regression test for the 2026-09-23 category canonicalization fix
// (campaigns.service.js#updateCampaign).
//
// Product rule: campaign.category persistence is always an ENTITY_CATEGORIES
// id (e.g. "health"), never the Hebrew label or arbitrary free text -- the
// label is presentation-only. Before this, the Builder wrote labels, Settings
// wrote unconstrained free text, and the public campaign page displayed the
// raw stored value with no translation -- discovered live when a real
// published campaign showed the literal English id "health" to donors.
//
// Also asserts the backend's canonical id list (entity-categories.js, a
// manually-kept-in-sync copy -- the two repos have no shared build/package
// setup) hasn't silently drifted from the frontend's source of truth, by
// reading hamonym-app's entity-categories.ts directly (no build coupling,
// just a text-parse comparison).
//
// Everything created here (a throwaway entity + campaign) is fully deleted
// at the end.
//
// Run: node scripts/test-campaign-category-validation.js

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const pool = require('../src/db/db');
const { updateCampaign } = require('../src/modules/campaigns/campaigns.service');
const { ENTITY_CATEGORY_IDS, isValidCategoryId } = require('../src/modules/campaigns/entity-categories');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let userId, entityId, campaignId;

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST category-validation', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [userId, entityId]);

  const campaignRes = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, target_amount, category)
     VALUES ($1, 'ZZZ Test Category Validation', $2, 'draft', 1000, NULL)
     RETURNING id`,
    [entityId, `zzz-test-category-${Date.now()}`]
  );
  campaignId = campaignRes.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM campaigns WHERE id = $1`, [campaignId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('A. a valid curated id is accepted', async () => {
    const result = await updateCampaign({ userId, campaignId, data: { category: 'education' } });
    assert.strictEqual(result.category, 'education');
  });

  await check('B. blank category is accepted (a campaign may have none)', async () => {
    const result = await updateCampaign({ userId, campaignId, data: { category: '' } });
    assert.ok(!result.category, `expected a falsy/empty category, got: ${JSON.stringify(result.category)}`);
  });

  await check('B2. reset to a valid id for the next case', async () => {
    const result = await updateCampaign({ userId, campaignId, data: { category: 'education' } });
    assert.strictEqual(result.category, 'education');
  });

  await check('C. arbitrary free text is rejected, and the real value is left untouched', async () => {
    await assert.rejects(
      updateCampaign({ userId, campaignId, data: { category: 'בדיקת קטגוריה שלא קיימת' } }),
      /Invalid campaign category/
    );
    const row = (await pool.query('SELECT category FROM campaigns WHERE id = $1', [campaignId])).rows[0];
    assert.strictEqual(row.category, 'education', 'rejected write must not partially apply');
  });

  await check('D. the Hebrew LABEL itself is rejected too (not a valid persisted value, id only)', async () => {
    await assert.rejects(
      updateCampaign({ userId, campaignId, data: { category: 'בריאות' } }),
      /Invalid campaign category/
    );
  });

  await check('E. every id the AI Campaign Creation pipeline could produce is a currently-valid id', async () => {
    // Spot-checks the exact ids referenced in campaign-creation.prompt.js's
    // closed list -- if the canonical list ever drops one of these without
    // updating the prompt, this is the seam that would catch it.
    for (const id of ['health', 'education', 'sports', 'other', 'social-change']) {
      assert.ok(isValidCategoryId(id), `${id} should be valid`);
    }
  });

  await check('F. backend canonical id list matches the frontend source of truth (no drift)', async () => {
    const frontendPath = path.resolve(__dirname, '../../hamonym-app/src/app/shared/config/entity-categories.ts');
    const src = fs.readFileSync(frontendPath, 'utf8');
    const ids = [...src.matchAll(/id:\s*'([a-z-]+)'/g)].map((m) => m[1]);
    assert.ok(ids.length > 0, 'must have actually parsed ids out of the frontend file');
    assert.deepStrictEqual(
      [...ENTITY_CATEGORY_IDS].sort(),
      [...ids].sort(),
      'backend entity-categories.js has drifted from hamonym-app/.../entity-categories.ts -- keep them in sync'
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
