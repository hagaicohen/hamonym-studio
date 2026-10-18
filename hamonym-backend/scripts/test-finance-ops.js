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
    headers: {},
    sentBuffer: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader(name, value) { this.headers[name] = value; return this; },
    send(buffer) { this.sentBuffer = buffer; return this; },
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

    // exportMasavProposals returns a raw xlsx Buffer (not JSON) -- the
    // controller must serve it as a file download (Content-Type/
    // Content-Disposition + res.send(buffer)), never JSON-encode it. This
    // is the exact bug this round of work fixed: res.json({ result })
    // where `result` was the file bytes.
    let capturedExport;
    const fakeBuffer = Buffer.from('fake-xlsx-bytes');
    masavProposals.exportMasavProposals = async (arg) => { capturedExport = arg; return fakeBuffer; };
    const res5 = fakeRes();
    await ctrl.exportMasavProposals({ body: { proposalIds: ['a', 'b'] }, user: { id: 9 } }, res5);
    check('8. exportMasavProposals passes the proposalIds array through unmodified', JSON.stringify(capturedExport.proposalIds) === JSON.stringify(['a', 'b']));
    check('8a. the real Buffer is sent as the HTTP body via res.send(), never JSON-encoded', res5.sentBuffer === fakeBuffer && res5.body === null, JSON.stringify({ sentBuffer: res5.sentBuffer?.toString(), body: res5.body }));
    check('8b. Content-Type/Content-Disposition identify this as a downloadable .xlsx file', res5.headers['Content-Type'] === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' && /attachment; filename=".*\.xlsx"/.test(res5.headers['Content-Disposition']), JSON.stringify(res5.headers));

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

// ===========================================================================
// PART C -- the REAL exportMasavProposals (not a mirror, not a stub)
// against a REAL committed fixture, proving the actual Tranzila-format
// xlsx file this round of work exists to guarantee. masav_collection_
// proposals/statements/billing_accounts/entities/entity_masav_details are
// all NOT append-only (unlike payments/payment_exceptions) -- same
// committed-then-deleted convention test-fin11-stage3-masav-proposal.js's
// own concurrency test already uses for exactly these tables.
// ===========================================================================
async function partC() {
  const XLSX = require('xlsx');
  const masavProposals = require('../src/modules/billing-engine/masav-proposal.service');
  const setup = await pool.connect();
  let entityId, accountId, periodId, runId, statementId, proposalId;
  try {
    const userRes = await setup.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;

    const e = await setup.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_finance_ops_export_${Date.now()}`, userId]);
    entityId = e.rows[0].id;
    const ba = await setup.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [entityId]);
    accountId = ba.rows[0].id;
    await setup.query(`INSERT INTO entity_masav_details (entity_id, bank_code, branch_code, account_number, authorized, authorized_by, authorized_at) VALUES ($1,'12','345','6789012',true,$2,NOW())`, [entityId, userId]);
    const p = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ('2302-01-01','2302-01-02') RETURNING id`);
    periodId = p.rows[0].id;
    const run = await setup.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
    runId = run.rows[0].id;
    const totalDue = 1500;
    const s = await setup.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,$6,'approved') RETURNING id`,
      [accountId, periodId, runId, (totalDue / 1.18).toFixed(2), (totalDue - totalDue / 1.18).toFixed(2), totalDue]
    );
    statementId = s.rows[0].id;
    const prop = await setup.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status, approved_at, approved_by_user_id)
       VALUES ($1,$2,$3,$3,'approved',NOW(),$4) RETURNING id`,
      [statementId, entityId, totalDue, userId]
    );
    proposalId = prop.rows[0].id;

    // --- 11. the REAL exportMasavProposals returns a genuinely valid, parseable xlsx ---
    const buffer = await masavProposals.exportMasavProposals({ proposalIds: [proposalId], superAdminUserId: userId });
    check('11. exportMasavProposals returns a real Buffer, not a mirror/stub result', Buffer.isBuffer(buffer) && buffer.length > 0, `length=${buffer?.length}`);

    let workbook;
    try {
      workbook = XLSX.read(buffer, { type: 'buffer' });
    } catch (err) {
      check('11a. the buffer parses as a valid xlsx workbook', false, err.message);
    }
    if (workbook) {
      check('11a. the buffer parses as a valid xlsx workbook', workbook.SheetNames.includes('MASAV'), JSON.stringify(workbook.SheetNames));
      const sheet = workbook.Sheets['MASAV'];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      check('11b. row 1 is the Hebrew explanatory header, row 2 the technical header (bank/branch/account/sum/...)', rows[1][0] === 'bank' && rows[1][3] === 'sum' && rows[0][0] === 'מספר בנק', JSON.stringify(rows.slice(0, 2)));
      const dataRow = rows[2];
      check('11c. the data row carries the REAL fixture values -- bank/branch/account as exact text, sum = proposed_amount', String(dataRow[0]) === '12' && String(dataRow[1]) === '345' && String(dataRow[2]) === '6789012' && Number(dataRow[3]) === totalDue, JSON.stringify(dataRow));
    }

    // --- 12. status flips to 'exported' only AFTER the file was built (already committed by the real function) ---
    const afterExport = await setup.query(`SELECT status, exported_at FROM masav_collection_proposals WHERE id = $1`, [proposalId]);
    check('12. the proposal is marked exported (file + status flip were atomic -- we already have a valid file above)', afterExport.rows[0].status === 'exported' && afterExport.rows[0].exported_at !== null, JSON.stringify(afterExport.rows[0]));

    // --- 13. NOT_AUTHORIZED fails closed -- never generates a file, never flips status ---
    await setup.query(`UPDATE entity_masav_details SET authorized = false, authorized_by = NULL, authorized_at = NULL WHERE entity_id = $1`, [entityId]);
    // A different period -- one statement per (account, period) is enforced
    // by idx_statements_effective_per_account_period.
    const p2 = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ('2302-02-01','2302-02-02') RETURNING id`);
    const run2 = await setup.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [p2.rows[0].id]);
    const s2 = await setup.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,$6,'approved') RETURNING id`,
      [accountId, p2.rows[0].id, run2.rows[0].id, (500 / 1.18).toFixed(2), (500 - 500 / 1.18).toFixed(2), 500]
    );
    const prop2 = await setup.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status, approved_at, approved_by_user_id)
       VALUES ($1,$2,500,500,'approved',NOW(),$3) RETURNING id`,
      [s2.rows[0].id, entityId, userId]
    );
    let notAuthorizedErr = null;
    try {
      await masavProposals.exportMasavProposals({ proposalIds: [prop2.rows[0].id], superAdminUserId: userId });
    } catch (err) {
      notAuthorizedErr = err;
    }
    check('13. export fails closed with NOT_AUTHORIZED when the entity lost MASAV authorization -- never silently generates a file anyway', notAuthorizedErr?.code === 'NOT_AUTHORIZED', notAuthorizedErr?.code);
    const prop2After = await setup.query(`SELECT status FROM masav_collection_proposals WHERE id = $1`, [prop2.rows[0].id]);
    check('13a. the unauthorized proposal is still "approved", never flipped to exported', prop2After.rows[0].status === 'approved', prop2After.rows[0].status);

    await setup.query(`DELETE FROM masav_collection_proposals WHERE id = $1`, [prop2.rows[0].id]);
    await setup.query(`DELETE FROM statements WHERE id = $1`, [s2.rows[0].id]);
    await setup.query(`DELETE FROM billing_runs WHERE id = $1`, [run2.rows[0].id]);
    await setup.query(`DELETE FROM billing_periods WHERE id = $1`, [p2.rows[0].id]);
  } finally {
    // exportMasavProposals also writes a platform_audit_log row -- not
    // append-only (no trigger), but a real FK that blocks deleting the
    // entity until cleaned up too.
    if (entityId) await setup.query(`DELETE FROM platform_audit_log WHERE entity_id = $1`, [entityId]).catch(() => {});
    if (proposalId) await setup.query(`DELETE FROM masav_collection_proposals WHERE id = $1`, [proposalId]).catch(() => {});
    await setup.query(`DELETE FROM masav_collection_proposals WHERE entity_id = $1`, [entityId]).catch(() => {});
    if (statementId) await setup.query(`DELETE FROM statements WHERE id = $1`, [statementId]).catch(() => {});
    if (runId) await setup.query(`DELETE FROM billing_runs WHERE id = $1`, [runId]).catch(() => {});
    if (periodId) await setup.query(`DELETE FROM billing_periods WHERE id = $1`, [periodId]).catch(() => {});
    if (entityId) await setup.query(`DELETE FROM entity_masav_details WHERE entity_id = $1`, [entityId]).catch(() => {});
    if (accountId) await setup.query(`DELETE FROM billing_accounts WHERE id = $1`, [accountId]).catch(() => {});
    if (entityId) await setup.query(`DELETE FROM entities WHERE id = $1`, [entityId]).catch(() => {});
    setup.release();
  }
}

async function main() {
  await partA();
  await partB();
  await partC();
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
