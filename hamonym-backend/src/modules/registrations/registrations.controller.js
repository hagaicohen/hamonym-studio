const registrationsService = require('./registrations.service');

exports.getEntityRegistrations = async (req, res) => {
  try {
    const entityId = req.params.id;
    const page     = parseInt(req.query.page  || '0', 10);
    const limit    = parseInt(req.query.limit || '25', 10);
    const { search } = req.query;
    const result = await registrationsService.getEntityRegistrations(entityId, { search, page, limit });
    res.json(result);
  } catch (err) {
    console.error('[getEntityRegistrations] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
