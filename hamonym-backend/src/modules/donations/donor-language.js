const db = require('../../db/db');
const { hasColumn, publicContentI18n } = require('../campaigns/content-i18n');

// The language a donor used (migration 089, donations.donor_language). Display
// and communication only: nothing financial reads it. Every lookup degrades to
// Hebrew, so historical donations and a database without the column behave
// exactly as before.

function normalizeLanguage(value) {
  return value === 'en' ? 'en' : 'he';
}

const hasDonorLanguageColumn = () => hasColumn('donations', 'donor_language');

// Called right after the pending donation row is created. Hebrew is stored as
// NULL, so a Hebrew donation writes nothing at all.
async function recordDonorLanguage(donationId, language, client = db) {
  if (normalizeLanguage(language) !== 'en') return;
  if (!(await hasDonorLanguageColumn())) return;
  await client.query(`UPDATE donations SET donor_language = 'en' WHERE id = $1`, [donationId]);
}

async function languageOfDonation(donationId) {
  if (!(await hasDonorLanguageColumn())) return 'he';
  const { rows } = await db.query('SELECT donor_language FROM donations WHERE id = $1', [donationId]);
  return normalizeLanguage(rows[0]?.donor_language);
}

// A recurring instruction's donor language is the one of the donation that set it up.
async function languageOfRecurringInstruction(instructionId) {
  if (!instructionId || !(await hasDonorLanguageColumn())) return 'he';
  const { rows } = await db.query(
    `SELECT donor_language FROM donations
      WHERE recurring_instruction_id = $1 AND donor_language IS NOT NULL
      ORDER BY created_at ASC LIMIT 1`,
    [instructionId]
  );
  return normalizeLanguage(rows[0]?.donor_language);
}

// The campaign title in a language: English only when the English version is
// published (never an unpublished translation), Hebrew otherwise.
async function campaignTitleIn(campaignId, language, hebrewTitle) {
  if (normalizeLanguage(language) !== 'en' || !(await hasColumn('campaigns', 'content_i18n'))) return hebrewTitle;
  const { rows } = await db.query('SELECT content_i18n FROM campaigns WHERE id = $1', [campaignId]);
  const title = publicContentI18n(rows[0]?.content_i18n)?.en?.values?.title;
  return typeof title === 'string' && title.trim() ? title : hebrewTitle;
}

// CardCom hosted-page language. The API takes Language (he today); English is
// documented by CardCom but not yet verified with a real test terminal, so it is
// sent only when the flag is on and the donor used English (D-51).
function cardcomPageLanguage(language) {
  return process.env.CARDCOM_ENGLISH_PAGES_ENABLED === 'true' && normalizeLanguage(language) === 'en' ? 'en' : 'he';
}

module.exports = {
  cardcomPageLanguage,
  normalizeLanguage, hasDonorLanguageColumn, recordDonorLanguage, languageOfDonation,
  languageOfRecurringInstruction, campaignTitleIn,
};
