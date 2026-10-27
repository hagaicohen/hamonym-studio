const crypto = require('crypto');
const db = require('../../db/db');
const email = require('../email/email.service');
exports.requestVerification = async userId => {
  if (process.env.EMAIL_ENABLED !== 'true' || !process.env.EMAIL_PROVIDER || process.env.EMAIL_PROVIDER === 'stub')
    throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
  const token = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const { rows } = await db.query(
    `UPDATE users SET donation_verification_hash=$2, donation_verification_email=email,
       donation_verification_expires_at=NOW()+INTERVAL '1 hour', donation_verification_sent_at=NOW()
     WHERE id=$1 AND is_active=true AND deleted_at IS NULL
       AND (donation_verification_sent_at IS NULL OR donation_verification_sent_at < NOW()-INTERVAL '1 minute')
     RETURNING email`, [userId, hash]);
  if (!rows[0]) throw Object.assign(new Error('Please wait before requesting another email'), { status: 429 });
  const url = new URL('/my-donations', process.env.FRONTEND_URL || 'http://localhost:4200');
  url.searchParams.set('verification', token);
  const delivery = await email.send({ template: 'verify-donor-email', to: rows[0].email,
    data: { verificationUrl: url.href }, userId });
  if (delivery?.status !== 'sent') throw Object.assign(new Error('Email delivery failed'), { status: 503 });
};
exports.verify = async (userId, token) => {
  if (!/^[a-f0-9]{64}$/.test(token || '')) throw Object.assign(new Error('Invalid verification link'), { status: 400 });
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const connection = await db.connect();
  try {
    await connection.query('BEGIN');
    const { rows } = await connection.query(
      `UPDATE users SET email_verified=true, email_verified_at=COALESCE(email_verified_at,NOW()),
         donation_verified_email=email, donation_proof_version=gen_random_uuid(), donation_verification_email=NULL,
         donation_verification_hash=NULL, donation_verification_expires_at=NULL
       WHERE id=$1 AND donation_verification_hash=$2 AND donation_verification_expires_at>NOW()
         AND LOWER(email)=LOWER(donation_verification_email)
         AND is_active=true AND deleted_at IS NULL RETURNING email, donation_proof_version`, [userId, hash]);
    if (!rows[0]) throw Object.assign(new Error('Invalid or expired verification link'), { status: 400 });
    await connection.query(
      `UPDATE donations SET donor_user_id=$1
       WHERE donor_user_id IS NULL AND LOWER(donor_email)=LOWER($2)`, [userId, rows[0].email]);
    await connection.query('COMMIT');
    return { verified: true, donationProofVersion: rows[0].donation_proof_version };
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
};
