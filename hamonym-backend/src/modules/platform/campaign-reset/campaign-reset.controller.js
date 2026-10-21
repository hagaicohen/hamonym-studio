// Super Admin "סימולציה" tab, tool B -- thin HTTP surface over the EXISTING
// campaign-reset.service.js. No reconciliation logic lives here.
const service = require('../../billing-engine/campaign-reset.service');

function handle(res, label, err) {
  const known = {
    CAMPAIGN_NOT_FOUND: 404,
    MISSING_REASON: 400,
    MISSING_ADMIN_USER: 400,
    STATEMENT_NOT_RESETTABLE: 409,
    ACTIVE_COLLECTION_ATTEMPT: 409,
  };
  const status = known[err.code] || 500;
  if (status === 500) console.error(`[campaign-reset] ${label} error:`, err.message);
  res.status(status).json({ error: err.message, code: err.code });
}

exports.getPreview = async (req, res) => {
  try {
    const preview = await service.getCampaignResetPreview(req.params.id);
    res.json({ preview });
  } catch (err) {
    handle(res, 'getPreview', err);
  }
};

exports.reset = async (req, res) => {
  try {
    const result = await service.resetCampaignDonations({
      campaignId: req.params.id,
      superAdminUserId: req.user.id,
      ip: req.ip,
      reason: req.body.reason,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'reset', err);
  }
};
