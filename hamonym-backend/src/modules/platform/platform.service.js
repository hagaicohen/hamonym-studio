const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const db = require('../../db/db');
const entitiesService = require('../entities/entities.service');
const ambassadorsService = require('../ambassadors/ambassadors.service');
const donationsService = require('../donations/donations.service');
const emailService = require('../email/email.service');

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

const CAMPAIGN_SORT_COLUMNS = {
  title: 'c.title',
  status: 'c.status',
  created_at: 'c.created_at',
  raised: 'c.current_amount',
  entity: 'e.display_name',
};

const CAMPAIGN_STATUS_LABELS = {
  draft: 'טיוטה',
  published: 'פעיל',
  paused: 'מושהה',
  ended: 'הסתיים',
};

const CAMPAIGN_ACTION_LABELS = {
  feature: 'סומן כמומלץ',
  unfeature: 'הוסר סימון מומלץ',
  lock: 'ננעל לעריכה',
  unlock: 'נפתח לעריכה',
  delete: 'נמחק',
  restore: 'שוחזר',
  transfer_ownership: 'הועבר לעמותה אחרת',
  change_slug: 'כתובת הקמפיין שונתה',
  duplicate: 'שוכפל',
};

function campaignActionLabel(action) {
  if (action.startsWith('status_change:')) {
    const status = action.split(':')[1];
    return `סטטוס שונה ל${CAMPAIGN_STATUS_LABELS[status] || status}`;
  }
  return CAMPAIGN_ACTION_LABELS[action] || action;
}

const USER_SORT_COLUMNS = {
  name: 'u.full_name',
  email: 'u.email',
  role: 'r.name',
  created_at: 'u.created_at',
  last_login_at: 'u.last_login_at',
};

const USER_ACTION_LABELS = {
  disable: 'הושבת',
  enable: 'הופעל מחדש',
  delete: 'נמחק',
  restore: 'שוחזר',
  reset_password_link: 'נוצר קישור לאיפוס סיסמה',
  impersonate: 'בוצעה התחברות בשמו (Impersonation)',
  grant_super_admin: 'הוגדר כסופר אדמין מלא',
  revoke_super_admin: 'הוסרה הרשאת סופר אדמין מלא',
  set_permissions: 'הרשאות פלטפורמה עודכנו',
  create_admin: 'נוצר כמנהל פלטפורמה',
};

const VALID_PLATFORM_PERMISSIONS = ['organizations', 'campaigns'];

function userActionLabel(action) {
  return USER_ACTION_LABELS[action] || action;
}

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
  const [kpis, alerts, charts] = await Promise.all([
    getKpis(),
    getAlerts(),
    getCharts(),
  ]);
  return { kpis, alerts, charts };
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
    db.query(`SELECT COUNT(*)::int AS active FROM campaigns WHERE status = 'published' AND deleted_at IS NULL`),
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

const ACTIVITY_TYPES = ['audit', 'campaign_audit', 'user_audit', 'campaign', 'donation', 'user'];

const ACTIVITY_UNION_SQL = `
  SELECT
    'audit'::text AS type, a.created_at AS ts,
    u.full_name AS actor_name, a.action AS action,
    e.display_name AS entity_name, NULL::text AS campaign_title,
    NULL::numeric AS amount, NULL::text AS user_name
  FROM platform_audit_log a
  JOIN users u ON u.id = a.super_admin_user_id
  JOIN entities e ON e.id = a.entity_id
  WHERE a.entity_id IS NOT NULL

  UNION ALL

  SELECT
    'campaign_audit', a.created_at,
    u.full_name, a.action,
    NULL, c.title,
    NULL, NULL
  FROM platform_audit_log a
  JOIN users u ON u.id = a.super_admin_user_id
  JOIN campaigns c ON c.id = a.campaign_id
  WHERE a.campaign_id IS NOT NULL

  UNION ALL

  SELECT
    'user_audit', a.created_at,
    u.full_name, a.action,
    NULL, NULL,
    NULL, COALESCE(t.full_name, t.email)
  FROM platform_audit_log a
  JOIN users u ON u.id = a.super_admin_user_id
  JOIN users t ON t.id = a.target_user_id
  WHERE a.target_user_id IS NOT NULL

  UNION ALL

  SELECT
    'campaign', c.created_at,
    NULL, NULL,
    e.display_name, c.title,
    NULL, NULL
  FROM campaigns c
  JOIN entities e ON e.id = c.entity_id

  UNION ALL

  SELECT
    'donation', d.created_at,
    NULL, NULL,
    NULL, c.title,
    d.amount, NULL
  FROM donations d
  JOIN campaigns c ON c.id = d.campaign_id
  WHERE d.status = 'paid'

  UNION ALL

  SELECT
    'user', created_at,
    NULL, NULL,
    NULL, NULL,
    NULL, COALESCE(full_name, email)
  FROM users
`;

