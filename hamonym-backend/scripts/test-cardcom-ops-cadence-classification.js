// Regression coverage for the CardCom Operations page IA redesign
// (2026-09-07) -- specifically the "critical distinction" the redesign
// brief was most worried about: a job must never be classified as
// stale/critical merely because a long time has elapsed, unless it
// actually has a real, approved cadence (a `schedule` field) that it has
// exceeded. A dormant/manual-only job (no `schedule`) must be silently
// excluded from staleness alerting, not shown red.
//
// Audit finding (see this session's report): this distinction was NOT
// invented for this redesign -- it already exists, correctly, in
// src/jobs/schedule-window.js (added 2026-08-18) and was extended
// 2026-09-01 specifically to exempt recurring-payment-reconciliation (by
// removing its `schedule` field, not by adding a special case elsewhere).
// This script exists to (a) prove that mechanism still works today, and
// (b) catch a regression if either fact ever silently changes: a job
// losing its schedule unnoticed, or recurring-payment-reconciliation
// regaining one before its correlation logic is actually hardened.
//
// No real DB, no real network call: db.query is a routing fake for the one
// query checkStaleness() issues, and the shared `db` singleton's .query is
// monkey-patched for the controller-level test (restored immediately after)
// -- same "fake db, real production code path" approach as
// scripts/test-collection-attempt-recovery.js.
//
// Run: node scripts/test-cardcom-ops-cadence-classification.js

const assert = require('assert');
const { checkStaleness } = require('../src/jobs/schedule-window');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

function fakeDbLastSuccess(lastSuccessIso) {
  return {
    query: async (sql) => {
      assert(sql.includes('MAX(started_at)'), 'expected the checkStaleness last-success query');
      return { rows: [{ last_success: lastSuccessIso }] };
    },
  };
}

async function run() {
  // ---- schedule-window.checkStaleness: the core cadence-aware primitive --

  await check('a scheduled hourly job, last succeeded 30 min ago -> NOT stale (within tolerance)', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const job = { name: 'x', schedule: '0 * * * *' };
    const db = fakeDbLastSuccess(new Date(now.getTime() - 30 * 60_000).toISOString());
    const { stale } = await checkStaleness(db, job, now);
    assert.strictEqual(stale, false);
  });

  await check('a scheduled hourly job, last succeeded 3 hours ago -> stale (exceeds 2x tolerance)', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const job = { name: 'x', schedule: '0 * * * *' };
    const db = fakeDbLastSuccess(new Date(now.getTime() - 3 * 60 * 60_000).toISOString());
    const { stale } = await checkStaleness(db, job, now);
    assert.strictEqual(stale, true);
  });

  await check('a scheduled job that has NEVER succeeded -> stale, msSinceLastSuccess null (not "0 minutes")', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const job = { name: 'x', schedule: '0 * * * *' };
    const db = fakeDbLastSuccess(null);
    const { stale, msSinceLastSuccess } = await checkStaleness(db, job, now);
    assert.strictEqual(stale, true);
    assert.strictEqual(msSinceLastSuccess, null);
  });

  await check('a daily job, last succeeded 30 hours ago -> NOT stale (within 2x24h tolerance, not "old" in absolute terms)', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const job = { name: 'x', schedule: '0 3 * * *' };
    const db = fakeDbLastSuccess(new Date(now.getTime() - 30 * 60 * 60_000).toISOString());
    const { stale } = await checkStaleness(db, job, now);
    assert.strictEqual(stale, false, 'a daily job must not be flagged after only 30h -- that is well within one missed-cycle tolerance');
  });

  // ---- The registry: which of today's real jobs actually have a schedule --

  await check('every job registered in src/jobs/index.js has a determinable cadence answer -- either a real schedule, or a documented, deliberate absence of one', async () => {
    require('../src/jobs/index'); // side effect: populates the registry with all real jobs
    const jobRunner = require('../src/jobs/job-runner');

    const expectedNames = [
      'webhook-recovery',
      'stale-pending-donations',
      'aggregate-consistency',
      'stuck-recurring-signups',
      'billing-approval-consistency',
      'billing-provisioning-gap',
      'collection-attempt-reconciliation',
      'recurring-payment-reconciliation',
    ];
    const actualNames = jobRunner.list();
    for (const name of expectedNames) {
      assert(actualNames.includes(name), `expected ${name} to be registered`);
    }

    const withoutSchedule = expectedNames.filter((name) => !jobRunner.get(name)?.schedule);
    assert.deepStrictEqual(
      withoutSchedule,
      ['recurring-payment-reconciliation'],
      'expected exactly recurring-payment-reconciliation to have no schedule -- if this fails, either a job lost its approved cadence unnoticed, or recurring-payment-reconciliation regained a schedule before its correlation logic was hardened (see its own file header)'
    );

    const withSchedule = expectedNames.filter((name) => name !== 'recurring-payment-reconciliation');
    for (const name of withSchedule) {
      const schedule = jobRunner.get(name).schedule;
      assert(typeof schedule === 'string' && schedule.trim().length > 0, `expected ${name} to have a real cron schedule string`);
    }
  });

  // ---- The controller's orchestration: the dormant job must produce ------
  // ---- literally zero alerts, no matter how "old" its last activity is --

  await check('cardcom-ops.controller#computeStaleAlerts never flags recurring-payment-reconciliation, even given a very old fake last-success, while it DOES flag a scheduled job in the same run', async () => {
    require('../src/jobs/index');
    const controller = require('../src/modules/platform/cardcom-ops/cardcom-ops.controller');
    const db = require('../src/db/db');

    const now = new Date('2026-09-07T12:00:00Z');
    const veryOld = new Date(now.getTime() - 60 * 24 * 60 * 60_000).toISOString(); // 60 days ago
    const queriedJobNames = [];

    const originalQuery = db.query.bind(db);
    db.query = async (sql, params) => {
      assert(sql.includes('MAX(started_at)'), 'unexpected query shape from computeStaleAlerts');
      queriedJobNames.push(params[0]);
      // Every job "last succeeded" 60 days ago in this fake world -- if the
      // dormant job is nonetheless never flagged, that can only be because
      // it was correctly skipped before ever reaching this query.
      return { rows: [{ last_success: veryOld }] };
    };

    let alerts;
    try {
      alerts = await controller.computeStaleAlerts(now);
    } finally {
      db.query = originalQuery; // restore the real pool method no matter what
    }

    assert(!queriedJobNames.includes('recurring-payment-reconciliation'), 'recurring-payment-reconciliation must never even be queried for staleness -- it has no schedule');
    assert(!alerts.some((a) => a.jobName === 'recurring-payment-reconciliation'), 'recurring-payment-reconciliation must never appear as a stale alert');
    assert(alerts.some((a) => a.jobName === 'aggregate-consistency' && a.type === 'job_stale'), 'a real scheduled job with a 60-day-old last success must still be flagged');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

run();
