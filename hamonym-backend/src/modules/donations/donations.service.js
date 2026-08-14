const axios = require('axios');
const db    = require('../../db/db');
const emailService = require('../email/email.service');

// Creates a receipt row for a paid donation (idempotent — a donation can only
// ever get one receipt, enforced by the UNIQUE(donation_id) constraint) and
// opportunistically links the donation to an existing user account by email,
// so it shows up in that donor's "my donations" list immediately, without
// waiting for them to log in again. Shared by both the mock and Cardcom
// completion paths so receipts/linking behave identically regardless of
// payment provider.
async function finalizePaidDonation(donationId) {
  await db.query(
    `UPDATE donations d
     SET donor_user_id = u.id
     FROM users u
     WHERE d.id = $1 AND d.donor_user_id IS NULL AND LOWER(u.email) = LOWER(d.donor_email)`,
    [donationId]
  );

  const insertRes = await db.query(
    `INSERT INTO receipts (donation_id, entity_id, campaign_id, amount, donor_name, donor_email)
     SELECT id, entity_id, campaign_id, amount, donor_name, donor_email
     FROM donations
     WHERE id = $1 AND status = 'paid'
     ON CONFLICT (donation_id) DO NOTHING
     RETURNING id, receipt_number, entity_id, campaign_id, amount, donor_name, donor_email`,
    [donationId]
  );

  // No row back means either the donation isn't (yet) paid, or a receipt
  // already existed for it (e.g. a duplicate Cardcom return redirect) — in
  // both cases the email was already sent (or never should be), so skip it.
  const receipt = insertRes.rows[0];
  if (!receipt || !receipt.donor_email) return;

  const detailsRes = await db.query(
    `SELECT c.title AS campaign_title, e.display_name AS entity_name
     FROM campaigns c JOIN entities e ON e.id = c.entity_id
     WHERE c.id = $1`,
    [receipt.campaign_id]
  );
  const details = detailsRes.rows[0] || {};
  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';

  emailService.queue({
    template: 'receipt',
    to: receipt.donor_email,
    data: {
      donorName: receipt.donor_name,
      receiptNumber: receipt.receipt_number,
      amount: receipt.amount,
      campaignTitle: details.campaign_title,
      entityName: details.entity_name,
      receiptUrl: `${frontBase}/receipts/${receipt.id}`,
    },
    entityId: receipt.entity_id,
    campaignId: receipt.campaign_id,
    donationId,
  });
}
exports.finalizePaidDonation = finalizePaidDonation;

