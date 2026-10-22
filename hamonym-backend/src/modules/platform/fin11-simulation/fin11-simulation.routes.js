const router = require('express').Router();
const requireSuperAdmin = require('../../../middleware/require-super-admin');
const service = require('../../billing-engine/fin11-simulation.service');
router.use(requireSuperAdmin);
router.get('/', async (req, res) => {
  try { res.json(await service.status()); }
  catch (err) { res.status(err.status || 503).json({ code: err.code, error: err.message }); }
});
router.post('/set-fixed', async (req, res) => {
  try { res.json(await service.advance(req.body.isoDatetime, req.user.id)); }
  catch (err) { res.status(err.status || 503).json({ code: err.code, error: err.message }); }
});
module.exports = router;
