const db = require('../../db/db');
const { finalizePaidDonation } = require('../donations/donations.service');

// Registration Management (MVP) — the "day after registration opens" screen:
// see who registered, search them, export them. Deliberately just this —
// no QR/check-in/bib numbers until there's a real need for them (see
// docs/DECISIONS.md, 2026-07-15).
//
// payment_status is never stored on the participant — it's always derived by
// joining to the donation's own status (see docs/REGISTRATION_OFFERING_SPEC.md §1.3).
exports.getEntityRegistrations = async (entityId, { campaignId, search, page = 0, limit = 25 }) => {
  const where = ['c.entity_id = $1'];
  const params = [entityId];
  let idx = 2;

  if (campaignId) {
    where.push(`c.id = $${idx++}`);
    params.push(campaignId);
  }

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

/* ─────────────────────────────────────────
   MANUAL PARTICIPANT ADD + BULK IMPORT (authenticated, entity manager)
   — a participant is never a standalone row: real checkout creates a
   donation (money) + a registration_order + one registration_participant
   per person (see donations.service.js#processRegistrationDonation). A
   manually-logged participant (registered offline, added from a paper
   list) goes through the exact same three-table shape, marked paid
   immediately with a manual source instead of a Cardcom reference — so it
   behaves identically everywhere else (campaign totals, receipts, the
   entity-wide Donations/Donors views) to a participant who paid online.
───────────────────────────────────────── */
const MANUAL_SOURCES = ['bank_transfer', 'check', 'cash', 'other'];

async function loadActiveOption(campaignId, registrationOptionId) {
  const { rows } = await db.query(
    `SELECT id, key, title, price FROM registration_options
     WHERE id = $1 AND campaign_id = $2 AND is_active = true`,
    [registrationOptionId, campaignId]
  );
  return rows[0] || null;
}

// Shared by both single-add and each row of a bulk import — creates the
// donation + registration_order + registration_participant as one
// transaction, then applies the same campaign-totals/receipt side effects
// the real payment flow has (see donations.service.js#handleReturn).
async function insertPaidRegistration(entityId, campaignId, option, { participantName, shirtSize, payerName, payerEmail, payerPhone, source, note }, enteredByUserId) {
  const client = await db.connect();
  let donationId;
  try {
    await client.query('BEGIN');

    const donationRes = await client.query(
      `INSERT INTO donations (
         campaign_id, entity_id, amount, donor_name, donor_email, donor_phone, is_anonymous,
         rewards, status, is_mock, source, supporters_count, entered_by, note, completed_at
       ) VALUES ($1,$2,$3,$4,$5,$6,false,'[]','paid',false,$7,1,$8,$9,NOW())
       RETURNING id`,
      [campaignId, entityId, option.price, payerName || participantName, payerEmail || null, payerPhone || null, source, enteredByUserId, note || null]
    );
    donationId = donationRes.rows[0].id;

    const orderRes = await client.query(
      `INSERT INTO registration_orders (donation_id, campaign_id) VALUES ($1, $2) RETURNING id`,
      [donationId, campaignId]
    );
    await client.query(
      `INSERT INTO registration_participants
         (registration_order_id, registration_option_id, option_key, option_title, name, shirt_size)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [orderRes.rows[0].id, option.id, option.key, option.title, participantName, shirtSize || null]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await db.query(
    `UPDATE campaigns
     SET current_amount   = current_amount   + $1,
         supporters_count = supporters_count + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [option.price, campaignId]
  );
  require('../dashboard/dashboard.service').invalidateDashboard(entityId);
  await finalizePaidDonation(donationId);

  return donationId;
}

exports.createManualRegistration = async (entityId, { campaignId, registrationOptionId, participantName, shirtSize, payerName, payerEmail, payerPhone, source, note }, enteredByUserId) => {
  if (!campaignId) throw new Error('חסר מזהה קמפיין');
  if (!participantName?.trim()) throw new Error('שם משתתף חסר');
  if (!MANUAL_SOURCES.includes(source)) throw new Error('מקור תרומה לא תקין');

  const campRes = await db.query(`SELECT id FROM campaigns WHERE id = $1 AND entity_id = $2`, [campaignId, entityId]);
  if (campRes.rows.length === 0) throw new Error('הקמפיין לא נמצא עבור ישות זו');

  const option = await loadActiveOption(campaignId, registrationOptionId);
  if (!option) throw new Error('קטגוריית הרשמה לא תקינה עבור קמפיין זה');

  const donationId = await insertPaidRegistration(
    entityId, campaignId, option,
    { participantName: participantName.trim(), shirtSize, payerName, payerEmail, payerPhone, source, note },
    enteredByUserId
  );
  return { donationId };
};

// rows: [{ participantName, categoryTitle, shirtSize }] — categoryTitle is
// matched against the campaign's CURRENT registration_options by title
// (case-insensitive) since a spreadsheet can't reasonably carry option
// UUIDs; payer defaults to the participant themself (bulk imports are
// typically "people who signed up on paper", no separate payer per row).
exports.importBulk = async (entityId, campaignId, rows, source, enteredByUserId) => {
  const campRes = await db.query(`SELECT id FROM campaigns WHERE id = $1 AND entity_id = $2`, [campaignId, entityId]);
  if (campRes.rows.length === 0) throw new Error('הקמפיין לא נמצא עבור ישות זו');
  if (!MANUAL_SOURCES.includes(source)) throw new Error('מקור תרומה לא תקין');

  const { rows: options } = await db.query(
    `SELECT id, key, title, price FROM registration_options WHERE campaign_id = $1 AND is_active = true`,
    [campaignId]
  );
  const byTitle = new Map(options.map(o => [o.title.trim().toLowerCase(), o]));

  let created = 0;
  const errors = [];

  for (const row of rows) {
    try {
      const name = row.participantName?.trim();
      if (!name) { errors.push('שם חסר'); continue; }
      const option = byTitle.get((row.categoryTitle || '').trim().toLowerCase());
      if (!option) { errors.push(`${name}: קטגוריה "${row.categoryTitle}" לא נמצאה`); continue; }

      await insertPaidRegistration(
        entityId, campaignId, option,
        { participantName: name, shirtSize: row.shirtSize, source },
        enteredByUserId
      );
      created++;
    } catch (e) {
      errors.push(`${row.participantName}: ${e.message}`);
    }
  }

  return { created, errors };
};
