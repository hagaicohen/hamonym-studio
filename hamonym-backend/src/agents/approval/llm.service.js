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
// @returns {Promise<import('./approval.types').ApprovalRecommendation>}
exports.getApprovalRecommendation = async (systemPrompt, userPrompt) => {
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
