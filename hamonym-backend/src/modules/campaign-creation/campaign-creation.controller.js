// HTTP layer for AI-Assisted Campaign Creation — thin, calls straight into
// the pipeline (src/agents/campaign-creation/). No business logic here,
// same split as campaigns.controller.js calling campaignAdvisorAgent.
const pipeline =
  require('../../agents/campaign-creation/campaign-creation.pipeline');

const { WebsiteFetchError } =
  require('../../agents/campaign-creation/extractors/website.extractor');

function getStatusCode(error) {
  if (error.message === 'Source and input are required') return 400;
  if (error instanceof WebsiteFetchError) return 400;
  return 500;
}

function getErrorMessage(error) {
  if (error.message === 'Source and input are required') return 'חסר קלט';
  if (error instanceof WebsiteFetchError) return error.message; // already Hebrew, user-facing (see website.extractor.js)
  return 'משהו השתבש, נסו שוב';
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
