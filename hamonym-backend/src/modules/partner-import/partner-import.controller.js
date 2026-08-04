// HTTP layer for AI Website Import — thin, calls straight into the
// pipeline (src/agents/partner-import/) plus the existing
// entities/campaign-partners services for the actual create+link+save
// work in apply(). No business logic here, same split as
// campaign-creation.controller.js calling campaign-creation.pipeline.js.

const pipeline = require('../../agents/partner-import/partner-import.pipeline');
const { LosslessExtractionError } = require('../../agents/partner-import/extractors/lossless-dom.extractor');
const idempotencyStore = require('../../agents/partner-import/idempotency.store');
const importLog = require('../../agents/partner-import/partner-import-log');
const entitiesService = require('../entities/entities.service');
const campaignPartnersService = require('../campaign-partners/campaign-partners.service');
const campaignsService = require('../campaigns/campaigns.service');

function getStatusCode(error) {
  if (error.message === 'URL is required') return 400;
  if (error instanceof LosslessExtractionError) return 400;
  return error.status || 500;
}

function getErrorMessage(error) {
  if (error.message === 'URL is required') return 'חסר קישור לאתר';
  if (error instanceof LosslessExtractionError) return error.message;
  return error.status ? error.message : 'משהו השתבש, נסו שוב';
}

// POST /api/partner-import/extract
// body: { url: string }
exports.extract = async (req, res) => {
  try {
    const url = (req.body.url || '').trim();
    if (!url) throw new Error('URL is required');

    const { sessionId, pageTitle, foundSignals, extractTimeMs } = await pipeline.extractFromUrl(url);
    res.json({ sessionId, pageTitle, foundSignals, extractTimeMs });
  } catch (err) {
    console.error(err);
    res.status(getStatusCode(err)).json({ error: getErrorMessage(err) });
  }
};

// POST /api/partner-import/classify
// body: { sessionId: string, campaign: { title: string, shortDescription: string } }
exports.classify = async (req, res) => {
  try {
    const { sessionId, campaign } = req.body;
    if (!sessionId) throw new Error('sessionId is required');

    const result = await pipeline.classify(sessionId, campaign || {});
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'משהו השתבש, נסו שוב' });
  }
};

// POST /api/partner-import/apply
// body: { idempotencyKey, sessionId, campaignId?, rewardId?, displayName, website,
//         contactEmail, contactPhone, profileDraft: {blocks, layout},
//         participationDraft?: {blocks, layout}, metrics }
// Atomic: create entity + add 'partner' role + (if campaignId given) link to
// campaign + save profile draft (+ participation draft) — one request. See
// docs/DECISIONS.md for why this replaced a frontend-orchestrated multi-call
// sequence (idempotency needs one point of truth to dedupe against, and a
// partial failure partway through a multi-call frontend sequence is a real
// bad state to leave behind).
//
// campaignId is optional — standalone Partner creation from /partners (the
// "URL → create exactly that" option, no campaign involved yet) creates just
// the entity + Profile draft; campaignPartner is null in that case.
exports.apply = async (req, res) => {
  const { idempotencyKey } = req.body;
  try {
    if (idempotencyKey) {
      const existing = await idempotencyStore.getResult(idempotencyKey);
      if (existing) return res.json(existing);
    }

    const {
      sessionId, campaignId, rewardId, displayName, website, contactEmail, contactPhone,
      profileDraft, participationDraft, metrics,
    } = req.body;

    if (!displayName || !displayName.trim()) throw new Error('displayName is required');

    const entity = await entitiesService.createEntity({
      userId: req.user.id,
      data: { display_name: displayName.trim(), website: website || null, contact_email: contactEmail || null, contact_phone: contactPhone || null },
    });
    await entitiesService.addRole(entity.id, 'partner');

    await entitiesService.updateDraft(entity.id, {
      blocks: profileDraft?.blocks || [],
      layout: profileDraft?.layout || {},
    });

    let campaignPartner = null;
    if (campaignId) {
      campaignPartner = await campaignPartnersService.create(req.user.id, campaignId, {
        partnerEntityId: entity.id,
        rewardId: rewardId || null,
      });
      await campaignPartnersService.updateDraft(req.user.id, campaignPartner.id, {
        blocks: participationDraft?.blocks || [],
        layout: participationDraft?.layout || {},
      });
    }

    const result = { entity, campaignPartner };
    if (idempotencyKey) await idempotencyStore.saveResult(idempotencyKey, result);

    importLog.logImport({ sessionId, ...metrics }); // fire-and-forget, never blocks the response

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.status ? err.message : 'משהו השתבש, נסו שוב' });
  }
};

// POST /api/partner-import/clone
// body: { url, displayName?, campaignId? }
// Deterministic Clone (2026-08-02) — the standalone /partners "URL → build
// it, no review" option. One request does extract + map + create entity +
// role + Profile draft, atomically. No LLM, no classification, no
// idempotency key (unlike apply() above, a manager can just re-run this if
// something goes wrong — it's a single call, nothing multi-step to dedupe).
//
// campaignId is optional but strongly encouraged by the frontend UI — the
// source page's own "לתרומה"/"חזרה לקמפיין" buttons only have somewhere
// real to point once we know which campaign in THIS system this Partner is
// actually joining (see deterministic-clone.mapper.js). When given, also
// creates the real campaign_partners link — same relationship the manual/
// AI-Import creation paths create, just via a third route in.
exports.clone = async (req, res) => {
  try {
    const url = (req.body.url || '').trim();
    if (!url) throw new Error('URL is required');

    const campaignId = req.body.campaignId || null;
    let campaign = null;
    if (campaignId) {
      campaign = await campaignsService.getCampaignById({ userId: req.user.id, campaignId });
      if (!campaign) throw Object.assign(new Error('הקמפיין שנבחר לא נמצא, או שאין לך גישה אליו'), { status: 404 });
    }

    const cloned = await pipeline.cloneFromUrl(url, campaign?.slug || null);
    const displayName = (req.body.displayName || cloned.businessName || cloned.pageTitle || '').trim();
    if (!displayName) throw new Error('displayName is required');

    const entity = await entitiesService.createEntity({
      userId: req.user.id,
      data: {
        display_name: displayName,
        website: url,
        contact_email: cloned.contactEmail || null,
        contact_phone: cloned.contactPhone || null,
      },
    });
    await entitiesService.addRole(entity.id, 'partner');
    await entitiesService.updateDraft(entity.id, { blocks: cloned.blocks, layout: {} });

    let campaignPartner = null;
    if (campaignId) {
      campaignPartner = await campaignPartnersService.create(req.user.id, campaignId, {
        partnerEntityId: entity.id,
        rewardId: null,
      });
    }

    res.json({ entity, campaignPartner });
  } catch (err) {
    console.error(err);
    res.status(err.status || getStatusCode(err)).json({ error: err.status ? err.message : getErrorMessage(err) });
  }
};
