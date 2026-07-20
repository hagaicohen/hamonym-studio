const db = require('../../db/db');

exports.getComments = async (slug, search) => {
  const params = [slug];
  let searchClause = '';
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    searchClause = `AND cm.content ILIKE $${params.length}`;
  }

  const result = await db.query(
    `SELECT cm.id, cm.author_name, cm.content, cm.created_at
     FROM campaign_comments cm
     JOIN campaigns c ON c.id = cm.campaign_id
     WHERE c.slug = $1 AND c.deleted_at IS NULL ${searchClause}
     ORDER BY cm.created_at ASC`,
    params
  );

  return result.rows.map(r => ({
    id: r.id,
    authorName: r.author_name,
    content: r.content,
    createdAt: r.created_at,
  }));
};

exports.createComment = async (slug, { authorName, authorEmail, content }) => {
  const campaignRes = await db.query(
    `SELECT id FROM campaigns WHERE slug = $1 AND deleted_at IS NULL`,
    [slug]
  );
  if (campaignRes.rows.length === 0) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  const campaignId = campaignRes.rows[0].id;

  const result = await db.query(
    `INSERT INTO campaign_comments (campaign_id, author_name, author_email, content)
     VALUES ($1, $2, $3, $4)
     RETURNING id, author_name, content, created_at`,
    [campaignId, authorName.trim(), authorEmail.trim(), content.trim()]
  );

  const r = result.rows[0];
  return {
    id: r.id,
    authorName: r.author_name,
    content: r.content,
    createdAt: r.created_at,
  };
};
