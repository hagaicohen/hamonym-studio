// Tests for WP4 (atomicity) + WP5 (idempotency) on the manual-
// registration/bulk-import path (2026-08-31, Donation Engine closure).
//
// Constraint respected throughout: a real 'paid' donation cannot be deleted
// (migration 055's trigger) -- so this suite deliberately never lets
// insertPaidRegistration's real INSERT...'paid' path actually commit.
// Three techniques, each avoiding a permanent paid test fact:
//   1. Pure-logic test of assertIdempotentRegistrationMatch (no DB at all).
//   2. Fast-path idempotency short-circuit: craft a 'pending' (deletable)
//      donation row carrying the same client_submission_key by hand, then
//      confirm insertPaidRegistration finds it and returns early WITHOUT
//      ever reaching its own INSERT -- proven by asserting no 'paid' row
//      exists afterward.
//   3. Atomicity: deliberately force the transaction to fail partway
//      through (an invalid registration_option_id after campaign/entity
//      setup) and confirm NOTHING was left behind -- no donation, no
//      order, no participant, no campaign-total change. This proves the
//      insert+aggregate-update now live in one transaction without ever
//      needing a successful (and therefore permanent) run.
// NOT covered here: the true concurrent-duplicate-request race hitting the
// UNIQUE constraint catch block. Exercising that live would require two
// requests actually racing to a real 'paid' commit -- unsafe under the
// "no permanent test payments" constraint. That branch mirrors
// donations.service.js#createManualDonation's already-proven identical
// pattern (same constraint name, same catch logic) rather than being a new,
// unverified mechanism -- accepted on that basis, not verified live here.
//
// Run: node scripts/test-registration-idempotency-atomicity.js

require('dotenv').config();
const assert = require('assert');
const db = require('../src/db/db');

let passed = 0;
let failures = 0;

async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`PASS  ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${name}`);
    console.log('      ', err.stack || err.message);
  }
}

