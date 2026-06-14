const db =
  require('../../db/db');

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

async function validateOwnership(
  userId,
  entityId
) {

  const result =
    await db.query(

      `
      SELECT 1
      FROM user_entities
      WHERE user_id = $1
      AND entity_id = $2
      LIMIT 1
      `,

      [
        userId,
        entityId
      ]

    );

  return result.rows.length > 0;

}

function sanitizeUpdateData(
  data
) {

  const clone =
    { ...data };

  delete clone.id;
  delete clone.entity_id;
  delete clone.created_at;
  delete clone.updated_at;
  delete clone.published_at;

  return clone;

}

const JSON_COLUMNS = new Set([
  'hero_text_style',
  'hero_cta_config',
  'rewards',
  'sponsors',
  'ambassadors',
  'updates',
  'blocks',
  'layout',
]);

function buildUpdateQuery(
  data
) {

  const keys =
    Object.keys(data)
      .filter(

        key =>

          data[key] !== undefined

      );

  if (!keys.length) {

    throw new Error(
      'No fields supplied'
    );

  }

  const values = [];

  const updates = [];

  keys.forEach(

    (key, index) => {

      updates.push(
        `${key} = $${index + 1}`
      );

      const val = data[key];

      values.push(
        JSON_COLUMNS.has(key) && val !== null && typeof val === 'object'
          ? JSON.stringify(val)
          : val
      );

    }

  );

  return {

    updates:
      updates.join(', '),

    values

  };

}

/*
|--------------------------------------------------------------------------
| CREATE CAMPAIGN
|--------------------------------------------------------------------------
*/

exports.createCampaign =
  async ({
    userId,
    data
  }) => {

    if (!data.entity_id) {

      throw new Error(
        'Entity ID is required'
      );

    }

    if (!data.title) {

      throw new Error(
        'Title is required'
      );

    }

    // טיוטה ללא slug — מייצרים אוטומטית
    if (!data.slug) {
      data.slug = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    }

    const hasAccess =
      await validateOwnership(
        userId,
        data.entity_id
      );

    if (!hasAccess) {

      throw new Error(
        'Unauthorized'
      );

    }

    try {

      const result =
        await db.query(

          `
          INSERT INTO campaigns (

            entity_id,

            status,
            slug,

            title,
            short_description,

            funding_type,
            category,
            manager_name,

            target_amount,
            start_date,
            end_date,

            logo_placement,
            logo_strip_align,
            logo_strip_bg,
            show_entity_name,
            show_logo,
            campaign_logo_url,
            hero_logo_position,
            show_hero_title,
            show_hero_subtitle,

            hero_type,
            hero_layout,
            hero_text_style,
            hero_cta_config,
            hero_custom_html,

            cover_image_url,
            video_url,

            enable_suggested_amounts,
            allow_custom_amount,
            allow_monthly_donation,

            suggested_amounts,
            monthly_amounts,

            rewards_enabled,

            rewards,
            sponsors,
            ambassadors,
            updates,

            blocks,
            layout

          )

          VALUES (

            $1,

            $2,$3,

            $4,$5,

            $6,$7,$8,

            $9,$10,$11,

            $12,$13,$14,$15,$16,$17,$18,$19,$20,

            $21,$22,$23,$24,$25,

            $26,$27,

            $28,$29,$30,

            $31,$32,

            $33,

            $34,$35,$36,$37,

            $38,$39

          )

          RETURNING *
          `,

          [

            data.entity_id,

            data.status || 'draft',
            data.slug,

            data.title,
            data.short_description || null,

            data.funding_type || 'flexible',
            data.category || null,
            data.manager_name || null,

            data.target_amount || 0,
            data.start_date || null,
            data.end_date || null,

            data.logo_placement || 'overlay',
            data.logo_strip_align || 'center',
            data.logo_strip_bg || '#ffffff',
            data.show_entity_name ?? true,
            data.show_logo ?? true,
            data.campaign_logo_url || null,
            data.hero_logo_position || 'left',
            data.show_hero_title ?? true,
            data.show_hero_subtitle ?? true,

            data.hero_type || 'image',
            data.hero_layout || 'title-subtitle',

            JSON.stringify(
              data.hero_text_style || {}
            ),

            JSON.stringify(
              data.hero_cta_config || {}
            ),

            data.hero_custom_html || '',

            data.cover_image_url || null,
            data.video_url || '',

            data.enable_suggested_amounts ?? true,
            data.allow_custom_amount ?? true,
            data.allow_monthly_donation ?? true,

            data.suggested_amounts || [
              50,
              100,
              180,
              360,
              500,
              1000
            ],

            data.monthly_amounts || [
              18,
              36,
              54,
              100
            ],

            data.rewards_enabled ?? true,

            JSON.stringify(
              data.rewards || []
            ),

            JSON.stringify(
              data.sponsors || []
            ),

            JSON.stringify(
              data.ambassadors || []
            ),

            JSON.stringify(
              data.updates || []
            ),

            JSON.stringify(
              data.blocks || []
            ),

            JSON.stringify(
              data.layout || {}
            )

          ]

        );

      const campaign = result.rows[0];
      await syncAmbassadors(campaign.id, data.ambassadors);
      require('../dashboard/dashboard.service').invalidateDashboard(campaign.entity_id);
      return campaign;

    } catch (err) {

      if (
        err.code === '23505'
      ) {

        throw new Error(
          'Campaign slug already exists'
        );

      }

      throw err;

    }

  };

