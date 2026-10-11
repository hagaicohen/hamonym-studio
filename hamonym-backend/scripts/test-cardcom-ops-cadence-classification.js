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
const { checkStaleness, intervalMsFor, mostRecentWindowStart } = require('../src/jobs/schedule-window');

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

  // ---- Explicit per-job staleness policy (`staleAfterMs`, 2026-10-11) ------
  // The false-positive this fixes: billing-monthly-cycle's '0 * 28 * *' is
  // hourly-within-day-28, so intervalMsFor() reports 1 hour and the generic
  // 2x tolerance called the job stale on every one of the ~29 days between
  // real runs. Reproduced against the live DB as
  // {"stale":true,"msSinceLastSuccess":1096862980,"intervalMs":3600000}.

  const MONTHLY_CYCLE_SCHEDULE = '0 * 28 * *';
  const MONTHLY_CYCLE_STALE_AFTER_MS = 35 * 24 * 60 * 60 * 1000;

  await check('REGRESSION: a job with NO staleAfterMs keeps the exact cadence-derived threshold (2x intervalMs) -- boundary asserted on both sides, not just "not stale"', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const job = { name: 'x', schedule: '0 * * * *' }; // hourly -> intervalMs 3600000, threshold 7200000
    const justInside = await checkStaleness(fakeDbLastSuccess(new Date(now.getTime() - 7_200_000).toISOString()), job, now);
    assert.strictEqual(justInside.intervalMs, 3_600_000);
    assert.strictEqual(justInside.thresholdMs, 7_200_000, 'threshold must still be 2x the schedule-derived interval');
    assert.strictEqual(justInside.stale, false, 'exactly 2x must still be NOT stale (strictly-greater comparison, unchanged)');

    const justOutside = await checkStaleness(fakeDbLastSuccess(new Date(now.getTime() - 7_200_001).toISOString()), job, now);
    assert.strictEqual(justOutside.stale, true, 'one ms past 2x must still be stale -- the old comparison, untouched');
  });

  await check('REGRESSION: an explicit toleranceMultiplier still applies to a job without staleAfterMs', async () => {
    const now = new Date('2026-09-07T12:00:00Z');
    const job = { name: 'x', schedule: '0 * * * *' };
    const db = fakeDbLastSuccess(new Date(now.getTime() - 4 * 3_600_000).toISOString());
    assert.strictEqual((await checkStaleness(db, job, now, 2)).stale, true);
    assert.strictEqual((await checkStaleness(db, job, now, 5)).stale, false, 'the multiplier path must behave exactly as before');
  });

  await check('billing-monthly-cycle WITHOUT the fix would be stale -- the bug this change removes, proven by running the same job object minus staleAfterMs', async () => {
    const now = new Date('2026-10-11T12:00:00Z');
    const jobBefore = { name: 'billing-monthly-cycle', schedule: MONTHLY_CYCLE_SCHEDULE };
    const db = fakeDbLastSuccess(new Date('2026-09-28T23:00:51Z').toISOString()); // the real last success
    const { stale, intervalMs } = await checkStaleness(db, jobBefore, now);
    assert.strictEqual(intervalMs, 3_600_000, 'the cron-derived interval really is 1 hour -- that is the root cause');
    assert.strictEqual(stale, true, 'pre-fix behavior: a healthy monthly job reported stale');
  });

  // Several points across the ~29-day quiet stretch, not one convenient date.
  for (const [label, nowIso] of [
    ['1 hour after the last day-28 run', '2026-09-29T00:00:00Z'],
    ['2 days after', '2026-09-30T23:00:00Z'],
    ['~1 week after', '2026-10-05T12:00:00Z'],
    ['~2 weeks after (the real reproduction date)', '2026-10-11T12:00:00Z'],
    ['~3 weeks after', '2026-10-19T06:30:00Z'],
    ['the day before the next run window opens', '2026-10-27T23:59:00Z'],
    ['the next day-28 window, before that day\'s first run lands', '2026-10-28T00:00:00Z'],
  ]) {
    await check(`billing-monthly-cycle with staleAfterMs: NOT stale ${label} (${nowIso})`, async () => {
      const now = new Date(nowIso);
      const job = { name: 'billing-monthly-cycle', schedule: MONTHLY_CYCLE_SCHEDULE, staleAfterMs: MONTHLY_CYCLE_STALE_AFTER_MS };
      const db = fakeDbLastSuccess(new Date('2026-09-28T23:00:51Z').toISOString());
      const { stale, thresholdMs } = await checkStaleness(db, job, now);
      assert.strictEqual(thresholdMs, MONTHLY_CYCLE_STALE_AFTER_MS, 'the explicit policy must be the threshold, NOT multiplied by toleranceMultiplier');
      assert.strictEqual(stale, false, `must not be stale ${label}`);
    });
  }

  await check('billing-monthly-cycle: the worst LEGITIMATE gap (Jan 28 00:00 -> Feb 28 23:00, 31d23h) is still NOT stale -- this is why 35 days, not 31', async () => {
    const lastSuccess = new Date('2027-01-28T00:00:00Z');
    const now = new Date('2027-02-28T23:00:00Z');
    const gapMs = now.getTime() - lastSuccess.getTime();
    assert.strictEqual(gapMs, (31 * 24 + 23) * 3_600_000, 'sanity: this fixture really is 31d23h');
    assert(gapMs < MONTHLY_CYCLE_STALE_AFTER_MS, 'the chosen threshold must sit above the worst legitimate gap');
    const job = { name: 'billing-monthly-cycle', schedule: MONTHLY_CYCLE_SCHEDULE, staleAfterMs: MONTHLY_CYCLE_STALE_AFTER_MS };
    const { stale } = await checkStaleness(fakeDbLastSuccess(lastSuccess.toISOString()), job, now);
    assert.strictEqual(stale, false);
  });

  await check('billing-monthly-cycle: a genuinely MISSED month IS stale -- 28 Sep succeeded, all of 28 Oct missed, evaluated 4 Nov', async () => {
    const job = { name: 'billing-monthly-cycle', schedule: MONTHLY_CYCLE_SCHEDULE, staleAfterMs: MONTHLY_CYCLE_STALE_AFTER_MS };
    const db = fakeDbLastSuccess(new Date('2026-09-28T23:00:51Z').toISOString());
    const { stale, msSinceLastSuccess } = await checkStaleness(db, job, new Date('2026-11-04T12:00:00Z'));
    assert(msSinceLastSuccess > MONTHLY_CYCLE_STALE_AFTER_MS, 'sanity: this fixture really is past 35 days');
    assert.strictEqual(stale, true, 'a real missed month must still alert -- the fix must not silence the condition it exists for');
  });

  await check('billing-monthly-cycle: a missed month is reported well before the NEXT day-28 opportunity (not "silent until it fixes itself")', async () => {
    const job = { name: 'billing-monthly-cycle', schedule: MONTHLY_CYCLE_SCHEDULE, staleAfterMs: MONTHLY_CYCLE_STALE_AFTER_MS };
    const db = fakeDbLastSuccess(new Date('2026-09-28T23:00:51Z').toISOString());
    const firesBy = new Date('2026-11-03T00:00:00Z'); // 35d after 28 Sep 23:00 is 2 Nov 23:00
    assert.strictEqual((await checkStaleness(db, job, firesBy)).stale, true);
    const nextOpportunity = new Date('2026-11-28T00:00:00Z');
    assert(firesBy < nextOpportunity, 'the alert must land weeks before day 28 comes round again');
  });

  await check('billing-monthly-cycle: never-succeeded is still stale even with an explicit staleAfterMs', async () => {
    const job = { name: 'billing-monthly-cycle', schedule: MONTHLY_CYCLE_SCHEDULE, staleAfterMs: MONTHLY_CYCLE_STALE_AFTER_MS };
    const { stale, msSinceLastSuccess } = await checkStaleness(fakeDbLastSuccess(null), job, new Date('2026-10-11T12:00:00Z'));
    assert.strictEqual(stale, true);
    assert.strictEqual(msSinceLastSuccess, null);
  });

  await check('the override is a generic per-job field, not a name special-case: schedule-window.js never mentions any job name', async () => {
    const source = require('fs').readFileSync(require('path').join(__dirname, '../src/jobs/schedule-window.js'), 'utf8');
    const code = source.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert(!/billing-monthly-cycle/.test(code), 'checkStaleness must not special-case a job name in executable code');
    assert(/staleAfterMs/.test(code), 'the override must be read from the job object');
  });

  await check('the override generalizes: ANY job declaring staleAfterMs gets it, with the same dense-within-a-rare-window shape', async () => {
    // A hypothetical future job: every 5 minutes, but only on day-of-month 1.
    const now = new Date('2026-10-11T12:00:00Z');
    const job = { name: 'hypothetical-future-job', schedule: '*/5 * 1 * *', staleAfterMs: 35 * 24 * 60 * 60 * 1000 };
    const db = fakeDbLastSuccess(new Date('2026-10-01T23:55:00Z').toISOString());
    const derived = intervalMsFor(job.schedule, mostRecentWindowStart(job.schedule, now));
    assert.strictEqual(derived, 300_000, 'sanity: the cron-derived interval is 5 minutes, same failure shape');
    assert.strictEqual((await checkStaleness(db, job, now)).stale, false, 'the field alone fixes it -- no change to checkStaleness for each new job');
  });

  await check('NO SIDE EFFECTS: every currently-registered scheduled job keeps its exact intervalMsFor()-derived value, and its threshold is still 2x it (billing-monthly-cycle alone excepted, by explicit policy)', async () => {
    require('../src/jobs/index');
    const jobRunner = require('../src/jobs/job-runner');
    const now = new Date('2026-10-11T12:07:00Z');

    // Frozen snapshot, captured from the real registry: if any of these
    // changes, this fix (or a schedule edit) altered another job's cadence
    // math, which it must never do.
    const EXPECTED_INTERVAL_MS = {
      'webhook-recovery': 900_000,
      'stale-pending-donations': 3_600_000,
      'aggregate-consistency': 86_400_000,
      'stuck-recurring-signups': 3_600_000,
      'collection-attempt-reconciliation': 3_600_000,
      'billing-monthly-cycle': 3_600_000,
      'email-dispatch-recovery': 600_000,
      'operational-alerting': 900_000,
    };

    const scheduled = jobRunner.list().filter((n) => jobRunner.get(n)?.schedule);
    assert.deepStrictEqual(
      scheduled.slice().sort(),
      Object.keys(EXPECTED_INTERVAL_MS).slice().sort(),
      'the set of scheduled jobs changed -- update this snapshot deliberately, do not let it drift'
    );

    for (const name of scheduled) {
      const job = jobRunner.get(name);
      const derived = intervalMsFor(job.schedule, mostRecentWindowStart(job.schedule, now));
      assert.strictEqual(derived, EXPECTED_INTERVAL_MS[name], `${name}: schedule-derived interval changed`);

      const { thresholdMs, intervalMs } = await checkStaleness(fakeDbLastSuccess(now.toISOString()), job, now);
      assert.strictEqual(intervalMs, EXPECTED_INTERVAL_MS[name], `${name}: reported intervalMs changed`);

      if (name === 'billing-monthly-cycle') {
        assert.strictEqual(thresholdMs, MONTHLY_CYCLE_STALE_AFTER_MS, 'billing-monthly-cycle is the one deliberate exception');
      } else {
        assert.strictEqual(thresholdMs, derived * 2, `${name}: threshold must remain 2x its own interval -- no job but billing-monthly-cycle may change`);
        assert.strictEqual(job.staleAfterMs, undefined, `${name} must not have gained a staleAfterMs`);
      }
    }
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
