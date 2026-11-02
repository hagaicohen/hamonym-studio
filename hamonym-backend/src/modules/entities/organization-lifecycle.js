// Existing onboarding profile requirements only. Documents, payment setup and
// Section 46 are not new submission/approval gates.
const PROFILE_FIELDS = ['entity_type', 'legal_name', 'registration_number', 'display_name', 'email', 'phone', 'description'];
const hasValue = value => value != null && String(value).trim().length > 0;
const missingProfileFields = entity => PROFILE_FIELDS.filter(field => !hasValue(entity[field]));

function lifecycleError(message, status, code, missingFields) {
  return Object.assign(new Error(message), { status, code, missingFields });
}

function assertAdminTransition(entity, action) {
  const sources = {
    approve: ['pending_review'], reject: ['pending_review'],
    request_changes: ['draft', 'pending_review', 'changes_requested', 'rejected'],
    suspend: ['active'], reactivate: ['suspended'],
  };
  if (action === 'approve' && entity.status === 'active' && entity.flagged_for_review) return;
  if (!sources[action]?.includes(entity.status)) throw lifecycleError('Invalid transition', 409, 'INVALID_TRANSITION');
}

module.exports = { PROFILE_FIELDS, missingProfileFields, lifecycleError, assertAdminTransition };
