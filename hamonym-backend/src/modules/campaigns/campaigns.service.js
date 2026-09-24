const db =
  require('../../db/db');

const { isEntityMember } =
  require('../../middleware/entity-permission.middleware');

const { isValidCategoryId } =
  require('./entity-categories');

// The placeholder createCampaign backfills when a draft has no title yet
// (see below) — exported so anything that needs to tell "a real title" apart
// from "just the cosmetic default" (e.g. CampaignAdvisorAgent's hasTitle
// fact) can compare against it instead of duplicating the literal.
exports.DEFAULT_TITLE = 'קמפיין ללא כותרת';

/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

async function validateOwnership(
  userId,
  entityId
) {

  return isEntityMember(userId, entityId);

}

// Exactly the columns campaign-api.service.ts#toSnake() actually sends
// (Production Launch Readiness pass, 2026-09-10). Before this whitelist,
// buildUpdateQuery() SET a column for every key present in the raw request
// body with no restriction beyond the 5 fields sanitizeUpdateData stripped
// -- any authenticated owner of the target entity could PATCH current_amount,
// supporters_count, is_locked, is_featured, is_hidden, deleted_at/deleted_by,
// hidden_by_entity_cascade, etc. directly, bypassing every dedicated
// endpoint (setCampaignVisibility, Super Admin lock, aggregate totals) that
// exists specifically to guard those fields.
const UPDATABLE_CAMPAIGN_COLUMNS = new Set([
  'status', 'slug', 'title', 'short_description', 'campaign_lifecycle',
  'funding_type', 'category', 'manager_name', 'target_amount', 'start_date',
  'end_date', 'logo_placement', 'logo_strip_align', 'logo_strip_bg',
  'show_entity_name', 'show_logo', 'campaign_logo_url', 'hero_logo_position',
  'show_hero_title', 'show_hero_subtitle', 'hero_type', 'hero_layout',
  'hero_text_style', 'hero_cta_config', 'hero_custom_html', 'cover_image_url',
  'video_url', 'enable_suggested_amounts', 'allow_custom_amount',
  'allow_monthly_donation', 'suggested_amounts', 'monthly_amounts',
  'recurring_billing_mode', 'recurring_installments_count', 'rewards_enabled',
  'rewards', 'registration_field_label', 'registration_field_icon',
  'sponsors', 'ambassadors', 'updates', 'blocks', 'layout',
]);