function formatActivityRow(r) {
  switch (r.type) {
    case 'audit':
      return { type: r.type, title: `עמותת ${r.entity_name}`, subtitle: `${ACTION_LABELS[r.action] || r.action} ע"י ${r.actor_name}`, timestamp: r.ts };
    case 'campaign_audit':
      return { type: r.type, title: `קמפיין ${r.campaign_title}`, subtitle: `${campaignActionLabel(r.action)} ע"י ${r.actor_name}`, timestamp: r.ts };
    case 'user_audit':
      return { type: r.type, title: `משתמש ${r.user_name}`, subtitle: `${userActionLabel(r.action)} ע"י ${r.actor_name}`, timestamp: r.ts };
    case 'campaign':
      return { type: r.type, title: `קמפיין חדש: ${r.campaign_title}`, subtitle: r.entity_name, timestamp: r.ts };
    case 'donation':
      return { type: r.type, title: `תרומה: ₪${Math.round(r.amount).toLocaleString('he-IL')}`, subtitle: `לקמפיין ${r.campaign_title}`, timestamp: r.ts };
    case 'user':
      return { type: r.type, title: `משתמש חדש: ${r.user_name}`, subtitle: null, timestamp: r.ts };
    default:
      return { type: r.type, title: r.type, subtitle: null, timestamp: r.ts };
  }
}

