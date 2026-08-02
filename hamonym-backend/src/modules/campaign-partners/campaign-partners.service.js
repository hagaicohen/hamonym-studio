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
    // Campaign Participation content (Phase 5 model refinement — see
    // migration 036 + docs/PARTNER_DOMAIN_MODEL_ADR.md). Composed by the
    // public Partner page together with the Partner Profile's own
    // blocks/layout when a campaign context is present.
    blocks: r.blocks ?? [],
    layout: r.layout ?? {},
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

// Reverse direction of listForCampaign — "which campaigns use MY partner",
// for the standalone Partner back-office (Scenario 0 / "Partner First").
// Ownership checked against the PARTNER itself (caller must be an editor
// of it, per user_entities) — not against any campaign, since there may be
// zero, one, or many campaigns linked (§11: Partner can exist independently).
exports.listCampaignsForPartner = async (userId, partnerEntityId) => {
  if (!(await isEntityMember(userId, partnerEntityId))) {
    const err = new Error('Unauthorized');
    err.status = 403;
    throw err;
  }
  const { rows } = await db.query(
    `SELECT cp.id AS campaign_partner_id, cp.reward_id, cp.visible,
            c.id AS campaign_id, c.title AS campaign_title, c.slug AS campaign_slug, c.status AS campaign_status
     FROM campaign_partners cp
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.partner_entity_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.created_at DESC`,
    [partnerEntityId]
  );
  return rows.map(r => ({
    campaignPartnerId: r.campaign_partner_id,
    rewardId: r.reward_id,
    visible: r.visible,
    campaignId: r.campaign_id,
    campaignTitle: r.campaign_title,
    campaignSlug: r.campaign_slug,
    campaignStatus: r.campaign_status,
  }));
};

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
            cp.blocks, cp.layout,
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

  // A partner can only have ONE row per campaign (UNIQUE campaign_id,
  // partner_entity_id — see ADR §4, reward_id is subordinate to that single
  // row, not a separate dimension). Picking an already-linked partner for a
  // reward (e.g. one auto-linked as sponsor-only, reward_id NULL, by the
  // Deterministic Clone flow) is a real, expected path — not an error —
  // so this re-links/reassigns the existing row's reward instead of letting
  // the unique constraint reject a second INSERT.
  const { rows } = await db.query(
    `INSERT INTO campaign_partners
       (campaign_id, partner_entity_id, reward_id, display_order, visible, coupon, campaign_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (campaign_id, partner_entity_id) DO UPDATE
       SET reward_id  = COALESCE(EXCLUDED.reward_id, campaign_partners.reward_id),
           updated_at = now()
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

// Single-row fetch — needed by the Campaign Participation Builder page to
// show "which partner × which campaign" context (topbar/back-link), not
// otherwise exposed today (only whole-campaign listing existed).
exports.getOne = async (userId, campaignPartnerId) => {
  const { rows } = await db.query(
    `SELECT cp.*, e.display_name AS partner_display_name,
            c.title AS campaign_title, c.slug AS campaign_slug
     FROM campaign_partners cp
     JOIN entities e ON e.id = cp.partner_entity_id
     JOIN campaigns c ON c.id = cp.campaign_id
     WHERE cp.id = $1`,
    [campaignPartnerId]
  );
  if (rows.length === 0) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  await assertCampaignOwnership(userId, rows[0].campaign_id);
  return {
    ...mapRow(rows[0]),
    partnerDisplayName: rows[0].partner_display_name,
    campaignTitle: rows[0].campaign_title,
    campaignSlug: rows[0].campaign_slug,
  };
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

// ─────────────────────────────────────────────────────────────────────────
// Campaign Participation draft (Phase 5 model refinement — migration 036).
// Mirrors entities.service.js#getDraft/updateDraft exactly (same JSONB
// shape/pattern, just gated by campaign ownership instead of entity
// ownership — this content belongs to the campaign side of the
// relationship, same as the rest of campaign_partners' editable fields).
// ─────────────────────────────────────────────────────────────────────────
exports.getDraft = async (userId, campaignPartnerId) => {
  const existing = await db.query(`SELECT campaign_id, blocks, layout FROM campaign_partners WHERE id = $1`, [campaignPartnerId]);
  if (existing.rows.length === 0) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  await assertCampaignOwnership(userId, existing.rows[0].campaign_id);
  return { blocks: existing.rows[0].blocks ?? [], layout: existing.rows[0].layout ?? {} };
};

exports.updateDraft = async (userId, campaignPartnerId, { blocks, layout }) => {
  const existing = await db.query(`SELECT campaign_id FROM campaign_partners WHERE id = $1`, [campaignPartnerId]);
  if (existing.rows.length === 0) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  await assertCampaignOwnership(userId, existing.rows[0].campaign_id);

  const { rows } = await db.query(
    `UPDATE campaign_partners SET blocks = $2, layout = $3, updated_at = NOW()
     WHERE id = $1 RETURNING blocks, layout`,
    [campaignPartnerId, JSON.stringify(blocks ?? []), JSON.stringify(layout ?? {})]
  );
  return rows[0];
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
