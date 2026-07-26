const db = require('../../db/db');
const { isEntityMember } = require('../../middleware/entity-permission.middleware');

// ─── Slug helpers ────────────────────────────────────────────────────────────

const HE_MAP = {
  'א':'a','ב':'b','ג':'g','ד':'d','ה':'h','ו':'v','ז':'z','ח':'ch','ט':'t',
  'י':'y','כ':'k','ך':'k','ל':'l','מ':'m','ם':'m','נ':'n','ן':'n','ס':'s',
  'ע':'a','פ':'p','ף':'p','צ':'tz','ץ':'tz','ק':'k','ר':'r','ש':'sh','ת':'t',
};

function nameToSlug(name) {
  return name.trim()
    .split('')
    .map(c => HE_MAP[c] ?? (c === ' ' ? '-' : c.toLowerCase()))
    .join('')
    .replace(/-+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 60);
}

async function uniqueSlug(campaignId, base) {
  let slug = base || 'ambassador';
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const { rows } = await db.query(
      'SELECT 1 FROM campaign_ambassadors WHERE campaign_id=$1 AND slug=$2',
      [campaignId, candidate]
    );
    if (rows.length === 0) return candidate;
    attempt++;
  }
}

// ─── Row mapper ──────────────────────────────────────────────────────────────

function mapRow(r) {
  return {
    id:               r.id,
    campaign_id:      r.campaign_id,
    full_name:        r.full_name,
    phone:            r.phone        ?? null,
    email:            r.email        ?? null,
    goal_amount:      r.goal_amount  != null ? Number(r.goal_amount) : null,
    status:           r.status,
    personal_message: r.personal_message ?? '',
    personal_title:   r.personal_title   ?? '',
    slug:             r.slug,
    raised_online:    Number(r.raised_online  ?? 0),
    raised_manual:    Number(r.raised_manual  ?? 0),
    raised_total:     Number(r.raised_total   ?? 0),
    donor_count:      Number(r.donor_count    ?? 0),
    created_at:       r.created_at,
    deactivated_at:   r.deactivated_at ?? null,
    deactivated_by:   r.deactivated_by ?? null,
  };
}

// ─── Ownership check ─────────────────────────────────────────────────────────

async function verifyCampaignOwnership(userId, campaignId) {
  const { rows } = await db.query(
    `SELECT 1
     FROM campaigns c
     JOIN user_entities ue ON ue.entity_id = c.entity_id
     WHERE c.id = $1 AND ue.user_id = $2
     LIMIT 1`,
    [campaignId, userId]
  );
  if (rows.length === 0) throw new Error('Unauthorized');
}

async function verifyAmbassadorOwnership(userId, ambassadorId) {
  const { rows } = await db.query(
    `SELECT a.campaign_id
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN user_entities ue ON ue.entity_id = c.entity_id
     WHERE a.id = $1 AND ue.user_id = $2
     LIMIT 1`,
    [ambassadorId, userId]
  );
  if (rows.length === 0) throw new Error('Unauthorized');
}

// Exported (not just used internally) because the entity-manager-facing route
// (listForEntity) needs this check, while the platform-admin route that also
// calls getEntityAmbassadors() is already authorized via requireSuperAdmin
// upstream and must NOT be subject to user_entities membership.
async function verifyEntityOwnership(userId, entityId) {
  if (!(await isEntityMember(userId, entityId))) throw new Error('Unauthorized');
}
exports.verifyEntityOwnership = verifyEntityOwnership;

// ─── Stats sub-query ─────────────────────────────────────────────────────────

const STATS_SQL = `
  COALESCE((
    SELECT SUM(d.amount) FROM donations d
    WHERE d.ambassador_id = a.id AND d.status = 'paid'
  ), 0) AS raised_online,
  COALESCE((
    SELECT SUM(adj.amount) FROM ambassador_adjustments adj
    WHERE adj.ambassador_id = a.id
  ), 0) AS raised_manual,
  COALESCE((
    SELECT SUM(d.amount) FROM donations d
    WHERE d.ambassador_id = a.id AND d.status = 'paid'
  ), 0) + COALESCE((
    SELECT SUM(adj.amount) FROM ambassador_adjustments adj
    WHERE adj.ambassador_id = a.id
  ), 0) AS raised_total,
  COALESCE((
    SELECT COUNT(*) FROM donations d
    WHERE d.ambassador_id = a.id AND d.status = 'paid'
  ), 0) AS donor_count
`;

// ─── Service functions ───────────────────────────────────────────────────────

