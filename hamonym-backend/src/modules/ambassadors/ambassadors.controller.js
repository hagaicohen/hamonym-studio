const svc = require('./ambassadors.service');

function statusFor(err) {
  switch (err.message) {
    case 'Unauthorized':        return 403;
    case 'Ambassador not found': return 404;
    case 'Has donations':       return 409;
    case 'Name required':
    case 'No fields supplied':
    case 'Amount must be positive': return 400;
    default:                    return 500;
  }
}

exports.list = async (req, res) => {
  try {
    const ambassadors = await svc.list(req.user.id, req.params.campaignId);
    res.json({ ambassadors });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.create = async (req, res) => {
  try {
    const ambassador = await svc.create(req.user.id, req.params.campaignId, req.body);
    res.status(201).json({ ambassador });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.update = async (req, res) => {
  try {
    const ambassador = await svc.update(req.user.id, req.params.id, req.body);
    res.json({ ambassador });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.remove = async (req, res) => {
  try {
    await svc.remove(req.user.id, req.params.id);
    res.status(204).end();
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.importBulk = async (req, res) => {
  try {
    const result = await svc.importBulk(req.user.id, req.params.campaignId, req.body.rows ?? []);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.addAdjustment = async (req, res) => {
  try {
    await svc.addAdjustment(req.user.id, req.params.id, req.body.amount, req.body.reason);
    res.status(204).end();
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.listPublic = async (req, res) => {
  try {
    const ambassadors = await svc.listPublic(req.params.campaignSlug);
    res.json({ ambassadors });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getBySlug = async (req, res) => {
  try {
    const ambassador = await svc.getBySlug(req.params.campaignSlug, req.params.ambassadorSlug);
    res.json({ ambassador });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.selfRegister = async (req, res) => {
  try {
    const result = await svc.selfRegister(req.params.campaignSlug, req.body);
    res.status(201).json(result);
  } catch (e) {
    const status = e.message === 'Campaign not found' ? 404
      : e.message === 'Name required' ? 400 : 500;
    res.status(status).json({ error: e.message });
  }
};