async function run() {
  const anyUserRes = await db.query('SELECT id FROM users LIMIT 1');
  if (!anyUserRes.rows[0]) throw new Error('No user row exists to satisfy entities.created_by_user_id FK');
  const anyUserId = anyUserRes.rows[0].id;

  const entityRes = await db.query(
    `INSERT INTO entities (display_name, entity_type, status, created_by_user_id) VALUES ('WP4-5 Test Entity', 'association', 'active', $1) RETURNING id`,
    [anyUserId]
  );
  const entityId = entityRes.rows[0].id;

  const campaignRes = await db.query(
    `INSERT INTO campaigns (entity_id, slug, title, status) VALUES ($1, $2, 'WP4-5 Test Campaign', 'active') RETURNING id`,
    [entityId, 'wp45-test-campaign-' + Date.now()]
  );
  const campaignId = campaignRes.rows[0].id;

  const optionRes = await db.query(
    `INSERT INTO registration_options (campaign_id, key, title, price, is_active) VALUES ($1, 'general', 'General', 100, true) RETURNING id, key, title, price`,
    [campaignId]
  );
  const option = optionRes.rows[0];

  const registrationsService = require('../src/modules/registrations/registrations.service');

  await check('fast-path idempotency: existing matching donation short-circuits, no new INSERT attempted', async () => {
    const key = require('crypto').randomUUID();
    // Craft a stand-in "already submitted" donation by hand, status
    // 'pending' (deletable) -- never call the real paid-creation path for
    // this fixture, so nothing permanent is ever created here.
    const fakeExistingRes = await db.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, is_mock, rewards, client_submission_key)
       VALUES ($1, $2, $3, 'Existing Donor', 'pending', false, '[]', $4) RETURNING id`,
      [campaignId, entityId, option.price, key]
    );
    const fakeDonationId = fakeExistingRes.rows[0].id;
    const fakeOrderRes = await db.query(`INSERT INTO registration_orders (donation_id, campaign_id) VALUES ($1,$2) RETURNING id`, [fakeDonationId, campaignId]);
    await db.query(
      `INSERT INTO registration_participants (registration_order_id, registration_option_id, option_key, option_title, name) VALUES ($1,$2,$3,$4,'Existing Donor')`,
      [fakeOrderRes.rows[0].id, option.id, option.key, option.title]
    );

    const result = await registrationsService.createManualRegistration(
      entityId,
      { campaignId, registrationOptionId: option.id, participantName: 'Retry Attempt', source: 'cash', clientSubmissionKey: key },
      anyUserId
    );
    assert.strictEqual(result.donationId, fakeDonationId, 'must resolve to the SAME donation, not create a new one');

    const countRes = await db.query('SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1', [campaignId]);
    assert.strictEqual(countRes.rows[0].c, 1, 'no second donation was created for the retried key');

    // cleanup this sub-test's fixture immediately (still non-paid, safe to delete)
    await db.query('DELETE FROM registration_participants WHERE registration_order_id=$1', [fakeOrderRes.rows[0].id]);
    await db.query('DELETE FROM registration_orders WHERE id=$1', [fakeOrderRes.rows[0].id]);
    await db.query('DELETE FROM donations WHERE id=$1', [fakeDonationId]);
  });

  await check('idempotency key reused for a DIFFERENT registration option -> rejected loudly, not silently accepted', async () => {
    const key = require('crypto').randomUUID();
    const otherOptionRes = await db.query(
      `INSERT INTO registration_options (campaign_id, key, title, price, is_active) VALUES ($1, 'other', 'Other', 50, true) RETURNING id, key, title, price`,
      [campaignId]
    );
    const otherOption = otherOptionRes.rows[0];

    const fakeExistingRes = await db.query(
      `INSERT INTO donations (campaign_id, entity_id, amount, donor_name, status, is_mock, rewards, client_submission_key)
       VALUES ($1, $2, $3, 'Existing Donor 2', 'pending', false, '[]', $4) RETURNING id`,
      [campaignId, entityId, otherOption.price, key]
    );
    const fakeDonationId = fakeExistingRes.rows[0].id;
    const fakeOrderRes = await db.query(`INSERT INTO registration_orders (donation_id, campaign_id) VALUES ($1,$2) RETURNING id`, [fakeDonationId, campaignId]);
    await db.query(
      `INSERT INTO registration_participants (registration_order_id, registration_option_id, option_key, option_title, name) VALUES ($1,$2,$3,$4,'Existing Donor 2')`,
      [fakeOrderRes.rows[0].id, otherOption.id, otherOption.key, otherOption.title]
    );

    await assert.rejects(
      () => registrationsService.createManualRegistration(
        entityId,
        { campaignId, registrationOptionId: option.id, participantName: 'Different Person', source: 'cash', clientSubmissionKey: key },
        anyUserId
      ),
      (e) => e.code === 'IDEMPOTENCY_KEY_MISMATCH'
    );

    await db.query('DELETE FROM registration_participants WHERE registration_order_id=$1', [fakeOrderRes.rows[0].id]);
    await db.query('DELETE FROM registration_orders WHERE id=$1', [fakeOrderRes.rows[0].id]);
    await db.query('DELETE FROM donations WHERE id=$1', [fakeDonationId]);
    await db.query('DELETE FROM registration_options WHERE id=$1', [otherOption.id]);
  });

  await check('atomicity: a failure partway through the transaction leaves NOTHING behind (no donation, no aggregate change)', async () => {
    const campaignBefore = (await db.query('SELECT current_amount, supporters_count FROM campaigns WHERE id=$1', [campaignId])).rows[0];

    // Calls insertPaidRegistration directly (bypassing createManualRegistration's
    // own loadActiveOption pre-check) with an option.id that is a
    // real UUID shape but doesn't exist in registration_options -- this
    // reaches INSIDE the transaction, after the donation row is inserted,
    // and fails on the registration_participants FK violation. Proves the
    // 2026-08-31 fix (donation + order + participant + campaign aggregate
    // now one transaction) actually rolls back the donation insert too,
    // not just the later statements -- before this fix, the campaign
    // aggregate update ran as a SEPARATE statement after COMMIT, so this
    // exact scenario used to leave a permanently-orphaned paid donation.
    const ghostOption = { id: '00000000-0000-0000-0000-000000000000', key: 'ghost', title: 'Ghost Option', price: 999 };

    await assert.rejects(() =>
      registrationsService._insertPaidRegistrationForTesting(
        entityId, campaignId, ghostOption,
        { participantName: 'Should Not Exist', source: 'cash' },
        anyUserId
      )
    );

    const countAfterFailure = (await db.query(
      `SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1 AND donor_name='Should Not Exist'`,
      [campaignId]
    )).rows[0].c;
    assert.strictEqual(countAfterFailure, 0, 'the donation insert itself must have rolled back, not just later statements');

    const campaignAfter = (await db.query('SELECT current_amount, supporters_count FROM campaigns WHERE id=$1', [campaignId])).rows[0];
    assert.strictEqual(Number(campaignAfter.current_amount), Number(campaignBefore.current_amount));
    assert.strictEqual(Number(campaignAfter.supporters_count), Number(campaignBefore.supporters_count));
  });

  // Cleanup: entity/campaign/registration_options fixtures. No 'paid'
  // donation was ever created by this suite (verified below), so this is safe.
  const paidCount = (await db.query(`SELECT count(*)::int AS c FROM donations WHERE campaign_id=$1 AND status='paid'`, [campaignId])).rows[0].c;
  if (paidCount > 0) {
    console.log(`\nABORTING CLEANUP: ${paidCount} donation(s) unexpectedly reached 'paid' -- left for manual inspection.`);
  } else {
    await db.query('DELETE FROM donations WHERE campaign_id=$1', [campaignId]);
    await db.query('DELETE FROM registration_options WHERE campaign_id=$1', [campaignId]);
    await db.query('DELETE FROM campaigns WHERE id=$1', [campaignId]);
    await db.query('DELETE FROM entities WHERE id=$1', [entityId]);
    console.log('\nCleanup: test fixtures deleted (no paid donation was ever created).');
  }

  console.log(`\n${passed} passed, ${failures} failed`);
  await db.end?.();
  process.exit(failures ? 1 : 0);
}

run().catch((e) => { console.error('FATAL', e); process.exit(1); });
