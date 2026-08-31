// Unit tests for recurring-payment-reconciliation.job.js (2026-08-31,
// Donation Engine closure WP2). Fully mocked: fake db.query router, fake
// getHistory/resolveCredentials/finalizeCharge -- no real DB, no real
// CardCom call, no real donation ever created. This is deliberate: a real
// 'paid' donation cannot be deleted afterward (migration 055's
// immutability trigger), so exercising the "already represented by an
// existing paid donation" match against a real DB would create exactly the
// irreversible test fact this whole effort has avoided.
//
// Run: node scripts/test-recurring-payment-reconciliation.js

const assert = require('assert');
const { reconcileAllActiveInstructions, reconcileInstruction, alreadyRepresented } = require('../src/jobs/recurring-payment-reconciliation.job');

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

// Routes db.query calls: findings inserts are captured, everything else
// (the alreadyRepresented lookups) is answered by `matchAnswers`, a queue
// of true/false consumed in call order.
function fakeDb(matchAnswers = []) {
  const queue = [...matchAnswers];
  const findingInserts = [];
  return {
    findingInserts,
    query: async (sql, params) => {
      if (sql.includes('INSERT INTO reconciliation_findings')) {
        findingInserts.push({ findingType: params[1], subjectId: params[4] });
        return { rows: [] };
      }
      if (sql.includes('FROM donations WHERE recurring_instruction_id') || sql.includes('FROM donations\n       WHERE recurring_instruction_id')) {
        const isMatch = queue.length ? queue.shift() : false;
        return { rows: isMatch ? [{ id: 'existing-donation' }] : [] };
      }
      throw new Error('fakeDb: unexpected query: ' + sql.slice(0, 80));
    },
  };
}

const instruction = { id: 'instr-1', entity_id: 'entity-1', campaign_id: 'campaign-1', cardcom_account_id: 4337, cardcom_recurring_id: 24290 };

function successfulItem(overrides = {}) {
  return {
    RecurringId: 24290,
    RowID: 141286,
    TranzactionId: 999888,
    SumToBill: '100.00',
    CreateDate: '2026-08-15T00:00:00',
    Status: 'SUCCESSFUL',
    ResposeCode: 0,
    ...overrides,
  };
}

const fakeResolveCredentials = async () => ({ apiName: 'x', apiPassword: 'y' });