exports.getActivityFeed = async ({ type, sortDir, page = 0, limit = 20 }) => {
  const typeFilter = type && ACTIVITY_TYPES.includes(type) ? type : null;
  const whereStr = typeFilter ? `WHERE type = $1` : '';
  const sortOrd = sortDir === 'asc' ? 'ASC' : 'DESC';
  const params = typeFilter ? [typeFilter] : [];

  const [listRes, totalRes] = await Promise.all([
    db.query(
      `SELECT * FROM (${ACTIVITY_UNION_SQL}) combined
       ${whereStr}
       ORDER BY ts ${sortOrd}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM (${ACTIVITY_UNION_SQL}) combined ${whereStr}`,
      params
    ),
  ]);

  return {
    items: listRes.rows.map(formatActivityRow),
    total: totalRes.rows[0].total,
    page,
    limit,
  };
};

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
      `SELECT id, title, slug, status, current_amount, target_amount, supporters_count, is_featured, is_locked, created_at
       FROM campaigns
       WHERE entity_id = $1 AND deleted_at IS NULL
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

async function setStatus(entityId, superAdminUserId, status, action, notes, reasonTags, ip) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE entities SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, entityId]
    );
    if (!result.rows[0]) throw new Error('Entity not found');

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, reason_tags, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [superAdminUserId, entityId, action, notes || null, reasonTags && reasonTags.length ? reasonTags : null, ip || null]
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

exports.approve = (entityId, superAdminUserId, notes, reasonTags, ip) =>
  setStatus(entityId, superAdminUserId, 'active', 'approve', notes, null, ip);

exports.reject = (entityId, superAdminUserId, notes, reasonTags, ip) =>
  setStatus(entityId, superAdminUserId, 'rejected', 'reject', notes, reasonTags, ip);

exports.requestChanges = (entityId, superAdminUserId, notes, reasonTags, ip) =>
  setStatus(entityId, superAdminUserId, 'changes_requested', 'request_changes', notes, reasonTags, ip);

exports.suspend = (entityId, superAdminUserId, notes, reasonTags, ip) =>
  setStatus(entityId, superAdminUserId, 'suspended', 'suspend', notes, reasonTags, ip);

exports.reactivate = (entityId, superAdminUserId, notes, reasonTags, ip) =>
  setStatus(entityId, superAdminUserId, 'active', 'reactivate', notes, null, ip);

exports.getCampaigns = async ({ search, status, entityId, sortBy, sortDir, page = 0, limit = 25, showDeleted, featuredOnly }) => {
  const where = [];
  const params = [];
  let idx = 1;

  where.push(showDeleted ? `c.deleted_at IS NOT NULL` : `c.deleted_at IS NULL`);

  if (status && status !== 'all') {
    where.push(`c.status = $${idx++}`);
    params.push(status);
  }
  if (entityId) {
    where.push(`c.entity_id = $${idx++}`);
    params.push(entityId);
  }
  if (search) {
    where.push(`c.title ILIKE $${idx}`);
    params.push(`%${search}%`);
    idx++;
  }
  if (featuredOnly) {
    where.push(`c.is_featured = true`);
  }

  const whereStr = `WHERE ${where.join(' AND ')}`;
  const sortCol = CAMPAIGN_SORT_COLUMNS[sortBy] || 'c.created_at';
  const sortOrd = sortDir === 'asc' ? 'ASC' : 'DESC';

  const [listRes, totalRes] = await Promise.all([
    db.query(
      `SELECT
         c.id, c.title, c.slug, c.status, c.current_amount, c.target_amount, c.supporters_count,
         c.is_featured, c.is_locked, c.deleted_at, c.created_at,
         e.id AS entity_id, e.display_name AS entity_name
       FROM campaigns c
       JOIN entities e ON e.id = c.entity_id
       ${whereStr}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM campaigns c JOIN entities e ON e.id = c.entity_id ${whereStr}`,
      params
    ),
  ]);

  return {
    campaigns: listRes.rows,
    total: totalRes.rows[0].total,
    page,
    limit,
  };
};

exports.getCampaignDetail = async (campaignId) => {
  const [campaignRes, auditRes] = await Promise.all([
    db.query(
      `SELECT c.*, e.display_name AS entity_name
       FROM campaigns c
       JOIN entities e ON e.id = c.entity_id
       WHERE c.id = $1
       LIMIT 1`,
      [campaignId]
    ),
    db.query(
      `SELECT a.id, a.action, a.notes, a.created_at, u.full_name AS super_admin_name
       FROM platform_audit_log a
       JOIN users u ON u.id = a.super_admin_user_id
       WHERE a.campaign_id = $1
       ORDER BY a.created_at DESC`,
      [campaignId]
    ),
  ]);

  if (!campaignRes.rows.length) throw new Error('Campaign not found');

  return {
    campaign: campaignRes.rows[0],
    auditLog: auditRes.rows,
  };
};

async function campaignAction(campaignId, superAdminUserId, action, notes, ip, mutate) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await mutate(client);
    if (!result.rows[0]) throw new Error('Campaign not found');

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, campaign_id, action, notes, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [superAdminUserId, campaignId, action, notes || null, ip || null]
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

exports.setCampaignStatus = (campaignId, superAdminUserId, status, notes, ip) =>
  campaignAction(campaignId, superAdminUserId, `status_change:${status}`, notes, ip, (client) =>
    client.query(
      `UPDATE campaigns SET status = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [status, campaignId]
    )
  );

exports.setCampaignFeatured = (campaignId, superAdminUserId, featured, ip) =>
  campaignAction(campaignId, superAdminUserId, featured ? 'feature' : 'unfeature', null, ip, (client) =>
    client.query(
      `UPDATE campaigns SET is_featured = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [featured, campaignId]
    )
  );

exports.setCampaignLocked = (campaignId, superAdminUserId, locked, notes, ip) =>
  campaignAction(campaignId, superAdminUserId, locked ? 'lock' : 'unlock', notes, ip, (client) =>
    client.query(
      `UPDATE campaigns SET is_locked = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [locked, campaignId]
    )
  );

