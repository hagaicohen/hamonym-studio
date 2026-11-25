const crypto = require('crypto');
const db = require('../../db/db');
const { isEntityMember } = require('../../middleware/entity-permission.middleware');

// Campaign comments (migration 090). Comments belong to the campaign, not to a
// page block or a language; each keeps the language it was written in. Public
// readers see published comments only, with the display name and text — never
// the email (no longer collected) or the submitter hash.

const LIMITS = {
  nameMin: 2, nameMax: 60,
  contentMin: 2, contentMax: 1000,
  pageDefault: 6, pageMax: 50,
  perCampaignWindow: { count: 3, interval: '10 minutes' },
  perSubmitterDay: { count: 10, interval: '24 hours' },
};
exports.LIMITS = LIMITS;

const STATUSES = ['pending', 'published', 'hidden'];
const MODES = ['approval', 'auto'];

function fail(status, code, message) {
  return Object.assign(new Error(message || code), { status, code });
}

// Comments are stored and shown as plain text exactly as written: "<", ">" and
// "&" stay (pages render text, never markup). Only invisible characters that
// can disguise or reorder text are removed: C0/C1 controls (except line
// breaks), zero-width space, BOM, and the bidi overrides/isolates. Joiners
// (U+200C/U+200D, used in emoji and some scripts) and LRM/RLM are kept.
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B\u202A-\u202E\u2066-\u2069\uFEFF]/g;
// A name or comment needs at least one letter, digit or symbol (emoji count).
const MEANINGFUL = /[\p{L}\p{N}\p{S}]/u;

function cleanText(value, { multiline }) {
  if (typeof value !== 'string') return '';
  let s = value.normalize('NFC').replace(/\r\n?/g, '\n').replace(INVISIBLE, '');
  if (multiline) {
    s = s.split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  s = s.trim();
  return MEANINGFUL.test(s) ? s : '';
}
exports.cleanText = cleanText;

function submitterHash(ip) {
  if (!ip) return null;
  const secret = process.env.COMMENTS_HASH_SECRET || process.env.JWT_SECRET || 'hamonym-comments';
  return crypto.createHmac('sha256', secret).update(String(ip)).digest('hex');
}

function encodeCursor(row) {
  return Buffer.from(`${new Date(row.created_at).toISOString()}|${row.id}`).toString('base64url');
}
function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const [at, id] = Buffer.from(String(cursor), 'base64url').toString('utf8').split('|');
    if (!at || !/^[0-9a-f-]{36}$/i.test(id || '') || Number.isNaN(Date.parse(at))) return null;
    return { at, id };
  } catch { return null; }
}
function pageSize(limit) {
  const n = Number.parseInt(limit, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, LIMITS.pageMax) : LIMITS.pageDefault;
}

const publicShape = (r) => ({
  id: r.id,
  authorName: r.author_name,
  content: r.content,
  language: r.language || null,
  createdAt: r.created_at,
});

