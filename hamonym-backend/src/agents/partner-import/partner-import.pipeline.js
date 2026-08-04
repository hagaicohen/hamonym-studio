// PartnerImportPipeline — entry point for AI Website Import. Same
// createTracer()-per-step convention as campaign-creation.pipeline.js.
// Orchestrates: extractor -> cache -> session (extractFromUrl), and
// session -> both Target Resolvers in parallel (classify). Never builds a
// CampaignBlock — that's the frontend mapper's job, kept strictly
// downstream (INVARIANTS 4/5 in partner-import.types.js).

const losslessDomExtractor = require('./extractors/lossless-dom.extractor');
const extractionCache = require('./extraction.cache');
const importSessionStore = require('./import-session.store');
const profileResolver = require('./resolvers/profile-target.resolver');
const participationResolver = require('./resolvers/participation-target.resolver');
const deterministicCloneMapper = require('./deterministic-clone.mapper');
const { rehostImage } = require('./image-rehost.util');
const { computeFoundSignals, findEmail, findPhone } = require('./content-signals.util');
const { createTracer } = require('../trace.util');

// @param {string} url
// @returns {Promise<{ sessionId: string, pageTitle: string, foundSignals: object, extractTimeMs: number }>}
exports.extractFromUrl = async (url) => {
  const tracer = createTracer('PartnerImportPipeline.extractFromUrl');
  const t0 = Date.now();

  let cached = await tracer.trace('ExtractionCache.getFresh', () => extractionCache.getFresh(url),
    (c) => ({ hit: !!c }));

  let extractionCacheId;
  let pageTitle;
  let foundSignals;

  if (cached) {
    extractionCacheId = cached.id;
    pageTitle = cached.pageTitle;
    foundSignals = cached.foundSignals;
  } else {
    const extracted = await tracer.trace('LosslessDomExtractor.extract', () => losslessDomExtractor.extract(url),
      (r) => ({ blockCount: r.blocks.length }));
    foundSignals = computeFoundSignals(extracted.blocks, extracted.pageTitle);
    extractionCacheId = await tracer.trace('ExtractionCache.save',
      () => extractionCache.save({ url, blocks: extracted.blocks, pageTitle: extracted.pageTitle, foundSignals }));
    pageTitle = extracted.pageTitle;
  }

  const sessionId = await tracer.trace('ImportSessionStore.create', () => importSessionStore.create(extractionCacheId));

  tracer.print();
  return { sessionId, pageTitle, foundSignals, extractTimeMs: Date.now() - t0 };
};

// @param {string} sessionId
// @param {{ title: string, shortDescription: string }} campaign
// @returns {Promise<{ profile: object[], participation: object[], contactEmail: string|null, contactPhone: string|null, classificationTimeMs: number }>}
exports.classify = async (sessionId, campaign) => {
  const tracer = createTracer('PartnerImportPipeline.classify');
  const t0 = Date.now();

  const session = await importSessionStore.get(sessionId);
  if (!session) {
    const err = new Error('Import session not found or expired');
    err.status = 404;
    throw err;
  }

  const cached = await extractionCache.getById(session.extractionCacheId);
  if (!cached) {
    const err = new Error('Extraction data not found or expired');
    err.status = 404;
    throw err;
  }

  // campaign is optional — standalone Partner creation (from /partners,
  // no campaign context yet) runs Pass 1 only. Pass 2 needs a real
  // campaign.title to classify against, so an empty/missing campaign
  // skips it rather than asking the LLM to classify against nothing.
  const [profile, participation] = await tracer.trace('Resolvers.both', () => Promise.all([
    profileResolver.resolve(cached.blocks),
    campaign && campaign.title ? participationResolver.resolve(cached.blocks, campaign) : Promise.resolve([]),
  ]), ([p, c]) => ({ profileEntries: p.length, participationEntries: c.length }));

  tracer.print();
  return {
    profile,
    participation,
    contactEmail: findEmail(cached.blocks),
    contactPhone: findPhone(cached.blocks),
    classificationTimeMs: Date.now() - t0,
  };
};

// Deterministic Clone — no LLM, no classification, no review step. Literal
// document-order reproduction of a real page's content into CampaignBlock[],
// images re-hosted to our own storage. See deterministic-clone.mapper.js's
// own header comment for why this is intentionally a separate mechanism
// from extractFromUrl/classify above (which back the reviewable, tiered
// AI Import used from a campaign's reward-linking flow).
// @param {string} url
// @param {string|null} realCampaignSlug - when the manager picked a real campaign in THIS system up front (see controller#clone), any link the source page pointed back at its own "campaign" page is rewritten to this real, guaranteed-to-exist slug instead of a best-effort guess.
// @returns {Promise<{ blocks: object[], pageTitle: string, contactEmail: string|null, contactPhone: string|null }>}
exports.cloneFromUrl = async (url, realCampaignSlug = null) => {
  const tracer = createTracer('PartnerImportPipeline.cloneFromUrl');

  const extracted = await tracer.trace('LosslessDomExtractor.extract', () => losslessDomExtractor.extract(url),
    (r) => ({ blockCount: r.blocks.length }));

  const sourceHostname = new URL(url).hostname;
  const { blocks } = await tracer.trace('DeterministicCloneMapper.mapToBlocks',
    () => deterministicCloneMapper.mapToBlocks(extracted.blocks, rehostImage, sourceHostname, realCampaignSlug),
    (r) => ({ blockCount: r.blocks.length }));

  // The page's own first heading (e.g. a WordPress post's <h1>) is the real
  // business name — document.title (pageTitle) usually has the SITE's own
  // name appended too (found live: "סאפ אוואי - המונים", not "סאפ אוואי"),
  // which is wrong to use as a Partner's display_name. Only fall back to
  // pageTitle if the page genuinely has no heading at all.
  const firstHeading = extracted.blocks.find((b) => b.type === 'heading');
  const businessName = (firstHeading && firstHeading.text) || extracted.pageTitle;

  tracer.print();
  return {
    blocks,
    businessName,
    pageTitle: extracted.pageTitle,
    contactEmail: findEmail(extracted.blocks),
    contactPhone: findPhone(extracted.blocks),
  };
};
