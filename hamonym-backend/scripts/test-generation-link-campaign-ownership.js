// Proves the 2026-09-10 fix to generation-log.js#linkCampaign: before this
// fix, PATCH /api/campaign-creation/generations/:id/link-campaign had no
// ownership check at all -- any authenticated user could attach any
// campaign_ai_generations row to any campaign, corrupting another entity's
// AI-generation audit trail. Now verifies the caller belongs to the target
// campaign's owning entity first.
//
// Real-DB fixture, no donations involved -- freely cleanable.
//
// Run: node scripts/test-generation-link-campaign-ownership.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const generationLog = require('../src/agents/campaign-creation/generation-log');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let ownerId, strangerId, entityId, campaignId, generationId;

async function setup() {
  const usersRes = await pool.query('SELECT id FROM users LIMIT 2');
  if (usersRes.rows.length < 2) throw new Error('Need at least 2 user rows for this test');
  ownerId = usersRes.rows[0].id;
  strangerId = usersRes.rows[1].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST generation-link-ownership', 'association', 'active', $1) RETURNING id`,
    [ownerId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [ownerId, entityId]);

  const campaignRes = await pool.query(
    `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1,$2,'ZZZ_TEST generation-link campaign','draft') RETURNING id`,
    [entityId, `zzz-test-gen-link-${Date.now()}`]
  );
  campaignId = campaignRes.rows[0].id;

  const genRes = await pool.query(
    `INSERT INTO campaign_ai_generations (created_by_user_id, prompt_version, model, brief_json, generation_reason)
     VALUES ($1,'v1','test-model','{}'::jsonb,'initial') RETURNING id`,
    [strangerId]
  );
  generationId = genRes.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM campaign_ai_generations WHERE id = $1`, [generationId]);
  await pool.query(`DELETE FROM campaigns WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('a non-member cannot link a generation to a campaign they do not own', async () => {
    await generationLog.linkCampaign(generationId, campaignId, strangerId);
    const row = (await pool.query('SELECT campaign_id FROM campaign_ai_generations WHERE id=$1', [generationId])).rows[0];
    assert.strictEqual(row.campaign_id, null, 'link must not be written for a non-member caller');
  });

  await check('the real owner can link the generation to their own campaign', async () => {
    await generationLog.linkCampaign(generationId, campaignId, ownerId);
    const row = (await pool.query('SELECT campaign_id FROM campaign_ai_generations WHERE id=$1', [generationId])).rows[0];
    assert.strictEqual(row.campaign_id, campaignId);
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
