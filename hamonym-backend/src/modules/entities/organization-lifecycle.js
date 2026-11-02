// Existing onboarding profile requirements only. Documents, payment setup and
// Section 46 are not new submission/approval gates.
const PROFILE_FIELDS = ['entity_type', 'legal_name', 'registration_number', 'display_name', 'email', 'phone', 'description'];
const hasValue = value => value != null && String(value).trim().length > 0;
const missingProfileFields = entity => PROFILE_FIELDS.filter(field => !hasValue(entity[field]));

function lifecycleError(message, status, code, missingFields) {
  return Object.assign(new Error(message), { status, code, missingFields });
}

module.exports = { PROFILE_FIELDS, missingProfileFields, lifecycleError };
