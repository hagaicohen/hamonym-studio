const guidestarService = require('../guidestar.service');

// Takes a registration number (entity.registrationNumber), not an entityId —
// GuideStar has no concept of our internal entity IDs. Shapes the raw
// Salesforce-shaped payload down to the fields that actually matter for an
// approval decision, rather than passing GuideStar's full ~30-field dump
// into a prompt.
exports.loadGuideStarInfo = async (registrationNumber) => {
  if (!registrationNumber) return null;

  const org = await guidestarService.getOrganization(registrationNumber);
  if (!org) return null;

  return {
    registrationNumber: org.regNum,
    name: org.fullName || org.name,
    status: org.malkarStatus,
    yearFounded: org.orgYearFounded,
    goal: org.orgGoal,
    primaryClassification: org.primaryClassifications?.[0] || null,
    hasProperManagementCert: !!org.hasNihulTakin,
    properManagementCertValidNextYear: !!org.hasNihulTakinForNextYear,
    approvedForTaxDeduction46: !!org.approval46,
    hasSubmittedRecentReports: !!org.hasReportsLast2Years,
    guidestarUrl: org.urlGuidestar,
  };
};
