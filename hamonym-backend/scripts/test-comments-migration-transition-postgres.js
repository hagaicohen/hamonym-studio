// Migration 090 transition and rollback, against an ISOLATED local Postgres
// that does NOT have 090 yet (a disposable clone; this script applies 090, the
// rollback steps and the restore to it). Runs the comments code of the backend
// deployed before 090 (loaded from git, LEGACY_REF) and the new comments module
// against the same database, in the order of docs/COMMENTS_RELEASE.md:
//   legacy before 090 → 090 → legacy after 090 → new backend → re-run 090 →
//   rollback step 1 → legacy → rollback step 2 → legacy → 090 + restore → new.
//
// Refuses to run unless DB_HOST is localhost/127.0.0.1, DB_NAME starts with
// "hamonym_", and campaigns.comments_moderation does not exist yet.
//
// Run (example; the clone is created from any pre-090 local database):
//   docker exec hamonym-test-db psql -U postgres -c "CREATE DATABASE hamonym_c090_transition TEMPLATE <pre-090 db>"
//   DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=hamonym_c090_transition DB_USER=postgres \
//   DB_PASSWORD=... DB_SSL=false JWT_SECRET=local-test node scripts/test-comments-migration-transition-postgres.js

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

if (!['localhost', '127.0.0.1'].includes(process.env.DB_HOST) || !/^hamonym_/.test(process.env.DB_NAME || '')) {
  console.error('Refusing to run: point DB_HOST/DB_NAME at an isolated local test database.');
  process.exit(2);
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-comments-transition';
// The comments module as deployed before migration 090 (last change: 16f0859).
const LEGACY_REF = process.env.LEGACY_REF || '16f0859';

const express = require('express');
const pool = require('../src/db/db');
const root = path.join(__dirname, '..');
const sql = (file) => pool.query(fs.readFileSync(path.join(root, file), 'utf8'));
const MIGRATION = 'migrations/090_campaign_comments_moderation.sql';
const STEP1 = 'scripts/rollback-090-step1-archive-unpublished.sql';
const STEP2 = 'scripts/rollback-090-campaign-comments-moderation.sql';
const RESTORE = 'scripts/restore-090-archived-comments.sql';

let passed = 0;
let failures = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (err) { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); }
}

function loadLegacy() {
  const code = execFileSync('git', ['show', `${LEGACY_REF}:./src/modules/comments/comments.service.js`], { cwd: root, encoding: 'utf8' });
  const ctx = { exports: {}, module: { exports: {} }, console, process };
  ctx.module.exports = ctx.exports;
  ctx.require = (id) => { if (id === '../../db/db') return pool; throw new Error(`legacy module requires ${id}`); };
  vm.runInNewContext(code, ctx, { filename: `legacy-comments.service.js@${LEGACY_REF}` });
  return ctx.module.exports;
}

const tag = `c090-${crypto.randomBytes(4).toString('hex')}`;
const ids = { users: [], entities: [] };
const column = async (table, name) => (await pool.query(
  `SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`, [table, name])).rowCount > 0;
const statusOf = async (id) => (await pool.query('SELECT status FROM campaign_comments WHERE id = $1', [id])).rows[0]?.status;