// Keyset page of one campaign's comments, newest first.
async function page(campaignId, { statuses, limit, cursor, search }) {
  const size = pageSize(limit);
  const params = [campaignId, statuses];
  const where = ['cm.campaign_id = $1', 'cm.status = ANY($2::text[])'];
  const term = typeof search === 'string' ? search.trim().slice(0, 100) : '';
  if (term) {
    params.push(`%${term.replace(/[\\%_]/g, (c) => '\\' + c)}%`);
    where.push(`(cm.content ILIKE $${params.length} OR cm.author_name ILIKE $${params.length})`);
  }
  const countParams = [...params];
  const c = decodeCursor(cursor);
  if (c) {
    params.push(c.at, c.id);
    where.push(`(cm.created_at, cm.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
  }
  params.push(size + 1);
  const { rows } = await db.query(
    `SELECT cm.id, cm.author_name, cm.content, cm.language, cm.status, cm.created_at, cm.updated_at
       FROM campaign_comments cm
      WHERE ${where.join(' AND ')}
      ORDER BY cm.created_at DESC, cm.id DESC
      LIMIT $${params.length}`,
    params
  );
  const total = (await db.query(
    `SELECT count(*)::int AS n FROM campaign_comments cm WHERE ${where.slice(0, term ? 3 : 2).join(' AND ')}`,
    countParams
  )).rows[0].n;
  const more = rows.length > size;
  const items = more ? rows.slice(0, size) : rows;
  return { items, nextCursor: more ? encodeCursor(items[items.length - 1]) : null, total };
}

// A campaign visitors can see: published, active organization, not hidden or deleted.
async function publicCampaign(slug) {
  const { rows } = await db.query(
    `SELECT c.id, c.comments_moderation
       FROM campaigns c
       JOIN entities e ON e.id = c.entity_id
      WHERE c.slug = $1 AND c.status = 'published' AND e.status = 'active' AND c.deleted_at IS NULL
        AND c.is_hidden = false AND e.is_hidden = false
      LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

exports.getComments = async (slug, { limit, cursor, search } = {}) => {
  const campaign = await publicCampaign(slug);
  if (!campaign) return { comments: [], nextCursor: null, total: 0 };
  const result = await page(campaign.id, { statuses: ['published'], limit, cursor, search });
  return { comments: result.items.map(publicShape), nextCursor: result.nextCursor, total: result.total };
};

exports.createComment = async (slug, body, ip) => {
  const authorName = cleanText(body?.authorName, { multiline: false });
  const content = cleanText(body?.content, { multiline: true });
  if (authorName.length < LIMITS.nameMin || authorName.length > LIMITS.nameMax) throw fail(400, 'INVALID_NAME');
  if (content.length < LIMITS.contentMin || content.length > LIMITS.contentMax) throw fail(400, 'INVALID_CONTENT');
  const language = ['he', 'en'].includes(body?.language) ? body.language : null;

  const campaign = await publicCampaign(slug);
  if (!campaign) throw fail(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  const status = campaign.comments_moderation === 'auto' ? 'published' : 'pending';

  // Honeypot: bots fill the hidden field. Answer like a held comment, store nothing.
  if (typeof body?.website === 'string' && body.website.trim()) {
    return { comment: null, status: 'pending' };
  }

  const hash = submitterHash(ip);
  if (hash) {
    const { rows } = await db.query(
      `SELECT
         count(*) FILTER (WHERE campaign_id = $2 AND created_at > now() - $3::interval)::int AS recent,
         count(*) FILTER (WHERE created_at > now() - $4::interval)::int AS day,
         count(*) FILTER (WHERE campaign_id = $2 AND content = $5 AND created_at > now() - $4::interval)::int AS same
       FROM campaign_comments WHERE submitter_hash = $1 AND created_at > now() - $4::interval`,
      [hash, campaign.id, LIMITS.perCampaignWindow.interval, LIMITS.perSubmitterDay.interval, content]
    );
    if (rows[0].same > 0) throw fail(409, 'DUPLICATE_COMMENT');
    if (rows[0].recent >= LIMITS.perCampaignWindow.count || rows[0].day >= LIMITS.perSubmitterDay.count) throw fail(429, 'RATE_LIMITED');
  }

  const { rows } = await db.query(
    `INSERT INTO campaign_comments (campaign_id, author_name, content, language, status, submitter_hash)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, author_name, content, language, status, created_at`,
    [campaign.id, authorName, content, language, status, hash]
  );
  return { comment: status === 'published' ? publicShape(rows[0]) : null, status };
};

// ── Management (campaign's organization members, or Super Admin) ──

async function managedCampaign(user, campaignId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(campaignId || ''))) throw fail(400, 'INVALID_CAMPAIGN');
  const { rows } = await db.query(
    `SELECT id, entity_id, comments_moderation FROM campaigns WHERE id = $1 AND deleted_at IS NULL`,
    [campaignId]
  );
  if (!rows[0]) throw fail(404, 'CAMPAIGN_NOT_FOUND', 'Campaign not found');
  if (!user?.isSuperAdmin && !(await isEntityMember(user?.id, rows[0].entity_id))) throw fail(403, 'FORBIDDEN', 'Unauthorized');
  return rows[0];
}

function checkCommentId(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id || ''))) throw fail(404, 'COMMENT_NOT_FOUND');
}

const managerShape = (r) => ({ ...publicShape(r), status: r.status, updatedAt: r.updated_at });

exports.listForManager = async (user, campaignId, { status, limit, cursor } = {}) => {
  const campaign = await managedCampaign(user, campaignId);
  const statuses = STATUSES.includes(status) ? [status] : STATUSES;
  const result = await page(campaign.id, { statuses, limit, cursor });
  const { rows } = await db.query(
    `SELECT status, count(*)::int AS n FROM campaign_comments WHERE campaign_id = $1 GROUP BY status`,
    [campaign.id]
  );
  const counts = { pending: 0, published: 0, hidden: 0 };
  for (const r of rows) counts[r.status] = r.n;
  return {
    comments: result.items.map(managerShape),
    nextCursor: result.nextCursor,
    total: result.total,
    counts,
    moderation: campaign.comments_moderation,
  };
};

exports.setStatus = async (user, campaignId, commentId, status) => {
  if (!['published', 'hidden'].includes(status)) throw fail(400, 'INVALID_STATUS');
  checkCommentId(commentId);
  const campaign = await managedCampaign(user, campaignId);
  const { rows } = await db.query(
    `UPDATE campaign_comments SET status = $3, updated_at = now()
      WHERE id = $2 AND campaign_id = $1
      RETURNING id, author_name, content, language, status, created_at, updated_at`,
    [campaign.id, commentId, status]
  );
  if (!rows[0]) throw fail(404, 'COMMENT_NOT_FOUND');
  return managerShape(rows[0]);
};

exports.deleteComment = async (user, campaignId, commentId) => {
  checkCommentId(commentId);
  const campaign = await managedCampaign(user, campaignId);
  const { rowCount } = await db.query(`DELETE FROM campaign_comments WHERE id = $2 AND campaign_id = $1`, [campaign.id, commentId]);
  if (!rowCount) throw fail(404, 'COMMENT_NOT_FOUND');
};

exports.setModeration = async (user, campaignId, mode) => {
  if (!MODES.includes(mode)) throw fail(400, 'INVALID_MODE');
  const campaign = await managedCampaign(user, campaignId);
  await db.query(`UPDATE campaigns SET comments_moderation = $2 WHERE id = $1`, [campaign.id, mode]);
  return { moderation: mode };
};
