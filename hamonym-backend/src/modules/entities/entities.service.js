const db =
  require('../../db/db');

const supabase =
  require('../../lib/supabase');

const { isEntityMember } =
  require('../../middleware/entity-permission.middleware');

// entities.* / RETURNING * pull in raw document bytea blobs stored on the
// row (multi-MB PDFs) — fine for the upload/download endpoints that need
// them, but every other entity read only ever displays metadata (name,
// counts, etc). Sending the blobs as JSON byte arrays on those reads was
// bloating responses to 10+ MB and made pages feel like they'd hung.
const BLOB_COLUMNS = [
  'registration_document_data',
  'association_certificate_data',
  'tax_document_data',
  'logo_data',
];

function stripBlobs(row) {
  if (!row) return row;
  for (const col of BLOB_COLUMNS) delete row[col];
  return row;
}

exports.createEntity =
  async ({
    userId,
    data
  }) => {

    const client =
      await db.connect();

    try {

      await client.query('BEGIN');

      const entityResult =
        await client.query(

          `
            INSERT INTO entities (

              entity_type,
              legal_name,
              display_name,
              registration_number,

              email,
              phone,
              website,

              description,
              logo_url,

              onboarding_completed,
              onboarding_step,

              status,

              created_by_user_id,

              is_profile_complete,

              primary_category,
              secondary_categories,

              campaign_types,

              monthly_goal,
              yearly_goal,

              cardcom_terminal_number,
              cardcom_api_username,
              cardcom_api_password_encrypted,

              cardcom_connection_status,
              cardcom_last_verified_at,
              cardcom_last_error,

              contact_full_name,
              contact_phone,
              contact_email,

              association_certificate_url,
              association_certificate_name,

              tax_document_url,
              tax_document_name

            )

            VALUES (

              $1,$2,$3,$4,
              $5,$6,$7,
              $8,$9,
              $10,$11,
              $12,
              $13,
              $14,
              $15,$16,
              $17::text[],

              $18,$19,

              $20,$21,$22,

              $23,$24,$25,

              $26,$27,$28,

              $29,$30,

              $31,$32

            )

            RETURNING *
          `,

          [

            // =========================
            // BASIC
            // =========================

            data.entity_type,

            data.legal_name,

            data.display_name,

            data.registration_number,

            data.email,

            data.phone,

            data.website,

            data.description,

            data.logo_url,

            true,

            6,

            data.is_profile_complete
              ? 'pending_review'
              : 'draft',

            userId,

            data.is_profile_complete || false,

            data.primary_category,

            data.secondary_categories || [],

            data.campaign_types || [],

            // =========================
            // GOALS
            // =========================

            data.monthly_goal,

            data.yearly_goal,

            // =========================
            // CARDCOM
            // =========================

            data.cardcom_terminal_number,

            data.cardcom_api_username,

            data.cardcom_api_password_encrypted,

            data.cardcom_connection_status || 'not_tested',

            null,

            null,

            // =========================
            // CONTACT
            // =========================

            data.contact_full_name,

            data.contact_phone,

            data.contact_email,

            // =========================
            // DOCUMENTS
            // =========================

            data.association_certificate_url,

            data.association_certificate_name,

            data.tax_document_url,

            data.tax_document_name

          ]

        );

      const entity =
        entityResult.rows[0];

      await client.query(

        `
        INSERT INTO user_entities (

          user_id,
          entity_id,
          role

        )

        VALUES ($1, $2, $3)
        `,

        [

          userId,

          entity.id,

          'owner'

        ]

      );

      await client.query('COMMIT');

      return entity;

    } catch (err) {

      await client.query('ROLLBACK');

      throw err;

    } finally {

      client.release();

    }

};

