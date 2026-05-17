const db =
  require('../../db/db');

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

                    contact_full_name,
                    contact_phone,
                    contact_email,

                    association_certificate_url,
                    association_certificate_name,

                    tax_document_url,
                    tax_document_name
                  )
          VALUES (

            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17::text[],$18,
            $19,$20,$21,$22,$23,$24

          )
          RETURNING *
          `,

          [

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

            data.contact_full_name,

            data.contact_phone,

            data.contact_email,

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
          ue.role

        FROM entities e

        INNER JOIN user_entities ue
          ON ue.entity_id = e.id

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

    console.log(file);
    console.log(file.buffer.length);

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

exports.uploadLogo =
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

        RETURNING id
        `,

        [

          logoUrl,

          file.mimetype,

          file.buffer,

          entityId

        ]

      );

    return result.rows[0];

};

exports.getLogo =
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

  };