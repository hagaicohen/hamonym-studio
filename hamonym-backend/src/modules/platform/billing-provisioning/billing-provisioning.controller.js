const service = require('../../billing-engine/provisioning.service');

function statusFor(err) {
  switch (err.code) {
    case 'ENTITY_NOT_FOUND': return 404;
    case 'BILLING_ACCOUNT_ALREADY_EXISTS': return 409;
    case 'MISSING_FEE_RATE':
    case 'MISSING_VAT_RATE':
    case 'MISSING_COLLECTION_METHOD':
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
      vatRate: req.body.vatRate,
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
