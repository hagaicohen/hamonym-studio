// FIN-11 deploy-order compatibility (2026-10-16).
// docs/finance/FIN11_IMPLEMENTATION_STATUS.md "⛔ ממצא חוסם Push" has the
// finding this fixes: openAttempt (collection.service.js) and
// openMasavAttempt (masav-collection.service.js) are EXISTING, live
// production functions that gained unconditional guard calls querying
// payment_exceptions/masav_collection_proposals (migrations 073/074).
// Render auto-deploys this backend on every commit to `main`, so this code
// can reach production before those migrations are applied there --
// without src/modules/billing-engine/fin11-schema-probe.js's explicit
// to_regclass presence check, every real collection attempt (card AND
// legacy MASAV) would fail outright in that window.
//
// This suite proves ALL FOUR possible migration states (2026-10-16 review:
// each guard is gated by presence of its OWN table independently, so a
// PARTIALLY migrated DB -- 073 without 074, or 074 without 073 -- is a real,
// distinct state that must be verified separately, not assumed safe by
// extrapolating from the "neither" and "both" cases):
//
//   PART A -- NEITHER 073 nor 074. Runs directly against whatever this DB
//   actually is right now (migrations not applied here as of this writing).
//   Calls the REAL exported openAttempt/openMasavAttempt (not a mirror) with
//   a real, committed-then-deleted fixture (entities/billing_accounts/
//   statements are not append-only, same convention as the Stage 3 test's
//   concurrency fixture) and confirms they complete with the EXACT
//   pre-FIN-11 skip shape, never an exception. If this DB already has
//   073/074 applied by the time this runs, Part A logs that and skips
//   itself rather than falsely failing.
//
//   PART C -- ONLY 073 applied (payment_exceptions exists,
//   masav_collection_proposals does not). Proves the overpayment-hold guard
//   is fully enforced (073's own data CAN exist and must be checked) while
//   the MASAV-overlap guards do not throw (074's table genuinely does not
//   exist, so skipping is correct, not a bypass of real data).
//
//   PART D -- ONLY 074 applied (masav_collection_proposals exists,
//   payment_exceptions does not). Proves the MASAV-overlap guards are fully
//   enforced while the overpayment-hold guard does not throw.
//
//   PART B -- BOTH applied. One BEGIN...ROLLBACK transaction applies
//   073+074's DDL locally first (same methodology as
//   test-fin11-stage2b/3's own test files), then exercises LOCAL MIRRORS
//   of openAttempt's/openMasavAttempt's guard prefixes (the real exported
//   functions open their own pool.connect(), which cannot see this
//   transaction's uncommitted DDL/fixtures) to prove every guard is NEVER
//   skipped once its schema exists -- no accidental permanent bypass.
//
//   PART E -- connection/transaction scoping. Proves the presence check
//   must be called with the SAME client the protected query will use: a
//   DIFFERENT, non-transactional connection cannot see this transaction's
//   own uncommitted DDL, so it would (correctly) report "absent" even while
//   the transaction that matters sees "present". This is exactly why every
//   real call site (collection.service.js, masav-collection.service.js)
//   passes its own `client`, never the bare `pool` -- confirmed directly
//   by grep, and exercised here as a regression guard against a future
//   refactor accidentally dropping that argument.
//
// Run: node scripts/test-fin11-schema-compat.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db/db');
const { openAttempt } = require('../src/modules/collection-engine/collection.service');
const { openMasavAttempt } = require('../src/modules/collection-engine/masav-collection.service');
const {
  isPaymentExceptionsSchemaPresent,
  isMasavProposalsSchemaPresent,
} = require('../src/modules/billing-engine/fin11-schema-probe');
const { hasOpenCollectionHold } = require('../src/modules/billing-engine/payment-exceptions.service');
const { hasExportedMasavProposal, hasActiveMasavProposal } = require('../src/modules/billing-engine/masav-proposal.service');

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}${detail ? ' :: ' + detail : ''}`);
}

// Migrations 073/074 are now applied for real (2026-10-17) -- their
// triggers already exist, and CREATE TRIGGER has no IF NOT EXISTS form in
// Postgres. Drop them first (inside whichever rollback-only transaction is
// calling this, so the real, already-applied triggers are restored
// untouched the instant that transaction ROLLBACKs) so the verbatim
// migration SQL applied right after can recreate them either way -- same
// idempotency CREATE TABLE IF NOT EXISTS already gives the tables. Harmless
// no-op if the table/trigger doesn't exist yet.
// Split in two (rather than one "drop everything, swallow errors" helper):
// DROP TRIGGER ... ON <table> requires the table itself to exist (IF EXISTS
// only covers the trigger name, not the table) -- partC/partD deliberately
// drop ONE of the two tables first to simulate a partial-migration state,
// and trying to also drop THAT table's own trigger afterward throws a real
// error that poisons the whole transaction (Postgres aborts the transaction
// on ANY error until ROLLBACK, regardless of a JS-level .catch()). Each
// part calls only the helper for the table it did NOT just drop.
async function drop073Triggers(client) {
  await client.query(`DROP TRIGGER IF EXISTS trg_payment_exceptions_enforce_immutable_facts ON payment_exceptions`);
  await client.query(`DROP TRIGGER IF EXISTS trg_payment_exception_actions_no_update ON payment_exception_actions`);
  await client.query(`DROP TRIGGER IF EXISTS trg_payment_exception_actions_no_delete ON payment_exception_actions`);
}
async function drop074Trigger(client) {
  await client.query(`DROP TRIGGER IF EXISTS trg_masav_proposals_enforce_immutable_facts ON masav_collection_proposals`);
}
async function dropFin11Triggers(client) {
  await drop073Triggers(client);
  await drop074Trigger(client);
}

// ===========================================================================
// PART A -- schema ABSENT, real functions, real (committed+cleaned) fixture.
// ===========================================================================
async function partA() {
  const [paymentExceptionsPresent, masavProposalsPresent] = await Promise.all([
    isPaymentExceptionsSchemaPresent(pool),
    isMasavProposalsSchemaPresent(pool),
  ]);
  if (paymentExceptionsPresent || masavProposalsPresent) {
    console.log('\n[Part A skipped] migrations 073/074 are already applied on this DB -- the "schema absent" state this part tests no longer exists here. See Part B for the "schema present" coverage.');
    return;
  }
  check('A0. sanity: payment_exceptions does not exist on this DB', paymentExceptionsPresent === false);
  check('A0a. sanity: masav_collection_proposals does not exist on this DB', masavProposalsPresent === false);

  const setup = await pool.connect();
  let entityId, accountId, periodId, runId, statementId;
  try {
    const userRes = await setup.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    const e = await setup.query(
      `INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`,
      [`ZZZ_TEST_fin11_schema_compat_${Date.now()}`, userId]
    );
    entityId = e.rows[0].id;
    const ba = await setup.query(
      `INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`,
      [entityId]
    );
    accountId = ba.rows[0].id;
    const start = new Date(Date.UTC(2107, 0, 1));
    const end = new Date(Date.UTC(2107, 0, 2));
    const p = await setup.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
    periodId = p.rows[0].id;
    const r = await setup.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
    runId = r.rows[0].id;
    // total_due = 0 on purpose: both functions reach their NEW guard lines
    // first (hold-check / exported-masav-check / active-proposal-check are
    // all ahead of any balance/routing decision), then terminate at the
    // EXACT pre-FIN-11 skip reason -- proving the new guards were passed
    // through cleanly, not just "didn't crash before reaching them".
    const s = await setup.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,0,0.03,0.18,0,0,0,'approved') RETURNING id`,
      [accountId, periodId, runId]
    );
    statementId = s.rows[0].id;

    let a1;
    try {
      a1 = await openAttempt(statementId, () => { throw new Error('adapter should never be called -- balance is 0'); });
      check('A1. openAttempt (REAL, schema absent) does not throw and reaches the pre-FIN-11 no_outstanding_balance skip', a1.skipped === true && a1.reason === 'no_outstanding_balance', JSON.stringify(a1));
    } catch (err) {
      check('A1. openAttempt (REAL, schema absent) does not throw and reaches the pre-FIN-11 no_outstanding_balance skip', false, `THREW: ${err.message}`);
    }

    let a2;
    try {
      a2 = await openMasavAttempt(statementId);
      check('A2. openMasavAttempt (REAL, schema absent) does not throw and reaches the pre-FIN-11 not_masav_routed skip', a2.skipped === true && a2.reason === 'not_masav_routed', JSON.stringify(a2));
    } catch (err) {
      check('A2. openMasavAttempt (REAL, schema absent) does not throw and reaches the pre-FIN-11 not_masav_routed skip', false, `THREW: ${err.message}`);
    }
  } finally {
    if (statementId) await setup.query(`DELETE FROM statements WHERE id=$1`, [statementId]).catch(() => {});
    if (runId) await setup.query(`DELETE FROM billing_runs WHERE id=$1`, [runId]).catch(() => {});
    if (periodId) await setup.query(`DELETE FROM billing_periods WHERE id=$1`, [periodId]).catch(() => {});
    if (accountId) await setup.query(`DELETE FROM billing_accounts WHERE id=$1`, [accountId]).catch(() => {});
    if (entityId) await setup.query(`DELETE FROM entities WHERE id=$1`, [entityId]).catch(() => {});
    setup.release();
  }
}