exports.getMyEntities =
  async (userId) => {

    const result =
      await db.query(

        `
        SELECT

          e.id, e.entity_type, e.display_name, e.legal_name, e.registration_number, e.description,
          e.logo_url, e.website, e.city, e.address, e.contact_full_name, e.contact_email, e.contact_phone,
          e.cardcom_terminal_number, e.cardcom_api_username, e.cardcom_api_password_encrypted,
          e.cardcom_clearing_company, e.cardcom_invoice_name, e.cardcom_invoice_email, e.cardcom_is_production,
          e.cardcom_connection_status, e.cardcom_last_verified_at, e.cardcom_last_error,
          e.association_certificate_url, e.bank_document_url, e.identity_document_url, e.tax_document_url,
          e.requires_completion, e.missing_fields, e.onboarding_completed_at, e.created_by_user_id,
          e.created_at, e.updated_at, e.created_by, e.status, e.is_profile_complete, e.type, e.email, e.phone,
          e.onboarding_completed, e.onboarding_step, e.association_certificate_name, e.tax_document_name,
          e.primary_category, e.secondary_categories, e.registration_document_name, e.registration_document_mime,
          e.association_certificate_mime, e.tax_document_mime, e.logo_mime, e.campaign_types, e.monthly_goal,
          e.yearly_goal, e.billing_method, e.billing_masav_file_name, e.cardcom_terminal, e.cardcom_api_name,
          e.cardcom_api_password, e.ga_measurement_id, e.deleted_at, e.deleted_by, e.is_hidden,
          ue.role,

          CASE

            WHEN e.billing_method = 'masav'
            THEN 'masav'

            WHEN eb.id IS NOT NULL
            THEN 'credit-card'

            ELSE NULL

          END AS billing_method,

          eb.provider AS billing_provider,

          eb.last4 AS billing_last4,

          eb.exp_month,
          eb.exp_year,

          (SELECT COUNT(*)::int FROM campaigns c
            WHERE c.entity_id = e.id AND c.deleted_at IS NULL) AS "campaignsCount",

          (SELECT COUNT(*)::int FROM user_entities ue2
            WHERE ue2.entity_id = e.id) AS "usersCount"

        FROM entities e

        INNER JOIN user_entities ue
          ON ue.entity_id = e.id

        LEFT JOIN entity_billing eb
          ON eb.entity_id = e.id
          AND eb.status = 'active'

        WHERE ue.user_id = $1
          AND e.deleted_at IS NULL

        ORDER BY e.created_at DESC
        `,

        [userId]

      );

    return result.rows.map(stripBlobs);

  };

exports.uploadAssociationDocument =
  async ({
    entityId,
    file
  }) => {

    const result =
      await db.query(

        `
        UPDATE entities
        SET

          association_certificate_name = $1,

          association_certificate_mime = $2,

          association_certificate_data = $3

        WHERE id = $4

        RETURNING id
        `,

        [

          file.originalname,

          file.mimetype,

          file.buffer,

          entityId

        ]

      );

    return result.rows[0];

  };

exports.uploadTaxDocument =
  async ({
    entityId,
    file
  }) => {

    const result =
      await db.query(

        `
        UPDATE entities
        SET

          tax_document_name = $1,

          tax_document_mime = $2,

          tax_document_data = $3

        WHERE id = $4

        RETURNING id
        `,

        [

          file.originalname,

          file.mimetype,

          file.buffer,

          entityId

        ]

      );

    return result.rows[0];

  };

exports.getAssociationDocument =
  async (entityId) => {

    const result =
      await db.query(

        `
        SELECT

          association_certificate_name,

          association_certificate_mime,

          association_certificate_data

        FROM entities

        WHERE id = $1
        `,

        [entityId]

      );

    return result.rows[0];

  };

exports.getTaxDocument =
  async (entityId) => {

    const result =
      await db.query(

        `
        SELECT

          tax_document_name,

          tax_document_mime,

          tax_document_data

        FROM entities

        WHERE id = $1
        `,

        [entityId]

      );

    return result.rows[0];

  };

// Metadata only (name/mime, no bytea data) — for callers that only need to
// know whether a document was uploaded, not download it. getAssociationDocument/
// getTaxDocument above stay as-is since entities.controller.js's download
// routes need the real bytes.
exports.getAssociationDocumentMeta = async (entityId) => {
  const { rows } = await db.query(
    `SELECT association_certificate_name, association_certificate_mime,
            (association_certificate_data IS NOT NULL) AS has_data
     FROM entities WHERE id = $1`,
    [entityId]
  );
  return rows[0];
};

exports.getTaxDocumentMeta = async (entityId) => {
  const { rows } = await db.query(
    `SELECT tax_document_name, tax_document_mime,
            (tax_document_data IS NOT NULL) AS has_data
     FROM entities WHERE id = $1`,
    [entityId]
  );
  return rows[0];
};

