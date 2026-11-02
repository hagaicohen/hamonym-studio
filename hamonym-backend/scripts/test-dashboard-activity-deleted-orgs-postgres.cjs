// Platform Dashboard activity feed must hide decisions about soft-deleted
// organizations while keeping the audit rows themselves intact.
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict'), { execFileSync } = require('child_process');
const pg = require('pg');
const backend = path.resolve(__dirname, '..');
const container = 'hamonym-test-db';
const env = JSON.parse(execFileSync('docker', ['inspect', container, '--format', '{{json .Config.Env}}'], { encoding: 'utf8' }));
const values = Object.fromEntries(env.map(v => { const i = v.indexOf('='); return [v.slice(0, i), v.slice(i + 1)]; }));
const port = Number(execFileSync('docker', ['port', container, '5432'], { encoding: 'utf8' }).match(/:(\d+)/)[1]);
const config = { host: '127.0.0.1', port, user: values.POSTGRES_USER || 'postgres', password: values.POSTGRES_PASSWORD };
const database = `hamonym_dashboard_activity_${Date.now()}`; assert.match(database, /^hamonym_dashboard_activity_\d+$/);
const admin = new pg.Pool({ ...config, database: 'postgres' }); let pool; let createdDatabase = false;

function load(relative, deps) {
  const file = path.join(backend, relative); const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), { module, exports: module.exports, require: id => Object.hasOwn(deps, id) ? deps[id] : {}, console, Date, Number, Object, Promise, Error, Math, JSON },
    { filename: file });
  return module.exports;
}

(async () => {
  await admin.query(`CREATE DATABASE "${database}"`); createdDatabase = true;
  pool = new pg.Pool({ ...config, database });
  await pool.query(`
    CREATE TABLE entities(id text PRIMARY KEY, display_name text, legal_name text, status text, entity_type text,
      flagged_for_review boolean DEFAULT false, association_certificate_name text, tax_document_name text,
      cardcom_connection_status text, created_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE entity_roles(entity_id text, role text);
    CREATE TABLE users(id int PRIMARY KEY, full_name text, email text, created_at timestamptz DEFAULT now());
    CREATE TABLE campaigns(id text PRIMARY KEY, entity_id text, title text, status text, created_at timestamptz DEFAULT now(), deleted_at timestamptz);
    CREATE TABLE donations(id text PRIMARY KEY, campaign_id text, amount numeric, status text, created_at timestamptz DEFAULT now());
    CREATE TABLE platform_audit_log(id bigserial PRIMARY KEY, entity_id text REFERENCES entities(id), action text, created_at timestamptz DEFAULT now());
    INSERT INTO entities(id, display_name, status, deleted_at) VALUES
      ('live', 'Live org', 'active', NULL), ('gone', 'Deleted org', 'deleted', now());
    INSERT INTO platform_audit_log(entity_id, action) VALUES
      ('live', 'approve'), ('gone', 'reject'), ('gone', 'request_changes');`);

  const service = load('src/modules/platform/dashboard-read.service.js', { '../../db/db': { query: (sql, args) => pool.query(sql, args) } });
  const result = await service.getOverview({ range: '30d', isSuperAdmin: false, permissions: ['organizations'] });
  const orgEvents = result.activity.filter(a => a.id.startsWith('organization:'));

  assert.deepEqual(orgEvents.map(a => a.name), ['Live org'], 'only the non-deleted organization event is shown');
  assert.equal(orgEvents[0].label, 'העמותה אושרה');
  assert.equal(orgEvents[0].route.join('/'), '/platform/organizations/live');
  console.log('PASS deleted organization events are hidden; active organization event remains');

  const stored = (await pool.query(`SELECT count(*)::int AS c FROM platform_audit_log WHERE entity_id = 'gone'`)).rows[0].c;
  assert.equal(stored, 2, 'audit history for the deleted organization is untouched');
  console.log('PASS audit rows for the deleted organization are preserved');
  console.log('2 dashboard activity PostgreSQL checks PASS; disposable local database only.');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => {
  if (pool) await pool.end();
  if (createdDatabase) await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.end();
});
