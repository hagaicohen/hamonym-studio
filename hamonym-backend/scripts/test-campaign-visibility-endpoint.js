// Real-DB regression test for the 2026-09-23 Public Visibility toggle fix.
//
// campaign-visibility-page.component.ts's primary "הצג את הקמפיין" toggle
// used to route is_hidden through the generic campaignApi.update() path.
// is_hidden is deliberately NOT in the backend's UPDATABLE_CAMPAIGN_COLUMNS
// whitelist (see campaigns.service.js's own comment -- it must go through
// the dedicated setCampaignVisibility endpoint), so sanitizeUpdateData
// silently dropped it while the rest of the payload saved fine -- the
// toggle looked like it worked (200 OK, optimistic UI flip) but never
// actually persisted. Fixed by routing the frontend through
// campaignApi.setVisibility() -> PATCH /api/campaigns/:id/visibility, the
// same dedicated endpoint campaigns-page's own list quick-action already
// used correctly.
//
// This test proves both halves: the dedicated endpoint (updateCampaign's
// sibling, setCampaignVisibility) actually persists is_hidden correctly,
// AND the generic updateCampaign still cannot (whitelist exclusion is
// intentional and must stay that way).
//
// Uses a throwaway fixture campaign, never the real published E2E campaign.
// Everything created here is fully deleted at the end.
//
// Run: node scripts/test-campaign-visibility-endpoint.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { updateCampaign, setCampaignVisibility } = require('../src/modules/campaigns/campaigns.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let userId, entityId;
const campaignIds = [];

async function makeCampaign({ status = 'published', isHidden = false } = {}) {
  const res = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, target_amount, is_hidden)
     VALUES ($1, 'ZZZ Test Visibility Endpoint', $2, $3, 1000, $4)
     RETURNING id`,
    [entityId, `zzz-test-visibility-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, status, isHidden]
  );
  campaignIds.push(res.rows[0].id);
  return res.rows[0].id;
}

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST visibility-endpoint', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [userId, entityId]);
}

async function cleanup() {
  await pool.query(`DELETE FROM campaigns WHERE id = ANY($1::uuid[])`, [campaignIds]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('1/2. dedicated endpoint: Hide persists is_hidden=true', async () => {
    const id = await makeCampaign({ isHidden: false });
    await setCampaignVisibility({ userId, campaignId: id, isHidden: true });
    const row = (await pool.query('SELECT is_hidden FROM campaigns WHERE id = $1', [id])).rows[0];
    assert.strictEqual(row.is_hidden, true);
  });

  await check('3. dedicated endpoint: Show persists is_hidden=false', async () => {
    const id = await makeCampaign({ isHidden: true });
    await setCampaignVisibility({ userId, campaignId: id, isHidden: false });
    const row = (await pool.query('SELECT is_hidden FROM campaigns WHERE id = $1', [id])).rows[0];
    assert.strictEqual(row.is_hidden, false);
  });

  await check('4. generic updateCampaign still CANNOT mutate is_hidden (whitelist exclusion intact)', async () => {
    const id = await makeCampaign({ isHidden: false });
    // Mirrors the exact bug shape: is_hidden included in an otherwise-valid
    // full-draft payload -- must silently drop only that key, not error.
    const result = await updateCampaign({ userId, campaignId: id, data: { is_hidden: true, title: 'ZZZ Test Renamed' } });
    assert.strictEqual(result.title, 'ZZZ Test Renamed', 'the rest of the payload must still save normally');
    const row = (await pool.query('SELECT is_hidden FROM campaigns WHERE id = $1', [id])).rows[0];
    assert.strictEqual(row.is_hidden, false, 'is_hidden must remain untouched by the generic update path');
  });

  await check('5a. existing protection intact: cannot hide a draft campaign', async () => {
    const id = await makeCampaign({ status: 'draft', isHidden: false });
    await assert.rejects(
      setCampaignVisibility({ userId, campaignId: id, isHidden: true }),
      /Cannot hide a draft campaign/
    );
  });

  await check('5b. existing protection intact: ownership is still enforced', async () => {
    const id = await makeCampaign({ isHidden: false });
    const otherUserRes = await pool.query(
      `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test Other User', true) RETURNING id`,
      [`zzz-test-visibility-other-${Date.now()}@example.invalid`]
    );
    const otherUserId = otherUserRes.rows[0].id;
    try {
      await assert.rejects(
        setCampaignVisibility({ userId: otherUserId, campaignId: id, isHidden: true }),
        /Unauthorized/
      );
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [otherUserId]);
    }
  });

  await check('5c. existing protection intact: hiding clears hidden_by_entity_cascade', async () => {
    const id = await makeCampaign({ isHidden: false });
    await pool.query(`UPDATE campaigns SET hidden_by_entity_cascade = true WHERE id = $1`, [id]);
    await setCampaignVisibility({ userId, campaignId: id, isHidden: true });
    const row = (await pool.query('SELECT is_hidden, hidden_by_entity_cascade FROM campaigns WHERE id = $1', [id])).rows[0];
    assert.strictEqual(row.is_hidden, true);
    assert.strictEqual(row.hidden_by_entity_cascade, false);
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
