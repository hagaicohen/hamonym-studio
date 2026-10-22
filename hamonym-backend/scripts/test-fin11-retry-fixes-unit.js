'use strict';
// Isolated, fail-closed unit tests: no real require(), DB, jobs or providers.
// Run: node --test scripts/test-fin11-retry-fixes-unit.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
function load(relative, mocks = {}, extra = {}) {
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, relative), 'utf8'), {
    module, exports: module.exports, Date, Intl, console,
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), `Blocked unmocked import: ${name}`);
      return mocks[name];
    }, ...extra,
  }, { filename: relative });
  return module.exports;
}
const util = load('src/modules/billing-engine/billing-period.util.js');
// Independent timezone boundary mock: expected calendar dates are asserted
// separately. Real PostgreSQL AT TIME ZONE is deliberately never executed.
function utcAt20(day) {
  const nominal = new Date(`${day}T20:00:00Z`);
  const localHour = Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jerusalem', hour: 'numeric', hourCycle: 'h23',
  }).format(nominal));
  return new Date(nominal.getTime() - (localHour - 20) * 3600000);
}
function calendarDb(capture = () => {}) {
  return { async query(sql, args) {
    assert.match(sql, /TIME '20:00'.*AT TIME ZONE 'Asia\/Jerusalem'/);
    assert.match(sql, /unnest\(\$1::date\[\]\)/);
    capture(Array.from(args[0]));
    return { rows: args[0].map((day) => ({ due: utcAt20(day) })) };
  } };
}
for (const [month, days, times] of [
  ['2026-10', ['2026-10-28', '2026-10-30', '2026-11-02'], ['18', '18', '18']],
  ['2026-11', ['2026-11-28', '2026-11-30', '2026-12-02'], ['18', '18', '18']],
  ['2026-02', ['2026-02-28', '2026-03-02'], ['18', '18']],
  ['2028-02', ['2028-02-28', '2028-02-29', '2028-03-02'], ['18', '18', '18']],
  ['2100-02', ['2100-02-28', '2100-03-02'], ['18', '18']],
  ['2000-02', ['2000-02-28', '2000-02-29', '2000-03-02'], ['18', '18', '18']],
  ['2026-03', ['2026-03-28', '2026-03-30', '2026-04-02'], ['17', '17', '17']],
  ['2027-10', ['2027-10-28', '2027-10-30', '2027-11-02'], ['17', '17', '18']],
  ['2026-12', ['2026-12-28', '2026-12-30', '2027-01-02'], ['18', '18', '18']],
]) {
  test(`calendar ${month}: dates, short month, UTC/DST and exhaustion`, async () => {
    for (let n = 1; n <= days.length + 1; n++) {
      const result = await util.computeAttemptDueInstant(calendarDb((actual) => assert.deepEqual(actual, days)), `${month}-28T18:00:00Z`, n);
      assert.equal(result.maxAttempts, days.length);
      assert.equal(result.dueAt?.toISOString() ?? null, n <= days.length ? `${days[n - 1]}T${times[n - 1]}:00:00.000Z` : null);
    }
  });
}
function fixture(month = '2026-10', prior = []) {
  const attempts = prior.map((status, i) => ({ id: `a${i+1}`, status, attempt_number: i+1 }));
  const notifications = [], findings = new Map(), trace = [];
  const statement = { id: 's1', entity_id: 'e1', entity_name: 'test', status: 'approved', period_end: `${month}-28T18:00:00Z`, total_due: 5000 };
  const state = { held: false, exported: false, outstanding: 5000, instrument: true, charges: 0, collected: 0, failCommit: false, failNotificationSql: false, failFinding: false };
  const db = { async connect() { return db; }, release() {}, async query(sql, args) {
    trace.push(sql);
    if (sql === 'COMMIT' && state.failCommit) throw Error('mock commit failure');
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] };
    if (sql.includes('unnest(')) return calendarDb().query(sql, args);
    if (sql.includes('FOR UPDATE OF s')) return { rows: [statement] };
    if (sql.includes('SELECT id FROM collection_attempts')) return { rows: attempts.filter((a) => ['pending', 'ambiguous'].includes(a.status)) };
    if (sql.includes('SELECT ca.id, ca.status') && state.failNotificationSql) throw Error('mock notification SQL failure');
    if (sql.includes('SELECT ca.id, ca.status')) return { rows: attempts.slice().reverse().map((a) => ({ ...a, period_end: statement.period_end, entity_name: statement.entity_name, entity_id: statement.entity_id })) };
    if (sql.includes('UPDATE collection_attempts')) {
      const row = attempts.find((a) => a.id === args[0]);
      row.status = args[1]; return { rows: [] };
    }
    if (sql.includes('SELECT requested_amount, provider')) return { rows: [attempts.find((a) => a.id === args[0])] };
    if (sql.includes('INSERT INTO payments')) {
      const row = attempts.find((a) => a.id === args[1]);
      if (row.paid) { const error = Error('duplicate'); error.code = '23505'; throw error; }
      row.paid = true; state.collected += args[2]; state.outstanding -= args[2];
      return { rows: [] };
    }
    if (sql.includes('SELECT status FROM collection_attempts')) return { rows: attempts.slice().reverse() };
    if (sql.includes('MAX(attempt_number)')) return { rows: [{ next: attempts.length + 1 }] };
    if (sql.includes('INSERT INTO collection_attempts')) {
      assert.equal(args[2], Math.min(state.outstanding, 3000));
      const row = { id: `a${attempts.length+1}`, status: 'pending', attempt_number: args[1], requested_amount: args[2], provider: 'cardcom' };
      attempts.push(row); return { rows: [row] };
    }
    if (sql.includes('UPDATE statements')) { statement.status = sql.includes("status = 'paid'") ? 'paid' : 'open'; return { rows: [] }; }
    throw Error(`Unexpected SQL: ${sql}`);
  } };
  const balance = { getStatementBalance: async () => ({ outstanding: state.outstanding, collected: state.collected, adjustedTotal: state.outstanding + state.collected }) };
  const finding = { recordFinding: async (_, data) => { trace.push('finding'); if (state.failFinding) throw Error('mock finding failure'); findings.set(data.subjectId, data); } };
  const notification = { sendAdminNotification: async (event, payload) => { trace.push('notification'); notifications.push({ event, payload }); return { status: 'dispatched' }; }, queueAdminNotification: (event, payload) => { trace.push('notification'); notifications.push({ event, payload }); } };
  let service;
  const collection = load('src/modules/collection-engine/collection.service.js', {
    '../../db/db': db, '../billing/billing.repository': {}, './adapters/get-adapter': {}, './routing': {},
    '../../jobs/reconciliation-findings': finding,
    '../billing-engine/statement-balance.service': balance,
    '../billing-engine/payment-exceptions.service': {},
    '../billing-engine/fin11-schema-probe': {},
    '../email/admin-notification.service': notification,
    '../billing-engine/billing-period.util': util,
    '../billing-engine/fin11-card-collection.service': { notifyExhaustedCardStatement: (...args) => service.notifyExhaustedCardStatement(...args) },
  });
  service = load('src/modules/billing-engine/fin11-card-collection.service.js', {
    '../../db/db': db,
    '../billing/billing.repository': { getActiveDefaultByEntityId: async () => state.instrument ? {} : null },
    '../../jobs/reconciliation-findings': finding,
    '../email/admin-notification.service': notification,
    './statement-balance.service': balance,
    './payment-exceptions.service': { hasOpenCollectionHold: async () => ({ held: state.held }) },
    './fin11-schema-probe': { isPaymentExceptionsSchemaPresent: async () => true, isMasavProposalsSchemaPresent: async () => true },
    './masav-proposal.service': { hasExportedMasavProposal: async () => ({ exists: state.exported }) },
    './billing-period.util': util,
    '../collection-engine/collection.service': collection,
  });
  async function run(time, outcome = 'declined') {
    return service.collectWithRetries('s1', () => ({ charge: async () => {
      state.charges++; if (outcome === 'throw') throw Error('network'); return { outcome };
    } }), new Date(time));
  }
  return { run, service, collection, attempts, notifications, findings, trace, state, statement, db };
}
test('three separate attempts, early gates, immediate final attention and stable dedup key', async () => {
  const f = fixture();
  const dates = ['2026-10-28', '2026-10-30', '2026-11-02'];
  for (let i = 0; i < 3; i++) {
    assert.equal((await f.run(`${dates[i]}T17:59:59Z`))[0].reason, 'retry_not_yet_due');
    assert.equal(f.state.charges, i);
    const result = await f.run(`${dates[i]}T18:00:00Z`, i === 1 ? 'technical_failure' : 'declined');
    assert.equal(result.length, 1);
    assert.equal(f.state.charges, i + 1);
    if (i < 2) assert.equal(f.findings.size, 0);
  }
  assert.equal(f.findings.size, 1); // before any fourth invocation
  assert.equal(f.notifications.at(-1).event, 'fin11_card_attempts_exhausted');
  assert.ok(f.trace.lastIndexOf('COMMIT') < f.trace.lastIndexOf('finding'));
  assert.equal(f.trace.at(-1), 'notification');
  assert.equal((await f.run('2026-11-03T18:00:00Z'))[0].reason, 'max_attempts_reached');
  assert.equal(f.state.charges, 3);
  assert.equal(f.findings.size, 1);
  const keys = f.notifications.filter((n) => n.event === 'fin11_card_attempts_exhausted').map((n) => n.payload.incidentKey);
  assert.equal(new Set(keys).size, 1);
});
test('February 28 duplicate slot never creates an attempt; final remaining slot exhausts', async () => {
  const f = fixture('2026-02');
  await f.run('2026-02-28T18:00:00Z');
  assert.equal((await f.run('2026-02-28T18:01:00Z'))[0].reason, 'retry_not_yet_due');
  assert.equal((await f.run('2026-03-02T17:59:59Z'))[0].reason, 'retry_not_yet_due');
  await f.run('2026-03-02T18:00:00Z');
  assert.equal(f.findings.size, 1);
  assert.equal((await f.run('2026-03-03T18:00:00Z'))[0].reason, 'max_attempts_reached');
  assert.equal(f.state.charges, 2);
});
test('leap February: second attempt only on 29th; third only on March 2nd', async () => {
  const f = fixture('2028-02');
  for (const day of ['2028-02-28', '2028-02-29', '2028-03-02']) {
    assert.equal((await f.run(`${day}T17:59:59Z`))[0].reason, 'retry_not_yet_due');
    await f.run(`${day}T18:00:00Z`);
  }
  assert.equal(f.state.charges, 3);
  assert.equal(f.findings.size, 1);
});
test('one invocation makes at most one overdue attempt', async () => {
  const f = fixture();
  assert.equal((await f.run('2026-11-10T18:00:00Z')).length, 1);
  assert.equal(f.state.charges, 1);
});
for (const [label, change, reason] of [
  ['hold', (f) => { f.state.held = true; }, 'entity_collection_held'],
  ['exported MASAV', (f) => { f.state.exported = true; }, 'masav_proposal_exported_unresolved'],
  ['zero balance', (f) => { f.state.outstanding = 0; }, 'no_outstanding_balance'],
  ['no card', (f) => { f.state.instrument = false; }, 'no_active_payment_instrument'],
  ['paid', (f) => { f.statement.status = 'paid'; }, 'not_actionable'],
]) test(`guard preserved: ${label}`, async () => {
  const f = fixture(); change(f);
  assert.equal((await f.run('2026-11-10T18:00:00Z'))[0].reason, reason);
  assert.equal(f.attempts.length, 0); assert.equal(f.state.charges, 0);
});
for (const status of ['pending', 'ambiguous', 'succeeded', 'not_found_confirmed']) test(`no blind retry: ${status}`, async () => {
  const f = fixture('2026-10', [status]);
  await f.run('2026-11-10T18:00:00Z');
  assert.equal(f.state.charges, 0);
});
test('third success preserves recovery notification and blocks another collection', async () => {
  const f = fixture('2026-10', ['declined', 'technical_failure']);
  await f.run('2026-11-02T18:00:00Z', 'succeeded');
  assert.equal(f.findings.size, 0);
  assert.equal(f.notifications.at(-1).event, 'fin11_card_collection_recovered');
  await f.run('2026-11-03T18:00:00Z');
  assert.equal(f.state.charges, 1);
});
test('ambiguous third outcome and thrown adapter never assert confirmed failure', async () => {
  for (const outcome of ['ambiguous', 'throw']) {
    const f = fixture('2026-10', ['declined', 'declined']);
    await f.run('2026-11-02T18:00:00Z', outcome);
    assert.equal(f.findings.size, 0);
    assert.equal(f.attempts.at(-1).status, 'ambiguous');
    await f.run('2026-11-03T18:00:00Z'); assert.equal(f.state.charges, 1);
  }
});
test('existing notification + email infrastructure dedupes repeated/concurrent final events per recipient', async () => {
  const keys = new Set(); let sends = 0;
  const email = load('src/modules/email/email.service.js', {
    '../../db/db': { query: async (sql, args) => {
      if (sql.includes('INSERT INTO email_logs')) {
        assert.match(sql, /ON CONFLICT \(idempotency_key\) DO NOTHING/);
        if (keys.has(args[8])) return { rows: [] };
        keys.add(args[8]); return { rows: [{ id: keys.size }] };
      }
      assert.match(sql, /UPDATE email_logs/); return { rows: [] };
    } },
    './templates': { 'admin-operational-finding': () => ({ subject: 'test', html: 'test', text: 'test' }) },
    './providers/stub.provider': { send: async () => { sends++; return { status: 'sent' }; } },
  }, { process: { env: { EMAIL_ENABLED: 'true', EMAIL_PROVIDER: 'stub' } } });
  const admin = load('src/modules/email/admin-notification.service.js', {
    '../../db/db': { query: async () => ({ rows: [{ id: 1, email: 'a@example.test' }, { id: 2, email: 'b@example.test' }] }) },
    './email.service': email,
  });
  const payload = { incidentKey: 'fin11_card_exhausted:s1' };
  await Promise.all(Array.from({ length: 5 }, () => admin.sendAdminNotification('fin11_card_attempts_exhausted', payload)));
  assert.equal(sends, 2); assert.equal(keys.size, 2);
});

