'use strict';
// Stateful isolated fixtures only. Never loads dotenv, pg, axios or the real job registry.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = process.env.HAMONYM_ADMIN_BACKEND_ROOT;
if (!root) throw new Error('Set HAMONYM_ADMIN_BACKEND_ROOT');
const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222';
function load(file, dependencies, env) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, file), 'utf8'), {
    module, exports: module.exports, process: { env }, console, Date, Set, Map, Number, Buffer,
    setTimeout: () => 0, clearTimeout() {}, // No real timers or background jobs.
    require(name) {
      if (name.startsWith('node:')) return require(name);
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      throw new Error('Forbidden dependency: ' + name);
    },
  }, { filename: file });
  return module.exports;
}
function fixture(overrides = {}) {
  const env = { HAMONYM_SIMULATION_MODE: 'on', FIN11_SIMULATION_COLLECTION_ENABLED: 'true', FIN11_SIMULATION_PAYMENT_PROVIDER: 'mock', FIN11_SIMULATION_AUTO_APPROVAL_ENABLED: 'true', FIN11_SIMULATION_ENTITY_IDS: A, ...overrides };
  const scope = load('src/lib/fin11-simulation-context.js', {}, env);
  const mock = load('src/modules/collection-engine/adapters/fin11-mock.adapter.js', { '../../../lib/fin11-simulation-context': scope }, env);
  const state = { clock: null, run: null, statements: [], attempts: [], jobs: [], queries: [], calculated: [], approved: [], payments: [], failAccount: null, approvalFails: false, jobFails: false, overlap: false, locked: false };
  const boundary = { periodStart: new Date('2026-10-01T00:00:00Z'), periodEnd: new Date('2026-10-28T18:00:00Z') };
  const db = { query: async (sql, params = []) => {
    state.queries.push({ sql, params });
    let rows = [];
    if (sql.includes('pg_try_advisory_lock')) rows = [{ acquired: !state.locked }];
    else if (sql.startsWith('SELECT business_at')) rows = state.clock ? [state.clock] : [];
    else if (sql.includes('INSERT INTO fin11_simulation_clock')) state.clock = { business_at: params[0], entity_ids: [...params[1]], identity_fingerprint: params[2], pending: true };
    else if (sql.includes('UPDATE fin11_simulation_clock')) state.clock.pending = false;
    else if (sql.includes('SELECT r.id FROM billing_runs')) rows = state.run ? [state.run] : [];
    else if (sql.includes('INSERT INTO billing_runs')) { state.run = { id: 'run', marker: JSON.parse(params[2]) }; rows = [{ id: 'run' }]; }
    else if (sql.includes('FROM billing_accounts') && sql.includes("enforcement_status='active'")) rows = [A, B].filter(id => params[0].includes(id)).map(id => ({ id: id === A ? 'account-a' : 'account-b', entity_id: id, fee_rate: '0.03', vat_rate: '0.18' }));
    else if (sql.includes('SELECT id,billing_run_id,status FROM statements')) rows = state.statements.filter(row => row.account === params[0]);
    else if (sql.includes('SELECT ca.id,ca.statement_id')) rows = state.attempts.filter(row => ['pending', 'ambiguous'].includes(row.status));
    return { rows };
  } };
  db.connect = async () => ({ query: db.query, release() {} });
  const monthlyDependencies = {
    '../../db/db': db, '../../lib/fin11-simulation-context': scope,
    './billing-period.util': { resolveSelectedMonthBoundary: async () => boundary, ensurePeriod: async () => { if (state.overlap) throw Object.assign(new Error('overlap'), { code: 'PERIOD_OVERLAP_MISMATCH' }); return { periodId: 'period' }; } },
    '../../jobs/billing-monthly-cycle.job': { computeMostRecentCycleBoundary: async () => boundary },
    './calculation.service': { runProductionCalculation: async (_period, _time, options) => {
      if (!state.run) await db.query('INSERT INTO billing_runs', ['period', _time, JSON.stringify(options.marker)]);
      const accounts = (await db.query("SELECT * FROM billing_accounts WHERE enforcement_status='active' AND entity_id=ANY($1::uuid[])", [options.entityIds])).rows;
      const summary = { billingRunId: 'run', statementsCreated: 0, reused: 0, errors: [], blockedEntities: [], activityDiscovered: {}, accountsEvaluated: accounts.length };
      for (const account of accounts) {
        scope.assertEntity(account.entity_id);
        const existing = state.statements.filter(row => row.account === account.id);
        if (existing.length) { if (existing.some(row => row.billing_run_id !== 'run')) summary.errors.push({ code: 'EXISTING_STATEMENT_OUTSIDE_RUN' }); else summary.reused += existing.length; continue; }
        state.calculated.push(account.entity_id);
        if (state.failAccount === account.entity_id) { summary.errors.push({ code: 'FIXTURE_FAILURE' }); continue; }
        state.statements.push({ id: 'statement-' + account.id, account: account.id, entityId: account.entity_id, billing_run_id: 'run', status: 'draft' });summary.statementsCreated++;
      }
      return summary;
    } },    './approval.service': { autoApproveDraftStatementsForRun: async runId => {
      assert.equal(runId, 'run');
      if (state.approvalFails) return { approved: [], failed: [{ statementId: 'statement', code: 'DONATION_CHANGED' }] };
      const rows = state.statements.filter(row => row.status === 'draft');
      rows.forEach(row => { row.status = 'approved'; state.approved.push(row.id); });
      return { approved: rows, failed: [] };
    } },
    '../collection-engine/collection.service': { resolveAttempt: async id => { const attempt = state.attempts.find(row => row.id === id); attempt.status = 'succeeded'; state.statements.find(row => row.id === attempt.statement_id).status = 'paid'; if (!state.payments.includes(id)) state.payments.push(id); } },
    '../collection-engine/adapters/fin11-mock.adapter': mock,
  };
  monthlyDependencies['../../jobs/reconciliation-findings'] = { recordFinding: async () => {} };
  const shared = load('src/modules/billing-engine/monthly-billing-orchestrator.service.js', monthlyDependencies, env);
  const monthly = load('src/modules/billing-engine/fin11-simulation-monthly.service.js', { ...monthlyDependencies, './monthly-billing-orchestrator.service': shared }, env);
  const jobs = { run: async name => {
    assert.ok(scope.current()); scope.configuration(); state.jobs.push(name);
    if (state.jobFails) throw new Error('isolated crash');
    let succeeded = 0;
    for (const statement of state.statements.filter(row => row.status === 'approved')) {
      const attempt = { id: 'attempt-' + statement.id, statement_id: statement.id, entity_id: statement.entityId, status: 'pending' };
      if (state.payments.includes(attempt.id)) continue;
      state.attempts.push(attempt);
      const result = await mock.charge({ attemptId: attempt.id, entityId: statement.entityId });
      assert.match(result.providerReference, /^fin11_mock:/);
      attempt.status = 'succeeded'; statement.status = 'paid'; state.payments.push(attempt.id); succeeded++;
    }
    return { status: 'success', result: { errors: 0, succeeded } };
  } };
  const service = load('src/modules/billing-engine/fin11-simulation.service.js', {
    '../../db/db': db, '../../lib/clock': { realNow: () => new Date('2026-10-25T00:00:00Z') },
    '../../lib/fin11-simulation-context': scope, '../../jobs': jobs, './fin11-simulation-monthly.service': monthly,
  }, env);
  return { env, state, service, monthly, scope, mock };
}
const at = '2026-10-28T18:08:00Z';
test('complete cutoff flow calculates/approves only allowlisted entities and uses mock payment only', async () => {
  const { service, state } = fixture(); const result = await service.advance(at, 7);
  assert.deepEqual(state.calculated, [A]); assert.equal(state.approved.length, 1); assert.equal(state.payments.length, 1);
  assert.equal(state.statements[0].status, 'paid'); assert.equal(state.run.marker.simulation_provider, 'fin11_mock');
  assert.equal(result.results[0].step, 'monthly_billing'); assert.equal(state.clock.pending, false);
  assert.ok(state.queries.some(q => q.sql.includes('entity_id=ANY($1::uuid[])')));
});
for (const config of [{ FIN11_SIMULATION_COLLECTION_ENABLED: 'false' }, { HAMONYM_SIMULATION_MODE: 'off' }, { FIN11_SIMULATION_ENTITY_IDS: '' }, { FIN11_SIMULATION_PAYMENT_PROVIDER: 'cardcom' }, { FIN11_SIMULATION_PAYMENT_PROVIDER: '' }]) {
  test('missing authorization fails closed before any DB access: ' + JSON.stringify(config), async () => {
    const { service, state } = fixture(config); await assert.rejects(service.advance(at, 7));
    assert.equal(state.queries.length, 0); assert.equal(state.payments.length, 0);
  });
}
test('automatic approval requires independent simulation authorization, not the production flag', async () => {
  const { service, state } = fixture({ FIN11_SIMULATION_AUTO_APPROVAL_ENABLED: 'false', FIN11_AUTO_APPROVAL_ENABLED: 'true' });
  const result = await service.advance(at, 7);
  assert.equal(result.results[0].result.reason, 'automatic_approval_not_authorized');
  assert.equal(state.statements.length, 0); assert.equal(state.jobs.length, 0); assert.equal(state.clock.pending, true);
});
test('before cutoff no cycle, statements or collection is created', async () => {
  const { service, state } = fixture(); const result = await service.advance('2026-10-28T17:59:59Z', 7);
  assert.equal(result.results[0].result.reason, 'cutoff_not_reached'); assert.equal(state.run, null); assert.equal(state.jobs.length, 0);
});
test('same clock and later clock reuse statements and never duplicate payments', async () => {
  const { service, state } = fixture(); await service.advance(at, 7);
  assert.equal((await service.advance(at, 7)).skipped, 'already_dispatched');
  await service.advance('2026-10-30T18:00:00Z', 7);
  assert.equal(state.statements.length, 1); assert.equal(state.payments.length, 1); assert.deepEqual(state.calculated, [A]);
});
test('partially committed calculation resumes the same run without duplicate Statements', async () => {
  const { service, state } = fixture({ FIN11_SIMULATION_ENTITY_IDS: A + ',' + B }); state.failAccount = B;
  const blocked = await service.advance(at, 7); assert.equal(blocked.results[0].status, 'blocked');
  assert.equal(state.statements.length, 1); assert.equal(state.payments.length, 0); assert.equal(state.clock.pending, true);
  state.failAccount = null; await service.advance(at, 7);
  assert.equal(state.statements.length, 2); assert.equal(state.payments.length, 2);
  assert.equal(state.calculated.filter(id => id === A).length, 1);
});
test('approval failure stops collection and can resume after validation passes', async () => {
  const { service, state } = fixture(); state.approvalFails = true;
  const result = await service.advance(at, 7); assert.equal(result.results[0].result.reason, 'approval_failed');
  assert.equal(state.jobs.length, 0); assert.equal(state.clock.pending, true);
  state.approvalFails = false; await service.advance(at, 7); assert.equal(state.statements.length, 1); assert.equal(state.payments.length, 1);
});
test('job failure remains pending and resumes without recalculating', async () => {
  const { service, state } = fixture(); state.jobFails = true;
  const result = await service.advance(at, 7); assert.equal(result.results.at(-1).status, 'failed'); assert.equal(state.clock.pending, true);
  state.jobFails = false; await service.advance(at, 7); assert.equal(state.calculated.length, 1); assert.equal(state.payments.length, 1);
});
test('existing non-simulation statement is never approved or charged by the simulator', async () => {
  const { service, state } = fixture(); state.statements.push({ id: 'legacy', account: 'account-a', billing_run_id: 'real-run', status: 'approved' });
  const result = await service.advance(at, 7); assert.equal(result.results[0].status, 'blocked'); assert.equal(state.payments.length, 0); assert.equal(state.jobs.length, 0);
});
test('a crash after opening a mock attempt recovers that attempt, never charging a new one', async () => {
  const { service, state } = fixture(); state.jobFails = true;
  await service.advance(at, 7);
  state.attempts.push({ id: 'persisted-attempt', statement_id: state.statements[0].id, entity_id: A, status: 'pending' });
  state.jobFails = false;
  const result = await service.advance(at, 7);
  assert.equal(result.results[1].result.recovered, 1); assert.equal(state.attempts.length, 1);
  assert.deepEqual(state.payments, ['persisted-attempt']); assert.equal(state.statements[0].status, 'paid');
});
test('job runner injects the mock adapter inside simulation and does not override production handlers', async () => {
  const { scope, mock, env } = fixture(); let calls = 0;
  const query = async sql => ({ rows: sql.includes('pg_try_advisory_xact_lock') ? [{ acquired: true }] : sql.includes('INSERT INTO job_runs') ? [{ id: 1, started_at: new Date() }] : [] });
  const runner = load('src/jobs/job-runner.js', {
    '../db/db': { query, connect: async () => ({ query, release() {} }) },
    '../lib/clock': { now: async () => new Date(at) }, '../lib/fin11-simulation-context': scope,
    '../modules/email/admin-notification.service': { queueAdminNotification() {} },
    '../modules/collection-engine/adapters/fin11-mock.adapter': mock,
  }, env);
  runner.register({ name: 'fixture-fin11', simulationOnly: true, handler: async (_db, context) => {
    const adapter = context.resolveAdapter('card');
    assert.equal(adapter, mock);
    await adapter.charge({ attemptId: 'fixture', entityId: A }); calls++;
    assert.throws(() => context.resolveAdapter('masav'));
    return {};
  } });
  await assert.rejects(runner.run('fixture-fin11'));
  const config = scope.configuration();
  await scope.run({ entityIds: [A], fingerprint: config.fingerprint, businessAt: at }, async () => {
    assert.equal((await runner.run('fixture-fin11')).status, 'success');
  });
  runner.register({ name: 'fixture-production', handler: async (_db, context) => {
    assert.equal(context.resolveAdapter, undefined); calls++; return {};
  } });
  assert.equal((await runner.run('fixture-production')).status, 'success');
  assert.equal(calls, 2);
});
test('period conflicts are reported, never fixed by mutating old periods', async () => {
  const { service, state } = fixture(); state.overlap = true;
  const result = await service.advance(at, 7); assert.equal(result.results[0].result.reason, 'PERIOD_OVERLAP_MISMATCH'); assert.equal(state.statements.length, 0);
});
test('mock adapter rejects unscoped calls and entities outside the allowlist', async () => {
  const { scope, mock } = fixture(); await assert.rejects(mock.charge({ attemptId: 'x', entityId: A }));
  const config = scope.configuration();
  await scope.run({ entityIds: [A], fingerprint: config.fingerprint, businessAt: at }, async () => {
    await assert.rejects(mock.charge({ attemptId: 'x', entityId: B }));
    const first = await mock.charge({ attemptId: 'x', entityId: A });
    const recovered = await mock.reconcile({ attemptId: 'x', entityId: A }); assert.equal(first.providerReference, recovered.providerReference);
  });
});
test('normal reconciliation excludes mock attempts, and both collection paths guard mock Statements', () => {
  const reconciliation = fs.readFileSync(path.join(root, 'src/jobs/collection-attempt-reconciliation.job.js'), 'utf8');
  assert.match(reconciliation, /provider != 'fin11_mock'/);
  for (const file of ['src/modules/collection-engine/collection.service.js', 'src/modules/billing-engine/fin11-card-collection.service.js']) {
    assert.match(fs.readFileSync(path.join(root, file), 'utf8'), /simulation_statement_requires_simulator/);
  }
  const cardJob = fs.readFileSync(path.join(root, 'src/jobs/fin11-card-collection.job.js'), 'utf8');
  const retryJob = fs.readFileSync(path.join(root, 'src/jobs/fin11-card-retry-sweep.job.js'), 'utf8');
  assert.match(cardJob, /simulation_identity/); assert.match(retryJob, /simulation_identity/);
});
test('ordinary/manual and unscoped automatic collection stop before resolving a live adapter for mock Statements', async () => {
  const { scope, env } = fixture();
  const forbidden = new Proxy(function () { assert.fail('Unexpected financial or provider operation'); }, { get: () => forbidden });
  const queries = [];
  const db = { connect: async () => ({ query: async sql => {
    queries.push(sql);
    return { rows: sql.includes('SELECT s.*') ? [{ id: 's', entity_id: A, simulation_provider: 'fin11_mock' }] : [] };
  }, release() {} }) };
  for (const file of ['src/modules/collection-engine/collection.service.js', 'src/modules/billing-engine/fin11-card-collection.service.js']) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const dependencies = {};
    for (const match of source.matchAll(/require\(['"]([^'"]+)['"]\)/g)) dependencies[match[1]] = forbidden;
    dependencies['../../db/db'] = db;
    dependencies['../../lib/fin11-simulation-context'] = scope;
    const service = load(file, dependencies, env);
    const result = service.runCollectionForStatement ? await service.runCollectionForStatement('s') : await service.openFin11CappedCardAttempt('s', forbidden);
    assert.equal(result.reason, 'simulation_statement_requires_simulator');
  }
  assert.ok(queries.every(sql => /^(BEGIN|COMMIT|\s*SELECT)/.test(sql)));
});



test('billing API clock reads the persisted simulator time independently of legacy clock', async () => {
  const clock = load('src/lib/clock.js', {}, { HAMONYM_SIMULATION_MODE: 'on' });
  const queries=[];
  const at=await clock.billingNow({query:async sql=>{queries.push(sql);return {rows:[{enabled:true,fixed_at:'2026-10-28T18:08:00Z'}]};}});
  assert.equal(at.toISOString(),'2026-10-28T18:08:00.000Z');
  assert.equal(queries.length,1);assert.match(queries[0],/admin_simulation_clock/);
});
test('production billing clock never reads a simulation override', async () => {
  const clock = load('src/lib/clock.js', {}, { HAMONYM_SIMULATION_MODE: 'off' });
  const before=Date.now();
  const now=await clock.billingNow({query:async()=>assert.fail('Production must not query simulated clocks')});
  assert.ok(now.getTime()>=before && now.getTime()<=Date.now());
});
