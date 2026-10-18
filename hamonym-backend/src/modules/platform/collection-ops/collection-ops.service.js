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
exports.getFinancialOverview = async ({ periodId }) => {
  if (!periodId) {
    const err = new Error('periodId is required');
    err.code = 'MISSING_PERIOD_ID';
    throw err;
  }

  const periodRes = await pool.query(`SELECT id, period_start, period_end FROM billing_periods WHERE id = $1`, [periodId]);
  const period = periodRes.rows[0];
  if (!period) {
    const err = new Error('Period not found');
    err.code = 'PERIOD_NOT_FOUND';
    throw err;
  }

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
  };
};

// ---------------------------------------------------------------------------
// B. "דורש טיפולך" -- every category that genuinely has no self-resolving
// path in this codebase today. Each entry is a direct pass-through of an
// existing list function; this file adds no new eligibility rule.
// ---------------------------------------------------------------------------
exports.getNeedsAttention = async () => {
  const [proposals, exceptions, blocked, exhaustedFindings] = await Promise.all([
    masavProposals.listMasavProposals({ status: 'proposed' }),
    paymentExceptions.listPaymentExceptions({ status: 'open' }),
    masavCollectionService.listBlockedStatements(),
    pool.query(
      `SELECT rf.id AS finding_id, rf.subject_id AS statement_id, rf.details, rf.found_at,
              s.total_due, s.status AS statement_status, e.display_name AS entity_name
       FROM reconciliation_findings rf
       JOIN statements s ON s.id = rf.subject_id
       JOIN billing_accounts ba ON ba.id = s.billing_account_id
       JOIN entities e ON e.id = ba.entity_id
       WHERE rf.finding_type = 'fin11_card_attempts_exhausted' AND rf.resolved_at IS NULL
       ORDER BY rf.found_at DESC`
    ),
  ]);

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
      count: exhaustedFindings.rows.length,
      totalAmount: 0,
      items: exhaustedFindings.rows.map((f) => ({
        entityName: f.entity_name,
        amount: Number(f.total_due),
        reason: `${f.details?.attemptsSoFar ?? 3} ניסיונות גבייה נכשלו`,
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
exports.searchStatementHistory = async ({ entityName, dateFrom, dateTo, status, limit = 200 } = {}) => {
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
     WHERE ($1::text IS NULL OR e.display_name ILIKE '%' || $1 || '%')
       AND ($2::timestamptz IS NULL OR bp.period_start >= $2)
       AND ($3::timestamptz IS NULL OR bp.period_end <= $3)
       AND ($4::text IS NULL OR s.status = $4)
     ORDER BY bp.period_start DESC, e.display_name
     LIMIT $5`,
    [entityName || null, dateFrom || null, dateTo || null, status || null, limit]
  );
  return rows;
};

// ---------------------------------------------------------------------------
// Reports tab. Basic Excel report -- entity/period/charged/paid/outstanding/
// method/status. Deliberately a DIFFERENT file shape from the MASAV bank
// file (masav-collection.service.js#generateExportExcel / masav-proposal.
// service.js#exportMasavProposals): this is a read-only business report, no
// bank column format, no relation to the export-marks-proposal-as-exported
// side effect those two functions carry. Reuses the `xlsx` package already
// a dependency for exactly that reason -- same column-shape logic that
// routing.js's CARD_MASAV_THRESHOLD already classifies by, not re-decided
// here.
// ---------------------------------------------------------------------------
exports.generateFinancialReportExcel = async ({ periodId }) => {
  const XLSX = require('xlsx');
  const routing = require('../../collection-engine/routing');

  if (!periodId) {
    const err = new Error('periodId is required');
    err.code = 'MISSING_PERIOD_ID';
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT e.display_name AS entity_name, bp.period_start, bp.period_end,
            s.total_due,
            COALESCE((SELECT SUM(delta_amount) FROM statement_adjustments sa WHERE sa.statement_id = s.id), 0) AS adj,
            COALESCE((SELECT SUM(amount) FROM payments p WHERE p.statement_id = s.id), 0) AS collected,
            s.status,
            CASE WHEN s.total_due <= $2 THEN 'card' ELSE 'masav' END AS method
     FROM statements s
     JOIN billing_accounts ba ON ba.id = s.billing_account_id
     JOIN entities e ON e.id = ba.entity_id
     JOIN billing_periods bp ON bp.id = s.billing_period_id
     WHERE s.billing_period_id = $1
     ORDER BY e.display_name`,
    [periodId, routing.CARD_MASAV_THRESHOLD]
  );

  const header = ['עמותה', 'תחילת תקופה', 'סוף תקופה', 'סכום חויב', 'שולם', 'יתרה פתוחה', 'אמצעי גבייה', 'סטטוס'];
  const fmtDate = (d) => {
    const iso = d instanceof Date ? d.toISOString() : String(d);
    const [y, m, day] = iso.slice(0, 10).split('-');
    return `${day}/${m}/${y}`;
  };
  const data = [header, ...rows.map((r) => {
    const billed = Number(r.total_due) + Number(r.adj);
    const collected = Number(r.collected);
    return [
      r.entity_name,
      fmtDate(r.period_start),
      fmtDate(r.period_end),
      billed,
      collected,
      billed - collected,
      r.method === 'card' ? 'כרטיס אשראי' : 'מס״ב',
      r.status,
    ];
  })];

  const worksheet = XLSX.utils.aoa_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'דוח כספי');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