// ===========================================================================
// PART B -- schema PRESENT (migration DDL applied inside this transaction
// only), local mirrors of the guard prefixes, proving full enforcement.
// ===========================================================================
async function openAttemptGuardsCore(client, statementId) {
  const stmtRes = await client.query(`SELECT s.id, s.status, ba.entity_id FROM statements s JOIN billing_accounts ba ON ba.id=s.billing_account_id WHERE s.id=$1 FOR UPDATE OF s`, [statementId]);
  const statement = stmtRes.rows[0];
  if (await isPaymentExceptionsSchemaPresent(client)) {
    const hold = await hasOpenCollectionHold(statement.entity_id, client);
    if (hold.held) return { skipped: true, reason: 'entity_collection_held', exceptionId: hold.exceptionId };
  }
  if (await isMasavProposalsSchemaPresent(client)) {
    const exportedMasav = await hasExportedMasavProposal(statementId, client);
    if (exportedMasav.exists) return { skipped: true, reason: 'masav_proposal_exported_unresolved', proposalId: exportedMasav.proposalId };
  }
  return { skipped: false };
}

async function openMasavAttemptGuardCore(client, statementId) {
  if (await isMasavProposalsSchemaPresent(client)) {
    const activeProposal = await hasActiveMasavProposal(statementId, client);
    if (activeProposal.exists) return { skipped: true, reason: 'fin11_masav_proposal_active', proposalId: activeProposal.proposalId };
  }
  return { skipped: false };
}

