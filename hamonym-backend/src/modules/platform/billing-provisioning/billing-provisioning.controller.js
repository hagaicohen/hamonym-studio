const service = require('../../billing-engine/provisioning.service');

function statusFor(err) {
  switch (err.code) {
    case 'ENTITY_NOT_FOUND':
    case 'BILLING_PERIOD_NOT_FOUND':
      return 404;
    case 'BILLING_ACCOUNT_ALREADY_EXISTS': return 409;
    case 'MISSING_FEE_RATE':
    case 'MISSING_COLLECTION_METHOD':
    case 'NO_BILLING_ACCOUNT':
    case 'BILLING_ACCOUNT_NOT_ACTIVE':
    case 'PERIOD_NOT_CALCULATED':
      return 400;
    default: return 500;
  }
}

exports.listUnprovisioned = async (req, res) => {
  try {
    const entities = await service.listUnprovisionedActiveEntities();
    res.json({ entities });
  } catch (err) {
    console.error('[billing-provisioning] listUnprovisioned error:', err.message);
    res.status(500).json({ error: 'Failed to list unprovisioned entities' });
  }
};

exports.listReadiness = async (req, res) => {
  try {
    const entities = await service.listBillingReadiness();
    res.json({ entities });
  } catch (err) {
    console.error('[billing-provisioning] listReadiness error:', err.message);
    res.status(500).json({ error: 'Failed to list billing readiness' });
  }
};

exports.getByEntityId = async (req, res) => {
  try {
    const account = await service.getBillingAccountByEntityId(req.params.entityId);
    res.json({ account });
  } catch (err) {
    console.error('[billing-provisioning] getByEntityId error:', err.message);
    res.status(500).json({ error: 'Failed to fetch billing account' });
  }
};

exports.create = async (req, res) => {
  try {
    const account = await service.createBillingAccount({
      entityId: req.body.entityId,
      feeRate: req.body.feeRate,
      preferredCollectionMethod: req.body.preferredCollectionMethod,
      enforcementStatus: req.body.enforcementStatus,
      masavCeiling: req.body.masavCeiling,
      superAdminUserId: req.user.id,
      notes: req.body.notes,
      ip: req.ip,
    });
    res.status(201).json({ account });
  } catch (err) {
    if (statusFor(err) === 500) console.error('[billing-provisioning] create error:', err.message);
    res.status(statusFor(err)).json({ error: err.message });
  }
};

// FIN-02 — supplemental Statement for one entity inside an already-
// calculated period (e.g. its billing account didn't exist yet when that
// period's one production run executed). Never approves, never collects,
// never touches CardCom — see provisioning.service.js#calculateSupplementalStatement.
exports.calculateSupplemental = async (req, res) => {
  try {
    const result = await service.calculateSupplementalStatement({
      periodId: req.body.periodId,
      entityId: req.params.entityId,
      superAdminUserId: req.user.id,
      ip: req.ip,
    });
    res.status(result.alreadyExists ? 200 : 201).json(result);
  } catch (err) {
    if (statusFor(err) === 500) console.error('[billing-provisioning] calculateSupplemental error:', err.message);
    res.status(statusFor(err)).json({ error: err.message });
  }
};