exports.list = async (userId, campaignId) => {
  await verifyCampaignOwnership(userId, campaignId);
  const { rows } = await db.query(
    `SELECT a.*, ${STATS_SQL}
     FROM campaign_ambassadors a
     WHERE a.campaign_id = $1
     ORDER BY a.created_at DESC`,
    [campaignId]
  );
  return rows.map(mapRow);
};

exports.create = async (userId, campaignId, data) => {
  await verifyCampaignOwnership(userId, campaignId);
  const { full_name, phone, email, goal_amount, personal_message } = data;
  if (!full_name?.trim()) throw new Error('Name required');

  const slug = await uniqueSlug(campaignId, nameToSlug(full_name));

  const { rows } = await db.query(
    `INSERT INTO campaign_ambassadors
       (campaign_id, full_name, phone, email, goal_amount, personal_message, slug)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING *`,
    [campaignId, full_name.trim(), phone||null, email||null, goal_amount||null, personal_message||'', slug]
  );
  return mapRow({ ...rows[0], raised_online:0, raised_manual:0, raised_total:0, donor_count:0 });
};

exports.update = async (userId, id, data) => {
  await verifyAmbassadorOwnership(userId, id);

  // Auto-record deactivation audit fields when status switches to inactive
  if (data.status === 'inactive') {
    data = { ...data, deactivated_at: new Date().toISOString(), deactivated_by: userId };
  }
  // Clear audit fields when re-activating
  if (data.status === 'active') {
    data = { ...data, deactivated_at: null, deactivated_by: null };
  }

  const fields = [];
  const vals   = [];
  let   i      = 1;
  const allowed = ['full_name','phone','email','goal_amount','personal_message','personal_title','status','deactivated_at','deactivated_by'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      vals.push(data[key] === '' ? null : data[key]);
    }
  }
  if (fields.length === 0) throw new Error('No fields supplied');
  vals.push(id);
  const { rows } = await db.query(
    `UPDATE campaign_ambassadors SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (rows.length === 0) throw new Error('Ambassador not found');

  const { rows: withStats } = await db.query(
    `SELECT a.*, ${STATS_SQL} FROM campaign_ambassadors a WHERE a.id = $1`,
    [id]
  );
  return mapRow(withStats[0]);
};

exports.remove = async (userId, id) => {
  await verifyAmbassadorOwnership(userId, id);

  const { rows: donationCheck } = await db.query(
    'SELECT 1 FROM donations WHERE ambassador_id = $1 LIMIT 1',
    [id]
  );
  if (donationCheck.length > 0) {
    throw new Error('Has donations');
  }

  const { rowCount } = await db.query(
    'DELETE FROM campaign_ambassadors WHERE id = $1',
    [id]
  );
  if (rowCount === 0) throw new Error('Ambassador not found');
};

exports.importBulk = async (userId, campaignId, rows) => {
  await verifyCampaignOwnership(userId, campaignId);
  let created = 0;
  const errors = [];

  for (const row of rows) {
    try {
      if (!row.full_name?.trim()) { errors.push(`שם חסר`); continue; }
      const slug = await uniqueSlug(campaignId, nameToSlug(row.full_name));
      await db.query(
        `INSERT INTO campaign_ambassadors (campaign_id, full_name, phone, email, goal_amount, slug)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [campaignId, row.full_name.trim(), row.phone||null, row.email||null, row.goal_amount||null, slug]
      );
      created++;
    } catch (e) {
      errors.push(`${row.full_name}: ${e.message}`);
    }
  }
  return { created, errors };
};

exports.addAdjustment = async (userId, ambassadorId, amount, reason) => {
  await verifyAmbassadorOwnership(userId, ambassadorId);
  if (!amount || amount <= 0) throw new Error('Amount must be positive');
  await db.query(
    `INSERT INTO ambassador_adjustments (ambassador_id, amount, reason, created_by)
     VALUES ($1,$2,$3,$4)`,
    [ambassadorId, amount, reason||'', userId]
  );
};

exports.listPublic = async (campaignSlug) => {
  const { rows } = await db.query(
    `SELECT a.id, a.full_name, a.slug, a.goal_amount, a.personal_message,
            ${STATS_SQL}
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN entities  e ON e.id = c.entity_id
     WHERE c.slug = $1 AND a.status = 'active'
       AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
     ORDER BY raised_total DESC`,
    [campaignSlug]
  );
  return rows.map(mapRow);
};

