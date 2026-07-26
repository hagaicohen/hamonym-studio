require('dotenv').config();
const approvalAgent = require('../src/agents/approval/approval.agent');

const entityId = process.argv[2];
if (!entityId) {
  console.error('Usage: node scripts/demo-approval-recommend.js <entityId>');
  process.exit(1);
}

approvalAgent.recommend(entityId)
  .then((recommendation) => {
    console.log(JSON.stringify(recommendation, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
