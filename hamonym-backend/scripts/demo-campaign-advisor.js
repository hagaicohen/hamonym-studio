require('dotenv').config();
const campaignAdvisorAgent = require('../src/agents/campaign-advisor/campaign-advisor.agent');

const campaignId = process.argv[2];
const userId = process.argv[3];
if (!campaignId || !userId) {
  console.error('Usage: node scripts/demo-campaign-advisor.js <campaignId> <userId>');
  process.exit(1);
}

campaignAdvisorAgent.advise(campaignId, userId)
  .then((response) => {
    console.log(JSON.stringify(response, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
