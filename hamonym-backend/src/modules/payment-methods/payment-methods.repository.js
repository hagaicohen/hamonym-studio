const pool =
  require('../../db/db');

exports.getByEntityId =
  async (entityId) => {

    const query = `

      SELECT

        id,
        provider,
        card_brand,
        last4,
        exp_month,
        exp_year,
        card_holder_name,
        status,
        created_at

      FROM entity_payment_methods

      WHERE entity_id = $1

      AND status = 'active'

      ORDER BY created_at DESC

      LIMIT 1

    `;

    const result =
      await pool.query(query, [entityId]);

    return result.rows[0] || null;

  };

exports.create =
  async (data) => {

    const query = `

      INSERT INTO entity_payment_methods (

        entity_id,
        provider,
        token,
        card_brand,
        last4,
        exp_month,
        exp_year,
        card_holder_name,
        is_default,
        status

      )

      VALUES (

        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        true,
        'active'

      )

      RETURNING
        id,
        provider,
        card_brand,
        last4,
        exp_month,
        exp_year,
        card_holder_name,
        status,
        created_at

    `;

    const values = [

      data.entity_id,

      data.provider || 'cardcom',

      data.token,

      data.card_brand,

      data.last4,

      data.exp_month,

      data.exp_year,

      data.card_holder_name

    ];

    const result =
      await pool.query(query, values);

    return result.rows[0];

  };

exports.remove =
  async (id) => {

    const query = `

      UPDATE entity_payment_methods

      SET
        status = 'deleted',
        updated_at = NOW()

      WHERE id = $1

    `;

    await pool.query(query, [id]);

  };