for (const failure of ['declined', 'technical_failure']) test(`reconciliation confirms final ${failure}: post-commit finding, immediate keyed email`, async () => {
  const f = fixture('2026-10', ['declined', 'technical_failure', 'ambiguous']);
  await f.collection.resolveAttempt('a3', 's1', { outcome: failure });
  assert.equal(f.findings.size, 1);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].event, 'fin11_card_attempts_exhausted');
  assert.equal(f.notifications[0].payload.incidentKey, 'fin11_card_exhausted:s1');
  assert.ok(f.trace.lastIndexOf('COMMIT') < f.trace.lastIndexOf('finding'));
  assert.equal(f.trace.at(-1), 'notification');
  assert.equal(f.state.charges, 0);
  await f.collection.resolveAttempt('a3', 's1', { outcome: failure });
  assert.equal(new Set(f.notifications.map((n) => n.payload.incidentKey)).size, 1);
});
test('February skipped slot: reconciliation confirms the final actual attempt', async () => {
  const f = fixture('2026-02', ['declined', 'ambiguous']);
  await f.collection.resolveAttempt('a2', 's1', { outcome: 'declined' });
  assert.equal(f.findings.size, 1); assert.equal(f.notifications.length, 1);
});
test('reconciliation of early or still ambiguous attempts does not exhaust', async () => {
  for (const [prior, outcome] of [
    [['ambiguous'], 'declined'], [['declined', 'ambiguous'], 'technical_failure'],
    [['declined', 'declined', 'ambiguous'], 'ambiguous'],
  ]) {
    const f = fixture('2026-10', prior);
    await f.collection.resolveAttempt(`a${prior.length}`, 's1', { outcome });
    assert.equal(f.findings.size, 0); assert.equal(f.notifications.length, 0);
    assert.equal(f.state.charges, 0);
  }
});
test('commit failure never queues an exhaustion email', async () => {
  const f = fixture('2026-10', ['declined', 'declined', 'ambiguous']);
  f.state.failCommit = true;
  await assert.rejects(f.collection.resolveAttempt('a3', 's1', { outcome: 'declined' }), /mock commit failure/);
  assert.equal(f.notifications.length, 0); assert.equal(f.trace.at(-1), 'ROLLBACK');
});
test('real shared success finalizer preserves capped payment and unique-payment protection', async () => {
  const f = fixture('2026-10', ['declined', 'declined']);
  f.state.outstanding = 3000;
  await f.run('2026-11-02T18:00:00Z', 'succeeded');
  assert.equal(f.state.collected, 3000); assert.equal(f.statement.status, 'paid');
  assert.equal(f.findings.size, 0);
  await assert.rejects(f.collection.resolveAttempt('a3', 's1', { outcome: 'succeeded', providerReference: 'same' }), { code: '23505' });
  assert.equal(f.state.collected, 3000);
});

