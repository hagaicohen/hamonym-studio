const service = require('./billing-ops.service');
const { statusFor } = require('./error-status');

function handle(res, label, err) {
  const status = statusFor(err);
  if (status === 500) console.error(`[billing-ops] ${label} error:`, err.message);
  res.status(status).json({ error: err.message, code: err.code });
}

exports.listPeriods = async (req, res) => {
  try {
    res.json({ periods: await service.listPeriods() });
  } catch (err) {
    handle(res, 'listPeriods', err);
  }
};

exports.createPeriod = async (req, res) => {
  try {
    const period = await service.createPeriod({
      periodStart: req.body.periodStart,
      periodEnd: req.body.periodEnd,
      superAdminUserId: req.user.id,
      ip: req.ip,
    });
    res.status(201).json({ period });
  } catch (err) {
    handle(res, 'createPeriod', err);
  }
};

exports.calculatePeriod = async (req, res) => {
  try {
    const result = await service.calculatePeriod({
      periodId: req.params.periodId,
      asOf: req.body.asOf,
      superAdminUserId: req.user.id,
      ip: req.ip,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'calculatePeriod', err);
  }
};

exports.listRuns = async (req, res) => {
  try {
    res.json({ runs: await service.listRuns({ periodId: req.query.periodId }) });
  } catch (err) {
    handle(res, 'listRuns', err);
  }
};

exports.listStatements = async (req, res) => {
  try {
    const statements = await service.listStatements({
      periodId: req.query.periodId,
      runId: req.query.runId,
      status: req.query.status,
    });
    res.json({ statements });
  } catch (err) {
    handle(res, 'listStatements', err);
  }
};

exports.getStatement = async (req, res) => {
  try {
    const statement = await service.getStatementDetail(req.params.id);
    if (!statement) return res.status(404).json({ error: 'Statement not found' });
    res.json({ statement });
  } catch (err) {
    handle(res, 'getStatement', err);
  }
};

exports.approveStatement = async (req, res) => {
  try {
    const result = await service.approveStatement({
      statementId: req.params.id, superAdminUserId: req.user.id, ip: req.ip,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'approveStatement', err);
  }
};

exports.bulkApproveStatements = async (req, res) => {
  try {
    const result = await service.bulkApproveStatements({
      statementIds: req.body.statementIds, superAdminUserId: req.user.id, ip: req.ip,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'bulkApproveStatements', err);
  }
};

exports.abandonStatement = async (req, res) => {
  try {
    const result = await service.abandonStatement({
      statementId: req.params.id, superAdminUserId: req.user.id, ip: req.ip,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'abandonStatement', err);
  }
};

exports.triggerCollection = async (req, res) => {
  try {
    const result = await service.triggerCollection({
      statementId: req.params.id, superAdminUserId: req.user.id, ip: req.ip,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'triggerCollection', err);
  }
};
