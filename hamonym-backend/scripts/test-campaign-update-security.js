// Proves two 2026-09-10 fixes to campaigns.service.js (Production Launch
// Readiness pass):
//
// 1. updateCampaign's PATCH previously had no column whitelist -- any
//    authenticated owner of the target entity could set current_amount,
//    is_locked, is_hidden, deleted_at, etc. directly via the same endpoint
//    used to save Builder/Workspace edits. Now restricted to exactly the
//    columns campaign-api.service.ts#toSnake() sends.
// 2. The publish gate (data.status === 'published') only ever checked
//    title server-side -- slug/hero/goal/date-range were enforced only in
//    the frontend's own missingFields check, so a direct API call could
//    publish an incomplete campaign. Now mirrored server-side, and
//    published_at is set on first publish.
//
// Real-DB fixture, no donations involved -- freely cleanable.
//
// Run: node scripts/test-campaign-update-security.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { createCampaign, updateCampaign } = require('../src/modules/campaigns/campaigns.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let entityId, userId, campaignId;

async function setup() {
  const anyUserRes = await pool.query('SELECT id FROM users LIMIT 1');
  userId = anyUserRes.rows[0].id;
  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST campaign-update-security', 'association', 'active', $1) RETURNING id`,
    [userId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [userId, entityId]);

  const campaign = await createCampaign({
    userId,
    data: { entity_id: entityId, title: 'ZZZ_TEST update-security campaign', slug: `zzz-test-upd-sec-${Date.now()}` },
  });
  campaignId = campaign.id;
}

async function cleanup() {
  await pool.query(`DELETE FROM campaigns WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  // Each attack mixes the disallowed field with a real one (manager_name),
  // matching a realistic attack (piggybacking on an otherwise-normal save)
  // and proving the disallowed field is silently dropped, not that the
  // whole request errors out (a bare {current_amount: X} body legitimately
  // throws "No fields supplied" once the whitelist strips it to nothing).
  await check('whitelist: current_amount in the PATCH body is silently dropped, not written', async () => {
    await updateCampaign({ userId, campaignId, data: { manager_name: 'x', current_amount: 999999 } });
    const row = (await pool.query('SELECT current_amount FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(Number(row.current_amount), 0, 'current_amount must not be settable via the generic PATCH');
  });

  await check('whitelist: is_locked in the PATCH body is silently dropped, not written', async () => {
    await updateCampaign({ userId, campaignId, data: { manager_name: 'x', is_locked: true } });
    const row = (await pool.query('SELECT is_locked FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(row.is_locked, false, 'is_locked must not be settable via the generic PATCH');
  });

  await check('whitelist: is_hidden in the PATCH body is silently dropped, not written', async () => {
    await updateCampaign({ userId, campaignId, data: { manager_name: 'x', is_hidden: true } });
    const row = (await pool.query('SELECT is_hidden FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(row.is_hidden, false, 'is_hidden must not be settable via the generic PATCH');
  });

  await check('whitelist: a real, allowed field (title) still updates normally', async () => {
    await updateCampaign({ userId, campaignId, data: { title: 'ZZZ_TEST renamed' } });
    const row = (await pool.query('SELECT title FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(row.title, 'ZZZ_TEST renamed');
  });

  await check('publish gate: publishing with no hero/goal is rejected server-side', async () => {
    await pool.query(`UPDATE campaigns SET cover_image_url=NULL, video_url=NULL, target_amount=0 WHERE id=$1`, [campaignId]);
    let threw = null;
    try {
      await updateCampaign({ userId, campaignId, data: { status: 'published' } });
    } catch (err) { threw = err; }
    assert.ok(threw, 'publish must be rejected when slug/hero/goal are missing');
  });

  await check('publish gate: a genuinely complete campaign publishes and sets published_at', async () => {
    await pool.query(
      `UPDATE campaigns SET slug=$2, cover_image_url='https://example.test/x.jpg', target_amount=1000 WHERE id=$1`,
      [campaignId, `zzz-test-upd-sec-complete-${Date.now()}`]
    );
    const result = await updateCampaign({ userId, campaignId, data: { status: 'published' } });
    assert.strictEqual(result.status, 'published');
    assert.ok(result.published_at, 'published_at must be set on first publish');
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
