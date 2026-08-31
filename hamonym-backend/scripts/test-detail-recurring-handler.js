// Regression tests for detail-recurring.handler.js after the 2026-08-31
// refactor (Donation Engine closure WP2/WP4) that extracted its SUCCESSFUL
// branch into the shared donations.service.js#finalizeSuccessfulRecurringCharge
// primitive. Confirms the pre-existing dedup guard and failure-recording
// behavior are unchanged, and that a SUCCESSFUL webhook still calls the
// shared finalize function with the right arguments exactly once.
//
// db.query is monkey-patched (module-level pool object, mutable) and
// donationsService.finalizeSuccessfulRecurringCharge is mocked -- no real
// DB, no real donation ever created.
//
// Run: node scripts/test-detail-recurring-handler.js

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

const INSTRUCTION_ROW = { id: 'instr-1', entity_id: 'entity-1', campaign_id: 'campaign-1', donor_name: 'Donor', donor_email: 'd@example.test', donor_phone: '050', amount: 100 };

function fakeDb({ instructionExists = true, existingDonation = false } = {}) {
  const inserts = [];
  return {
    inserts,
    query: async (sql, params) => {
      if (sql.includes('FROM recurring_instructions')) {
        return { rows: instructionExists ? [INSTRUCTION_ROW] : [] };
      }
      if (sql.includes('SELECT id FROM donations WHERE recurring_instruction_id')) {
        return { rows: existingDonation ? [{ id: 'already-there' }] : [] };
      }
      if (sql.includes('INSERT INTO donations')) {
        inserts.push(params);
        return { rows: [] };
      }
      throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 60));
    },
  };
}

function freshHandler(fakeDbInstance) {
  const dbId = require.resolve('../src/db/db');
  delete require.cache[dbId];
  require.cache[dbId] = { id: dbId, filename: dbId, loaded: true, exports: fakeDbInstance };

  delete require.cache[require.resolve('../src/modules/donations/donations.service')];
  delete require.cache[require.resolve('../src/modules/payment/handlers/detail-recurring.handler')];
  return require('../src/modules/payment/handlers/detail-recurring.handler');
}

async function run() {
  await check('missing RecurringId/InternalDealNumber -> no-op, no DB query at all', async () => {
    const db = fakeDb();
    const handler = freshHandler(db);
    await handler.handle({ Status: 'SUCCESSFUL' });
    assert.strictEqual(db.inserts.length, 0);
  });

  await check('unknown RecurringId (no matching instruction) -> no-op', async () => {
    const db = fakeDb({ instructionExists: false });
    const handler = freshHandler(db);
    await handler.handle({ RecurringId: 999, InternalDealNumber: '1', Status: 'SUCCESSFUL' });
    assert.strictEqual(db.inserts.length, 0);
  });

  await check('duplicate delivery (existing donation for this instruction+InternalDealNumber) -> no-op, pre-existing dedup guard unchanged', async () => {
    const db = fakeDb({ existingDonation: true });
    const handler = freshHandler(db);
    const donationsService = require('../src/modules/donations/donations.service');
    let finalizeCalled = false;
    donationsService.finalizeSuccessfulRecurringCharge = async () => { finalizeCalled = true; };
    await handler.handle({ RecurringId: 24290, InternalDealNumber: '60158438', Status: 'SUCCESSFUL', Sum: '100' });
    assert.strictEqual(finalizeCalled, false);
  });

  await check('SUCCESSFUL -> calls the shared finalizeSuccessfulRecurringCharge exactly once with the right args', async () => {
    const db = fakeDb();
    const handler = freshHandler(db);
    const donationsService = require('../src/modules/donations/donations.service');
    const calls = [];
    donationsService.finalizeSuccessfulRecurringCharge = async (instruction, args) => { calls.push({ instruction, args }); };

    await handler.handle({ RecurringId: 24290, InternalDealNumber: '60158438', Status: 'SUCCESSFUL', Sum: '100', RowID: '141286', ResposeCode: 0 });

    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].instruction.id, 'instr-1');
    assert.strictEqual(calls[0].args.amount, '100');
    assert.strictEqual(calls[0].args.providerReference, '60158438');
    assert.strictEqual(calls[0].args.rowId, '141286');
    assert.strictEqual(db.inserts.length, 0, 'the handler itself must not INSERT directly for the successful path anymore');
  });

  await check('non-SUCCESSFUL status -> recorded as a failed donation with the raw status, unchanged behavior', async () => {
    const db = fakeDb();
    const handler = freshHandler(db);
    const donationsService = require('../src/modules/donations/donations.service');
    let finalizeCalled = false;
    donationsService.finalizeSuccessfulRecurringCharge = async () => { finalizeCalled = true; };

    await handler.handle({ RecurringId: 24290, InternalDealNumber: '60158439', Status: 'ONHOLD', Sum: '100' });

    assert.strictEqual(finalizeCalled, false);
    assert.strictEqual(db.inserts.length, 1);
    const failureReasonIdx = 10; // positional param index in the failed-donation INSERT
    assert.strictEqual(db.inserts[0][failureReasonIdx], 'cardcom_recurring_onhold');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
