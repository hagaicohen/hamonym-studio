const svc = require('./platform.service');

function statusFor(err) {
  switch (err.message) {
    case 'Entity not found': return 404;
    default: return 500;
  }
}

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await svc.getDashboardData();
    res.json(dashboard);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getOrganizations = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const { search, status, sortBy, sortDir } = req.query;
    const missingDocs = req.query.missingDocs === '1' || req.query.missingDocs === 'true';
    const noCampaigns = req.query.noCampaigns === '1' || req.query.noCampaigns === 'true';
    const newSince = req.query.newSince ? parseInt(req.query.newSince, 10) : undefined;
    const result = await svc.getOrganizations({ search, status, sortBy, sortDir, page, limit, missingDocs, noCampaigns, newSince });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getOrganization = async (req, res) => {
  try {
    const result = await svc.getOrganizationDetail(req.params.id);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.approve = async (req, res) => {
  try {
    const entity = await svc.approve(req.params.id, req.user.id, req.body.notes);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

function requireNotes(req, res) {
  if (!req.body.notes || !req.body.notes.trim()) {
    res.status(400).json({ error: 'נדרשת הערה' });
    return false;
  }
  return true;
}

exports.reject = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const entity = await svc.reject(req.params.id, req.user.id, req.body.notes, req.body.reasonTags);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.requestChanges = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const entity = await svc.requestChanges(req.params.id, req.user.id, req.body.notes, req.body.reasonTags);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.suspend = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const entity = await svc.suspend(req.params.id, req.user.id, req.body.notes, req.body.reasonTags);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.reactivate = async (req, res) => {
  try {
    const entity = await svc.reactivate(req.params.id, req.user.id, req.body.notes);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};
