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
// @returns {Promise<object>} parsed JSON — shape is whatever the caller's prompt asked for.
exports.complete = async (systemPrompt, userPrompt) => {
  const response = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  return JSON.parse(response.choices[0].message.content);
};