function sanitizeUpdateData(
  data
) {

  const clone = {};

  for (const key of Object.keys(data)) {
    if (UPDATABLE_CAMPAIGN_COLUMNS.has(key)) {
      clone[key] = data[key];
    }
  }

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

// Shared publish-readiness check (2026-09-24, extracted from updateCampaign
// so both the manual "פרסום לציבור" path and the entity-approval auto-
// publish path — see exports.publishRequestedCampaigns below — run through
// the EXACT same rules, never two copies that can drift). Mirrors
// campaign-publish-step.component.ts's own missingFields getter. Does NOT
// include the entity-approval check itself — callers decide separately
// whether/how that's checked (updateCampaign checks it inline right after
// calling this; publishRequestedCampaigns is only ever invoked once the
// entity JUST became active, so it's true by construction there).
// `overrides` layers pending PATCH values on top of `row` (the currently-
// persisted campaign) — updateCampaign's PATCH may only send
// {status:'published'}, so every field here falls back to whatever's
// already saved, same "effective value" pattern as before.
// Returns an array of blocker messages — empty = ready to publish.
function getPublishBlockers(row, overrides = {}) {
  const blockers = [];

  const effectiveTitle = (overrides.title ?? row.title ?? '').trim();
  if (!effectiveTitle) blockers.push('Campaign title is required to publish');

  const effectiveSlug = (overrides.slug ?? row.slug ?? '').trim();
  if (!effectiveSlug) blockers.push('Campaign slug is required to publish');

  // MinimalDonationPageComponent never renders a hero image/video — this
  // check used to apply unconditionally, matching the client's OWN
  // pre-2026-09 gate but not the 2026-09-24 minimal-format exemption
  // (campaign-publish-step.component.ts#isMinimalFormat) that the client
  // side already got. Found while extracting this function: any minimal-
  // format campaign hitting the real publish PATCH would have been
  // rejected here even though its own Builder never asks for a hero at
  // all — fixed here since both the manual and auto-publish paths share
  // this function now.
  const effectiveLayout = overrides.layout ?? row.layout ?? {};
  const isMinimalFormat = effectiveLayout?.pageFormat === 'minimal';
  if (!isMinimalFormat) {
    const effectiveHeroType = overrides.hero_type ?? row.hero_type ?? 'image';
    const effectiveCoverImageUrl = overrides.cover_image_url ?? row.cover_image_url;
    const effectiveVideoUrl = overrides.video_url ?? row.video_url;
    const hasHero = effectiveHeroType === 'image' ? !!effectiveCoverImageUrl : !!effectiveVideoUrl;
    if (!hasHero) blockers.push('A hero image or video is required to publish');
  }

  const effectiveTargetAmount = overrides.target_amount ?? row.target_amount;
  if (!effectiveTargetAmount || Number(effectiveTargetAmount) <= 0) {
    blockers.push('A fundraising goal is required to publish');
  }

  const effectiveLifecycle = overrides.campaign_lifecycle ?? row.campaign_lifecycle ?? 'one-time';
  const effectiveStartDate = overrides.start_date ?? row.start_date;
  const effectiveEndDate = overrides.end_date ?? row.end_date;
  if (effectiveLifecycle !== 'ongoing' && effectiveStartDate && effectiveEndDate
      && new Date(effectiveEndDate) < new Date(effectiveStartDate)) {
    blockers.push('End date must be on or after the start date to publish');
  }

  return blockers;
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

    // טיוטה ללא כותרת נשארת ריקה בפועל — לא חוסמים יצירת קמפיין רק כי עדיין
    // לא מולאה כותרת (המשתמש עדיין "בבנייה" ויכול לנווט חופשי בין השלבים
    // בכל סדר, ר' DECISIONS.md), אבל אין סיבה לכתוב ערך פיקטיבי לעמודה —
    // ה-DB כבר מקבל '' (ברירת המחדל של העמודה עצמה), ואין דבר שדורש כאן ערך
    // אמת. כתיבת "קמפיין ללא כותרת" בעבר גרמה לכותרת הזו להיראות כאילו היא
    // אמיתית בכל מקום שקורא אותה — בשדה הכותרת עצמו, בצ'קליסט הפרסום, ואצל
    // CampaignAdvisorAgent (שדילג על הצעת כותרת כי חשב שכבר יש אחת). ר.
    // DEFAULT_TITLE למעלה — עדיין נשמר כתאימות-לאחור לקמפיינים ישנים שכבר
    // נשמרו עם הערך הזה, לא לשימוש חדש. See DECISIONS.md (2026-07-17).
    data.title = data.title || '';

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
            recurring_billing_mode,
            recurring_installments_count,

            rewards_enabled,

            rewards,
            sponsors,
            ambassadors,
            updates,

            blocks,
            layout,

            registration_field_label,
            registration_field_icon,

            campaign_lifecycle

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

            $33,$34,

            $35,

            $36,$37,$38,$39,

            $40,$41,

            $42,$43,

            $44

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

            data.recurring_billing_mode || 'until_cancelled',
            data.recurring_installments_count || 12,

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
            ),

            data.registration_field_label || null,
            data.registration_field_icon  || null,

            data.campaign_lifecycle || 'one-time'

          ]

        );

      const campaign = result.rows[0];
      await syncAmbassadors(campaign.id, data.ambassadors);
      await syncRegistrationOptions(campaign.id, data.registration_options);
      campaign.registration_options = await getRegistrationOptions(campaign.id);
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
| SYNC REGISTRATION OPTIONS (JSON draft array → registration_options table)
|--------------------------------------------------------------------------
| Delete-all + reinsert rather than a slug-style upsert (unlike
| syncAmbassadors above) — options have no natural business key to match on
| (the optional `key` field can be empty/duplicate), the array is small and
| edited by one admin, and existing registration_participants rows keep
| their own option_key/option_title snapshot regardless (ON DELETE SET NULL
| on registration_option_id), so re-numbering ids on every save is harmless.
| See docs/DECISIONS.md (2026-07-16).
*/