// Shared fixture factory for the in-transaction parts (B/C/D) -- each part
// gets its own counters/period-year so none can collide with another.
function makeFixtureFactory(client, userId, namePrefix, yearBase) {
  let m = 0;
  let periodCounter = 0;
  const periodIds = new Map();
  async function getPeriod(start, end) {
    const key = `${start.toISOString()}|${end.toISOString()}`;
    if (periodIds.has(key)) return periodIds.get(key);
    const r = await client.query(`INSERT INTO billing_periods (period_start, period_end) VALUES ($1,$2) RETURNING id`, [start, end]);
    periodIds.set(key, r.rows[0].id);
    return r.rows[0].id;
  }
  async function makeEntity() {
    m++;
    const e = await client.query(`INSERT INTO entities (display_name, created_by_user_id, status) VALUES ($1,$2,'active') RETURNING id`, [`ZZZ_TEST_fin11_schema_compat_${namePrefix}_${m}_${Date.now()}`, userId]);
    const ba = await client.query(`INSERT INTO billing_accounts (entity_id, fee_rate, vat_rate, preferred_collection_method, enforcement_status) VALUES ($1,0.03,0.18,'card','active') RETURNING id`, [e.rows[0].id]);
    return { entityId: e.rows[0].id, accountId: ba.rows[0].id };
  }
  async function makeStatement(accountId, totalDue, status = 'approved') {
    periodCounter++;
    const offset = periodCounter * 4;
    const start = new Date(Date.UTC(yearBase, 0, 1 + offset));
    const end = new Date(Date.UTC(yearBase, 0, 2 + offset));
    const periodId = await getPeriod(start, end);
    const run = await client.query(`INSERT INTO billing_runs (billing_period_id, mode, as_of, status, started_at) VALUES ($1,'production',NOW(),'draft',NOW()) RETURNING id`, [periodId]);
    const fee = (totalDue / 1.18).toFixed(2);
    const vat = (totalDue - totalDue / 1.18).toFixed(2);
    const s = await client.query(
      `INSERT INTO statements (billing_account_id, billing_period_id, billing_run_id, gross_raised, fee_rate, vat_rate, fee_amount, vat_amount, total_due, status)
       VALUES ($1,$2,$3,1000,0.03,0.18,$4,$5,$6,$7) RETURNING id`,
      [accountId, periodId, run.rows[0].id, fee, vat, totalDue, status]
    );
    return s.rows[0].id;
  }
  return { makeEntity, makeStatement };
}

