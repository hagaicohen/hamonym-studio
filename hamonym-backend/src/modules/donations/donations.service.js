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

const CARDCOM_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

/* ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
   CREATE DONATION + CARDCOM LOW PROFILE
ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ */
exports.createDonation = async ({ campaignId, donor, amount, rewards = [], utmParams, ipAddress, userAgent }) => {

  const isMock = process.env.PAYMENT_PROVIDER === 'mock';

  // 1. Fetch campaign ג†’ entity
  const campaignRes = await db.query(
    `SELECT c.id, c.slug, c.title, c.entity_id, c.status, c.is_hidden AS campaign_hidden, c.deleted_at,
            e.status AS entity_status, e.is_hidden AS entity_hidden,
            e.cardcom_terminal, e.cardcom_api_name, e.cardcom_api_password
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

  if (!isMock && (!campaign.cardcom_terminal || !campaign.cardcom_api_name || !campaign.cardcom_api_password)) {
    throw new Error('Cardcom credentials not configured for this entity');
  }

  // 2. Save pending donation
  const donationRes = await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount,
       donor_name, donor_email, donor_phone, donor_id_number, donor_address,
       postal_code, is_anonymous,
       rewards, status, is_mock,
       utm_params, ip_address, user_agent
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13,$14,$15)
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
    ]
  );
  const donationId = donationRes.rows[0].id;

  // 3. Mock provider ג€” skip Cardcom, return mock payment URL
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

  // Rewards first ג€” each with its own title and minimum amount
  for (const r of rewards) {
    products.push({
      Description: `׳×׳©׳•׳¨׳”: ${r.title}`,
      UnitCost: round2(r.minimumAmount || 0),
    });
  }

  // Free / top-up amount
  if (baseAmount > 0) {
    const label = rewards.length > 0
      ? `׳×׳¨׳•׳׳” ׳—׳•׳₪׳©׳™׳× ג€” ${campaign.title}`
      : `׳×׳¨׳•׳׳” ג€” ${campaign.title}`;
    products.push({ Description: label, UnitCost: baseAmount });
  }

  // Fallback: no rewards, no base (shouldn't happen)
  if (products.length === 0) {
    products.push({ Description: campaign.title || '׳×׳¨׳•׳׳”', UnitCost: round2(amount) });
  }

  // 4. Cardcom payload
  const returnBase = process.env.BACKEND_URL || 'http://localhost:3000';
  const frontBase  = process.env.FRONTEND_URL || 'http://localhost:4200';

  const payload = {
    TerminalNumber: campaign.cardcom_terminal,
    ApiName:        campaign.cardcom_api_name,
    ApiPassword:    campaign.cardcom_api_password,
    Amount:         round2(amount),
    Language:       'he',
    SuccessRedirectUrl: `${returnBase}/api/donations/return?id=${donationId}&status=success`,
    FailedRedirectUrl:  `${returnBase}/api/donations/return?id=${donationId}&status=failed`,
    ReturnValue: String(donationId),
    Document: {
      To:       donor.name,
      Email:    donor.email,
      Phone:    donor.phone,
      Mobile:   donor.phone,
      Products: products,
    },
  };

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
exports.handleReturn = async ({ donationId, status, lowprofilecode, responseCode }) => {

  const success   = status === 'success' || String(responseCode) === '0';
  const newStatus = success ? 'paid' : 'failed';

  // Fetch donation + campaign in one query
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

  // Update donation record
  await db.query(
    `UPDATE donations
     SET status=$1, provider_reference=$2, completed_at=NOW(), updated_at=NOW()
     WHERE id=$3`,
    [newStatus, lowprofilecode || null, donationId]
  );

  // On success: bump campaign metrics + bust dashboard cache
  if (success && row?.campaign_id) {
    await db.query(
      `UPDATE campaigns
       SET current_amount   = current_amount   + $1,
           supporters_count = supporters_count + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, row.campaign_id]
    );
    if (entityId) require('../dashboard/dashboard.service').invalidateDashboard(entityId);
    await finalizePaidDonation(donationId);
  }

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';

  return {
    redirectUrl: success
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
      `SELECT id::text, title FROM campaigns WHERE entity_id = $1 ORDER BY title ASC`,
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

exports.getEntityDonors = async (entityId, { search, sortBy, sortDir, page = 0, limit = 25 }) => {
  const where  = ['d.entity_id = $1', `d.status = 'paid'`];
  const params = [entityId];
  let idx = 2;

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

function round2(n) { return Math.round(n * 100) / 100; }

