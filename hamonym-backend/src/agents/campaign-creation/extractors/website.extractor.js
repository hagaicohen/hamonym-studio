// WebsiteExtractor — fetches a single user-supplied URL and hands its main
// content to FreeTextExtractor. Not a second Extraction pipeline: per
// AI_CAMPAIGN_CREATION_MVP.md §10, this is an adapter (URL -> HTML -> main
// content text) sitting in front of the already-proven FreeTextExtractor —
// zero duplicated prompt/LLM logic. jsdom pinned to ^24 in package.json
// deliberately: newer jsdom majors pull in an ESM-only dependency chain that
// breaks under this backend's CommonJS require() on Node 18 (verified by
// hand — do not bump past 24.x without re-testing on this Node version).
//
// Pages/scope: single page only, no crawling of internal links, no
// robots.txt check (this fetches a URL the user explicitly gave us, not a
// bot crawling the web on its own — MVP §10).

const { JSDOM } = require('jsdom');
const { Readability } = require('@mozilla/readability');
const freeTextExtractor = require('./free-text.extractor');

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // ~2MB — MVP §8
// Below this, Readability's result is "weak" -> fall back to raw body text
// rather than failing outright (MVP §10 addition: non-standard page
// structures/landing pages shouldn't hard-fail an otherwise-fetchable site).
const WEAK_CONTENT_LENGTH = 200;

class WebsiteFetchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WebsiteFetchError';
  }
}

// SSRF guard (MVP §8) — blocks fetches to private/internal ranges and
// non-http(s) protocols. Resolves the hostname via DNS and checks the
// resolved IP too, not just the literal hostname string, so a domain that
// merely *points at* an internal address is blocked the same as typing the
// IP directly (naive string-only checks miss DNS rebinding).
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebsiteFetchError('כתובת לא תקינה');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new WebsiteFetchError('כתובת לא נתמכת');
  }

  const dns = require('dns').promises;
  let addresses;
  try {
    // dns.lookup() has no built-in timeout — found while debugging a report
    // of the whole request hanging indefinitely. A stalled DNS resolver
    // would otherwise block here forever, before FETCH_TIMEOUT_MS (which
    // only guards the fetch() call itself) ever gets a chance to apply.
    addresses = await Promise.race([
      dns.lookup(url.hostname, { all: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), FETCH_TIMEOUT_MS)),
    ]);
  } catch {
    throw new WebsiteFetchError('לא ניתן היה לפענח את הכתובת');
  }
  for (const { address, family } of addresses) {
    if (isPrivateOrInternal(address, family)) {
      throw new WebsiteFetchError('לא הצלחנו לגשת לכתובת הזו');
    }
  }
  return url;
}

function isPrivateOrInternal(ip, family) {
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, incl. cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
    return false;
  }
  // IPv6: loopback (::1) and link-local (fe80::/10)
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  return false;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, { signal: controller.signal, redirect: 'follow' });
  } catch {
    throw new WebsiteFetchError('לא הצלחנו לגשת לאתר');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new WebsiteFetchError('לא הצלחנו לגשת לאתר');
  }
  const html = await response.text();
  return html.length > MAX_HTML_BYTES ? html.slice(0, MAX_HTML_BYTES) : html;
}

// Readability first; if the result is too thin (non-standard page structure,
// landing page, etc.), fall back to all visible body text rather than
// failing the whole request — MVP §10.
// Collapses whitespace runs (tabs/newlines from indented markup, common on
// page-builder/WordPress-style sites with lots of empty wrapper divs) down
// to single spaces. Found live (2026-07-22, real site test): Readability's
// textContent can carry large amounts of this noise through even when the
// extracted content itself is good — wastes LLM tokens and makes sourceRaw
// unreadable for debugging, even though it didn't change extraction
// quality in that case. Applied to both paths for consistency — the
// fallback path already did this, Readability's didn't.
function normalizeWhitespace(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function extractMainContent(html, url) {
  const dom = new JSDOM(html, { url });
  let readabilityText = '';
  try {
    const article = new Readability(dom.window.document).parse();
    readabilityText = normalizeWhitespace(article?.textContent || '');
  } catch {
    readabilityText = '';
  }

  if (readabilityText.length >= WEAK_CONTENT_LENGTH) {
    return readabilityText;
  }

  const fallback = normalizeWhitespace(dom.window.document.body?.textContent || '');
  return fallback.length > readabilityText.length ? fallback : readabilityText;
}

// Fetch + normalize only, no LLM call — split out so a combined submission
// (free text + website + files together, see document-collection.extractor.js)
// can reuse just this step and fold the result into one aggregated
// extraction call, rather than website getting its own separate
// ExtractedFacts that would then need merging (the rejected Facts Merger
// problem). Still throws WebsiteFetchError on hard failure (MVP §10) —
// callers decide whether that's fatal for them or just means "skip this
// part, use whatever else was provided."
// @param {string} rawUrl
// @returns {Promise<string>}
exports.fetchMainContent = async (rawUrl) => {
  const url = await assertSafeUrl(rawUrl);
  const html = await fetchHtml(url.toString());
  return extractMainContent(html, url.toString());
};

// @param {string} rawUrl
// @returns {Promise<import('../campaign-creation.types').ExtractedFacts>}
exports.extract = async (rawUrl) => {
  const text = await exports.fetchMainContent(rawUrl);

  // Reuses FreeTextExtractor entirely (same prompt, same "don't invent"
  // rules, same temperature: 0) — thin content still degrades gracefully to
  // honest nulls via its own MIN_TEXT_LENGTH guard, exactly like short free
  // text. Only the source tag differs.
  const facts = await freeTextExtractor.extract(text);
  return { ...facts, source: 'website' };
};

exports.WebsiteFetchError = WebsiteFetchError;

// Exposed for the fixture harness (MVP §10 — deterministic corpus runs
// against local HTML files, never a live fetch) to exercise the
// normalization step directly without a network call.
exports.extractMainContent = extractMainContent;
