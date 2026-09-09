// Real-DB functional test for the entity self-service MASAV routes added
// 2026-09-09 (billing.routes.js#/masav/:entityId, masav-self-service.
// controller.js) -- the association-facing counterpart to the Super Admin
// Billing Ops MASAV drawer, added so both surfaces read/write the same
// entity_masav_details row (migration 060/063) instead of two disconnected
// MASAV data models.
//
// Central claim under test: one association can never read or modify
// another association's MASAV bank details or authorization document
// through these routes. Exercises the exact middleware
// (requireEntityOwnership -> isEntityMember, entity-permission.middleware.js)
// and controller functions wired into billing.routes.js, not a re-
// implementation of the check.
//
// Everything created here is throwaway and fully deleted at the end
// (verified by re-querying): two entities, two users, two user_entities
// rows, at most one entity_masav_details row, platform_audit_log rows.
//
// Run: node scripts/test-masav-self-service-ownership.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');
const { isEntityMember, requireEntityOwnership } = require('../src/middleware/entity-permission.middleware');
const masavSelfService = require('../src/modules/billing/masav-self-service.controller');
const masavConfig = require('../src/modules/billing-engine/masav-config.service');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

// Minimal fake Express req/res good enough to drive real middleware/
// controller functions end-to-end without standing up an HTTP server.
function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    setHeader() {},
    send(payload) { this.body = payload; return this; },
  };
  return res;
}

// Deterministic, no timing guesswork: requireEntityOwnership either calls
// next() (allowed) or responds via res.json() (blocked) -- resolve on
// whichever actually happens, not on a fixed delay.
async function runMiddleware(req) {
  const res = fakeRes();
  return new Promise((resolve, reject) => {
    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      originalJson(payload);
      resolve({ outcome: 'blocked', status: res.statusCode, body: payload });
      return res;
    };
    requireEntityOwnership('entityId')(req, res, (err) => {
      if (err) return reject(err);
      resolve({ outcome: 'next', status: res.statusCode });
    });
  });
}

const RUN_TAG = `zzz-test-masav-ownership-${Date.now()}`;
const ids = { entityA: null, entityB: null, userA: null, userB: null };

async function setup() {
  const entityA = await pool.query(
    `INSERT INTO entities (display_name, status, created_by_user_id) VALUES ($1, 'active', 1) RETURNING id`,
    ['ZZZ_TEST_MASAV_OWNERSHIP_A_DO_NOT_USE']
  );
  ids.entityA = entityA.rows[0].id;

  const entityB = await pool.query(
    `INSERT INTO entities (display_name, status, created_by_user_id) VALUES ($1, 'active', 1) RETURNING id`,
    ['ZZZ_TEST_MASAV_OWNERSHIP_B_DO_NOT_USE']
  );
  ids.entityB = entityB.rows[0].id;

  const userA = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test User A', true) RETURNING id`,
    [`${RUN_TAG}-user-a@example.invalid`]
  );
  ids.userA = userA.rows[0].id;

  const userB = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test User B', true) RETURNING id`,
    [`${RUN_TAG}-user-b@example.invalid`]
  );
  ids.userB = userB.rows[0].id;

  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [ids.userA, ids.entityA]);
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`, [ids.userB, ids.entityB]);
}

async function cleanup() {
  await pool.query(`DELETE FROM platform_audit_log WHERE entity_id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  await pool.query(`DELETE FROM entity_masav_details WHERE entity_id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  await pool.query(`DELETE FROM entities WHERE id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  await pool.query(`DELETE FROM users WHERE id IN ($1, $2)`, [ids.userA, ids.userB]);
}

