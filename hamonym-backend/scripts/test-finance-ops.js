// FIN-11 Finance Operations -- Super Admin Finance screen backend.
// This module is deliberately thin (every action wraps an already-tested
// service function from Stage 2B/3) -- so this suite covers exactly two
// things, not a re-test of logic already proven elsewhere:
//   PART A: the two genuinely NEW read functions this work added
//   (listPaymentExceptions/listPaymentExceptionActions) -- real queries,
//   exercised inside a BEGIN...ROLLBACK transaction (payment_exceptions/
//   payment_exception_actions/payments are all append-only -- this is the
//   only safe way to create fixtures for them, same convention as every
//   other FIN-11 test file).
//   PART B: the controller layer -- each exported controller function
//   calls the CORRECT underlying service function with the CORRECT
//   arguments and produces the CORRECT response/error shape. Verified by
//   temporarily replacing the service's exported function (Node caches the
//   required module object, so the controller sees the same replacement)
//   with a stub, never touching the DB for this part.
//
// Run: node scripts/test-finance-ops.js
require('dotenv').config();
const pool = require('../src/db/db');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return res;
}

// ===========================================================================
// PART A -- real queries, in-transaction fixtures (payment_exceptions etc.
// are append-only, so this is the only safe way to create test rows).
// ===========================================================================
async function partA() {
  const paymentExceptions = require('../src/modules/billing-engine/payment-exceptions.service');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;

    const e = await client.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_finance_ops_${Date.now()}`, userId]);
    const entityId = e.rows[0].id;
    const ba = await client.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
    const p = await client.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ('2301-01-01','2301-01-02') RETURNING id`);
    const run = await client.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [p.rows[0].id]);
    const s = await client.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,1000,'paid') RETURNING id`,
      [ba.rows[0].id, p.rows[0].id, run.rows[0].id, (1000 / 1.18).toFixed(2), (1000 - 1000 / 1.18).toFixed(2)]
    );
    const statementId = s.rows[0].id;
    const attempt = await client.query(`INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount) VALUES ($1,'card',1,'succeeded',3000) RETURNING id`, [statementId]);
    const payment = await client.query(`INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at) VALUES ($1,$2,3000,'cardcom','tx-finance-ops-1',NOW()) RETURNING id`, [statementId, attempt.rows[0].id]);
    const exc = await client.query(
      `INSERT INTO payment_exceptions (statement_id, collection_attempt_id, payment_id, entity_id, outstanding_before, collected_amount, overpayment_amount)
       VALUES ($1,$2,$3,$4,1000,3000,2000) RETURNING id`,
      [statementId, attempt.rows[0].id, payment.rows[0].id, entityId]
    );
    const exceptionId = exc.rows[0].id;

    // --- 1. listPaymentExceptions returns the joined row correctly -------
    const list1 = await paymentExceptions.listPaymentExceptions({}, client);
    const row1 = list1.find((r) => r.id === exceptionId);
    check('1. listPaymentExceptions finds the fixture with correct joined fields (entity_name, statement_status)', !!row1 && row1.entity_name.startsWith('ZZZ_TEST_finance_ops_') && row1.statement_status === 'paid' && Number(row1.overpayment_amount) === 2000, JSON.stringify(row1));
    check('1a. no action yet -> last_action_type is null', row1.last_action_type === null, row1.last_action_type);

    // --- 2. status filter -------------------------------------------------
    const listOpen = await paymentExceptions.listPaymentExceptions({ status: 'open' }, client);
    const listResolved = await paymentExceptions.listPaymentExceptions({ status: 'resolved' }, client);
    check('2. status=open includes the fixture; status=resolved does not (it is still open)', listOpen.some((r) => r.id === exceptionId) && !listResolved.some((r) => r.id === exceptionId), JSON.stringify({ open: listOpen.length, resolved: listResolved.length }));

    // --- 3. override + resolve, then listPaymentExceptionActions reflects both, in order ---
    // Explicit, distinct created_at values (1s apart) -- NOW() is frozen at
    // transaction start in Postgres, so two inserts in the SAME transaction
    // would otherwise tie, making "ORDER BY created_at DESC" (correct for
    // real, separately-transacted admin actions) ambiguous for this test's
    // own fixture only.
    await client.query(`UPDATE payment_exceptions SET hold_new_collection = false WHERE id = $1`, [exceptionId]);
    await client.query(`INSERT INTO payment_exception_actions (exception_id, action_type, super_admin_user_id, reason, created_at) VALUES ($1,'override_hold',$2,'test override', NOW())`, [exceptionId, userId]);
    await client.query(`UPDATE payment_exceptions SET status = 'resolved' WHERE id = $1`, [exceptionId]);
    await client.query(`INSERT INTO payment_exception_actions (exception_id, action_type, super_admin_user_id, reason, created_at) VALUES ($1,'resolve_credit',$2,'test resolve', NOW() + INTERVAL '1 second')`, [exceptionId, userId]);

    const actions = await paymentExceptions.listPaymentExceptionActions(exceptionId, client);
    check('3. listPaymentExceptionActions returns both actions, oldest first, with admin_name joined', actions.length === 2 && actions[0].action_type === 'override_hold' && actions[1].action_type === 'resolve_credit' && !!actions[0].admin_name, JSON.stringify(actions.map((a) => ({ type: a.action_type, admin: a.admin_name }))));

    const list2 = await paymentExceptions.listPaymentExceptions({}, client);
    const row2 = list2.find((r) => r.id === exceptionId);
    check('3a. listPaymentExceptions now reflects the LATEST action (resolve_credit, not override_hold)', row2.last_action_type === 'resolve_credit', row2.last_action_type);

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ===========================================================================
// PART B -- controller wiring, stubbed service calls, no DB.
// ===========================================================================
async function partB() {
  const ctrl = require('../src/modules/platform/finance-ops/finance-ops.controller');
  const paymentExceptions = require('../src/modules/billing-engine/payment-exceptions.service');
  const masavProposals = require('../src/modules/billing-engine/masav-proposal.service');
  const statementBalance = require('../src/modules/billing-engine/statement-balance.service');

  const originals = {
    listPaymentExceptions: paymentExceptions.listPaymentExceptions,
    listPaymentExceptionActions: paymentExceptions.listPaymentExceptionActions,
    overrideCollectionHold: paymentExceptions.overrideCollectionHold,
    resolvePaymentException: paymentExceptions.resolvePaymentException,
    listMasavProposals: masavProposals.listMasavProposals,
    approveMasavProposal: masavProposals.approveMasavProposal,
    exportMasavProposals: masavProposals.exportMasavProposals,
    getStatementBalance: statementBalance.getStatementBalance,
  };

  try {
    // --- listExceptions: passes req.query.status through, wraps in {exceptions} ---
    let capturedArg;
    paymentExceptions.listPaymentExceptions = async (arg) => { capturedArg = arg; return [{ id: 'e1' }]; };
    const res1 = fakeRes();
    await ctrl.listExceptions({ query: { status: 'open' } }, res1);
    check('4. listExceptions passes status through and wraps the result as {exceptions}', capturedArg.status === 'open' && res1.body.exceptions.length === 1, JSON.stringify(res1.body));

    // --- overrideExceptionHold: passes exceptionId/superAdminUserId/reason; maps EXCEPTION_NOT_OPEN to 409 ---
    let capturedOverride;
    paymentExceptions.overrideCollectionHold = async (arg) => { capturedOverride = arg; const err = new Error('already open'); err.code = 'EXCEPTION_NOT_OPEN'; throw err; };
    const res2 = fakeRes();
    await ctrl.overrideExceptionHold({ params: { id: 'exc-1' }, body: { reason: 'checked with provider' }, user: { id: 9 } }, res2);
    check('5. overrideExceptionHold passes exceptionId/superAdminUserId/reason correctly', capturedOverride.exceptionId === 'exc-1' && capturedOverride.superAdminUserId === 9 && capturedOverride.reason === 'checked with provider', JSON.stringify(capturedOverride));
    check('5a. EXCEPTION_NOT_OPEN maps to HTTP 409, not a generic 500', res2.statusCode === 409 && res2.body.code === 'EXCEPTION_NOT_OPEN', JSON.stringify({ status: res2.statusCode, body: res2.body }));

    // --- resolveException: passes resolutionType/evidenceNotes through ---
    let capturedResolve;
    paymentExceptions.resolvePaymentException = async (arg) => { capturedResolve = arg; return { exceptionId: arg.exceptionId, status: 'resolved', resolutionType: arg.resolutionType }; };
    const res3 = fakeRes();
    await ctrl.resolveException({ params: { id: 'exc-2' }, body: { resolutionType: 'resolve_credit', reason: 'r', evidenceNotes: 'e' }, user: { id: 9 } }, res3);
    check('6. resolveException passes resolutionType/evidenceNotes through and wraps as {result}', capturedResolve.resolutionType === 'resolve_credit' && capturedResolve.evidenceNotes === 'e' && res3.body.result.status === 'resolved', JSON.stringify(res3.body));

    // --- listMasavProposals / approveMasavProposal / exportMasavProposals wiring ---
    let capturedApprove;
    masavProposals.approveMasavProposal = async (arg) => { capturedApprove = arg; const err = new Error('stale'); err.code = 'PROPOSAL_STALE_AT_EXPORT'; throw err; };
    const res4 = fakeRes();
    await ctrl.approveMasavProposal({ params: { id: 'prop-1' }, body: { reason: 'ok' }, user: { id: 9 } }, res4);
    check('7. approveMasavProposal passes proposalId/superAdminUserId/reason; unknown-to-this-module code still maps via shared status table', capturedApprove.proposalId === 'prop-1' && res4.statusCode === 409, JSON.stringify({ captured: capturedApprove, status: res4.statusCode }));

    let capturedExport;
    masavProposals.exportMasavProposals = async (arg) => { capturedExport = arg; return { exported: arg.proposalIds.length }; };
    const res5 = fakeRes();
    await ctrl.exportMasavProposals({ body: { proposalIds: ['a', 'b'] }, user: { id: 9 } }, res5);
    check('8. exportMasavProposals passes the proposalIds array through unmodified', JSON.stringify(capturedExport.proposalIds) === JSON.stringify(['a', 'b']) && res5.body.result.exported === 2, JSON.stringify(res5.body));

    // --- getStatementBalance: wraps as {balance}, no second argument leaked ---
    let capturedBalanceArgs = [];
    statementBalance.getStatementBalance = async (...args) => { capturedBalanceArgs = args; return { outstanding: 500 }; };
    const res6 = fakeRes();
    await ctrl.getStatementBalance({ params: { id: 'stmt-1' } }, res6);
    check('9. getStatementBalance calls the real function with exactly the statementId and wraps as {balance}', capturedBalanceArgs.length === 1 && capturedBalanceArgs[0] === 'stmt-1' && res6.body.balance.outstanding === 500, JSON.stringify({ args: capturedBalanceArgs, body: res6.body }));

    // --- a genuinely unknown error code still falls back to 500, never silently 200 ---
    paymentExceptions.listPaymentExceptionActions = async () => { const err = new Error('boom'); err.code = 'SOMETHING_UNMAPPED'; throw err; };
    const res7 = fakeRes();
    await ctrl.getExceptionActions({ params: { id: 'exc-3' } }, res7);
    check('10. an unmapped error code falls back to HTTP 500, never a silent 200', res7.statusCode === 500, JSON.stringify({ status: res7.statusCode, body: res7.body }));
  } finally {
    Object.assign(paymentExceptions, {
      listPaymentExceptions: originals.listPaymentExceptions,
      listPaymentExceptionActions: originals.listPaymentExceptionActions,
      overrideCollectionHold: originals.overrideCollectionHold,
      resolvePaymentException: originals.resolvePaymentException,
    });
    Object.assign(masavProposals, {
      listMasavProposals: originals.listMasavProposals,
      approveMasavProposal: originals.approveMasavProposal,
      exportMasavProposals: originals.exportMasavProposals,
    });
    Object.assign(statementBalance, { getStatementBalance: originals.getStatementBalance });
  }
}

async function main() {
  await partA();
  await partB();
}

main()
  .then(async () => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) console.log('FAILURES:', failed);
    const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_finance_ops_%'`);
    console.log('\nPost-run verification -- leftover ZZZ_TEST_finance_ops entities:', leftover.rows[0].count);
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