/*exports.uploadLogo =
  async ({
    entityId,
    file
  }) => {

    const logoUrl =
      `/api/entities/${entityId}/logo`;

    const result =
      await db.query(

        `
        UPDATE entities
        SET

          logo_url = $1,

          logo_mime = $2,

          logo_data = $3

        WHERE id = $4

        RETURNING
        id,
        logo_url
        `,

        [

          logoUrl,

          file.mimetype,

          file.buffer,

          entityId

        ]

      );

    return result.rows[0];

};*/

exports.uploadLogo =
  async ({
    entityId,
    file
  }) => {

    const extension =
      file.originalname
        .split('.')
        .pop();

    const filePath =
      `entities/${entityId}/logo-${Date.now()}.${extension}`;

    const {
      error
    } = await supabase
      .storage
      .from('media')
      .upload(

        filePath,

        file.buffer,

        {

          contentType:
            file.mimetype,

          upsert: true

        }

      );

    if (error) {
      throw error;
    }

    const {
      data
    } = supabase
      .storage
      .from('media')
      .getPublicUrl(
        filePath
      );

    const result =
      await db.query(

        `
        UPDATE entities

        SET
          logo_url = $1

        WHERE id = $2

        RETURNING
          id,
          logo_url
        `,

        [

          data.publicUrl,

          entityId

        ]

      );

    return result.rows[0];

};

/*exports.getLogo =
  async (entityId) => {

    const result =
      await db.query(

        `
        SELECT

          logo_mime,
          logo_data

        FROM entities

        WHERE id = $1
        `,

        [

          entityId

        ]

      );

    return result.rows[0];

};*/

exports.updateEntity =
  async ({
    entityId,
    userId,
    data
  }) => {

    // =====================================================
    // OWNERSHIP CHECK
    // =====================================================

    if (!(await isEntityMember(userId, entityId))) {
      throw new Error('Unauthorized');
    }

    /*
    |--------------------------------------------------------------------------
    | SWITCH TO MASAV
    | DISABLE ACTIVE CREDIT CARDS
    |--------------------------------------------------------------------------
    */

    if (
      data.billing_method === 'masav'
    ) {

      await db.query(

        `
        UPDATE entity_billing

        SET status = 'inactive'

        WHERE entity_id = $1
        `,

        [entityId]

      );

    }

    // =====================================================
    // UPDATE
    // =====================================================

    const result =
      await db.query(

        `
        UPDATE entities

        SET

          display_name = $1,
          legal_name = $2,
          registration_number = $3,

          email = $4,
          phone = $5,

          website = $6,
          description = $7,

          city = $8,
          address = $9,

          primary_category = $10,
          secondary_categories = $11::text[],
          campaign_types = $12::text[],

          monthly_goal = $13,
          yearly_goal = $14,

          cardcom_terminal_number = $15,
          cardcom_api_username = $16,
          cardcom_api_password_encrypted = $17,

          cardcom_clearing_company = $18,
          cardcom_invoice_name = $19,
          cardcom_invoice_email = $20,
          cardcom_is_production = $21,

          cardcom_connection_status = $22,
          cardcom_last_verified_at = $23,
          cardcom_last_error = $24,

          contact_full_name = $25,
          contact_phone = $26,
          contact_email = $27,

          billing_method = $28,
          billing_masav_file_name = $29,

          ga_measurement_id = $30,

          updated_at = NOW()

        WHERE id = $31

        RETURNING
          id, entity_type, display_name, legal_name, registration_number, description,
          logo_url, website, city, address, contact_full_name, contact_email, contact_phone,
          cardcom_terminal_number, cardcom_api_username, cardcom_api_password_encrypted,
          cardcom_clearing_company, cardcom_invoice_name, cardcom_invoice_email, cardcom_is_production,
          cardcom_connection_status, cardcom_last_verified_at, cardcom_last_error,
          association_certificate_url, bank_document_url, identity_document_url, tax_document_url,
          requires_completion, missing_fields, onboarding_completed_at, created_by_user_id,
          created_at, updated_at, created_by, status, is_profile_complete, type, email, phone,
          onboarding_completed, onboarding_step, association_certificate_name, tax_document_name,
          primary_category, secondary_categories, registration_document_name, registration_document_mime,
          association_certificate_mime, tax_document_mime, logo_mime, campaign_types, monthly_goal,
          yearly_goal, billing_method, billing_masav_file_name, cardcom_terminal, cardcom_api_name,
          cardcom_api_password, ga_measurement_id, deleted_at, deleted_by, is_hidden
        `,

        [

          data.display_name,
          data.legal_name,
          data.registration_number,

          data.email,
          data.phone,

          data.website,
          data.description,

          data.city,
          data.address,

          data.primary_category,
          data.secondary_categories || [],
          data.campaign_types || [],

          data.monthly_goal,
          data.yearly_goal,

          data.cardcom_terminal_number,
          data.cardcom_api_username,
          data.cardcom_api_password_encrypted,

          data.cardcom_clearing_company,
          data.cardcom_invoice_name,
          data.cardcom_invoice_email,
          data.cardcom_is_production || false,

          data.cardcom_connection_status,
          data.cardcom_last_verified_at,
          data.cardcom_last_error,

          data.contact_full_name,
          data.contact_phone,
          data.contact_email,

          data.billing_method,

          data.billing_masav_file_name,

          data.ga_measurement_id || null,

          entityId

        ]

      );

    return stripBlobs(result.rows[0]);

  };

