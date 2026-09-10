// Proves the 2026-09-10 fix to requireAiAccessFromBody
// (ai-access.middleware.js): before this fix, an authenticated user could
// supply ANY entityId in the request body (used by campaign-creation brief
// extraction and partner AI import) and run cost-incurring AI calls under
// that entity's granted ai_features_enabled flag, regardless of whether
// they actually belonged to it. Now also checks isEntityMember.
//
// Real-DB fixture, no donations involved -- freely cleanable.
//
// Run: node scripts/test-ai-access-ownership.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { requireAiAccessFromBody } = require('../src/middleware/ai-access.middleware');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function fakeReqRes(body, userId) {
  const req = { body, user: { id: userId } };
  let statusCode = null;
  let jsonBody = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(body) { jsonBody = body; return this; },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  return { req, res, next, get statusCode() { return statusCode; }, get jsonBody() { return jsonBody; }, get nextCalled() { return nextCalled; } };
}

let ownerId, strangerId, entityId;

async function setup() {
  const usersRes = await pool.query('SELECT id FROM users LIMIT 2');
  if (usersRes.rows.length < 2) throw new Error('Need at least 2 user rows for this test');
  ownerId = usersRes.rows[0].id;
  strangerId = usersRes.rows[1].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id, ai_features_enabled)
     VALUES ('ZZZ_TEST ai-access-ownership', 'association', 'active', $1, true) RETURNING id`,
    [ownerId]
  );
  entityId = entityRes.rows[0].id;
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1,$2,'owner')`, [ownerId, entityId]);
}

async function cleanup() {
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
}

async function main() {
  await setup();

  await check('a real member of the entity is allowed through', async () => {
    const ctx = fakeReqRes({ entityId }, ownerId);
    await requireAiAccessFromBody()(ctx.req, ctx.res, ctx.next);
    assert.ok(ctx.nextCalled, 'next() must be called for the real owner');
  });

  await check('a non-member supplying the entity id in the body is rejected 403', async () => {
    const ctx = fakeReqRes({ entityId }, strangerId);
    await requireAiAccessFromBody()(ctx.req, ctx.res, ctx.next);
    assert.strictEqual(ctx.nextCalled, false, 'next() must NOT be called for a non-member');
    assert.strictEqual(ctx.statusCode, 403);
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
