const recurringService = require('./recurring.service');

// Personal Area. Every route here is requireAuth + scoped to req.user.id —
// the three action endpoints below all check verifyOwnership BEFORE calling
// the underlying pauseRecurring/resumeRecurring/cancelRecurring, which take
// no donor context of their own (see recurring.service.js's own comment on
// verifyOwnership for why that check has to live here, not there).
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

// Pause/Resume/Cancel — all three follow the same shape: verify ownership
// first (404 if not this donor's instruction, never a generic 500 that
// would leak "this id exists, just not yours"), then call the underlying
// service function and let ITS thrown error (Cardcom rejection, invalid
// state transition — see recurring.service.js's guards) become a 400. A
// 400 here always means "the action itself is invalid or Cardcom said no"
// — local state is never written in that case (enforced in the service
// layer, not here).
exports.pause = async (req, res) => {
  try {
    const owns = await recurringService.verifyOwnership(req.params.id, req.user.id);
    if (!owns) return res.status(404).json({ error: 'הוראת הקבע לא נמצאה' });

    const result = await recurringService.pauseRecurring(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[recurring.controller.pause]', err.message);
    res.status(400).json({ error: err.message });
  }
};

exports.resume = async (req, res) => {
  try {
    const owns = await recurringService.verifyOwnership(req.params.id, req.user.id);
    if (!owns) return res.status(404).json({ error: 'הוראת הקבע לא נמצאה' });

    const result = await recurringService.resumeRecurring(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[recurring.controller.resume]', err.message);
    res.status(400).json({ error: err.message });
  }
};

exports.cancel = async (req, res) => {
  try {
    const owns = await recurringService.verifyOwnership(req.params.id, req.user.id);
    if (!owns) return res.status(404).json({ error: 'הוראת הקבע לא נמצאה' });

    const result = await recurringService.cancelRecurring(req.params.id);
    res.json(result);
  } catch (err) {
    console.error('[recurring.controller.cancel]', err.message);
    res.status(400).json({ error: err.message });
  }
};
