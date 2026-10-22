// FIN-11 Stage 4 — card collection orchestration (2026-10).
// docs/finance/FIN11_STAGE4_TECHNICAL_DESIGN.md has the full design.
//
// Reuses existing services verbatim -- no financial logic is reimplemented:
//   - getStatementBalance / payment-exceptions.service / fin11-schema-probe
//     (same guard primitives collection.service.js itself uses)
//   - masav-proposal.service#hasExportedMasavProposal (cross-channel guard)
//   - collection.service#resolveAttempt (the ONE finalization path in this
//     codebase -- the live Router, collection-attempt-reconciliation.job.js,
//     and this orchestrator all call the exact same function)
//
// The ONE new write path this file adds is openFin11CappedCardAttempt --
// a write-capable sibling of collection.service.js#getFin11CappedCardProposal
// (Stage 2A). That function is PURE READ by deliberate design (see its own
// header + Code Review history: a first version wrote a real attempt row
// and a Critical gap followed). It stays that way. This file's function
// mirrors its exact guard sequence (the same precedent Stage 2A itself set
// relative to openAttempt -- structural duplication of GUARD CHECKS, never
// of charge/payment logic) and is the ONLY place in the codebase that opens
// a collection_attempts row for less than the full outstanding balance.
// collection.service.js#openAttempt itself is NEVER modified -- its own
// header explicitly warns that changing its behavior would silently affect
// every Statement's existing single-method route, out of scope for FIN-11.
const pool = require('../../db/db');
const billingRepository = require('../billing/billing.repository');
const { recordFinding } = require('../../jobs/reconciliation-findings');
const { queueAdminNotification, sendAdminNotification } = require('../email/admin-notification.service');

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
function billingMonthLabel(periodEnd) {
  if (!periodEnd) return null;
  const d = new Date(periodEnd);
  // period_end is the cutoff INTO the next cycle -- the billing month it
  // closes is the one before it (28th of month M closes month M itself,
  // so this just reads periodEnd's own UTC month, matching every other
  // "ספטמבר 2026"-style label already used in this codebase).
  return `${HEBREW_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const { getStatementBalance } = require('./statement-balance.service');
const paymentExceptions = require('./payment-exceptions.service');
const { isPaymentExceptionsSchemaPresent, isMasavProposalsSchemaPresent } = require('./fin11-schema-probe');
const { computeAttemptDueInstant } = require('./billing-period.util');

const {
  ACTIONABLE_STATEMENT_STATUSES,
  ACTIVE_ATTEMPT_STATUSES,
  FIN11_CARD_COLLECTION_CAP,
  // Consolidation fix (2026-10): MAX_CARD_ATTEMPTS/CONFIRMED_FAILURE_STATUSES
  // used to be defined locally in this file. They now live in
  // collection.service.js (single source of truth) because openAttempt --
  // the legacy manual "גבה" entry point -- enforces the exact same policy
  // too. Values/business meaning are unchanged (FINANCIAL_BUSINESS_
  // DECISIONS.md, FIN-11 hybrid collection section): at most 3 card
  // attempts total per Statement, retry only after a CONFIRMED failure.
  MAX_CARD_ATTEMPTS,
  CONFIRMED_FAILURE_STATUSES,
  resolveAttempt,
} = require('../collection-engine/collection.service');

function roundToAgorot(amount) {
  return Math.round(amount * 100) / 100;
}

// Attention and email bookkeeping run only after the financial commit.
// Persisted card attempts are the recovery source if any of these writes fail.
async function prepareExhaustedNotification(db, statement, attemptsSoFar, failureReason) {
  await recordFinding(db, {
    jobName: 'fin11-card-collection',
    findingType: 'fin11_card_attempts_exhausted',
    severity: 'critical',
    subjectType: 'statement',
    subjectId: statement.id,
    details: { entityId: statement.entity_id, attemptsSoFar },
  });
  return {
    incidentKey: `fin11_card_exhausted:${statement.id}`,
    data: {
      findingType: 'fin11_card_attempts_exhausted',
      jobName: 'fin11-card-collection',
      subjectType: 'statement',
      subjectId: statement.id,
      foundAt: new Date().toISOString(),
      details: {
        entityName: statement.entity_name,
        billingMonth: billingMonthLabel(statement.period_end),
        outstandingDisplay: `₪${Number((await getStatementBalance(statement.id, db)).outstanding).toLocaleString('he-IL')}`,
        failureReason,
      },
    },
  };
}

// Reused by immediate delivery and the EXISTING email recovery job. No charge,
// financial transaction or financial mutation is reachable from this function.
async function notifyExhaustedCardStatement(db, statementId, { attemptId, recovery = false } = {}) {
  try {
    const res = await db.query(
      `SELECT ca.id, ca.status, bp.period_end, ba.entity_id, e.display_name AS entity_name
       FROM collection_attempts ca
       JOIN statements s ON s.id = ca.statement_id
       JOIN billing_periods bp ON bp.id = s.billing_period_id
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       JOIN entities e ON e.id = ba.entity_id
       WHERE ca.statement_id = $1 AND ca.collection_method = 'card'
       ORDER BY ca.attempt_number DESC`,
      [statementId]
    );
    const cards = res.rows;
    if (!cards.length || (attemptId && cards[0].id !== attemptId)
        || !cards.every((a) => CONFIRMED_FAILURE_STATUSES.includes(a.status))) return;
    const { maxAttempts } = await computeAttemptDueInstant(db, cards[0].period_end, cards.length + 1);
    if (cards.length < Math.min(MAX_CARD_ATTEMPTS, maxAttempts)) return;
    const notification = await prepareExhaustedNotification(db, {
      ...cards[0], id: statementId,
    }, cards.length, cards[0].status);
    if (recovery) return await sendAdminNotification('fin11_card_attempts_exhausted', notification);
    queueAdminNotification('fin11_card_attempts_exhausted', notification);
  } catch (err) {
    console.error('[FIN11 notification] dispatch deferred to recovery:', err.message);
    return { status: 'error' };
  }
}

async function openFin11CappedCardAttempt(statementId, now = new Date()) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const stmtRes = await client.query(
      `SELECT s.*, ba.entity_id, bp.period_end, e.display_name AS entity_name
       FROM statements s
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       JOIN billing_periods bp ON bp.id = s.billing_period_id
       JOIN entities e ON e.id = ba.entity_id
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

    // Same deploy-order-safe gating as openAttempt/getFin11CappedCardProposal
    // (fin11-schema-probe.js) -- identical reasoning, not re-derived here.
    if (await isPaymentExceptionsSchemaPresent(client)) {
      const hold = await paymentExceptions.hasOpenCollectionHold(statement.entity_id, client);
      if (hold.held) {
        await client.query('COMMIT');
        return { skipped: true, reason: 'entity_collection_held', exceptionId: hold.exceptionId };
      }
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

    if (await isMasavProposalsSchemaPresent(client)) {
      const { hasExportedMasavProposal } = require('./masav-proposal.service');
      const exportedMasav = await hasExportedMasavProposal(statementId, client);
      if (exportedMasav.exists) {
        await client.query('COMMIT');
        return { skipped: true, reason: 'masav_proposal_exported_unresolved', proposalId: exportedMasav.proposalId };
      }
    }

    // 3-attempts-total / confirmed-failure-only retry gate. Checked against
    // the REAL attempt history every time (not a counter passed in by a
    // caller), so this is safe no matter which job/path calls this function
    // or how many times: the 28th's own orchestrator job, a later retry
    // sweep, or a future admin "retry now" action would all see the exact
    // same, current truth.
    const attemptsRes = await client.query(
      `SELECT status FROM collection_attempts WHERE statement_id = $1 AND collection_method = 'card' ORDER BY attempt_number DESC`,
      [statementId]
    );
    const cardAttempts = attemptsRes.rows;
    if (cardAttempts.length > 0) {
      const latestStatus = cardAttempts[0].status;
      if (!CONFIRMED_FAILURE_STATUSES.includes(latestStatus)) {
        // succeeded -> no_outstanding_balance below already covers it in
        // practice; pending/ambiguous -> already structurally blocked by
        // the active-attempt check above. This is kept as an explicit,
        // auditable second guard rather than relying on that alone -- never
        // retry on anything but a CONFIRMED failure.
        await client.query('COMMIT');
        return { skipped: true, reason: 'latest_attempt_not_a_confirmed_failure', latestStatus };
      }
    }

    const nextAttemptNumber = cardAttempts.length + 1;
    const { dueAt, maxAttempts } = await computeAttemptDueInstant(client, statement.period_end, nextAttemptNumber);
    if (cardAttempts.length >= Math.min(MAX_CARD_ATTEMPTS, maxAttempts)) {
      await client.query('COMMIT');
      await notifyExhaustedCardStatement(client, statementId);
      return { skipped: true, reason: 'max_attempts_reached', attemptsSoFar: cardAttempts.length };
    }
    if (now < dueAt) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'retry_not_yet_due', attemptNumber: nextAttemptNumber, dueAt: dueAt.toISOString() };
    }

    const balance = await getStatementBalance(statementId, client);
    const outstanding = roundToAgorot(balance.outstanding);
    if (outstanding <= 0) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'no_outstanding_balance', outstanding };
    }

    const paymentInstrument = await billingRepository.getActiveDefaultByEntityId(statement.entity_id);
    if (!paymentInstrument) {
      await client.query('COMMIT');
      return { skipped: true, reason: 'no_active_payment_instrument' };
    }

    const requestedAmount = roundToAgorot(Math.min(outstanding, FIN11_CARD_COLLECTION_CAP));

    const nextAttemptRes = await client.query(
      `SELECT COALESCE(MAX(attempt_number), 0) + 1 AS next FROM collection_attempts WHERE statement_id = $1`,
      [statementId]
    );
    const attemptNumber = nextAttemptRes.rows[0].next;

    const insertRes = await client.query(
      `INSERT INTO collection_attempts (statement_id, collection_method, attempt_number, requested_amount)
       VALUES ($1, 'card', $2, $3)
       RETURNING id, attempt_number`,
      [statementId, attemptNumber, requestedAmount]
    );

    if (statement.status === 'approved') {
      await client.query(`UPDATE statements SET status = 'open' WHERE id = $1`, [statementId]);
    }

    await client.query('COMMIT');
    return {
      skipped: false,
      attemptId: insertRes.rows[0].id,
      attemptNumber: insertRes.rows[0].attempt_number,
      cardAttemptNumber: nextAttemptNumber,
      maxAutomaticAttempts: maxAttempts,
      method: 'card',
      paymentInstrument,
      entityId: statement.entity_id,
      entityName: statement.entity_name,
      periodEnd: statement.period_end,
      requestedAmount,
      cappedAt: FIN11_CARD_COLLECTION_CAP,
      outstandingBeforeCap: outstanding,
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// One full charge cycle: open a capped attempt, call the adapter, resolve
// it. Reuses resolveAttempt() verbatim -- same finalization path the live
// Router and the reconciliation job both already use, no parallel one
// invented here. `resolveAdapter` is the SAME injection seam
// runCollectionForStatement uses (a function method -> adapter), defaulting
// to the real registry only via the caller (never hardcoded in this file),
// so every test here runs against an injected fake, never a real provider
// call.
async function runFin11CardCollectionCycle(statementId, resolveAdapter, now = new Date()) {
  const opened = await openFin11CappedCardAttempt(statementId, now);
  if (opened.skipped) return opened;

  const adapter = resolveAdapter('card');
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
    // Same "never guess" rule as runCollectionForStatement itself.
    outcome = { outcome: 'ambiguous', failureReason: err.message };
  }

  const resolved = await resolveAttempt(opened.attemptId, statementId, outcome);

  // Final confirmed failures are reported by the shared resolveAttempt path,
  // including later reconciliation. Preserve recovery and interim notifications.
  if (resolved.outcome === 'succeeded' && opened.attemptNumber > 1) {
    queueAdminNotification('fin11_card_collection_recovered', {
      incidentKey: `fin11_card_recovered:${opened.attemptId}`,
      data: {
        findingType: 'fin11_card_collection_recovered',
        jobName: 'fin11-card-collection',
        subjectType: 'statement',
        subjectId: statementId,
        foundAt: new Date().toISOString(),
        severity: 'administrative',
        details: {
          entityName: opened.entityName,
          billingMonth: billingMonthLabel(opened.periodEnd),
          collectedDisplay: `₪${Number(opened.requestedAmount).toLocaleString('he-IL')}`,
          priorFailures: opened.attemptNumber - 1,
        },
      },
    });
  } else if (CONFIRMED_FAILURE_STATUSES.includes(resolved.outcome) && opened.cardAttemptNumber < opened.maxAutomaticAttempts) {
    queueAdminNotification('fin11_card_collection_failed', {
      incidentKey: `fin11_card_failed:${opened.attemptId}`,
      data: {
        findingType: 'fin11_card_collection_failed',
        jobName: 'fin11-card-collection',
        subjectType: 'statement',
        subjectId: statementId,
        foundAt: new Date().toISOString(),
        details: {
          entityName: opened.entityName,
          billingMonth: billingMonthLabel(opened.periodEnd),
          outstandingDisplay: `₪${Number(opened.requestedAmount).toLocaleString('he-IL')}`,
          attemptNumber: opened.attemptNumber,
          failureReason: resolved.outcome,
          nextAction: opened.cardAttemptNumber === 1 && opened.maxAutomaticAttempts === 3 ? 'ניסיון נוסף יתבצע ביום האחרון בחודש או ב-30 לחודש, המוקדם מביניהם' : 'ניסיון נוסף (אחרון) יתבצע ב-2 לחודש הבא',
        },
      },
    });
  }

  return { ...opened, resolved };
}

