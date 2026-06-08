const axios = require('axios');
const db    = require('../../db/db');

const CARDCOM_CREATE_URL = 'https://secure.cardcom.solutions/api/v11/LowProfile/Create';

/* ─────────────────────────────────────────
   CREATE DONATION + CARDCOM LOW PROFILE
───────────────────────────────────────── */
exports.createDonation = async ({ campaignId, donor, amount, rewards = [] }) => {

  // 1. Fetch campaign → entity
  const campaignRes = await db.query(
    `SELECT c.id, c.slug, c.title, c.entity_id,
            e.cardcom_terminal, e.cardcom_api_name, e.cardcom_api_password
     FROM campaigns c
     JOIN entities  e ON e.id = c.entity_id
     WHERE c.id = $1`,
    [campaignId]
  );

  const campaign = campaignRes.rows[0];
  if (!campaign) throw new Error('Campaign not found');

  if (!campaign.cardcom_terminal || !campaign.cardcom_api_name || !campaign.cardcom_api_password) {
    throw new Error('Cardcom credentials not configured for this entity');
  }

  // 2. Save pending donation
  const donationRes = await db.query(
    `INSERT INTO donations (
       campaign_id, entity_id, amount,
       donor_name, donor_email, donor_phone, donor_id_number, donor_address,
       rewards, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending')
     RETURNING id`,
    [
      campaignId,
      campaign.entity_id,
      amount,
      donor.name,
      donor.email,
      donor.phone,
      donor.idNumber || null,
      donor.address  || null,
      JSON.stringify(rewards),
    ]
  );
  const donationId = donationRes.rows[0].id;

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
      ? `תרומה חופשית — ${campaign.title}`
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
    await db.query(`UPDATE donations SET status='failed' WHERE id=$1`, [donationId]);
    throw new Error(err.response?.data?.Description || 'Cardcom connection failed');
  }

  if (cardcomData.ResponseCode !== 0) {
    await db.query(`UPDATE donations SET status='failed' WHERE id=$1`, [donationId]);
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

/* ─────────────────────────────────────────
   HANDLE CARDCOM RETURN
───────────────────────────────────────── */
exports.handleReturn = async ({ donationId, status, lowprofilecode, responseCode }) => {

  const success   = status === 'success' || String(responseCode) === '0';
  const newStatus = success ? 'paid' : 'failed';

  // Fetch donation + campaign in one query
  const donRes = await db.query(
    `SELECT d.amount, d.campaign_id, c.slug
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     WHERE d.id = $1`,
    [donationId]
  );

  const row = donRes.rows[0];
  const slug   = row?.slug  || '';
  const amount = row?.amount || 0;

  // Update donation record
  await db.query(
    `UPDATE donations
     SET status=$1, provider_reference=$2, completed_at=NOW(), updated_at=NOW()
     WHERE id=$3`,
    [newStatus, lowprofilecode || null, donationId]
  );

  // On success: bump campaign metrics
  if (success && row?.campaign_id) {
    await db.query(
      `UPDATE campaigns
       SET current_amount   = current_amount   + $1,
           supporters_count = supporters_count + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [amount, row.campaign_id]
    );
  }

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';

  return {
    redirectUrl: success
      ? `${frontBase}/campaigns/${slug}/success?ref=${donationId}&amount=${amount}`
      : `${frontBase}/campaigns/${slug}/view?payment=failed`,
  };
};

/* ─────────────────────────────────────────
   PUBLIC DONATION RESULT (for success page)
───────────────────────────────────────── */
exports.getDonationPublic = async (donationId) => {
  const res = await db.query(
    `SELECT d.id, d.amount, d.created_at, d.status,
            c.title AS campaign_title, c.slug AS campaign_slug,
            c.cover_image_url, e.display_name AS entity_name, e.logo_url AS entity_logo
     FROM donations d
     JOIN campaigns c ON c.id = d.campaign_id
     JOIN entities  e ON e.id = d.entity_id
     WHERE d.id = $1`,
    [donationId]
  );
  return res.rows[0] || null;
};

function round2(n) { return Math.round(n * 100) / 100; }
