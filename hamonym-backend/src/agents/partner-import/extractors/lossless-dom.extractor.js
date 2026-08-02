// LosslessDomExtractor — headless-browser DOM walk that preserves
// structure/order/images verbatim, for the AI Website Import
// (partner-import) feature. Deliberately separate from
// campaign-creation/extractors/website.extractor.js, which stays 100%
// unmodified: that extractor collapses a page into ONE flat text blob via
// static fetch()+JSDOM+Readability (fine for the existing AI-Brief flow,
// which only needs prose to summarize) — this one needs real per-element
// structure (headings/paragraphs/images in document order, each with a
// stable id) so a Target Resolver can reference exact source content by
// id instead of re-quoting it. See partner-import.types.js's INVARIANTS.
//
// Uses Playwright (real Chromium) rather than static fetch — many business
// sites are JS-rendered and a static fetch would see an empty shell.

const { chromium } = require('playwright');
const { EXTRACTOR_VERSION } = require('../partner-import.types');

const NAV_TIMEOUT_MS = 25000;

class LosslessExtractionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LosslessExtractionError';
  }
}

// Same SSRF guard as campaign-creation/extractors/website.extractor.js —
// duplicated deliberately rather than shared, so that file's own shipped
// behavior can never be affected by a change made here. See that file's
// own comment for the reasoning (DNS-rebinding-aware, checks resolved IP
// not just the literal hostname).
async function assertSafeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new LosslessExtractionError('כתובת לא תקינה');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LosslessExtractionError('כתובת לא נתמכת');
  }

  const dns = require('dns').promises;
  let addresses;
  try {
    addresses = await Promise.race([
      dns.lookup(url.hostname, { all: true }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('DNS timeout')), NAV_TIMEOUT_MS)),
    ]);
  } catch {
    throw new LosslessExtractionError('לא ניתן היה לפענח את הכתובת');
  }
  for (const { address, family } of addresses) {
    if (isPrivateOrInternal(address, family)) {
      throw new LosslessExtractionError('לא הצלחנו לגשת לכתובת הזו');
    }
  }
  return url;
}

function isPrivateOrInternal(ip, family) {
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 127) return true;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 0) return true;
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:') || lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb')) return true;
  return false;
}

// Kept warm across requests — a fresh Chromium launch per request would add
// several seconds of pure overhead on top of the page load itself.
let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true });
  }
  return browserPromise;
}

