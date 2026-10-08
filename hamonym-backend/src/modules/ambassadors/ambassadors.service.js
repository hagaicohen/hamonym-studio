const db = require('../../db/db');
const { isEntityMember } = require('../../middleware/entity-permission.middleware');

// ─── Slug helpers ────────────────────────────────────────────────────────────

// THE one canonical normalizer for an ambassador personal-link slug. Every
// write path (admin CRUD, public self-register, Ambassador Studio self-edit,
// Campaign Builder draft sync) must go through this — see
// normalizeSlugOrThrow / validateAndReserveSlug below.
//
// Hebrew is preserved as-is rather than transliterated to ASCII through a
// HE_MAP (א->a, ש->sh ...), which used to force every auto-generated link to
// be Latin even for a Hebrew name, contradicting the product rule that the
// personal link may be Hebrew or English. The accepted charset mirrors the
// existing CAMPAIGN slug mechanism exactly (campaign-basic-step's
// allowSlugChars; campaigns.controller#checkSlugAvailable), so this is not a
// new convention.
function normalizeSlug(raw) {
  return (raw || '').trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9א-ת-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

const MIN_SLUG_LENGTH = 2;

// Canonical normalize + shape validation, with no DB access — the part of
// the rule that every write path shares even when the conflict scope
// differs (see syncAmbassadors in campaigns.service.js).
function normalizeSlugOrThrow(raw) {
  const normalized = normalizeSlug(raw);
  if (normalized.length < MIN_SLUG_LENGTH) throw new Error('Slug too short');
  return normalized;
}

function nameToSlug(name) {
  return normalizeSlug(name);
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

// Explicit slug chosen by a human (ambassador or admin). Unlike uniqueSlug()
// above — which may silently append -1/-2... because nobody chose that exact
// AUTO-generated default on purpose — this never substitutes: an already
// taken value is a real error the caller must surface, per the product rule
// that unavailability is communicated, never auto-resolved.
// Conflict scope is (campaign_id, slug), matching the DB's own
// campaign_ambassadors_unique_slug constraint — per campaign, never global.
// excludeAmbassadorId gives an ambassador self-exclusion when re-saving
// their own current slug.
async function validateAndReserveSlug(campaignId, requestedSlug, excludeAmbassadorId) {
  const normalized = normalizeSlugOrThrow(requestedSlug);
  const { rows } = await db.query(
    excludeAmbassadorId
      ? 'SELECT 1 FROM campaign_ambassadors WHERE campaign_id=$1 AND slug=$2 AND id != $3'
      : 'SELECT 1 FROM campaign_ambassadors WHERE campaign_id=$1 AND slug=$2',
    excludeAmbassadorId ? [campaignId, normalized, excludeAmbassadorId] : [campaignId, normalized]
  );
  if (rows.length > 0) throw new Error('Slug taken');
  return normalized;
}

exports.normalizeSlug = normalizeSlug;
exports.normalizeSlugOrThrow = normalizeSlugOrThrow;
exports.validateAndReserveSlug = validateAndReserveSlug;

// Public availability check — same precedence pattern as the existing
// campaign-slug check (campaigns.controller#checkSlugAvailable): debounced
// on the frontend, pure lookup here, no reservation or side effect.
exports.checkSlugAvailable = async (campaignSlug, candidateSlug, excludeAmbassadorId) => {
  const normalized = normalizeSlug(candidateSlug);
  const { rows: camps } = await db.query(
    `SELECT id FROM campaigns WHERE slug = $1 AND deleted_at IS NULL LIMIT 1`,
    [campaignSlug]
  );
  if (!camps.length) throw new Error('Campaign not found');
  if (normalized.length < MIN_SLUG_LENGTH) {
    return { slug: normalized, available: false, reason: 'too_short' };
  }
  const { rows } = await db.query(
    excludeAmbassadorId
      ? 'SELECT 1 FROM campaign_ambassadors WHERE campaign_id=$1 AND slug=$2 AND id != $3'
      : 'SELECT 1 FROM campaign_ambassadors WHERE campaign_id=$1 AND slug=$2',
    excludeAmbassadorId ? [camps[0].id, normalized, excludeAmbassadorId] : [camps[0].id, normalized]
  );
  return { slug: normalized, available: rows.length === 0 };
};

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
  const { full_name, phone, email, goal_amount, personal_message, slug: requestedSlug } = data;
  if (!full_name?.trim()) throw new Error('Name required');

  // An explicit personal link typed by the admin wins and is validated
  // without substitution; with none supplied, keep the existing
  // auto-generate-and-dedupe default behavior unchanged.
  const slug = requestedSlug
    ? await validateAndReserveSlug(campaignId, requestedSlug)
    : await uniqueSlug(campaignId, nameToSlug(full_name));

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

  // Validated/normalized BEFORE the generic field loop below (which assigns
  // values verbatim and has no per-field validation hook), so a change to an
  // already-taken slug fails loudly as 'Slug taken' instead of surfacing the
  // DB unique constraint as an opaque 500. The ambassador's own current slug
  // is excluded, so re-saving it unchanged is a no-op rather than a conflict.
  // An existing link is never altered as a side effect of editing other
  // fields — only when `slug` is explicitly supplied.
  if (data.slug !== undefined) {
    const { rows: campRows } = await db.query(
      'SELECT campaign_id FROM campaign_ambassadors WHERE id = $1', [id]
    );
    if (!campRows.length) throw new Error('Ambassador not found');
    data = { ...data, slug: await validateAndReserveSlug(campRows[0].campaign_id, data.slug, id) };
  }

  const fields = [];
  const vals   = [];
  let   i      = 1;
  const allowed = ['full_name','phone','email','goal_amount','personal_message','personal_title','status','slug','deactivated_at','deactivated_by'];
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
  // c.status = 'published' AND e.status = 'active' added 2026-09-24 — every
  // other public-facing campaign query (getCampaignBySlugPublic,
  // discoverCampaigns, selfRegister below) already filters on both; this one
  // didn't, so an ambassador's public leaderboard could be reached for a
  // campaign whose entity isn't approved yet (or that isn't published) even
  // though the campaign itself wasn't publicly visible any other way. Became
  // a real gap once "content-complete but pending entity approval" became an
  // intentional, longer-lived state (Private Preview) rather than a
  // transient one.
  const { rows } = await db.query(
    `SELECT a.id, a.full_name, a.slug, a.goal_amount, a.personal_message,
            ${STATS_SQL}
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN entities  e ON e.id = c.entity_id
     WHERE c.slug = $1 AND a.status = 'active'
       AND c.status = 'published' AND e.status = 'active'
       AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
     ORDER BY raised_total DESC`,
    [campaignSlug]
  );
  return rows.map(mapRow);
};

exports.selfRegister = async (campaignSlug, { full_name, phone, email, goal_amount, slug: requestedSlug }) => {
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

  // An explicit link the ambassador chose before submitting is always
  // re-validated here — the debounced client-side availability check is
  // never trusted on its own, since a second registrant could have taken
  // the slug in between. No explicit slug falls back to the original
  // auto-generate-and-dedupe behavior unchanged.
  const slug = requestedSlug
    ? await validateAndReserveSlug(campaignId, requestedSlug)
    : await uniqueSlug(campaignId, nameToSlug(full_name));

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
