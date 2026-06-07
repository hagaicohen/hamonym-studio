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

    if (!data.slug) {

      throw new Error(
        'Slug is required'
      );

    }

    if (!data.title) {

      throw new Error(
        'Title is required'
      );

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

            $12,$13,$14,$15,

            $16,$17,$18,$19,$20,

            $21,$22,

            $23,$24,$25,

            $26,$27,

            $28,

            $29,$30,$31,$32,

            $33,$34

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

      return result.rows[0];

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

      return result.rows[0];

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
    campaignId
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

    await db.query(

      `
      DELETE
      FROM campaigns
      WHERE id = $1
      `,

      [campaignId]

    );

  };

