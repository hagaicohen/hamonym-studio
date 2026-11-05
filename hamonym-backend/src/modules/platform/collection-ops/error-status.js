// Shared HTTP status mapping for Collection Ops -- same shape as billing-ops
// /error-status.js and finance-ops/error-status.js.
const STATUS_BY_CODE = {
  MISSING_PERIOD: 400,
};

function statusFor(err) {
  return STATUS_BY_CODE[err.code] || 500;
}

module.exports = { statusFor };
