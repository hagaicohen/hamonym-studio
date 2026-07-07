const db = require('../../db/db');

/* ─────────────────────────────────────────
   1. CAMPAIGN PERFORMANCE
───────────────────────────────────────── */
const CAMPAIGN_SORT = {
  name:    (r) => r.title || '',
  target:  (r) => r.target_amount,
  raised:  (r) => r.current_amount,
  pct:     (r) => r.pct ?? -1,
  donors:  (r) => r.supporters_count,
  avg:     (r) => r.avg ?? 0,
};

exports.getCampaignPerformance = async (entityId, { sortBy, sortDir, search, status } = {}) => {
  const where  = ['entity_id = $1', `status != 'draft'`];
  const params = [entityId];
  let idx = 2;

  if (status && status !== 'all') {
    where.push(`status = $${idx++}`);
    params.push(status);
  }
  if (search) {
    where.push(`title ILIKE $${idx++}`);
    params.push(`%${search}%`);
  }

  const { rows } = await db.query(
    `SELECT id, title, slug, status, cover_image_url, target_amount::float, current_amount::float,
            supporters_count, created_at, start_date, end_date
     FROM campaigns
     WHERE ${where.join(' AND ')}
     ORDER BY current_amount DESC`,
    params
  );

  const now = Date.now();
  const campaigns = rows.map((r) => {
    const target  = r.target_amount || 0;
    const current = r.current_amount || 0;
    const pct     = target > 0 ? Math.round((current / target) * 100) : null;
    const avg     = r.supporters_count > 0 ? current / r.supporters_count : 0;

    const startedAt   = r.start_date || r.created_at;
    const daysElapsed = Math.max(1, Math.ceil((now - new Date(startedAt).getTime()) / 86400000));
    const dailyPace    = current / daysElapsed;

    let daysRemaining = null;
    let projectedTotal = null;
    if (r.end_date) {
      const totalDays = Math.max(1, Math.ceil((new Date(r.end_date).getTime() - new Date(startedAt).getTime()) / 86400000));
      daysRemaining  = Math.ceil((new Date(r.end_date).getTime() - now) / 86400000);
      projectedTotal = dailyPace * totalDays;
    }

    return {
      id: r.id, title: r.title, slug: r.slug, status: r.status, cover_image_url: r.cover_image_url,
      target_amount: target, current_amount: current,
      supporters_count: r.supporters_count, pct, avg,
      daily_pace: dailyPace, days_remaining: daysRemaining, projected_total: projectedTotal,
      created_at: r.created_at,
    };
  });

  const sortFn = CAMPAIGN_SORT[sortBy] || CAMPAIGN_SORT.raised;
  const dir = sortDir === 'asc' ? 1 : -1;
  campaigns.sort((a, b) => {
    const av = sortFn(a), bv = sortFn(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });

  const totalRaised   = campaigns.reduce((s, c) => s + c.current_amount, 0);
  const withTarget    = campaigns.filter((c) => c.pct !== null);
  const avgProgressPct = withTarget.length > 0
    ? Math.round(withTarget.reduce((s, c) => s + c.pct, 0) / withTarget.length)
    : null;

  return {
    campaigns,
    kpi: {
      totalCampaigns:  campaigns.length,
      activeCampaigns: campaigns.filter((c) => c.status === 'published').length,
      totalRaised,
      avgProgressPct,
    },
  };
};

/* ─────────────────────────────────────────
   2. MARKETING & TRAFFIC SOURCES
───────────────────────────────────────── */
exports.getMarketingSources = async (entityId) => {
  const [channelRes, utmRes, totalRes] = await Promise.all([
    db.query(
      `SELECT
         CASE
           WHEN ambassador_id IS NOT NULL THEN 'שגריר'
           WHEN utm_params->>'source' IS NOT NULL THEN utm_params->>'source'
           ELSE 'ישיר / לא מזוהה'
         END AS channel,
         COUNT(*)::int AS count,
         COALESCE(SUM(amount), 0)::float AS total
       FROM donations
       WHERE entity_id = $1 AND status = 'paid'
       GROUP BY channel
       ORDER BY total DESC`,
      [entityId]
    ),
    db.query(
      `SELECT
         utm_params->>'source' AS source,
         utm_params->>'medium' AS medium,
         COUNT(*)::int AS count,
         COALESCE(SUM(amount), 0)::float AS total
       FROM donations
       WHERE entity_id = $1 AND status = 'paid' AND utm_params IS NOT NULL
       GROUP BY utm_params->>'source', utm_params->>'medium'
       ORDER BY total DESC`,
      [entityId]
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total_count,
         COUNT(*) FILTER (WHERE utm_params IS NOT NULL)::int AS with_utm_count,
         COALESCE(SUM(amount), 0)::float AS total_raised
       FROM donations
       WHERE entity_id = $1 AND status = 'paid'`,
      [entityId]
    ),
  ]);

  const totals = totalRes.rows[0];
  return {
    channels: channelRes.rows,
    utmBreakdown: utmRes.rows,
    kpi: {
      totalRaised:   totals.total_raised,
      topChannel:    channelRes.rows[0]?.channel ?? null,
      withUtmCount:  totals.with_utm_count,
      totalCount:    totals.total_count,
    },
  };
};

/* ─────────────────────────────────────────
   3. TRENDS & COMPARISONS
───────────────────────────────────────── */
exports.getTrends = async (entityId) => {
  const [thisMonthRes, lastMonthRes, yearSeriesRes] = await Promise.all([
    db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total,
              COALESCE(AVG(amount), 0)::float AS avg
       FROM donations
       WHERE entity_id = $1 AND status = 'paid'
         AND completed_at >= date_trunc('month', NOW())`,
      [entityId]
    ),
    db.query(
      `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount), 0)::float AS total,
              COALESCE(AVG(amount), 0)::float AS avg
       FROM donations
       WHERE entity_id = $1 AND status = 'paid'
         AND completed_at >= date_trunc('month', NOW() - INTERVAL '1 month')
         AND completed_at  < date_trunc('month', NOW())`,
      [entityId]
    ),
    db.query(
      `SELECT
         EXTRACT(YEAR FROM completed_at)::int  AS year,
         EXTRACT(MONTH FROM completed_at)::int AS month,
         COALESCE(SUM(amount), 0)::float AS total
       FROM donations
       WHERE entity_id = $1 AND status = 'paid'
         AND completed_at >= date_trunc('year', NOW() - INTERVAL '1 year')
       GROUP BY 1, 2
       ORDER BY 1, 2`,
      [entityId]
    ),
  ]);

  const now  = thisMonthRes.rows[0];
  const prev = lastMonthRes.rows[0];
  const pctChange = (a, b) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);

  const currentYear = new Date().getFullYear();
  const lastYear    = currentYear - 1;
  const thisYearSeries = new Array(12).fill(0);
  const lastYearSeries = new Array(12).fill(0);
  for (const row of yearSeriesRes.rows) {
    if (row.year === currentYear) thisYearSeries[row.month - 1] = row.total;
    else if (row.year === lastYear) lastYearSeries[row.month - 1] = row.total;
  }

  return {
    kpi: {
      thisMonth: { total: now.total, count: now.count, avg: now.avg },
      lastMonth: { total: prev.total, count: prev.count, avg: prev.avg },
      pctChange: {
        total: pctChange(now.total, prev.total),
        count: pctChange(now.count, prev.count),
        avg:   pctChange(now.avg, prev.avg),
      },
    },
    yearOverYear: {
      thisYear: currentYear,
      lastYear,
      thisYearSeries,
      lastYearSeries,
    },
  };
};

