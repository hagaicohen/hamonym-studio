'use strict';
// Dedicated loopback PostgreSQL only. Never reads .env, never loads an HTTP provider.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { randomUUID, createHash } = require('node:crypto');
const { Pool } = require(process.env.HAMONYM_TEST_PG_MODULE || 'pg');
const root = path.join(__dirname, '..');
const pools = [];
after(async () => { await Promise.all(pools.map(p => p.end())); });
const E = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const B = '00000000-0000-4000-8000-000000000010';
const P = '00000000-0000-4000-8000-000000000020';
const S = '00000000-0000-4000-8000-000000000030';
const O = '00000000-0000-4000-8000-000000000031';
function config() {
  Object.assign(process.env, { HAMONYM_SIMULATION_MODE: 'on', FIN11_SIMULATION_COLLECTION_ENABLED: 'true', FIN11_SIMULATION_ENTITY_IDS: E, FIN11_SANDBOX_VERIFIED: 'true', HAMONYM_CARDCOM_TERMINAL: '1000', HAMONYM_CARDCOM_API_NAME: 'isolated-fake-user' });
  process.env.FIN11_SANDBOX_IDENTITY_SHA256 = createHash('sha256').update('1000' + String.fromCharCode(0) + 'isolated-fake-user').digest('hex');
}
async function fixture(outcomes = ['declined', 'technical_failure', 'succeeded'], enabled = true) {
  config();
  if (!enabled) process.env.FIN11_SIMULATION_COLLECTION_ENABLED = 'false';
  const schema = 'fin11_' + randomUUID().replaceAll('-', '');
  const pool = new Pool({ host: '127.0.0.1', port: 55437, database: 'hamonym_fin11_clock_test', user: 'postgres', password: 'fin11_isolated_only', max: 8, connectionTimeoutMillis: 5000, options: '-c search_path=' + schema + ',public' });
  pools.push(pool);
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, 'hamonym_fin11_clock_test');
  await pool.query('CREATE SCHEMA ' + schema);
  await pool.query(`CREATE TABLE users(id bigint PRIMARY KEY);
    CREATE TABLE entities(id uuid PRIMARY KEY, display_name text);
    CREATE TABLE billing_accounts(id uuid PRIMARY KEY, entity_id uuid REFERENCES entities(id));
    CREATE TABLE billing_periods(id uuid PRIMARY KEY, period_start timestamptz, period_end timestamptz, retired boolean DEFAULT false);
    CREATE TABLE statements(id uuid PRIMARY KEY, billing_account_id uuid REFERENCES billing_accounts(id), billing_period_id uuid REFERENCES billing_periods(id), status text, total_due numeric);
    CREATE TABLE statement_adjustments(statement_id uuid, delta_amount numeric); CREATE TABLE simulation_clock(id int PRIMARY KEY, offset_ms bigint, fixed_at timestamptz); INSERT INTO simulation_clock VALUES (1,0,NULL);`);
  for (const file of ['050_job_runs.sql', '059_collection_engine_core.sql', '075_fin11_simulation_business_time.sql']) await pool.query(fs.readFileSync(path.join(root, 'migrations', file), 'utf8'));
  await pool.query('INSERT INTO users VALUES (1)');
  await pool.query('INSERT INTO entities VALUES ($1, $2), ($3,$4)', [E, 'Authorized fixture', OTHER, 'Forbidden fixture']);
  await pool.query('INSERT INTO billing_accounts VALUES ($1,$2),($3,$4)', [B,E,'00000000-0000-4000-8000-000000000011',OTHER]);
  await pool.query('INSERT INTO billing_periods VALUES ($1,$2,$3,false)', [P,'2026-10-01T00:00Z','2026-10-28T18:00Z']);
  await pool.query('INSERT INTO statements VALUES ($1,$2,$3,$4,143.37),($5,$6,$3,$4,143.37)', [S,B,P,'approved',O,'00000000-0000-4000-8000-000000000011']);
  const calls = [], registry = new Map();
  const provider = { charge: async args => { calls.push(args); const outcome = outcomes.shift() || 'declined'; if (outcome === 'throw') throw new Error('mock transport'); return { outcome, providerReference: outcome === 'succeeded' ? 'MOCK-' + args.attemptId : undefined }; } };
  const cache = new Map();
  const noNotifications = { queueAdminNotification() {}, sendAdminNotification: async () => ({}) };
  const stubs = {
    'src/db/db.js': pool,
    'src/modules/billing/billing.repository.js': { getActiveDefaultByEntityId: async () => ({ token: 'MOCK-NOT-A-CARDCOM-TOKEN', exp_month: 2, exp_year: 2028 }) },
    'src/modules/collection-engine/adapters/get-adapter.js': () => provider,
    'src/modules/collection-engine/routing.js': { resolveCollectionMethod: async () => ({ method: 'card' }) },
    'src/modules/billing-engine/fin11-schema-probe.js': { isPaymentExceptionsSchemaPresent: async () => false, isMasavProposalsSchemaPresent: async () => false },
    'src/modules/billing-engine/payment-exceptions.service.js': {},
    'src/modules/billing-engine/masav-proposal.service.js': {},
    'src/modules/billing-engine/calculation.service.js': {},
    'src/modules/billing-engine/platform-billing-settings.service.js': {},
    'src/modules/billing-engine/approval.service.js': {},
    'src/modules/email/admin-notification.service.js': noNotifications,
    'src/jobs/reconciliation-findings.js': { recordFinding: async () => 1 },
  };
  function load(file) {
    if (Object.hasOwn(stubs, file)) return stubs[file];
    if (cache.has(file)) return cache.get(file).exports;
    if (file.startsWith('src/jobs/') && file.endsWith('.job.js') && !['billing-monthly-cycle','fin11-card-collection','fin11-card-retry-sweep'].some(n => file.endsWith('/'+n+'.job.js'))) return { name: file, handler: async () => { throw Error('Unrelated job invoked'); }, schedule: '0 * * * *' };
    const allowed = ['src/jobs/index.js','src/jobs/job-runner.js','src/jobs/billing-monthly-cycle.job.js','src/jobs/fin11-card-collection.job.js','src/jobs/fin11-card-retry-sweep.job.js','src/lib/clock.js','src/lib/fin11-simulation-context.js','src/modules/billing-engine/fin11-simulation.service.js','src/modules/billing-engine/fin11-card-collection.service.js','src/modules/billing-engine/billing-period.util.js','src/modules/billing-engine/statement-balance.service.js','src/modules/collection-engine/collection.service.js'];
    assert.ok(allowed.includes(file), 'Blocked unmocked import: '+file);
    const module = { exports: {} }; cache.set(file,module);
    vm.runInNewContext(fs.readFileSync(path.join(root,file),'utf8'), { module, exports:module.exports, Date, Intl, console, process,
      setTimeout: (...args) => setTimeout(...args).unref(),
      require(name) { if (['node:crypto','node:async_hooks'].includes(name)) return require(name); assert.ok(name.startsWith('.'), 'Blocked package '+name); let resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),name)); if (resolved==='src/jobs') resolved+='/index'; return load(resolved+'.js'); },
    }, { filename:file });
    return module.exports;
  }
  const driver = load('src/modules/billing-engine/fin11-simulation.service.js');
  return { pool, driver, load, calls, scope: load('src/lib/fin11-simulation-context.js'), jobs:load('src/jobs/index.js') };
}
test('clock automatically triggers 28/30/2 once each with real locks, durable attempts and real audit times', async () => {
  const f=await fixture();
  await f.driver.advance('2026-10-28T19:59:59+02:00',1); assert.equal(f.calls.length,0);
  await f.driver.advance('2026-10-28T20:00:00+02:00',1); assert.equal(f.calls.length,1);
  const runCount=(await f.pool.query('SELECT COUNT(*)::int AS n FROM job_runs')).rows[0].n;
  const repeat=await f.driver.advance('2026-10-28T20:00:00+02:00',1);assert.equal(repeat.skipped,'already_dispatched');assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM job_runs')).rows[0].n,runCount);
  await f.driver.advance('2026-10-28T20:01:00+02:00',1); assert.equal(f.calls.length,1);
  await f.driver.advance('2026-10-30T19:59:59+02:00',1); assert.equal(f.calls.length,1);
  await f.driver.advance('2026-10-30T20:00:00+02:00',1); assert.equal(f.calls.length,2);
  await f.driver.advance('2026-11-02T20:00:00+02:00',1); assert.equal(f.calls.length,3);
  const attempts=(await f.pool.query('SELECT status,business_collection_at,initiated_at FROM collection_attempts ORDER BY attempt_number')).rows;
  assert.equal(attempts.map(a=>a.status).join(','),'declined,technical_failure,succeeded');
  assert.equal(attempts[2].business_collection_at.toISOString(),'2026-11-02T18:00:00.000Z');
  assert.ok(Math.abs(attempts[2].initiated_at.getTime()-Date.now())<60000);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM payments')).rows[0].n,1);
  assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM collection_attempts WHERE statement_id=$1',[O])).rows[0].n,0);
  await f.driver.status(); await f.driver.advance('2026-11-03T20:00:00+02:00',1); assert.equal(f.calls.length,3);
});
test('a jump past all dates never causes immediate multiple attempts even across jobs and reloads',async()=>{
 const f=await fixture();await f.driver.advance('2026-11-02T20:00:00+02:00',1);assert.equal(f.calls.length,1);
 await f.driver.advance('2026-11-02T22:00:00+02:00',1);assert.equal(f.calls.length,1);
});
test('success stops retries and simulated registrations cannot execute from production cron or Run now',async()=>{
 const f=await fixture(['succeeded']);for(const name of ['fin11-card-collection','fin11-card-retry-sweep']){assert.equal(f.jobs.get(name).schedule,null);await assert.rejects(f.jobs.run(name),/scope required/);}
 await f.driver.advance('2026-10-28T20:00:00+02:00',1);await f.driver.advance('2026-10-30T20:00:00+02:00',1);assert.equal(f.calls.length,1);
});
test('Sandbox pin, explicit allowlist, admin and explicit timezone fail closed before dispatch',async()=>{
 const f=await fixture();delete process.env.FIN11_SIMULATION_ENTITY_IDS;await assert.rejects(f.driver.advance('2026-10-28T18:00Z',1),/allowlist/);
 config();process.env.HAMONYM_CARDCOM_API_NAME='changed';await assert.rejects(f.driver.advance('2026-10-28T18:00Z',1),/Sandbox/);
 config();process.env.FIN11_SANDBOX_VERIFIED='false';await assert.rejects(f.driver.advance('2026-10-28T18:00Z',1),/Sandbox/);
 config();await assert.rejects(f.driver.advance('2026-10-28T18:00Z',null),/Super Admin/);await assert.rejects(f.driver.advance('2026-10-28T20:00',1),/timezone/);assert.equal(f.calls.length,0);
});
test('restart after opening an attempt preserves business timestamp through reconciliation, without another charge',async()=>{
 const f=await fixture();const c=f.scope.configuration();const engine=f.load('src/modules/billing-engine/fin11-card-collection.service.js');
 const opened=await f.scope.run({ businessAt:'2026-10-28T18:00:00Z',entityIds:[E],fingerprint:c.fingerprint },()=>engine.openFin11CappedCardAttempt(S,new Date('2026-10-28T18:00Z')));
 assert.equal(opened.skipped,false);assert.equal(f.calls.length,0);
 await f.driver.advance('2026-10-30T20:00:00+02:00',1);assert.equal(f.calls.length,0);
 // The shared real finalizer runs outside clock context, as reconciliation does after restart.
 await f.load('src/modules/collection-engine/collection.service.js').resolveAttempt(opened.attemptId,S,{outcome:'succeeded',providerReference:'MOCK-RECONCILED'});
 const a=(await f.pool.query('SELECT business_collection_at FROM collection_attempts WHERE id=$1',[opened.attemptId])).rows[0];assert.equal(a.business_collection_at.toISOString(),'2026-10-28T18:00:00.000Z');
 await assert.rejects(f.pool.query('UPDATE collection_attempts SET business_collection_at=NOW() WHERE id=$1',[opened.attemptId]),/immutable/);
 const payment=(await f.pool.query('SELECT received_at FROM payments WHERE statement_id=$1',[S])).rows[0];assert.ok(Math.abs(payment.received_at.getTime()-Date.now())<60000);
});
test('locked service rejects an entity outside the allowlist even if a job candidate query is wrong',async()=>{
 const f=await fixture();const c=f.scope.configuration();await assert.rejects(f.scope.run({businessAt:'2026-10-28T18:00:00Z',entityIds:[E],fingerprint:c.fingerprint},()=>f.load('src/modules/billing-engine/fin11-card-collection.service.js').openFin11CappedCardAttempt(O,new Date('2026-10-28T18:00Z'))),/outside simulation scope/);
 assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM collection_attempts')).rows[0].n,0);
});
test('uncertain provider outcome never retries blindly and global Business Clock remains unchanged',async()=>{
 const f=await fixture(['throw']);await f.driver.advance('2026-10-28T20:00:00+02:00',1);await f.driver.advance('2026-10-30T20:00:00+02:00',1);assert.equal(f.calls.length,1);
 const now=await f.load('src/lib/clock.js').now(f.pool);assert.ok(Math.abs(now.getTime()-Date.now())<60000);
 const global=(await f.pool.query('SELECT offset_ms,fixed_at FROM simulation_clock WHERE id=1')).rows[0];assert.equal(global.offset_ms,'0');assert.equal(global.fixed_at,null);
 await assert.rejects(f.driver.advance('2026-10-28T20:00:00+02:00',1),/backwards/);
});


test('production registration stays unchanged when the explicit simulation feature is off',async()=>{
 const f=await fixture([],false);
 assert.equal(f.jobs.get('fin11-card-collection'),undefined);assert.equal(f.jobs.get('fin11-card-retry-sweep'),undefined);
 await assert.rejects(f.driver.advance('2026-10-28T18:00Z',1),/disabled/);
 assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM fin11_simulation_clock')).rows[0].n,0);
});

test('concurrent clock requests serialize on a real database lock and cannot duplicate a charge',async()=>{
 const f=await fixture(['declined']);
 const results=await Promise.allSettled([f.driver.advance('2026-10-28T18:00Z',1),f.driver.advance('2026-10-28T18:00Z',1)]);
 assert.ok(results.some(r=>r.status==='fulfilled'));assert.equal(f.calls.length,1);
 for(const r of results.filter(r=>r.status==='rejected'))assert.equal(r.reason.status,409);
 assert.equal((await f.pool.query('SELECT COUNT(*)::int AS n FROM collection_attempts')).rows[0].n,1);
});
