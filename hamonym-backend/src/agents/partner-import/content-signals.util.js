// Deterministic (no LLM) signal detection over a NormalizedBlock[] — same
// "regex/keyword beats LLM judgment for a fact that's either there or
// isn't" discipline as campaign-creation/extractors/free-text.extractor.js's
// VIDEO_URL_PATTERN/ENTITY_TYPE_KEYWORDS. Used both for the extract-time
// "found signals" checklist (no LLM call spent) and for contactEmail/
// contactPhone, which never go through a Target Resolver at all.

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
const PHONE_REGEX = /0(5\d|[23489])[-\s]?\d{3}[-\s]?\d{4}/;
const HOURS_KEYWORDS = /שעות\s*פתיחה|ימי\s*(א|ב|ג|ד|ה|ו)['’]?\s*[-–]\s*(א|ב|ג|ד|ה|ו)['’]?/;
const OFFER_KEYWORDS = /קוד\s*קופון|הנחה|₪|%\s*הנחה|קופון/;
const ADDRESS_KEYWORDS = /כתובת|רחוב|רח['’]/;

function allText(blocks) {
  return blocks.filter((b) => b.text).map((b) => b.text).join(' \n ');
}

// @param {import('./partner-import.types').NormalizedBlock[]} blocks
// @returns {string|null}
exports.findEmail = (blocks) => {
  const match = allText(blocks).match(EMAIL_REGEX);
  return match ? match[0] : null;
};

// @param {import('./partner-import.types').NormalizedBlock[]} blocks
// @returns {string|null}
exports.findPhone = (blocks) => {
  const match = allText(blocks).match(PHONE_REGEX);
  return match ? match[0].replace(/\s/g, '') : null;
};

// @param {import('./partner-import.types').NormalizedBlock[]} blocks
// @returns {{ businessName: boolean, gallery: boolean, address: boolean, contact: boolean, openingHours: boolean, offerLanguage: boolean }}
exports.computeFoundSignals = (blocks, pageTitle) => {
  const text = allText(blocks);
  const hasHeading = blocks.some((b) => b.type === 'heading');
  return {
    businessName: !!(pageTitle?.trim() || hasHeading),
    gallery: blocks.some((b) => b.type === 'image'),
    address: ADDRESS_KEYWORDS.test(text),
    contact: EMAIL_REGEX.test(text) || PHONE_REGEX.test(text),
    openingHours: HOURS_KEYWORDS.test(text),
    offerLanguage: OFFER_KEYWORDS.test(text),
  };
};
