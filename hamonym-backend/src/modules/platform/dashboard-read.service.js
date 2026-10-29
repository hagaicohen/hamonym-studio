// Platform Dashboard only: read-only projections over existing business records.
// No job execution, provider calls, mutations or new financial eligibility rules.
const db = require('../../db/db');
const collectionOps = require('./collection-ops/collection-ops.service');

const DONOR_KEY = "COALESCE(NULLIF(donor_email, ''), NULLIF(donor_phone, ''), donor_name)";

async function getDonorsAndTotals() {
  // Keep the existing donor identity rule. Select the first PAID donation,
  // with an ID tie-breaker; later gifts must not create another new donor.
  const { rows } = await db.query(`
    WITH bounds AS (
      SELECT (date_trunc('month', NOW() AT TIME ZONE 'Asia/Jerusalem') AT TIME ZONE 'Asia/Jerusalem') AS start_at,
             ((date_trunc('month', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '1 month') AT TIME ZONE 'Asia/Jerusalem') AS end_at
    ), first_donations AS (
      SELECT DISTINCT ON (${DONOR_KEY}) donor_name, created_at, amount, id
      FROM donations WHERE status = 'paid'
      ORDER BY ${DONOR_KEY}, created_at, id
    )
    SELECT b.start_at AS month_start, b.end_at AS month_end,
      (SELECT COALESCE(SUM(amount), 0) FROM donations
       WHERE status = 'paid' AND created_at >= b.start_at AND created_at < b.end_at) AS donations_month,
      COALESCE((SELECT json_agg(json_build_object('name', f.donor_name,
         'firstDonationAt', f.created_at, 'firstDonationAmount', f.amount)
         ORDER BY f.created_at DESC, f.id)
       FROM first_donations f WHERE f.created_at >= b.start_at AND f.created_at < b.end_at), '[]'::json) AS new_donors
    FROM bounds b`);
  return rows[0];
}

async function getTrend(range) {
  // Only allowlisted SQL fragments; never interpolate request values.
  const monthly = range === '12m';
  const step = monthly ? '1 month' : '1 day';
  const span = monthly ? '12 months' : range === '7d' ? '7 days' : '30 days';
  const unit = monthly ? 'month' : 'day';
  const { rows } = await db.query(`
    WITH bounds AS (
      SELECT date_trunc('${unit}', NOW() AT TIME ZONE 'Asia/Jerusalem') + INTERVAL '${step}' AS finish
    ), points AS (
      SELECT gs AS bucket, COALESCE(SUM(d.amount), 0)::float AS value
      FROM bounds b CROSS JOIN LATERAL generate_series(b.finish - INTERVAL '${span}' * 2,
           b.finish - INTERVAL '${step}', INTERVAL '${step}') gs
      LEFT JOIN donations d ON d.status = 'paid'
        AND d.created_at >= (gs AT TIME ZONE 'Asia/Jerusalem')
        AND d.created_at < ((gs + INTERVAL '${step}') AT TIME ZONE 'Asia/Jerusalem')
      GROUP BY gs
    )
    SELECT to_char(p.bucket, 'YYYY-MM-DD') AS date, p.value,
           p.bucket >= b.finish - INTERVAL '${span}' AS current
    FROM points p CROSS JOIN bounds b ORDER BY p.bucket`);
  const current = rows.filter(r => r.current);
  const previous = rows.filter(r => !r.current);
  return {
    range, points: current.map(r => ({ date: r.date, value: Number(r.value) })),
    total: current.reduce((s, r) => s + Number(r.value), 0),
    previousTotal: previous.reduce((s, r) => s + Number(r.value), 0),
  };
}

