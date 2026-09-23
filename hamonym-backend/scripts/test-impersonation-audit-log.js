// Real-DB regression test for the 2026-09-23 impersonation audit fix.
//
// Before this, req.user.impersonatedBy was decoded on every request during
// an impersonation session (require-auth.js) but nothing downstream ever
// read it -- a campaign edit, visibility toggle, etc. made while
// impersonating persisted with zero trace that it wasn't the real user
// acting on their own. impersonation-audit.middleware.js closes that gap by
// writing a platform_audit_log row (action='impersonated_action') for every
// mutating (POST/PATCH/PUT/DELETE) request made while req.user.impersonatedBy
// is set, without changing what the action itself is allowed to do.
//
// This tests the middleware directly (fake req/res, real res.on('finish')
// semantics via a plain EventEmitter, matching how Express's res object
// actually behaves) rather than spinning up a full HTTP server -- the
// middleware only ever reads req.method/req.path/req.user/res.statusCode,
// never req.body, so a fake req/res pair exercises the real logic exactly.
//
// Run: node scripts/test-impersonation-audit-log.js

require('dotenv').config();
const assert = require('assert');
const { EventEmitter } = require('events');
const pool = require('../src/db/db');
const impersonationAudit = require('../src/middleware/impersonation-audit.middleware');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

let adminId, targetUserId, entityId, campaignId;

async function setup() {
  const adminRes = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test Impersonation Admin', true) RETURNING id`,
    [`zzz-test-imp-audit-admin-${Date.now()}@example.invalid`]
  );
  adminId = adminRes.rows[0].id;

  const targetRes = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (1, $1, 'ZZZ Test Impersonation Target', true) RETURNING id`,
    [`zzz-test-imp-audit-target-${Date.now()}@example.invalid`]
  );
  targetUserId = targetRes.rows[0].id;

  const entityRes = await pool.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id)
     VALUES ('ZZZ_TEST impersonation-audit', 'association', 'active', $1) RETURNING id`,
    [targetUserId]
  );
  entityId = entityRes.rows[0].id;

  const campaignRes = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, target_amount)
     VALUES ($1, 'ZZZ Test Impersonation Audit Campaign', $2, 'published', 1000) RETURNING id`,
    [entityId, `zzz-test-imp-audit-${Date.now()}`]
  );
  campaignId = campaignRes.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM platform_audit_log WHERE target_user_id = $1 AND action = 'impersonated_action'`, [targetUserId]);
  await pool.query(`DELETE FROM campaigns WHERE id = $1`, [campaignId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [entityId]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [[adminId, targetUserId]]);
}

// Drives the real middleware exactly as Express would: call it (which
// synchronously registers a res.on('finish', ...) listener and calls
// next()), then emit 'finish' the way Express does once a response is sent.
async function runMiddleware({ method, path, user, statusCode, body }) {
  const req = { method, path, user, ip: '203.0.113.5', body };
  const res = new EventEmitter();
  res.statusCode = statusCode;

  let nextCalled = false;
  impersonationAudit(req, res, () => { nextCalled = true; });
  assert.strictEqual(nextCalled, true, 'next() must be called synchronously, before finish');

  res.emit('finish');
  // The DB insert inside the 'finish' handler is fire-and-forget (not
  // awaited by the middleware itself, by design -- it must never delay or
  // fail the real response) -- give it a moment to actually land.
  await new Promise(resolve => setTimeout(resolve, 400));
}

async function rowsFor(targetId) {
  const r = await pool.query(
    `SELECT * FROM platform_audit_log WHERE target_user_id = $1 AND action = 'impersonated_action' ORDER BY id ASC`,
    [targetId]
  );
  return r.rows;
}