// Runs INSIDE the page (page.evaluate serializes this function and executes
// it in-browser) — must be self-contained, no closures over outer scope.
// Recursive walk over main/article (falling back to body), skipping
// script/style/nav, producing document-ordered NormalizedBlock entries
// with per-type stable ids (p1, p2, img1, h2_1, ...). Same shape as the
// manual DOM-walk proven earlier against a real business page.
function walkDom() {
  // Priority, not "pick the biggest" — found live against a real WordPress
  // business page (hamonym.com) that picking the largest of several
  // candidate containers pulled in a sibling social-share sidebar (bigger
  // by raw text than the real post body). 'article' is the most precise
  // semantic container when present (matches the common WordPress hentry
  // convention); 'main' and '.entry-content' are reasonable fallbacks for
  // themes that skip <article> entirely.
  const root = document.querySelector('article') || document.querySelector('main') || document.querySelector('.entry-content') || document.body;
  const counters = {};
  const blocks = [];
  let order = 0;

  function nextId(prefix) {
    counters[prefix] = (counters[prefix] || 0) + 1;
    return `${prefix}${counters[prefix]}`;
  }

  function pushText(type, text, extra) {
    const trimmed = (text || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    blocks.push({ id: nextId(type === 'heading' ? `h${extra?.level || ''}_` : type[0]), type, order: order++, text: trimmed, ...extra });
  }

  function pushImage(node) {
    const src = node.src;
    if (!src) return;
    blocks.push({
      id: nextId('img'), type: 'image', order: order++,
      src, alt: node.alt || undefined,
      width: node.naturalWidth || undefined, height: node.naturalHeight || undefined,
    });
  }

  // Real-world editors sometimes nest an <img> inside a heading/paragraph/
  // link (a WordPress quirk found live against a real business page — an
  // image landed inside an <h5>) — a plain textContent read plus an early
  // return would silently drop it, since nodeType text extraction and DOM
  // recursion aren't the same pass. Scanning descendant imgs separately
  // before returning means no image is ever lost regardless of which
  // "leaf-like" tag it happens to be wrapped in.
  function pushNestedImages(node) {
    node.querySelectorAll('img').forEach(pushImage);
  }

  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) pushText('paragraph', t);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toLowerCase();
    if (['script', 'style', 'noscript', 'svg', 'nav', 'footer'].includes(tag)) return;

    // A real WordPress theme wraps the post's own <h1> title in
    // <header class="entry-header"> INSIDE <article> — fully skipping
    // 'header' (the original behavior) silently dropped the page's main
    // heading. But a header commonly ALSO holds byline/breadcrumb/date
    // links (found live: "Hamonym", a raw post date) that read as noise,
    // not real content — so pull out only the actual heading tags from
    // inside it, not everything. 'footer' stays fully skipped above: on the
    // same real page it held nothing but WordPress's "posted in X, bookmark
    // the permalink" boilerplate, never real business content.
    if (tag === 'header') {
      node.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => walk(h));
      pushNestedImages(node);
      return;
    }

    if (tag === 'img') {
      pushImage(node);
      return;
    }

    if (/^h[1-6]$/.test(tag)) {
      pushText('heading', node.textContent, { level: Number(tag[1]) });
      pushNestedImages(node);
      return;
    }

    if (tag === 'p' || tag === 'li') {
      // A <p>/<li> whose entire content is one wrapped <a> is really a
      // button/link, not prose — a real "donate" CTA on a real business
      // page turned out to be exactly <p><a>לתרומה וקבלת ההטבה</a></p>.
      // Treating the whole tag as plain paragraph text (the old behavior)
      // silently threw away the link/href — walking into the <a> instead
      // lets the existing link-handling branch below capture it properly.
      const onlyChild = node.children.length === 1 ? node.children[0] : null;
      if (onlyChild && onlyChild.tagName === 'A' && onlyChild.textContent.trim() === node.textContent.trim()) {
        walk(onlyChild);
        return;
      }
      pushText('paragraph', node.textContent);
      pushNestedImages(node);
      return;
    }

    if (tag === 'ul' || tag === 'ol') {
      const items = Array.from(node.querySelectorAll(':scope > li')).map((li) => li.textContent.trim()).filter(Boolean);
      if (items.length) {
        blocks.push({ id: nextId('list'), type: 'list', order: order++, text: items.join(' | ') });
      }
      pushNestedImages(node);
      return;
    }

    if (tag === 'a' && !node.querySelector('img')) {
      const text = node.textContent.trim();
      if (text) {
        blocks.push({ id: nextId('link'), type: 'link', order: order++, text, href: node.href || undefined });
      }
      return;
    }

    for (const child of node.childNodes) walk(child);
  }

  walk(root);
  return { blocks, pageTitle: document.title || '' };
}

// @param {string} rawUrl
// @returns {Promise<{ blocks: import('../partner-import.types').NormalizedBlock[], pageTitle: string, extractorVersion: string }>}
exports.extract = async (rawUrl) => {
  const url = await assertSafeUrl(rawUrl);

  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(url.toString(), { waitUntil: 'networkidle', timeout: NAV_TIMEOUT_MS });
    const { blocks, pageTitle } = await page.evaluate(walkDom);
    return { blocks, pageTitle, extractorVersion: EXTRACTOR_VERSION };
  } catch (err) {
    throw new LosslessExtractionError('לא הצלחנו לגשת לאתר או לנתח את תוכנו');
  } finally {
    await page.close();
  }
};

exports.LosslessExtractionError = LosslessExtractionError;
