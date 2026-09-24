// Proves the 2026-09-24 "publication intent" lifecycle fix:
//
// A manager who finishes a campaign while their entity is still
// pending_review has no way today to say "publish this the moment the
// entity is approved" -- the campaign just sits as an ordinary draft
// forever until they manually return to the Builder and click publish
// again. campaigns.publish_requested_at (migration 068) records that
// intent; campaigns.service.js#publishRequestedCampaigns (called from
// platform.service.js#setStatus, 'approve' action only, inside the same
// transaction as the entity approval) auto-publishes any campaign that's
// STILL valid once the entity goes active -- never a raw UPDATE that
// bypasses the real publish-readiness rules (getPublishBlockers, shared
// with the manual publish path).
//
// Real-DB fixture, ZZZ_TEST-prefixed rows, cleaned up at the end.
//
// Run: node scripts/test-publication-intent.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const campaignsService = require('../src/modules/campaigns/campaigns.service');
const { createCampaign, updateCampaign, requestPublish, getCampaignBySlugPublic } = campaignsService;
const platformService = require('../src/modules/platform/platform.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let userId;
const entityIds = [];
const campaignIds = [];

async function makeEntity(label, status) {
  const res = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ($1, 'association', $2, $3) RETURNING id`,
    [`ZZZ_TEST publication-intent ${label}`, status, userId]
  );
  const id = res.rows[0].id;
  entityIds.push(id);
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [userId, id]);
  return id;
}

async function makeReadyCampaign(entityId, label) {
  const campaign = await createCampaign({
    userId,
    data: { entity_id: entityId, title: `ZZZ_TEST ${label}`, slug: `zzz-test-pub-intent-${label}-${Date.now()}` },
  });
  campaignIds.push(campaign.id);
  await updateCampaign({
    userId,
    campaignId: campaign.id,
    data: { cover_image_url: 'https://example.test/hero.jpg', target_amount: 1000 },
  });
  return campaign.id;
}

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  userId = anyUserRes.rows[0].id;
}

async function cleanup() {
  if (campaignIds.length) await pool.query(`DELETE FROM campaigns WHERE id = ANY($1)`, [campaignIds]);
  if (entityIds.length) {
    // approve/suspend/reactivate each write a platform_audit_log row FK'd
    // to the entity — must go before the entities themselves.
    await pool.query(`DELETE FROM platform_audit_log WHERE entity_id = ANY($1)`, [entityIds]);
    await pool.query(`DELETE FROM user_entities WHERE entity_id = ANY($1)`, [entityIds]);
    await pool.query(`DELETE FROM entities WHERE id = ANY($1)`, [entityIds]);
  }
}

async function main() {
  await setup();

  // ---- A: unfinished draft, never asked to publish -> stays draft ----
  await check('A. unfinished draft (no publish_requested_at) + entity approved -> stays draft', async () => {
    const entityId = await makeEntity('A', 'pending_review');
    const campaign = await createCampaign({
      userId,
      data: { entity_id: entityId, title: 'ZZZ_TEST A unfinished', slug: `zzz-test-pub-intent-a-${Date.now()}` },
    });
    campaignIds.push(campaign.id);
    // Deliberately NOT ready (no target_amount/hero) and NOT requested.
    await platformService.approve(entityId, userId, 'test', null, null);
    const row = (await pool.query('SELECT status, publish_requested_at FROM campaigns WHERE id=$1', [campaign.id])).rows[0];
    assert.strictEqual(row.status, 'draft');
    assert.strictEqual(row.publish_requested_at, null);
  });

  // ---- B: ready + publish requested + entity pending -> approved -> published ----
  await check('B. ready + publish requested + entity pending -> approve -> published', async () => {
    const entityId = await makeEntity('B', 'pending_review');
    const campaignId = await makeReadyCampaign(entityId, 'B-ready');
    await requestPublish({ userId, campaignId });

    const before = (await pool.query('SELECT status, publish_requested_at FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(before.status, 'draft', 'must stay draft until entity is actually approved');
    assert.ok(before.publish_requested_at, 'intent must be recorded');

    await platformService.approve(entityId, userId, 'test', null, null);

    const after = (await pool.query('SELECT status, published_at FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(after.status, 'published', 'must auto-publish once the entity is approved');
    assert.ok(after.published_at, 'published_at must be set');
  });

  // ---- C: publish requested but campaign becomes invalid before approval -> stays unpublished ----
  await check('C. publish requested, then campaign becomes invalid -> approve -> stays draft', async () => {
    const entityId = await makeEntity('C', 'pending_review');
    const campaignId = await makeReadyCampaign(entityId, 'C-ready');
    await requestPublish({ userId, campaignId });

    // Manager (or something) breaks readiness after expressing intent —
    // clears the hero image, same as removing it in the Builder.
    // (target_amount is NOT NULL at the DB level, so that field can't be
    // used to construct this scenario — the hero check exercises the same
    // getPublishBlockers path.)
    await pool.query(`UPDATE campaigns SET cover_image_url = NULL WHERE id = $1`, [campaignId]);

    await platformService.approve(entityId, userId, 'test', null, null);

    const row = (await pool.query('SELECT status FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(row.status, 'draft', 'must NOT auto-publish a campaign that is no longer ready');
  });

  // ---- D: entity active from the start -> manual publish unaffected ----
  await check('D. entity active from the start -> manual publish still works normally', async () => {
    const entityId = await makeEntity('D', 'active');
    const campaignId = await makeReadyCampaign(entityId, 'D-ready');
    const result = await updateCampaign({ userId, campaignId, data: { status: 'published' } });
    assert.strictEqual(result.status, 'published');
  });

  // ---- E: no public path to a campaign while it's only pending approval ----
  await check('E. no public route to the campaign while draft + publish_requested_at is set', async () => {
    const entityId = await makeEntity('E', 'pending_review');
    const campaignId = await makeReadyCampaign(entityId, 'E-ready');
    const slugRes = await pool.query('SELECT slug FROM campaigns WHERE id=$1', [campaignId]);
    await requestPublish({ userId, campaignId });
    const publicRow = await getCampaignBySlugPublic(slugRes.rows[0].slug);
    assert.strictEqual(publicRow, null, 'a draft with publish intent must still be publicly unreachable');
  });

  // ---- F (extra, per the Reactivate caution): suspend -> reactivate must NOT auto-publish ----
  await check('F. suspend -> reactivate does NOT auto-publish a requested draft (only initial approve does)', async () => {
    const entityId = await makeEntity('F', 'active'); // already past its initial approval
    const campaignId = await makeReadyCampaign(entityId, 'F-ready');
    await requestPublish({ userId, campaignId });

    await platformService.suspend(entityId, userId, 'test', null, null);
    await platformService.reactivate(entityId, userId, 'test', null, null);

    const row = (await pool.query('SELECT status FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(row.status, 'draft', 'reactivate must never auto-publish — only the entity\'s initial approve does');
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