async function getOrganizationAttention() {
  const { rows } = await db.query(`
    SELECT e.id, COALESCE(NULLIF(e.display_name, ''), e.legal_name) AS name,
      CASE WHEN e.status = 'pending_review' THEN 'ממתינה לאישור'
           WHEN e.status = 'draft' THEN 'ההרשמה טרם הושלמה'
           WHEN e.flagged_for_review THEN 'נדרשת בדיקה חוזרת בעקבות שינוי בפרטים'
           WHEN e.association_certificate_name IS NULL OR
             (e.entity_type = 'association' AND e.tax_document_name IS NULL) THEN 'חסרים מסמכים'
           ELSE 'החיבור לסליקה אינו תקין' END AS reason
    FROM entities e
    WHERE e.status != 'deleted'
      AND NOT EXISTS (SELECT 1 FROM entity_roles er WHERE er.entity_id = e.id AND er.role = 'partner')
      AND (e.status IN ('draft', 'pending_review') OR e.status = 'active' AND
        (e.flagged_for_review OR e.association_certificate_name IS NULL OR
         (e.entity_type = 'association' AND e.tax_document_name IS NULL) OR
         e.cardcom_connection_status IS DISTINCT FROM 'success'))
    ORDER BY CASE WHEN e.status = 'pending_review' THEN 0 ELSE 1 END, e.created_at, e.id`);
  return rows.map(r => ({ id: 'organization:' + r.id, name: r.name, reason: r.reason,
    action: 'בדוק עמותה', route: ['/platform/organizations', r.id], query: {} }));
}

async function getUncertainPayments() {
  // An unresolved provider result is actionable even when a balance is zero.
  // Confirmed historical failures/recovered findings are deliberately excluded.
  const { rows } = await db.query(`
    SELECT DISTINCT rf.id, rf.subject_type, rf.subject_id, ca.statement_id, e.display_name AS entity_name,
           c.title AS campaign_title
    FROM reconciliation_findings rf
    LEFT JOIN collection_attempts ca ON rf.subject_type = 'collection_attempt' AND ca.id = rf.subject_id
    LEFT JOIN statements s ON s.id = ca.statement_id
    LEFT JOIN billing_accounts ba ON ba.id = s.billing_account_id
    LEFT JOIN donations d ON rf.subject_type = 'donation' AND d.id = rf.subject_id
    LEFT JOIN recurring_instructions ri ON rf.subject_type = 'recurring_instruction' AND ri.id = rf.subject_id
    LEFT JOIN campaigns c ON c.id = COALESCE(d.campaign_id, ri.campaign_id)
    LEFT JOIN entities e ON e.id = COALESCE(ba.entity_id, d.entity_id, c.entity_id)
    WHERE rf.resolved_at IS NULL AND (
      rf.finding_type = 'collection_attempt_stuck' AND ca.status IN ('pending', 'ambiguous')
      OR rf.finding_type IN ('lookup_failed', 'pending_donation_missing_low_profile_id') AND d.status = 'pending'
      OR rf.finding_type = 'history_lookup_failed' AND rf.subject_type = 'recurring_instruction')
    ORDER BY rf.id`);
  return rows.map(r => ({ id: 'uncertain:' + r.id,
    name: r.entity_name || r.campaign_title || 'תשלום לבירור', reason: 'תוצאת הסליקה טרם אושרה ונדרשת בדיקה',
    action: 'בדוק סליקה', route: [r.subject_type === 'collection_attempt' ? '/platform/collection-ops' : '/platform/donations'],
    query: r.statement_id ? { statementId: r.statement_id } : {}, fragment: r.subject_type === 'collection_attempt' ? 'collection-attention' : 'anomalies' }));
}

