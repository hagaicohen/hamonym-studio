// Collection Engine Router (2026-08-28) — domain/state-machine only.
// docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md sections 4-6.
//
// Provider-agnostic by construction: this file never talks to CardCom/MASAV
// directly, only through the adapter contract (adapters/adapter.contract.js).
// Both real adapters are NOT_IMPLEMENTED today (see their own files for
// why) -- runCollectionForStatement is fully exercised in tests via an
// injected fake adapter (resolveAdapter override), proving the state
// machine itself before either real adapter exists.
const pool = require('../../db/db');
const billingRepository = require('../billing/billing.repository');
const defaultGetAdapter = require('./adapters/get-adapter');
const routing = require('./routing');
const { recordFinding } = require('../../jobs/reconciliation-findings');
const { getStatementBalance } = require('../billing-engine/statement-balance.service');

const ACTIONABLE_STATEMENT_STATUSES = ['approved', 'open'];
const ACTIVE_ATTEMPT_STATUSES = ['pending', 'ambiguous'];

// Phase A: lock the Statement, decide whether a new attempt should even be
// opened, and if so open it (INSERT collection_attempts + approved->open),
// all in one transaction so two concurrent callers on the same Statement
// can never both pass the "no active attempt" check -- same locking idiom
// as approval.service.js's SELECT ... FOR UPDATE.
async function openAttempt(statementId, resolveAdapter) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT s.*, ba.entity_id, ba.preferred_collection_method
       FROM statements s
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [statementId]
    );
    const statement = stmtRes.rows[0];
    if (!statement) {
      const err = new Error('Statement not found');
      err.code = 'STATEMENT_NOT_FOUND';
      throw err;
    }

    if (!ACTIONABLE_STATEMENT_STATUSES.includes(statement.status)) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'not_actionable', status: statement.status };
    }

    const activeRes = await client.query(
      `SELECT id FROM collection_attempts WHERE statement_id = $1 AND status = ANY($2::text[])`,
      [statementId, ACTIVE_ATTEMPT_STATUSES]
    );
    if (activeRes.rows[0]) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'attempt_already_active', attemptId: activeRes.rows[0].id };
    }

    // Statement Adjustments (2026-10, FIN) -- the actual amount to charge is
    // the adjusted outstanding balance, not the frozen total_due: a credit
    // adjustment can bring a statement to zero or negative before any
    // attempt is ever opened. Read under the SAME lock already held above
    // (client, still inside this transaction) -- no second lock needed.
    // Never charge zero/negative/already-covered -- this is the one new
    // guard; everything above it (status, active-attempt) is unchanged.
    const balance = await getStatementBalance(statementId, client);
    if (balance.outstanding <= 0) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'no_outstanding_balance', outstanding: balance.outstanding };
    }

    // Dynamic per-Statement routing (Billing v1 Bundle 1/2 correction) --
    // billing_accounts.preferred_collection_method is read above only as
    // display/reference context; it is no longer the routing decision. See
    // routing.js and docs/HAMONYM_BILLING_ENGINE_SPEC.md's routing table.
    const routed = await routing.resolveCollectionMethod(client, statement);
    if (routed.blocked) {
      // total_due is above the card threshold and MASAV isn't configured/
      // authorized yet -- never silently fall back to card. Same
      // "record a finding, attempt nothing" shape as not_implemented below.
      await recordFinding(client, {
        jobName: 'collection-router',
        findingType: 'masav_blocked_pending_authorization',
        severity: 'warning',
        subjectType: 'statement',
        subjectId: statementId,
        details: { reason: routed.reason, entityId: statement.entity_id, totalDue: statement.total_due },
      });
      await client.query('COMMIT');
      return { skipped: true, reason: routed.reason };
    }

    const method = routed.method;
    const adapter = resolveAdapter(method);

    if (adapter.NOT_IMPLEMENTED) {
      // Symmetric with how the design treats MASAV: record the gap,
      // attempt nothing, never spam a fake failed attempt row every time
      // the Router runs.
      await recordFinding(client, {
        jobName: 'collection-router',
        findingType: 'collection_method_not_implemented',
        severity: 'warning',
        subjectType: 'statement',
        subjectId: statementId,
        details: { collectionMethod: method, entityId: statement.entity_id },
      });
      await client.query('COMMIT');
      return { skipped: true, reason: 'not_implemented', collectionMethod: method };
    }

    let paymentInstrument = null;
    if (method === 'card') {
      paymentInstrument = await billingRepository.getActiveDefaultByEntityId(statement.entity_id);
      if (!paymentInstrument) {
        // No attempt row for this either -- there is nothing to attempt yet,
        // same principle as not_implemented: a finding, not a fake failure.
        await recordFinding(client, {
          jobName: 'collection-router',
          findingType: 'no_active_payment_instrument',
          severity: 'warning',
          subjectType: 'statement',
          subjectId: statementId,
          details: { entityId: statement.entity_id },
        });
        await client.query('COMMIT');
        return { skipped: true, reason: 'no_active_payment_instrument' };
      }
    }

    const nextAttemptRes = await client.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next FROM collection_attempts WHERE statement_id = $1`,
      [statementId]
    );
    const attemptNumber = nextAttemptRes.rows[0].next;

    const insertRes = await client.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount)
       VALUES ($1, $2, $3, $4)
       RETURNING id, attempt_number`,
      [statementId, method, attemptNumber, balance.outstanding]
    );

    if (statement.status === 'approved') {
      await client.query(`UPDATE statements SET status = 'open' WHERE id = $1`, [statementId]);
    }

    await client.query('COMMIT');
    return {
      skipped: false,
      attemptId: insertRes.rows[0].id,
      attemptNumber: insertRes.rows[0].attempt_number,
      method,
      paymentInstrument,
      entityId: statement.entity_id,
      requestedAmount: balance.outstanding,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Phase C: resolve an opened attempt against the adapter's outcome. Runs in
// its own transaction, after the (possibly slow) external call in Phase B
// has already returned -- no DB lock is held during the network call.
async function resolveAttempt(attemptId, statementId, outcome) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE collection_attempts
       SET status = $2, provider_reference = $3, provider_raw_status = $4,
           failure_reason = $5, resolved_at = NOW()
       WHERE id = $1`,
      [attemptId, outcome.outcome, outcome.providerReference || null, outcome.providerRawStatus || null, outcome.failureReason || null]
    );

    let statementStatus = null;
    if (outcome.outcome === 'succeeded') {
      const attemptRes = await client.query(
        `SELECT requested_amount, provider FROM collection_attempts WHERE id = $1`,
        [attemptId]
      );
      const attempt = attemptRes.rows[0];

      await client.query(
        `INSERT INTO payments (statement_id, collection_attempt_id, amount, provider, provider_reference, received_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [statementId, attemptId, attempt.requested_amount, attempt.provider, outcome.providerReference]
      );

      // Reconciled against adjustedTotal (Statement Adjustments, 2026-10),
      // not raw total_due -- a credit added after this payment was already
      // in flight must not leave the statement permanently stuck "open"
      // just because the original, pre-adjustment total was never fully
      // matched by payments alone.
      const balance = await getStatementBalance(statementId, client);
      if (balance.collected >= balance.adjustedTotal) {
        await client.query(`UPDATE statements SET status = 'paid' WHERE id = $1`, [statementId]);
        statementStatus = 'paid';
      }
    }
    // declined / technical_failure / ambiguous: Statement stays 'open'.
    // Retrying (a later openAttempt call) is a separate, deliberate action --
    // this function never opens a new attempt itself.

    await client.query('COMMIT');
    return { attemptId, outcome: outcome.outcome, statementStatus };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Full pipeline for one Statement. resolveAdapter is an injection seam for
