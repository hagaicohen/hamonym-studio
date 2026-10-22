const router = require('express').Router();
const requireSuperAdmin = require('../../../middleware/require-super-admin');
const service = require('../../billing-engine/business-clock-simulation.service');
router.use(requireSuperAdmin);
router.get('/', async (req, res) => {
  try { res.json(await service.status()); }
  catch (err) { res.status(err.status || 503).json({ code: err.code, error: err.message }); }
});
router.post('/set-fixed', async (req, res) => {
  try { res.json(await service.setFixed(req.body.isoDatetime, req.user.id)); }
  catch (err) { res.status(err.status || 503).json({ code: err.code, error: err.message }); }
});

router.post('/enabled', async (req, res) => {
  try { res.json(await service.setEnabled(req.body.enabled, req.user.id)); }
  catch (err) { res.status(err.status || 503).json({ code: err.code, error: err.message }); }
});
router.post('/reset', async (req, res) => {
  try { res.json(await service.reset(req.user.id)); }
  catch (err) { res.status(err.status || 503).json({ code: err.code, error: err.message }); }
});
module.exports = router;
