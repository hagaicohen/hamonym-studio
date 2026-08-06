const svc = require('./platform.service');
const approvalAgent = require('../../agents/approval/approval.agent');

function statusFor(err) {
  switch (err.message) {
    case 'Entity not found': return 404;
    case 'Campaign not found': return 404;
    case 'User not found': return 404;
    case 'Invalid status': return 400;
    case 'Cannot modify own account': return 400;
    case 'Cannot impersonate self': return 400;
    case 'Cannot impersonate a super admin': return 400;
    case 'Email is required': return 400;
    case 'Email already exists': return 409;
    default: return 500;
  }
}

exports.getNotificationsCount = async (req, res) => {
  try {
    const result = await svc.getNotificationsCount();
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await svc.getDashboardData();
    res.json(dashboard);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getActivity = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '20', 10);
    const { type, sortDir } = req.query;
    const result = await svc.getActivityFeed({ type, sortDir, page, limit });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getOrganizations = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const { search, status, sortBy, sortDir } = req.query;
    const missingDocs = req.query.missingDocs === '1' || req.query.missingDocs === 'true';
    const flaggedForReview = req.query.flaggedForReview === '1' || req.query.flaggedForReview === 'true';
    const noCampaigns = req.query.noCampaigns === '1' || req.query.noCampaigns === 'true';
    const newSince = req.query.newSince ? parseInt(req.query.newSince, 10) : undefined;
    const result = await svc.getOrganizations({ search, status, sortBy, sortDir, page, limit, missingDocs, flaggedForReview, noCampaigns, newSince });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getPartners = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const { search, sortBy, sortDir } = req.query;
    const noCampaigns = req.query.noCampaigns === '1' || req.query.noCampaigns === 'true';
    const hidden = req.query.hidden === '1' || req.query.hidden === 'true';
    const newSince = req.query.newSince ? parseInt(req.query.newSince, 10) : undefined;
    const result = await svc.getPartners({ search, sortBy, sortDir, page, limit, noCampaigns, hidden, newSince });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getOrganization = async (req, res) => {
  try {
    const result = await svc.getOrganizationDetail(req.params.id);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.analyzeOrganization = async (req, res) => {
  try {
    const context = await approvalAgent.analyze(req.params.id);
    res.json(context);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.recommendOrganization = async (req, res) => {
  try {
    const result = await approvalAgent.recommend(req.params.id);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.approve = async (req, res) => {
  try {
    const entity = await svc.approve(req.params.id, req.user.id, req.body.notes, null, req.ip);
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
    const entity = await svc.reject(req.params.id, req.user.id, req.body.notes, req.body.reasonTags, req.ip);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.requestChanges = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const entity = await svc.requestChanges(req.params.id, req.user.id, req.body.notes, req.body.reasonTags, req.ip);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.suspend = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const entity = await svc.suspend(req.params.id, req.user.id, req.body.notes, req.body.reasonTags, req.ip);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.reactivate = async (req, res) => {
  try {
    const entity = await svc.reactivate(req.params.id, req.user.id, req.body.notes, null, req.ip);
    res.json({ entity });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.hardDelete = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const result = await svc.hardDeleteEntity(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.getCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const { search, status, entityId, sortBy, sortDir } = req.query;
    const showDeleted = req.query.showDeleted === '1' || req.query.showDeleted === 'true';
    const featuredOnly = req.query.featuredOnly === '1' || req.query.featuredOnly === 'true';
    const result = await svc.getCampaigns({ search, status, entityId, sortBy, sortDir, page, limit, showDeleted, featuredOnly });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getCampaign = async (req, res) => {
  try {
    const result = await svc.getCampaignDetail(req.params.id);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

const VALID_CAMPAIGN_STATUSES = ['draft', 'published', 'paused', 'ended'];
const NOTES_REQUIRED_STATUSES = ['paused', 'ended'];

exports.setCampaignStatus = async (req, res) => {
  const status = req.body.status;
  if (!VALID_CAMPAIGN_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'סטטוס לא תקין' });
  }
  if (NOTES_REQUIRED_STATUSES.includes(status) && !requireNotes(req, res)) return;
  try {
    const campaign = await svc.setCampaignStatus(req.params.id, req.user.id, status, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.setCampaignFeatured = async (req, res) => {
  try {
    const campaign = await svc.setCampaignFeatured(req.params.id, req.user.id, req.body.featured === true, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.setCampaignLocked = async (req, res) => {
  const locked = req.body.locked === true;
  if (locked && !requireNotes(req, res)) return;
  try {
    const campaign = await svc.setCampaignLocked(req.params.id, req.user.id, locked, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.deleteCampaign = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const campaign = await svc.softDeleteCampaign(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.restoreCampaign = async (req, res) => {
  try {
    const campaign = await svc.restoreCampaign(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.transferCampaignOwnership = async (req, res) => {
  if (!req.body.entityId) return res.status(400).json({ error: 'יש לבחור עמותת יעד' });
  if (!requireNotes(req, res)) return;
  try {
    const campaign = await svc.transferCampaignOwnership(req.params.id, req.user.id, req.body.entityId, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.setCampaignSlug = async (req, res) => {
  const slug = (req.body.slug || '').trim();
  // Hebrew allowed — matches the regular campaign editor's own slug field
  // (campaign-basic-step.component.ts#onSlugChange, [a-z0-9א-ת-]), which
  // this endpoint's validation had drifted from.
  if (!slug || !/^[a-z0-9א-ת-]+$/.test(slug)) {
    return res.status(400).json({ error: 'כתובת לא תקינה — אותיות (עברית/לועזית קטנות), מספרים ומקפים בלבד' });
  }
  if (!requireNotes(req, res)) return;
  try {
    const campaign = await svc.setCampaignSlug(req.params.id, req.user.id, slug, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'כתובת הקמפיין כבר קיימת' });
    res.status(statusFor(e)).json({ error: e.message });
  }
};

exports.duplicateCampaign = async (req, res) => {
  try {
    const campaign = await svc.duplicateCampaign(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json({ campaign });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.getRoles = async (req, res) => {
  try {
    const roles = await svc.getRoles();
    res.json({ roles });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page || '0', 10);
    const limit = parseInt(req.query.limit || '25', 10);
    const { search, status, sortBy, sortDir } = req.query;
    const roleId = req.query.roleId ? parseInt(req.query.roleId, 10) : undefined;
    const result = await svc.getUsers({ search, roleId, status, sortBy, sortDir, page, limit });
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
};

exports.getUser = async (req, res) => {
  try {
    const result = await svc.getUserDetail(req.params.id);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.setUserActive = async (req, res) => {
  const active = req.body.active === true;
  if (!active && !requireNotes(req, res)) return;
  try {
    const user = await svc.setUserActive(req.params.id, req.user.id, active, req.body.notes, req.ip);
    res.json({ user });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.deleteUser = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const user = await svc.softDeleteUser(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json({ user });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.restoreUser = async (req, res) => {
  try {
    const user = await svc.restoreUser(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json({ user });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.generatePasswordResetLink = async (req, res) => {
  try {
    const result = await svc.generatePasswordResetLink(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.impersonateUser = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const result = await svc.impersonateUser(req.params.id, req.user.id, req.body.notes, req.ip);
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.setUserSuperAdmin = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const user = await svc.setUserSuperAdmin(req.params.id, req.user.id, req.body.isSuperAdmin === true, req.body.notes, req.ip);
    res.json({ user });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.setUserPermissions = async (req, res) => {
  if (!requireNotes(req, res)) return;
  try {
    const user = await svc.setUserPermissions(req.params.id, req.user.id, req.body.permissions, req.body.notes, req.ip);
    res.json({ user });
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};

exports.createAdminUser = async (req, res) => {
  if (!req.body.email || !req.body.email.trim()) {
    return res.status(400).json({ error: 'יש להזין אימייל' });
  }
  try {
    const result = await svc.createAdminUser({
      email: req.body.email,
      fullName: req.body.fullName,
      isSuperAdmin: req.body.isSuperAdmin === true,
      permissions: req.body.permissions,
      superAdminUserId: req.user.id,
      notes: req.body.notes,
      ip: req.ip,
    });
    res.json(result);
  } catch (e) { res.status(statusFor(e)).json({ error: e.message }); }
};
