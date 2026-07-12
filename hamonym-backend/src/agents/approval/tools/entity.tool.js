const entitiesService = require('../../../modules/entities/entities.service');

// entitiesService.getEntityById's raw row still carries payment credentials
// (cardcom_api_password, cardcom_api_username, etc.) even though the SELECT
// itself was already trimmed of blob columns. Those must never flow into an
// ApprovalContext, since this is the object the prompt/LLM call gets built
// from. Shape the raw row into the Entity type (see approval.types.js)
// instead of passing it through.
exports.loadEntity = async (entityId) => {
  const row = await entitiesService.getEntityById(entityId);
  if (!row) return null;

  return {
    id: row.id,
    entityType: row.entity_type,
    displayName: row.display_name,
    legalName: row.legal_name,
    registrationNumber: row.registration_number,
    description: row.description,
    logoUrl: row.logo_url,
    website: row.website,
    city: row.city,
    address: row.address,
    contactFullName: row.contact_full_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    status: row.status,
    isProfileComplete: row.is_profile_complete,
    requiresCompletion: row.requires_completion,
    missingFields: row.missing_fields || [],
    primaryCategory: row.primary_category,
    secondaryCategories: row.secondary_categories || [],
    campaignTypes: row.campaign_types || [],
    createdAt: row.created_at,
  };
};
