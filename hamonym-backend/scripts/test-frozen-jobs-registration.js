// Proves the Billing v1 simplicity decision (2026-09-10, corrected same
// day): only the two Billing Engine observer jobs are frozen -- schedule
// set to null so cron-entry.js's loop skips them
// (`if (!job?.schedule) continue`), while staying fully registered and
// runnable on demand via the Admin "Run now" action. The two Donation
// Engine safeguards initially frozen alongside them (aggregate-consistency,
// stuck-recurring-signups) were restored to their explicit Approved
// production schedules (Operational Policy, 2026-08-16) -- the simplicity
// initiative applies to Billing v1's own observer complexity, never to an
// already-proven Donation Engine safeguard. No DB access needed -- this
// only inspects the real job registry, the same one cron-entry.js and the
// Admin routes both use.
//
// Run: node scripts/test-frozen-jobs-registration.js

require('dotenv').config();
const assert = require('assert');
require('../src/jobs/index'); // side effect: populates the real job registry
const jobRunner = require('../src/jobs/job-runner');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const FROZEN_BILLING_JOBS = ['billing-approval-consistency', 'billing-provisioning-gap'];
const RESTORED_DONATION_JOBS = ['aggregate-consistency', 'stuck-recurring-signups'];

async function main() {
  for (const name of FROZEN_BILLING_JOBS) {
    await check(`${name}: still registered (manually runnable via Admin "Run now")`, async () => {
      const job = jobRunner.get(name);
      assert.ok(job, `${name} must still be registered -- freezing must not delete its implementation`);
      assert.strictEqual(typeof job.handler, 'function', `${name} must still have a real handler`);
    });

    await check(`${name}: schedule is falsy -- cron-entry.js's loop (\`if (!job?.schedule) continue\`) will skip it`, async () => {
      const job = jobRunner.get(name);
      assert.ok(!job.schedule, `${name}.schedule must be null/falsy to be skipped by the cron loop`);
    });
  }

  for (const name of RESTORED_DONATION_JOBS) {
    await check(`${name}: remains scheduled -- a Donation Engine safeguard, not Billing v1 observer complexity, must not be frozen`, async () => {
      const job = jobRunner.get(name);
      assert.ok(job, `${name} must still be registered`);
      assert.ok(job.schedule, `${name}.schedule must be a real cron expression, not frozen`);
    });
  }

  await check('an un-frozen Billing job (billing-monthly-cycle) still has a real schedule -- freezing the two observer jobs did not accidentally freeze a third', async () => {
    const job = jobRunner.get('billing-monthly-cycle');
    assert.ok(job?.schedule, 'billing-monthly-cycle must keep its real cron schedule');
  });

  await check('jobRunner.list() still contains all four job names (frozen and restored alike)', async () => {
    const names = jobRunner.list();
    for (const name of [...FROZEN_BILLING_JOBS, ...RESTORED_DONATION_JOBS]) {
      assert.ok(names.includes(name), `${name} missing from jobRunner.list()`);
    }
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
