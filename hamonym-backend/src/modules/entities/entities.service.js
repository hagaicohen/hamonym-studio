const db =
  require('../../db/db');

const supabase =
  require('../../lib/supabase');

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

  e.*,
  ue.role,

  CASE
    WHEN eb.id IS NOT NULL
    THEN 'credit-card'
    ELSE NULL
  END AS billing_method,

  eb.provider AS billing_provider,

  eb.last4 AS billing_last4,

  eb.exp_month,
  eb.exp_year

FROM entities e

INNER JOIN user_entities ue
  ON ue.entity_id = e.id

LEFT JOIN entity_billing eb
  ON eb.entity_id = e.id
  AND eb.status = 'active'

WHERE ue.user_id = $1

ORDER BY e.created_at DESC
        `,

        [userId]

      );

    return result.rows;

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

    const ownershipResult =
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

    if (
      !ownershipResult.rows.length
    ) {

      throw new Error(
        'Unauthorized'
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

          updated_at = NOW()

        WHERE id = $28

        RETURNING *
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

          entityId

        ]

      );

    return result.rows[0];
  };

exports.getEntityById =
  async (entityId) => {

    const result =
      await db.query(

        `
        SELECT

          e.*,

          CASE
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

    return result.rows[0] || null;

  };