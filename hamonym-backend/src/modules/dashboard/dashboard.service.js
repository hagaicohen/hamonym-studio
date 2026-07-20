const db = require('../../db/db');

// In-memory cache: `${entityId}_${from}_${to}` → { data, expiresAt } — keyed
// by range too, not just entityId, so switching the global date range can't
// serve back a different range's cached numbers.
const cache = new Map();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

exports.invalidateDashboard = (entityId) => {
  for (const key of cache.keys()) {
    if (key.startsWith(`${entityId}_`)) cache.delete(key);
  }
};

// Only fundraisingThisMonth / donationsThisMonth / failedPayments are period
// KPIs and honor from/to (falling back to the historical "this month" /
// "last month" behavior when no range is given). Everything else on this
// dashboard — alerts, recent activity, the 30-day chart, top ambassadors,
// the campaigns list — is a current-state or "most recent N" view, not a
// period metric, and deliberately stays unscoped. See GLOBAL_DATE_RANGE_SPEC.md.
exports.getDashboardData = async (entityId, { from, to } = {}) => {
  const key = `${entityId}_${from || 'default'}_${to || 'default'}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const hasRange = !!(from && to);
  let prevFrom = null, prevTo = null;
  if (hasRange) {
    const spanMs = new Date(to).getTime() - new Date(from).getTime();
    prevTo   = from;
    prevFrom = new Date(new Date(from).getTime() - spanMs).toISOString().slice(0, 10);
  }

  const [
    thisMonthRes,
    lastMonthRes,
    campaignsRes,
    failedKpiRes,
    recentDonationsRes,
    failedListRes,
    topAmbassadorsRes,
    chartRes,
    alertsRes,
    campaignListRes,
    goal90Res,
    noDonationsRes,
    draftsRes,
  ] = await Promise.all([

    db.query(`
      SELECT
        COUNT(*)::int                    AS count,
        COALESCE(SUM(amount), 0)::float  AS total
      FROM donations
      WHERE entity_id = $1
        AND status = 'paid'
        AND completed_at >= COALESCE($2::date, date_trunc('month', NOW()))
        AND ($3::date IS NULL OR completed_at < $3::date)
    `, [entityId, from || null, to || null]),

    db.query(`
      SELECT
        COUNT(*)::int                    AS count,
        COALESCE(SUM(amount), 0)::float  AS total
      FROM donations
      WHERE entity_id = $1
        AND status = 'paid'
        AND completed_at >= COALESCE($2::date, date_trunc('month', NOW() - INTERVAL '1 month'))
        AND completed_at  < COALESCE($3::date, date_trunc('month', NOW()))
    `, [entityId, prevFrom, prevTo]),

    db.query(`
      SELECT
        COUNT(*)::int                                            AS total,
        COUNT(*) FILTER (WHERE status = 'published')::int       AS active
      FROM campaigns
      WHERE entity_id = $1
    `, [entityId]),

    db.query(`
      SELECT
        COUNT(*)::int                    AS count,
        COALESCE(SUM(amount), 0)::float  AS total_lost
      FROM donations
      WHERE entity_id = $1
        AND status = 'failed'
        AND updated_at >= COALESCE($2::date, date_trunc('month', NOW()))
        AND ($3::date IS NULL OR updated_at < $3::date)
    `, [entityId, from || null, to || null]),

    db.query(`
      SELECT
        d.id,
        d.amount::float,
        d.donor_name,
        d.completed_at,
        c.title AS campaign_title
      FROM donations d
      JOIN campaigns c ON c.id = d.campaign_id
      WHERE d.entity_id = $1
        AND d.status = 'paid'
      ORDER BY d.completed_at DESC
      LIMIT 10
    `, [entityId]),

    db.query(`
      SELECT
        d.id,
        d.amount::float,
        d.donor_name,
        d.updated_at,
        c.title AS campaign_title
      FROM donations d
      JOIN campaigns c ON c.id = d.campaign_id
      WHERE d.entity_id = $1
        AND d.status = 'failed'
      ORDER BY d.updated_at DESC
      LIMIT 10
    `, [entityId]),

    db.query(`
      SELECT
        a.id,
        a.full_name,
        a.slug,
        c.title AS campaign_title,
        c.slug  AS campaign_slug,
        COALESCE(SUM(d.amount), 0)::float AS raised_total
      FROM campaign_ambassadors a
      JOIN campaigns c ON c.id = a.campaign_id
      LEFT JOIN donations d ON d.ambassador_id = a.id AND d.status = 'paid'
      WHERE c.entity_id = $1
      GROUP BY a.id, a.full_name, a.slug, c.title, c.slug
      ORDER BY raised_total DESC
      LIMIT 5
    `, [entityId]),

    db.query(`
      SELECT
        TO_CHAR(
          DATE(completed_at AT TIME ZONE 'Asia/Jerusalem'),
          'MM-DD'
        ) AS day,
        COALESCE(SUM(amount), 0)::float AS total
      FROM donations
      WHERE entity_id = $1
        AND status = 'paid'
        AND completed_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(completed_at AT TIME ZONE 'Asia/Jerusalem')
      ORDER BY DATE(completed_at AT TIME ZONE 'Asia/Jerusalem')
    `, [entityId]),

    // ── alerts: campaigns only — entity-level alerts computed on frontend ──
    db.query(`
      SELECT id::text AS ref_id, title, status, end_date
      FROM campaigns
      WHERE entity_id = $1
        AND (
          status = 'pending_review'
          OR (
            status = 'published'
            AND end_date IS NOT NULL
            AND end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'
          )
        )
      ORDER BY end_date ASC NULLS LAST
      LIMIT 10
    `, [entityId]),

    db.query(`
      SELECT
        id, title, status, slug,
        cover_image_url,
        current_amount::float,
        target_amount::float,
        supporters_count,
        created_at,
        end_date,
        funding_type
      FROM campaigns
      WHERE entity_id = $1
        AND status IN ('published', 'pending_review', 'draft')
      ORDER BY updated_at DESC
      LIMIT 8
    `, [entityId]),

    // קמפיינים שהגיעו ל-90%+ מהיעד (אך לא עברו אותו)
    db.query(`
      SELECT
        id::text AS ref_id,
        title,
        ROUND(current_amount::numeric / target_amount::numeric * 100)::int AS pct
      FROM campaigns
      WHERE entity_id = $1
        AND status = 'published'
        AND target_amount > 0
        AND current_amount >= target_amount * 0.9
        AND current_amount < target_amount
      LIMIT 3
    `, [entityId]),

    // קמפיינים פעילים שלא קיבלו תרומה ב-14 ימים (ונוצרו לפני יותר מ-14 ימים)
    db.query(`
      SELECT c.id::text AS ref_id, c.title
      FROM campaigns c
      WHERE c.entity_id = $1
        AND c.status = 'published'
        AND (c.end_date IS NULL OR c.end_date > NOW())
        AND c.created_at < NOW() - INTERVAL '14 days'
        AND NOT EXISTS (
          SELECT 1 FROM donations d
          WHERE d.campaign_id = c.id
            AND d.status = 'paid'
            AND d.completed_at >= NOW() - INTERVAL '14 days'
        )
      LIMIT 3
    `, [entityId]),

    // טיוטות שלא פורסמו
    db.query(`
      SELECT id::text AS ref_id, title
      FROM campaigns
      WHERE entity_id = $1
        AND status = 'draft'
      ORDER BY created_at ASC
      LIMIT 3
    `, [entityId]),
  ]);

  const now  = thisMonthRes.rows[0];
  const prev = lastMonthRes.rows[0];
  const cmp  = campaignsRes.rows[0];
  const fail = failedKpiRes.rows[0];

  const pct = (a, b) =>
    b > 0 ? Math.round(((a - b) / b) * 100) : null;

  const alerts = [];

  // תשלומים שנכשלו החודש
  if (fail.count > 0) {
    alerts.push({
      type: 'failed_payments', ref_id: null, severity: 'warning',
      title: `${fail.count} תשלומים נכשלו החודש`,
      description: `סה"כ ${Math.round(fail.total_lost).toLocaleString('he-IL')} ₪ שלא נגבו`,
    });
  }

  // קמפיינים ממתינים לאישור + מסתיימים בקרוב
  for (const r of alertsRes.rows) {
    if (r.status === 'pending_review') {
      alerts.push({
        type: 'campaign_pending', ref_id: r.ref_id, severity: 'warning',
        title: `קמפיין "${r.title}" ממתין לאישור`,
        description: 'הקמפיין לא יצא לציבור עד לסיום הבדיקה',
      });
    } else {
      const days = Math.max(1, Math.ceil((new Date(r.end_date) - Date.now()) / 86400000));
      alerts.push({
        type: 'ending_soon', ref_id: r.ref_id, severity: 'warning',
        title: `קמפיין "${r.title}" מסתיים בקרוב`,
        description: `נותרו ${days} ימים לסיום`,
      });
    }
  }

  // אין קמפיינים פעילים (אבל יש קמפיינים בכלל)
  if (cmp.active === 0 && cmp.total > 0) {
    alerts.push({
      type: 'no_active_campaigns', ref_id: null, severity: 'warning',
      title: 'אין קמפיינים פעילים כרגע',
      description: 'פרסם קמפיין קיים או צור חדש כדי להתחיל לגייס',
    });
  }

  // קמפיינים ב-90%+ מהיעד
  for (const r of goal90Res.rows) {
    alerts.push({
      type: 'goal_90pct', ref_id: r.ref_id, severity: 'warning',
      title: `קמפיין "${r.title}" הגיע ל-${r.pct}% מהיעד`,
      description: 'הגיעו כמעט עד היעד — הזמן לדחוף לסיום',
    });
  }

  // קמפיינים ללא תרומה 14 ימים
  for (const r of noDonationsRes.rows) {
    alerts.push({
      type: 'no_donations_14_days', ref_id: r.ref_id, severity: 'warning',
      title: `לא נתקבלו תרומות לקמפיין "${r.title}" ב-14 ימים`,
      description: 'שתף את הקמפיין מחדש כדי לחזור לפעילות',
    });
  }

  // טיוטות שלא פורסמו
  for (const r of draftsRes.rows) {
    alerts.push({
      type: 'draft_unpublished', ref_id: r.ref_id, severity: 'info',
      title: `טיוטה לא פורסמה: "${r.title || 'ללא כותרת'}"`,
      description: 'הקמפיין נשמר כטיוטה ומחכה לפרסום',
    });
  }

  const result = {
    kpi: {
      fundraisingThisMonth: {
        total:     now.total,
        pctChange: pct(now.total, prev.total),
      },
      donationsThisMonth: {
        count:     now.count,
        pctChange: pct(now.count, prev.count),
      },
      activeCampaigns: {
        active: cmp.active,
        total:  cmp.total,
      },
      failedPayments: {
        count:     fail.count,
        totalLost: fail.total_lost,
      },
    },
    recentDonations: recentDonationsRes.rows,
    failedPayments:  failedListRes.rows,
    topAmbassadors:  topAmbassadorsRes.rows,
    chartData:       chartRes.rows,
    alerts,
    campaigns:       campaignListRes.rows,
  };

  cache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
};

