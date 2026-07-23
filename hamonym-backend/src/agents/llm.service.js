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

// Real internet search, grounded via OpenAI's own web_search tool (Responses
// API — a different endpoint from chat.completions, doesn't support
// response_format: json_object combined with tools, hence plain text out
// rather than reusing complete()'s JSON-mode contract). Same OPENAI_API_KEY,
// no separate search-provider account — billed per OpenAI's own usage-based
// pricing for the tool call (2026-07-23 decision, see
// organization-research.tool.js for the first real caller).
// @param {string} prompt
// @returns {Promise<{ text: string, sources: Array<{title: string, url: string}> }>}
exports.completeWithWebSearch = async (prompt) => {
  const response = await getClient().responses.create({
    model: 'gpt-4o-mini',
    tools: [{ type: 'web_search' }],
    input: prompt,
  });

  const message = response.output?.find((item) => item.type === 'message');
  const content = message?.content?.find((c) => c.type === 'output_text');
  const text = content?.text || '';

  const seen = new Set();
  const sources = (content?.annotations || [])
    .filter((a) => a.type === 'url_citation' && a.url && !seen.has(a.url) && seen.add(a.url))
    .map((a) => ({ title: a.title || a.url, url: a.url }));

  return { text, sources };
};
