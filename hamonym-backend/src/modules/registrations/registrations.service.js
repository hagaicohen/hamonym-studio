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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadActiveOption(campaignId, registrationOptionId) {
  const { rows } = await db.query(
    `SELECT id, key, title, price FROM registration_options
     WHERE id = $1 AND campaign_id = $2 AND is_active = true`,
    [registrationOptionId, campaignId]
  );
  return rows[0] || null;
}

// A retry of the same submission intent must resolve to the same paid
// registration it already created, never a second one — same principle as
// donations.service.js's manual-donation idempotency (F4.1). Compares
// campaign + registration option + amount, the financial payload the key is
// meant to identify; a mismatch is a genuine bug (key reused for a
// different registration), not something to silently paper over.
function assertIdempotentRegistrationMatch(existingRow, { campaignId, optionId, price }) {
  const matches = existingRow.campaign_id === campaignId
    && existingRow.registration_option_id === optionId
    && Number(existingRow.amount) === Number(price);
  if (!matches) {
    const err = new Error('Idempotency key already used for a different registration');
    err.status = 409;
    err.code = 'IDEMPOTENCY_KEY_MISMATCH';
    throw err;
  }
  return existingRow.donation_id;
}

// Shared by both single-add and each row of a bulk import — creates the
// donation + registration_order + registration_participant AND applies the
// campaign-totals side effect in ONE transaction (2026-08-31, Donation
// Engine closure WP4: this used to COMMIT the three-table insert and only
// THEN update campaigns.current_amount/supporters_count as a separate,
// non-atomic statement — a crash between the two left a real 'paid'
// donation, permanently unreflected in the campaign total, with no way to
// repair it since a paid donation can't be re-inserted). Also adds
// clientSubmissionKey idempotency (WP5) reusing the existing
// donations.client_submission_key / uq_donations_entity_client_submission_key
// (migration 056) — registrations are donations, so no new column/
// constraint is needed, just the same protection applied to this flow too.
async function insertPaidRegistration(entityId, campaignId, option, { participantName, shirtSize, payerName, payerEmail, payerPhone, source, note, clientSubmissionKey }, enteredByUserId) {
  const key = clientSubmissionKey || null;
  if (key && !UUID_RE.test(key)) throw new Error('מזהה בקשה לא תקין');

  // Fast path — a sequential retry of an already-committed intent. Not
  // sufficient alone (a concurrent duplicate could race past this SELECT
  // before either commits) — the UNIQUE constraint caught below is the real
  // guarantee; this just avoids opening a transaction for the common case.
  if (key) {
    const existing = await db.query(
      `SELECT id AS donation_id, campaign_id, amount,
              (SELECT ro.id FROM registration_orders ro WHERE ro.donation_id = donations.id) AS order_exists
       FROM donations WHERE entity_id = $1 AND client_submission_key = $2`,
      [entityId, key]
    );
    if (existing.rows[0]) {
      // registration_option_id lives on registration_participants, not
      // donations -- re-fetch it for the match check rather than assuming.
      const participantRes = await db.query(
        `SELECT rp.registration_option_id FROM registration_participants rp
         JOIN registration_orders ro ON ro.id = rp.registration_order_id
         WHERE ro.donation_id = $1`,
        [existing.rows[0].donation_id]
      );
      const registrationOptionId = participantRes.rows[0]?.registration_option_id ?? null;
      return assertIdempotentRegistrationMatch(
        { donation_id: existing.rows[0].donation_id, campaign_id: existing.rows[0].campaign_id, amount: existing.rows[0].amount, registration_option_id: registrationOptionId },
        { campaignId, optionId: option.id, price: option.price }
      );
    }
  }

  let donationId;
  try {
    donationId = await db.connect().then(async (client) => {
      try {
        await client.query('BEGIN');

        const donationRes = await client.query(
          `INSERT INTO donations (
             campaign_id, entity_id, amount, donor_name, donor_email, donor_phone, is_anonymous,
             rewards, status, is_mock, source, supporters_count, entered_by, note, completed_at,
             client_submission_key
           ) VALUES ($1,$2,$3,$4,$5,$6,false,'[]','paid',false,$7,1,$8,$9,NOW(),$10)
           RETURNING id`,
          [campaignId, entityId, option.price, payerName || participantName, payerEmail || null, payerPhone || null, source, enteredByUserId, note || null, key]
        );
        const id = donationRes.rows[0].id;

        const orderRes = await client.query(
          `INSERT INTO registration_orders (donation_id, campaign_id) VALUES ($1, $2) RETURNING id`,
          [id, campaignId]
        );
        await client.query(
          `INSERT INTO registration_participants
             (registration_order_id, registration_option_id, option_key, option_title, name, shirt_size)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [orderRes.rows[0].id, option.id, option.key, option.title, participantName, shirtSize || null]
        );

        await client.query(
          `UPDATE campaigns
           SET current_amount   = current_amount   + $1,
               supporters_count = supporters_count + 1,
               updated_at = NOW()
           WHERE id = $2`,
          [option.price, campaignId]
        );

        await client.query('COMMIT');
        return id;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    });
  } catch (err) {
    // Real concurrency case: two requests carrying the same key raced past
    // the fast-path SELECT above. Only this specific constraint is treated
    // as an idempotency race -- any other unique violation is a genuine error.
    if (key && err.code === '23505' && err.constraint === 'uq_donations_entity_client_submission_key') {
      const existing = await db.query(
        `SELECT id AS donation_id, campaign_id, amount FROM donations WHERE entity_id=$1 AND client_submission_key=$2`,
        [entityId, key]
      );
      if (existing.rows[0]) {
        const participantRes = await db.query(
          `SELECT rp.registration_option_id FROM registration_participants rp
           JOIN registration_orders ro ON ro.id = rp.registration_order_id
           WHERE ro.donation_id = $1`,
          [existing.rows[0].donation_id]
        );
        return assertIdempotentRegistrationMatch(
          { donation_id: existing.rows[0].donation_id, campaign_id: existing.rows[0].campaign_id, amount: existing.rows[0].amount, registration_option_id: participantRes.rows[0]?.registration_option_id ?? null },
          { campaignId, optionId: option.id, price: option.price }
        );
      }
    }
    throw err;
  }

  require('../dashboard/dashboard.service').invalidateDashboard(entityId);
  await finalizePaidDonation(donationId);

  return donationId;
}

// Exported for scripts/test-registration-idempotency-atomicity.js only --
// not part of the module's real public surface (createManualRegistration/
// importBulk are), but needed directly to test the transaction's
// mid-failure rollback behavior without going through the option-existence
// pre-checks both real callers already do.
exports._insertPaidRegistrationForTesting = insertPaidRegistration;

exports.createManualRegistration = async (entityId, { campaignId, registrationOptionId, participantName, shirtSize, payerName, payerEmail, payerPhone, source, note, clientSubmissionKey }, enteredByUserId) => {
  if (!campaignId) throw new Error('חסר מזהה קמפיין');
  if (!participantName?.trim()) throw new Error('שם משתתף חסר');
  if (!MANUAL_SOURCES.includes(source)) throw new Error('מקור תרומה לא תקין');

  const campRes = await db.query(`SELECT id FROM campaigns WHERE id = $1 AND entity_id = $2`, [campaignId, entityId]);
  if (campRes.rows.length === 0) throw new Error('הקמפיין לא נמצא עבור ישות זו');

  const option = await loadActiveOption(campaignId, registrationOptionId);
  if (!option) throw new Error('קטגוריית הרשמה לא תקינה עבור קמפיין זה');

  const donationId = await insertPaidRegistration(
    entityId, campaignId, option,
    { participantName: participantName.trim(), shirtSize, payerName, payerEmail, payerPhone, source, note, clientSubmissionKey },
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
        { participantName: name, shirtSize: row.shirtSize, source, clientSubmissionKey: row.clientSubmissionKey },
        enteredByUserId
      );
      created++;
    } catch (e) {
      errors.push(`${row.participantName}: ${e.message}`);
    }
  }

  return { created, errors };
};