async function run() {
  await check('missing successful charge -> finalizeCharge called once, finding recorded', async () => {
    const db = fakeDb([false, false]); // no row-id match, no day+amount match
    const finalizeCalls = [];
    const getHistory = async () => ({ ResponseCode: 0, RecurringPaymentHistory: [successfulItem()] });
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async (instr, args) => finalizeCalls.push({ instr, args }),
    });
    assert.strictEqual(result.recovered, 1);
    assert.strictEqual(finalizeCalls.length, 1);
    assert.strictEqual(finalizeCalls[0].args.amount, '100.00');
    assert.strictEqual(finalizeCalls[0].args.providerReference, '999888');
    assert.strictEqual(db.findingInserts.length, 1);
    assert.strictEqual(db.findingInserts[0].findingType, 'recurring_charge_recovered_from_history');
  });

  await check('already represented by matching provider_row_id -> finalizeCharge NOT called (idempotent rerun)', async () => {
    const db = fakeDb([true]); // row-id match found immediately
    let finalizeCalled = false;
    const getHistory = async () => ({ ResponseCode: 0, RecurringPaymentHistory: [successfulItem()] });
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { finalizeCalled = true; },
    });
    assert.strictEqual(result.recovered, 0);
    assert.strictEqual(finalizeCalled, false);
  });

  await check('already represented by day+amount match against an existing paid donation -> no duplicate (webhook already handled it)', async () => {
    const db = fakeDb([false, true]); // no row-id match, but day+amount matches
    let finalizeCalled = false;
    const getHistory = async () => ({ ResponseCode: 0, RecurringPaymentHistory: [successfulItem()] });
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { finalizeCalled = true; },
    });
    assert.strictEqual(result.recovered, 0);
    assert.strictEqual(finalizeCalled, false);
  });

  await check('history item for a different RecurringId (same AccountId) is ignored', async () => {
    const db = fakeDb([]);
    let finalizeCalled = false;
    const getHistory = async () => ({ ResponseCode: 0, RecurringPaymentHistory: [successfulItem({ RecurringId: 999999 })] });
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { finalizeCalled = true; },
    });
    assert.strictEqual(result.checked, 0);
    assert.strictEqual(finalizeCalled, false);
  });

  await check('non-SUCCESSFUL statuses never trigger finalizeCharge (ambiguity preserved, no guessing)', async () => {
    const db = fakeDb([]);
    let finalizeCalled = false;
    const getHistory = async () => ({
      ResponseCode: 0,
      RecurringPaymentHistory: [
        successfulItem({ Status: 'PENDINGFORPROCESSING' }),
        successfulItem({ Status: 'ONHOLD' }),
        successfulItem({ Status: 'LOSTDEBT' }),
      ],
    });
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { finalizeCalled = true; },
    });
    assert.strictEqual(result.checked, 0);
    assert.strictEqual(finalizeCalled, false);
  });

  await check('history lookup throws -> recorded as a finding, no crash, nothing recovered', async () => {
    const db = fakeDb([]);
    const getHistory = async () => { throw new Error('network down'); };
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { throw new Error('should not be called'); },
    });
    assert.strictEqual(result.recovered, 0);
    assert.strictEqual(db.findingInserts[0].findingType, 'history_lookup_failed');
  });

  await check('CardCom returns a non-zero ResponseCode -> recorded as a finding, no crash', async () => {
    const db = fakeDb([]);
    const getHistory = async () => ({ ResponseCode: 401, Description: 'Invalid username' });
    const result = await reconcileInstruction(db, instruction, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { throw new Error('should not be called'); },
    });
    assert.strictEqual(result.recovered, 0);
    assert.strictEqual(db.findingInserts[0].findingType, 'history_lookup_failed');
  });

  await check('rerun after recovery is a no-op (simulates: charge was just created by the previous run)', async () => {
    // First run: recovers it.
    const db1 = fakeDb([false, false]);
    const finalizeCalls = [];
    const getHistory = async () => ({ ResponseCode: 0, RecurringPaymentHistory: [successfulItem()] });
    await reconcileInstruction(db1, instruction, {
      getHistory, resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async (instr, args) => finalizeCalls.push(args),
    });
    assert.strictEqual(finalizeCalls.length, 1);

    // Second run: now a paid donation exists for that day+amount (as if the
    // first run's finalizeCharge had actually written it) -> must be a no-op.
    const db2 = fakeDb([false, true]);
    let secondRunFinalizeCalled = false;
    await reconcileInstruction(db2, instruction, {
      getHistory, resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async () => { secondRunFinalizeCalled = true; },
    });
    assert.strictEqual(secondRunFinalizeCalled, false);
  });

  await check('reconcileAllActiveInstructions: one instruction failing does not stop the others', async () => {
    const instr2 = { ...instruction, id: 'instr-2', cardcom_account_id: 5555, cardcom_recurring_id: 6666 };
    const db = fakeDb([false, false]);
    let getHistoryCallCount = 0;
    const getHistory = async ({ accountId }) => {
      getHistoryCallCount++;
      if (accountId === instruction.cardcom_account_id) throw new Error('CardCom down for this account');
      return { ResponseCode: 0, RecurringPaymentHistory: [successfulItem({ RecurringId: instr2.cardcom_recurring_id })] };
    };
    db.query = (function (orig) {
      let call = 0;
      return async (sql, params) => {
        if (sql.includes('FROM recurring_instructions')) {
          return { rows: [instruction, instr2] };
        }
        return orig(sql, params);
      };
    })(db.query);
    const finalizeCalls = [];
    const result = await reconcileAllActiveInstructions(db, {
      getHistory,
      resolveCredentials: fakeResolveCredentials,
      finalizeCharge: async (instr, args) => finalizeCalls.push(instr.id),
    });
    assert.strictEqual(result.instructionsChecked, 2);
    assert.strictEqual(getHistoryCallCount, 2);
    assert.strictEqual(finalizeCalls.length, 1);
    assert.strictEqual(finalizeCalls[0], 'instr-2');
  });

  console.log(`\n${passed} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

run();
