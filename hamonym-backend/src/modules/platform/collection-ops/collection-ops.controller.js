// Collection Ops controller -- the unified "ניהול גבייה" page's own
// read-only aggregation endpoints (financial overview, needs-attention,
// system activity, cross-period history search, basic Excel report).
// Every write action the page offers (approve/export a MASAV proposal,
// override a hold, resolve an exception, approve/collect/adjust a
// Statement) stays on the EXISTING finance-ops/billing-ops endpoints -- this
// controller adds no new write path.
const service = require('./collection-ops.service');
const { statusFor } = require('./error-status');

function handle(res, label, err) {
  const status = statusFor(err);
  if (status === 500) console.error(`[collection-ops] ${label} error:`, err.message);
  res.status(status).json({ error: err.message, code: err.code });
}

exports.getFinancialOverview = async (req, res) => {
  try {
    res.json({ overview: await service.getFinancialOverview({ periodId: req.query.periodId }) });
  } catch (err) {
    handle(res, 'getFinancialOverview', err);
  }
};

exports.getNeedsAttention = async (req, res) => {
  try {
    res.json(await service.getNeedsAttention());
  } catch (err) {
    handle(res, 'getNeedsAttention', err);
  }
};

exports.getSystemActivity = async (req, res) => {
  try {
    res.json(await service.getSystemActivity());
  } catch (err) {
    handle(res, 'getSystemActivity', err);
  }
};

exports.searchStatementHistory = async (req, res) => {
  try {
    const rows = await service.searchStatementHistory({
      entityId: req.query.entityId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      status: req.query.status,
    });
    res.json({ statements: rows });
  } catch (err) {
    handle(res, 'searchStatementHistory', err);
  }
};

// Same rows the Excel export below produces (collection-ops.service.js#
// getFinancialReportRows is the one shared source) -- the preview table and
// the file can never drift apart.
exports.getFinancialReportPreview = async (req, res) => {
  try {
    const rows = await service.getFinancialReportPreview({
      periodId: req.query.periodId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      entityId: req.query.entityId,
    });
    res.json({ rows });
  } catch (err) {
    handle(res, 'getFinancialReportPreview', err);
  }
};

exports.exportFinancialReport = async (req, res) => {
  try {
    const buffer = await service.generateFinancialReportExcel({
      periodId: req.query.periodId,
      dateFrom: req.query.dateFrom,
      dateTo: req.query.dateTo,
      entityId: req.query.entityId,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="financial-report-${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    handle(res, 'exportFinancialReport', err);
  }
};