for (const fault of ['failNotificationSql', 'failFinding']) test(`${fault} never rolls back a confirmed failure`, async () => {
  const f = fixture('2026-10', ['declined', 'declined', 'ambiguous']);
  f.state[fault] = true;
  const result = await f.collection.resolveAttempt('a3', 's1', { outcome: 'declined' });
  assert.equal(result.outcome, 'declined'); assert.equal(f.attempts[2].status, 'declined');
  assert.ok(f.trace.includes('COMMIT')); assert.ok(!f.trace.includes('ROLLBACK'));
  assert.equal(f.notifications.length, 0);
  f.state[fault] = false;
  await f.service.notifyExhaustedCardStatement(f.db, 's1');
  assert.equal(f.notifications.length, 1); assert.equal(f.findings.size, 1);
  assert.equal(f.state.charges, 0);
});

test('restart reconstructs final failure with no email intent and no finding; repeated recovery is keyed', async () => {
  // A fresh process sees only the committed financial truth. Nothing ran
  // between COMMIT and the simulated crash, not even a finding INSERT.
  const f = fixture('2026-10', ['declined', 'declined', 'declined']);
  const persisted = new Set();
  const recoveryDb = { query: async (sql, args) => {
    if (sql.includes('FROM email_logs') && !sql.includes('SELECT ca.statement_id')) {
      assert.match(sql, /status IN \('pending', 'failed'\)/);
      assert.match(sql, /fin11_card_exhausted:%/);
      assert.match(sql, /eventType.*fin11_card_attempts_exhausted/);
      return { rows: [] };
    }
    if (sql.includes('SELECT ca.statement_id')) {
      assert.match(sql, /NOT EXISTS \(SELECT 1 FROM email_logs/);
      assert.match(sql, /bool_and\(ca.status IN \('declined', 'technical_failure'\)\)/);
      assert.match(sql, /THEN 2 ELSE 3 END/);
      return { rows: persisted.has('s1') ? [] : [{ statement_id: 's1' }] };
    }
    return f.db.query(sql, args);
  } };
  const recovery = load('src/jobs/email-dispatch-recovery.job.js', {
    '../modules/email/email.service': { redispatchPending: async () => { throw Error('no intent exists'); } },
    '../modules/billing-engine/fin11-card-collection.service': { notifyExhaustedCardStatement: async (db, id, options) => {
      const result = await f.service.notifyExhaustedCardStatement(db, id, options);
      if (result?.status === 'dispatched') persisted.add(id);
    } },
  });
  assert.equal(f.findings.size, 0); assert.equal(f.notifications.length, 0);
  await recovery.handler(recoveryDb);
  assert.equal(f.findings.size, 1); assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].payload.incidentKey, 'fin11_card_exhausted:s1');
  await recovery.handler(recoveryDb);
  assert.equal(f.notifications.length, 1); assert.equal(f.state.charges, 0);
  assert.ok(!f.trace.some((sql) => /BEGIN|UPDATE collection_attempts|INSERT INTO payments/.test(sql)));
});
function mailFixture() {
  const rows = new Map(), accepted = new Map();
  const state = { failProvider: false, failFinalize: false, calls: 0, deliveries: 0 };
  const provider = load('src/modules/email/providers/resend.provider.js', {
    axios: { post: async (_, body, config) => {
      state.calls++;
      if (state.failProvider) throw Error('mock email provider outage');
      const key = config.headers['Idempotency-Key'];
      assert.equal(key, 'fin11_card_exhausted:s1:1');
      if (accepted.has(key)) assert.deepEqual(body, accepted.get(key));
      else { accepted.set(key, body); state.deliveries++; }
      return { data: { id: 'provider-email-1' } };
    } },
  }, { process: { env: { RESEND_API_KEY: 'mock' } } });
  const email = load('src/modules/email/email.service.js', {
    '../../db/db': { query: async (sql, args) => {
      if (sql.includes('INSERT INTO email_logs')) {
        if (rows.has(args[8])) return { rows: [] };
        rows.set(args[8], { id: 'log1', status: 'pending', payload: JSON.parse(args[9]), idempotency_key: args[8] });
        return { rows: [{ id: 'log1' }] };
      }
      assert.match(sql, /UPDATE email_logs/);
      if (state.failFinalize) throw Error('mock notification finalization SQL failure');
      rows.values().next().value.status = args[1]; return { rows: [] };
    } },
    './templates': { 'admin-operational-finding': () => ({ subject: 'fixed', html: 'fixed html', text: 'fixed text' }) },
    './providers/resend.provider': provider,
  }, { process: { env: { EMAIL_ENABLED: 'true', EMAIL_PROVIDER: 'resend', EMAIL_FROM: 'mock@example.test' } } });
  const payload = { template: 'admin-operational-finding', to: 'admin@example.test',
    data: { eventType: 'fin11_card_attempts_exhausted' }, idempotencyKey: 'fin11_card_exhausted:s1:1' };
  return { email, payload, rows, state };
}
test('provider accepted then process lost terminal write: durable intent retries with same provider key', async () => {
  const m = mailFixture(); m.state.failFinalize = true;
  await assert.rejects(m.email.send(m.payload), /mock notification finalization SQL failure/);
  const row = m.rows.values().next().value;
  assert.equal(row.status, 'pending'); assert.equal(m.state.deliveries, 1);
  assert.equal(row.payload.idempotencyKey, m.payload.idempotencyKey);
  m.state.failFinalize = false;
  await m.email.redispatchPending(row);
  assert.equal(row.status, 'sent'); assert.equal(m.state.calls, 2);
  assert.equal(m.state.deliveries, 1);
  assert.equal((await m.email.send(m.payload)).status, 'duplicate');
  assert.equal(m.state.calls, 2);
});
test('existing recovery retries failed final email after outage without creating another log', async () => {
  const m = mailFixture(); m.state.failProvider = true;
  assert.equal((await m.email.send(m.payload)).status, 'failed');
  const row = m.rows.values().next().value;
  assert.equal(row.status, 'failed');
  // Legacy rows have the key column but did not include it in payload.
  delete row.payload.idempotencyKey;
  const db = { query: async (sql) => {
    if (sql.includes('SELECT ca.statement_id')) return { rows: [] };
    assert.match(sql, /status IN \('pending', 'failed'\)/);
    assert.match(sql, /fin11_card_exhausted:%/);
    return { rows: row.status === 'failed' ? [row] : [] };
  } };
  const recovery = load('src/jobs/email-dispatch-recovery.job.js', {
    '../modules/email/email.service': m.email,
    '../modules/billing-engine/fin11-card-collection.service': { notifyExhaustedCardStatement: async () => assert.fail('no missing intent') },
  });
  m.state.failProvider = false;
  assert.equal((await recovery.handler(db)).sent, 1);
  assert.equal(row.status, 'sent'); assert.equal(m.rows.size, 1);
  await recovery.handler(db);
  assert.equal(m.state.deliveries, 1);
});
test('Resend legacy notifications keep request headers unchanged', async () => {
  const provider = load('src/modules/email/providers/resend.provider.js', {
    axios: { post: async (_, __, config) => {
      assert.ok(!Object.hasOwn(config.headers, 'Idempotency-Key'));
      return { data: { id: 'legacy' } };
    } },
  }, { process: { env: { RESEND_API_KEY: 'mock' } } });
  await provider.send({ to: 'mock@example.test', subject: 'legacy' });
});
