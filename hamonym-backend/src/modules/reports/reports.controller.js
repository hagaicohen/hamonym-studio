const svc = require('./reports.service');

exports.getCampaignPerformance = async (req, res) => {
  try {
    const { sortBy, sortDir, search, status, campaignId } = req.query;
    const result = await svc.getCampaignPerformance(req.params.id, { sortBy, sortDir, search, status, campaignId });
    res.json(result);
  } catch (e) {
    console.error('[reports.getCampaignPerformance] error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

exports.getMarketingSources = async (req, res) => {
  try {
    const result = await svc.getMarketingSources(req.params.id);
    res.json(result);
  } catch (e) {
    console.error('[reports.getMarketingSources] error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

exports.getTrends = async (req, res) => {
  try {
    const result = await svc.getTrends(req.params.id);
    res.json(result);
  } catch (e) {
    console.error('[reports.getTrends] error:', e.message);
    res.status(500).json({ error: e.message });
  }
};

exports.getFailures = async (req, res) => {
  try {
    const { search, status, sortBy, sortDir } = req.query;
    const result = await svc.getFailures(req.params.id, { search, status, sortBy, sortDir });
    res.json(result);
  } catch (e) {
    console.error('[reports.getFailures] error:', e.message);
    res.status(500).json({ error: e.message });
  }
};
