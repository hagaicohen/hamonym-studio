const recurringService = require('./recurring.service');

// Personal Area (Phase 1 — read-only). Pause/Resume/Cancel actions are a
// separate, later phase — see docs/CARDCOM_OPERATIONAL_PROCESSES.md-adjacent
// Personal Area plan. Every route here is requireAuth + scoped to req.user.id.
exports.getMyRecurring = async (req, res) => {
  try {
    const instructions = await recurringService.getMyRecurringInstructions(req.user.id);
    res.json({ instructions });
  } catch (err) {
    console.error('[recurring.controller.getMyRecurring]', err.message);
    res.status(500).json({ error: 'שגיאה בטעינת הוראות הקבע' });
  }
};

exports.getHistory = async (req, res) => {
  try {
    const owns = await recurringService.verifyOwnership(req.params.id, req.user.id);
    if (!owns) return res.status(404).json({ error: 'הוראת הקבע לא נמצאה' });

    const history = await recurringService.getRecurringDonationHistory(req.params.id);
    res.json({ history });
  } catch (err) {
    console.error('[recurring.controller.getHistory]', err.message);
    res.status(500).json({ error: 'שגיאה בטעינת היסטוריית חיובים' });
  }
};
