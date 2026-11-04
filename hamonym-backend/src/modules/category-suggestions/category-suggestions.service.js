// Category suggestions (migration 086). An organization member suggests a
// missing category; a Super Admin approves or rejects it. Neither action ever
// changes the official list (campaigns/entity-categories.js) or any entity's
// categories -- an approved suggestion is only a record that a person agreed
// it should be added in a later, separate change.
const pool = require('../../db/db');
const { ENTITY_CATEGORIES } = require('../campaigns/entity-categories');
const { isEntityMember } = require('../../middleware/entity-permission.middleware');

const MIN_LENGTH = 2;
const MAX_LENGTH = 60;
const MAX_NOTE_LENGTH = 500;
const RATE_LIMITS = [
  { interval: '1 hour', max: 5 },
  { interval: '1 day', max: 20 },
];
const STATUSES = ['pending', 'approved', 'rejected'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Letters (any script), combining marks, digits, spaces and plain punctuation.
const ALLOWED_RE = /^[\p{L}\p{M}\p{N} \-'"׳״,.&/()]+$/u;

function fail(code, extra = {}) {
  const err = new Error(code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

// Lower-case, niqqud/quote-free, single-spaced: duplicate detection only.
function normalizeLabel(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/["'׳״‘’“”]/g, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('he-IL');
}

const OFFICIAL = new Map(ENTITY_CATEGORIES.map((c) => [normalizeLabel(c.label), c]));

function cleanLabel(raw) {
  if (typeof raw !== 'string') throw fail('INVALID_LABEL');
  const label = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (label.length < MIN_LENGTH || label.length > MAX_LENGTH) throw fail('INVALID_LABEL');
  if (!ALLOWED_RE.test(label) || (label.match(/\p{L}/gu) || []).length < 2) throw fail('INVALID_LABEL');
  return { label, normalized: normalizeLabel(label) };
}

exports.create = async ({ label: rawLabel, entityId, userId }) => {
  if (!userId) throw fail('UNAUTHORIZED');
  const { label, normalized } = cleanLabel(rawLabel);

  const official = OFFICIAL.get(normalized);
  if (official) throw fail('CATEGORY_EXISTS', { category: official });

  let entity = null;
  if (entityId !== undefined && entityId !== null && entityId !== '') {
    if (typeof entityId !== 'string' || !UUID_RE.test(entityId)) throw fail('INVALID_ENTITY');
    if (!(await isEntityMember(userId, entityId))) throw fail('FORBIDDEN');
    entity = entityId;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializes one user's submissions so the rate check and insert agree.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('category_suggestions:' || $1::text))`, [String(userId)]);

    const existing = await client.query(
      `SELECT * FROM category_suggestions WHERE normalized_label = $1 AND status = 'pending' LIMIT 1`,
      [normalized]
    );
    if (existing.rows[0]) {
      await client.query('COMMIT');
      return { suggestion: existing.rows[0], duplicate: true };
    }

    for (const { interval, max } of RATE_LIMITS) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM category_suggestions
         WHERE suggested_by_user_id = $1 AND created_at > now() - $2::interval`,
        [userId, interval]
      );
      if (rows[0].n >= max) throw fail('RATE_LIMITED');
    }

    // ON CONFLICT covers a concurrent identical suggestion by another user.
    const inserted = await client.query(
      `INSERT INTO category_suggestions (label, normalized_label, suggested_by_user_id, entity_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (normalized_label) WHERE status = 'pending' DO NOTHING
       RETURNING *`,
      [label, normalized, userId, entity]
    );
    let suggestion = inserted.rows[0];
    let duplicate = false;
    if (!suggestion) {
      const again = await client.query(
        `SELECT * FROM category_suggestions WHERE normalized_label = $1 AND status = 'pending' LIMIT 1`,
        [normalized]
      );
      suggestion = again.rows[0];
      duplicate = true;
    }
    await client.query('COMMIT');
    return { suggestion, duplicate };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

exports.list = async ({ status } = {}) => {
  if (status !== undefined && !STATUSES.includes(status)) throw fail('INVALID_STATUS');
  const params = [];
  const where = status ? `WHERE s.status = $${params.push(status)}` : '';
  const { rows } = await pool.query(
    `SELECT s.id, s.label, s.status, s.entity_id, s.review_note, s.created_at, s.reviewed_at,
            e.display_name AS entity_name,
            u.full_name AS suggested_by_name, u.email AS suggested_by_email,
            r.full_name AS reviewed_by_name
     FROM category_suggestions s
     LEFT JOIN entities e ON e.id = s.entity_id
     LEFT JOIN users u ON u.id = s.suggested_by_user_id
     LEFT JOIN users r ON r.id = s.reviewed_by_user_id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT 500`,
    params
  );
  const counts = await pool.query(`SELECT status, count(*)::int AS n FROM category_suggestions GROUP BY status`);
  const summary = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const row of counts.rows) summary[row.status] = row.n;
  return { suggestions: rows, counts: summary };
};

exports.review = async ({ id, decision, note, adminUserId, ip }) => {
  if (!UUID_RE.test(String(id))) throw fail('NOT_FOUND');
  if (!['approved', 'rejected'].includes(decision)) throw fail('INVALID_STATUS');
  const reviewNote = typeof note === 'string' && note.trim() ? note.trim() : null;
  if (reviewNote && reviewNote.length > MAX_NOTE_LENGTH) throw fail('INVALID_NOTE');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `UPDATE category_suggestions
       SET status = $2, review_note = $3, reviewed_by_user_id = $4, reviewed_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, decision, reviewNote, adminUserId]
    );
    if (!rows[0]) {
      const found = await client.query(`SELECT status FROM category_suggestions WHERE id = $1`, [id]);
      throw fail(found.rows[0] ? 'ALREADY_REVIEWED' : 'NOT_FOUND');
    }
    await client.query(
      `INSERT INTO platform_audit_log (super_admin_user_id, entity_id, action, notes, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminUserId, rows[0].entity_id, `category_suggestion_${decision}`,
        reviewNote ? `${rows[0].label} — ${reviewNote}` : rows[0].label, ip || null]
    );
    await client.query('COMMIT');
    return rows[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};

exports.normalizeLabel = normalizeLabel;
exports.RATE_LIMITS = RATE_LIMITS;
