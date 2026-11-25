// Campaign comments (migration 090) against an ISOLATED local Postgres only:
// public listing (published only, paged, no private fields), validation and
// plain-text cleaning, honeypot, rate limiting, moderation modes, and the
// management endpoints' authorization. Real router, real middleware, real JWTs.
//
// Refuses to run unless DB_HOST is localhost/127.0.0.1 and DB_NAME starts
// with "hamonym_" (never the shared Supabase database).
//
// Run (example):
//   DB_HOST=127.0.0.1 DB_PORT=5433 DB_NAME=hamonym_comments_20261109 \
//   DB_USER=postgres DB_PASSWORD=... DB_SSL=false JWT_SECRET=local-test \
//   node scripts/test-campaign-comments-postgres.js

const assert = require('assert');
const crypto = require('crypto');

if (!['localhost', '127.0.0.1'].includes(process.env.DB_HOST) || !/^hamonym_/.test(process.env.DB_NAME || '')) {
  console.error('Refusing to run: point DB_HOST/DB_NAME at an isolated local test database.');
  process.exit(2);
}
process.env.JWT_SECRET = process.env.JWT_SECRET || 'local-comments-test';

const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/db');

let passed = 0;
let failures = 0;
async function check(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); }
  catch (err) { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); }
}

// Invisible characters the server removes.
const RLO = String.fromCharCode(0x202e), ZWSP = String.fromCharCode(0x200b), NUL = String.fromCharCode(0);

const tag = `cm-test-${crypto.randomBytes(4).toString('hex')}`;
const ids = { users: [], entities: [] };

