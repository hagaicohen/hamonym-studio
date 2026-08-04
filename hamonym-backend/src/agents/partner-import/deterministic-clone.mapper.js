// Deterministic Clone mapper — NO LLM involved anywhere in this file. This
// backs the standalone "/partners" URL-clone option, which is deliberately
// NOT the classification-only AI Import pipeline (profile-target.resolver /
// participation-target.resolver): the user explicitly wants a literal,
// document-order reproduction of a real business page, no confidence tiers,
// no review screen, no target-classification judgment call — see
// DECISIONS.md (2026-08-02). Reuses lossless-dom.extractor.js's
// NormalizedBlock[] (already skips nav/header/footer/script/style), just
// mapped straight into CampaignBlock[] in the same order the page had them.
//
// Text runs (headings/paragraphs/lists) between two images are merged into
// ONE rich-text block — matches how a real page actually reads (an "about"
// section is one flowing block, not one block per <p>), and is exactly what
// proved out manually against the "סאפ אוואי" reference page.

const MIN_IMAGE_DIMENSION = 80; // px — filters out nav icons/badges that slipped past the extractor's nav/header/footer skip

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Some source pages show a website/contact URL as plain visible text
// (found live: "אתר: https://www.supaway.com/" was literal text content,
// not an <a>) — auto-linkifying it is still verbatim reproduction (the
// visible text is untouched), just making an already-present URL clickable
// the way a real page would expect it to be.
const URL_PATTERN = /(https?:\/\/[^\s<]+)/g;
function linkifyUrls(escapedText) {
  return escapedText.replace(URL_PATTERN, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);
}

function headingTag(level) {
  // Collapse to h2..h4 — keeps visual weight consistent regardless of the
  // source site's own (often inconsistent) heading levels.
  const clamped = Math.min(4, Math.max(2, level || 3));
  return `h${clamped}`;
}

// @param {import('./partner-import.types').NormalizedBlock[]} normalizedBlocks
// @param {(src: string) => Promise<string|null>} uploadImage - fetches+re-hosts one image, returns the new URL (or null on failure — skipped, never blocks the whole clone)
// @param {string} sourceHostname - the cloned page's own hostname, so its internal links (e.g. "back to campaign", "donate") can be told apart from real external links
// @param {string|null} realCampaignSlug - a real, guaranteed-to-exist campaign slug in THIS system (the manager picked it up front) — when present, same-host links are rewritten to it directly, confidently, no review flag needed
// @returns {Promise<{ blocks: object[] }>}
exports.mapToBlocks = async (normalizedBlocks, uploadImage, sourceHostname, realCampaignSlug = null) => {
  const blocks = [];
  let order = 0;
  let textBuffer = '';

  const newId = () => Math.random().toString(36).slice(2, 10);

  function flushText() {
    if (!textBuffer.trim()) { textBuffer = ''; return; }
    order += 1;
    blocks.push({
      id: newId(), type: 'rich-text', order, visible: true, label: '',
      spacingTop: 0, spacingBottom: 0,
      data: { content: textBuffer, lineHeight: 1.6 },
    });
    textBuffer = '';
  }

  for (const b of normalizedBlocks) {
    if (b.type === 'heading') {
      const tag = headingTag(b.level);
      textBuffer += `<${tag}>${escapeHtml(b.text)}</${tag}>`;
    } else if (b.type === 'paragraph') {
      textBuffer += `<p>${linkifyUrls(escapeHtml(b.text))}</p>`;
    } else if (b.type === 'list') {
      const items = b.text.split(' | ').filter(Boolean);
      if (items.length) {
        textBuffer += `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
      }
    } else if (b.type === 'image') {
      if ((b.width && b.width < MIN_IMAGE_DIMENSION) || (b.height && b.height < MIN_IMAGE_DIMENSION)) continue;
      const url = await uploadImage(b.src);
      if (!url) continue;
      flushText();
      order += 1;
      blocks.push({
        id: newId(), type: 'image', order, visible: true, label: '',
        spacingTop: 0, spacingBottom: 0,
        data: { url, caption: b.alt || '' },
      });
    } else if (b.type === 'link') {
      // A real content-area link (not nav — already excluded upstream) —
      // e.g. the source page's own "לתרומה וקבלת ההטבה" button. Mapped to
      // a CTA block, verbatim text, never rewritten.
      //
      // The href is a different story: a link pointing back into the SAME
      // source site (e.g. "חזרה לדף הקמפיין" / "לתרומה" -> hamonym.com/
      // campaign/<slug>/) references that OLD system's own campaign page.
      // Copying it verbatim would send a real donor back to the old site —
      // wrong.
      //
      // Best case: the manager picked a real campaign in THIS system up
      // front (see controller#clone / partners-list-page's campaign
      // picker) — realCampaignSlug is then a guaranteed-to-exist slug,
      // used directly, no review flag needed. Fallback (no campaign
      // picked): re-base the OLD link's own slug onto this system's
      // /campaigns/<slug> route — not invented, just re-pointed, but
      // flagged for review since nothing guarantees that exact campaign
      // exists here. A link to a genuinely different external site (e.g.
      // the business's own booking page) is kept verbatim untouched —
      // only same-host links get either treatment.
      let linkUrl = b.href || '';
      let needsReview = false;
      if (linkUrl && sourceHostname) {
        try {
          const parsed = new URL(linkUrl);
          if (parsed.hostname === sourceHostname) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
            if (realCampaignSlug) {
              linkUrl = `${frontendUrl}/campaigns/${realCampaignSlug}`;
              needsReview = false;
            } else {
              const segments = parsed.pathname.split('/').filter(Boolean);
              const campaignIdx = segments.indexOf('campaign');
              const slug = campaignIdx !== -1 ? segments[campaignIdx + 1] : null;
              linkUrl = slug ? `${frontendUrl}/campaigns/${slug}` : '';
              needsReview = true;
            }
          }
        } catch { /* not a valid absolute URL — leave as-is */ }
      }
      flushText();
      order += 1;
      blocks.push({
        id: newId(), type: 'cta', order, visible: true, label: '',
        spacingTop: 0, spacingBottom: 0,
        // A blank linkUrl otherwise fails completely silently — the button
        // renders fine and just does nothing on click (onCtaClick's `if
        // (cta.linkUrl)` no-ops), which reads as "broken," not "needs
        // setup." Reusing the SAME "לבדיקה" review mechanism AI Import
        // already uses for medium-confidence blocks — a manager sees
        // exactly why this button doesn't do anything yet, in the same
        // place they'd already look.
        ...(needsReview ? { importReview: { needsReview: true, confidence: 0, sourceId: b.id } } : {}),
        data: {
          // backgroundColor colors the WHOLE section (a full-width banner —
          // confirmed in campaign-preview.component.html's .block-cta), NOT
          // the button. Setting it red (as first tried) turned the entire
          // block into a giant red rectangle with the red button invisible
          // inside it. White section, red BUTTON (ctaConfig.color) — a
          // small button on a plain background, matching the reference
          // page's actual look.
          title: '', text: '', backgroundColor: '#ffffff',
          textStyle: { align: 'center', color: '#1e293b', fontSize: 'lg', position: 'bottom' },
          ctaConfig: { visible: true, label: b.text, color: '#dc2626', align: 'center', icon: '' },
          ctaAction: 'link',
          linkUrl,
          blockHeight: 12,
        },
      });
    }
  }
  flushText();

  return { blocks };
};
