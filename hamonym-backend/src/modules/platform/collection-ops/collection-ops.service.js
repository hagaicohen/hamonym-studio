// Collection Ops -- aggregation layer for the unified Super Admin "ניהול
// גבייה" page (2026-10). This module NEVER reimplements a financial
// calculation: every number here is either (a) a straight SQL SUM over the
// same ledger columns statement-balance.service.js#getStatementBalance
// already treats as authoritative (statements.total_due,
// statement_adjustments.delta_amount, payments.amount), done as one
// aggregate query instead of one getStatementBalance() call per Statement
// for performance, or (b) a direct pass-through composition of an already-
// existing, already-tested list function (payment-exceptions.service.js,
// masav-proposal.service.js, masav-collection.service.js). No new
// collection/approval/routing decision is made anywhere in this file --
// it only reads and shapes data for display.
const pool = require('../../../db/db');
const jobRunner = require('../../../jobs');
const paymentExceptions = require('../../billing-engine/payment-exceptions.service');
const masavProposals = require('../../billing-engine/masav-proposal.service');
const masavCollectionService = require('../../collection-engine/masav-collection.service');
const platformBillingSettings = require('../../billing-engine/platform-billing-settings.service');
const billingPeriodUtil = require('../../billing-engine/billing-period.util');
const routing = require('../../collection-engine/routing');
const clock = require('../../../lib/clock');

// Statuses that represent a real, committed financial obligation.
// 'draft' is excluded -- still being calculated, not yet approved, so
// counting it would overstate what the platform has actually billed.
// 'cancelled'/'written_off'/'abandoned' are excluded -- explicitly voided,
// never owed. This mirrors collection.service.js#ACTIONABLE_STATEMENT_
// STATUSES plus 'paid' (the one terminal status that DOES represent real
// money already collected, which ACTIONABLE deliberately excludes because
// it means "nothing left to collect", not "not a real obligation").
const OVERVIEW_STATEMENT_STATUSES = ['approved', 'open', 'paid'];

// ---------------------------------------------------------------------------
// A. Financial overview -- the four headline numbers, period-scoped, plus
// visibility into unpaid balances carried over from earlier periods.
// ---------------------------------------------------------------------------
// Accrued platform fees for a calendar month BEFORE any Statement exists for
// it (2026-10, month-nav fix) -- read-only, reuses calculation.service.js's
// exact eligibility predicate (paid, non-mock, in-window, not yet consumed
// by a Statement) and per-entity fee_rate/VAT math, never writes anything.
// A month a billing_periods row already covers still gets this computed (it
// just won't matter once a real Statement exists for it) -- callers decide
// which block to show based on whether `period` below is non-null.
async function getAccruedPreview(periodStart, periodEnd) {
  const { rows: activity } = await pool.query(
    `SELECT d.entity_id, COUNT(*)::int AS donation_count, SUM(d.amount) AS gross_raised
     FROM donations d
     JOIN entities e ON e.id = d.entity_id AND e.status = 'active'
     WHERE d.status = 'paid'
       AND d.billing_effective_at >= $1 AND d.billing_effective_at < $2
       AND d.effective_statement_id IS NULL
     GROUP BY d.entity_id`,
    [periodStart, periodEnd]
  );

  if (activity.length === 0) {
    return { donationCount: 0, entitiesWithActivity: 0, grossRaised: 0, accruedFee: 0, accruedVat: 0, accruedTotal: 0, entitiesMissingAccount: [] };
  }

  const entityIds = activity.map((r) => r.entity_id);
  const { rows: accounts } = await pool.query(
    `SELECT entity_id, fee_rate FROM billing_accounts WHERE entity_id = ANY($1::uuid[]) AND enforcement_status = 'active'`,
    [entityIds]
  );
  const feeRateByEntity = new Map(accounts.map((a) => [a.entity_id, Number(a.fee_rate)]));
  const vatRate = Number(await platformBillingSettings.getCurrentVatRate());

  let donationCount = 0;
  let grossRaised = 0;
  let accruedFee = 0;
  const entitiesMissingAccount = [];
  for (const row of activity) {
    donationCount += row.donation_count;
    grossRaised += Number(row.gross_raised);
    const feeRate = feeRateByEntity.get(row.entity_id);
    if (feeRate == null) { entitiesMissingAccount.push(row.entity_id); continue; }
    accruedFee += Math.round(Number(row.gross_raised) * feeRate * 100) / 100;
  }
  const accruedVat = Math.round(accruedFee * vatRate * 100) / 100;

  return {
    donationCount,
    entitiesWithActivity: activity.length,
    grossRaised,
    accruedFee,
    accruedVat,
    accruedTotal: accruedFee + accruedVat,
    entitiesMissingAccount,
  };
}

