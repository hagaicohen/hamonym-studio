const db = require('../../db/db');
const entitiesService = require('../entities/entities.service');
const ambassadorsService = require('../ambassadors/ambassadors.service');
const donationsService = require('../donations/donations.service');

const ORG_SORT_COLUMNS = {
  name: 'e.display_name',
  status: 'e.status',
  created_at: 'e.created_at',
  campaigns: 'campaigns_count',
  raised: 'total_raised',
};

const ACTION_LABELS = {
  approve: 'אושרה',
  reject: 'נדחתה',
  request_changes: 'נדרשו תיקונים',
  suspend: 'הושעתה',
  reactivate: 'הופעלה מחדש',
};

const PROFILE_COMPLETION_SQL = `
  ROUND((
    (CASE WHEN e.display_name IS NOT NULL AND e.display_name <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN e.legal_name IS NOT NULL AND e.legal_name <> '' THEN 1 ELSE 0 END) +
    (CASE WHEN e.association_certificate_name IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN e.tax_document_name IS NOT NULL THEN 1 ELSE 0 END) +
    (CASE WHEN e.cardcom_connection_status = 'success' THEN 1 ELSE 0 END)
  ) / 5.0 * 100)::int AS profile_completion
`;

exports.getDashboardData = async () => {
  const [kpis, alerts, activity, charts] = await Promise.all([
    getKpis(),
    getAlerts(),
    getActivity(),
    getCharts(),
  ]);
  return { kpis, alerts, activity, charts };
};

async function getKpis() {
  const [entitiesRes, campaignsRes, donationsRes, newDonorsRes] = await Promise.all([
    db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE status = 'pending_review')::int AS pending_review
       FROM entities`
    ),
    db.query(`SELECT COUNT(*)::int AS active FROM campaigns WHERE status = 'published'`),
    db.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND created_at >= CURRENT_DATE), 0)::float AS today,
         COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND created_at >= date_trunc('month', NOW())), 0)::float AS month,
         COUNT(*) FILTER (WHERE status = 'failed' AND created_at >= date_trunc('month', NOW()))::int AS failed_this_month
       FROM donations`
    ),
    db.query(
      `WITH donor_first AS (
         SELECT COALESCE(NULLIF(donor_email, ''), NULLIF(donor_phone, ''), donor_name) AS donor_key,
                MIN(created_at) AS first_at
         FROM donations
         WHERE status = 'paid'
         GROUP BY donor_key
       )
       SELECT COUNT(*)::int AS new_donors
       FROM donor_first
       WHERE first_at >= date_trunc('month', NOW())`
    ),
  ]);

  return {
    totalEntities: entitiesRes.rows[0].total,
    activeEntities: entitiesRes.rows[0].active,
    pendingReviewEntities: entitiesRes.rows[0].pending_review,
    activeCampaigns: campaignsRes.rows[0].active,
    donationsToday: donationsRes.rows[0].today,
    donationsMonth: donationsRes.rows[0].month,
    failedPaymentsThisMonth: donationsRes.rows[0].failed_this_month,
    newDonorsThisMonth: newDonorsRes.rows[0].new_donors,
  };
}