exports.getAlertCount = async (entityId) => {
  const res = await db.query(`
    SELECT (
      (SELECT COUNT(*) FROM donations
       WHERE entity_id = $1 AND status = 'failed'
         AND updated_at >= date_trunc('month', NOW()))
      +
      (SELECT COUNT(*) FROM campaigns
       WHERE entity_id = $1
         AND (status = 'pending_review'
           OR (status = 'published' AND end_date IS NOT NULL
               AND end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days')))
      +
      (SELECT COUNT(*) FROM campaigns
       WHERE entity_id = $1 AND status = 'published'
         AND target_amount > 0
         AND current_amount >= target_amount * 0.9
         AND current_amount < target_amount)
      +
      (SELECT COUNT(*) FROM campaigns c
       WHERE c.entity_id = $1 AND c.status = 'published'
         AND (c.end_date IS NULL OR c.end_date > NOW())
         AND c.created_at < NOW() - INTERVAL '14 days'
         AND NOT EXISTS (
           SELECT 1 FROM donations d
           WHERE d.campaign_id = c.id AND d.status = 'paid'
             AND d.completed_at >= NOW() - INTERVAL '14 days'))
      +
      (SELECT COUNT(*) FROM campaigns
       WHERE entity_id = $1 AND status = 'draft')
    )::int AS count
  `, [entityId]);
  return res.rows[0].count;
};