async function syncRegistrationOptions(campaignId, options) {
  if (options === undefined) return;

  await db.query('DELETE FROM registration_options WHERE campaign_id = $1', [campaignId]);

  if (!Array.isArray(options) || options.length === 0) return;

  for (let i = 0; i < options.length; i++) {
    const o = options[i];
    if (!o || !o.title || o.price == null) continue;
    await db.query(
      `INSERT INTO registration_options (campaign_id, key, title, description, price, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [campaignId, o.key || null, o.title, o.description || null, o.price, i]
    );
  }
}

async function getRegistrationOptions(campaignId) {
  const { rows } = await db.query(
    `SELECT id, key, title, description, price, sort_order
     FROM registration_options
     WHERE campaign_id = $1
     ORDER BY sort_order`,
    [campaignId]
  );
  return rows;
}

/*
|--------------------------------------------------------------------------
| GET MY CAMPAIGNS
|--------------------------------------------------------------------------
*/

exports.getMyCampaigns =
  async (userId, entityId) => {

    const params = [userId];
    let entityFilter = '';
    if (entityId) {
      params.push(entityId);
      entityFilter = `AND c.entity_id = $${params.length}`;
    }

    const result =
      await db.query(

        `
        SELECT

          c.*,

          e.display_name AS entity_name,
          e.logo_url AS entity_logo

        FROM campaigns c

        INNER JOIN entities e
          ON e.id = c.entity_id

        INNER JOIN user_entities ue
          ON ue.entity_id = e.id

        WHERE ue.user_id = $1
        AND c.deleted_at IS NULL
        ${entityFilter}

        ORDER BY c.created_at DESC
        `,

        params

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

        // e.logo_url/e.display_name added 2026-09-24 — only
        // getCampaignBySlugPublic joined these before, so the Builder (which
        // calls this one while editing, pre-publish) had no way to show the
        // entity's own logo at all; MinimalDonationPageComponent's "logo
        // defaults automatically to the entity's" only ever worked once a
        // campaign was actually published and fetched via the public route.
        `
        SELECT c.*, e.logo_url AS entity_logo, e.display_name AS entity_name

        FROM campaigns c

        INNER JOIN user_entities ue
          ON ue.entity_id = c.entity_id

        JOIN entities e
          ON e.id = c.entity_id

        WHERE c.id = $1
        AND ue.user_id = $2

        LIMIT 1
        `,

        [
          campaignId,
          userId
        ]

      );

    const campaign = result.rows[0] || null;
    if (campaign) {
      campaign.registration_options = await getRegistrationOptions(campaign.id);
    }
    return campaign;

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
        SELECT c.entity_id, c.is_locked, c.title, c.slug, c.cover_image_url, c.video_url,
               c.hero_type, c.target_amount, c.start_date, c.end_date, c.campaign_lifecycle,
               c.published_at, c.layout, e.status AS entity_status
        FROM campaigns c
        JOIN entities e ON e.id = c.entity_id
        WHERE c.id = $1
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

    // Server-side mirror of the frontend's own publish gate
    // (campaign-publish-step.component.ts#missingFields) — that check only
    // ever ran client-side, so a direct PATCH {status:'published'} could
    // publish a campaign missing a slug/hero/goal or with an invalid date
    // range. This PATCH-based publish call (campaign-api.service.ts#publish)
    // only ever sends {status:'published'}, never the whole draft, so each
    // field checked here falls back to whichever value is already saved in
    // the DB row fetched above. See DECISIONS.md (2026-08-02) for the
    // original title-only version of this backstop.
    if (data.status === 'published') {
      const row = campaignResult.rows[0];
      // The owning entity must be an approved, fundraising-eligible organization
      // (pending_review/draft/rejected/suspended entities can build and preview
      // a campaign, but may not take it public — see the matching gate already
      // in place for donation creation and public campaign visibility).
      if (row.entity_status !== 'active') {
        throw new Error('Entity is not approved to fundraise yet');
      }
      const blockers = getPublishBlockers(row, data);
      if (blockers.length) throw new Error(blockers[0]);
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

    if (campaignResult.rows[0].is_locked) {

      throw new Error(
        'Campaign is locked'
      );

    }

    // Slug immutability (2026-09-22) — once a campaign has ever been
    // published, its address is live: shared donor/ambassador links, past
    // communications, external listings. Settings' own UI already treats
    // this as a frozen product rule (readonly input with a "will break
    // shared links" warning) — this is that same rule enforced server-side,
    // so it holds regardless of which surface sends the update (the Builder's
    // slug field had no such guard at all until this fix). published_at is
    // the authoritative "has this campaign ever been published" signal
    // (set once via COALESCE, never cleared — see the UPDATE below), not
    // `status !== 'draft'`, which doesn't by itself mean "was published"
    // (e.g. changes_requested/suspended). Sending the SAME slug back
    // unchanged (the normal full-draft autosave shape) is explicitly not
    // a "change" and must keep working.
    if (
      campaignResult.rows[0].published_at &&
      data.slug !== undefined &&
      data.slug !== campaignResult.rows[0].slug
    ) {
      throw new Error('Cannot change slug after publishing');
    }

    // Category canonicalization (2026-09-23) — persistence is always an
    // ENTITY_CATEGORIES id (e.g. "health"), never the Hebrew label or
    // arbitrary free text; the label is presentation-only, looked up at
    // render time. Before this, the Builder/Settings could both write
    // whatever text a manager typed, and the public campaign page displayed
    // it raw -- discovered live when a real published campaign showed the
    // literal English id ("health") to donors instead of "בריאות". Blank/
    // null stays allowed (a campaign may have no category); an actual
    // attempt to set a non-blank value must match a real curated id.
    if (data.category !== undefined && data.category !== null && data.category !== '') {
      if (!isValidCategoryId(data.category)) {
        throw new Error('Invalid campaign category');
      }
    }

    // registration_options isn't a campaigns column — it's synced into its
    // own table separately, below.
    const registrationOptions = data.registration_options;
    data = { ...data };
    delete data.registration_options;

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
            ${data.status === 'published' ? 'published_at = COALESCE(published_at, NOW()),' : ''}

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
      await syncRegistrationOptions(campaignId, registrationOptions);
      campaign.registration_options = await getRegistrationOptions(campaignId);
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
        AND c.deleted_at IS NULL

        LIMIT 1
        `,

        [
          slug,
          userId
        ]

      );

    const campaign = result.rows[0] || null;
    if (campaign) {
      campaign.registration_options = await getRegistrationOptions(campaign.id);
    }
    return campaign;

  };

/*
|--------------------------------------------------------------------------
| GET CAMPAIGN BY SLUG — PUBLIC (no auth required)
|--------------------------------------------------------------------------
*/

exports.getCampaignBySlugPublic = async (slug) => {
  const result = await db.query(
    `SELECT c.*, e.display_name AS entity_name, e.logo_url AS entity_logo,
            e.ga_measurement_id AS entity_ga_measurement_id
     FROM campaigns c
     JOIN entities e ON e.id = c.entity_id
     WHERE c.slug = $1 AND c.status = 'published' AND e.status = 'active' AND c.deleted_at IS NULL
       AND c.is_hidden = false AND e.is_hidden = false
     LIMIT 1`,
    [slug]
  );
  const campaign = result.rows[0] || null;
  if (campaign) {
    // internal-only fields -- SELECT c.* pulls the whole row for the
    // legitimate reason that the public detail page renders most of it,
    // but these few are never meant to leave the server
    delete campaign.is_locked;
    delete campaign.is_featured;
    delete campaign.deleted_by;
    delete campaign.hidden_by_entity_cascade;
    campaign.registration_options = await getRegistrationOptions(campaign.id);
  }
  return campaign;
};

const DISCOVER_SORT_COLUMNS = {
  popular: 'c.supporters_count',
  ending_soon: 'c.end_date',
  newest: 'c.created_at',
};

exports.discoverCampaigns = async ({ search, category, sortBy, page = 0, limit = 12 }) => {
  const where = [`c.status = 'published'`, `e.status = 'active'`, `c.deleted_at IS NULL`, `c.is_hidden = false`, `e.is_hidden = false`];
  const params = [];
  let idx = 1;

  if (search) {
    where.push(`(c.title ILIKE $${idx} OR e.display_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (category) {
    where.push(`c.category = $${idx++}`);
    params.push(category);
  }

  const whereStr = `WHERE ${where.join(' AND ')}`;
  const sortCol = DISCOVER_SORT_COLUMNS[sortBy] || 'c.created_at';
  const sortOrd = sortBy === 'ending_soon' ? 'ASC NULLS LAST' : 'DESC';

  const [listRes, totalRes] = await Promise.all([
    db.query(
      `SELECT
         c.id, c.title, c.slug, c.short_description, c.category, c.cover_image_url, c.video_url,
         c.current_amount, c.target_amount, c.supporters_count, c.end_date, c.created_at,
         e.display_name AS entity_name, e.logo_url AS entity_logo
       FROM campaigns c
       JOIN entities e ON e.id = c.entity_id
       ${whereStr}
       ORDER BY ${sortCol} ${sortOrd}
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, page * limit]
    ),
    db.query(
      `SELECT COUNT(*)::int AS total FROM campaigns c JOIN entities e ON e.id = c.entity_id ${whereStr}`,
      params
    ),
  ]);

  return {
    campaigns: listRes.rows,
    total: totalRes.rows[0].total,
    page,
    limit,
  };
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
      `UPDATE campaigns SET is_hidden = $1, hidden_by_entity_cascade = false WHERE id = $2`,
      [isHidden, campaignId]
    );

  };