// tests only (defaults to the real registry) -- see design doc section 6.1
// for why both real adapters refuse to actually charge anything today.
async function runCollectionForStatement(statementId, { resolveAdapter = defaultGetAdapter } = {}) {
  const opened = await openAttempt(statementId, resolveAdapter);
  if (opened.skipped) return opened;

  const adapter = resolveAdapter(opened.method);
  let outcome;
  try {
    outcome = await adapter.charge({
      statementId,
      attemptId: opened.attemptId,
      amount: opened.requestedAmount,
      paymentInstrument: opened.paymentInstrument,
      entityId: opened.entityId,
    });
  } catch (err) {
    // The adapter itself threw (network error, or -- today -- the
    // NOT_IMPLEMENTED guard, though openAttempt already filters that case
    // out before we get here) -- treated as ambiguous, never assumed safe
    // to retry blindly. Never guess: an exception after the request may
    // have been sent doesn't tell us whether the charge happened.
    outcome = { outcome: 'ambiguous', failureReason: err.message };
  }

  return resolveAttempt(opened.attemptId, statementId, outcome);
}

// FIN-11 Stage 2A (2026-10, revised after Code Review) — PURE READ proposal
// of a CAPPED card collection amount. Deliberately separate from
// openAttempt: that function still serves the old model, where
// routing.resolveCollectionMethod makes ONE binary decision (card vs masav)
// over the Statement's full total_due. FIN-11's hybrid model needs card to
// be able to collect up to a fixed cap regardless of what that routing
// decision would have been for the full amount -- changing openAttempt
// itself to do this would silently change the existing single-method
// route's behavior for every Statement in production today, which is
// explicitly out of scope for this stage.
//
// REVISION HISTORY: the first version of this function created a real
// collection_attempts row (status='pending', collection_method='card') and
// stopped there, intending that as a safe "preparation, not a charge" step.
// Code Review caught a Critical gap that analysis missed: a 'pending',
// non-masav collection_attempts row is EXACTLY what
// collection-attempt-reconciliation.job.js's hourly cron (STUCK_AFTER_HOURS
// = 2, see that job's own candidate query) already scans for -- within a
// couple of hours it would call the real CardCom adapter's reconcile()
// (GetTransactionByExternalUniqTran) for an ExternalUniqTranId that was
// NEVER submitted via charge(), a genuine unintended provider contact. Worse,
// for as long as that row stayed 'pending' it occupied the SAME
// ACTIVE_ATTEMPT_STATUSES slot openAttempt itself checks (line ~51 above),
// so merely calling the "preparation" function would silently freeze the
// Statement's entire collection pipeline -- old path included -- until a
// human intervened. A DB write that looks inert in isolation was not inert
// once the EXISTING cron infrastructure is accounted for.
//
// The fix: this function no longer writes anything, ever. It locks the
// Statement only to read a CONSISTENT snapshot (so a concurrent payment/
// adjustment can't be read half-applied), then releases the lock via a
// plain COMMIT of a transaction that touched no data. It returns a
// *proposal* -- a number and the facts that justified it -- never a
// collection_attempts row, never a status change, never a provider call.
//
// IMPORTANT FOR WHOEVER WIRES THIS UP NEXT (Stage 2B+): the returned
// proposedAmount is a snapshot at the instant this function ran. It goes
// stale the moment the transaction below commits and the lock is released
// -- a concurrent payment, adjustment, or another collection attempt could
// change `outstanding` before any real attempt is ever opened. A future
// stage that actually acts on this proposal MUST recompute
// getStatementBalance() again under a FRESH lock, inside the SAME
// transaction that creates the real collection_attempts row and (if
// relevant) calls the adapter -- never reuse this function's returned
// number as if it were still current by the time a charge happens.
const FIN11_CARD_COLLECTION_CAP = 3000; // ILS -- FIN-11 business decision, docs/finance/FINANCIAL_BUSINESS_DECISIONS.md