async function createUser(name, { superAdmin = false } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active, email_verified, is_super_admin, created_at, updated_at)
     VALUES ($1, $2, $3, true, true, $4, now(), now()) RETURNING id`,
    [superAdmin ? 5 : 2, `${tag}-${name}@example.test`, `${tag} ${name}`, superAdmin]
  );
  ids.users.push(rows[0].id);
  return rows[0].id;
}
async function createEntity(ownerId, name) {
  const { rows } = await pool.query(
    `INSERT INTO entities (display_name, created_by_user_id, entity_type, status) VALUES ($1, $2, 'association', 'active') RETURNING id`,
    [`${tag} ${name}`, ownerId]
  );
  ids.entities.push(rows[0].id);
  await pool.query(`INSERT INTO user_entities (user_id, entity_id, role, created_at) VALUES ($1, $2, 'owner', now())`, [ownerId, rows[0].id]);
  return rows[0].id;
}
async function createCampaign(entityId, slug, { status = 'published', moderation = 'approval' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO campaigns (entity_id, title, slug, status, comments_moderation) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [entityId, slug, `${tag}-${slug}`, status, moderation]
  );
  return { id: rows[0].id, slug: `${tag}-${slug}` };
}
const token = (userId, extra = {}) => jwt.sign({ userId, roleId: extra.isSuperAdmin ? 5 : 2, ...extra }, process.env.JWT_SECRET);

async function main() {
  const db = await pool.query('SELECT current_database() AS db, inet_server_port() AS port');
  console.log(`Using isolated database ${db.rows[0].db} (server port ${db.rows[0].port})`);

  const app = express();
  app.use(express.json());
  // One trusted proxy hop: the loopback test client stands in for Render's proxy,
  // and the X-Forwarded-For address each call sends is the visitor it appends.
  const { createCommentsApp } = require('../src/modules/comments/comments.routes');
  app.use('/api/comments', createCommentsApp({ trustProxy: '1' }));
  // The production default (COMMENTS_TRUST_PROXY unset): no forwarded address is believed.
  const strict = express();
  strict.use(express.json());
  strict.use('/api/comments', createCommentsApp({ trustProxy: undefined }));
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const strictServer = await new Promise((resolve) => { const s = strict.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const strictBase = `http://127.0.0.1:${strictServer.address().port}`;
  const rawPost = async (root, slug, body, xff) => {
    const res = await fetch(`${root}/api/comments/campaign/${slug}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(xff ? { 'X-Forwarded-For': xff } : {}) }, body: JSON.stringify(body) });
    return res.status;
  };
  let ipSeq = 0;
  const call = async (method, url, { auth, body, ip } = {}) => {
    const res = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': ip || `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`,
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  };

  const member = await createUser('member');
  const outsider = await createUser('outsider');
  const admin = await createUser('admin', { superAdmin: true });
  const otherOwner = await createUser('other');
  const entity = await createEntity(member, 'A');
  const otherEntity = await createEntity(otherOwner, 'B');
  const approval = await createCampaign(entity, 'approval');
  const auto = await createCampaign(entity, 'auto', { moderation: 'auto' });
  const draft = await createCampaign(entity, 'draft', { status: 'draft', moderation: 'auto' });
  const foreign = await createCampaign(otherEntity, 'foreign', { moderation: 'auto' });
  const post = (c, body, ip) => call('POST', `/api/comments/campaign/${c.slug}`, { body, ip });
  const manage = (c, suffix = '') => `/api/comments/manage/${c.id}${suffix}`;
  let pendingId;

  try {
    await check('approval campaign: a new comment waits, is not public, and the response shows no comment', async () => {
      const r = await post(approval, { authorName: '  דנה   כהן ', content: 'יוזמה מרגשת. בהצלחה רבה!', language: 'he' });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.strictEqual(r.body.status, 'pending');
      assert.strictEqual(r.body.comment, null);
      const row = (await pool.query('SELECT * FROM campaign_comments WHERE campaign_id = $1', [approval.id])).rows[0];
      assert.strictEqual(row.author_name, 'דנה כהן');
      assert.strictEqual(row.language, 'he');
      assert.strictEqual(row.author_email, null);
      assert.match(row.submitter_hash, /^[0-9a-f]{64}$/);
      assert.ok(!row.submitter_hash.includes('10.9.'));
      pendingId = row.id;
      const list = await call('GET', `/api/comments/campaign/${approval.slug}`);
      assert.deepStrictEqual(list.body, { comments: [], nextCursor: null, total: 0 });
    });

    await check('auto campaign: published at once, public list has only public fields', async () => {
      const r = await post(auto, { authorName: 'Dan', content: 'Proud to support this.', language: 'en', authorEmail: 'dan@example.test' });
      assert.strictEqual(r.status, 201);
      assert.strictEqual(r.body.status, 'published');
      assert.deepStrictEqual(Object.keys(r.body.comment).sort(), ['authorName', 'content', 'createdAt', 'id', 'language']);
      const list = await call('GET', `/api/comments/campaign/${auto.slug}`);
      assert.strictEqual(list.body.total, 1);
      assert.deepStrictEqual(Object.keys(list.body.comments[0]).sort(), ['authorName', 'content', 'createdAt', 'id', 'language']);
      assert.strictEqual(list.body.comments[0].language, 'en');
      const row = (await pool.query('SELECT author_email FROM campaign_comments WHERE campaign_id = $1', [auto.id])).rows[0];
      assert.strictEqual(row.author_email, null, 'email is not stored even when sent');
    });

    await check('text is stored as written: comparisons, HTML-like input and Unicode kept; invisible controls removed', async () => {
      const r = await post(auto, { authorName: `<b>Eve</b>${RLO}`, content: `if a < b and c > d & e\n<script>alert(1)</script><img src=x onerror=alert(2)>\u0000${ZWSP}\n\n\n\n\u{1F468}‍\u{1F469}‍\u{1F467} שלום ❤️` });
      assert.strictEqual(r.status, 201, JSON.stringify(r.body));
      assert.strictEqual(r.body.comment.authorName, '<b>Eve</b>');
      assert.strictEqual(r.body.comment.content, 'if a < b and c > d & e\n<script>alert(1)</script><img src=x onerror=alert(2)>\n\n\u{1F468}‍\u{1F469}‍\u{1F467} שלום ❤️');
      const listed = (await call('GET', `/api/comments/campaign/${auto.slug}`)).body.comments.find(c => c.id === r.body.comment.id);
      assert.strictEqual(listed.content, r.body.comment.content, 'served back unchanged (pages render it as text)');
    });

    await check('validation: name and comment length, missing fields, non-strings', async () => {
      for (const body of [
        { authorName: 'א', content: 'תוכן תקין' },
        { authorName: 'א'.repeat(61), content: 'תוכן תקין' },
        { authorName: 'דנה', content: 'א' },
        { authorName: 'דנה', content: 'א'.repeat(1001) },
        { authorName: 'דנה' },
        { content: 'תוכן' },
        { authorName: 42, content: { x: 1 } },
        { authorName: '...', content: '!!' },
        { authorName: `${RLO}${ZWSP}`, content: `שלום` },
      ]) {
        const r = await post(approval, body);
        assert.strictEqual(r.status, 400, JSON.stringify(body));
        assert.ok(['INVALID_NAME', 'INVALID_CONTENT'].includes(r.body.code));
      }
      const ok = await post(approval, { authorName: 'דנה', content: 'א'.repeat(1000) });
      assert.strictEqual(ok.status, 201);
    });

    await check('draft, hidden and unknown campaigns take no comments and list nothing', async () => {
      assert.strictEqual((await post(draft, { authorName: 'דנה', content: 'שלום לכולם' })).status, 404);
      assert.strictEqual((await post({ slug: `${tag}-missing` }, { authorName: 'דנה', content: 'שלום לכולם' })).status, 404);
      await pool.query(`INSERT INTO campaign_comments (campaign_id, author_name, content, status) VALUES ($1, 'x', 'hidden draft comment', 'published')`, [draft.id]);
      assert.deepStrictEqual((await call('GET', `/api/comments/campaign/${draft.slug}`)).body.comments, []);
      await pool.query('UPDATE campaigns SET is_hidden = true WHERE id = $1', [foreign.id]);
      assert.strictEqual((await post(foreign, { authorName: 'דנה', content: 'שלום לכולם' })).status, 404);
      await pool.query('UPDATE campaigns SET is_hidden = false WHERE id = $1', [foreign.id]);
    });

    await check('honeypot: answered like a held comment, nothing stored', async () => {
      const before = (await pool.query('SELECT count(*)::int AS n FROM campaign_comments WHERE campaign_id = $1', [auto.id])).rows[0].n;
      const r = await post(auto, { authorName: 'Bot', content: 'Buy now', website: 'http://spam.test' });
      assert.strictEqual(r.status, 201);
      assert.strictEqual(r.body.comment, null);
      const after = (await pool.query('SELECT count(*)::int AS n FROM campaign_comments WHERE campaign_id = $1', [auto.id])).rows[0].n;
      assert.strictEqual(after, before);
    });

    await check('rate limit: 3 per campaign per 10 minutes from one address, then 429; another address is unaffected', async () => {
      const ip = '203.0.113.7';
      for (let i = 0; i < 3; i++) assert.strictEqual((await post(foreign, { authorName: 'Rita', content: `Comment number ${i}` }, ip)).status, 201);
      const r = await post(foreign, { authorName: 'Rita', content: 'Comment number 4' }, ip);
      assert.strictEqual(r.status, 429);
      assert.strictEqual(r.body.code, 'RATE_LIMITED');
      assert.strictEqual((await post(foreign, { authorName: 'Sam', content: 'Different person' }, '203.0.113.8')).status, 201);
    });

    await check('rate limit: 10 per day across campaigns from one address', async () => {
      const ip = '203.0.113.20';
      const campaigns = [];
      for (let i = 0; i < 4; i++) campaigns.push(await createCampaign(entity, `day-${i}`, { moderation: 'auto' }));
      let ok = 0;
      for (let i = 0; i < 12; i++) {
        const r = await post(campaigns[i % 4], { authorName: 'Day', content: `Daily comment ${i}` }, ip);
        if (r.status === 201) ok++; else assert.strictEqual(r.status, 429);
      }
      assert.strictEqual(ok, 10);
    });

    await check('the same comment twice from one address is refused (409)', async () => {
      const ip = '203.0.113.30';
      assert.strictEqual((await post(auto, { authorName: 'Ann', content: 'Same words' }, ip)).status, 201);
      const r = await post(auto, { authorName: 'Ann', content: '  Same   words ' }, ip);
      assert.strictEqual(r.status, 409);
      assert.strictEqual(r.body.code, 'DUPLICATE_COMMENT');
    });

    await check('pagination: newest first, stable keyset pages with no overlap, total and search', async () => {
      const c = await createCampaign(entity, 'paged', { moderation: 'auto' });
      for (let i = 0; i < 13; i++) {
        await pool.query(
          `INSERT INTO campaign_comments (campaign_id, author_name, content, status, created_at) VALUES ($1, $2, $3, 'published', $4)`,
          [c.id, `n${i}`, `paged comment ${i}${i === 4 ? ' special' : ''}`, new Date(Date.UTC(2026, 10, 1, 10, 0, i % 7 === 0 ? 0 : i))]
        );
      }
      await pool.query(`INSERT INTO campaign_comments (campaign_id, author_name, content, status) VALUES ($1, 'p', 'pending one', 'pending'), ($1, 'h', 'hidden one', 'hidden')`, [c.id]);
      const seen = [];
      let cursor = null;
      do {
        const r = await call('GET', `/api/comments/campaign/${c.slug}?limit=5${cursor ? `&cursor=${cursor}` : ''}`);
        assert.strictEqual(r.body.total, 13);
        seen.push(...r.body.comments);
        cursor = r.body.nextCursor;
      } while (cursor);
      assert.strictEqual(seen.length, 13);
      assert.strictEqual(new Set(seen.map(x => x.id)).size, 13);
      for (let i = 1; i < seen.length; i++) assert.ok(new Date(seen[i - 1].createdAt) >= new Date(seen[i].createdAt));
      const s = await call('GET', `/api/comments/campaign/${c.slug}?search=special`);
      assert.strictEqual(s.body.total, 1);
      assert.strictEqual((await call('GET', `/api/comments/campaign/${c.slug}?limit=999`)).body.comments.length, 13);
      assert.strictEqual((await call('GET', `/api/comments/campaign/${c.slug}?cursor=garbage`)).status, 200);
      assert.strictEqual((await call('GET', `/api/comments/campaign/${c.slug}?search=%25`)).body.total, 0);
    });

    await check('management requires a login, and only the organization or Super Admin', async () => {
      assert.strictEqual((await call('GET', manage(approval))).status, 401);
      const r = await call('GET', manage(approval), { auth: token(outsider) });
      assert.strictEqual(r.status, 403);
      assert.strictEqual((await call('PATCH', manage(approval, `/${pendingId}`), { auth: token(outsider), body: { status: 'published' } })).status, 403);
      assert.strictEqual((await call('DELETE', manage(approval, `/${pendingId}`), { auth: token(outsider) })).status, 403);
      assert.strictEqual((await call('PATCH', manage(approval, '/settings'), { auth: token(outsider), body: { moderation: 'auto' } })).status, 403);
      assert.strictEqual((await call('GET', manage(foreign), { auth: token(member) })).status, 403);
      assert.strictEqual((await call('GET', manage(foreign), { auth: token(admin, { isSuperAdmin: true }) })).status, 200);
      assert.strictEqual((await call('GET', '/api/comments/manage/not-a-uuid', { auth: token(member) })).status, 400);
      const row = (await pool.query('SELECT status FROM campaign_comments WHERE id = $1', [pendingId])).rows[0];
      assert.strictEqual(row.status, 'pending', 'refused calls changed nothing');
    });

    await check('a manager lists comments with status, counts and mode; no email or hash', async () => {
      const r = await call('GET', manage(approval), { auth: token(member) });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.moderation, 'approval');
      assert.deepStrictEqual(r.body.counts, { pending: 2, published: 0, hidden: 0 });
      for (const c of r.body.comments) {
        assert.ok(!('authorEmail' in c) && !('submitterHash' in c) && !('submitter_hash' in c));
        assert.strictEqual(c.status, 'pending');
      }
      const filtered = await call('GET', manage(approval, '?status=published'), { auth: token(member) });
      assert.strictEqual(filtered.body.comments.length, 0);
    });

    await check('approve, hide, restore; each change reaches the public list', async () => {
      const pub = () => call('GET', `/api/comments/campaign/${approval.slug}`).then(r => r.body.comments.map(c => c.id));
      let r = await call('PATCH', manage(approval, `/${pendingId}`), { auth: token(member), body: { status: 'published' } });
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.body.comment.status, 'published');
      assert.ok((await pub()).includes(pendingId));
      r = await call('PATCH', manage(approval, `/${pendingId}`), { auth: token(member), body: { status: 'hidden' } });
      assert.strictEqual(r.body.comment.status, 'hidden');
      assert.ok(!(await pub()).includes(pendingId));
      r = await call('PATCH', manage(approval, `/${pendingId}`), { auth: token(admin, { isSuperAdmin: true }), body: { status: 'published' } });
      assert.strictEqual(r.status, 200);
      assert.ok((await pub()).includes(pendingId));
      assert.strictEqual((await call('PATCH', manage(approval, `/${pendingId}`), { auth: token(member), body: { status: 'pending' } })).status, 400);
    });

    await check('a comment of another campaign cannot be moderated through this campaign', async () => {
      const otherComment = (await pool.query('SELECT id FROM campaign_comments WHERE campaign_id = $1 LIMIT 1', [foreign.id])).rows[0].id;
      assert.strictEqual((await call('PATCH', manage(approval, `/${otherComment}`), { auth: token(member), body: { status: 'hidden' } })).status, 404);
      assert.strictEqual((await call('DELETE', manage(approval, `/${otherComment}`), { auth: token(member) })).status, 404);
      assert.strictEqual((await pool.query('SELECT status FROM campaign_comments WHERE id = $1', [otherComment])).rows[0].status, 'published');
    });

    await check('delete removes the comment', async () => {
      const r = await call('DELETE', manage(approval, `/${pendingId}`), { auth: token(member) });
      assert.strictEqual(r.status, 200);
      assert.strictEqual((await pool.query('SELECT count(*)::int AS n FROM campaign_comments WHERE id = $1', [pendingId])).rows[0].n, 0);
      assert.strictEqual((await call('DELETE', manage(approval, `/${pendingId}`), { auth: token(member) })).status, 404);
    });

    await check('switching the moderation mode changes what new comments get', async () => {
      assert.strictEqual((await call('PATCH', manage(approval, '/settings'), { auth: token(member), body: { moderation: 'later' } })).status, 400);
      const r = await call('PATCH', manage(approval, '/settings'), { auth: token(member), body: { moderation: 'auto' } });
      assert.deepStrictEqual(r.body, { moderation: 'auto' });
      assert.strictEqual((await post(approval, { authorName: 'דנה', content: 'עכשיו מתפרסם מיד' })).body.status, 'published');
      await call('PATCH', manage(approval, '/settings'), { auth: token(member), body: { moderation: 'approval' } });
      assert.strictEqual((await post(approval, { authorName: 'דנה', content: 'ושוב ממתין' })).body.status, 'pending');
    });

    await check('default (no trusted proxy): a spoofed X-Forwarded-For cannot change the visitor; 4th comment is refused', async () => {
      const c = await createCampaign(entity, 'strict', { moderation: 'auto' });
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push(await rawPost(strictBase, c.slug, { authorName: 'Spoof', content: `strict ${i}` }, `198.51.100.${i}`));
      assert.deepStrictEqual(statuses, [201, 201, 201, 429, 429]);
    });

    await check('one trusted hop: rotating the spoofable leftmost address does not help; the proxy-appended one counts', async () => {
      const c = await createCampaign(entity, 'hop', { moderation: 'auto' });
      const statuses = [];
      for (let i = 0; i < 5; i++) statuses.push(await rawPost(base, c.slug, { authorName: 'Spoof', content: `hop ${i}` }, `198.51.100.${i}, 203.0.113.140`));
      assert.deepStrictEqual(statuses, [201, 201, 201, 429, 429]);
      assert.strictEqual(await rawPost(base, c.slug, { authorName: 'Other', content: 'another visitor' }, '198.51.100.9, 203.0.113.141'), 201);
    });

    await check('COMMENTS_TRUST_PROXY parsing: unset/false/0 trust nothing, "true" is refused, hops and addresses accepted', async () => {
      const { trustSetting } = require('../src/modules/comments/comments.routes');
      for (const v of [undefined, '', 'false', '0', 'off']) assert.strictEqual(trustSetting(v), false);
      const err = console.error; console.error = () => {};
      try { assert.strictEqual(trustSetting('true'), false); } finally { console.error = err; }
      assert.strictEqual(trustSetting('2'), 2);
      assert.deepStrictEqual(trustSetting('loopback, 10.0.0.0/8'), ['loopback', '10.0.0.0/8']);
    });

    await check('proxy check: Super Admin only, counts and kinds, never an address', async () => {
      assert.strictEqual((await call('GET', '/api/comments/manage/_proxy-check')).status, 401);
      assert.strictEqual((await call('GET', '/api/comments/manage/_proxy-check', { auth: token(member) })).status, 403);
      const r = await call('GET', '/api/comments/manage/_proxy-check', { auth: token(admin, { isSuperAdmin: true }), ip: '198.51.100.7, 203.0.113.9' });
      assert.strictEqual(r.status, 200, JSON.stringify(r.body));
      assert.deepStrictEqual(r.body, {
        forwardedForEntries: 2, forwardedForKinds: ['public', 'public'], socketAddressKind: 'loopback',
        trustedHopsApplied: 1, resolvedFrom: 'forwarded', resolvedAddressKind: 'public',
      });
      assert.ok(!/\d+\.\d+\.\d+\.\d+/.test(JSON.stringify(r.body)));
    });

    await check('a new campaign defaults to approval', async () => {
      const { rows } = await pool.query(`INSERT INTO campaigns (entity_id, title, slug) VALUES ($1, 'd', $2) RETURNING comments_moderation`, [entity, `${tag}-default`]);
      assert.strictEqual(rows[0].comments_moderation, 'approval');
    });
  } finally {
    server.close();
    strictServer.close();
    await pool.query(`DELETE FROM campaign_comments WHERE campaign_id IN (SELECT id FROM campaigns WHERE slug LIKE $1)`, [`${tag}-%`]);
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