exports.softDeleteCampaign = (campaignId, superAdminUserId, notes, ip) =>
  campaignAction(campaignId, superAdminUserId, 'delete', notes, ip, (client) =>
    client.query(
      `UPDATE campaigns SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [superAdminUserId, campaignId]
    )
  );

exports.restoreCampaign = (campaignId, superAdminUserId, notes, ip) =>
  campaignAction(campaignId, superAdminUserId, 'restore', notes, ip, (client) =>
    client.query(
      `UPDATE campaigns SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [campaignId]
    )
  );

exports.transferCampaignOwnership = (campaignId, superAdminUserId, newEntityId, notes, ip) =>
  campaignAction(campaignId, superAdminUserId, 'transfer_ownership', notes, ip, (client) =>
    client.query(
      `UPDATE campaigns SET entity_id = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [newEntityId, campaignId]
    )
  );

exports.setCampaignSlug = (campaignId, superAdminUserId, newSlug, notes, ip) =>
  campaignAction(campaignId, superAdminUserId, 'change_slug', notes, ip, (client) =>
    client.query(
      `UPDATE campaigns SET slug = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [newSlug, campaignId]
    )
  );

exports.duplicateCampaign = async (campaignId, superAdminUserId, notes, ip) => {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const srcRes = await client.query(`SELECT * FROM campaigns WHERE id = $1 LIMIT 1`, [campaignId]);
    const src = srcRes.rows[0];
    if (!src) throw new Error('Campaign not found');

    const columns = Object.keys(src).filter((k) => !['id', 'created_at', 'updated_at', 'published_at'].includes(k));
    const newSlug = `${src.slug}-copy-${Date.now()}`;

    // Matches campaigns.service.js's JSON_COLUMNS: these are jsonb, so they need an
    // explicit JSON.stringify — pg's default Array.isArray branch would otherwise
    // format them as Postgres array literals instead of JSON. Everything else
    // (including the native numeric[] columns suggested_amounts/monthly_amounts)
    // must be passed through untouched so pg's own array serialization applies.
    const JSONB_COLUMNS = new Set([
      'hero_text_style', 'hero_cta_config', 'rewards', 'sponsors',
      'ambassadors', 'updates', 'blocks', 'layout',
    ]);
    const toInsertValue = (key, v) => {
      if (v === null || v === undefined || v instanceof Date) return v;
      return JSONB_COLUMNS.has(key) && typeof v === 'object' ? JSON.stringify(v) : v;
    };

    const values = columns.map((k) => {
      if (k === 'slug') return newSlug;
      if (k === 'status') return 'draft';
      if (k === 'current_amount' || k === 'supporters_count') return 0;
      return toInsertValue(k, src[k]);
    });
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

    const insertRes = await client.query(
      `INSERT INTO campaigns (${columns.join(', ')}) VALUES (${placeholders}) RETURNING *`,
      values
    );
    const newCampaign = insertRes.rows[0];

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, campaign_id, action, notes, ip_address)
       VALUES ($1, $2, 'duplicate', $3, $4)`,
      [superAdminUserId, campaignId, notes || `שוכפל ל: ${newCampaign.title} (${newCampaign.id})`, ip || null]
    );

    await client.query('COMMIT');
    return newCampaign;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

exports.getRoles = async () => {
  const res = await db.query(`SELECT id, code, name FROM roles ORDER BY id`);
  return res.rows;
};

exports.getUsers = async ({ search, roleId, status, sortBy, sortDir, page = 0, limit = 25 }) => {
  const where = [];
  const params = [];
  let idx = 1;

  if (status === 'deleted') {
    where.push(`u.deleted_at IS NOT NULL`);
  } else {
    where.push(`u.deleted_at IS NULL`);
    if (status === 'active') where.push(`u.is_active = true`);
    if (status === 'disabled') where.push(`u.is_active = false`);
    if (status === 'super_admin') where.push(`u.is_super_admin = true`);
  }

  if (roleId) {
    where.push(`u.role_id = $${idx++}`);
    params.push(roleId);
  }
  if (search) {
    where.push(`(u.full_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereStr = `WHERE ${where.join(' AND ')}`;
  const sortCol = USER_SORT_COLUMNS[sortBy] || 'u.created_at';
  const sortOrd = sortDir === 'asc' ? 'ASC' : 'DESC';

  const [listRes, totalRes] = await Promise.all([
    db.query(
      `SELECT
         u.id, u.email, u.full_name, u.phone, u.role_id, r.name AS role_name,
         u.is_active, u.is_super_admin, u.email_verified, u.last_login_at,
         u.created_at, u.deleted_at, u.platform_permissions,
         COALESCE(ec.entities_count, 0) AS entities_count
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS entities_count FROM user_entities ue WHERE ue.user_id = u.id
       ) ec ON true
       ${whereStr}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM users u JOIN roles r ON r.id = u.role_id ${whereStr}`,
      params
    ),
  ]);

  return { users: listRes.rows, total: totalRes.rows[0].total, page, limit };
};

