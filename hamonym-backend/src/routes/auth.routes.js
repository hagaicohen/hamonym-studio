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

const crypto =
  require('crypto');

const pool =
  require('../db/db');

const requireAuth =
  require('../middleware/require-auth');

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

      // Retroactively link any past guest donations made with this email —
      // so a donor who registers after donating immediately sees their history.
      await pool.query(
        `UPDATE donations
         SET donor_user_id = $1
         WHERE LOWER(donor_email) = LOWER($2) AND donor_user_id IS NULL`,
        [user.id, email]
      );

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

      const __loginT0 = Date.now();
      const __mark = (label) => console.log(`[LOGIN TIMING] ${label}: ${Date.now() - __loginT0}ms (total so far)`);
      console.log('[LOGIN TIMING] === request start ===');

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
      __mark('1) SELECT user');

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
      __mark('2) bcrypt.compare');

      if (!validPassword) {

        return res.status(401).json({
          error: 'Invalid credentials'
        });

      }

      if (user.deleted_at) {

        return res.status(403).json({
          error: 'Account not found'
        });

      }

      if (!user.is_active) {

        return res.status(403).json({
          error: 'Account disabled'
        });

      }

      // These three are independent of each other — run them together
      // instead of paying a separate network round trip for each in turn.
      const __sub = (label, promise) => {
        const t0 = Date.now();
        return promise.then((r) => { console.log(`[LOGIN TIMING]   - ${label}: ${Date.now() - t0}ms`); return r; });
      };
      const [, , entities] = await Promise.all([
        __sub('update last_login_at', pool.query(
          `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
          [user.id]
        )),
        // Catches donations made as a guest with this email since the last login.
        __sub('link guest donations', pool.query(
          `UPDATE donations
           SET donor_user_id = $1
           WHERE LOWER(donor_email) = LOWER($2) AND donor_user_id IS NULL`,
          [user.id, user.email]
        )),
        __sub('check user_entities', pool.query(
          `SELECT 1 FROM user_entities WHERE user_id = $1 LIMIT 1`,
          [user.id]
        )),
      ]);
      __mark('3) Promise.all(update last_login, link donations, check entities)');

      const hasEntities =
        entities.rows.length > 0;

      const token =
        jwt.sign(

          {
            userId: user.id,
            roleId: user.role_id,
            isSuperAdmin: user.is_super_admin,
            platformPermissions: user.platform_permissions || []
          },

          process.env.JWT_SECRET,

          {
            expiresIn: '7d'
          }

        );
      __mark('4) jwt.sign');
      console.log('[LOGIN TIMING] === request end, total:', Date.now() - __loginT0, 'ms ===');

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
            user.picture ?? null,

          is_super_admin:
            user.is_super_admin,

          platform_permissions:
            user.platform_permissions || []

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

/* RESET PASSWORD (consumes a link generated by a platform admin) */

router.post(
  '/reset-password',
  async (req, res) => {

    try {

      const { token, newPassword } = req.body;

      if (!token || !newPassword || newPassword.length < 8) {
        return res.status(400).json({ error: 'Invalid request' });
      }

      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

      const result = await pool.query(
        `SELECT id FROM users
         WHERE password_reset_token = $1
         AND password_reset_expires_at > NOW()
         AND deleted_at IS NULL
         LIMIT 1`,
        [tokenHash]
      );

      if (!result.rows.length) {
        return res.status(400).json({ error: 'Invalid or expired token' });
      }

      const passwordHash = await bcrypt.hash(newPassword, 10);

      await pool.query(
        `UPDATE users
         SET password_hash = $1, password_reset_token = NULL, password_reset_expires_at = NULL, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, result.rows[0].id]
      );

      res.json({ success: true });

    } catch (err) {

      console.error(err);

      res.status(500).json({
        error: 'Reset failed'
      });

    }

  }
);

/* UPDATE MY PROFILE (full name) */
router.patch('/me', requireAuth, async (req, res) => {
  try {
    const fullName = (req.body.full_name || '').trim();
    if (!fullName) {
      return res.status(400).json({ error: 'שם מלא נדרש' });
    }

    const result = await pool.query(
      `UPDATE users SET full_name = $1, updated_at = NOW() WHERE id = $2
       RETURNING id, email, full_name, role_id, picture, is_super_admin, platform_permissions`,
      [fullName, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בעדכון הפרופיל' });
  }
});

/* CHANGE MY PASSWORD — the JWT bearer token is already proof of identity
   (same trust level as every other self-service action in this app), so
   this doesn't re-ask for the current password. */
router.post('/me/change-password', requireAuth, async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'הסיסמה החדשה חייבת להכיל לפחות 8 תווים' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id`,
      [passwordHash, req.user.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'משתמש לא נמצא' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'שגיאה בעדכון הסיסמה' });
  }
});

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

      if (user.deleted_at) {

        return res.status(403).json({
          error: 'Account not found'
        });

      }

      if (!user.is_active) {

        return res.status(403).json({
          error: 'Account disabled'
        });

      }

      /* UPDATE LAST LOGIN + sync picture, and CHECK ENTITIES — independent, run together */

      const [, entities] = await Promise.all([
        pool.query(
          `UPDATE users
           SET last_login_at = NOW(),
               picture = COALESCE($2, picture)
           WHERE id = $1`,
          [user.id, picture]
        ),
        pool.query(
          `SELECT 1 FROM user_entities WHERE user_id = $1 LIMIT 1`,
          [user.id]
        ),
      ]);

      const hasEntities =
        entities.rows.length > 0;

      /* CREATE JWT */

      const token =
        jwt.sign(

          {

            userId:
              user.id,

            roleId:
              user.role_id,

            isSuperAdmin:
              user.is_super_admin,

            platformPermissions:
              user.platform_permissions || []

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
            user.picture ?? null,

          is_super_admin:
            user.is_super_admin,

          platform_permissions:
            user.platform_permissions || []

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