// Real-DB functional test for billing-setup-notification.service.js
// (migration 062's dedup UNIQUE constraint + the user_entities/users admin
// resolution join) — deliberately real Postgres, not a mock, so the actual
// UNIQUE (entity_id, billing_period_id, blocking_reason) constraint and the
// real ue.role = 'owner' filter are proven against the live schema, not a
// hand-written fake of it.
//
// Everything created here is throwaway and fully deleted at the end
// (verified by re-querying): one billing_period far in the future (2099,
// cannot overlap the real August 2026 period), one entity, three users,
// three user_entities rows, and whatever billing_setup_notifications rows
// this test itself inserts. No donations, no billing_accounts, no
// statements, no statement_components are ever created here — this test
// never calls calculateAccountStatement/runProductionCalculation, so it
// never touches the append-only tables (statement_components/payments) or
// the undeletable-once-paid donations row (migration 055) that would make
// cleanup impossible.
//
// emailService.queue is mocked (require.cache override) so this test never
// attempts a real send regardless of EMAIL_ENABLED/EMAIL_PROVIDER.
//
// Run: node scripts/test-billing-setup-notification-dedup.js

require('dotenv').config();
const assert = require('assert');
const pool = require('../src/db/db');

let failures = 0;
let passed = 0;

function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log(`PASS  ${name}`); })
    .catch((err) => { failures++; console.log(`FAIL  ${name}`); console.log('      ', err.stack || err.message); });
}

const emailPath = require.resolve('../src/modules/email/email.service');
const fakeEmail = { calls: [], queue: (payload) => { fakeEmail.calls.push(payload); } };
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: fakeEmail };
const notifications = require('../src/modules/billing-engine/billing-setup-notification.service');

const RUN_TAG = `zzz-test-billing-readiness-${Date.now()}`;
const ids = { userOwner: null, userManager: null, userInactiveOwner: null, entityId: null, periodId: null };

async function setup() {
  const owner = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (2, $1, 'ZZZ Test Owner', true) RETURNING id`,
    [`${RUN_TAG}-owner@example.invalid`]
  );
  ids.userOwner = owner.rows[0].id;

  const manager = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (2, $1, 'ZZZ Test Manager', true) RETURNING id`,
    [`${RUN_TAG}-manager@example.invalid`]
  );
  ids.userManager = manager.rows[0].id;

  const inactiveOwner = await pool.query(
    `INSERT INTO users (role_id, email, full_name, is_active) VALUES (2, $1, 'ZZZ Test Inactive Owner', false) RETURNING id`,
    [`${RUN_TAG}-inactive-owner@example.invalid`]
  );
  ids.userInactiveOwner = inactiveOwner.rows[0].id;

  const entity = await pool.query(
    `INSERT INTO entities (display_name, status, created_by_user_id) VALUES ($1, 'active', $2) RETURNING id`,
    ['ZZZ_TEST_BILLING_READINESS_DO_NOT_USE', ids.userOwner]
  );
  ids.entityId = entity.rows[0].id;

  await pool.query(
    `INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`,
    [ids.userOwner, ids.entityId]
  );
  await pool.query(
    `INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'manager')`,
    [ids.userManager, ids.entityId]
  );
  await pool.query(
    `INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')`,
    [ids.userInactiveOwner, ids.entityId]
  );

  const period = await pool.query(
    `INSERT INTO billing_periods (period_start, period_end) VALUES ('2099-01-01T00:00:00Z', '2099-02-01T00:00:00Z') RETURNING id`
  );
  ids.periodId = period.rows[0].id;
}