exports.getEntityById =
  async (entityId) => {

    const result =
      await db.query(

        `
        SELECT

          e.id, e.entity_type, e.display_name, e.legal_name, e.registration_number, e.description,
          e.logo_url, e.website, e.city, e.address, e.contact_full_name, e.contact_email, e.contact_phone,
          e.cardcom_terminal_number, e.cardcom_api_username, e.cardcom_api_password_encrypted,
          e.cardcom_clearing_company, e.cardcom_invoice_name, e.cardcom_invoice_email, e.cardcom_is_production,
          e.cardcom_connection_status, e.cardcom_last_verified_at, e.cardcom_last_error,
          e.association_certificate_url, e.bank_document_url, e.identity_document_url, e.tax_document_url,
          e.requires_completion, e.missing_fields, e.onboarding_completed_at, e.created_by_user_id,
          e.created_at, e.updated_at, e.created_by, e.status, e.is_profile_complete, e.type, e.email, e.phone,
          e.onboarding_completed, e.onboarding_step, e.association_certificate_name, e.tax_document_name,
          e.primary_category, e.secondary_categories, e.registration_document_name, e.registration_document_mime,
          e.association_certificate_mime, e.tax_document_mime, e.logo_mime, e.campaign_types, e.monthly_goal,
          e.yearly_goal, e.billing_method, e.billing_masav_file_name, e.cardcom_terminal, e.cardcom_api_name,
          e.cardcom_api_password, e.ga_measurement_id, e.deleted_at, e.deleted_by, e.is_hidden,

          CASE

            WHEN e.billing_method = 'masav'
            THEN 'masav'

            WHEN eb.id IS NOT NULL
            THEN 'credit-card'

            ELSE NULL

          END AS billing_method,

          eb.provider AS billing_provider,

          eb.last4 AS billing_last4,

          eb.card_holder_name,

          eb.exp_month,

          eb.exp_year

        FROM entities e

        LEFT JOIN entity_billing eb
          ON eb.entity_id = e.id
          AND eb.status = 'active'

        WHERE e.id = $1

        ORDER BY eb.created_at DESC

        LIMIT 1
        `,

        [entityId]

      );

    return stripBlobs(result.rows[0]) || null;

  };

  exports.removeTaxDocument =
  async (entityId) => {

    const result =
      await db.query(

        `
        UPDATE entities

        SET

          tax_document_name = NULL,

          tax_document_mime = NULL,

          tax_document_data = NULL

        WHERE id = $1

        RETURNING id
        `,

        [

          entityId

        ]

      );

    return result.rows[0];

  };

exports.removeAssociationDocument =
  async (entityId) => {

    const result =
      await db.query(

        `
        UPDATE entities

        SET

          association_certificate_name = NULL,

          association_certificate_mime = NULL,

          association_certificate_data = NULL

        WHERE id = $1

        RETURNING id
        `,

        [ entityId ]

      );

    return result.rows[0];

  };

async function checkOwnership(userId, entityId) {
  if (!(await isEntityMember(userId, entityId))) throw new Error('Unauthorized');
}

exports.getApprovalStatus = async (entityId, userId) => {
  await checkOwnership(userId, entityId);

  const [entityRes, auditRes] = await Promise.all([
    db.query(`SELECT status, updated_at FROM entities WHERE id = $1`, [entityId]),
    db.query(
      `SELECT a.action, a.notes, a.reason_tags, a.created_at, u.full_name AS actor_name
       FROM platform_audit_log a
       JOIN users u ON u.id = a.super_admin_user_id
       WHERE a.entity_id = $1
       ORDER BY a.created_at DESC
       LIMIT 1`,
      [entityId]
    ),
  ]);

  const entity = entityRes.rows[0];
  const audit = auditRes.rows[0];

  return {
    status: entity.status,
    updatedAt: audit?.created_at ?? entity.updated_at,
    comment: audit?.notes ?? null,
    reasonTags: audit?.reason_tags ?? [],
    actionBy: audit?.actor_name ?? null,
  };
};

