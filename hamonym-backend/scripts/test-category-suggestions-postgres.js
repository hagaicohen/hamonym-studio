// Category suggestions (migration 086) against an ISOLATED local Postgres only:
// authenticated submission with validation, membership check, duplicate
// pending detection and rate limiting; Super Admin-only listing and
// approve/reject; approval never changes the official category list or any
// entity's categories. Real routers, real middleware, real JWTs, real SQL.
//
// Refuses to run unless DB_HOST is localhost/127.0.0.1 and DB_NAME starts
// with "hamonym_" (never the shared Supabase database).
//
// Run (example):
//   DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=hamonym_cat_masav_20261103 \
//   DB_USER=postgres DB_PASSWORD=... DB_SSL=false JWT_SECRET=local-test \
//   node scripts/test-category-suggestions-postgres.js

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

if (!['localhost', '127.0.0.1'].includes(process.env.DB_HOST) || !/^hamonym_/.test(process.env.DB_NAME || '')) {
  console.error('Refusing to run: point DB_HOST/DB_NAME at an isolated local test database.');
  process.exit(2);
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-category-suggestions-test';

const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/db');
const { ENTITY_CATEGORIES } = require('../src/modules/campaigns/entity-categories');

let passed = 0;
let failures = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (err) { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); }
}

const tag = `cs-test-${crypto.randomBytes(4).toString('hex')}`;
const ids = { users: [], entities: [] };

async function createUser(name, { superAdmin = false, permissions = null } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, email_verified, is_super_admin, platform_permissions, created_at, updated_at)
     VALUES ($1, $2, $3, true, true, $4, $5, now(), now()) RETURNING id`,
    [superAdmin ? 5 : 2, `${tag}-${name}@example.test`, `${tag} ${name}`, superAdmin, permissions]
  );
  ids.users.push(rows[0].id);
  return rows[0].id;
}

async function createEntity(ownerId, name) {
  const { rows } = await pool.query(
    `INSERT INTO entities (display_name, created_by_user_id, entity_type, primary_category, secondary_categories)
     VALUES ($1, $2, 'association', 'health', ARRAY['education']) RETURNING id`,
    [`${tag} ${name}`, ownerId]
  );
  ids.entities.push(rows[0].id);
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role, created_at) VALUES ($1, $2, 'owner', now())`, [ownerId, rows[0].id]);
  return rows[0].id;
}

const token = (userId, extra = {}) => jwt.sign({ userId, roleId: extra.isSuperAdmin ? 5 : 2, ...extra }, process.env.JWT_SECRET);

