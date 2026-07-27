const db = require('../../db/db');

// Registration Management (MVP) — the "day after registration opens" screen:
// see who registered, search them, export them. Deliberately just this —
// no QR/check-in/bib numbers until there's a real need for them (see
// docs/DECISIONS.md, 2026-07-15).
//
// payment_status is never stored on the participant — it's always derived by
// joining to the donation's own status (see docs/REGISTRATION_OFFERING_SPEC.md §1.3).
exports.getEntityRegistrations = async (entityId, { search, page = 0, limit = 25 }) => {
  const where = ['c.entity_id = $1'];
  const params = [entityId];
  let idx = 2;

  if (search) {
    where.push(`(rp.name ILIKE $${idx} OR rp.option_title ILIKE $${idx} OR d.donor_name ILIKE $${idx} OR d.donor_email ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereStr = where.join(' AND ');

  const [listRes, countRes] = await Promise.all([
    db.query(
      `SELECT
         rp.id, rp.name, rp.option_key, rp.option_title, rp.shirt_size, rp.created_at,
         d.status AS payment_status,
         d.donor_name AS payer_name, d.donor_email AS payer_email, d.donor_phone AS payer_phone,
         c.id AS campaign_id, c.title AS campaign_title
       FROM registration_participants rp
       JOIN registration_orders ro ON ro.id = rp.registration_order_id
       JOIN donations d            ON d.id  = ro.donation_id
       JOIN campaigns c            ON c.id  = ro.campaign_id
       WHERE ${whereStr}
       ORDER BY rp.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total
       FROM registration_participants rp
       JOIN registration_orders ro ON ro.id = rp.registration_order_id
       JOIN donations d            ON d.id  = ro.donation_id
       JOIN campaigns c            ON c.id  = ro.campaign_id
       WHERE ${whereStr}`,
      params
    ),
  ]);

  return {
    participants: listRes.rows,
    total: countRes.rows[0].total,
  };
};
