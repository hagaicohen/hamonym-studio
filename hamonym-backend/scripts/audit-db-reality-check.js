// Read-only production data-health audit (Production Launch Readiness pass,
// 2026-09-10). Makes NO writes. Run: node scripts/audit-db-reality-check.js
require('dotenv').config();
const pool = require('../src/db/db');

async function section(title, fn) {
  console.log(`\n=== ${title} ===`);
  try {
    await fn();
  } catch (err) {
    console.log('  ERROR:', err.message);
  }
}

async function main() {
  await section('campaigns: status value distribution', async () => {
    const r = await pool.query(`SELECT status, count(*) FROM campaigns GROUP BY status ORDER BY count(*) DESC`);
    r.rows.forEach(row => console.log(`  ${row.status ?? 'NULL'}: ${row.count}`));
  });

  await section('campaigns: orphan (entity_id not in entities)', async () => {
    const r = await pool.query(`SELECT c.id, c.title, c.entity_id, c.status FROM campaigns c LEFT JOIN entities e ON e.id = c.entity_id WHERE e.id IS NULL`);
    console.log(`  ${r.rows.length} orphan campaigns`);
    r.rows.slice(0, 10).forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await section('campaigns: published but missing required-looking fields (slug/title/entity_id null)', async () => {
    const r = await pool.query(`SELECT id, title, slug, entity_id, status FROM campaigns WHERE status = 'published' AND (slug IS NULL OR title IS NULL OR entity_id IS NULL)`);
    console.log(`  ${r.rows.length} published campaigns with a null core field`);
    r.rows.slice(0, 10).forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await section('campaigns: duplicate slugs', async () => {
    const r = await pool.query(`SELECT slug, count(*) FROM campaigns WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1`);
    console.log(`  ${r.rows.length} duplicate slug groups`);
    r.rows.forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await section('donations: pointing at missing campaign', async () => {
    const r = await pool.query(`SELECT d.id, d.campaign_id, d.status, d.created_at FROM donations d LEFT JOIN campaigns c ON c.id = d.campaign_id WHERE c.id IS NULL`);
    console.log(`  ${r.rows.length} donations with missing campaign`);
    r.rows.slice(0, 10).forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await section('donations: pointing at missing entity', async () => {
    const r = await pool.query(`SELECT d.id, d.entity_id, d.status FROM donations d LEFT JOIN entities e ON e.id = d.entity_id WHERE e.id IS NULL`);
    console.log(`  ${r.rows.length} donations with missing entity`);
    r.rows.slice(0, 10).forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await section('campaigns: current_amount/supporters_count vs actual paid donations (top 15 mismatches)', async () => {
    const r = await pool.query(`
      SELECT c.id, c.title, c.current_amount, c.supporters_count,
             COALESCE(SUM(d.amount) FILTER (WHERE d.status='paid'),0) AS actual_amount,
             COUNT(d.id) FILTER (WHERE d.status='paid') AS actual_supporters
      FROM campaigns c LEFT JOIN donations d ON d.campaign_id = c.id
      GROUP BY c.id
      HAVING c.current_amount != COALESCE(SUM(d.amount) FILTER (WHERE d.status='paid'),0)
          OR c.supporters_count != COUNT(d.id) FILTER (WHERE d.status='paid')
      ORDER BY ABS(c.current_amount - COALESCE(SUM(d.amount) FILTER (WHERE d.status='paid'),0)) DESC
      LIMIT 15`);
    console.log(`  ${r.rows.length} mismatched campaigns (top 15 shown)`);
    r.rows.forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await section('entities: status value distribution', async () => {
    const r = await pool.query(`SELECT status, count(*) FROM entities GROUP BY status ORDER BY count(*) DESC`);
    r.rows.forEach(row => console.log(`  ${row.status ?? 'NULL'}: ${row.count}`));
  });

  await section('entities: active but missing display_name', async () => {
    const r = await pool.query(`SELECT id, display_name, status FROM entities WHERE status = 'active' AND (display_name IS NULL OR display_name = '')`);
    console.log(`  ${r.rows.length}`);
    r.rows.forEach(row => console.log('  ', JSON.stringify(row)));
  });

  // users<->entity linkage is not a direct entity_id column on this schema
  // (users table has role/role_id instead) -- covered by the separate
  // ownership/permissions investigation instead of here.

  await section('campaigns: stale drafts (draft status, created > 90 days ago, never touched)', async () => {
    const r = await pool.query(`SELECT id, title, entity_id, status, created_at, updated_at FROM campaigns WHERE status IN ('draft','pending') AND created_at < NOW() - INTERVAL '90 days' ORDER BY created_at ASC LIMIT 20`);
    console.log(`  ${r.rows.length} (showing up to 20)`);
    r.rows.forEach(row => console.log('  ', JSON.stringify(row)));
  });

  await pool.end();
}

main().catch(err => { console.error('FATAL', err); process.exit(1); });