async function main() {
  const db = await pool.query('SELECT current_database() AS db, inet_server_port() AS port');
  console.log(`Using isolated database ${db.rows[0].db} (server port ${db.rows[0].port})`);

  const app = express();
  app.use(express.json());
  app.use('/api/category-suggestions', require('../src/modules/category-suggestions/category-suggestions.routes'));
  app.use('/api/platform', require('../src/modules/platform/platform.routes'));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { auth, body } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const member = await createUser('member');
  const outsider = await createUser('outsider');
  const busy = await createUser('busy');
  const staff = await createUser('staff', { permissions: ['organizations'] });
  const admin = await createUser('admin', { superAdmin: true });
  const entityA = await createEntity(member, 'A');
  const categoriesFile = path.join(__dirname, '../src/modules/campaigns/entity-categories.js');
  const categoriesHash = crypto.createHash('sha256').update(fs.readFileSync(categoriesFile)).digest('hex');
  const officialCount = ENTITY_CATEGORIES.length;
  const label = `ספורט ימי ${tag.slice(-4)}`;
  let suggestionId;

  try {
    await check('unauthenticated submission is rejected', async () => {
      const r = await call('POST', '/api/category-suggestions', { body: { label } });
      assert.strictEqual(r.status, 401);
    });

    await check('an organization member suggests a category for their organization (201, label cleaned)', async () => {
      const r = await call('POST', '/api/category-suggestions', { auth: token(member), body: { label: `  ${label.replace(' ', '   ')} `, entityId: entityA } });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.strictEqual(r.body.duplicate, false);
      assert.strictEqual(r.body.suggestion.label, label);
      assert.strictEqual(r.body.suggestion.status, 'pending');
      suggestionId = r.body.suggestion.id;
      const row = (await pool.query('SELECT * FROM category_suggestions WHERE id = $1', [suggestionId])).rows[0];
      assert.strictEqual(String(row.suggested_by_user_id), String(member));
      assert.strictEqual(row.entity_id, entityA);
    });

    await check('the same pending label (other spacing/quotes/case) returns the existing suggestion, no new row', async () => {
      const r = await call('POST', '/api/category-suggestions', { auth: token(outsider), body: { label: `"${label.replace(/ /g, '  ')}"` } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.duplicate, true);
      assert.strictEqual(r.body.suggestion.id, suggestionId);
      const n = (await pool.query('SELECT count(*)::int AS n FROM category_suggestions WHERE normalized_label = (SELECT normalized_label FROM category_suggestions WHERE id = $1)', [suggestionId])).rows[0].n;
      assert.strictEqual(n, 1);
    });

    await check('an existing official category (incl. niqqud variant) is rejected with 409 and named', async () => {
      for (const existing of ['בריאות', 'דִּיוּר', 'סיוע   לנזקקים']) {
        const r = await call('POST', '/api/category-suggestions', { auth: token(member), body: { label: existing } });
        assert.strictEqual(r.status, 409, existing);
        assert.strictEqual(r.body.code, 'CATEGORY_EXISTS');
        assert.ok(r.body.category && r.body.category.id, 'response names the existing category');
      }
    });

    await check('invalid labels are rejected with a Hebrew error', async () => {
      for (const bad of ['א', 'א'.repeat(61), '<script>alert(1)</script>', '12', '   ', 42, null, { x: 1 }]) {
        const r = await call('POST', '/api/category-suggestions', { auth: token(member), body: { label: bad } });
        assert.strictEqual(r.status, 400, `label ${JSON.stringify(bad)}`);
        assert.strictEqual(r.body.code, 'INVALID_LABEL');
        assert.match(r.body.error, /[֐-׿]/);
      }
    });

    await check('suggesting for an organization the user does not belong to is forbidden; malformed id is 400', async () => {
      const r = await call('POST', '/api/category-suggestions', { auth: token(outsider), body: { label: `אחר כלשהו ${tag}`, entityId: entityA } });
      assert.strictEqual(r.status, 403);
      const bad = await call('POST', '/api/category-suggestions', { auth: token(member), body: { label: `שונה ${tag}`, entityId: 'not-a-uuid' } });
      assert.strictEqual(bad.status, 400);
      assert.strictEqual(bad.body.code, 'INVALID_ENTITY');
    });

    await check('per-user rate limit: the 6th new suggestion within an hour gets 429', async () => {
      for (let i = 0; i < 5; i++) {
        const r = await call('POST', '/api/category-suggestions', { auth: token(busy), body: { label: `קטגוריה ${'אבגדה'[i]} ${tag.slice(-4)}` } });
        assert.strictEqual(r.status, 201, `#${i + 1}: ${JSON.stringify(r.body)}`);
      }
      const r = await call('POST', '/api/category-suggestions', { auth: token(busy), body: { label: `קטגוריה ו ${tag.slice(-4)}` } });
      assert.strictEqual(r.status, 429);
      assert.strictEqual(r.body.code, 'RATE_LIMITED');
    });

    await check('only a Super Admin can list suggestions (members and platform staff get 403)', async () => {
      assert.strictEqual((await call('GET', '/api/platform/category-suggestions', { auth: token(member) })).status, 403);
      assert.strictEqual((await call('GET', '/api/platform/category-suggestions', { auth: token(staff, { platformPermissions: ['organizations'] }) })).status, 403);
      const r = await call('GET', '/api/platform/category-suggestions?status=pending', { auth: token(admin, { isSuperAdmin: true }) });
      assert.strictEqual(r.status, 200);
      assert.ok(r.body.suggestions.some((s) => s.id === suggestionId && s.entity_name && s.suggested_by_email));
      assert.ok(r.body.suggestions.every((s) => s.status === 'pending'));
      assert.ok(r.body.counts.pending >= 6);
      assert.strictEqual((await call('GET', '/api/platform/category-suggestions?status=bogus', { auth: token(admin, { isSuperAdmin: true }) })).status, 400);
    });

    await check('only a Super Admin can approve or reject', async () => {
      const r = await call('POST', `/api/platform/category-suggestions/${suggestionId}/approve`, { auth: token(staff, { platformPermissions: ['organizations'] }) });
      assert.strictEqual(r.status, 403);
      const row = (await pool.query('SELECT status FROM category_suggestions WHERE id = $1', [suggestionId])).rows[0];
      assert.strictEqual(row.status, 'pending');
    });

    await check('approve records the decision and audit log, and changes no categories anywhere', async () => {
      const r = await call('POST', `/api/platform/category-suggestions/${suggestionId}/approve`, { auth: token(admin, { isSuperAdmin: true }), body: { note: 'לשקול בגרסה הבאה' } });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.strictEqual(r.body.suggestion.status, 'approved');
      assert.ok(r.body.suggestion.reviewed_at);
      assert.strictEqual(String(r.body.suggestion.reviewed_by_user_id), String(admin));
      const audit = await pool.query(`SELECT * FROM platform_audit_log WHERE action = 'category_suggestion_approved' AND entity_id = $1`, [entityA]);
      assert.strictEqual(audit.rows.length, 1);
      assert.ok(audit.rows[0].notes.includes(label));
      const entity = (await pool.query('SELECT primary_category, secondary_categories FROM entities WHERE id = $1', [entityA])).rows[0];
      assert.strictEqual(entity.primary_category, 'health');
      assert.deepStrictEqual(entity.secondary_categories, ['education']);
      assert.strictEqual(crypto.createHash('sha256').update(fs.readFileSync(categoriesFile)).digest('hex'), categoriesHash);
      delete require.cache[require.resolve('../src/modules/campaigns/entity-categories')];
      assert.strictEqual(require('../src/modules/campaigns/entity-categories').ENTITY_CATEGORIES.length, officialCount);
    });

    await check('a reviewed suggestion cannot be reviewed again; unknown ids are 404', async () => {
      const again = await call('POST', `/api/platform/category-suggestions/${suggestionId}/reject`, { auth: token(admin, { isSuperAdmin: true }) });
      assert.strictEqual(again.status, 409);
      assert.strictEqual(again.body.code, 'ALREADY_REVIEWED');
      assert.strictEqual((await call('POST', `/api/platform/category-suggestions/${crypto.randomUUID()}/reject`, { auth: token(admin, { isSuperAdmin: true }) })).status, 404);
      assert.strictEqual((await call('POST', '/api/platform/category-suggestions/xyz/reject', { auth: token(admin, { isSuperAdmin: true }) })).status, 404);
    });

    await check('reject works, with a 500-character note limit', async () => {
      const pending = (await pool.query(`SELECT id FROM category_suggestions WHERE suggested_by_user_id = $1 AND status = 'pending' LIMIT 1`, [busy])).rows[0].id;
      const long = await call('POST', `/api/platform/category-suggestions/${pending}/reject`, { auth: token(admin, { isSuperAdmin: true }), body: { note: 'א'.repeat(501) } });
      assert.strictEqual(long.status, 400);
      const r = await call('POST', `/api/platform/category-suggestions/${pending}/reject`, { auth: token(admin, { isSuperAdmin: true }), body: { note: 'קיימת קטגוריה דומה' } });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.suggestion.status, 'rejected');
      const counts = (await call('GET', '/api/platform/category-suggestions', { auth: token(admin, { isSuperAdmin: true }) })).body.counts;
      assert.ok(counts.approved >= 1 && counts.rejected >= 1);
    });

    await check('after approval, the same label can be suggested again as a new pending item', async () => {
      const r = await call('POST', '/api/category-suggestions', { auth: token(outsider), body: { label } });
      assert.strictEqual(r.status, 201);
      assert.notStrictEqual(r.body.suggestion.id, suggestionId);
    });

    await check('DB constraints: one pending row per normalized label; reviewed rows need reviewed_at', async () => {
      const normalized = (await pool.query('SELECT normalized_label FROM category_suggestions WHERE id = $1', [suggestionId])).rows[0].normalized_label;
      await assert.rejects(pool.query(
        `INSERT INTO category_suggestions (label, normalized_label, suggested_by_user_id) VALUES ('x y', $1, $2)`, [normalized, member]),
        /category_suggestions_pending_label_unique/);
      await assert.rejects(pool.query(
        `INSERT INTO category_suggestions (label, normalized_label, suggested_by_user_id, status) VALUES ('ab', 'ab', $1, 'approved')`, [member]),
        /category_suggestions_review_consistency/);
    });
  } finally {
    server.close();
    await pool.query(`DELETE FROM platform_audit_log WHERE super_admin_user_id = ANY($1::bigint[])`, [ids.users]);
    await pool.query(`DELETE FROM category_suggestions WHERE suggested_by_user_id = ANY($1::bigint[])`, [ids.users]);
    await pool.query(`DELETE FROM user_entities WHERE entity_id = ANY($1::uuid[])`, [ids.entities]);
    await pool.query(`DELETE FROM entities WHERE id = ANY($1::uuid[])`, [ids.entities]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [ids.users]);
    const left = await pool.query(`SELECT count(*)::int AS n FROM users WHERE email LIKE $1`, [`${tag}%`]);
    console.log(`cleanup: ${left.rows[0].n} test users left`);
    await pool.end();
  }
  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch(async (err) => { console.error(err); await pool.end().catch(() => {}); process.exit(1); });
