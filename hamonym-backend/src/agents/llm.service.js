// Shared across all agents (ApprovalAgent, CampaignAdvisorAgent, ...) — a
// thin, generic OpenAI wrapper. No agent-specific knowledge here; each
// agent's own SYSTEM_PROMPT + user prompt fully determine the shape of the
// parsed JSON returned.
const OpenAI = require('openai');

let client = null;
function getClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

// @param {string} systemPrompt
// @param {string} userPrompt
// @param {{ temperature?: number }} [options] - temperature is omitted by
//   default (OpenAI's own default applies) to leave existing callers
//   (ApprovalAgent, CampaignAdvisorAgent — advice/judgment prose, where some
//   variance is fine) unaffected. Pass temperature: 0 for callers doing
//   deterministic fact extraction, where run-to-run consistency matters more
//   than phrasing variety (see campaign-creation's free-text.extractor.js).
// @returns {Promise<object>} parsed JSON — shape is whatever the caller's prompt asked for.
exports.complete = async (systemPrompt, userPrompt, options = {}) => {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return JSON.parse(response.choices[0].message.content);
};
