// Unit tests for the upgraded stale-pending-donations.job.js (2026-08-31,
// Donation Engine closure WP3): detect-only -> detect-and-repair via
// payment.handler.js#handle (the same function the live webhook uses).
// paymentHandler.handle is monkey-patched (module-cache override, same
// technique as this project's other adapter/job tests) -- no real network
// call, no real DB. db.query is a routing fake keyed on distinctive SQL.
//
// Run: node scripts/test-stale-pending-donations.js

const assert = require('assert');

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

// Clears both caches, requires the job fresh (which populates a fresh
// payment.handler module internally), THEN returns the SAME payment.handler
// module object so the caller can patch .handle on it -- patching before
// re-requiring the job would patch an object the job's own fresh require
// throws away.
function freshJobAndHandler() {
  delete require.cache[require.resolve('../src/modules/payment/handlers/payment.handler')];
  delete require.cache[require.resolve('../src/jobs/stale-pending-donations.job')];
  const job = require('../src/jobs/stale-pending-donations.job');
  const paymentHandler = require('../src/modules/payment/handlers/payment.handler');
  return { job, paymentHandler };
}

function fakeDb({ stalePendingRows = [], missingLowProfileRows = [] } = {}) {
  const findingInserts = [];
  return {
    findingInserts,
    query: async (sql, params) => {
      if (sql.includes('low_profile_id IS NOT NULL')) return { rows: stalePendingRows };
      if (sql.includes('low_profile_id IS NULL')) return { rows: missingLowProfileRows };
      if (sql.includes('INSERT INTO reconciliation_findings')) {
        findingInserts.push({ findingType: params[1], subjectId: params[4] });
        return { rows: [] };
      }
      if (sql.includes('UPDATE reconciliation_findings')) return { rowCount: 0 };
      throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 60));
    },
  };
}

async function run() {
  await check('CardCom shows success -> recovered via payment.handler.js, warning finding recorded', async () => {
    const { job, paymentHandler } = freshJobAndHandler();
    paymentHandler.handle = async (payload) => {
      assert.strictEqual(payload.ReturnValue, 'donation-1');
      assert.strictEqual(payload.LowProfileId, 'lp-1');
      return { outcome: 'paid', donationId: 'donation-1' };
    };
    const db = fakeDb({ stalePendingRows: [{ id: 'donation-1', low_profile_id: 'lp-1', amount: 100 }] });
    const result = await job.handler(db);
    assert.strictEqual(result.recovered, 1);
    assert.strictEqual(db.findingInserts.length, 1);
    assert.strictEqual(db.findingInserts[0].findingType, 'lost_webhook_recovered');
  });

  await check('Gate v1 mismatch -> counted as gateHeld, job does NOT duplicate the finding (payment.handler already recorded it)', async () => {
    const { job, paymentHandler } = freshJobAndHandler();
    paymentHandler.handle = async () => ({ outcome: 'verification_hold', reasons: ['amount_mismatch'] });
    const db = fakeDb({ stalePendingRows: [{ id: 'donation-2', low_profile_id: 'lp-2', amount: 100 }] });
    const result = await job.handler(db);
    assert.strictEqual(result.gateHeld, 1);
    assert.strictEqual(db.findingInserts.length, 0);
  });

  await check('still not paid at CardCom -> counted, no finding, donation stays pending for a later run', async () => {
    const { job, paymentHandler } = freshJobAndHandler();
    paymentHandler.handle = async () => ({ outcome: 'not_paid_at_cardcom' });
    const db = fakeDb({ stalePendingRows: [{ id: 'donation-3', low_profile_id: 'lp-3', amount: 100 }] });
    const result = await job.handler(db);
    assert.strictEqual(result.stillPendingAtCardcom, 1);
    assert.strictEqual(db.findingInserts.length, 0);
  });

  await check('race: already paid by something else -> no-op, counted separately', async () => {
    const { job, paymentHandler } = freshJobAndHandler();
    paymentHandler.handle = async () => ({ outcome: 'already_paid' });
    const db = fakeDb({ stalePendingRows: [{ id: 'donation-4', low_profile_id: 'lp-4', amount: 100 }] });
    const result = await job.handler(db);
    assert.strictEqual(result.alreadyPaid, 1);
  });

  await check('payment.handler.js throws (transport error) -> lookup_failed finding, no crash', async () => {
    const { job, paymentHandler } = freshJobAndHandler();
    paymentHandler.handle = async () => { throw new Error('CardCom down'); };
    const db = fakeDb({ stalePendingRows: [{ id: 'donation-5', low_profile_id: 'lp-5', amount: 100 }] });
    const result = await job.handler(db);
    assert.strictEqual(result.lookupFailed, 1);
    assert.strictEqual(db.findingInserts[0].findingType, 'lookup_failed');
  });

  await check('donation with no low_profile_id at all -> surfaced as a finding for human review, never guessed', async () => {
    const { job, paymentHandler } = freshJobAndHandler();
    let handleCalled = false;
    paymentHandler.handle = async () => { handleCalled = true; return { outcome: 'paid' }; };
    const db = fakeDb({ missingLowProfileRows: [{ id: 'donation-6' }] });
    const result = await job.handler(db);
    assert.strictEqual(result.missingLowProfileIdFound, 1);
    assert.strictEqual(handleCalled, false); // never attempted -- there's no key to look up
    assert.strictEqual(db.findingInserts[0].findingType, 'pending_donation_missing_low_profile_id');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
