const service = require('../../billing-engine/platform-billing-settings.service');

exports.get = async (req, res) => {
  try {
    const setting = await service.getSetting();
    res.json({ setting });
  } catch (err) {
    console.error('[platform-billing-settings] get error:', err.message);
    res.status(500).json({ error: 'Failed to fetch platform billing settings' });
  }
};

exports.update = async (req, res) => {
  try {
    const setting = await service.setVatRate({
      vatRate: req.body.vatRate,
      superAdminUserId: req.user.id,
      ip: req.ip,
    });
    res.json({ setting });
  } catch (err) {
    const status = err.code === 'MISSING_VAT_RATE' || err.code === 'INVALID_VAT_RATE' ? 400 : 500;
    if (status === 500) console.error('[platform-billing-settings] update error:', err.message);
    res.status(status).json({ error: err.message });
  }
};