// Publication intent (2026-09-24) — deliberately NOT part of the generic
// updateCampaign/UPDATABLE_CAMPAIGN_COLUMNS path (same reasoning as
// setCampaignVisibility above: a dedicated endpoint for a dedicated action,
// not a client-writable content field). Records that the manager finished
// the campaign and asked to publish, but was blocked only by entity
// approval — the campaign itself stays exactly as it was (still 'draft',
// not publicly visible). COALESCE — first intent wins; revisiting this
// screen again later doesn't reset the original "when did they finish"
// timestamp.
exports.requestPublish = async ({ userId, campaignId }) => {
  const campaignResult = await db.query(
    `SELECT entity_id FROM campaigns WHERE id = $1 LIMIT 1`,
    [campaignId]
  );
  if (!campaignResult.rows.length) throw new Error('Campaign not found');

  const hasAccess = await validateOwnership(userId, campaignResult.rows[0].entity_id);
  if (!hasAccess) throw new Error('Unauthorized');

  const result = await db.query(
    `UPDATE campaigns SET publish_requested_at = COALESCE(publish_requested_at, NOW())
     WHERE id = $1 RETURNING publish_requested_at`,
    [campaignId]
  );
  return result.rows[0];
};

// Auto-publish on entity approval (2026-09-24) — called from
// platform.service.js#setStatus, inside its own entity-approval
// transaction, ONLY for the 'approve' action (never 'reactivate' — see
// that call site's own comment: a campaign resurfacing after a
// suspend→reactivate cycle must never auto-publish just because status
// flipped back to 'active'). `client` defaults to the shared pool but is
// meant to be passed the caller's own transaction client, so this
// participates in the SAME atomic transaction as the entity status change
// rather than being a separate, later, non-atomic step.
//
// Finds every campaign that finished setup and asked to publish while
// blocked only on entity approval, and re-validates each one against its
// CURRENT saved data — through the exact same getPublishBlockers() the
// manual publish path uses, never a bespoke/duplicated check — before
// actually publishing it. A campaign that's no longer valid (something
// changed since intent was expressed) is silently left as a draft; its
// publish_requested_at is deliberately NOT cleared, so it remains eligible
// if the entity's status changes again later (e.g. a future re-approval).
exports.publishRequestedCampaigns = async (entityId, client = db) => {
  const { rows } = await client.query(
    `SELECT id, title, slug, cover_image_url, video_url, hero_type,
            target_amount, start_date, end_date, campaign_lifecycle, layout, published_at
     FROM campaigns
     WHERE entity_id = $1 AND status = 'draft' AND publish_requested_at IS NOT NULL AND deleted_at IS NULL`,
    [entityId]
  );

  const publishedIds = [];
  for (const row of rows) {
    if (getPublishBlockers(row).length > 0) continue; // still not ready — leave as draft
    await client.query(
      `UPDATE campaigns SET status = 'published', published_at = COALESCE(published_at, NOW()), updated_at = NOW()
       WHERE id = $1`,
      [row.id]
    );
    publishedIds.push(row.id);
  }

  if (publishedIds.length) {
    require('../dashboard/dashboard.service').invalidateDashboard(entityId);
  }
  return publishedIds;
};