// Looks up every registrationOptionId a participant references, scoped to
// this campaign and active — and rejects the whole request if any of them
// don't resolve. Called BEFORE the donation row is created, so a bad/foreign
// option id fails cleanly with no orphaned pending donation left behind.
// Unlike the old Offering.type === 'registration' flow (a JSONB array with
// zero backend awareness of its contents), Registration Options are a real
// table now, so this is finally possible. See docs/DECISIONS.md (2026-07-16).
async function loadRegistrationOptions(campaignId, participants) {
  if (!participants || participants.length === 0) return new Map();

  const ids = [...new Set(participants.map(p => p.registrationOptionId).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const { rows } = await db.query(
    `SELECT id, key, title FROM registration_options
     WHERE campaign_id = $1 AND is_active = true AND id = ANY($2::uuid[])`,
    [campaignId, ids]
  );
  const byId = new Map(rows.map(r => [r.id, { key: r.key, title: r.title }]));

  const missing = ids.filter(id => !byId.has(id));
  if (missing.length > 0) {
    throw new Error('One or more registration options are invalid for this campaign');
  }

  return byId;
}

// Business-flow step (not a utility) that turns a donation with one or more
// registered Participants into a Registration Order + one Participant row
// each (2.4 — Multi-Participant Registration, 2026-07-15; Registration
// Options data-model split, 2026-07-16). Runs regardless of payment
// provider/outcome: there is no separate status here on purpose, it's
// always derived by joining to the donation's own status. Deliberately NOT
// a Schema/Rules engine — each participant just picks one existing
// Registration Option, same shape as before. option_key/option_title are
// snapshotted from `registrationOptionsById` (DB-sourced, via
// loadRegistrationOptions above) rather than trusted client strings.
// See docs/REGISTRATION_OFFERING_SPEC.md §1.3 and docs/DECISIONS.md.
async function processRegistrationDonation(donationId, campaignId, participants, registrationOptionsById) {
  if (!participants || participants.length === 0) return;

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const orderRes = await client.query(
      `INSERT INTO registration_orders (donation_id, campaign_id) VALUES ($1, $2) RETURNING id`,
      [donationId, campaignId]
    );
    for (const p of participants) {
      const option = p.registrationOptionId ? registrationOptionsById.get(p.registrationOptionId) : null;
      await client.query(
        `INSERT INTO registration_participants
           (registration_order_id, registration_option_id, option_key, option_title, name, shirt_size)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [orderRes.rows[0].id, p.registrationOptionId || null, option?.key || null, option?.title || null, p.name, p.shirtSize || null]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

const CARDCOM_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   CREATE DONATION + CARDCOM LOW PROFILE
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
exports.createDonation = async ({ campaignId, donor, amount, rewards = [], participants, utmParams, ipAddress, userAgent, recurring }) => {

  // 1. Fetch campaign → entity
  const campaignRes = await db.query(
    `SELECT c.id, c.slug, c.title, c.entity_id, c.status, c.is_hidden AS campaign_hidden, c.deleted_at,
            e.status AS entity_status, e.is_hidden AS entity_hidden,
            e.cardcom_terminal_number, e.cardcom_api_username, e.cardcom_api_password_encrypted,
            e.cardcom_connection_status
     FROM campaigns c
     JOIN entities  e ON e.id = c.entity_id
     WHERE c.id = $1`,
    [campaignId]
  );

  const campaign = campaignRes.rows[0];
  if (!campaign) throw new Error('Campaign not found');

  if (campaign.entity_status !== 'active') {
    throw new Error('Entity not approved');
  }

  // Deliberately not checking campaign.status here (e.g. 'draft') — the
  // studio editor's live preview lets a manager test-donate against their
  // own unpublished campaign, which is a legitimate, separate use case from
  // public visibility. Only block what "hidden"/"deleted" are meant to stop.
  if (campaign.deleted_at || campaign.campaign_hidden || campaign.entity_hidden) {
    throw new Error('Campaign not found');
  }

  // Per-entity provider switch: an entity only goes live on Cardcom once it has
  // full credentials AND an admin has verified them via "בדוק חיבור" in Settings
  // (cardcom_connection_status = 'success') — otherwise it stays on Mock so a
  // half-filled-in payment section never silently breaks real donations.
  // PAYMENT_PROVIDER=mock is a global dev-environment override that forces Mock
  // for every entity regardless of their Cardcom setup.
  const hasVerifiedCardcom = !!(
    campaign.cardcom_terminal_number &&
    campaign.cardcom_api_username &&
    campaign.cardcom_api_password_encrypted &&
    campaign.cardcom_connection_status === 'success'
  );
  // Platform-level fallback: Hamonym's own Cardcom account (HAMONYM_CARDCOM_*
  // in .env), used when the entity hasn't verified its own — explicit,
  // deliberate choice (2026-08-04) so real donations can go live before every
  // entity has its own merchant account configured, rather than sitting on
  // Mock. Funds land in the platform's own account in that case, not the
  // entity's — settlement to the entity is a separate, manual step for now.
  const hasPlatformCardcom = !!(
    process.env.HAMONYM_CARDCOM_TERMINAL &&
    process.env.HAMONYM_CARDCOM_API_NAME &&
    process.env.HAMONYM_CARDCOM_API_PASSWORD
  );
  const isMock = process.env.PAYMENT_PROVIDER === 'mock' || (!hasVerifiedCardcom && !hasPlatformCardcom);

  // Validate participants' Registration Options before creating anything —
  // see loadRegistrationOptions above.
  const registrationOptionsById = await loadRegistrationOptions(campaignId, participants);

  // Recurring signup — creates the Hamonym-internal instruction row before
  // Cardcom knows anything about it (see docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md
  // §1/§2). The donation links to it from creation, not via a boolean flag.
  const recurringInstructionId = recurring
    ? await require('../donations/recurring.service').createSignup({
        entityId: campaign.entity_id,
        campaignId,
        donorName: donor.name,
        donorEmail: donor.email,
        donorPhone: donor.phone,
        amount,
      })
    : null;

  // 2. Save pending donation
  const donationRes = await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount,
       donor_name, donor_email, donor_phone, donor_id_number, donor_address,
       postal_code, is_anonymous,
       rewards, status, is_mock,
       utm_params, ip_address, user_agent, recurring_instruction_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13,$14,$15,$16)
     RETURNING id`,
    [
      campaignId,
      campaign.entity_id,
      amount,
      donor.name,
      donor.email,
      donor.phone,
      donor.idNumber    || null,
      donor.address     || null,
      donor.postalCode  || null,
      donor.isAnonymous || false,
      JSON.stringify(rewards),
      isMock,
      utmParams  ? JSON.stringify(utmParams) : null,
      ipAddress  || null,
      userAgent  || null,
      recurringInstructionId,
    ]
  );
  const donationId = donationRes.rows[0].id;

  await processRegistrationDonation(donationId, campaignId, participants, registrationOptionsById);

  // 3. Mock provider — skip Cardcom, return mock payment URL
  if (isMock) {
    const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
    return {
      url: `${frontBase}/mock-payment?id=${donationId}&amount=${amount}&slug=${campaign.slug}&title=${encodeURIComponent(campaign.title)}`,
      donationId,
    };
  }

  // 3. Build Cardcom products list
  const products = [];
  const rewardsTotal = rewards.reduce((s, r) => s + (r.minimumAmount || 0), 0);
  const baseAmount   = round2(amount - rewardsTotal);

  // Rewards first — each with its own title and minimum amount
  for (const r of rewards) {
    products.push({
      Description: `תשורה: ${r.title}`,
      UnitCost: round2(r.minimumAmount || 0),
    });
  }

  // Free / top-up amount
  if (baseAmount > 0) {
    const label = rewards.length > 0
      ? `תרומה נוספת — ${campaign.title}`
      : `תרומה — ${campaign.title}`;
    products.push({ Description: label, UnitCost: baseAmount });
  }

  // Fallback: no rewards, no base (shouldn't happen)
  if (products.length === 0) {
    products.push({ Description: campaign.title || 'תרומה', UnitCost: round2(amount) });
  }

  // 4. Cardcom payload
  const returnBase = process.env.BACKEND_URL || 'http://localhost:3000';
  const frontBase  = process.env.FRONTEND_URL || 'http://localhost:4200';

  const payload = {
    TerminalNumber: hasVerifiedCardcom ? campaign.cardcom_terminal_number : process.env.HAMONYM_CARDCOM_TERMINAL,
    ApiName:        hasVerifiedCardcom ? campaign.cardcom_api_username    : process.env.HAMONYM_CARDCOM_API_NAME,
    ApiPassword:    hasVerifiedCardcom ? campaign.cardcom_api_password_encrypted : process.env.HAMONYM_CARDCOM_API_PASSWORD,
    Amount:         round2(amount),
    Language:       'he',
    // ChargeAndCreateToken required for recurring signups — verified
    // empirically that ChargeOnly (the default) produces a LowProfile deal
    // with no token, which Recurring Create then rejects (ResponseCode=8500).
    // One-time donations keep the existing default (Operation omitted).
    ...(recurring ? { Operation: 'ChargeAndCreateToken' } : {}),
    SuccessRedirectUrl: `${returnBase}/api/donations/return?id=${donationId}&status=success`,
    FailedRedirectUrl:  `${returnBase}/api/donations/return?id=${donationId}&status=failed`,
    // Per-request, not terminal-level (Cardcom's LowProfile API v11) — works
    // the same whether this charge runs on Hamonym's platform terminal or an
    // entity's own verified Cardcom account, unlike a webhook configured once
    // in a specific terminal's admin panel. See docs/CARDCOM_INTEGRATION.md.
    WebHookUrl: `${returnBase}/api/payment/webhook?secret=${process.env.CARDCOM_WEBHOOK_SECRET}`,
    ReturnValue: String(donationId),
    Document: {
      To:       donor.name,
      Email:    donor.email,
      Phone:    donor.phone,
      Mobile:   donor.phone,
      Products: products,
    },
  };

  // TEMPORARY — confirming what actually goes out on the wire to Cardcom,
  // specifically whether WebHookUrl is present and well-formed (secret
  // masked so it doesn't land in plaintext in Render's logs). Remove once
  // the "why is no webhook arriving" investigation is closed — see
  // docs/CARDCOM_INTEGRATION.md.
  console.log('[createDonation] Cardcom LowProfile/Create payload:', {
    ...payload,
    ApiPassword: '***',
    WebHookUrl: payload.WebHookUrl?.replace(/secret=[^&]*/, 'secret=***'),
  });

  // 5. Call Cardcom
  let cardcomData;
  try {
    const response = await axios.post(CARDCOM_CREATE_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    cardcomData = response.data;
  } catch (err) {
    await db.query(`UPDATE donations SET status='failed', updated_at=NOW() WHERE id=$1`, [donationId]);
    throw new Error(err.response?.data?.Description || 'Cardcom connection failed');
  }

  if (cardcomData.ResponseCode !== 0) {
    await db.query(`UPDATE donations SET status='failed', updated_at=NOW() WHERE id=$1`, [donationId]);
    throw new Error(cardcomData.Description || `Cardcom error ${cardcomData.ResponseCode}`);
  }

  // 6. Store LowProfileId
  await db.query(
    `UPDATE donations SET low_profile_id=$1 WHERE id=$2`,
    [cardcomData.LowProfileId, donationId]
  );

  return {
    url:        cardcomData.Url,
    donationId,
  };
};

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   HANDLE CARDCOM RETURN
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
// Same per-entity-vs-Hamonym-fallback rule as createDonation's Cardcom
// payload above, looked up independently for a donation that already exists
// (the Cardcom webhook only gives us a donationId via ReturnValue, not the
// campaign/entity context createDonation had at hand when it built the
// LowProfile in the first place).
function credentialsFromEntityRow(row) {
  const hasVerifiedCardcom = !!(
    row?.cardcom_terminal_number &&
    row?.cardcom_api_username &&
    row?.cardcom_api_password_encrypted &&
    row?.cardcom_connection_status === 'success'
  );

  return hasVerifiedCardcom
    ? {
        terminalNumber: row.cardcom_terminal_number,
        apiName: row.cardcom_api_username,
        apiPassword: row.cardcom_api_password_encrypted,
      }
    : {
        terminalNumber: process.env.HAMONYM_CARDCOM_TERMINAL,
        apiName: process.env.HAMONYM_CARDCOM_API_NAME,
        apiPassword: process.env.HAMONYM_CARDCOM_API_PASSWORD,
      };
}

async function resolveCardcomCredentials(donationId) {
  const res = await db.query(
    `SELECT e.cardcom_terminal_number, e.cardcom_api_username, e.cardcom_api_password_encrypted,
            e.cardcom_connection_status
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     JOIN entities e ON e.id = c.entity_id
     WHERE d.id = $1`,
    [donationId]
  );
  return credentialsFromEntityRow(res.rows[0]);
}
exports.resolveCardcomCredentials = resolveCardcomCredentials;

// Same resolution, keyed directly off entity_id — recurring_instructions
// already carries entity_id itself, no donation to join through (Pause/
// Resume act on the Master instruction, not any one charge).
async function resolveCardcomCredentialsForEntity(entityId) {
  const res = await db.query(
    `SELECT cardcom_terminal_number, cardcom_api_username, cardcom_api_password_encrypted,
            cardcom_connection_status
     FROM entities WHERE id = $1`,
    [entityId]
  );
  return credentialsFromEntityRow(res.rows[0]);
}
exports.resolveCardcomCredentialsForEntity = resolveCardcomCredentialsForEntity;

// Closes out a donation exactly once — the shared step for both the Cardcom
// Return Redirect (UX only, not authoritative — a donor can close the tab,
// lose connection, or hit Back before it fires) and the Cardcom Webhook (the
// actual source of truth, see docs/CARDCOM_INTEGRATION.md). Idempotent: a
// donation already 'paid' is a no-op, so both call sites can safely fire for
// the same donation without double-counting campaign totals.
async function markDonationPaid(donationId, { providerReference } = {}) {
  const updateRes = await db.query(
    `UPDATE donations
     SET status='paid', provider_reference=$1, completed_at=NOW(), updated_at=NOW()
     WHERE id=$2 AND status != 'paid'
     RETURNING amount, campaign_id, entity_id`,
    [providerReference || null, donationId]
  );

  const row = updateRes.rows[0];
  if (!row) return { updated: false };

  await db.query(
    `UPDATE campaigns
     SET current_amount   = current_amount   + $1,
         supporters_count = supporters_count + 1,
         updated_at = NOW()
     WHERE id = $2`,
    [row.amount, row.campaign_id]
  );

  if (row.entity_id) require('../dashboard/dashboard.service').invalidateDashboard(row.entity_id);
  await finalizePaidDonation(donationId);

  return { updated: true, amount: row.amount, campaignId: row.campaign_id };
}
exports.markDonationPaid = markDonationPaid;

async function markDonationFailed(donationId, { providerReference } = {}) {
  await db.query(
    `UPDATE donations
     SET status='failed', provider_reference=$1, completed_at=NOW(), updated_at=NOW()
     WHERE id=$2 AND status = 'pending'`,
    [providerReference || null, donationId]
  );
}
exports.markDonationFailed = markDonationFailed;

// Phase 2 (2026-08-11) — UX only. The Webhook (payment.handler.js →
// markDonationPaid) is the sole source of truth for donation state; this
// function never decides paid/failed and never calls markDonationPaid or
// markDonationFailed. `status` only picks which page the donor lands on —
// it's the URL *we* chose (SuccessRedirectUrl vs FailedRedirectUrl), not a
// signal from Cardcom, so it's safe to use for routing even though nothing
// from Cardcom's query params is trusted for business state anymore (see
// docs/CARDCOM_INTEGRATION.md's Architecture Change and the 2026-08-11 bug
// this replaced — Cardcom's own ResponseCode was proven unreliable here).
exports.handleReturn = async ({ donationId, status }) => {

  const donRes = await db.query(
    `SELECT d.amount, c.slug
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     WHERE d.id = $1`,
    [donationId]
  );

  const row = donRes.rows[0];
  if (!row) return { notFound: true };

  const slug   = row.slug   || '';
  const amount = row.amount || 0;

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';

  return {
    redirectUrl: status === 'success'
      ? `${frontBase}/campaigns/${slug}/success?ref=${donationId}&amount=${amount}`
      : `${frontBase}/campaigns/${slug}/view?payment=failed`,
  };
};

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   PUBLIC DONATION RESULT (for success page)
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
exports.getDonationPublic = async (donationId) => {
  const res = await db.query(
    `SELECT d.id, d.amount, d.created_at, d.status, d.donor_name, d.donor_email, d.donor_user_id,
            c.id AS campaign_id, c.title AS campaign_title, c.slug AS campaign_slug,
            c.cover_image_url, e.display_name AS entity_name, e.logo_url AS entity_logo,
            e.ga_measurement_id AS entity_ga_measurement_id,
            r.id AS receipt_id
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     JOIN entities  e ON e.id = d.entity_id
     LEFT JOIN receipts r ON r.donation_id = d.id
     WHERE d.id = $1`,
    [donationId]
  );
  return res.rows[0] || null;
};

exports.getReceipt = async (receiptId) => {
  const res = await db.query(
    `SELECT r.id, r.receipt_number, r.amount, r.donor_name, r.donor_email, r.issued_at,
            c.title AS campaign_title,
            e.display_name AS entity_name, e.logo_url AS entity_logo, e.legal_name
     FROM receipts r
     JOIN campaigns c ON c.id = r.campaign_id
     JOIN entities  e ON e.id = r.entity_id
     WHERE r.id = $1`,
    [receiptId]
  );
  return res.rows[0] || null;
};

exports.getMyDonations = async (userId) => {
  const res = await db.query(
    `SELECT d.id, d.amount, d.completed_at, d.created_at, d.is_anonymous,
            c.title AS campaign_title, c.slug AS campaign_slug, c.cover_image_url,
            e.display_name AS entity_name, e.logo_url AS entity_logo,
            r.id AS receipt_id
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     JOIN entities  e ON e.id = d.entity_id
     LEFT JOIN receipts r ON r.donation_id = d.id
     WHERE d.donor_user_id = $1 AND d.status = 'paid'
     ORDER BY d.completed_at DESC`,
    [userId]
  );
  return res.rows;
};

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   LIVE DONATIONS (polling ג€” new since timestamp)
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
exports.getLiveDonations = async (slug, since) => {
  const sinceDate = since ? new Date(since) : new Date(0);
  const res = await db.query(
    `SELECT d.donor_name AS name,
            d.amount::float AS amount,
            d.completed_at,
            d.is_anonymous
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     JOIN entities  e ON e.id = c.entity_id
     WHERE c.slug = $1
       AND d.status = 'paid'
       AND d.completed_at > $2
       AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
     ORDER BY d.completed_at ASC
     LIMIT 10`,
    [slug, sinceDate]
  );
  return res.rows;
};

/* ──────────────────────────────────────────────────────
   REWARD PURCHASE COUNTS (public — "X נרכשו מתוך Y" badge)
────────────────────────────────────────────────────── */
exports.getRewardCounts = async (slug) => {
  const res = await db.query(
    `SELECT elem->>'id' AS reward_id, COUNT(*)::int AS count
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     JOIN entities  e ON e.id = c.entity_id
     CROSS JOIN LATERAL jsonb_array_elements(d.rewards) AS elem
     WHERE c.slug = $1
       AND d.status = 'paid'
       AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
       AND elem->>'id' IS NOT NULL
     GROUP BY elem->>'id'`,
    [slug]
  );
  const counts = {};
  for (const row of res.rows) counts[row.reward_id] = row.count;
  return counts;
};

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   PUBLIC DONORS LIST (for campaign page)
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
exports.getCampaignDonors = async (slug, period) => {
  let periodClause = '';
  if (period === 'today')      periodClause = `AND camp.completed_at >= date_trunc('day', NOW())`;
  else if (period === 'week')  periodClause = `AND camp.completed_at >= NOW() - INTERVAL '7 days'`;

  const [listRes, topRes] = await Promise.all([
    db.query(
      `WITH camp AS (
         SELECT d.id, d.donor_name, d.donor_email, d.donor_phone, d.amount::float AS amount,
                d.completed_at, d.is_anonymous
         FROM donations d
         JOIN campaigns c ON c.id = d.campaign_id
         JOIN entities  e ON e.id = c.entity_id
         WHERE c.slug = $1 AND d.status = 'paid'
           AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
       ),
       first_ids AS (
         SELECT DISTINCT ON (COALESCE(NULLIF(donor_email, ''), NULLIF(donor_phone, ''), id::text)) id
         FROM camp
         ORDER BY COALESCE(NULLIF(donor_email, ''), NULLIF(donor_phone, ''), id::text), completed_at ASC
       )
       SELECT
         CASE WHEN camp.is_anonymous THEN 'תורם/ת אנונימי/ת' ELSE camp.donor_name END AS name,
         camp.amount,
         camp.completed_at,
         camp.is_anonymous,
         (camp.id IN (SELECT id FROM first_ids)) AS is_first
       FROM camp
       WHERE TRUE ${periodClause}
       ORDER BY camp.completed_at DESC
       LIMIT 30`,
      [slug]
    ),
    db.query(
      `SELECT d.donor_name AS name, SUM(d.amount)::float AS total
       FROM donations d
       JOIN campaigns c ON c.id = d.campaign_id
       JOIN entities  e ON e.id = c.entity_id
       WHERE c.slug = $1 AND d.status = 'paid' AND d.is_anonymous = false
         AND c.is_hidden = false AND e.is_hidden = false AND c.deleted_at IS NULL
       GROUP BY d.donor_name
       ORDER BY total DESC
       LIMIT 10`,
      [slug]
    ),
  ]);

  return { donors: listRes.rows, topDonors: topRes.rows };
};

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   HANDLE MOCK PAYMENT COMPLETION (dev only)
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
exports.handleMockComplete = async ({ donationId, status, failureReason, completedAt }) => {
  const success   = status === 'paid';
  const newStatus = success ? 'paid' : 'failed';
  const resolvedAt = completedAt ? new Date(completedAt) : new Date();

  const donRes = await db.query(
    `SELECT d.amount, d.campaign_id, c.slug, c.entity_id
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     WHERE d.id = $1`,
    [donationId]
  );

  const row      = donRes.rows[0];
  const slug     = row?.slug      || '';
  const amount   = row?.amount    || 0;
  const entityId = row?.entity_id || null;

  await db.query(
    `UPDATE donations
     SET status=$1, failure_reason=$2, completed_at=$3, updated_at=NOW()
     WHERE id=$4`,
    [newStatus, failureReason || null, resolvedAt, donationId]
  );

  if (success && row?.campaign_id) {
    await db.query(
      `UPDATE campaigns
       SET current_amount   = current_amount   + $1,
           supporters_count = supporters_count + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, row.campaign_id]
    );
    await finalizePaidDonation(donationId);
  }

  if (entityId) require('../dashboard/dashboard.service').invalidateDashboard(entityId);

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  return {
    redirectUrl: success
      ? `${frontBase}/campaigns/${slug}/success?ref=${donationId}&amount=${amount}`
      : `${frontBase}/campaigns/${slug}/view?payment=failed`,
  };
};


/* ─────────────────────────────────────────
   ENTITY DONATIONS PAGE (authenticated)
───────────────────────────────────────── */
const SORT_COLUMNS = {
  donor:    'd.donor_name',
  campaign: 'c.title',
  amount:   'd.amount',
  date:     'd.created_at',
  status:   'd.status',
};

exports.getEntityDonations = async (entityId, { status, campaignId, period, search, sortBy, sortDir, page = 0, limit = 25 }) => {
  const where  = ['d.entity_id = $1'];
  const params = [entityId];
  let idx = 2;

  const sortCol = SORT_COLUMNS[sortBy] || 'd.created_at';
  const sortOrd = sortDir === 'asc' ? 'ASC' : 'DESC';

  if (period === 'month') {
    where.push(`d.created_at >= date_trunc('month', NOW())`);
  } else if (period === 'last_month') {
    where.push(`d.created_at >= date_trunc('month', NOW() - INTERVAL '1 month')`);
    where.push(`d.created_at <  date_trunc('month', NOW())`);
  } else if (period === 'quarter') {
    where.push(`d.created_at >= NOW() - INTERVAL '3 months'`);
  }

  if (status && status !== 'all') {
    where.push(`d.status = $${idx++}`);
    params.push(status);
  }

  if (campaignId) {
    where.push(`d.campaign_id = $${idx++}`);
    params.push(campaignId);
  }

  if (search) {
    where.push(`(d.donor_name ILIKE $${idx} OR d.donor_email ILIKE $${idx} OR d.donor_phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereStr = where.join(' AND ');

  const [listRes, kpiRes, campaignsRes] = await Promise.all([
    db.query(
      `SELECT d.id, d.amount::float, d.donor_name, d.donor_email, d.donor_phone,
              d.status, d.completed_at, d.created_at, d.is_anonymous, d.failure_reason, d.is_mock,
              c.title AS campaign_title, c.slug AS campaign_slug
       FROM donations d
       JOIN campaigns c ON c.id = d.campaign_id
       WHERE ${whereStr}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE d.status = 'paid')::int    AS paid_count,
         COUNT(*) FILTER (WHERE d.status = 'failed')::int  AS failed_count,
         COUNT(*) FILTER (WHERE d.status = 'pending')::int AS pending_count,
         COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'paid'), 0)::float AS total_raised,
         COALESCE(AVG(d.amount) FILTER (WHERE d.status = 'paid'), 0)::float AS avg_amount
       FROM donations d
       WHERE ${whereStr}`,
      params
    ),
    db.query(
      `SELECT id::text, title FROM campaigns WHERE entity_id = $1 AND status != 'draft' ORDER BY title ASC`,
      [entityId]
    ),
  ]);

  const kpi = kpiRes.rows[0];
  return {
    donations: listRes.rows,
    kpi: {
      totalRaised:  kpi.total_raised,
      paidCount:    kpi.paid_count,
      failedCount:  kpi.failed_count,
      pendingCount: kpi.pending_count,
      avgAmount:    kpi.avg_amount,
      total:        kpi.total,
    },
    campaigns: campaignsRes.rows,
    total:     kpi.total,
    page,
    limit,
  };
};

// Just the donation list + aggregate KPIs (donorCount folded into the same
// aggregate scan) — none of getEntityDonations' campaign-dropdown sub-query,
// for callers (like the platform org detail page) that don't render a filter.
exports.getEntityDonationsSummary = async (entityId, { limit = 25, page = 0 } = {}) => {
  const [listRes, aggRes] = await Promise.all([
    db.query(
      `SELECT d.id, d.amount::float, d.donor_name, d.donor_email, d.donor_phone,
              d.status, d.completed_at, d.created_at, d.is_anonymous, d.failure_reason, d.is_mock,
              c.title AS campaign_title, c.slug AS campaign_slug
       FROM donations d
       JOIN campaigns c ON c.id = d.campaign_id
       WHERE d.entity_id = $1
       ORDER BY d.created_at DESC
       LIMIT $2 OFFSET $3`,
      [entityId, limit, page * limit]
    ),
    db.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE d.status = 'paid')::int    AS paid_count,
         COUNT(*) FILTER (WHERE d.status = 'failed')::int  AS failed_count,
         COUNT(*) FILTER (WHERE d.status = 'pending')::int AS pending_count,
         COALESCE(SUM(d.amount) FILTER (WHERE d.status = 'paid'), 0)::float AS total_raised,
         COALESCE(AVG(d.amount) FILTER (WHERE d.status = 'paid'), 0)::float AS avg_amount,
         COUNT(DISTINCT COALESCE(NULLIF(d.donor_email, ''), NULLIF(d.donor_phone, ''), d.donor_name))
           FILTER (WHERE d.status = 'paid')::int AS donor_count
       FROM donations d
       WHERE d.entity_id = $1`,
      [entityId]
    ),
  ]);

  const agg = aggRes.rows[0];
  return {
    donations: listRes.rows,
    kpi: {
      totalRaised:  agg.total_raised,
      paidCount:    agg.paid_count,
      failedCount:  agg.failed_count,
      pendingCount: agg.pending_count,
      avgAmount:    agg.avg_amount,
      total:        agg.total,
    },
    donorCount: agg.donor_count,
  };
};

/* ─────────────────────────────────────────
   ENTITY DONORS PAGE (authenticated)
   — donations grouped by donor identity
───────────────────────────────────────── */
const DONOR_SORT_COLUMNS = {
  name:  'display_name',
  total: 'total_donated',
  count: 'donation_count',
  last:  'last_donation_at',
};

exports.getEntityDonors = async (entityId, { campaignId, search, sortBy, sortDir, page = 0, limit = 25 }) => {
  const where  = ['d.entity_id = $1', `d.status = 'paid'`];
  const params = [entityId];
  let idx = 2;

  if (campaignId) {
    where.push(`d.campaign_id = $${idx++}`);
    params.push(campaignId);
  }

  if (search) {
    where.push(`(d.donor_name ILIKE $${idx} OR d.donor_email ILIKE $${idx} OR d.donor_phone ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }

  const whereStr = where.join(' AND ');
  const sortCol   = DONOR_SORT_COLUMNS[sortBy] || 'total_donated';
  const sortOrd   = sortDir === 'asc' ? 'ASC' : 'DESC';

  const [listRes, kpiRes] = await Promise.all([
    db.query(
      `WITH base AS (
         SELECT
           COALESCE(NULLIF(d.donor_email, ''), NULLIF(d.donor_phone, ''), d.donor_name) AS donor_key,
           d.donor_name, d.donor_email, d.donor_phone, d.amount, d.completed_at,
           d.campaign_id, d.is_anonymous, d.is_mock
         FROM donations d
         WHERE ${whereStr}
       )
       SELECT
         donor_key,
         MAX(donor_email) AS email,
         MAX(donor_phone) AS phone,
         COALESCE(MAX(CASE WHEN NOT is_anonymous THEN donor_name END), 'תורם/ת אנונימי/ת') AS display_name,
         BOOL_OR(is_anonymous)                AS has_anonymous,
         BOOL_OR(is_mock)                     AS has_mock,
         SUM(amount)::float                   AS total_donated,
         COUNT(*)::int                        AS donation_count,
         MIN(completed_at)                    AS first_donation_at,
         MAX(completed_at)                    AS last_donation_at,
         COUNT(DISTINCT campaign_id)::int     AS campaigns_count
       FROM base
       GROUP BY donor_key
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT
         COUNT(DISTINCT COALESCE(NULLIF(d.donor_email, ''), NULLIF(d.donor_phone, ''), d.donor_name))::int AS donor_count,
         COALESCE(SUM(d.amount), 0)::float AS total_raised
       FROM donations d
       WHERE ${whereStr}`,
      params
    ),
  ]);

  const kpi        = kpiRes.rows[0];
  const donorCount = kpi.donor_count;

  return {
    donors: listRes.rows,
    kpi: {
      donorCount,
      totalRaised: kpi.total_raised,
      avgPerDonor: donorCount > 0 ? kpi.total_raised / donorCount : 0,
    },
    total: donorCount,
    page,
    limit,
  };
};

/* ─────────────────────────────────────────
   MANUAL DONATION ENTRY (authenticated, entity manager)
   — logs an offline donation (bank transfer/check/cash/other) directly as
   paid, bypassing Cardcom. Mirrors the campaign-totals update + receipt/
   donor-linking side effects of the real payment flow (handleReturn above)
   so a manual entry behaves identically to an online one everywhere else
   in the app.
───────────────────────────────────────── */
const MANUAL_DONATION_SOURCES = ['bank_transfer', 'check', 'cash', 'other'];

exports.createManualDonation = async (entityId, { campaignId, amount, source, supportersCount, donorName, donorEmail, donorPhone, note }, enteredByUserId) => {
  if (!campaignId) throw new Error('חסר מזהה קמפיין');
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('סכום לא תקין');
  if (!MANUAL_DONATION_SOURCES.includes(source)) throw new Error('מקור תרומה לא תקין');
  const count = Math.max(1, parseInt(supportersCount, 10) || 1);

  // requireEntityOwnership already confirmed the acting user manages
  // entityId — this closes the gap where campaignId in the body could
  // belong to a DIFFERENT entity.
  const campRes = await db.query(
    `SELECT id FROM campaigns WHERE id = $1 AND entity_id = $2`,
    [campaignId, entityId]
  );
  if (campRes.rows.length === 0) throw new Error('הקמפיין לא נמצא עבור ישות זו');

  const donationRes = await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount, donor_name, donor_email, donor_phone, is_anonymous,
       rewards, status, is_mock, source, supporters_count, entered_by, note,
       completed_at
     ) VALUES ($1,$2,$3,$4,$5,$6,false,'[]','paid',false,$7,$8,$9,$10,NOW())
     RETURNING id`,
    [campaignId, entityId, amt, donorName || null, donorEmail || null, donorPhone || null, source, count, enteredByUserId, note || null]
  );
  const donationId = donationRes.rows[0].id;

  await db.query(
    `UPDATE campaigns
     SET current_amount   = current_amount   + $1,
         supporters_count = supporters_count + $2,
         updated_at = NOW()
     WHERE id = $3`,
    [amt, count, campaignId]
  );

  require('../dashboard/dashboard.service').invalidateDashboard(entityId);
  await finalizePaidDonation(donationId);

  return { donationId };
};

function round2(n) { return Math.round(n * 100) / 100; }