exports.getFinancialOverview = async ({ year, month }) => {
  if (!year || !month) {
    const err = new Error('year and month are required');
    err.code = 'MISSING_PERIOD';
    throw err;
  }

  // The REAL frozen boundary model (2026-09-18 restoration), not a naive
  // calendar month -- same function billing-ops' own "בחר חודש" action and
  // the monthly job use, so this page can never disagree with them about
  // what "October 2026" means. History through September 2026 stays
  // calendar-month-shaped; October onward is the 28th-20:00-Israel-time
  // rolling cutoff (billing-period.util.js's own header explains why).
  const { periodStart, periodEnd } = await billingPeriodUtil.resolveSelectedMonthBoundary(pool, year, month);

  const accrued = await getAccruedPreview(periodStart, periodEnd);

  // Total donations actually made in this period -- unconditional on
  // whether a Statement has since consumed them (unlike accrued's
  // eligibility predicate, which intentionally excludes already-consumed
  // donations since its whole purpose is previewing an UNBILLED fee). The
  // "סך התרומות" KPI must keep showing the real total even after a real
  // Statement exists for the period, not drop to 0 the moment donations
  // get consumed.
  const periodDonationsRes = await pool.query(
    `SELECT COUNT(*)::int AS donation_count, COALESCE(SUM(amount), 0) AS gross_raised
     FROM donations
     WHERE status = 'paid'
       AND billing_effective_at >= $1 AND billing_effective_at < $2`,
    [periodStart, periodEnd]
  );
  const periodDonations = {
    donationCount: periodDonationsRes.rows[0].donation_count,
    grossRaised: Number(periodDonationsRes.rows[0].gross_raised),
  };

  // Effective BUSINESS time (clock.js -- real unless Super Admin has an
  // active simulated override) vs this period's real cutoff instant: tells
  // the UI whether collection is "not due yet" or "due, but not run".
  const businessNow = await (clock.billingNow || clock.now)(pool);
  const cutoffPassed = businessNow >= periodEnd;

  const periodRes = await pool.query(
    `SELECT id, period_start, period_end FROM billing_periods WHERE period_start = $1 AND period_end = $2`,
    [periodStart, periodEnd]
  );
  const period = periodRes.rows[0];

  if (!period) {
    // No Statement has ever been calculated for this month -- a real,
    // common state (future month, or past month not yet processed), never
    // an error. Every statement-derived field is explicitly null, not 0,
    // so the frontend can tell "nothing billed yet" apart from "billed
    // exactly ₪0" -- the accrued block above is the only real number for
    // this month so far.
    return {
      period: { id: null, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
      hasStatements: false,
      statementCount: null,
      totalBilled: null,
      paidConfirmed: null,
      inProcess: null,
      openBalance: null,
      carriedOverFromPriorPeriods: { statementCount: 0, outstandingTotal: 0 },
      accrued,
      periodDonations,
      cutoffPassed,
      collectionAttempted: false,
      cardCollectionFailed: false,
      cardCollected: 0,
      masavCollected: 0,
      cardOutstanding: 0,
      masavOutstanding: 0,
    };
  }
  const periodId = period.id;

  // Each Statement's own adjustment total / collected total / "is something
  // already in flight for it" flag -- the exact same three facts
  // getStatementBalance() computes per-Statement (total_due +
  // SUM(statement_adjustments) - SUM(payments)), aggregated here across the
  // whole period in one round trip. "In flight" = a live card attempt
  // (pending/ambiguous, collection.service.js#ACTIVE_ATTEMPT_STATUSES) OR an
  // exported MASAV proposal/legacy attempt whose outcome this codebase
  // cannot yet observe (masav-collection.service.js's documented v1
  // boundary) -- in both cases, money the platform has already sent toward
  // collection but not yet confirmed, as opposed to a balance nothing has
  // been done about yet.
  const { rows } = await pool.query(
    `WITH stmt AS (
       SELECT s.id, s.total_due,
              COALESCE((SELECT SUM(delta_amount) FROM statement_adjustments sa WHERE sa.statement_id = s.id), 0) AS adj,
              COALESCE((SELECT SUM(amount) FROM payments p WHERE p.statement_id = s.id), 0) AS collected,
              EXISTS(
                SELECT 1 FROM collection_attempts ca
                WHERE ca.statement_id = s.id AND ca.status IN ('pending', 'ambiguous')
              ) AS has_active_attempt,
              EXISTS(
                SELECT 1 FROM masav_collection_proposals mp
                WHERE mp.statement_id = s.id AND mp.status = 'exported'
              ) AS has_exported_proposal
       FROM statements s
       WHERE s.billing_period_id = $1 AND s.status = ANY($2::text[])
     )
     SELECT
       COUNT(*)::int AS statement_count,
       COALESCE(SUM(total_due), 0) AS billed_original,
       COALESCE(SUM(adj), 0) AS adjustment_total,
       COALESCE(SUM(collected), 0) AS collected_total,
       COALESCE(SUM(total_due + adj - collected), 0) AS outstanding_total,
       COALESCE(SUM(CASE WHEN has_active_attempt OR has_exported_proposal THEN total_due + adj - collected ELSE 0 END), 0) AS in_process_total,
       COALESCE(SUM(CASE WHEN NOT (has_active_attempt OR has_exported_proposal) THEN total_due + adj - collected ELSE 0 END), 0) AS open_total
     FROM stmt`,
    [periodId, OVERVIEW_STATEMENT_STATUSES]
  );
  const agg = rows[0];

  // Carried-over balances: Statements from ANY earlier period that are
  // still 'approved'/'open' (i.e. still owed) right now. 'paid' is excluded
  // on purpose -- it has zero outstanding by definition, including it would
  // add nothing but a slower query.
  const carriedRes = await pool.query(
    `SELECT COUNT(*)::int AS statement_count,
            COALESCE(SUM(s.total_due + COALESCE((SELECT SUM(sa.delta_amount) FROM statement_adjustments sa WHERE sa.statement_id = s.id), 0)
                         - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.statement_id = s.id), 0)), 0) AS outstanding_total
     FROM statements s
     WHERE s.billing_period_id != $1 AND s.status IN ('approved', 'open')`,
    [periodId]
  );
  const carried = carriedRes.rows[0];

  // Card vs MASAV breakdown (2026-10) -- routing.resolveCollectionMethod is
  // the ONE authoritative routing decision (collection.service.js#openAttempt
  // is its only other caller); reused here read-only, per-statement, never
  // writing a collection_attempts row. A statement already attempted keeps
  // whatever method it was actually attempted under (collection_attempts.
  // collection_method) -- routing is deterministic from total_due + the
  // entity's current MASAV config, so this only ever disagrees with a past
  // attempt if that config changed afterward, same as the real engine would.
  const stmtRowsRes = await pool.query(
    `SELECT s.id, ba.entity_id, s.total_due,
            COALESCE((SELECT SUM(sa.delta_amount) FROM statement_adjustments sa WHERE sa.statement_id = s.id), 0) AS adj,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.statement_id = s.id), 0) AS collected,
            COALESCE((SELECT SUM(p.amount) FROM payments p JOIN collection_attempts ca ON ca.id = p.collection_attempt_id
                      WHERE p.statement_id = s.id AND ca.collection_method = 'card'), 0) AS confirmed_card_collected,
            COALESCE((SELECT SUM(p.amount) FROM payments p JOIN collection_attempts ca ON ca.id = p.collection_attempt_id
                      WHERE p.statement_id = s.id AND ca.collection_method = 'masav'), 0) AS confirmed_masav_collected,
            (SELECT ca.collection_method FROM collection_attempts ca WHERE ca.statement_id = s.id ORDER BY ca.attempt_number DESC LIMIT 1) AS last_attempt_method,
            (SELECT ca.status FROM collection_attempts ca WHERE ca.statement_id = s.id ORDER BY ca.attempt_number DESC LIMIT 1) AS last_attempt_status
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     WHERE s.billing_period_id = $1 AND s.status = ANY($2::text[])`,
    [periodId, OVERVIEW_STATEMENT_STATUSES]
  );
  let cardCollected = 0;
  let masavCollected = 0;
  let cardOutstanding = 0;
  let masavOutstanding = 0;
  let anyCardFailed = false;
  for (const row of stmtRowsRes.rows) {
    const outstanding = Number(row.total_due) + Number(row.adj) - Number(row.collected);
    cardCollected += Number(row.confirmed_card_collected);
    masavCollected += Number(row.confirmed_masav_collected);
    const method = row.last_attempt_method || (await routing.resolveCollectionMethod(pool, row)).method;
    if (method === 'card' && outstanding > 0 && (row.last_attempt_status === 'technical_failure' || row.last_attempt_status === 'declined')) {
      anyCardFailed = true;
    }
    if (method === 'card') {
      cardOutstanding += outstanding;
    } else if (method === 'masav') {
      masavOutstanding += outstanding;
    }
    // method === null (masav blocked, nothing set up yet) intentionally
    // falls into neither bucket -- it already surfaces in "דורש טיפולך"
    // (getNeedsAttention's masav_blocked category), never silently counted
    // as collectible by either channel here.
  }
  const attemptedRes = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM collection_attempts ca JOIN statements s ON s.id = ca.statement_id WHERE s.billing_period_id = $1) AS attempted`,
    [periodId]
  );

  return {
    period: { id: period.id, periodStart: period.period_start, periodEnd: period.period_end },
    statementCount: agg.statement_count,
    // סך החיובים -- the TRUE current obligation for this period, including
    // any statement_adjustments correction, never the frozen total_due alone.
    totalBilled: Number(agg.billed_original) + Number(agg.adjustment_total),
    // שולם -- SUM(payments.amount) only. payments rows are created EXCLUSIVELY
    // by a real, provider-confirmed CARD charge (collection.service.js#
    // resolveAttempt is the only writer); MASAV never writes one (masav-
    // collection.service.js's documented v1 boundary: Hamonym's
    // responsibility ends at file export, no in-app way to assert a MASAV
    // bank result). So this number is never inflated by an exported-but-
    // unconfirmed MASAV instruction -- it is real, confirmed collection,
    // not "sent for collection".
    paidConfirmed: Number(agg.collected_total),
    // בתהליך גבייה -- outstanding on Statements with something already sent
    // toward collection (a live card attempt, or an exported MASAV file)
    // whose outcome isn't known yet.
    inProcess: Number(agg.in_process_total),
    // יתרה פתוחה -- outstanding with NOTHING currently in flight; needs a
    // decision (covered in "דורש טיפולך" when it crosses into an actual
    // exception/failure/block).
    openBalance: Number(agg.open_total),
    carriedOverFromPriorPeriods: {
      statementCount: carried.statement_count,
      outstandingTotal: Number(carried.outstanding_total),
    },
    hasStatements: true,
    accrued,
    periodDonations,
    cutoffPassed,
    collectionAttempted: attemptedRes.rows[0].attempted,
    cardCollectionFailed: anyCardFailed,
    cardCollected,
    masavCollected,
    cardOutstanding,
    masavOutstanding,
  };
};

// ---------------------------------------------------------------------------
// B. "דורש טיפולך" -- every category that genuinely has no self-resolving
// path in this codebase today. Each entry is a direct pass-through of an
// existing list function; this file adds no new eligibility rule.
// ---------------------------------------------------------------------------
exports.getNeedsAttention = async () => {
  const [proposals, proposalsApproved, exceptions, blocked, exhaustedFindings, autoApprovalFailures] = await Promise.all([
    masavProposals.listMasavProposals({ status: 'proposed' }),
    // Closes a real gap found in the 2026-10 FIN-11 closure review: the
    // unified page previously had no way to see/export an ALREADY-approved
    // MASAV proposal at all once it left "awaiting approval" -- the only
    // actions wired were approve (here) and export (finance-ops.service.js
    // #exportMasavProposals, already built/tested, just never surfaced for
    // this status). No new backend logic -- same listMasavProposals, same
    // export function, just a second status filter.
    masavProposals.listMasavProposals({ status: 'approved' }),
    paymentExceptions.listPaymentExceptions({ status: 'open' }),
    masavCollectionService.listBlockedStatements(),
    pool.query(
      `SELECT rf.id AS finding_id, rf.subject_id AS statement_id, rf.details, rf.found_at,
              s.total_due, s.status AS statement_status, e.display_name AS entity_name,
              s.total_due + COALESCE((SELECT SUM(delta_amount) FROM statement_adjustments WHERE statement_id = s.id), 0)
                - COALESCE((SELECT SUM(amount) FROM payments WHERE statement_id = s.id), 0) AS outstanding,
              (SELECT COUNT(*)::int FROM collection_attempts WHERE statement_id = s.id AND collection_method = 'card') AS card_attempt_count,
              (SELECT COUNT(*)::int FROM collection_attempts WHERE statement_id = s.id AND collection_method = 'card' AND status IN ('declined', 'technical_failure')) AS failed_card_attempt_count,
              (SELECT COUNT(*)::int FROM collection_attempts WHERE statement_id = s.id AND collection_method = 'card' AND status = 'succeeded') AS successful_card_attempt_count,
              (SELECT id FROM collection_attempts WHERE statement_id = s.id AND collection_method = 'card' ORDER BY attempt_number DESC LIMIT 1) AS latest_card_attempt_id,
              (s.total_due <= 3540
                AND NOT EXISTS (SELECT 1 FROM collection_attempts WHERE statement_id = s.id
                  AND (status = 'succeeded' OR collection_method = 'masav' AND status IN ('pending', 'ambiguous')
                    OR collection_method = 'card' AND status NOT IN ('declined', 'technical_failure')))
                AND NOT EXISTS (SELECT 1 FROM masav_collection_proposals WHERE statement_id = s.id AND status IN ('proposed','approved','exported'))
                AND NOT EXISTS (SELECT 1 FROM payment_exceptions WHERE entity_id = ba.entity_id AND status = 'open' AND hold_new_collection = true)
                AND EXISTS (SELECT 1 FROM entity_billing WHERE entity_id = ba.entity_id AND status = 'active' AND is_default = true)) AS manual_retry_safe
       FROM reconciliation_findings rf
       JOIN statements s ON s.id = rf.subject_id
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       JOIN entities e ON e.id = ba.entity_id
       WHERE rf.finding_type = 'fin11_card_attempts_exhausted' AND rf.resolved_at IS NULL
       ORDER BY rf.found_at DESC`
    ),
    // "Calculated but not yet eligible" exceptions (2026-10 FIN-11 closure):
    // a draft Statement the new automatic eligibility transition
    // (approval.service.js#autoApproveDraftStatementsForRun, called from
    // billing-monthly-cycle.job.js) tried and failed to auto-approve --
    // the one genuine human-intervention case the new automation itself
    // can produce. Never silently retried.
    pool.query(
      `SELECT rf.id AS finding_id, rf.subject_id AS statement_id, rf.details, rf.found_at,
              s.total_due, s.status AS statement_status, e.display_name AS entity_name
       FROM reconciliation_findings rf
       JOIN statements s ON s.id = rf.subject_id
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       JOIN entities e ON e.id = ba.entity_id
       WHERE rf.finding_type = 'statement_auto_approval_failed' AND rf.resolved_at IS NULL
       ORDER BY rf.found_at DESC`
    ),
  ]);

  // Historical findings remain auditable; only collectible debt needs intervention.
  const activeExhausted = exhaustedFindings.rows.filter((f) =>
    ['approved', 'open'].includes(f.statement_status) && Number(f.outstanding) > 0);

  const categories = [
    {
      category: 'masav_proposal_awaiting_approval',
      label: 'הצעות מס״ב מחכות לאישור',
      count: proposals.length,
      totalAmount: proposals.reduce((sum, p) => sum + Number(p.proposed_amount), 0),
      items: proposals.map((p) => ({
        entityName: p.entity_name,
        amount: Number(p.proposed_amount),
        reason: 'הצעת מס״ב הוכנה וממתינה לאישור מנהל־על',
        nextAction: 'אשר או דחה את ההצעה',
        statementId: p.statement_id,
        proposalId: p.id,
      })),
    },
    {
      category: 'open_overpayment_exception',
      label: 'חריגי גביית־יתר פתוחים',
      count: exceptions.length,
      totalAmount: exceptions.reduce((sum, e) => sum + Number(e.overpayment_amount), 0),
      items: exceptions.map((e) => ({
        entityName: e.entity_name,
        amount: Number(e.overpayment_amount),
        reason: `נגבה ${e.collected_amount} מול יתרה ${e.outstanding_before} שהייתה פתוחה`,
        nextAction: 'תעד הכרעה (החזר/זיכוי/לא גביית־יתר)',
        statementId: e.statement_id,
        exceptionId: e.id,
      })),
    },
    {
      category: 'card_attempts_exhausted',
      label: 'כשלי גבייה בכרטיס אחרי 3 ניסיונות',
      count: activeExhausted.length,
      totalAmount: activeExhausted.reduce((sum, f) => sum + Number(f.outstanding), 0),
      items: activeExhausted.map((f) => ({
        entityName: f.entity_name,
        amount: Number(f.outstanding),
        manualRetryEligible: f.manual_retry_safe && ['approved', 'open'].includes(f.statement_status)
          && Number(f.outstanding) > 0 && Number(f.card_attempt_count) >= 3,
        previousAttempts: Number(f.card_attempt_count),
        failedAttempts: Number(f.failed_card_attempt_count),
        successfulAttempts: Number(f.successful_card_attempt_count),
        latestAttemptId: f.latest_card_attempt_id,
        manualRetryAmount: Math.min(Number(f.outstanding), 3000),
        reason: `${f.failed_card_attempt_count} ניסיונות גבייה נכשלו`,
        nextAction: 'בדוק את העמותה והחלט על המשך (למשל מעבר למס״ב)',
        statementId: f.statement_id,
        findingId: f.finding_id,
      })),
    },
    {
      category: 'masav_blocked',
      label: 'מס״ב חסום — הגדרות חסרות או לא מאושרות',
      count: blocked.length,
      totalAmount: blocked.reduce((sum, b) => sum + Number(b.total_due), 0),
      items: blocked.map((b) => ({
        entityName: b.entity_name,
        amount: Number(b.total_due),
        reason:
          b.reason === 'masav_not_configured' ? 'פרטי מס״ב לא הוגדרו כלל'
          : b.reason === 'masav_incomplete' ? 'פרטי מס״ב חסרים (בנק/סניף/חשבון)'
          : 'מס״ב לא מאושר על ידי העמותה',
        nextAction: 'השלם הגדרות מס״ב',
        statementId: b.statement_id,
        entityId: b.entity_id,
      })),
    },
    {
      category: 'masav_proposal_ready_to_export',
      label: 'הצעות מס״ב מאושרות — מוכנות לייצוא',
      count: proposalsApproved.length,
      totalAmount: proposalsApproved.reduce((sum, p) => sum + Number(p.proposed_amount), 0),
      items: proposalsApproved.map((p) => ({
        entityName: p.entity_name,
        amount: Number(p.proposed_amount),
        reason: 'הצעה אושרה וממתינה להפקת קובץ מס״ב',
        nextAction: 'הפק קובץ וייצא',
        statementId: p.statement_id,
        proposalId: p.id,
      })),
    },
    {
      category: 'statement_auto_approval_failed',
      label: 'חיוב לא עבר אישור אוטומטי',
      count: autoApprovalFailures.rows.length,
      totalAmount: 0,
      items: autoApprovalFailures.rows.map((f) => ({
        entityName: f.entity_name,
        amount: Number(f.total_due),
        reason: f.details?.code === 'DONATION_ALREADY_CLAIMED_BY_OTHER_STATEMENT'
          ? 'תרומה בחיוב זה נתבעה כבר על ידי חיוב אחר'
          : f.details?.message || 'האישור האוטומטי נכשל בבדיקת תקינות',
        nextAction: 'בדוק את החיוב וקבע אם לאשר ידנית או לבטל',
        statementId: f.statement_id,
        findingId: f.finding_id,
      })),
    },
  ];
  categories[2].totalAmount = categories[2].items.reduce((sum, i) => sum + i.amount, 0);

  return {
    categories,
    totalCount: categories.reduce((sum, c) => sum + c.count, 0),
  };
};

// ---------------------------------------------------------------------------
// C. "פעילות המערכת" -- business-friendly summary of the jobs that
// genuinely run automatically today. Registration is checked LIVE against
// jobRunner.list() (the same source cardcom-ops/health already uses), never
// hardcoded, so this can never silently drift out of sync with reality if a
// job is registered or unregistered later. The two frozen legacy jobs
// (billing-approval-consistency, billing-provisioning-gap) are deliberately
// excluded -- per the approved design, they do not belong in this page.
// ---------------------------------------------------------------------------
const MONITORED_AUTOMATIC_JOBS = [
  { name: 'billing-monthly-cycle', label: 'חישוב חיובים חודשי' },
  { name: 'collection-attempt-reconciliation', label: 'בדיקת ניסיונות גבייה תקועים' },
];

// FIN-11's own card-collection/retry/MASAV-prepare jobs exist as code but
// are NOT registered in src/jobs/index.js -- see fin11-card-collection.job.js
// /fin11-card-retry-sweep.job.js/fin11-masav-prepare.job.js's own header
// comments. Listed here so the page can say so honestly instead of omitting
// them (which could read as "nothing automatic is planned for FIN-11" when
// the real status is "built, deliberately not yet turned on").
const FIN11_PLANNED_JOBS = [
  { name: 'fin11-card-collection', label: 'גבייה אוטומטית בכרטיס (FIN-11)' },
  { name: 'fin11-card-retry-sweep', label: 'ניסיון חוזר אוטומטי (FIN-11)' },
  { name: 'fin11-masav-prepare', label: 'הכנת הצעות מס״ב אוטומטית (FIN-11)' },
];

exports.getSystemActivity = async () => {
  const registered = jobRunner.list();

  const automatic = [];
  for (const job of MONITORED_AUTOMATIC_JOBS) {
    const isRegistered = registered.includes(job.name);
    let lastRun = null;
    if (isRegistered) {
      const res = await pool.query(
        `SELECT status, started_at, finished_at, duration_ms, result_summary, error
         FROM job_runs WHERE job_name = $1 ORDER BY started_at DESC LIMIT 1`,
        [job.name]
      );
      lastRun = res.rows[0] || null;
    }
    automatic.push({
      name: job.name,
      label: job.label,
      registered: isRegistered,
      status: !isRegistered ? 'not_registered' : lastRun ? lastRun.status : 'never_run',
      lastRunAt: lastRun?.started_at || null,
      lastRunDurationMs: lastRun?.duration_ms || null,
      resultSummary: lastRun?.result_summary || null,
      lastRunError: lastRun?.error || null,
    });
  }

  const fin11Planned = FIN11_PLANNED_JOBS.map((job) => ({
    name: job.name,
    label: job.label,
    registered: registered.includes(job.name),
    // Always 'not_registered' today by design -- explicit per-job check
    // (not a blanket assumption) so this flips correctly the moment any one
    // of them is ever actually registered, without needing this file
    // touched again.
    status: registered.includes(job.name) ? 'active' : 'not_registered',
  }));

  return { automatic, fin11Planned };
};

// ---------------------------------------------------------------------------
// D/History. Cross-period search by entity name / date range / status.
// Deliberately NOT scoped to one billing_period_id (unlike billing-ops.
// service.js#listStatements, which the "סקירה ופעולות" tab's own
// period-scoped table already reuses as-is) -- this is the one genuinely
// new read query this page needs, mirroring listStatements' exact column/
// join shape so the two tables show statements the same way.
// ---------------------------------------------------------------------------
exports.searchStatementHistory = async ({ entityId, dateFrom, dateTo, status, limit = 200 } = {}) => {
  const { rows } = await pool.query(
    `SELECT s.id, s.billing_account_id, s.billing_period_id, s.total_due, s.status, s.created_at,
            ba.entity_id, e.display_name AS entity_name,
            bp.period_start, bp.period_end,
            (SELECT ca.status FROM collection_attempts ca WHERE ca.statement_id = s.id ORDER BY ca.attempt_number DESC LIMIT 1) AS latest_attempt_status,
            (SELECT COALESCE(SUM(amount), 0) FROM payments p WHERE p.statement_id = s.id) AS collected
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     JOIN billing_periods bp ON bp.id = s.billing_period_id
     WHERE ($1::uuid IS NULL OR ba.entity_id = $1)
       -- Interval OVERLAP, not containment (2026-10 fix): the previous
       -- version required period_start >= dateFrom AND period_end <= dateTo,
       -- so picking an entire calendar month (the single most natural
       -- thing to type -- e.g. dateFrom=2026-09-01, dateTo=2026-09-30) found
       -- NOTHING, because a real calendar-month period's period_end is
       -- 2026-10-01 (the 1st of the NEXT month), which always fails
       -- "<= 2026-09-30". A period now matches if it overlaps the
       -- requested range at all -- the standard half-open-interval check.
       AND ($2::timestamptz IS NULL OR bp.period_end > $2)
       AND ($3::timestamptz IS NULL OR bp.period_start <= $3)
       AND ($4::text IS NULL OR s.status = $4)
     ORDER BY bp.period_start DESC, e.display_name
     LIMIT $5`,
    [entityId || null, dateFrom || null, dateTo || null, status || null, limit]
  );
  return rows;
};

// ---------------------------------------------------------------------------
// Reports tab. One shared row-fetch for BOTH the on-screen preview and the
// downloaded Excel (2026-10 fix) -- the preview and the file used to be two
// separate call sites that could in principle drift; now both
// getFinancialReportPreview and generateFinancialReportExcel call this
// SAME function, so "the preview matches the file" is true by construction,
// not by convention. Status is returned raw (statements.status enum,
// unchanged) -- Hebrew translation happens at the display layer (STATUS_
// LABELS below for the Excel; the frontend's own identical map for the
// preview), never by changing what's stored.
// ---------------------------------------------------------------------------
const STATUS_LABELS = {
  draft: 'טיוטה', approved: 'מאושר', open: 'פתוח', paid: 'שולם',
  cancelled: 'בוטל', abandoned: 'בוטל', written_off: 'נמחק',
};

// Three mutually-exclusive scoping modes (2026-10, product-owner request --
// "month/year, custom date range, all periods"), resolved explicitly, never
// guessed: exactly one of periodId / (dateFrom or dateTo) / neither applies.
// periodId filters by the EXACT billing period (the "month/year" mode in
// the UI, where one real billing_periods row = one month). dateFrom/dateTo
// filters by period OVERLAP (same half-open-interval logic as
// searchStatementHistory's date-overlap fix above) -- this is a Statement's
// BILLING PERIOD window, never a transaction/payment date, which this
// report does not otherwise filter by (see this function's own callers'
// UI copy, which must say so). Neither given -- "כל התקופות" -- means no
// period restriction at all; never silently merged with a default.
async function getFinancialReportRows({ periodId, dateFrom, dateTo, entityId }) {
  if (!periodId && !dateFrom && !dateTo) {
    // "כל התקופות" -- intentionally unscoped, not an error.
  }
  const { rows } = await pool.query(
    `SELECT e.display_name AS entity_name, bp.period_start, bp.period_end,
            s.total_due,
            COALESCE((SELECT SUM(delta_amount) FROM statement_adjustments sa WHERE sa.statement_id = s.id), 0) AS adj,
            COALESCE((SELECT SUM(amount) FROM payments p WHERE p.statement_id = s.id), 0) AS collected,
            s.status
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     JOIN billing_periods bp ON bp.id = s.billing_period_id
     WHERE ($1::uuid IS NULL OR s.billing_period_id = $1)
       AND ($2::timestamptz IS NULL OR bp.period_end > $2)
       AND ($3::timestamptz IS NULL OR bp.period_start <= $3)
       AND ($4::uuid IS NULL OR ba.entity_id = $4)
     ORDER BY bp.period_start DESC, e.display_name`,
    [periodId || null, dateFrom || null, dateTo || null, entityId || null]
  );
  // Draft Statements are shown (status visibly says "טיוטה") but are NOT
  // yet a real financial obligation -- see collection-ops.service.js#
  // OVERVIEW_STATEMENT_STATUSES for the same business rule the Overview
  // tab already applies. Never silently dropped -- the admin still needs
  // to see them -- just never summed as owed debt if a caller ever adds a
  // total (none does today).
  return rows.map((r) => {
    const billed = Number(r.total_due) + Number(r.adj);
    const collected = Number(r.collected);
    return {
      entityName: r.entity_name,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      billed,
      collected,
      outstanding: billed - collected,
      status: r.status,
      isDraft: r.status === 'draft',
    };
  });
}

// JSON preview for the Reports tab -- identical rows to the Excel below.
exports.getFinancialReportPreview = async ({ periodId, dateFrom, dateTo, entityId }) => {
  return getFinancialReportRows({ periodId, dateFrom, dateTo, entityId });
};

// Deliberately a DIFFERENT file shape from the MASAV bank file (masav-
// collection.service.js#generateExportExcel / masav-proposal.service.js#
// exportMasavProposals): this is a read-only business report, no bank
// column format, no relation to the export-marks-proposal-as-exported side
// effect those two functions carry.
exports.generateFinancialReportExcel = async ({ periodId, dateFrom, dateTo, entityId }) => {
  const XLSX = require('xlsx');
  const rows = await getFinancialReportRows({ periodId, dateFrom, dateTo, entityId });

  const header = ['עמותה', 'תקופה', 'סכום לחיוב', 'נגבה', 'יתרה', 'סטטוס'];
  const fmtDate = (d) => {
    const iso = d instanceof Date ? d.toISOString() : String(d);
    const [y, m, day] = iso.slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
  };
  const data = [header, ...rows.map((r) => [
    r.entityName,
    `${fmtDate(r.periodStart)} - ${fmtDate(r.periodEnd)}`,
    r.billed,
    r.collected,
    r.outstanding,
    STATUS_LABELS[r.status] || r.status,
  ])];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'דוח כספי');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
