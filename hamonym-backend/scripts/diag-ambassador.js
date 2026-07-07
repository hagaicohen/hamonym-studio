/**
 * Diagnostic: test myAmbassadorCampaigns + myAmbassadorRecord queries
 * Usage: node scripts/diag-ambassador.js <userEmail>
 */
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  host:     process.env.DB_HOST,
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl:      { rejectUnauthorized: false },
});

async function run() {
  const email = process.argv[2] || 'hagai.cohen@gmail.com';
  console.log(`\n=== Diagnosing ambassador access for: ${email} ===\n`);

  const client = await pool.connect();
  try {
    // Step 1: find the user
    const { rows: users } = await client.query(
      `SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
      [email]
    );
    if (!users.length) {
      console.log(`❌ No user found with email: ${email}`);
      return;
    }
    const user = users[0];
    console.log(`✅ User found: id=${user.id}, email=${user.email}`);

    // Step 2: find ambassador records by email
    const { rows: ambRows } = await client.query(
      `SELECT a.id, a.campaign_id, a.email, a.slug, a.status,
              c.title AS campaign_title
       FROM campaign_ambassadors a
       JOIN campaigns c ON c.id = a.campaign_id
       WHERE LOWER(a.email) = LOWER($1)`,
      [email]
    );
    console.log(`\n✅ Ambassador records found by email: ${ambRows.length}`);
    ambRows.forEach(r => {
      console.log(`   • campaign_id=${r.campaign_id}, slug=${r.slug}, status=${r.status}, campaign="${r.campaign_title}"`);
    });

    // Step 3: run the actual myAmbassadorCampaigns query (same as backend)
    const { rows: myCampaigns } = await client.query(
      `SELECT c.id, c.title AS name, c.slug, c.cover_image_url, c.status,
              a.slug AS ambassador_slug, a.status AS ambassador_status,
              a.goal_amount AS personal_goal
       FROM campaign_ambassadors a
       JOIN campaigns c ON c.id = a.campaign_id
       WHERE LOWER(a.email) = LOWER(
         (SELECT email FROM users WHERE id = $1 LIMIT 1)
       )`,
      [user.id]
    );
    console.log(`\n✅ myAmbassadorCampaigns result: ${myCampaigns.length} campaigns`);
    myCampaigns.forEach(c => {
      console.log(`   • campaign id=${c.id}, name="${c.name}", ambassador_slug=${c.ambassador_slug}`);
    });

    // Step 4: for each campaign, run myAmbassadorRecord query
    console.log(`\n=== Testing myAmbassadorRecord for each campaign ===`);
    for (const c of myCampaigns) {
      const { rows: rec } = await client.query(
        `SELECT a.*, camp.title AS campaign_title
         FROM campaign_ambassadors a
         JOIN campaigns camp ON camp.id = a.campaign_id
         WHERE a.campaign_id = $2
           AND a.email IS NOT NULL
           AND LOWER(a.email) = LOWER(
             (SELECT email FROM users WHERE id = $1 LIMIT 1)
           )`,
        [user.id, c.id]
      );
      if (rec.length) {
        console.log(`✅ myAmbassadorRecord(campaignId=${c.id}) → found: id=${rec[0].id}, slug=${rec[0].slug}`);
      } else {
        console.log(`❌ myAmbassadorRecord(campaignId=${c.id}) → NOT FOUND`);
        // show why — compare the values directly
        const { rows: direct } = await client.query(
          `SELECT a.email AS amb_email, u.email AS user_email
           FROM campaign_ambassadors a, users u
           WHERE a.campaign_id = $1 AND u.id = $2`,
          [c.id, user.id]
        );
        if (direct.length) {
          console.log(`   Emails: ambassador="${direct[0].amb_email}", user="${direct[0].user_email}"`);
          console.log(`   Match: ${direct[0].amb_email?.toLowerCase() === direct[0].user_email?.toLowerCase()}`);
        }
      }
    }

    // Step 5: check if there are ambassadors with NULL email (would be excluded)
    const { rows: nullEmail } = await client.query(
      `SELECT a.id, a.campaign_id, a.slug FROM campaign_ambassadors a
       WHERE a.email IS NULL OR a.email = ''`
    );
    if (nullEmail.length) {
      console.log(`\n⚠️  Ambassador records with NULL/empty email: ${nullEmail.length}`);
      nullEmail.forEach(r => console.log(`   • campaign_id=${r.campaign_id}, slug=${r.slug}`));
    }

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Script error:', err.message);
  process.exit(1);
});