async function main() {
  await setup();

  await check('1. normal (non-impersonating) user mutation -> no impersonation audit record', async () => {
    await runMiddleware({ method: 'POST', path: `/api/campaigns/${campaignId}/visibility`, user: { id: targetUserId, impersonatedBy: null, isSuperAdmin: false }, statusCode: 200 });
    const rows = await rowsFor(targetUserId);
    assert.strictEqual(rows.length, 0);
  });

  await check('2. Super Admin acting normally (not impersonating) mutation -> no impersonation-action record', async () => {
    await runMiddleware({ method: 'PATCH', path: `/api/platform/campaigns/${campaignId}/status`, user: { id: adminId, impersonatedBy: null, isSuperAdmin: true }, statusCode: 200 });
    const rows = await pool.query(`SELECT * FROM platform_audit_log WHERE super_admin_user_id = $1 AND action = 'impersonated_action'`, [adminId]);
    assert.strictEqual(rows.rows.length, 0);
  });

  await check('3. impersonated PATCH -> both real admin and impersonated user identities stored', async () => {
    await runMiddleware({
      method: 'PATCH',
      path: `/api/campaigns/${campaignId}/visibility`,
      user: { id: targetUserId, impersonatedBy: adminId, isSuperAdmin: false },
      statusCode: 200,
    });
    const rows = await rowsFor(targetUserId);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(String(rows[0].super_admin_user_id), String(adminId));
    assert.strictEqual(String(rows[0].target_user_id), String(targetUserId));
    assert.strictEqual(rows[0].campaign_id, campaignId);
    assert.ok(rows[0].notes.includes('PATCH'), 'notes must record the HTTP method');
    assert.ok(rows[0].notes.includes('200'), 'notes must record the response status');
  });

  await check('4a. impersonated POST is recognized', async () => {
    await runMiddleware({
      method: 'POST',
      path: `/api/campaigns/${campaignId}/rewards`,
      user: { id: targetUserId, impersonatedBy: adminId, isSuperAdmin: false },
      statusCode: 201,
    });
    const rows = await rowsFor(targetUserId);
    assert.ok(rows.some(r => r.notes.includes('POST') && r.notes.includes('201')));
  });

  await check('4b. impersonated DELETE is recognized', async () => {
    await runMiddleware({
      method: 'DELETE',
      path: `/api/campaigns/${campaignId}/rewards/some-offering-id`,
      user: { id: targetUserId, impersonatedBy: adminId, isSuperAdmin: false },
      statusCode: 200,
    });
    const rows = await rowsFor(targetUserId);
    assert.ok(rows.some(r => r.notes.includes('DELETE')));
  });

  await check('5. GET while impersonating -> no mutation audit record', async () => {
    const before = (await rowsFor(targetUserId)).length;
    await runMiddleware({
      method: 'GET',
      path: `/api/campaigns/${campaignId}`,
      user: { id: targetUserId, impersonatedBy: adminId, isSuperAdmin: false },
      statusCode: 200,
    });
    const after = (await rowsFor(targetUserId)).length;
    assert.strictEqual(after, before, 'a GET must not add a row');
  });

  await check('6. failed/403 mutation is distinguishable from a successful one', async () => {
    await runMiddleware({
      method: 'POST',
      path: `/api/campaigns/${campaignId}/sponsors`,
      user: { id: targetUserId, impersonatedBy: adminId, isSuperAdmin: false },
      statusCode: 403,
    });
    const rows = await rowsFor(targetUserId);
    const failedRow = rows.find(r => r.notes.includes('/sponsors') && r.notes.includes('403'));
    assert.ok(failedRow, 'the 403 attempt must still be logged, but marked with its real status');
    assert.ok(!failedRow.notes.includes('-> 200'), 'must not be mislabeled as a success');
  });

  await check('7. sensitive request body/token data is never stored', async () => {
    const secret = 'SUPER_SECRET_CARDCOM_PASSWORD_zzz12345';
    await runMiddleware({
      method: 'PATCH',
      path: `/api/campaigns/${campaignId}/settings`,
      user: { id: targetUserId, impersonatedBy: adminId, isSuperAdmin: false },
      statusCode: 200,
      body: { cardcomApiPassword: secret, donorCardNumber: '4111111111111111' },
    });
    const rows = await rowsFor(targetUserId);
    const serialized = JSON.stringify(rows);
    assert.ok(!serialized.includes(secret), 'request body must never be persisted into the audit row');
    assert.ok(!serialized.includes('4111111111111111'), 'request body must never be persisted into the audit row');
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