async function main() {
  const db = await pool.query('SELECT current_database() AS db');
  console.log(`Using isolated database ${db.rows[0].db}; legacy comments code from ${LEGACY_REF}`);
  if (await column('campaigns', 'comments_moderation')) {
    console.error('Refusing to run: migration 090 is already applied here. Use a fresh pre-090 clone.');
    process.exit(2);
  }
  const legacy = loadLegacy();

  const { rows: [u] } = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, email_verified, created_at, updated_at)
     VALUES (2, $1, $1, true, true, now(), now()) RETURNING id`, [`${tag}@example.test`]);
  ids.users.push(u.id);
  const { rows: [e] } = await pool.query(
    `INSERT INTO entities (display_name, created_by_user_id, entity_type, status) VALUES ($1, $2, 'association', 'active') RETURNING id`, [tag, u.id]);
  ids.entities.push(e.id);
  const campaign = async (slug, blocks) => (await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, blocks) VALUES ($1, $2, $2, 'published', $3::jsonb) RETURNING id, slug`,
    [e.id, `${tag}-${slug}`, JSON.stringify(blocks)])).rows[0];
  // A shows comments today; B has no comments section.
  const A = await campaign('with-comments', [{ id: 'cm', type: 'comments', data: {} }]);
  const B = await campaign('without', [{ id: 'txt', type: 'rich-text', data: { content: '' } }]);

  const app = express();
  app.use(express.json());
  app.use('/api/comments', require('../src/modules/comments/comments.routes').createCommentsApp({ trustProxy: '1' }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let ipSeq = 0;
  const newPost = async (c, body) => {
    const res = await fetch(`${base}/api/comments/campaign/${c.slug}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.90.0.${++ipSeq}` }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const newList = async (c) => (await (await fetch(`${base}/api/comments/campaign/${c.slug}?limit=50`)).json()).comments.map(x => x.id);
  const legacyList = async (c) => (await legacy.getComments(c.slug)).map(x => x.id);
  const legacyPost = (c, content) => legacy.createComment(c.slug, { authorName: 'Legacy', authorEmail: 'legacy@example.test', content });

  const before = await legacyPost(A, 'posted before 090');
  let afterA, afterB, pending, hidden, published;

  try {
    await check('090 applies to a pre-090 database; existing comments stay published', async () => {
      await sql(MIGRATION);
      assert.strictEqual(await statusOf(before.id), 'published');
    });

    await check('existing campaigns keep their behavior: with a comments section → auto, without → approval', async () => {
      const { rows } = await pool.query('SELECT id, comments_moderation FROM campaigns WHERE id = ANY($1)', [[A.id, B.id]]);
      const mode = Object.fromEntries(rows.map(r => [r.id, r.comments_moderation]));
      assert.strictEqual(mode[A.id], 'auto');
      assert.strictEqual(mode[B.id], 'approval');
    });

    await check('legacy backend after 090: its new comments are published (column default) and listed', async () => {
      afterA = await legacyPost(A, 'legacy after 090 on A');
      afterB = await legacyPost(B, 'legacy after 090 on B');
      assert.strictEqual(await statusOf(afterA.id), 'published');
      assert.strictEqual(await statusOf(afterB.id), 'published');
      assert.deepStrictEqual((await legacyList(A)).sort(), [before.id, afterA.id].sort());
    });

    await check('new backend: no comment disappears; each campaign lists everything posted before', async () => {
      assert.deepStrictEqual((await newList(A)).sort(), [before.id, afterA.id].sort());
      assert.deepStrictEqual(await newList(B), [afterB.id]);
    });

    await check('re-running 090 succeeds and never overrides a mode a manager chose since', async () => {
      await pool.query(`UPDATE campaigns SET comments_moderation = 'approval' WHERE id = $1`, [A.id]);
      await sql(MIGRATION);
      assert.strictEqual((await pool.query('SELECT comments_moderation FROM campaigns WHERE id = $1', [A.id])).rows[0].comments_moderation, 'approval');
      await pool.query(`UPDATE campaigns SET comments_moderation = 'auto' WHERE id = $1`, [A.id]);
    });

    await check('new backend sets the status itself: pending on approval, published on auto', async () => {
      const p = await newPost(B, { authorName: 'דנה', content: 'ממתינה לאישור', language: 'he' });
      assert.strictEqual(p.body.status, 'pending');
      pending = (await pool.query(`SELECT id FROM campaign_comments WHERE campaign_id = $1 AND status = 'pending'`, [B.id])).rows[0].id;
      const q = await newPost(A, { authorName: 'Dan', content: 'to be hidden', language: 'en' });
      assert.strictEqual(q.body.status, 'published');
      hidden = q.body.comment.id;
      await pool.query(`UPDATE campaign_comments SET status = 'hidden', updated_at = now() WHERE id = $1`, [hidden]);
      published = (await newPost(A, { authorName: 'Ann', content: 'stays public', language: 'en' })).body.comment.id;
      assert.ok(!(await newList(B)).includes(pending));
      assert.ok(!(await newList(A)).includes(hidden));
    });

    await check('without step 1, the legacy backend WOULD expose pending and hidden comments (why step 1 is mandatory)', async () => {
      assert.ok((await legacyList(B)).includes(pending));
      assert.ok((await legacyList(A)).includes(hidden));
    });

    let archivedBefore;
    await check('rollback step 1: pending/hidden move to the archive unchanged; the live table holds only published', async () => {
      const original = (await pool.query('SELECT * FROM campaign_comments WHERE id = ANY($1) ORDER BY id', [[pending, hidden]])).rows;
      await sql(STEP1);
      assert.strictEqual((await pool.query(`SELECT count(*)::int AS n FROM campaign_comments WHERE status <> 'published'`)).rows[0].n, 0);
      const archived = (await pool.query(
        `SELECT id, campaign_id, author_name, author_email, content, created_at, status, language, updated_at, submitter_hash
           FROM campaign_comments_090_archive WHERE id = ANY($1) ORDER BY id`, [[pending, hidden]])).rows;
      assert.deepStrictEqual(archived, original);
      archivedBefore = (await pool.query('SELECT count(*)::int AS n FROM campaign_comments_090_archive')).rows[0].n;
    });

    await check('after step 1 the still-running new backend cannot create or hide its way into exposure', async () => {
      const p = await newPost(B, { authorName: 'Late', content: 'arrives during rollback' });
      assert.strictEqual(p.status, 500);
      assert.strictEqual((await pool.query(`SELECT count(*)::int AS n FROM campaign_comments WHERE content = 'arrives during rollback'`)).rows[0].n, 0);
      await assert.rejects(pool.query(`UPDATE campaign_comments SET status = 'hidden' WHERE id = $1`, [published]), /campaign_comments_rollback_published_only/);
    });

    await check('legacy backend after step 1: lists only published comments, never pending or hidden', async () => {
      const a = await legacyList(A);
      const b = await legacyList(B);
      assert.ok(!a.includes(hidden) && !b.includes(pending));
      assert.deepStrictEqual(a.sort(), [before.id, afterA.id, published].sort());
      assert.deepStrictEqual(b, [afterB.id]);
      const fresh = await legacyPost(B, 'legacy during rollback');
      assert.strictEqual(await statusOf(fresh.id), 'published');
    });

    await check('step 1 is repeatable: a second run changes nothing', async () => {
      await sql(STEP1);
      assert.strictEqual((await pool.query('SELECT count(*)::int AS n FROM campaign_comments_090_archive')).rows[0].n, archivedBefore);
    });

    await check('step 1 never overwrites an archive record: a conflicting id stops it and nothing changes', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('ALTER TABLE campaign_comments DROP CONSTRAINT campaign_comments_rollback_published_only');
        await client.query(`INSERT INTO campaign_comments (id, campaign_id, author_name, content, status) VALUES ($1, $2, 'x', 'different text', 'pending')`, [pending, B.id]);
        await client.query('COMMIT');
      } finally { client.release(); }
      const archiveBefore = (await pool.query('SELECT content FROM campaign_comments_090_archive WHERE id = $1', [pending])).rows[0].content;
      await assert.rejects(sql(STEP1), /conflict with an existing archive record/);
      assert.strictEqual((await pool.query('SELECT content FROM campaign_comments_090_archive WHERE id = $1', [pending])).rows[0].content, archiveBefore);
      assert.strictEqual(await statusOf(pending), 'pending', 'the failed run left the live table as it was');
      await pool.query('DELETE FROM campaign_comments WHERE id = $1', [pending]);
      await sql(STEP1);
    });

    await check('rollback step 2: removes the 090 schema, archives each campaign moderation mode; a re-run is a no-op', async () => {
      await sql(STEP2);
      assert.strictEqual(await column('campaign_comments', 'status'), false);
      assert.strictEqual(await column('campaigns', 'comments_moderation'), false);
      const modes = (await pool.query('SELECT campaign_id, comments_moderation FROM campaigns_comments_moderation_090_archive WHERE campaign_id = ANY($1)', [[A.id, B.id]])).rows;
      assert.strictEqual(modes.find(m => m.campaign_id === A.id).comments_moderation, 'auto');
      assert.strictEqual(modes.find(m => m.campaign_id === B.id).comments_moderation, 'approval');
      await sql(STEP2);
    });

    await check('legacy backend on the rolled-back schema: posts and lists; pending/hidden are not there', async () => {
      const c = await legacyPost(A, 'legacy after step 2');
      const a = await legacyList(A);
      assert.ok(a.includes(c.id) && !a.includes(hidden));
      assert.ok(!(await legacyList(B)).includes(pending));
    });

    await check('roll forward: 090 again + restore brings every archived comment back with its state, and the modes', async () => {
      await sql(MIGRATION);
      await sql(RESTORE);
      assert.strictEqual(await statusOf(pending), 'pending');
      assert.strictEqual(await statusOf(hidden), 'hidden');
      const lang = (await pool.query('SELECT language FROM campaign_comments WHERE id = $1', [hidden])).rows[0].language;
      assert.strictEqual(lang, 'en');
      const { rows } = await pool.query('SELECT id, comments_moderation FROM campaigns WHERE id = ANY($1)', [[A.id, B.id]]);
      assert.strictEqual(rows.find(r => r.id === A.id).comments_moderation, 'auto');
      assert.strictEqual(rows.find(r => r.id === B.id).comments_moderation, 'approval');
      assert.ok(!(await newList(B)).includes(pending));
      assert.ok(!(await newList(A)).includes(hidden));
      assert.strictEqual((await newPost(B, { authorName: 'דנה', content: 'אחרי שחזור' })).body.status, 'pending');
      const left = (await pool.query(`SELECT count(*)::int AS n FROM campaign_comments_090_archive WHERE restored_at IS NULL AND campaign_id = ANY($1)`, [[A.id, B.id]])).rows[0].n;
      assert.strictEqual(left, 0);
      await sql(RESTORE);
    });
  } finally {
    server.close();
    await pool.query(`DELETE FROM campaign_comments WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug LIKE $1)`, [`${tag}-%`]);
    if ((await pool.query(`SELECT to_regclass('public.campaign_comments_090_archive') AS t`)).rows[0].t) {
      await pool.query(`DELETE FROM campaign_comments_090_archive WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug LIKE $1)`, [`${tag}-%`]);
    }
    if ((await pool.query(`SELECT to_regclass('public.campaigns_comments_moderation_090_archive') AS t`)).rows[0].t) {
      await pool.query(`DELETE FROM campaigns_comments_moderation_090_archive WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug LIKE $1)`, [`${tag}-%`]);
    }
    await pool.query(`DELETE FROM campaigns WHERE slug LIKE $1`, [`${tag}-%`]);
    await pool.query('DELETE FROM user_entities WHERE user_id = ANY($1)', [ids.users]);
    await pool.query('DELETE FROM entities WHERE id = ANY($1)', [ids.entities]);
    await pool.query('DELETE FROM users WHERE id = ANY($1)', [ids.users]);
    await pool.end();
  }
  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