exports.updateMyAmbassadorRecord = async (userId, campaignId, data) => {
  const { rows: found } = await db.query(
    `SELECT a.id FROM campaign_ambassadors a
     WHERE a.campaign_id = $2
       AND a.email IS NOT NULL
       AND LOWER(a.email) = LOWER((SELECT email FROM users WHERE id = $1 LIMIT 1))
     LIMIT 1`,
    [userId, campaignId]
  );
  if (!found.length) throw new Error('Ambassador not found');
  const ambassadorId = found[0].id;

  const fields = [];
  const vals   = [];
  let   i      = 1;
  const allowed    = ['full_name','phone','email','goal_amount','personal_message','personal_title'];
  const notNullable = new Set(['full_name', 'personal_message']);
  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${i++}`);
      vals.push(data[key] === '' && !notNullable.has(key) ? null : data[key]);
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
     WHERE a.campaign_id = $2
       AND a.email IS NOT NULL
       AND LOWER(a.email) = LOWER((SELECT email FROM users WHERE id = $1 LIMIT 1))
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
    `SELECT c.id, c.title AS name, c.slug, c.cover_image_url, c.status,
            a.slug AS ambassador_slug, a.status AS ambassador_status,
            a.goal_amount AS personal_goal
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.email IS NOT NULL
       AND LOWER(a.email) = LOWER((SELECT email FROM users WHERE id = $1 LIMIT 1))
     ORDER BY c.title`,
    [userId]
  );
  return rows.map(r => ({
    id:               r.id,
    name:             r.name             || '',
    slug:             r.slug             || '',
    cover:            r.cover_image_url  ?? null,
    status:           r.status           || 'published',
    ambassadorSlug:   r.ambassador_slug  || '',
    ambassadorStatus: r.ambassador_status || 'active',
    personalGoal:     r.personal_goal != null ? Number(r.personal_goal) : null,
  }));
};

