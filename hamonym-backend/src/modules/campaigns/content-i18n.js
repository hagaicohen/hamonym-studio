const db = require('../../db/db');

// Bilingual campaign content (migration 088, content_i18n). Hebrew stays in the
// regular campaign columns; this column holds the English overlay only. The
// frontend owns the meaning of the content paths (utils/content-i18n.ts); the
// server checks the shape, bounds the size and keeps an unpublished English
// version out of the public response.

const MAX_VALUES = 2000;
const MAX_PATH = 300;
const MAX_TEXT = 100000;
const MAX_TOTAL = 1024 * 1024;
const PATH_SHAPE = /^[A-Za-z][\w%#.\-]*$/;

function invalid() {
  return new Error('Invalid campaign translations');
}

// Returns the normalized value to store, or throws 'Invalid campaign translations'.
function validateContentI18n(raw) {
  if (raw === null) return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw invalid();
  if (raw.v !== 1) throw invalid();
  const out = { v: 1 };
  if (raw.en !== undefined) {
    const en = raw.en;
    if (!en || typeof en !== 'object' || Array.isArray(en)) throw invalid();
    if (typeof en.published !== 'boolean') throw invalid();
    const values = en.values ?? {};
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw invalid();
    const entries = Object.entries(values);
    if (entries.length > MAX_VALUES) throw invalid();
    let total = 0;
    const clean = {};
    for (const [path, text] of entries) {
      if (path.length > MAX_PATH || !PATH_SHAPE.test(path)) throw invalid();
      if (typeof text !== 'string' || text.length > MAX_TEXT) throw invalid();
      total += path.length + text.length;
      clean[path] = text;
    }
    if (total > MAX_TOTAL) throw invalid();
    // An English version cannot go public without its own title.
    if (en.published && !(clean.title || '').trim()) throw new Error('English title is required to publish the English version');
    out.en = { published: en.published, values: clean };
  }
  return out;
}

// What a visitor may see: the English version only once it is published.
function publicContentI18n(value) {
  if (!value || typeof value !== 'object' || !value.en || value.en.published !== true) return null;
  return { v: 1, en: { published: true, values: value.en.values || {} } };
}

// The columns are added by migration 088. Until it has been applied, a save that
// carries translations must still succeed for everything else, so the fields
// are dropped instead of failing the whole statement.
const columnsKnown = new Set();
async function hasColumn(table, column) {
  const id = `${table}.${column}`;
  if (columnsKnown.has(id)) return true;
  const { rows } = await db.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      LIMIT 1`,
    [table, column]
  );
  // Cache a positive answer only: a negative one is re-checked after the migration runs.
  if (rows.length) columnsKnown.add(id);
  return rows.length > 0;
}
const hasContentI18nColumn = () => hasColumn('campaigns', 'content_i18n');
const hasOptionUidColumn = () => hasColumn('registration_options', 'client_uid');

// A client uid is short and opaque (the editor's own ids); anything else is dropped.
function cleanOptionUid(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : null;
}

module.exports = { validateContentI18n, publicContentI18n, hasColumn, hasContentI18nColumn, hasOptionUidColumn, cleanOptionUid };
