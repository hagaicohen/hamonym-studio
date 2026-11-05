import type { CampaignBlock, CampaignDraft, ImageBlockData, RichTextBlockData } from '../../services/campaign-studio-state.service';

// Preview-only placeholders for the Studio canvas. They fill empty fields of a
// COPY of the draft that only the canvas renders; the state, the save payload
// and the campaign data never see them.

const svg = (label: string, height: number) =>
  'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${height}" viewBox="0 0 1200 ${height}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ede9fe"/><stop offset="1" stop-color="#ddd6fe"/></linearGradient></defs>` +
    `<rect width="1200" height="${height}" fill="url(#g)"/>` +
    `<g fill="none" stroke="#a78bfa" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(560 ${height / 2 - 70})">` +
    `<rect x="0" y="0" width="80" height="64" rx="8"/><circle cx="26" cy="22" r="8"/><path d="M80 48 58 26 10 64"/></g>` +
    `<text x="600" y="${height / 2 + 40}" text-anchor="middle" font-family="Heebo, Arial, sans-serif" font-size="34" font-weight="600" fill="#6d28d9">${label}</text>` +
    `</svg>`);

export const PLACEHOLDER_COVER = svg('תמונת הפתיחה של הקמפיין', 520);
export const PLACEHOLDER_IMAGE = svg('תמונה', 400);
export const PLACEHOLDER_TITLE = 'כותרת הקמפיין שלכם';
export const PLACEHOLDER_SUBTITLE = 'משפט קצר שמסביר לתורמים למה כדאי לתמוך';
export const PLACEHOLDER_STORY = '<p>כאן יופיע סיפור הקמפיין: מה המטרה, למי התרומה עוזרת ומה תשיג. בחרו את הרכיב כדי לכתוב.</p>';
export const PLACEHOLDER_TARGET = 50000;

const isBlankHtml = (html: string | undefined) => !(html ?? '').replace(/<[^>]*>|&nbsp;/g, '').trim();

function placeholderBlock(block: CampaignBlock): CampaignBlock {
  if (block.type === 'rich-text' && isBlankHtml((block.data as RichTextBlockData).content)) {
    return { ...block, data: { ...(block.data as RichTextBlockData), content: PLACEHOLDER_STORY } };
  }
  if (block.type === 'image' && !(block.data as ImageBlockData).url) {
    return { ...block, data: { ...(block.data as ImageBlockData), url: PLACEHOLDER_IMAGE } };
  }
  return block;
}

// Same ids and structure as the input; only empty display values are filled.
export function withStudioPlaceholders(draft: CampaignDraft): { draft: CampaignDraft; used: boolean } {
  let used = false;
  const fill = <T>(value: T, empty: boolean, placeholder: T): T => (empty ? ((used = true), placeholder) : value);
  const noHeroMedia = !draft.coverImageUrl && !(draft.heroType === 'video' && draft.videoUrl);
  const blocks = draft.blocks.map(b => {
    const next = placeholderBlock(b);
    if (next !== b) used = true;
    return next;
  });
  const result: CampaignDraft = {
    ...draft,
    title: fill(draft.title, !draft.title?.trim(), PLACEHOLDER_TITLE),
    shortDescription: fill(draft.shortDescription, !draft.shortDescription?.trim(), PLACEHOLDER_SUBTITLE),
    coverImageUrl: fill(draft.coverImageUrl, noHeroMedia, PLACEHOLDER_COVER),
    targetAmount: fill(draft.targetAmount, !(draft.targetAmount > 0), PLACEHOLDER_TARGET),
    blocks,
  };
  return { draft: result, used };
}
