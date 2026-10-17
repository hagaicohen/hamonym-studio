// Shared HTTP status mapping for Finance Operations controllers -- same
// "known business error codes map to a specific status, everything else is
// a logged 500" shape as billing-ops/error-status.js.
const STATUS_BY_CODE = {
  STATEMENT_NOT_FOUND: 404,
  EXCEPTION_NOT_FOUND: 404,
  PROPOSAL_NOT_FOUND: 404,

  MISSING_ADMIN_USER: 400,
  MISSING_REASON: 400,
  INVALID_RESOLUTION_TYPE: 400,
  MISSING_PROPOSAL_IDS: 400,

  EXCEPTION_NOT_OPEN: 409,
  PROPOSAL_NOT_PROPOSED: 409,
  PROPOSAL_NOT_APPROVED: 409,
  PROPOSAL_STALE_AT_EXPORT: 409,
  NOT_AUTHORIZED: 409,
};

function statusFor(err) {
  return STATUS_BY_CODE[err.code] || 500;
}

module.exports = { statusFor };
