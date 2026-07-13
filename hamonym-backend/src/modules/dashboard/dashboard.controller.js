const dashboardService = require('./dashboard.service');

exports.getDashboard = async (req, res) => {
  try {
    const { from, to } = req.query;
    const data = await dashboardService.getDashboardData(req.params.id, { from, to });
    res.json(data);
  } catch (err) {
    console.error('getDashboard error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.getAlertCount = async (req, res) => {
  try {
    const count = await dashboardService.getAlertCount(req.params.id);
    res.json({ count });
  } catch (err) {
    console.error('getAlertCount error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
