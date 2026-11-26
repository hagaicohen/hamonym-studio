function validateCampaignSlug(value) {
  if (typeof value !== 'string' || !/^[\p{L}\p{N}][\p{L}\p{N}-]{1,68}[\p{L}\p{N}]$/u.test(value) || value.includes('--')) throw new Error('Invalid campaign slug');
  return value;
}
exports.validateCampaignSlug = validateCampaignSlug;

const db =
  require('../../db/db');

const { isEntityMember } =
  require('../../middleware/entity-permission.middleware');

const { isValidCategoryId } =
  require('./entity-categories');

const { validateContentI18n, publicContentI18n, hasContentI18nColumn, hasOptionUidColumn, cleanOptionUid } =
  require('./content-i18n');

// Reused only for the ambassador personal-link slug rules, so that the
// Ambassador Studio self-edit path (updateMyAmbassadorRecord) and the
// Campaign Builder draft path (syncAmbassadors) share exactly ONE
// normalization/validation implementation with the admin CRUD path
// (ambassadors.service.js#update) instead of drifting copies.
const { validateAndReserveSlug, normalizeSlugOrThrow } =
  require('../ambassadors/ambassadors.service');

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
  // Bilingual campaign content (migration 088) -- validated in updateCampaign.
  'content_i18n',
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
  'content_i18n',
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
    validateCampaignSlug(data.slug);

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

    // A registration still in 'draft' is not an organization yet: campaigns
    // (even campaign drafts) start once it is submitted (pending_review on).
    // Publication and donations keep their own approval/activation checks.
    const { rows: [entity] } = await db.query(
      'SELECT status FROM entities WHERE id = $1 AND deleted_at IS NULL',
      [data.entity_id]
    );
    if (!entity) throw new Error('Unauthorized');
    if (entity.status === 'draft') {
      const err = new Error('Organization registration is incomplete');
      err.code = 'ORGANIZATION_REGISTRATION_INCOMPLETE';
      throw err;
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

            // New campaigns are drafts; publication uses the existing guarded update path.
            'draft',
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

  // The Builder submits each ambassador's personal link straight from client
  // state, so it is run through the SAME canonical normalizer/validator as
  // every other write path (ambassadors.service.js#update,
  // #create, #selfRegister, updateMyAmbassadorRecord) before anything is
  // persisted or deleted. Without this, a draft save could store a raw
  // client string ("Gad Ivgi") that no other path would ever accept and that
  // would not resolve as a URL.
  //
  // The conflict rule differs only in scope, not in content: here the slug
  // IS the business key the upsert below matches an existing row on, so a
  // slug already held by this same campaign is the ambassador's own row
  // (the self-exclusion case), not a conflict. What must still be rejected
  // is two ambassadors in one submitted list claiming the same link — an
  // explicit choice that cannot be silently deduplicated.
  const seen = new Set();
  ambassadors = ambassadors.map(a => {
    if (!a || !a.slug) return a;
    const slug = normalizeSlugOrThrow(a.slug);
    if (seen.has(slug)) throw new Error('Slug taken');
    seen.add(slug);
    return { ...a, slug };
  });

  const incomingSlugs = ambassadors.map(a => a && a.slug).filter(Boolean);

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
| Preserve IDs by campaign-scoped ID/client_uid; update the existing records transactionally.
*/

async function syncRegistrationOptions(campaignId, options, transaction = null) {
  if (options === undefined) return;
  if (!Array.isArray(options)) throw new Error('Registration options must be an array');
  const withUid = await hasOptionUidColumn();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = new Set(), uids = new Set();
  for (const option of options) {
    if (!option || !String(option.title || '').trim() || !Number.isFinite(Number(option.price)) || Number(option.price) < 0) throw new Error('Invalid registration option title or price');
    if (option.id && ids.has(option.id)) throw new Error('Duplicate registration option ID');
    if (option.id) ids.add(option.id);
    const uid = cleanOptionUid(option.uid);
    if (uid && uids.has(uid)) throw new Error('Duplicate registration option identity');
    if (uid) uids.add(uid);
  }
  const client = transaction || await db.connect();
  try {
    if (!transaction) await client.query('BEGIN');
    await client.query('SELECT id FROM campaigns WHERE id=$1 FOR UPDATE', [campaignId]);
    const {rows} = await client.query(`SELECT id${withUid ? ', client_uid' : ''} FROM registration_options WHERE campaign_id=$1 FOR UPDATE`, [campaignId]);
    const kept = [];
    for (let i=0;i<options.length;i++) {
      const o=options[i], uid=cleanOptionUid(o.uid);
      const row=rows.find(row=>row.id===o.id || (withUid && uid && row.client_uid===uid));
      if(row && kept.includes(row.id)) throw new Error('Duplicate registration option identity');
      const values=[o.key || null,String(o.title).trim(),o.description || null,Number(o.price),i];
      if(row) {
        const uidSql=withUid ? ', client_uid=COALESCE($6,client_uid)' : '';
        const args=withUid ? [...values,uid,row.id,campaignId] : [...values,row.id,campaignId];
        await client.query(`UPDATE registration_options SET key=$1,title=$2,description=$3,price=$4,sort_order=$5${uidSql} WHERE id=$${args.length-1} AND campaign_id=$${args.length}`,args);
        kept.push(row.id);
      } else {
        const id=uuid.test(String(o.id||'')) ? o.id : require('crypto').randomUUID();
        const args=[id,campaignId,...values,...(withUid?[uid]:[])];
        await client.query(`INSERT INTO registration_options (id,campaign_id,key,title,description,price,sort_order${withUid?',client_uid':''}) VALUES (${args.map((_,i)=>'$'+(i+1)).join(',')})`,args);
        kept.push(id);
      }
    }
    await client.query('DELETE FROM registration_options WHERE campaign_id=$1 AND NOT (id=ANY($2::uuid[]))',[campaignId,kept]);
    if (!transaction) await client.query('COMMIT');
  } catch(error) {
    if (!transaction) await client.query('ROLLBACK');
    throw error;
  } finally { if (!transaction) client.release(); }
}

async function getRegistrationOptions(campaignId, transaction = null) {
  const uid = (await hasOptionUidColumn()) ? ', client_uid' : '';
  const { rows } = await (transaction || db).query(
    `SELECT id, key, title, description, price, sort_order${uid}
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

    if (data.slug !== undefined && data.slug !== campaignResult.rows[0].slug) validateCampaignSlug(data.slug);
    if (data.status === 'published') validateCampaignSlug(data.slug ?? campaignResult.rows[0].slug);

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

    // Bilingual campaign content (migration 088): shape and size checked here;
    // dropped (not failed) while the column does not exist yet, so the rest
    // of the save still goes through.
    if (data.content_i18n !== undefined) {
      if (await hasContentI18nColumn()) {
        data = { ...data, content_i18n: validateContentI18n(data.content_i18n) };
      } else {
        data = { ...data };
        delete data.content_i18n;
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

    const transaction = registrationOptions !== undefined ? await db.connect() : null;
    try {
      if(transaction)await transaction.query('BEGIN');

      const result =
        await (transaction || db).query(

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
      await syncRegistrationOptions(campaignId, registrationOptions, transaction);
      campaign.registration_options = await getRegistrationOptions(campaignId, transaction);
      if(transaction)await transaction.query('COMMIT');
      require('../dashboard/dashboard.service').invalidateDashboard(campaign.entity_id);
      return campaign;

    } catch (err) {
      if(transaction)await transaction.query('ROLLBACK');

      if (
        err.code === '23505'
      ) {

        throw new Error(
          'Campaign slug already exists'
        );

      }

      throw err;

    } finally { transaction?.release(); }

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
    // An English version that is not published never leaves the server.
    if ('content_i18n' in campaign) campaign.content_i18n = publicContentI18n(campaign.content_i18n);
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

  // The published English title/description (migration 088), never an unpublished one.
  const english = (await hasContentI18nColumn())
    ? `, CASE WHEN c.content_i18n->'en'->>'published' = 'true' THEN c.content_i18n->'en'->'values'->>'title' END AS title_en,
         CASE WHEN c.content_i18n->'en'->>'published' = 'true' THEN c.content_i18n->'en'->'values'->>'shortDescription' END AS short_description_en`
    : '';

  const [listRes, totalRes] = await Promise.all([
    db.query(
      `SELECT
         c.id, c.title, c.slug, c.short_description, c.category, c.cover_image_url, c.video_url,
         c.current_amount, c.target_amount, c.supporters_count, c.end_date, c.created_at,
         e.display_name AS entity_name, e.logo_url AS entity_logo${english}
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

    // deleted_at IS NULL (2026-09-24) — a soft-deleted campaign's slug is
    // no longer "taken"; matches the DB's own partial unique index
    // (campaigns_slug_unique_active, migration 069).
    let query =
      `SELECT 1 FROM campaigns WHERE slug = $1 AND deleted_at IS NULL`;

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

// Compatibility entry point: resolve an authenticated membership, never an email match.
async function myAmbassadorId(userId, campaignId) {
  const {rows}=await db.query('SELECT id FROM campaign_ambassadors WHERE campaign_id=$1 AND user_id::text=$2::text',[campaignId,userId]);
  if(rows.length!==1) throw new Error('Ambassador not found');
  return rows[0].id;
}
exports.updateMyAmbassadorRecord = async (userId,campaignId,data) =>
  require('../ambassadors/ambassadors.service').update(userId,await myAmbassadorId(userId,campaignId),data);
exports.myAmbassadorRecord = async (userId,campaignId) =>
  require('../ambassadors/ambassadors.service').getEditable(userId,await myAmbassadorId(userId,campaignId));

exports.myAmbassadorCampaigns = async (userId) => {
  const { rows } = await db.query(
    `SELECT c.id, a.id AS ambassador_id, c.title AS name, c.slug, c.cover_image_url, c.status,
            a.slug AS ambassador_slug, a.status AS ambassador_status,
            a.goal_amount AS personal_goal
     FROM campaign_ambassadors a
     JOIN campaigns c ON c.id = a.campaign_id
     WHERE a.user_id::text = $1::text AND c.deleted_at IS NULL
     ORDER BY c.title`,
    [userId]
  );
  return rows.map(r => ({
    id:               r.id,
    name:             r.name             || '',
    slug:             r.slug             || '',
    cover:            r.cover_image_url  ?? null,
    status:           r.status           || 'published',
    ambassadorId:     r.ambassador_id,
    ambassadorSlug:   r.ambassador_slug  || '',
    ambassadorStatus: r.ambassador_status || 'active',
    personalGoal:     r.personal_goal != null ? Number(r.personal_goal) : null,
  }));
};

