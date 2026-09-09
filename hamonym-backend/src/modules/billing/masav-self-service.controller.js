// Entity self-service MASAV setup -- lets an association configure its own
// entity_masav_details row (structured bank fields + signed authorization
// document upload) from its own Settings page, reusing the exact same
// service/table the Super Admin Billing Ops MASAV drawer uses
// (masav-config.service.js / entity_masav_details, migration 060/063) --
// there is deliberately only one MASAV data model. Ownership is enforced by
// requireEntityOwnership('entityId') at the route level (billing.routes.js),
// same as every other entity-scoped billing route in this file.
//
// Deliberately does NOT expose authorize/revoke -- flipping `authorized`
// stays a Super-Admin-only action (masav-ops.controller.js), unchanged by
// this file. An association can fill in its bank details and upload its
// signed authorization here; only a Super Admin can mark it authorized.
const masavConfig = require('../billing-engine/masav-config.service');

const STATUS_BY_CODE = {
  ENTITY_NOT_FOUND: 404,
  MISSING_BANK_DETAILS: 400,
  MASAV_NOT_CONFIGURED: 409,
};

function handle(res, label, err) {
  const status = STATUS_BY_CODE[err.code] || 500;
  if (status === 500) console.error(`[masav-self-service] ${label} error:`, err.message);
  res.status(status).json({ error: err.message, code: err.code });
}

exports.getConfig = async (req, res) => {
  try {
    const config = await masavConfig.getByEntityId(req.params.entityId);
    res.json({ config });
  } catch (err) {
    handle(res, 'getConfig', err);
  }
};

exports.upsertConfig = async (req, res) => {
  try {
    const config = await masavConfig.upsertBankDetails({
      entityId: req.params.entityId,
      bankCode: req.body.bankCode,
      branchCode: req.body.branchCode,
      accountNumber: req.body.accountNumber,
      accountHolderName: req.body.accountHolderName,
      actorUserId: req.user.id,
      ip: req.ip,
    });
    res.json({ config });
  } catch (err) {
    handle(res, 'upsertConfig', err);
  }
};

exports.uploadAuthorizationDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
    }
    const config = await masavConfig.uploadAuthorizationDocument({
      entityId: req.params.entityId, file: req.file, actorUserId: req.user.id, ip: req.ip,
    });
    res.json({ config });
  } catch (err) {
    handle(res, 'uploadAuthorizationDocument', err);
  }
};

exports.downloadAuthorizationDocument = async (req, res) => {
  try {
    const file = await masavConfig.getAuthorizationDocumentFile(req.params.entityId);
    if (!file) {
      return res.status(404).json({ error: 'No authorization document uploaded for this entity', code: 'NOT_FOUND' });
    }
    res.setHeader('Content-Type', file.mime || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.name || 'masav-authorization')}"`);
    res.send(file.data);
  } catch (err) {
    handle(res, 'downloadAuthorizationDocument', err);
  }
};
