// HTTP layer for AI-Assisted Campaign Creation — thin, calls straight into
// the pipeline (src/agents/campaign-creation/). No business logic here,
// same split as campaigns.controller.js calling campaignAdvisorAgent.
const pipeline =
  require('../../agents/campaign-creation/campaign-creation.pipeline');

const { WebsiteFetchError } =
  require('../../agents/campaign-creation/extractors/website.extractor');

const organizationResearchTool =
  require('../../agents/campaign-creation/tools/organization-research.tool');

function getStatusCode(error) {
  if (error.message === 'Source and input are required') return 400;
  if (error.message === 'At least one of text, a website URL, or a file is required') return 400;
  if (error instanceof WebsiteFetchError) return 400;
  return 500;
}

function getErrorMessage(error) {
  if (error.message === 'Source and input are required') return 'חסר קלט';
  if (error.message === 'At least one of text, a website URL, or a file is required') return 'צריך למלא לפחות דבר אחד — טקסט, קישור לאתר, או קובץ';
  if (error instanceof WebsiteFetchError) return error.message; // already Hebrew, user-facing (see website.extractor.js)
  return 'משהו השתבש, נסו שוב';
}

// Shared by extract-documents and refine-brief so a refine round asks for
// research the same way the first round did — organization-research.tool.js
// is cache-backed (30-day TTL), so re-requesting it here on refine is
// effectively free/instant when it's the same org, not a second real
// web_search call.
async function resolveResearch(enableWebResearch, organizationName, websiteUrl) {
  if (!enableWebResearch) return null;
  return organizationResearchTool.research({ organizationName, websiteUrl: websiteUrl || null });
}

// POST /api/campaign-creation/extract
// body: { source: 'free_text' | 'website', input: string }
// Single-shot, no session (ADR decision 2) — this call does Extraction +
// Brief in one round trip because the entry screen shows both together;
// nothing here creates/updates a Draft yet (out of this screen's scope).
exports.extractAndBuildBrief = async (req, res) => {
  try {
    const { source, input } = req.body;
    if (!source || !input || !input.trim()) {
      throw new Error('Source and input are required');
    }

    const facts = source === 'website'
      ? await pipeline.extractFromWebsite(input.trim())
      : await pipeline.extractFromFreeText(input.trim());

    const brief = await pipeline.buildBriefFromFacts(facts);

    res.json({ facts, brief });
  } catch (err) {
    console.error(err);
    res
      .status(getStatusCode(err))
      .json({ error: getErrorMessage(err) });
  }
};

// POST /api/campaign-creation/map-to-draft
// body: { brief: Brief }
// Deterministic, no LLM (Sprint 3's draft.builder.js, unexposed until now).
// Returns field-name-verified patches meant to be merged onto the frontend's
// own CampaignDraft/OrganizationRegistrationState defaults via their
// existing .patch()/save() methods — this endpoint never creates anything
// itself, it only maps Brief -> the same field shapes those services expect.
exports.mapToDraft = (req, res) => {
  try {
    const { brief } = req.body;
    if (!brief) {
      throw new Error('Brief is required');
    }
    res.json(pipeline.mapBriefToDraftPatches(brief));
  } catch (err) {
    console.error(err);
    res.status(err.message === 'Brief is required' ? 400 : 500)
      .json({ error: err.message === 'Brief is required' ? 'חסר Brief' : 'משהו השתבש' });
  }
};

// POST /api/campaign-creation/extract-documents (multipart/form-data)
// Combined intake — any mix of the three, all optional individually:
// fields: files[] (uploaded files), filesMeta (JSON string, array of
// { typeLabel, note } in the same order as files), freeText, websiteUrl.
exports.extractFromDocuments = async (req, res) => {
  try {
    const uploaded = req.files || [];
    const freeText = (req.body.freeText || '').trim();
    const websiteUrl = (req.body.websiteUrl || '').trim();

    if (!uploaded.length && !freeText && !websiteUrl) {
      throw new Error('At least one of text, a website URL, or a file is required');
    }

    let meta = [];
    try {
      meta = JSON.parse(req.body.filesMeta || '[]');
    } catch {
      meta = [];
    }

    const files = uploaded.map((f, i) => ({
      buffer: f.buffer,
      mimeType: f.mimetype,
      typeLabel: meta[i]?.typeLabel || 'קובץ',
      note: meta[i]?.note || '',
    }));

    const facts = await pipeline.extractFromDocuments(files, freeText, websiteUrl);

    // Explicit opt-in only (2026-07-23) — a real web_search call costs
    // money and adds latency, so this only runs when the user deliberately
    // checked the box, never automatically. facts.organizationName/
    // socialLinks come from what was actually extracted, not raw user
    // input, so this stays grounded in the same Facts the rest of the Brief
    // is built from.
    const enableWebResearch = req.body.enableWebResearch === 'true';
    const research = await resolveResearch(enableWebResearch, facts.organizationName, websiteUrl || facts.socialLinks?.[0]);

    // Labeled "image1", "image2"... in upload order — the SAME order/filter
    // the frontend applies to its own files() signal (image mimetypes,
    // excluding anything tagged "לוגו" — a logo isn't a hero/gallery
    // candidate, it's handled as its own separate upload) when mapping
    // galleryCuration's codes back to real File objects, so the indices
    // line up without any id round-tripping.
    const images = files
      .filter((f) => f.mimeType.startsWith('image/') && f.typeLabel !== 'לוגו')
      .map((f, i) => ({ label: `image${i + 1}`, mimeType: f.mimeType, buffer: f.buffer }));

    const brief = await pipeline.buildBriefFromFacts(facts, research, undefined, images);

    res.json({ facts, brief, enableWebResearch, websiteUrl });
  } catch (err) {
    console.error(err);
    res
      .status(getStatusCode(err))
      .json({ error: getErrorMessage(err) });
  }
};

// POST /api/campaign-creation/refine-brief (application/json)
// body: { facts: ExtractedFacts, userAnswers: Array<{question, answer}>,
//   enableWebResearch?: boolean, websiteUrl?: string }
// Second round of the clarifyingQuestions flow (2026-07-23) — takes the
// SAME facts already extracted (no re-extraction, nothing new to parse)
// plus the campaign manager's own answers, and rebuilds just the Brief.
// Deliberately NOT a multi-turn/session agent (ADR decision 2 still holds):
// this is one more ordinary, stateless request — the frontend carries facts
// forward, the backend has no memory of the first round at all.
exports.refineBrief = async (req, res) => {
  try {
    const { facts, userAnswers, enableWebResearch, websiteUrl } = req.body;
    if (!facts) {
      throw new Error('Facts is required');
    }

    const research = await resolveResearch(!!enableWebResearch, facts.organizationName, websiteUrl || facts.socialLinks?.[0]);
    const brief = await pipeline.buildBriefFromFacts(facts, research, userAnswers);

    res.json({ brief });
  } catch (err) {
    console.error(err);
    res.status(err.message === 'Facts is required' ? 400 : 500)
      .json({ error: err.message === 'Facts is required' ? 'חסר Facts' : 'משהו השתבש, נסו שוב' });
  }
};