// All monetary rounding happens in JS here (unlike the rest of this
// codebase's "arithmetic inside Postgres as NUMERIC" convention -- see
// calculation.service.js) because getStatementBalance() already hands back
// a JS Number (itself a pre-existing design choice, unchanged by this
// stage). Explicit agorot-precision rounding at the one point this number
// is used/returned, rather than trusting Math.min's two float operands to
// already be clean.
function roundToAgorot(amount) {
  return Math.round(amount * 100) / 100;
}

async function getFin11CappedCardProposal(statementId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT s.*, ba.entity_id
       FROM statements s
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       WHERE s.id = $1
       FOR UPDATE OF s`,
      [statementId]
    );
    const statement = stmtRes.rows[0];
    if (!statement) {
      const err = new Error('Statement not found');
      err.code = 'STATEMENT_NOT_FOUND';
      throw err;
    }

    if (!ACTIONABLE_STATEMENT_STATUSES.includes(statement.status)) {
      await client.query('COMMIT');
      return { proposed: false, reason: 'not_actionable', status: statement.status };
    }

    const activeRes = await client.query(
      `SELECT id FROM collection_attempts WHERE statement_id = $1 AND status = ANY($2::text[])`,
      [statementId, ACTIVE_ATTEMPT_STATUSES]
    );
    if (activeRes.rows[0]) {
      await client.query('COMMIT');
      return { proposed: false, reason: 'attempt_already_active', attemptId: activeRes.rows[0].id };
    }

    // Same statement-adjustment-aware balance read as openAttempt, under
    // the same lock -- never the frozen total_due directly.
    const balance = await getStatementBalance(statementId, client);
    const outstanding = roundToAgorot(balance.outstanding);
    if (outstanding <= 0) {
      await client.query('COMMIT');
      return { proposed: false, reason: 'no_outstanding_balance', outstanding };
    }

    const paymentInstrument = await billingRepository.getActiveDefaultByEntityId(statement.entity_id);
    if (!paymentInstrument) {
      await client.query('COMMIT');
      return { proposed: false, reason: 'no_active_payment_instrument' };
    }

    const proposedAmount = roundToAgorot(Math.min(outstanding, FIN11_CARD_COLLECTION_CAP));

    // No INSERT, no UPDATE -- read-only transaction, nothing to roll back
    // even on success. COMMIT here only releases the row lock cleanly.
    await client.query('COMMIT');
    return {
      proposed: true,
      method: 'card',
      paymentInstrument,
      entityId: statement.entity_id,
      proposedAmount,
      outstandingBeforeCap: outstanding,
      cappedAt: FIN11_CARD_COLLECTION_CAP,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  runCollectionForStatement,
  openAttempt,
  resolveAttempt,
  ACTIONABLE_STATEMENT_STATUSES,
  ACTIVE_ATTEMPT_STATUSES,
  getFin11CappedCardProposal,
  FIN11_CARD_COLLECTION_CAP,
};
