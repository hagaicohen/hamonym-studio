// Card rail adapter — NOT IMPLEMENTED, deliberately, per explicit
// instruction (2026-08-28): do not implement the real CardCom token-charge
// call until it's verified against CardCom support/spec. See
// docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 6.1 -- none
// of the three CardCom calls that exist elsewhere in this codebase
// (GetLpResult, LowProfile Create, Recurring v10 Name-to-Value) charge an
// existing token once, server-to-server, on demand.
exports.NOT_IMPLEMENTED = true;

exports.charge = async () => {
  const err = new Error(
    'cardcom-token-charge adapter is not implemented -- the "charge an existing token once" ' +
    'API contract has not been verified against CardCom support/spec. See design doc section 6.1/9.1.'
  );
  err.code = 'CARDCOM_CHARGE_TOKEN_NOT_VERIFIED';
  throw err;
};
