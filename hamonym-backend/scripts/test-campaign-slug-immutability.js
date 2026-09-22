// Real-DB regression test for the 2026-09-22 slug-immutability fix
// (campaigns.service.js#updateCampaign).
//
// Product rule (already expressed correctly in campaign-settings-page's own
// readonly UI copy, just unenforced elsewhere): once a campaign has ever
// been published, its slug is frozen -- shared donor/ambassador links, past
// communications, external listings all depend on it staying stable. The
// Campaign Builder's slug field had zero guard at all (frontend or
// backend), so a manager could silently break every existing shared link
// for an already-live campaign.
//
// Uses `published_at` (set once via COALESCE, never cleared anywhere in the
// codebase -- verified) as the authoritative "has this campaign ever been
// published" signal, deliberately NOT `status !== 'draft'`, which doesn't
// by itself mean "was published" (e.g. later lifecycle/status states).
//
// Everything created here (a throwaway entity + campaign, no donations) is
// fully deleted at the end -- campaigns have no immutability trigger like
// paid donations do, verified safe to clean up.
//
// Run: node scripts/test-campaign-slug-immutability.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { updateCampaign } = require('../src/modules/campaigns/campaigns.service');

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

async function makeCampaign({ slug, status, publishedAt }) {
  const res = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, target_amount, cover_image_url, hero_type, campaign_lifecycle, published_at)
     VALUES ($1, 'ZZZ Test Slug Immutability', $2, $3, 1000, 'https://example.test/cover.jpg', 'image', 'one-time', $4)
     RETURNING id`,
    [entityId, slug, status, publishedAt]
  );
  campaignIds.push(res.rows[0].id);
  return res.rows[0].id;
}

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  userId = anyUserRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST slug-immutability', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  // updateCampaign's ownership check needs a real user_entities row.
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [userId, entityId]);
}

async function cleanup() {
  await pool.query(`DELETE FROM campaigns WHERE id = ANY($1::uuid[])`, [campaignIds]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('A. unpublished (draft, published_at NULL) campaign: slug A -> slug B allowed', async () => {
    const id = await makeCampaign({ slug: `zzz-test-a-${Date.now()}`, status: 'draft', publishedAt: null });
    const result = await updateCampaign({ userId, campaignId: id, data: { slug: 'zzz-test-a-changed' } });
    assert.strictEqual(result.slug, 'zzz-test-a-changed');
  });

  await check('B. published campaign: slug A -> slug B rejected', async () => {
    const id = await makeCampaign({ slug: `zzz-test-b-${Date.now()}`, status: 'published', publishedAt: new Date() });
    const row = (await pool.query('SELECT slug FROM campaigns WHERE id = $1', [id])).rows[0];
    await assert.rejects(
      updateCampaign({ userId, campaignId: id, data: { slug: 'zzz-test-b-changed' } }),
      /Cannot change slug after publishing/
    );
    const after = (await pool.query('SELECT slug FROM campaigns WHERE id = $1', [id])).rows[0];
    assert.strictEqual(after.slug, row.slug, 'slug must be completely unchanged after the rejected attempt');
  });

  await check('C. published campaign: sending the SAME slug unchanged does NOT break ordinary autosave', async () => {
    const slug = `zzz-test-c-${Date.now()}`;
    const id = await makeCampaign({ slug, status: 'published', publishedAt: new Date() });
    // Mirrors the real full-draft autosave shape: slug included, same value, plus another field changing.
    const result = await updateCampaign({ userId, campaignId: id, data: { slug, category: 'חינוך' } });
    assert.strictEqual(result.slug, slug);
    assert.strictEqual(result.category, 'חינוך');
  });

  await check('D. published campaign: an unrelated permitted field (title) still updates normally', async () => {
    const id = await makeCampaign({ slug: `zzz-test-d-${Date.now()}`, status: 'published', publishedAt: new Date() });
    const result = await updateCampaign({ userId, campaignId: id, data: { title: 'ZZZ Test Updated Title' } });
    assert.strictEqual(result.title, 'ZZZ Test Updated Title');
  });

  await check('E. the lock survives a LATER status change away from "published" (proves it is published_at-driven, not status-driven)', async () => {
    const id = await makeCampaign({ slug: `zzz-test-e-${Date.now()}`, status: 'published', publishedAt: new Date() });
    // Simulate a later lifecycle state that is no longer literally 'published'
    // (e.g. suspended/changes_requested) -- published_at itself is never
    // cleared anywhere in the codebase, so the lock must still hold.
    await pool.query(`UPDATE campaigns SET status = 'changes_requested' WHERE id = $1`, [id]);
    await assert.rejects(
      updateCampaign({ userId, campaignId: id, data: { slug: 'zzz-test-e-changed' } }),
      /Cannot change slug after publishing/
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
