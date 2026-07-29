const crypto = require('crypto');
const db = require('../../db/db');
const emailService = require('../email/email.service');

// Phase 4 — Partner Management, Epic 3 (Invite). Raw token + SHA-256 hash,
// same pattern as users.password_reset_token / platform.service.js's
// createAdminUser — kept as its own table (not a users column) because one
// user can hold multiple concurrent invites to different Partner entities.

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

exports.createInvite = async (invitedByUserId, entityId, email) => {
  const cleanEmail = (email || '').trim().toLowerCase();
  if (!cleanEmail) {
    const err = new Error('Email is required');
    err.status = 400;
    throw err;
  }

  const entityRes = await db.query(`SELECT display_name FROM entities WHERE id = $1 AND deleted_at IS NULL`, [entityId]);
  if (!entityRes.rows.length) {
    const err = new Error('Entity not found');
    err.status = 404;
    throw err;
  }
  const entityName = entityRes.rows[0].display_name;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  await db.query(
    `INSERT INTO partner_invites (entity_id, email, token_hash, invited_by_user_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [entityId, cleanEmail, tokenHash, invitedByUserId, expiresAt]
  );

  const frontBase = process.env.FRONTEND_URL || 'http://localhost:4200';
  emailService.queue({
    template: 'invite-partner-editor',
    to: cleanEmail,
    data: { entityName, acceptUrl: `${frontBase}/accept-invite?token=${rawToken}` },
    entityId,
  });

  return { email: cleanEmail, expiresAt };
};

exports.getInviteByToken = async (rawToken) => {
  const tokenHash = crypto.createHash('sha256').update(rawToken || '').digest('hex');
  const { rows } = await db.query(
    `SELECT pi.email, pi.expires_at, pi.accepted_at, e.display_name AS entity_name
     FROM partner_invites pi
     JOIN entities e ON e.id = pi.entity_id
     WHERE pi.token_hash = $1`,
    [tokenHash]
  );
  if (!rows.length) {
    const err = new Error('Invite not found');
    err.status = 404;
    throw err;
  }
  const invite = rows[0];
  if (invite.accepted_at) {
    const err = new Error('Invite already accepted');
    err.status = 410;
    throw err;
  }
  if (new Date(invite.expires_at) < new Date()) {
    const err = new Error('Invite expired');
    err.status = 410;
    throw err;
  }
  return { email: invite.email, entityName: invite.entity_name };
};

// req.user (require-auth.js) only carries userId — the JWT payload has no
// email — so the accepting user's email is looked up here, not passed in.
exports.acceptInvite = async (userId, rawToken) => {
  const userRes = await db.query(`SELECT email FROM users WHERE id = $1`, [userId]);
  if (!userRes.rows.length) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  const userEmail = userRes.rows[0].email;

  const tokenHash = crypto.createHash('sha256').update(rawToken || '').digest('hex');
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, entity_id, email, expires_at, accepted_at FROM partner_invites WHERE token_hash = $1 FOR UPDATE`,
      [tokenHash]
    );
    if (!rows.length) {
      const err = new Error('Invite not found');
      err.status = 404;
      throw err;
    }
    const invite = rows[0];
    if (invite.accepted_at) {
      const err = new Error('Invite already accepted');
      err.status = 410;
      throw err;
    }
    if (new Date(invite.expires_at) < new Date()) {
      const err = new Error('Invite expired');
      err.status = 410;
      throw err;
    }
    if (invite.email.toLowerCase() !== (userEmail || '').toLowerCase()) {
      const err = new Error('This invite was sent to a different email address');
      err.status = 403;
      throw err;
    }

    await client.query(
      `INSERT INTO user_entities (user_id, entity_id, role) VALUES ($1, $2, 'owner')
       ON CONFLICT DO NOTHING`,
      [userId, invite.entity_id]
    );
    await client.query(`UPDATE partner_invites SET accepted_at = NOW() WHERE id = $1`, [invite.id]);

    await client.query('COMMIT');
    return { entityId: invite.entity_id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};