// Synchronous retry loop. CardCom's charge() is a synchronous request/
// response (collection.service.js's own resolveAttempt comment: no
// authorize-then-capture model, no amount-echo field, success or a
// confirmed decline is known immediately) -- so when budget remains after
// a CONFIRMED failure, the next attempt can be opened right away, inside
// the SAME call. Stops immediately on: success, the 3-attempt cap
// (openFin11CappedCardAttempt raises the Super Admin finding itself), or
// any outcome that is NOT a confirmed failure (ambiguous -- left for
// collection-attempt-reconciliation.job.js to resolve later; this function
// never guesses or retries blind on an inconclusive result). Also the
// correct function to call from a LATER retry sweep for a statement whose
// attempt was 'ambiguous' at the time of the original run and has since
// been confirmed by reconciliation -- the loop and the underlying guard
// both re-check real DB state every time, not a count carried from before.
// 2026-10 FINAL business spec supersedes the old "retry immediately in the
// same call while budget remains" design: "a maximum of three AUTOMATIC
// attempts in total, not three immediate consecutive attempts". At most
// ONE cycle per call now -- the openFin11CappedCardAttempt due-date gate
// (computeAttemptDueInstant) is what actually spaces attempt 2 to the 30th and
// attempt 3 to the 2nd of the next month, across SEPARATE calls of this
// function (the daily job tick, a retry sweep, a later manual check) --
// not a loop inside one call. The function name/array return shape is
// kept (job.js reads `cycles[cycles.length-1]`) to avoid touching callers
// beyond this file.
async function collectWithRetries(statementId, resolveAdapter, now = new Date()) {
  const cycle = await runFin11CardCollectionCycle(statementId, resolveAdapter, now);
  return [cycle];
}

module.exports = {
  notifyExhaustedCardStatement,
  openFin11CappedCardAttempt,
  runFin11CardCollectionCycle,
  collectWithRetries,
  MAX_CARD_ATTEMPTS,
  CONFIRMED_FAILURE_STATUSES,
};