async function cleanup() {
  await pool.query(`DELETE FROM billing_setup_notifications WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM user_entities WHERE entity_id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM entities WHERE id = $1`, [ids.entityId]);
  await pool.query(`DELETE FROM billing_periods WHERE id = $1`, [ids.periodId]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::bigint[])`, [[ids.userOwner, ids.userManager, ids.userInactiveOwner]]);
}

async function verifyZeroResidue() {
  const notif = await pool.query(`SELECT count(*)::int AS n FROM billing_setup_notifications WHERE entity_id = $1`, [ids.entityId]);
  const ue = await pool.query(`SELECT count(*)::int AS n FROM user_entities WHERE entity_id = $1`, [ids.entityId]);
  const ent = await pool.query(`SELECT count(*)::int AS n FROM entities WHERE id = $1`, [ids.entityId]);
  const per = await pool.query(`SELECT count(*)::int AS n FROM billing_periods WHERE id = $1`, [ids.periodId]);
  const usr = await pool.query(`SELECT count(*)::int AS n FROM users WHERE id = ANY($1::bigint[])`, [[ids.userOwner, ids.userManager, ids.userInactiveOwner]]);
  assert.strictEqual(notif.rows[0].n, 0, 'billing_setup_notifications residue');
  assert.strictEqual(ue.rows[0].n, 0, 'user_entities residue');
  assert.strictEqual(ent.rows[0].n, 0, 'entities residue');
  assert.strictEqual(per.rows[0].n, 0, 'billing_periods residue');
  assert.strictEqual(usr.rows[0].n, 0, 'users residue');
}

async function main() {
  await setup();
  try {
    await check('resolveEntityAdmins: only active owner is returned (not manager, not inactive owner)', async () => {
      const admins = await notifications.resolveEntityAdmins(ids.entityId);
      assert.strictEqual(admins.length, 1);
      assert.strictEqual(admins[0].id, ids.userOwner);
    });

    await check('notifyBillingSetupRequired: first call inserts + queues email to the resolved owner', async () => {
      const result = await notifications.notifyBillingSetupRequired({
        entityId: ids.entityId, entityName: 'ZZZ_TEST_BILLING_READINESS_DO_NOT_USE',
        billingPeriodId: ids.periodId, blockingReason: 'no_billing_account',
        donationCount: 3, grossAmount: '150.00',
      });
      assert.strictEqual(result.sent, true);
      assert.strictEqual(result.adminCount, 1);
      assert.strictEqual(fakeEmail.calls.length, 1);
      assert.strictEqual(fakeEmail.calls[0].to, `${RUN_TAG}-owner@example.invalid`);

      const row = await pool.query(
        `SELECT donation_count, gross_amount, notified_admin_count FROM billing_setup_notifications
         WHERE entity_id = $1 AND billing_period_id = $2 AND blocking_reason = 'no_billing_account'`,
        [ids.entityId, ids.periodId]
      );
      assert.strictEqual(row.rows.length, 1);
      assert.strictEqual(row.rows[0].donation_count, 3);
      assert.strictEqual(row.rows[0].notified_admin_count, 1);
    });

    await check('notifyBillingSetupRequired: repeat call for same (entity, period, reason) is deduped', async () => {
      fakeEmail.calls.length = 0;
      const result = await notifications.notifyBillingSetupRequired({
        entityId: ids.entityId, entityName: 'ZZZ_TEST_BILLING_READINESS_DO_NOT_USE',
        billingPeriodId: ids.periodId, blockingReason: 'no_billing_account',
        donationCount: 4, grossAmount: '999.00', // different snapshot values -- dedup must key on (entity,period,reason), not values
      });
      assert.strictEqual(result.sent, false);
      assert.strictEqual(result.reason, 'already_notified');
      assert.strictEqual(fakeEmail.calls.length, 0);

      const count = await pool.query(
        `SELECT count(*)::int AS n FROM billing_setup_notifications
         WHERE entity_id = $1 AND billing_period_id = $2 AND blocking_reason = 'no_billing_account'`,
        [ids.entityId, ids.periodId]
      );
      assert.strictEqual(count.rows[0].n, 1, 'must still be exactly one row -- no duplicate notification record');
    });

    await check('notifyBillingSetupRequired: a different blocking_reason is a genuinely new notification', async () => {
      fakeEmail.calls.length = 0;
      const result = await notifications.notifyBillingSetupRequired({
        entityId: ids.entityId, entityName: 'ZZZ_TEST_BILLING_READINESS_DO_NOT_USE',
        billingPeriodId: ids.periodId, blockingReason: 'account_suspended',
        donationCount: 3, grossAmount: '150.00',
      });
      assert.strictEqual(result.sent, true);
      assert.strictEqual(fakeEmail.calls.length, 1);
    });
  } finally {
    await cleanup();
    await verifyZeroResidue();
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  console.log('Fixture cleanup verified: zero residue for entity/period/users created by this test.');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('Test run crashed:', err);
  try { await cleanup(); await verifyZeroResidue(); console.log('Cleanup completed despite crash.'); }
  catch (cleanupErr) { console.error('CLEANUP ALSO FAILED -- manual cleanup required for', ids, cleanupErr); }
  process.exit(1);
});
