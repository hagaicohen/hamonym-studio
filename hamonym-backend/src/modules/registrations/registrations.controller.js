const registrationsService = require('./registrations.service');

exports.getEntityRegistrations = async (req, res) => {
  try {
    const entityId = req.params.id;
    const page     = parseInt(req.query.page  || '0', 10);
    const limit    = parseInt(req.query.limit || '25', 10);
    const { campaignId, search } = req.query;
    const result = await registrationsService.getEntityRegistrations(entityId, { campaignId, search, page, limit });
    res.json(result);
  } catch (err) {
    console.error('[getEntityRegistrations] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

exports.createManualRegistration = async (req, res) => {
  try {
    const entityId = req.params.id;
    const { campaignId, registrationOptionId, participantName, shirtSize, payerName, payerEmail, payerPhone, source, note } = req.body;
    const result = await registrationsService.createManualRegistration(
      entityId,
      { campaignId, registrationOptionId, participantName, shirtSize, payerName, payerEmail, payerPhone, source, note },
      req.user.id
    );
    res.json(result);
  } catch (err) {
    console.error('[createManualRegistration] error:', err.message);
    res.status(400).json({ error: err.message });
  }
};

exports.importBulk = async (req, res) => {
  try {
    const entityId = req.params.id;
    const { campaignId, rows, source } = req.body;
    const result = await registrationsService.importBulk(entityId, campaignId, rows ?? [], source, req.user.id);
    res.json(result);
  } catch (err) {
    console.error('[importBulk registrations] error:', err.message);
    res.status(400).json({ error: err.message });
  }
};