/* ─────────────────────────────────────────
   4. FAILURES & PROCESSING
───────────────────────────────────────── */
const FAILURES_SORT = {
  donor:    'd.donor_name',
  campaign: 'c.title',
  amount:   'd.amount',
  status:   'd.status',
  date:     'd.updated_at',
};

exports.getFailures = async (entityId, { search, status, sortBy, sortDir } = {}) => {
  const where  = ['d.entity_id = $1', `d.status IN ('failed', 'pending')`];
  const params = [entityId];
  let idx = 2;

  if (status && status !== 'all') {
    where.push(`d.status = $${idx++}`);
    params.push(status);
  }
  if (search) {
    where.push(`(d.donor_name ILIKE $${idx} OR c.title ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const sortCol = FAILURES_SORT[sortBy] || 'd.updated_at';
  const sortOrd = sortDir === 'asc' ? 'ASC' : 'DESC';

  const [kpiRes, reasonsRes, listRes] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'failed' AND updated_at >= date_trunc('month', NOW()))::int   AS failed_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'failed' AND updated_at >= date_trunc('month', NOW())), 0)::float AS failed_amount,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'paid' AND completed_at >= date_trunc('month', NOW()))::int   AS paid_count_month
       FROM donations
       WHERE entity_id = $1`,
      [entityId]
    ),
    db.query(
      `SELECT COALESCE(NULLIF(failure_reason, ''), 'לא צוין') AS reason, COUNT(*)::int AS count
       FROM donations
       WHERE entity_id = $1 AND status = 'failed'
       GROUP BY reason
       ORDER BY count DESC
       LIMIT 10`,
      [entityId]
    ),
    db.query(
      `SELECT d.id, d.amount::float, d.donor_name, d.status, d.failure_reason,
              d.created_at, d.updated_at, c.title AS campaign_title
       FROM donations d
       JOIN campaigns c ON c.id = d.campaign_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT 100`,
      params
    ),
  ]);

  const kpi = kpiRes.rows[0];
  const denom = kpi.paid_count_month + kpi.failed_count;

  return {
    kpi: {
      failedCount:  kpi.failed_count,
      failedAmount: kpi.failed_amount,
      pendingCount: kpi.pending_count,
      successRate:  denom > 0 ? Math.round((kpi.paid_count_month / denom) * 100) : null,
    },
    failureReasons: reasonsRes.rows,
    recent: listRes.rows,
  };
};
