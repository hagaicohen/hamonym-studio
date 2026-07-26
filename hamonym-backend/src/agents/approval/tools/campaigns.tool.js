const db = require('../../../db/db');

exports.loadCampaigns = async (entityId) => {
  const { rows } = await db.query(
    `SELECT title, status, target_amount, current_amount, supporters_count, created_at
     FROM campaigns
     WHERE entity_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC`,
    [entityId]
  );

  return rows.map((r) => ({
    title: r.title,
    status: r.status,
    targetAmount: Number(r.target_amount),
    currentAmount: Number(r.current_amount),
    supportersCount: r.supporters_count,
    createdAt: r.created_at,
  }));
};
