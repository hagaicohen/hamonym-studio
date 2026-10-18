// FIN-11 Finance Operations controller -- Super Admin Finance screen.
// Deliberately thin: every action here wraps an EXISTING, already-tested
// service function (Stage 2B's payment-exceptions.service.js, Stage 3's
// masav-proposal.service.js, statement-balance.service.js). No financial
// calculation is reimplemented here. The Statements/entities list itself
// is NOT duplicated -- billing-ops.controller.js#listStatements/getStatement
// already covers that; this module only adds the FIN-11-specific surfaces
// that have no UI yet: overpayment exceptions, MASAV proposals, and the
// adjusted-balance drill-down.
const paymentExceptions = require('../../billing-engine/payment-exceptions.service');
const masavProposals = require('../../billing-engine/masav-proposal.service');
const statementBalanceService = require('../../billing-engine/statement-balance.service');
const { statusFor } = require('./error-status');

function handle(res, label, err) {
  const status = statusFor(err);
  if (status === 500) console.error(`[finance-ops] ${label} error:`, err.message);
  res.status(status).json({ error: err.message, code: err.code });
}

exports.listExceptions = async (req, res) => {
  try {
    res.json({ exceptions: await paymentExceptions.listPaymentExceptions({ status: req.query.status }) });
  } catch (err) {
    handle(res, 'listExceptions', err);
  }
};

exports.getExceptionActions = async (req, res) => {
  try {
    res.json({ actions: await paymentExceptions.listPaymentExceptionActions(req.params.id) });
  } catch (err) {
    handle(res, 'getExceptionActions', err);
  }
};

exports.overrideExceptionHold = async (req, res) => {
  try {
    const result = await paymentExceptions.overrideCollectionHold({
      exceptionId: req.params.id,
      superAdminUserId: req.user.id,
      reason: req.body.reason,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'overrideExceptionHold', err);
  }
};

exports.resolveException = async (req, res) => {
  try {
    const result = await paymentExceptions.resolvePaymentException({
      exceptionId: req.params.id,
      resolutionType: req.body.resolutionType,
      superAdminUserId: req.user.id,
      reason: req.body.reason,
      evidenceNotes: req.body.evidenceNotes,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'resolveException', err);
  }
};

exports.listMasavProposals = async (req, res) => {
  try {
    res.json({ proposals: await masavProposals.listMasavProposals({ status: req.query.status }) });
  } catch (err) {
    handle(res, 'listMasavProposals', err);
  }
};

exports.approveMasavProposal = async (req, res) => {
  try {
    const result = await masavProposals.approveMasavProposal({
      proposalId: req.params.id,
      superAdminUserId: req.user.id,
      reason: req.body.reason,
    });
    res.json({ result });
  } catch (err) {
    handle(res, 'approveMasavProposal', err);
  }
};

// masav-proposal.service.js#exportMasavProposals already does everything
// the Tranzila export requires in one atomic transaction: it re-verifies
// each proposal is still 'approved' and its balance is still fresh, builds
// the exact same 11-column xlsx format the pre-FIN-11 MASAV export already
// uses (masav-collection.service.js#generateExportExcel), and only then
// flips status to 'exported' and COMMITs -- if the xlsx build throws for
// any reason, the whole transaction (including every status flip in the
// batch) ROLLBACKs, so a proposal can never end up marked 'exported'
// without a real file having been built. The bug this fixes is narrower
// than that: this controller was JSON-encoding the returned Buffer (`res.
// json({ result })`, where `result` was the raw file bytes) instead of
// actually serving it as a file -- same download pattern
// masav-ops.controller.js#exportExcel already uses for the old mechanism.
exports.exportMasavProposals = async (req, res) => {
  try {
    const buffer = await masavProposals.exportMasavProposals({
      proposalIds: req.body.proposalIds,
      superAdminUserId: req.user.id,
    });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="masav-proposals-export-${Date.now()}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    handle(res, 'exportMasavProposals', err);
  }
};

exports.getStatementBalance = async (req, res) => {
  try {
    res.json({ balance: await statementBalanceService.getStatementBalance(req.params.id) });
  } catch (err) {
    handle(res, 'getStatementBalance', err);
  }
};
