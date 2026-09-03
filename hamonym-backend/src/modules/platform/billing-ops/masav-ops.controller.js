const masavConfig = require('../../billing-engine/masav-config.service');
const masavCollection = require('../../collection-engine/masav-collection.service');
const { statusFor } = require('./error-status');

function handle(res, label, err) {
  const status = statusFor(err);
  if (status === 500) console.error(`[masav-ops] ${label} error:`, err.message);
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
      superAdminUserId: req.user.id,
      ip: req.ip,
    });
    res.json({ config });
  } catch (err) {
    handle(res, 'upsertConfig', err);
  }
};

exports.authorize = async (req, res) => {
  try {
    const config = await masavConfig.authorize({
      entityId: req.params.entityId, superAdminUserId: req.user.id, notes: req.body.notes, ip: req.ip,
    });
    res.json({ config });
  } catch (err) {
    handle(res, 'authorize', err);
  }
};

exports.revoke = async (req, res) => {
  try {
    const config = await masavConfig.revoke({
      entityId: req.params.entityId, superAdminUserId: req.user.id, notes: req.body.notes, ip: req.ip,
    });
    res.json({ config });
  } catch (err) {
    handle(res, 'revoke', err);
  }
};

// Signed bank-authorization document ("אישור הרשאה לחיוב באמצעות מס״ב") --
// evidence only, never itself sets `authorized` (see masav-config.service.
// js#uploadAuthorizationDocument header comment).
exports.uploadAuthorizationDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', code: 'NO_FILE' });
    }
    const config = await masavConfig.uploadAuthorizationDocument({
      entityId: req.params.entityId, file: req.file, superAdminUserId: req.user.id, ip: req.ip,
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

exports.listBlocked = async (req, res) => {
  try {
    res.json({ statements: await masavCollection.listBlockedStatements() });
  } catch (err) {
    handle(res, 'listBlocked', err);
  }
};

exports.listActionable = async (req, res) => {
  try {
    res.json({ statements: await masavCollection.listActionableMasavStatements() });
  } catch (err) {
    handle(res, 'listActionable', err);
  }
};

exports.openAttempt = async (req, res) => {
  try {
    const result = await masavCollection.openMasavAttempt(req.params.id);
    res.json({ result });
  } catch (err) {
    handle(res, 'openAttempt', err);
  }
};

exports.exportExcel = async (req, res) => {
  try {
    const statementIds = String(req.query.statementIds || '').split(',').map((s) => s.trim()).filter(Boolean);
    const buffer = await masavCollection.generateExportExcel(statementIds);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="masav-export-${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    handle(res, 'exportExcel', err);
  }
};

// v1 deliberately exposes no way to manually record a MASAV financial
// result -- MASAV in v1 stops at Excel generation/download (see
// masav-collection.service.js header comment). There is no recordResult
// handler here and none mounted in billing-ops.routes.js.