/*
|--------------------------------------------------------------------------
| SYNC AMBASSADORS (JSON draft → campaign_ambassadors table)
|--------------------------------------------------------------------------
*/

async function syncAmbassadors(campaignId, ambassadors) {
  if (!Array.isArray(ambassadors) || ambassadors.length === 0) return;

  const incomingSlugs = ambassadors.map(a => a.slug).filter(Boolean);

  // Delete rows whose slugs are no longer in the list
  if (incomingSlugs.length > 0) {
    await db.query(
      `DELETE FROM campaign_ambassadors
       WHERE campaign_id = $1
         AND slug NOT IN (${incomingSlugs.map((_, i) => `$${i + 2}`).join(',')})`,
      [campaignId, ...incomingSlugs]
    );
  } else {
    await db.query('DELETE FROM campaign_ambassadors WHERE campaign_id = $1', [campaignId]);
  }

  for (const a of ambassadors) {
    if (!a.slug || !(a.fullName || a.full_name)) continue;
    await db.query(
      `INSERT INTO campaign_ambassadors
         (campaign_id, full_name, phone, email, goal_amount, personal_message, slug)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (campaign_id, slug) DO UPDATE SET
         full_name        = EXCLUDED.full_name,
         phone            = EXCLUDED.phone,
         email            = EXCLUDED.email,
         goal_amount      = EXCLUDED.goal_amount,
         personal_message = EXCLUDED.personal_message,
         updated_at       = NOW()`,
      [
        campaignId,
        (a.fullName || a.full_name).trim(),
        a.phone        || null,
        a.email        || null,
        a.goalAmount   ?? a.goal_amount ?? null,
        a.personalMessage ?? a.personal_message ?? '',
        a.slug,
      ]
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET MY CAMPAIGNS
|--------------------------------------------------------------------------
*/

exports.getMyCampaigns =
  async (userId) => {

    const result =
      await db.query(

        `
        SELECT

          c.*,

          e.display_name AS entity_name,
          e.logo_url

        FROM campaigns c

        INNER JOIN entities e
          ON e.id = c.entity_id

        INNER JOIN user_entities ue
          ON ue.entity_id = e.id

        WHERE ue.user_id = $1

        ORDER BY c.created_at DESC
        `,

        [userId]

      );

    return result.rows;

  };

/*
|--------------------------------------------------------------------------
| GET CAMPAIGN BY ID
|--------------------------------------------------------------------------
*/

exports.getCampaignById =
  async ({
    userId,
    campaignId
  }) => {

    const result =
      await db.query(

        `
        SELECT c.*

        FROM campaigns c

        INNER JOIN user_entities ue
          ON ue.entity_id = c.entity_id

        WHERE c.id = $1
        AND ue.user_id = $2

        LIMIT 1
        `,

        [
          campaignId,
          userId
        ]

      );

    return result.rows[0] || null;

  };

/*
|--------------------------------------------------------------------------
| UPDATE CAMPAIGN
|--------------------------------------------------------------------------
*/

exports.updateCampaign =
  async ({
    userId,
    campaignId,
    data
  }) => {

    const campaignResult =
      await db.query(

        `
        SELECT entity_id
        FROM campaigns
        WHERE id = $1
        LIMIT 1
        `,

        [campaignId]

      );

    if (
      !campaignResult.rows.length
    ) {

      throw new Error(
        'Campaign not found'
      );

    }

    const hasAccess =
      await validateOwnership(

        userId,

        campaignResult
          .rows[0]
          .entity_id

      );

    if (!hasAccess) {

      throw new Error(
        'Unauthorized'
      );

    }

    data =
      sanitizeUpdateData(
        data
      );

    const {

      updates,
      values

    } = buildUpdateQuery(
      data
    );

    try {

      const result =
        await db.query(

          `
          UPDATE campaigns

          SET

            ${updates},

            updated_at = NOW()

          WHERE id = $${values.length + 1}

          RETURNING *
          `,

          [

            ...values,

            campaignId

          ]

        );

      const campaign = result.rows[0];
      if (data.ambassadors !== undefined) {
        await syncAmbassadors(campaignId, data.ambassadors);
      }
      require('../dashboard/dashboard.service').invalidateDashboard(campaign.entity_id);
      return campaign;

    } catch (err) {

      if (
        err.code === '23505'
      ) {

        throw new Error(
          'Campaign slug already exists'
        );

      }

      throw err;

    }

  };

/*
|--------------------------------------------------------------------------
| GET CAMPAIGN BY SLUG (public preview for manager)
|--------------------------------------------------------------------------
*/

exports.getCampaignBySlug =
  async ({
    userId,
    slug
  }) => {

    const result =
      await db.query(

        `
        SELECT c.*

        FROM campaigns c

        INNER JOIN user_entities ue
          ON ue.entity_id = c.entity_id

        WHERE c.slug = $1
        AND ue.user_id = $2

        LIMIT 1
        `,

        [
          slug,
          userId
        ]

      );

    return result.rows[0] || null;

  };

/*
|--------------------------------------------------------------------------
| GET CAMPAIGN BY SLUG — PUBLIC (no auth required)
|--------------------------------------------------------------------------
*/

exports.getCampaignBySlugPublic = async (slug) => {
  const result = await db.query(
    `SELECT c.*, e.display_name AS entity_name, e.logo_url AS entity_logo
     FROM campaigns c
     JOIN entities e ON e.id = c.entity_id
     WHERE c.slug = $1 AND c.status = 'published'
     LIMIT 1`,
    [slug]
  );
  return result.rows[0] || null;
};

/*
|--------------------------------------------------------------------------
| CHECK SLUG AVAILABILITY
|--------------------------------------------------------------------------
*/

exports.checkSlugAvailable =
  async ({
    slug,
    excludeId
  }) => {

    const params = [slug];

    let query =
      `SELECT 1 FROM campaigns WHERE slug = $1`;

    if (excludeId) {
      query += ` AND id != $2`;
      params.push(excludeId);
    }

    query += ` LIMIT 1`;

    const result =
      await db.query(query, params);

    return result.rows.length === 0;

  };

/*
|--------------------------------------------------------------------------
| DELETE CAMPAIGN
|--------------------------------------------------------------------------
*/

exports.deleteCampaign =
  async ({
    userId,
    userRoleId,
    campaignId
  }) => {

    const campaignResult =
      await db.query(

        `
        SELECT entity_id, status
        FROM campaigns
        WHERE id = $1
        LIMIT 1
        `,

        [campaignId]

      );

    if (
      !campaignResult.rows.length
    ) {

      throw new Error(
        'Campaign not found'
      );

    }

    const { entity_id, status } = campaignResult.rows[0];

    const isSuperAdmin = userRoleId === 99;
    const isDraft      = status === 'draft';

    // מנהל עמותה יכול למחוק רק טיוטות. Super admin יכול למחוק הכל.
    if (!isDraft && !isSuperAdmin) {
      const err = new Error('Only super admin can delete a published campaign');
      err.status = 403;
      throw err;
    }

    const hasAccess =
      await validateOwnership(userId, entity_id);

    // Super admin עוקף ownership check
    if (!hasAccess && !isSuperAdmin) {

      throw new Error(
        'Unauthorized'
      );

    }

    await db.query(

      `
      DELETE
      FROM campaigns
      WHERE id = $1
      `,

      [campaignId]

    );

  };

/*
|--------------------------------------------------------------------------
| HIDE / UNHIDE CAMPAIGN
|--------------------------------------------------------------------------
*/

exports.setCampaignVisibility =
  async ({
    userId,
    campaignId,
    isHidden
  }) => {

    const campaignResult =
      await db.query(

        `
        SELECT entity_id, status
        FROM campaigns
        WHERE id = $1
        LIMIT 1
        `,

        [campaignId]

      );

    if (!campaignResult.rows.length) {
      throw new Error('Campaign not found');
    }

    const { entity_id, status } = campaignResult.rows[0];

    if (status === 'draft') {
      throw new Error('Cannot hide a draft campaign');
    }

    const hasAccess = await validateOwnership(userId, entity_id);
    if (!hasAccess) {
      throw new Error('Unauthorized');
    }

    await db.query(
      `UPDATE campaigns SET is_hidden = $1 WHERE id = $2`,
      [isHidden, campaignId]
    );

  };

exports.updateMyAmbassadorRecord = async (userId, campaignId, data) => {
  const { rows: found } = await db.query(
    `SELECT a.id FROM campaign_ambassadors a
     JOIN users u ON LOWER(u.email) = LOWER(a.email)
     WHERE u.id = $1 AND a.campaign_id = $2 LIMIT 1`,
    [userId, campaignId]
  );
  if (!found.length) throw new Error('Ambassador not found');
  const ambassadorId = found[0].id;

  const fields = [];
  const vals   = [];
  let   i      = 1;
  const allowed = ['full_name','phone','email','goal_amount','personal_message','personal_title'];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      vals.push(data[key] === '' ? null : data[key]);
    }
  }
  if (!fields.length) throw new Error('No fields supplied');
  vals.push(ambassadorId);
  const { rows } = await db.query(
    `UPDATE campaign_ambassadors SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    vals
  );
  if (!rows.length) throw new Error('Ambassador not found');
  const r = rows[0];
  return {
    id:               r.id,
    campaign_id:      r.campaign_id,
    full_name:        r.full_name,
    phone:            r.phone        ?? null,
    email:            r.email        ?? null,
    goal_amount:      r.goal_amount  != null ? Number(r.goal_amount) : null,
    personal_message: r.personal_message ?? '',
    personal_title:   r.personal_title   ?? '',
    status:           r.status,
    slug:             r.slug,
  };
};

exports.myAmbassadorRecord = async (userId, campaignId) => {
  const { rows } = await db.query(
    `SELECT a.id, a.campaign_id, a.full_name, a.phone, a.email,
            a.goal_amount, a.personal_message, a.status, a.slug,
            a.personal_title, a.created_at,
            c.title AS campaign_title, c.slug AS campaign_slug,
            c.cover_image_url AS campaign_cover
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN users u ON LOWER(u.email) = LOWER(a.email)
     WHERE u.id = $1 AND a.campaign_id = $2
     LIMIT 1`,
    [userId, campaignId]
  );
  if (!rows.length) throw new Error('Ambassador not found');
  const r = rows[0];
  return {
    id:               r.id,
    campaign_id:      r.campaign_id,
    full_name:        r.full_name,
    phone:            r.phone        ?? null,
    email:            r.email        ?? null,
    goal_amount:      r.goal_amount  != null ? Number(r.goal_amount) : null,
    personal_message: r.personal_message ?? '',
    personal_title:   r.personal_title   ?? '',
    status:           r.status,
    slug:             r.slug,
    created_at:       r.created_at,
    campaign: {
      title: r.campaign_title ?? '',
      slug:  r.campaign_slug  ?? '',
      cover: r.campaign_cover ?? null,
    },
  };
};

exports.myAmbassadorCampaigns = async (userId) => {
  const { rows } = await db.query(
    `SELECT DISTINCT c.id, c.title AS name
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     JOIN users u ON LOWER(u.email) = LOWER(a.email)
     WHERE u.id = $1 AND a.email IS NOT NULL
     ORDER BY c.title`,
    [userId]
  );
  return rows.map(r => ({ id: r.id, name: r.name || '' }));
};