exports.getUserDetail = async (userId) => {
  const [userRes, entitiesRes, auditRes] = await Promise.all([
    db.query(
      `SELECT u.id, u.email, u.full_name, u.phone, u.role_id, r.name AS role_name,
              u.is_active, u.is_super_admin, u.email_verified, u.last_login_at,
              u.created_at, u.updated_at, u.deleted_at, u.platform_permissions,
              u.google_id IS NOT NULL AS is_oauth
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = $1 LIMIT 1`,
      [userId]
    ),
    db.query(
      `SELECT ue.entity_id, e.display_name AS entity_name, ue.role
       FROM user_entities ue JOIN entities e ON e.id = ue.entity_id
       WHERE ue.user_id = $1`,
      [userId]
    ),
    db.query(
      `SELECT a.id, a.action, a.notes, a.created_at, u.full_name AS super_admin_name
       FROM platform_audit_log a JOIN users u ON u.id = a.super_admin_user_id
       WHERE a.target_user_id = $1 ORDER BY a.created_at DESC`,
      [userId]
    ),
  ]);

  if (!userRes.rows.length) throw new Error('User not found');

  return { user: userRes.rows[0], entities: entitiesRes.rows, auditLog: auditRes.rows };
};

async function userAction(userId, superAdminUserId, action, notes, ip, mutate) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await mutate(client);
    if (!result.rows[0]) throw new Error('User not found');

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, target_user_id, action, notes, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [superAdminUserId, userId, action, notes || null, ip || null]
    );

    await client.query('COMMIT');
    const user = result.rows[0];
    delete user.password_hash;
    delete user.password_reset_token;
    return user;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

exports.setUserActive = (userId, superAdminUserId, active, notes, ip) => {
  if (String(userId) === String(superAdminUserId)) throw new Error('Cannot modify own account');
  return userAction(userId, superAdminUserId, active ? 'enable' : 'disable', notes, ip, (client) =>
    client.query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [active, userId]
    )
  );
};