async function getAlerts() {
  const [pendingRes, missingDocsRes, cardcomRes, overdueRes] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS c FROM entities WHERE status = 'pending_review'`),
    db.query(
      `SELECT COUNT(*)::int AS c FROM entities
       WHERE association_certificate_name IS NULL OR tax_document_name IS NULL`
    ),
    db.query(
      `SELECT COUNT(*)::int AS c FROM entities
       WHERE status = 'active' AND cardcom_connection_status IS DISTINCT FROM 'success'`
    ),
    db.query(
      `SELECT COUNT(*)::int AS c FROM campaigns
       WHERE status = 'published' AND end_date IS NOT NULL AND end_date < NOW()`
    ),
  ]);

  const alerts = [];
  if (pendingRes.rows[0].c > 0) {
    alerts.push({ key: 'pending_review', label: 'עמותות ממתינות לאישור', count: pendingRes.rows[0].c, linkQuery: { status: 'pending_review' } });
  }
  if (missingDocsRes.rows[0].c > 0) {
    alerts.push({ key: 'missing_docs', label: 'עמותות ללא מסמכים', count: missingDocsRes.rows[0].c, linkQuery: { missingDocs: '1' } });
  }
  if (cardcomRes.rows[0].c > 0) {
    alerts.push({ key: 'cardcom_issue', label: 'עמותות פעילות עם סליקה מנותקת', count: cardcomRes.rows[0].c, linkQuery: {} });
  }
  if (overdueRes.rows[0].c > 0) {
    alerts.push({ key: 'overdue_campaigns', label: 'קמפיינים שעברו את תאריך הסיום', count: overdueRes.rows[0].c, linkQuery: {} });
  }
  return alerts;
}

async function getActivity() {
  const [auditRes, campaignsRes, donationsRes, usersRes] = await Promise.all([
    db.query(
      `SELECT a.action, a.created_at, u.full_name AS actor_name, e.display_name AS entity_name
       FROM platform_audit_log a
       JOIN users u ON u.id = a.super_admin_user_id
       LEFT JOIN entities e ON e.id = a.entity_id
       ORDER BY a.created_at DESC LIMIT 10`
    ),
    db.query(
      `SELECT c.title, c.created_at, e.display_name AS entity_name
       FROM campaigns c JOIN entities e ON e.id = c.entity_id
       ORDER BY c.created_at DESC LIMIT 10`
    ),
    db.query(
      `SELECT d.amount::float, d.created_at, c.title AS campaign_title
       FROM donations d JOIN campaigns c ON c.id = d.campaign_id
       WHERE d.status = 'paid'
       ORDER BY d.created_at DESC LIMIT 10`
    ),
    db.query(`SELECT email, full_name, created_at FROM users ORDER BY created_at DESC LIMIT 10`),
  ]);

  const items = [
    ...auditRes.rows.map((r) => ({
      type: 'audit',
      label: `${ACTION_LABELS[r.action] || r.action}: ${r.entity_name || '—'}`,
      timestamp: r.created_at,
    })),
    ...campaignsRes.rows.map((r) => ({
      type: 'campaign',
      label: `קמפיין חדש: ${r.title} (${r.entity_name})`,
      timestamp: r.created_at,
    })),
    ...donationsRes.rows.map((r) => ({
      type: 'donation',
      label: `תרומה התקבלה: ₪${Math.round(r.amount).toLocaleString('he-IL')} ל${r.campaign_title}`,
      timestamp: r.created_at,
    })),
    ...usersRes.rows.map((r) => ({
      type: 'user',
      label: `משתמש חדש נרשם: ${r.full_name || r.email}`,
      timestamp: r.created_at,
    })),
  ];

  items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return items.slice(0, 20);
}

async function getCharts() {
  const [dailyRes, weeklyRes] = await Promise.all([
    db.query(
      `SELECT gs::date AS day, COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'paid'), 0)::float AS total
       FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') gs
       LEFT JOIN donations d ON date_trunc('day', d.created_at) = gs
       GROUP BY gs ORDER BY gs`
    ),
    db.query(
      `SELECT gs::date AS week, COUNT(e.id)::int AS count
       FROM generate_series(date_trunc('week', CURRENT_DATE) - INTERVAL '7 weeks', date_trunc('week', CURRENT_DATE), INTERVAL '1 week') gs
       LEFT JOIN entities e ON date_trunc('week', e.created_at) = gs
       GROUP BY gs ORDER BY gs`
    ),
  ]);

  return {
    donationsDaily: dailyRes.rows.map((r) => ({ date: r.day, value: r.total })),
    entitiesWeekly: weeklyRes.rows.map((r) => ({ date: r.week, value: r.count })),
  };
}

exports.getOrganizations = async ({ search, status, sortBy, sortDir, page = 0, limit = 25, missingDocs, noCampaigns, newSince }) => {
  const where = [];
  const params = [];
  let idx = 1;

  if (status && status !== 'all') {
    where.push(`e.status = $${idx++}`);
    params.push(status);
  }
  if (search) {
    where.push(`e.display_name ILIKE $${idx}`);
    params.push(`%${search}%`);
    idx++;
  }
  if (missingDocs) {
    where.push(`(e.association_certificate_name IS NULL OR e.tax_document_name IS NULL)`);
  }
  if (newSince) {
    where.push(`e.created_at >= NOW() - ($${idx++} || ' days')::interval`);
    params.push(String(newSince));
  }

  const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = ORG_SORT_COLUMNS[sortBy] || 'e.created_at';
  const sortOrd = sortDir === 'asc' ? 'ASC' : 'DESC';

  // noCampaigns filters on the per-row lateral column, applied after the joins below
  const noCampaignsClause = noCampaigns ? `${where.length ? 'AND' : 'WHERE'} COALESCE(camp.campaigns_count, 0) = 0` : '';

  const [listRes, totalRes] = await Promise.all([
    db.query(
      `SELECT
         e.id, e.display_name, e.logo_url, e.status, e.created_at, e.updated_at,
         ${PROFILE_COMPLETION_SQL},
         owner.full_name AS owner_name, owner.email AS owner_email,
         COALESCE(camp.campaigns_count, 0) AS campaigns_count,
         COALESCE(camp.total_raised, 0)::float AS total_raised
       FROM entities e
       LEFT JOIN LATERAL (
         SELECT u.full_name, u.email
         FROM user_entities ue
         JOIN users u ON u.id = ue.user_id
         WHERE ue.entity_id = e.id AND ue.role = 'owner'
         LIMIT 1
       ) owner ON true
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int AS campaigns_count,
           COALESCE(SUM(c.current_amount), 0) AS total_raised
         FROM campaigns c
         WHERE c.entity_id = e.id
       ) camp ON true
       ${whereStr}
       ${noCampaignsClause}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM entities e
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS campaigns_count FROM campaigns c WHERE c.entity_id = e.id
       ) camp ON true
       ${whereStr}
       ${noCampaignsClause}`,
      params
    ),
  ]);

  return {
    organizations: listRes.rows,
    total: totalRes.rows[0].total,
    page,
    limit,
  };
};

exports.getOrganizationDetail = async (entityId) => {
  const [entity, usersRes, campaignsRes, ambassadors, donations, auditRes, donorCountRes] = await Promise.all([
    entitiesService.getEntityById(entityId),
    db.query(
      `SELECT u.id, u.full_name, u.email, ue.role
       FROM user_entities ue
       JOIN users u ON u.id = ue.user_id
       WHERE ue.entity_id = $1`,
      [entityId]
    ),
    db.query(
      `SELECT id, title, slug, status, current_amount, target_amount, supporters_count, created_at
       FROM campaigns
       WHERE entity_id = $1
       ORDER BY created_at DESC`,
      [entityId]
    ),
    ambassadorsService.getEntityAmbassadors(entityId, {}),
    donationsService.getEntityDonations(entityId, { limit: 10 }),
    db.query(
      `SELECT a.id, a.action, a.notes, a.reason_tags, a.created_at, u.full_name AS super_admin_name
       FROM platform_audit_log a
       JOIN users u ON u.id = a.super_admin_user_id
       WHERE a.entity_id = $1
       ORDER BY a.created_at DESC`,
      [entityId]
    ),
    db.query(
      `SELECT COUNT(DISTINCT COALESCE(NULLIF(donor_email, ''), NULLIF(donor_phone, ''), donor_name))::int AS donor_count
       FROM donations
       WHERE entity_id = $1 AND status = 'paid'`,
      [entityId]
    ),
  ]);

  if (!entity) throw new Error('Entity not found');

  return {
    entity,
    users: usersRes.rows,
    campaigns: campaignsRes.rows,
    ambassadors: ambassadors.ambassadors,
    donations: donations.donations,
    donationsKpi: donations.kpi,
    auditLog: auditRes.rows,
    donorCount: donorCountRes.rows[0].donor_count,
  };
};

async function setStatus(entityId, superAdminUserId, status, action, notes, reasonTags) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE entities SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, entityId]
    );
    if (!result.rows[0]) throw new Error('Entity not found');

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, reason_tags)
       VALUES ($1, $2, $3, $4, $5)`,
      [superAdminUserId, entityId, action, notes || null, reasonTags && reasonTags.length ? reasonTags : null]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

exports.approve = (entityId, superAdminUserId, notes) =>
  setStatus(entityId, superAdminUserId, 'active', 'approve', notes);

exports.reject = (entityId, superAdminUserId, notes, reasonTags) =>
  setStatus(entityId, superAdminUserId, 'rejected', 'reject', notes, reasonTags);

exports.requestChanges = (entityId, superAdminUserId, notes, reasonTags) =>
  setStatus(entityId, superAdminUserId, 'changes_requested', 'request_changes', notes, reasonTags);

exports.suspend = (entityId, superAdminUserId, notes, reasonTags) =>
  setStatus(entityId, superAdminUserId, 'suspended', 'suspend', notes, reasonTags);

exports.reactivate = (entityId, superAdminUserId, notes) =>
  setStatus(entityId, superAdminUserId, 'active', 'reactivate', notes);
