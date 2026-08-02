// Deterministic ResolvedEntry[] -> CampaignBlock[] mapper for the AI
// Website Import feature. Deliberately does NOT reuse
// ai-campaign-creation-page.component.ts's applyStoryContent()/
// interleaveStoryWithImages() — those assume one continuous LLM-written
// prose blob split by paragraph breaks, the wrong shape for already-
// discrete classified chunks. See docs/DECISIONS.md and this repo's
// partner-import backend module for the matching server-side contract —
// this file is the ONLY place tiering (confidence -> auto/review/
// suggestion) and block-type mapping happen; the Target Resolvers
// upstream know nothing about CampaignBlock at all.
//
// Uses a throwaway CampaignStudioStateService instance (plain `new`, no
// Angular DI needed — the class has no constructor dependencies) purely
// to get its already-correct, ownerType-aware addBlock()/defaultBlockData()
// behavior for free, exactly as if a manager had clicked "add block"
// manually — not because this runs inside a real Builder page.

import {
  CampaignStudioStateService, CampaignBlock, CampaignDraft, BlockType,
  RichTextBlockData, ImageBlockData, CtaBlockData, CouponsBlockData, MapBlockData,
  createInitialPartnerDraft, createInitialCampaignPartnerDraft,
} from './campaign-studio-state.service';

export interface ResolvedEntry {
  sourceId: string;
  target: string;
  confidence: number;
  value: string;
  sourceType: 'heading' | 'paragraph' | 'image' | 'list' | 'link';
}

// Must match partner-import.types.js's CONFIDENCE_HIGH/CONFIDENCE_MEDIUM —
// two plain numbers duplicated deliberately (not worth a shared package).
export const CONFIDENCE_HIGH = 0.75;
export const CONFIDENCE_MEDIUM = 0.45;

export type ImportTier = 'auto' | 'review' | 'suggestion';

export function tierOf(entry: ResolvedEntry): ImportTier {
  if (entry.confidence >= CONFIDENCE_HIGH) return 'auto';
  if (entry.confidence >= CONFIDENCE_MEDIUM) return 'review';
  return 'suggestion';
}

const PROFILE_BLOCK_TYPE: Record<string, BlockType> = {
  about: 'rich-text',
  gallery: 'image',
  hours: 'rich-text',
  address: 'map',
};

// campaignHero is handled specially below (block type depends on whether
// the source content was text or an image) — not in this table.
const PARTICIPATION_BLOCK_TYPE: Record<string, BlockType> = {
  coupon: 'coupons',
  campaignStory: 'rich-text',
  cta: 'cta',
  campaignImage: 'image',
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function blockTypeFor(target: string, sourceType: ResolvedEntry['sourceType'], table: Record<string, BlockType>): BlockType {
  if (target === 'campaignHero') return sourceType === 'image' ? 'image' : 'rich-text';
  return table[target] ?? 'rich-text';
}

// Overlays ONLY the resolved verbatim field onto a freshly-added block's
// default data — every other field (styling, ctaAction, coupon code/
// expiry, map lat/lng/zoom) stays whatever defaultBlockData() already set,
// untouched. See docs/DECISIONS.md's v1 scope decisions for why coupon
// code/discountLabel/expiresAt and map lat/lng are deliberately left blank
// rather than guessed.
function overlayData(block: CampaignBlock, entry: ResolvedEntry): void {
  switch (block.type) {
    case 'rich-text':
      (block.data as RichTextBlockData).content = `<p>${escapeHtml(entry.value)}</p>`;
      return;
    case 'image':
      (block.data as ImageBlockData).url = entry.value;
      return;
    case 'map':
      (block.data as MapBlockData).address = entry.value;
      return;
    case 'coupons':
      (block.data as CouponsBlockData).description = entry.value;
      return;
    case 'cta':
      (block.data as CtaBlockData).text = entry.value;
      return;
  }
}

function mapOneEntry(state: CampaignStudioStateService, entry: ResolvedEntry, table: Record<string, BlockType>, needsReview: boolean): void {
  const blockType = blockTypeFor(entry.target, entry.sourceType, table);
  const id = state.addBlock(blockType);
  const blocks = [...state.draft.blocks];
  const block = blocks.find((b) => b.id === id);
  if (!block) return;
  overlayData(block, entry);
  if (needsReview) block.importReview = { needsReview: true, confidence: entry.confidence, sourceId: entry.sourceId };
  state.patch({ blocks });
}

function applyAutoAndReview(state: CampaignStudioStateService, entries: ResolvedEntry[], table: Record<string, BlockType>): void {
  for (const entry of entries) {
    const tier = tierOf(entry);
    if (tier === 'suggestion') continue; // never auto-mapped — see acceptSuggestion()
    mapOneEntry(state, entry, table, tier === 'review');
  }
}

// @returns a fresh state + the block-type table to reuse for a later
// acceptSuggestion() call on the same draft (so a manually-accepted
// suggestion maps through the identical rules as the auto/review blocks).
export function buildProfileDraft(entries: ResolvedEntry[], entityId: string, displayName: string): { state: CampaignStudioStateService; table: Record<string, BlockType> } {
  const state = new CampaignStudioStateService();
  state.loadDraft(createInitialPartnerDraft(entityId, displayName));
  applyAutoAndReview(state, entries, PROFILE_BLOCK_TYPE);
  return { state, table: PROFILE_BLOCK_TYPE };
}

// The composed public page (partner-public-page.component.ts) renders
// Campaign Participation blocks BEFORE Partner Profile blocks, precisely so
// a donor sees "why this business is in THIS campaign" before the business's
// own evergreen profile — campaignHero is the block that establishes that
// context, so it must lead the Participation block order regardless of
// which order the resolver happened to return entries in. Stable sort:
// everything else keeps its resolver-returned relative order.
function orderParticipationNarrative(entries: ResolvedEntry[]): ResolvedEntry[] {
  return [...entries].sort((a, b) => {
    const aFirst = a.target === 'campaignHero' ? 0 : 1;
    const bFirst = b.target === 'campaignHero' ? 0 : 1;
    return aFirst - bFirst;
  });
}

export function buildParticipationDraft(entries: ResolvedEntry[], campaignPartnerId: string, title: string): { state: CampaignStudioStateService; table: Record<string, BlockType> } {
  const state = new CampaignStudioStateService();
  state.loadDraft(createInitialCampaignPartnerDraft(campaignPartnerId, title));
  applyAutoAndReview(state, orderParticipationNarrative(entries), PARTICIPATION_BLOCK_TYPE);
  return { state, table: PARTICIPATION_BLOCK_TYPE };
}

// Called when the manager clicks "הוסף" on a low-confidence suggestion in
// the review screen — the ONLY way a suggestion-tier entry ever becomes a
// real block.
export function acceptSuggestion(state: CampaignStudioStateService, entry: ResolvedEntry, table: Record<string, BlockType>): void {
  mapOneEntry(state, entry, table, false);
}

export function draftPayload(state: CampaignStudioStateService): { blocks: CampaignBlock[]; layout: CampaignDraft['layout'] } {
  return { blocks: state.draft.blocks, layout: state.draft.layout };
}