exports.softDeleteUser = (userId, superAdminUserId, notes, ip) => {
  if (String(userId) === String(superAdminUserId)) throw new Error('Cannot modify own account');
  return userAction(userId, superAdminUserId, 'delete', notes, ip, (client) =>
    client.query(
      `UPDATE users SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [superAdminUserId, userId]
    )
  );
};

exports.restoreUser = (userId, superAdminUserId, notes, ip) =>
  userAction(userId, superAdminUserId, 'restore', notes, ip, (client) =>
    client.query(
      `UPDATE users SET deleted_at = NULL, deleted_by = NULL, updated_at = NOW() WHERE id = $1 AND deleted_at IS NOT NULL RETURNING *`,
      [userId]
    )
  );

exports.generatePasswordResetLink = async (userId, superAdminUserId, notes, ip) => {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const user = await userAction(userId, superAdminUserId, 'reset_password_link', notes, ip, (client) =>
    client.query(
      `UPDATE users SET password_reset_token = $1, password_reset_expires_at = $2, updated_at = NOW()
       WHERE id = $3 AND deleted_at IS NULL RETURNING *`,
      [tokenHash, expiresAt, userId]
    )
  );

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  const resetUrl = `${frontBase}/reset-password?token=${rawToken}`;

  emailService.queue({
    template: 'reset-password',
    to: user.email,
    data: { fullName: user.full_name, resetUrl },
    userId: user.id,
  });

  return { user, resetToken: rawToken, expiresAt };
};

exports.impersonateUser = async (userId, superAdminUserId, notes, ip) => {
  if (String(userId) === String(superAdminUserId)) throw new Error('Cannot impersonate self');

  const userRes = await db.query(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL AND is_active = true LIMIT 1`,
    [userId]
  );
  if (!userRes.rows.length) throw new Error('User not found');
  const target = userRes.rows[0];

  if (target.is_super_admin) throw new Error('Cannot impersonate a super admin');

  const adminRes = await db.query(`SELECT full_name, email FROM users WHERE id = $1 LIMIT 1`, [superAdminUserId]);
  const admin = adminRes.rows[0];

  await db.query(
    `INSERT INTO platform_audit_log (super_admin_user_id, target_user_id, action, notes, ip_address)
     VALUES ($1, $2, 'impersonate', $3, $4)`,
    [superAdminUserId, userId, notes || null, ip || null]
  );

  const token = jwt.sign(
    {
      userId: target.id,
      roleId: target.role_id,
      isSuperAdmin: false,
      impersonatedBy: superAdminUserId,
      impersonatorName: admin?.full_name || admin?.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  return {
    token,
    user: {
      id: target.id,
      email: target.email,
      full_name: target.full_name,
      role_id: target.role_id,
      picture: target.picture ?? null,
      is_super_admin: false,
    },
  };
};

exports.setUserSuperAdmin = (userId, superAdminUserId, isSuperAdmin, notes, ip) => {
  if (String(userId) === String(superAdminUserId)) throw new Error('Cannot modify own account');
  return userAction(userId, superAdminUserId, isSuperAdmin ? 'grant_super_admin' : 'revoke_super_admin', notes, ip, (client) =>
    client.query(
      `UPDATE users SET is_super_admin = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [isSuperAdmin, userId]
    )
  );
};

exports.setUserPermissions = (userId, superAdminUserId, permissions, notes, ip) => {
  if (String(userId) === String(superAdminUserId)) throw new Error('Cannot modify own account');
  const clean = Array.isArray(permissions) ? permissions.filter((p) => VALID_PLATFORM_PERMISSIONS.includes(p)) : [];
  return userAction(userId, superAdminUserId, 'set_permissions', notes, ip, (client) =>
    client.query(
      `UPDATE users SET platform_permissions = $1, updated_at = NOW() WHERE id = $2 AND deleted_at IS NULL RETURNING *`,
      [clean.length ? clean : null, userId]
    )
  );
};

exports.createAdminUser = async ({ email, fullName, isSuperAdmin, permissions, superAdminUserId, notes, ip }) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('Email is required');

  const existing = await db.query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, [cleanEmail]);
  if (existing.rows.length) throw new Error('Email already exists');

  const clean = Array.isArray(permissions) ? permissions.filter((p) => VALID_PLATFORM_PERMISSIONS.includes(p)) : [];

  // Unusable random password hash — forces the new admin through the reset-password
  // link (generated below) instead of leaving password_hash NULL, which would throw
  // inside bcrypt.compare on login instead of cleanly rejecting with "Invalid credentials".
  const randomPassword = crypto.randomBytes(24).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, 10);

  const client = await db.connect();
  let newUser;
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO users (role_id, email, full_name, password_hash, is_active, is_super_admin, platform_permissions)
       VALUES (5, $1, $2, $3, true, $4, $5)
       RETURNING *`,
      [cleanEmail, fullName || null, passwordHash, !!isSuperAdmin, clean.length ? clean : null]
    );
    newUser = result.rows[0];

    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, target_user_id, action, notes, ip_address)
       VALUES ($1, $2, 'create_admin', $3, $4)`,
      [superAdminUserId, newUser.id, notes || null, ip || null]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') throw new Error('Email already exists');
    throw err;
  } finally {
    client.release();
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.query(
    `UPDATE users SET password_reset_token = $1, password_reset_expires_at = $2 WHERE id = $3`,
    [tokenHash, expiresAt, newUser.id]
  );

  delete newUser.password_hash;
  delete newUser.password_reset_token;

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  emailService.queue({
    template: 'invite-admin',
    to: newUser.email,
    data: { fullName: newUser.full_name, resetUrl: `${frontBase}/reset-password?token=${rawToken}` },
    userId: newUser.id,
  });

  return { user: newUser, resetToken: rawToken, expiresAt };
};
