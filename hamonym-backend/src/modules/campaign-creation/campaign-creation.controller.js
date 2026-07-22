// HTTP layer for AI-Assisted Campaign Creation — thin, calls straight into
// the pipeline (src/agents/campaign-creation/). No business logic here,
// same split as campaigns.controller.js calling campaignAdvisorAgent.
const pipeline =
  require('../../agents/campaign-creation/campaign-creation.pipeline');

const { WebsiteFetchError } =
  require('../../agents/campaign-creation/extractors/website.extractor');

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
    const brief = await pipeline.buildBriefFromFacts(facts);

    res.json({ facts, brief });
  } catch (err) {
    console.error(err);
    res
      .status(getStatusCode(err))
      .json({ error: getErrorMessage(err) });
  }
};
