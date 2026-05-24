// billing.repository.js

const pool =
  require('../../db/db');

/* =========================================
   GET ACTIVE BILLING
========================================= */

exports.getByEntityId =
  async (entityId) => {

    const query = `

      SELECT

        id,
        provider,
        last4,
        exp_month,
        exp_year,
        card_holder_name,
        status,
        created_at

      FROM entity_billing

      WHERE entity_id = $1

      AND status = 'active'

      ORDER BY created_at DESC

      LIMIT 1

    `;

    const result =
      await pool.query(
        query,
        [entityId]
      );

    return result.rows[0] || null;

  };

/* =========================================
   CREATE BILLING
========================================= */

exports.create =
  async (data) => {

    console.log(
      'CREATE BILLING START',
      data
    );

    const query = `

      INSERT INTO entity_billing (

        entity_id,
        provider,
        token,
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
        true,
        'active'

      )

      RETURNING

        id,
        provider,
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

      data.last4,

      data.exp_month,

      data.exp_year,

      data.card_holder_name

    ];

    console.log(
      'CREATE VALUES',
      values
    );

    const result =
      await pool.query(
        query,
        values
      );

    console.log(
      'NEW BILLING CREATED',
      result.rows[0]
    );

    return result.rows[0];

  };

/* =========================================
   REMOVE BILLING
========================================= */

exports.remove =
  async (id) => {

    const query = `

      UPDATE entity_billing

      SET
        status = 'deleted',
        updated_at = NOW()

      WHERE id = $1

    `;

    await pool.query(
      query,
      [id]
    );

  };

/* =========================================
   DEACTIVATE ENTITY BILLING
========================================= */

exports.deactivateEntityBilling =
  async (entityId) => {

    const query = `

      UPDATE entity_billing

      SET
        is_default = false,
        status = 'replaced',
        updated_at = NOW()

      WHERE entity_id = $1
      AND is_default = true

      RETURNING id

    `;

    const result =
      await pool.query(

        query,

        [entityId]

      );

    console.log(
      'DEACTIVATED BILLINGS',
      result.rows
    );

  };