exports.selfRegister = async (campaignSlug, { full_name, phone, email, goal_amount }) => {
  if (!full_name?.trim()) throw new Error('Name required');

  const { rows: camps } = await db.query(
    `SELECT c.id FROM campaigns c
     JOIN entities e ON e.id = c.entity_id
     WHERE c.slug = $1 AND c.status = 'published' AND c.deleted_at IS NULL
       AND c.is_hidden = false AND e.is_hidden = false
     LIMIT 1`,
    [campaignSlug]
  );
  if (!camps.length) throw new Error('Campaign not found');
  const campaignId = camps[0].id;

  const slug = await uniqueSlug(campaignId, nameToSlug(full_name));

  const { rows } = await db.query(
    `INSERT INTO campaign_ambassadors
       (campaign_id, full_name, phone, email, goal_amount, personal_message, slug)
     VALUES ($1,$2,$3,$4,$5,'', $6)
     RETURNING id, slug`,
    [campaignId, full_name.trim(), phone||null, email||null, goal_amount||null, slug]
  );
  const appUrl = process.env.APP_URL || 'https://app.hamonym.com';
  return {
    slug: rows[0].slug,
    shareUrl: `${appUrl}/campaigns/${campaignSlug}/${rows[0].slug}`,
  };
};

// ─── Entity-wide list (Ambassadors admin page) ────────────────────────────────

const ENTITY_SORT_COLUMNS = {
  name:     'a.full_name',
  campaign: 'c.title',
  goal:     'a.goal_amount',
  raised:   'raised_total',
  donors:   'donor_count',
  status:   'a.status',
};

exports.getEntityAmbassadors = async (entityId, { search, status, campaignId, sortBy, sortDir, page = 0, limit = 25 }) => {
  const where  = ['c.entity_id = $1'];
  const params = [entityId];
  let idx = 2;

  if (status && status !== 'all') {
    where.push(`a.status = $${idx++}`);
    params.push(status);
  }
  if (campaignId) {
    where.push(`a.campaign_id = $${idx++}`);
    params.push(campaignId);
  }
  if (search) {
    where.push(`(a.full_name ILIKE $${idx} OR a.email ILIKE $${idx} OR a.phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereStr = where.join(' AND ');
  const sortCol   = ENTITY_SORT_COLUMNS[sortBy] || 'raised_total';
  const sortOrd   = sortDir === 'asc' ? 'ASC' : 'DESC';

  const [listRes, kpiRes, campaignsRes] = await Promise.all([
    db.query(
      `SELECT a.*, c.title AS campaign_title, c.slug AS campaign_slug, ${STATS_SQL}
       FROM campaign_ambassadors a
       JOIN campaigns c ON c.id = a.campaign_id
       WHERE ${whereStr}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT
         COUNT(*)::int                                     AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int    AS active_count,
         COALESCE(SUM(raised_total), 0)::float              AS total_raised,
         COALESCE(SUM(donor_count), 0)::int                 AS total_donors
       FROM (
         SELECT a.status, ${STATS_SQL}
         FROM campaign_ambassadors a
         JOIN campaigns c ON c.id = a.campaign_id
         WHERE ${whereStr}
       ) sub`,
      params
    ),
    db.query(
      `SELECT id::text, title FROM campaigns WHERE entity_id = $1 AND status != 'draft' ORDER BY title ASC`,
      [entityId]
    ),
  ]);

  const kpi = kpiRes.rows[0];

  return {
    ambassadors: listRes.rows.map(r => ({
      ...mapRow(r),
      campaign_title: r.campaign_title,
      campaign_slug:  r.campaign_slug,
    })),
    kpi: {
      totalAmbassadors:  kpi.total,
      activeAmbassadors: kpi.active_count,
      totalRaised:       kpi.total_raised,
      totalDonors:       kpi.total_donors,
    },
    campaigns: campaignsRes.rows,
    total: kpi.total,
    page,
    limit,
  };
};

// Just the ambassador list, none of getEntityAmbassadors' KPI/campaign-dropdown
// sub-queries — for callers (like the platform org detail page) that only
// render the table itself.
exports.getEntityAmbassadorsList = async (entityId, { limit = 25, page = 0 } = {}) => {
  const { rows } = await db.query(
    `SELECT a.*, c.title AS campaign_title, c.slug AS campaign_slug, ${STATS_SQL}
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     WHERE c.entity_id = $1
     ORDER BY raised_total DESC
     LIMIT $2 OFFSET $3`,
    [entityId, limit, page * limit]
  );

  return rows.map(r => ({
    ...mapRow(r),
    campaign_title: r.campaign_title,
    campaign_slug:  r.campaign_slug,
  }));
};

exports.getBySlug = async (campaignSlug, ambassadorSlug) => {
  const { rows } = await db.query(
    `SELECT a.*, ${STATS_SQL}
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN entities  e ON e.id = c.entity_id
     WHERE c.slug = $1 AND a.slug = $2
       AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
     LIMIT 1`,
    [campaignSlug, ambassadorSlug]
  );
  if (rows.length === 0) return null;
  return mapRow(rows[0]);
};