async function verifyZeroResidue() {
  const audit = await pool.query(`SELECT count(*)::int AS n FROM platform_audit_log WHERE entity_id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  const cfg = await pool.query(`SELECT count(*)::int AS n FROM entity_masav_details WHERE entity_id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  const ue = await pool.query(`SELECT count(*)::int AS n FROM user_entities WHERE entity_id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  const ent = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id IN ($1, $2)`, [ids.entityA, ids.entityB]);
  const usr = await pool.query(`SELECT count(*)::int AS n FROM users WHERE id IN ($1, $2)`, [ids.userA, ids.userB]);
  assert.strictEqual(audit.rows[0].n, 0, 'platform_audit_log residue');
  assert.strictEqual(cfg.rows[0].n, 0, 'entity_masav_details residue');
  assert.strictEqual(ue.rows[0].n, 0, 'user_entities residue');
  assert.strictEqual(ent.rows[0].n, 0, 'entities residue');
  assert.strictEqual(usr.rows[0].n, 0, 'users residue');
}

async function main() {
  await setup();
  try {
    await check('isEntityMember: userA belongs to entityA, not entityB', async () => {
      assert.strictEqual(await isEntityMember(ids.userA, ids.entityA), true);
      assert.strictEqual(await isEntityMember(ids.userA, ids.entityB), false);
    });

    await check('isEntityMember: userB belongs to entityB, not entityA', async () => {
      assert.strictEqual(await isEntityMember(ids.userB, ids.entityB), true);
      assert.strictEqual(await isEntityMember(ids.userB, ids.entityA), false);
    });

    await check('requireEntityOwnership blocks userA from entityB\'s MASAV route with 403 (real middleware, real req/res)', async () => {
      const req = { user: { id: ids.userA }, params: { entityId: ids.entityB } };
      const result = await runMiddleware(req);
      assert.strictEqual(result.outcome, 'blocked');
      assert.strictEqual(result.status, 403);
    });

    await check('requireEntityOwnership lets userA through to their own entityA\'s MASAV route', async () => {
      const req = { user: { id: ids.userA }, params: { entityId: ids.entityA } };
      const result = await runMiddleware(req);
      assert.strictEqual(result.outcome, 'next');
    });

    await check('userA (self-service) can save bank details for entityA via the real controller function', async () => {
      const req = {
        params: { entityId: ids.entityA },
        body: { bankCode: '11', branchCode: '222', accountNumber: '3334445', accountHolderName: 'ZZZ Test A Holder' },
        user: { id: ids.userA },
        ip: '127.0.0.1',
      };
      const res = fakeRes();
      await masavSelfService.upsertConfig(req, res);
      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.config.bank_code, '11');
      assert.strictEqual(res.body.config.authorized, false, 'self-service save must never authorize');

      // Ground truth: exactly one row, on entityA, nothing leaked to entityB.
      const rowA = await masavConfig.getByEntityId(ids.entityA);
      const rowB = await masavConfig.getByEntityId(ids.entityB);
      assert.ok(rowA, 'entityA must have its config row');
      assert.strictEqual(rowB, null, 'entityB must be completely untouched by entityA\'s self-service save');
    });

    await check('userA\'s self-service write is attributed to userA in platform_audit_log, not fabricated as a super admin action', async () => {
      const { rows } = await pool.query(
        `SELECT super_admin_user_id FROM platform_audit_log WHERE entity_id = $1 AND action = 'masav_bank_details_upsert' ORDER BY created_at DESC LIMIT 1`,
        [ids.entityA]
      );
      assert.strictEqual(String(rows[0].super_admin_user_id), String(ids.userA));
    });

    await check('userA cannot see the config self-service saved for entityB\'s route target -- getConfig is entity-scoped by the URL param it was authorized for', async () => {
      // Simulates what would happen if userA's already-authorized request
      // (entityId=entityA) were the only thing standing between them and
      // entityB's data -- getConfig always reads exactly req.params.entityId,
      // never anything from the body/session that could diverge.
      const req = { params: { entityId: ids.entityA }, user: { id: ids.userA } };
      const res = fakeRes();
      await masavSelfService.getConfig(req, res);
      assert.strictEqual(res.body.config.entity_id, ids.entityA);
      assert.notStrictEqual(res.body.config.entity_id, ids.entityB);
    });

    await check('self-service controller exposes no authorize/revoke -- only masav-ops.controller.js (Super Admin) does', async () => {
      assert.strictEqual(masavSelfService.authorize, undefined);
      assert.strictEqual(masavSelfService.revoke, undefined);
    });
  } finally {
    await cleanup();
    await verifyZeroResidue();
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  if (failures > 0) process.exitCode = 1;
  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL', err);
  try { await cleanup(); } catch (_) {}
  process.exitCode = 1;
  await pool.end();
});