exports.requestReview = async (entityId, userId) => {
  await checkOwnership(userId, entityId);

  const result = await db.query(
    `UPDATE entities SET status = 'pending_review', updated_at = NOW()
     WHERE id = $1 AND status = 'changes_requested'
     RETURNING
       id, entity_type, display_name, legal_name, registration_number, description,
       logo_url, website, city, address, contact_full_name, contact_email, contact_phone,
       cardcom_terminal_number, cardcom_api_username, cardcom_api_password_encrypted,
       cardcom_clearing_company, cardcom_invoice_name, cardcom_invoice_email, cardcom_is_production,
       cardcom_connection_status, cardcom_last_verified_at, cardcom_last_error,
       association_certificate_url, bank_document_url, identity_document_url, tax_document_url,
       requires_completion, missing_fields, onboarding_completed_at, created_by_user_id,
       created_at, updated_at, created_by, status, is_profile_complete, type, email, phone,
       onboarding_completed, onboarding_step, association_certificate_name, tax_document_name,
       primary_category, secondary_categories, registration_document_name, registration_document_mime,
       association_certificate_mime, tax_document_mime, logo_mime, campaign_types, monthly_goal,
       yearly_goal, billing_method, billing_masav_file_name, cardcom_terminal, cardcom_api_name,
       cardcom_api_password, ga_measurement_id, deleted_at, deleted_by, is_hidden`,
    [entityId]
  );

  if (!result.rows[0]) throw new Error('Invalid transition');
  return stripBlobs(result.rows[0]);
};

// Entity manager's own "delete entity" — soft delete. All the entity's
// campaigns get soft-deleted too (same deleted_at pattern campaigns already
// use), so they immediately drop out of every public/discover query. The
// entity itself also flips to status='deleted', which independently drops
// it out of the public campaign/donation queries that filter on
// e.status = 'active'. Permanent removal is a platform-admin-only action
// (see platform.service.js hardDeleteEntity).
exports.softDeleteEntity = async (entityId, userId) => {
  await checkOwnership(userId, entityId);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE entities SET deleted_at = NOW(), deleted_by = $1, status = 'deleted', updated_at = NOW()
       WHERE id = $2 AND deleted_at IS NULL
       RETURNING id, display_name`,
      [userId, entityId]
    );
    if (!result.rows[0]) throw new Error('Entity not found or already deleted');

    await client.query(
      `UPDATE campaigns SET deleted_at = NOW(), deleted_by = $1, updated_at = NOW()
       WHERE entity_id = $2 AND deleted_at IS NULL`,
      [userId, entityId]
    );

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Entity manager's own reversible "hide entity" toggle. Hiding cascades to
// hide every campaign under it too (mirrors campaigns' own setVisibility)
// so nothing under a hidden entity stays publicly reachable. Only campaigns
// that were visible at that moment are marked hidden_by_entity_cascade, so
// unhiding the entity can restore exactly those — a campaign already hidden
// independently before the entity was hidden stays hidden, since restoring
// it on entity-unhide would surprise-publish it.
exports.setEntityVisibility = async (entityId, userId, isHidden) => {
  await checkOwnership(userId, entityId);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE entities SET is_hidden = $1, updated_at = NOW() WHERE id = $2 RETURNING id, display_name, is_hidden`,
      [isHidden, entityId]
    );
    if (!result.rows[0]) throw new Error('Entity not found');

    if (isHidden) {
      await client.query(
        `UPDATE campaigns SET is_hidden = true, hidden_by_entity_cascade = true, updated_at = NOW()
         WHERE entity_id = $1 AND deleted_at IS NULL AND is_hidden = false`,
        [entityId]
      );
    } else {
      await client.query(
        `UPDATE campaigns SET is_hidden = false, hidden_by_entity_cascade = false, updated_at = NOW()
         WHERE entity_id = $1 AND deleted_at IS NULL AND hidden_by_entity_cascade = true`,
        [entityId]
      );
    }

    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};