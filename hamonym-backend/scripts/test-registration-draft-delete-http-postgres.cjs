// HTTP end-to-end check of DELETE /api/entities/:id/draft-registration with a
// signed JWT, the real router, auth middleware and service, against a
// disposable LOCAL database that has the full application schema.
// Refuses any non-local database. Usage:
//   DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=<disposable> DB_USER=postgres DB_PASSWORD=... \
//   DB_SSL=false JWT_SECRET=local-test SUPABASE_URL=http://127.0.0.1:9 SUPABASE_SERVICE_ROLE_KEY=x \
//   node scripts/test-registration-draft-delete-http-postgres.cjs
const assert = require('assert/strict');
const path = require('path');
if (!['127.0.0.1', 'localhost'].includes(process.env.DB_HOST) || process.env.DB_SSL !== 'false') {
  console.error('Refusing to run: DB_HOST must be a local disposable database.');
  process.exit(1);
}
const backend = process.env.HAMONYM_BACKEND_DIR || path.resolve(__dirname, '..');
const express = require('express');
const jwt = require('jsonwebtoken');
const db = require(path.join(backend, 'src/db/db'));
const routes = require(path.join(backend, 'src/modules/entities/entities.routes'));

const OWNER = 990001, MEMBER = 990002;
let passed = 0;
const check = async (name, fn) => { await fn(); passed++; console.log('PASS ' + name); };

(async () => {
  const app = express();
  app.use(express.json());
  app.use('/api/entities', routes);
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/entities`;
  const token = (userId) => jwt.sign({ userId }, process.env.JWT_SECRET);
  const call = (method, url, userId) => fetch(base + url, { method, headers: userId ? { Authorization: `Bearer ${token(userId)}` } : {} })
    .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const ids = [];
  const entity = async (status, createdBy, name) => {
    const { rows: [e] } = await db.query(
      `INSERT INTO entities (entity_type, legal_name, display_name, registration_number, status, created_by_user_id)
       VALUES ('association', $1, $1, $2, $3, $4) RETURNING id`,
      [name, String(580000000 + ids.length + Math.floor(Math.random() * 90000)), status, createdBy]);
    ids.push(e.id);
    await db.query('INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, $3), ($4, $2, $5)', [OWNER, e.id, 'owner', MEMBER, 'manager']);
    return e.id;
  };
  const row = async (id) => (await db.query('SELECT status, deleted_at, deleted_by FROM entities WHERE id = $1', [id])).rows[0];

  try {
    await db.query(`INSERT INTO users (id, email, full_name, role_id) SELECT u.id, u.email, u.name, (SELECT id FROM roles ORDER BY id LIMIT 1) FROM (VALUES ($1::bigint, 'owner@draft.test', 'Owner'), ($2::bigint, 'member@draft.test', 'Member')) AS u(id, email, name)`, [OWNER, MEMBER]);
    const draft = await entity('draft', OWNER, 'Draft to delete');
    const other = await entity('draft', OWNER, 'Draft to keep');
    const submitted = await entity('pending_review', OWNER, 'Submitted');
    const withCampaign = await entity('draft', OWNER, 'Draft with campaign');
    await db.query(`INSERT INTO campaigns (entity_id, title, slug, status) VALUES ($1, 'c', $2, 'draft')`, [withCampaign, 'draft-del-' + Date.now()]);

    await check('no token: 401', async () => assert.equal((await call('DELETE', `/${draft}/draft-registration`)).status, 401));
    await check('a member who is not the creator: 403 NOT_DRAFT_CREATOR, nothing changes', async () => {
      const r = await call('DELETE', `/${draft}/draft-registration`, MEMBER);
      assert.equal(r.status, 403); assert.equal(r.body.code, 'NOT_DRAFT_CREATOR'); assert.equal((await row(draft)).deleted_at, null);
    });
    await check('submitted registration: 409 NOT_A_DRAFT', async () => {
      const r = await call('DELETE', `/${submitted}/draft-registration`, OWNER);
      assert.equal(r.status, 409); assert.equal(r.body.code, 'NOT_A_DRAFT'); assert.equal((await row(submitted)).deleted_at, null);
    });
    await check('draft with a campaign: 409 DRAFT_HAS_CAMPAIGNS', async () => {
      const r = await call('DELETE', `/${withCampaign}/draft-registration`, OWNER);
      assert.equal(r.status, 409); assert.equal(r.body.code, 'DRAFT_HAS_CAMPAIGNS'); assert.equal((await row(withCampaign)).deleted_at, null);
    });
    await check('creator deletes a valid draft: 200 and a soft delete', async () => {
      const r = await call('DELETE', `/${draft}/draft-registration`, OWNER);
      assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.entity.id, draft);
      const after = await row(draft); assert.equal(after.status, 'deleted'); assert.ok(after.deleted_at); assert.equal(String(after.deleted_by), String(OWNER));
    });
    await check('after "refresh" the deleted draft is absent from /my; the other draft stays', async () => {
      const r = await call('GET', '/my', OWNER);
      assert.equal(r.status, 200);
      const listed = (r.body.entities || []).map((e) => e.id);
      assert.ok(!listed.includes(draft)); assert.ok(listed.includes(other));
    });
    await check('deleting again: 404', async () => assert.equal((await call('DELETE', `/${draft}/draft-registration`, OWNER)).status, 404));
    console.log(`${passed} registration draft deletion HTTP checks PASS; disposable local database only.`);
  } finally {
    await db.query('DELETE FROM campaigns WHERE entity_id = ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM user_entities WHERE entity_id = ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM entities WHERE id = ANY($1::uuid[])', [ids]);
    await db.query('DELETE FROM users WHERE id = ANY($1::bigint[])', [[OWNER, MEMBER]]);
    server.close();
    await db.end?.();
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