async function getBusinessActivity({ isSuperAdmin, organizations, campaigns }) {
  const { rows } = await db.query(`
    SELECT * FROM (
      SELECT 'organization' AS kind, a.id::text AS id, a.created_at AS ts,
             e.id::text AS subject_id, e.display_name AS name, a.action, NULL::text AS detail
      FROM platform_audit_log a JOIN entities e ON e.id = a.entity_id
      WHERE $1::boolean AND a.action IN ('approve', 'reject', 'request_changes', 'suspend', 'reactivate')
      UNION ALL
      SELECT 'campaign', c.id::text, c.created_at, c.id::text, c.title, 'created', e.display_name
      FROM campaigns c JOIN entities e ON e.id = c.entity_id WHERE $2::boolean AND c.deleted_at IS NULL
      UNION ALL
      SELECT 'donation', d.id::text, d.created_at, d.campaign_id::text, c.title, 'paid', d.amount::text
      FROM donations d JOIN campaigns c ON c.id = d.campaign_id
      WHERE $3::boolean AND d.status = 'paid'
      UNION ALL
      SELECT 'user', u.id::text, u.created_at, u.id::text, COALESCE(u.full_name, u.email), 'created', NULL::text
      FROM users u WHERE $3::boolean
    ) events ORDER BY ts DESC, kind, id DESC LIMIT 8`, [organizations, campaigns, isSuperAdmin]);
  const labels = { approve: 'העמותה אושרה', reject: 'ההרשמה נדחתה', request_changes: 'נדרשו תיקונים',
    suspend: 'העמותה הושעתה', reactivate: 'העמותה הופעלה מחדש' };
  return rows.map(r => ({ id: r.kind + ':' + r.id, name: r.name, timestamp: r.ts,
    label: r.kind === 'organization' ? labels[r.action] : r.kind === 'campaign' ? 'קמפיין חדש' : r.kind === 'donation' ? 'התקבלה תרומה' : 'משתמש חדש',
    amount: r.kind === 'donation' ? Number(r.detail) : null,
    route: r.kind === 'organization' ? ['/platform/organizations', r.subject_id]
      : [r.kind === 'user' ? '/platform/users' : r.kind === 'donation' ? '/platform/donations' : '/platform/campaigns'],
    query: r.kind === 'organization' ? {} : r.kind === 'donation' ? { campaignId: r.subject_id, status: 'paid' } : { search: r.name },
  }));
}

exports.getOverview = async ({ range = '30d', isSuperAdmin = false, permissions = [] } = {}) => {
  if (!['7d', '30d', '12m'].includes(range)) {
    const err = new Error('Invalid dashboard range'); err.status = 400; throw err;
  }
  const organizations = isSuperAdmin || permissions.includes('organizations');
  const campaigns = isSuperAdmin || permissions.includes('campaigns');
  const [stats, totals, trend, orgAttention, financialAttention, financialRows, uncertain, activity] = await Promise.all([
    db.query(`SELECT
      (SELECT COUNT(*)::int FROM entities e WHERE e.status = 'active'
        AND NOT EXISTS (SELECT 1 FROM entity_roles er WHERE er.entity_id = e.id AND er.role = 'partner')) AS active_entities,
      (SELECT COUNT(*)::int FROM campaigns WHERE status = 'published' AND deleted_at IS NULL) AS active_campaigns`),
    isSuperAdmin ? getDonorsAndTotals() : null,
    isSuperAdmin ? getTrend(range) : null,
    organizations ? getOrganizationAttention() : [],
    isSuperAdmin ? collectionOps.getNeedsAttention() : null,
    isSuperAdmin ? collectionOps.getFinancialReportPreview({}) : [],
    isSuperAdmin ? getUncertainPayments() : [],
    getBusinessActivity({ isSuperAdmin, organizations, campaigns }),
  ]);
  const financialItems = (financialAttention?.categories || []).flatMap(group => group.items.map((item, i) => ({
    id: group.category + ':' + (item.findingId || item.exceptionId || item.proposalId || item.statementId || i),
    name: item.entityName, reason: item.reason, action: item.nextAction,
    route: ['/platform/collection-ops'], query: item.statementId ? { statementId: item.statementId } : {}, fragment: 'collection-attention',
  })));
  const attention = [...orgAttention, ...uncertain, ...financialItems];
  return {
    version: 1, generatedAt: new Date().toISOString(),
    period: totals ? { start: totals.month_start, end: totals.month_end } : null,
    kpis: { activeEntities: stats.rows[0].active_entities, activeCampaigns: stats.rows[0].active_campaigns,
      donationsMonth: totals ? Number(totals.donations_month) : null,
      newDonorsThisMonth: totals ? totals.new_donors.length : null,
      feesOutstanding: isSuperAdmin ? financialRows.filter(r => ['approved', 'open'].includes(r.status))
        .reduce((sum, r) => sum + Math.max(0, r.outstanding), 0) : null,
      attentionCount: attention.length },
    newDonors: totals ? totals.new_donors.map(r => ({ ...r, firstDonationAmount: r.firstDonationAmount == null ? null : Number(r.firstDonationAmount) })) : [],
    trend, attention, activity,
  };
};
