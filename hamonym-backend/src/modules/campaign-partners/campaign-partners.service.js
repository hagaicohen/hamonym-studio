const db = require('../../db/db');
const { isEntityMember } = require('../../middleware/entity-permission.middleware');
const entitiesService = require('../entities/entities.service');

// See docs/PARTNER_DOMAIN_MODEL_ADR.md — CampaignPartner is the center of
// the campaign<->partner relationship; Reward is optional and subordinate to
// it (a partner can appear as sponsor-only), never the reverse.

function mapRow(r) {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    partnerEntityId: r.partner_entity_id,
    rewardId: r.reward_id,
    order: r.display_order,
    visible: r.visible,
    coupon: r.coupon,
    campaignMessage: r.campaign_message,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // Present only on listForCampaign's joined query — lets the campaign
    // manager see a link points at a since-soft-deleted/hidden partner
    // instead of it silently vanishing. Soft delete does NOT cascade or
    // hide this row automatically (unlike the public listing, which
    // filters it out — see listPublicForCampaign).
    ...(r.partner_display_name !== undefined ? {
      partnerDisplayName: r.partner_display_name,
      partnerDeleted: r.partner_deleted,
      partnerHidden: r.partner_hidden,
    } : {}),
  };
}

function mapPublicRow(r) {
  return {
    id: r.id,
    rewardId: r.reward_id,
    order: r.display_order,
    coupon: r.coupon,
    campaignMessage: r.campaign_message,
    partner: {
      id: r.partner_id,
      displayName: r.partner_display_name,
      logoUrl: r.partner_logo_url,
      website: r.partner_website,
    },
  };
}

async function getCampaignOwnerEntityId(campaignId) {
  const { rows } = await db.query(`SELECT entity_id FROM campaigns WHERE id = $1`, [campaignId]);
  return rows[0]?.entity_id || null;
}

// Ownership of a CampaignPartner link belongs to the campaign's manager, not
// the partner (see ADR §4 ownership split) — this is deliberately the same
// check campaigns.service.js#validateOwnership performs, just resolved from
// campaign_partners.campaign_id when the row (not the campaign) is the input.
async function assertCampaignOwnership(userId, campaignId) {
  const entityId = await getCampaignOwnerEntityId(campaignId);
  if (!entityId) {
    const err = new Error('Campaign not found');
    err.status = 404;
    throw err;
  }
  if (!(await isEntityMember(userId, entityId))) {
    const err = new Error('Unauthorized');
    err.status = 403;
    throw err;
  }
}

// Deliberately shows ALL links, including ones pointing at a since
// soft-deleted/hidden partner (partnerDeleted/partnerHidden flags let the
// manager notice and remove a stale link) — only the public listing filters
// those out. See docs/PARTNER_DOMAIN_MODEL_ADR.md, "יישום Phase 2" (revision).
exports.listForCampaign = async (userId, campaignId) => {
  await assertCampaignOwnership(userId, campaignId);
  const { rows } = await db.query(
    `SELECT cp.*, e.display_name AS partner_display_name,
            (e.deleted_at IS NOT NULL) AS partner_deleted,
            e.is_hidden AS partner_hidden
     FROM campaign_partners cp
     JOIN entities e ON e.id = cp.partner_entity_id
     WHERE cp.campaign_id = $1
     ORDER BY cp.display_order ASC, cp.created_at ASC`,
    [campaignId]
  );
  return rows.map(mapRow);
};

// Public — for the campaign's public page (Partner Navigation, Phase 4).
// Only visible=true links, and only non-hidden/non-deleted partner entities.
exports.listPublicForCampaign = async (slug) => {
  const { rows } = await db.query(
    `SELECT cp.id, cp.reward_id, cp.display_order, cp.coupon, cp.campaign_message,
            e.id AS partner_id, e.display_name AS partner_display_name,
            e.logo_url AS partner_logo_url, e.website AS partner_website
     FROM campaign_partners cp
     JOIN campaigns c ON c.id = cp.campaign_id
     JOIN entities e ON e.id = cp.partner_entity_id
     WHERE c.slug = $1 AND c.deleted_at IS NULL AND cp.visible = true
       AND e.is_hidden = false AND e.deleted_at IS NULL
     ORDER BY cp.display_order ASC, cp.created_at ASC`,
    [slug]
  );
  return rows.map(mapPublicRow);
};

exports.create = async (userId, campaignId, data) => {
  await assertCampaignOwnership(userId, campaignId);

  const partnerCheck = await db.query(
    `SELECT id FROM entities WHERE id = $1 AND deleted_at IS NULL`,
    [data.partnerEntityId]
  );
  if (partnerCheck.rows.length === 0) {
    const err = new Error('Partner entity not found');
    err.status = 404;
    throw err;
  }
  if (!(await entitiesService.hasRole(data.partnerEntityId, 'partner'))) {
    const err = new Error("Entity does not hold the 'partner' role (entity_roles)");
    err.status = 400;
    throw err;
  }

  const { rows } = await db.query(
    `INSERT INTO campaign_partners
       (campaign_id, partner_entity_id, reward_id, display_order, visible, coupon, campaign_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      campaignId,
      data.partnerEntityId,
      data.rewardId || null,
      data.order ?? 0,
      data.visible === undefined ? true : !!data.visible,
      data.coupon || null,
      data.campaignMessage || null,
    ]
  );
  return mapRow(rows[0]);
};

exports.update = async (userId, campaignPartnerId, data) => {
  const existing = await db.query(`SELECT campaign_id FROM campaign_partners WHERE id = $1`, [campaignPartnerId]);
  if (existing.rows.length === 0) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  await assertCampaignOwnership(userId, existing.rows[0].campaign_id);

  const { rows } = await db.query(
    `UPDATE campaign_partners
     SET reward_id = COALESCE($2, reward_id),
         display_order = COALESCE($3, display_order),
         visible = COALESCE($4, visible),
         coupon = COALESCE($5, coupon),
         campaign_message = COALESCE($6, campaign_message),
         updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      campaignPartnerId,
      data.rewardId,
      data.order,
      data.visible,
      data.coupon,
      data.campaignMessage,
    ]
  );
  return mapRow(rows[0]);
};

exports.remove = async (userId, campaignPartnerId) => {
  const existing = await db.query(`SELECT campaign_id FROM campaign_partners WHERE id = $1`, [campaignPartnerId]);
  if (existing.rows.length === 0) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  await assertCampaignOwnership(userId, existing.rows[0].campaign_id);
  await db.query(`DELETE FROM campaign_partners WHERE id = $1`, [campaignPartnerId]);
};
