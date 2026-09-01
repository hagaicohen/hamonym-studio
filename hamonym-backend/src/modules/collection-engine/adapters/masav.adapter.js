// MASAV rail adapter — NOT IMPLEMENTED. Two separate unresolved questions
// block it (docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md section 7):
// which provider (an early, possibly-superseded architecture doc names
// Tranzila; later, more recent docs don't name one at all), and there is no
// structured bank-account/IBAN storage anywhere in the schema yet --
// entities.billing_masav_file_name is only an uploaded file reference.
exports.NOT_IMPLEMENTED = true;

exports.charge = async () => {
  const err = new Error(
    'masav adapter is not implemented -- provider not chosen and no structured bank-account ' +
    'data model exists yet. See design doc section 7.'
  );
  err.code = 'MASAV_NOT_IMPLEMENTED';
  throw err;
};