async function partB() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await dropFin11Triggers(client);
    const sql073 = fs.readFileSync(path.join(__dirname, '../migrations/073_fin11_payment_exceptions.sql'), 'utf8');
    await client.query(sql073);
    const sql074 = fs.readFileSync(path.join(__dirname, '../migrations/074_fin11_masav_collection_proposals.sql'), 'utf8');
    await client.query(sql074);

    check('B0. sanity: payment_exceptions exists inside this transaction', await isPaymentExceptionsSchemaPresent(client));
    check('B0a. sanity: masav_collection_proposals exists inside this transaction', await isMasavProposalsSchemaPresent(client));

    const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    const { makeEntity, makeStatement } = makeFixtureFactory(client, userId, 'b', 2108);

    // --- B1/B1a: an open hold blocks openAttempt's guard, entity-wide -----
    const e1 = await makeEntity();
    const s1 = await makeStatement(e1.accountId, 1000);
    const attemptRes = await client.query(`INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount) VALUES ($1,'card',1,'succeeded',3000) RETURNING id`, [s1]);
    const paymentRes = await client.query(`INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at) VALUES ($1,$2,3000,'cardcom','tx-schema-compat-b1',NOW()) RETURNING id`, [s1, attemptRes.rows[0].id]);
    const excRes = await client.query(
      `INSERT INTO payment_exceptions (statement_id, collection_attempt_id, payment_id, entity_id, outstanding_before, collected_amount, overpayment_amount)
       VALUES ($1,$2,$3,$4,1000,3000,2000) RETURNING id`,
      [s1, attemptRes.rows[0].id, paymentRes.rows[0].id, e1.entityId]
    );
    const exceptionId1 = excRes.rows[0].id;

    const s1b = await makeStatement(e1.accountId, 500); // same entity, different Statement
    const bGuard1 = await openAttemptGuardsCore(client, s1b);
    check('B1. openAttempt guard (schema present) holds a DIFFERENT statement of the SAME entity under an open exception', bGuard1.skipped === true && bGuard1.reason === 'entity_collection_held' && bGuard1.exceptionId === exceptionId1, JSON.stringify(bGuard1));

    const e2 = await makeEntity();
    const s2 = await makeStatement(e2.accountId, 500);
    const bGuard2 = await openAttemptGuardsCore(client, s2);
    check('B1a. an unrelated entity is NOT held by e1\'s exception', bGuard2.skipped === false, JSON.stringify(bGuard2));

    // --- B2: an exported MASAV proposal blocks openAttempt's guard --------
    const e3 = await makeEntity();
    const s3 = await makeStatement(e3.accountId, 5000);
    const proposalRes = await client.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status)
       VALUES ($1,$2,5000,5000,'exported') RETURNING id`,
      [s3, e3.entityId]
    );
    const proposalId3 = proposalRes.rows[0].id;
    const bGuard3 = await openAttemptGuardsCore(client, s3);
    check('B2. openAttempt guard (schema present) blocks a Statement with an unresolved exported MASAV proposal', bGuard3.skipped === true && bGuard3.reason === 'masav_proposal_exported_unresolved' && bGuard3.proposalId === proposalId3, JSON.stringify(bGuard3));

    // --- B3: an active (proposed) MASAV proposal blocks openMasavAttempt's guard ---
    const e4 = await makeEntity();
    const s4 = await makeStatement(e4.accountId, 5000);
    const proposalRes4 = await client.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status)
       VALUES ($1,$2,5000,5000,'proposed') RETURNING id`,
      [s4, e4.entityId]
    );
    const proposalId4 = proposalRes4.rows[0].id;
    const bGuard4 = await openMasavAttemptGuardCore(client, s4);
    check('B3. openMasavAttempt guard (schema present) blocks a Statement with an active FIN-11 proposal', bGuard4.skipped === true && bGuard4.reason === 'fin11_masav_proposal_active' && bGuard4.proposalId === proposalId4, JSON.stringify(bGuard4));

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ===========================================================================
// PART C -- ONLY 073 applied. The overpayment-hold guard must still be
// fully enforced; the MASAV-overlap guards must not throw against a table
// that genuinely does not exist in this state.
// ===========================================================================
async function partC() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Migrations 073 AND 074 are both genuinely applied for real now
    // (2026-10-17) -- a throwaway transaction can ADD things temporarily
    // but cannot make an already-committed, real table disappear just by
    // not re-creating it. To actually simulate "ONLY 073 applied" (074
    // genuinely absent), 074's table must be explicitly dropped here --
    // safe, since this whole transaction ROLLBACKs at the end, restoring
    // the real table untouched.
    await client.query(`DROP TABLE IF EXISTS masav_collection_proposals CASCADE`);
    await drop073Triggers(client); // NOT drop074Trigger -- its table was just dropped above
    const sql073 = fs.readFileSync(path.join(__dirname, '../migrations/073_fin11_payment_exceptions.sql'), 'utf8');
    await client.query(sql073);

    check('C0. sanity: payment_exceptions exists (073 only)', await isPaymentExceptionsSchemaPresent(client));
    check('C0a. sanity: masav_collection_proposals does NOT exist (074 not applied)', (await isMasavProposalsSchemaPresent(client)) === false);

    const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    const { makeEntity, makeStatement } = makeFixtureFactory(client, userId, 'c', 2109);

    // C1: the overpayment-hold guard (073's own data) is NOT bypassed just
    // because 074 happens to be missing -- the two guards are gated
    // independently, one per table.
    const e1 = await makeEntity();
    const s1 = await makeStatement(e1.accountId, 1000);
    const attemptRes = await client.query(`INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, status, requested_amount) VALUES ($1,'card',1,'succeeded',3000) RETURNING id`, [s1]);
    const paymentRes = await client.query(`INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at) VALUES ($1,$2,3000,'cardcom','tx-schema-compat-c1',NOW()) RETURNING id`, [s1, attemptRes.rows[0].id]);
    const excRes = await client.query(
      `INSERT INTO payment_exceptions (statement_id, collection_attempt_id, payment_id, entity_id, outstanding_before, collected_amount, overpayment_amount)
       VALUES ($1,$2,$3,$4,1000,3000,2000) RETURNING id`,
      [s1, attemptRes.rows[0].id, paymentRes.rows[0].id, e1.entityId]
    );
    const exceptionId1 = excRes.rows[0].id;
    const s1b = await makeStatement(e1.accountId, 500);
    const cGuard1 = await openAttemptGuardsCore(client, s1b);
    check('C1. openAttempt guard still holds on an open exception when ONLY 073 is applied (not bypassed by 074 being absent)', cGuard1.skipped === true && cGuard1.reason === 'entity_collection_held' && cGuard1.exceptionId === exceptionId1, JSON.stringify(cGuard1));

    // C2: a Statement with no hold does not throw when openAttempt reaches
    // the (skipped, because absent) MASAV-exported check -- proves the
    // skip, not an attempted query against a nonexistent table.
    const e2 = await makeEntity();
    const s2 = await makeStatement(e2.accountId, 500);
    let cGuard2;
    try {
      cGuard2 = await openAttemptGuardsCore(client, s2);
      check('C2. openAttempt guard does not throw on the (absent) MASAV-exported check when ONLY 073 is applied', cGuard2.skipped === false, JSON.stringify(cGuard2));
    } catch (err) {
      check('C2. openAttempt guard does not throw on the (absent) MASAV-exported check when ONLY 073 is applied', false, `THREW: ${err.message}`);
    }

    // C3: openMasavAttempt's guard (074-only) does not throw when 074 is
    // absent, even though 073 is present -- independent gating confirmed
    // from the other direction too.
    let cGuard3;
    try {
      cGuard3 = await openMasavAttemptGuardCore(client, s2);
      check('C3. openMasavAttempt guard does not throw when 074 is absent, even with 073 present', cGuard3.skipped === false, JSON.stringify(cGuard3));
    } catch (err) {
      check('C3. openMasavAttempt guard does not throw when 074 is absent, even with 073 present', false, `THREW: ${err.message}`);
    }

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ===========================================================================
// PART D -- ONLY 074 applied. The MASAV-overlap guards must still be fully
// enforced; the overpayment-hold guard must not throw against a table that
// genuinely does not exist in this state.
// ===========================================================================
async function partD() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // See partC's comment -- both migrations are genuinely applied for
    // real now, so simulating "ONLY 074 applied" requires explicitly
    // dropping 073's table here (safe -- this transaction ROLLBACKs,
    // restoring the real table untouched).
    await client.query(`DROP TABLE IF EXISTS payment_exceptions CASCADE`);
    await drop074Trigger(client); // NOT drop073Triggers -- its table was just dropped above
    const sql074 = fs.readFileSync(path.join(__dirname, '../migrations/074_fin11_masav_collection_proposals.sql'), 'utf8');
    await client.query(sql074);

    check('D0. sanity: masav_collection_proposals exists (074 only)', await isMasavProposalsSchemaPresent(client));
    check('D0a. sanity: payment_exceptions does NOT exist (073 not applied)', (await isPaymentExceptionsSchemaPresent(client)) === false);

    const userRes = await client.query(`SELECT id FROM users ORDER BY id LIMIT 1`);
    const userId = userRes.rows[0].id;
    const { makeEntity, makeStatement } = makeFixtureFactory(client, userId, 'd', 2110);

    // D1: the MASAV-exported guard inside openAttempt (074's own data) is
    // fully enforced even though 073 is missing.
    const e1 = await makeEntity();
    const s1 = await makeStatement(e1.accountId, 5000);
    const proposalRes = await client.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status)
       VALUES ($1,$2,5000,5000,'exported') RETURNING id`,
      [s1, e1.entityId]
    );
    const proposalId1 = proposalRes.rows[0].id;
    const dGuard1 = await openAttemptGuardsCore(client, s1);
    check('D1. openAttempt guard still blocks an unresolved exported MASAV proposal when ONLY 074 is applied (not bypassed by 073 being absent)', dGuard1.skipped === true && dGuard1.reason === 'masav_proposal_exported_unresolved' && dGuard1.proposalId === proposalId1, JSON.stringify(dGuard1));

    // D2: openMasavAttempt's own guard (074's own data) is also fully
    // enforced in this state.
    const e2 = await makeEntity();
    const s2 = await makeStatement(e2.accountId, 5000);
    const proposalRes2 = await client.query(
      `INSERT INTO masav_collection_proposals (statement_id, entity_id, proposed_amount, outstanding_at_proposal, status)
       VALUES ($1,$2,5000,5000,'proposed') RETURNING id`,
      [s2, e2.entityId]
    );
    const proposalId2 = proposalRes2.rows[0].id;
    const dGuard2 = await openMasavAttemptGuardCore(client, s2);
    check('D2. openMasavAttempt guard still blocks an active FIN-11 proposal when ONLY 074 is applied', dGuard2.skipped === true && dGuard2.reason === 'fin11_masav_proposal_active' && dGuard2.proposalId === proposalId2, JSON.stringify(dGuard2));

    // D3: a Statement with no exported proposal does not throw when
    // openAttempt reaches the (skipped, because absent) hold check.
    const e3 = await makeEntity();
    const s3 = await makeStatement(e3.accountId, 500);
    let dGuard3;
    try {
      dGuard3 = await openAttemptGuardsCore(client, s3);
      check('D3. openAttempt guard does not throw on the (absent) overpayment-hold check when ONLY 074 is applied', dGuard3.skipped === false, JSON.stringify(dGuard3));
    } catch (err) {
      check('D3. openAttempt guard does not throw on the (absent) overpayment-hold check when ONLY 074 is applied', false, `THREW: ${err.message}`);
    }

    await client.query('ROLLBACK');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ===========================================================================
// PART E -- connection/transaction scoping: the presence check's answer
// depends on WHICH connection asks, proving why every real call site must
// pass its own in-transaction `client`, never the bare `pool`.
// ===========================================================================
async function partE() {
  const txClient = await pool.connect();
  try {
    await txClient.query('BEGIN');
    // Migration 073 is genuinely applied for real now (2026-10-17), so
    // proving "a different connection can't see THIS transaction's own
    // uncommitted change" needs an uncommitted change to actually make --
    // an uncommitted DROP (MVCC: invisible to every other session until
    // this COMMITs, restored untouched by the ROLLBACK below either way).
    await txClient.query(`DROP TABLE IF EXISTS payment_exceptions CASCADE`);

    const seenByTxClient = await isPaymentExceptionsSchemaPresent(txClient);
    const seenByBarePool = await isPaymentExceptionsSchemaPresent(pool); // a DIFFERENT connection, outside this uncommitted transaction
    check('E1. the SAME in-transaction client sees its OWN uncommitted DROP -- payment_exceptions reads as absent', seenByTxClient === false);
    check('E2. a DIFFERENT connection (bare pool) does NOT see this transaction\'s own uncommitted DROP -- still reads the real, untouched table as present. Confirms the check is connection/transaction-scoped, not a global cache -- two connections asking "right now" can get OPPOSITE answers depending on which one holds the relevant lock/transaction', seenByBarePool === true, `seenByBarePool=${seenByBarePool}`);

    await txClient.query('ROLLBACK');
  } catch (err) {
    await txClient.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    txClient.release();
  }

  // E3: confirm every real call site passes a client, never the bare pool
  // (grep-based, mirrors the static-scan convention already established in
  // test-donation-cardcom-separation.js/test-israel-invoices-tax-id.js).
  const collectionSrc = fs.readFileSync(path.join(__dirname, '../src/modules/collection-engine/collection.service.js'), 'utf8');
  const masavSrc = fs.readFileSync(path.join(__dirname, '../src/modules/collection-engine/masav-collection.service.js'), 'utf8');
  const badCallsCollection = collectionSrc.match(/is(PaymentExceptions|MasavProposals)SchemaPresent\(\s*\)|is(PaymentExceptions|MasavProposals)SchemaPresent\(\s*pool\s*\)/g) || [];
  const badCallsMasav = masavSrc.match(/is(PaymentExceptions|MasavProposals)SchemaPresent\(\s*\)|is(PaymentExceptions|MasavProposals)SchemaPresent\(\s*pool\s*\)/g) || [];
  check('E3. collection.service.js never calls the schema probe with no argument / the bare pool (always the transaction client)', badCallsCollection.length === 0, JSON.stringify(badCallsCollection));
  check('E3a. masav-collection.service.js never calls the schema probe with no argument / the bare pool (always the transaction client)', badCallsMasav.length === 0, JSON.stringify(badCallsMasav));
}

partA()
  .then(() => partC())
  .then(() => partD())
  .then(() => partB())
  .then(() => partE())
  .then(async () => {
    const failed = results.filter((r) => !r.pass);
    console.log(`\n=== TOTAL: ${results.length - failed.length}/${results.length} passed ===`);
    if (failed.length) console.log('FAILURES:', failed);
    const leftover = await pool.query(`SELECT COUNT(*) FROM entities WHERE display_name LIKE 'ZZZ_TEST_fin11_schema_compat%'`);
    console.log('\nPost-run verification -- leftover ZZZ_TEST_fin11_schema_compat entities:', leftover.rows[0].count);
    process.exit(failed.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
  });
