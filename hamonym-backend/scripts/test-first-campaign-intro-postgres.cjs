// First Campaign Experience seen-state: migration 085 + endpoints against a disposable database.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const pg = require('pg');
const backend = path.resolve(__dirname, '..');
const container = 'hamonym-test-db';
const env = JSON.parse(execFileSync('docker', ['inspect', container, '--format', '{{json .Config.Env}}'], { encoding: 'utf8' }));
const values = Object.fromEntries(env.map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
const port = Number(execFileSync('docker', ['port', container, '5432'], { encoding: 'utf8' }).match(/:(\d+)/)[1]);
const config = { host: '127.0.0.1', port, user: values.POSTGRES_USER || 'postgres', password: values.POSTGRES_PASSWORD };
const database = `hamonym_first_campaign_intro_${Date.now()}`; assert.match(database, /^hamonym_first_campaign_intro_\d+$/);
const admin = new pg.Pool({ ...config, database: 'postgres' }); let pool; let createdDatabase = false; let checks = 0;

function load(relative, deps) {
  const file = path.join(backend, relative); const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: id => Object.hasOwn(deps, id) ? deps[id] : {}, console, Date, Object, Promise, Error, JSON, Number, String, Array, Set, Map },
    { filename: file });
  return module.exports;
}
async function check(name, fn) { await fn(); checks++; console.log(`PASS ${name}`); }
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

(async () => {
  await admin.query(`CREATE DATABASE "${database}"`); createdDatabase = true;
  pool = new pg.Pool({ ...config, database });
  await pool.query(`
    CREATE TABLE users(id bigint PRIMARY KEY);
    CREATE TABLE entities(id uuid PRIMARY KEY);
    CREATE TABLE user_entities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id integer REFERENCES users(id), entity_id uuid REFERENCES entities(id), role varchar, created_at timestamp DEFAULT now());
    INSERT INTO users VALUES (1), (2), (9);
    INSERT INTO entities VALUES ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
    INSERT INTO user_entities(user_id, entity_id, role) VALUES
      (1, '00000000-0000-0000-0000-00000000000a', 'entity-manager'),
      (1, '00000000-0000-0000-0000-00000000000a', 'campaign-manager'),
      (1, '00000000-0000-0000-0000-00000000000b', 'entity-manager'),
      (2, '00000000-0000-0000-0000-00000000000a', 'entity-manager');`);
  const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b';
  const migration = fs.readFileSync(path.join(backend, 'migrations/085_first_campaign_intro_seen.sql'), 'utf8');

  await check('migration 085 adds a nullable column, keeps rows and is re-runnable', async () => {
    await pool.query(migration); await pool.query(migration);
    const col = (await pool.query(`SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = 'user_entities' AND column_name = 'first_campaign_intro_seen_at'`)).rows[0];
    assert.deepEqual(col, { data_type: 'timestamp with time zone', is_nullable: 'YES' });
    assert.equal((await pool.query('SELECT count(*)::int c FROM user_entities WHERE first_campaign_intro_seen_at IS NULL')).rows[0].c, 4);
  });

  const db = { query: (sql, args) => pool.query(sql, args) };
  const ownership = load('src/middleware/entity-permission.middleware.js', { '../db/db': db });
  const service = load('src/modules/entities/entities.service.js', { '../../db/db': db, '../../middleware/entity-permission.middleware': ownership });

  await check('a member starts unseen; reading does not mark it seen', async () => {
    assert.equal((await service.getFirstCampaignIntro(A, 1)).seen, false);
    assert.equal((await service.getFirstCampaignIntro(A, 1)).seen, false);
  });
  await check('marking is idempotent and keeps the first timestamp across all role rows', async () => {
    await service.markFirstCampaignIntroSeen(A, 1);
    const first = (await pool.query('SELECT first_campaign_intro_seen_at t FROM user_entities WHERE user_id = 1 AND entity_id = $1', [A])).rows;
    assert.equal(first.length, 2); assert.ok(first.every(r => r.t));
    await new Promise(r => setTimeout(r, 20)); await service.markFirstCampaignIntroSeen(A, 1);
    const again = (await pool.query('SELECT first_campaign_intro_seen_at t FROM user_entities WHERE user_id = 1 AND entity_id = $1', [A])).rows;
    assert.deepEqual(again.map(r => r.t.getTime()).sort(), first.map(r => r.t.getTime()).sort());
    assert.equal((await service.getFirstCampaignIntro(A, 1)).seen, true);
  });
  await check('another organization of the same user is independent', async () => {
    assert.equal((await service.getFirstCampaignIntro(B, 1)).seen, false);
  });
  await check('another user in the same organization is independent', async () => {
    assert.equal((await service.getFirstCampaignIntro(A, 2)).seen, false);
  });
  await check('non-members (e.g. Super Admin without membership) are rejected by the ownership check', async () => {
    let nextCalled = false; const res = response();
    await ownership.requireEntityOwnership('id')({ params: { id: A }, user: { id: 9 } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 403); assert.equal(nextCalled, false);
    nextCalled = false;
    await ownership.requireEntityOwnership('id')({ params: { id: A }, user: { id: 2 } }, response(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
  });
  await check('controller returns the seen state', async () => {
    const controller = load('src/modules/entities/entities.controller.js', { './entities.service': service });
    const res = response(); await controller.markFirstCampaignIntroSeen({ params: { id: A }, user: { id: 2 } }, res);
    assert.equal(res.body.seen, true);
    const read = response(); await controller.getFirstCampaignIntro({ params: { id: A }, user: { id: 2 } }, read);
    assert.equal(read.body.seen, true);
  });
  await check('rollback script removes the column', async () => {
    await pool.query(fs.readFileSync(path.join(backend, 'scripts/rollback-085-first-campaign-intro.sql'), 'utf8'));
    assert.equal((await pool.query(`SELECT count(*)::int c FROM information_schema.columns WHERE table_name = 'user_entities' AND column_name = 'first_campaign_intro_seen_at'`)).rows[0].c, 0);
    assert.equal((await pool.query('SELECT count(*)::int c FROM user_entities')).rows[0].c, 4);
  });
  console.log(`${checks} first campaign intro PostgreSQL checks PASS; disposable local database only.`);
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (pool) await pool.end();
  if (createdDatabase) await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.end();
});
