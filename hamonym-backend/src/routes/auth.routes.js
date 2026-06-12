const {
  OAuth2Client
} = require(
  'google-auth-library'
);

const googleClient =
  new OAuth2Client(
    process.env.GOOGLE_CLIENT_ID
  );

const express =
  require('express');

const bcrypt =
  require('bcrypt');

const jwt =
  require('jsonwebtoken');

const pool =
  require('../db/db');

const router =
  express.Router();

/* REGISTER */

router.post(
  '/register',
  async (req, res) => {

    try {

      const {
        email,
        password,
        full_name
      } = req.body;

      if (!email || !password) {

        return res.status(400).json({
          error: 'Missing fields'
        });

      }

      const existingUser =
        await pool.query(

          `
          SELECT id
          FROM users
          WHERE LOWER(email) = LOWER($1)
          `,

          [email]

        );

      if (
        existingUser.rows.length > 0
      ) {

        return res.status(409).json({
          error: 'Email already exists'
        });

      }

      const passwordHash =
        await bcrypt.hash(
          password,
          10
        );

      const result =
        await pool.query(

          `
          INSERT INTO users (

            role_id,
            email,
            password_hash,
            full_name

          )

          VALUES (
            $1,
            $2,
            $3,
            $4
          )

          RETURNING
            id,
            email,
            full_name
          `,

          [
            1,
            email,
            passwordHash,
            full_name || null
          ]

        );

      const user =
        result.rows[0];

      const token =
        jwt.sign(

          {
            userId: user.id
          },

          process.env.JWT_SECRET,

          {
            expiresIn: '7d'
          }

        );

      res.json({
        token,
        user,
        hasEntities: false
      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: 'Register failed'
      });

    }

  }
);

/* LOGIN */

router.post(
  '/login',
  async (req, res) => {

    try {

      const {
        email,
        password
      } = req.body;

      const result =
        await pool.query(

          `
          SELECT *
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,

          [email]

        );

      if (
        result.rows.length === 0
      ) {

        return res.status(401).json({
          error: 'Invalid credentials'
        });

      }

      const user =
        result.rows[0];

      const validPassword =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!validPassword) {

        return res.status(401).json({
          error: 'Invalid credentials'
        });

      }

      await pool.query(

        `
        UPDATE users
        SET last_login_at = NOW()
        WHERE id = $1
        `,

        [user.id]

      );

      const entities =
        await pool.query(

          `
          SELECT 1
          FROM user_entities
          WHERE user_id = $1
          LIMIT 1
          `,

          [user.id]

        );

      const hasEntities =
        entities.rows.length > 0;

      const token =
        jwt.sign(

          {
            userId: user.id,
            roleId: user.role_id
          },

          process.env.JWT_SECRET,

          {
            expiresIn: '7d'
          }

        );

      res.json({

        token,

        user: {

          id:
            user.id,

          email:
            user.email,

          full_name:
            user.full_name,

          role_id:
            user.role_id,

          picture:
            user.picture ?? null

        },

        hasEntities

      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: 'Login failed'
      });

    }

  }
);

/* GOOGLE LOGIN */

router.post(
  '/google',
  async (req, res) => {

    try {

      const {
        credential
      } = req.body;

      if (!credential) {

        return res.status(400).json({
          error: 'Missing credential'
        });

      }

      const ticket =
        await googleClient.verifyIdToken({

          idToken:
            credential,

          audience:
            process.env.GOOGLE_CLIENT_ID

        });

      const payload =
        ticket.getPayload();

      const email =
        payload.email;

      const fullName =
        payload.name;

      const googleId =
        payload.sub;

      const picture =
        payload.picture ?? null;

      let userResult =
        await pool.query(

          `
          SELECT *
          FROM users
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,

          [email]

        );

      let user =
        userResult.rows[0];

      /* CREATE USER */

      if (!user) {

        const createdUser =
          await pool.query(

            `
            INSERT INTO users (

              role_id,
              email,
              full_name,
              google_id,
              picture

            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              $5
            )

            RETURNING *
            `,

            [
              1,
              email,
              fullName,
              googleId,
              picture
            ]

          );

        user =
          createdUser.rows[0];

      }

      /* UPDATE LAST LOGIN + sync picture */

      await pool.query(

        `
        UPDATE users
        SET last_login_at = NOW(),
            picture = COALESCE($2, picture)
        WHERE id = $1
        `,

        [user.id, picture]

      );

      /* CHECK ENTITIES */

      const entities =
        await pool.query(

          `
          SELECT 1
          FROM user_entities
          WHERE user_id = $1
          LIMIT 1
          `,

          [user.id]

        );

      const hasEntities =
        entities.rows.length > 0;

      /* CREATE JWT */

      const token =
        jwt.sign(

          {

            userId:
              user.id,

            roleId:
              user.role_id

          },

          process.env.JWT_SECRET,

          {

            expiresIn:
              '7d'

          }

        );

      res.json({

        token,

        user: {

          id:
            user.id,

          email:
            user.email,

          full_name:
            user.full_name,

          role_id:
            user.role_id,

          picture:
            user.picture ?? null

        },

        hasEntities

      });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: 'Google login failed'
      });

    }

  }
);

module.exports =
  router;