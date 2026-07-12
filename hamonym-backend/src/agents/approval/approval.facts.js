// Normalizer / Fact Builder — the boundary between raw, heterogeneously-shaped
// tool data (ApprovalContext) and what the LLM actually reasons over
// (ApprovalFacts). Every fact here is something the CODE already verified
// (a boolean check, a count) — the LLM's job is to interpret and explain the
// facts, not to (re-)decide whether e.g. סעיף 46 applies. If GuideStar gets
// replaced tomorrow, only this file changes — approval.prompt.js and
// llm.service.js never see GuideStar's shape directly.

// @param {import('./approval.types').ApprovalContext} context
// @returns {import('./approval.types').ApprovalFacts}
exports.buildApprovalFacts = (context) => {
  const { entity, guideStar, webSearch, documents, campaigns } = context;

  const hasDoc = (type) => documents.some((d) => d.type === type && d.hasData);

  return {
    entityName: entity?.displayName ?? null,
    entityStatus: entity?.status ?? null,
    profileComplete: !!entity?.isProfileComplete,
    missingFieldsCount: entity?.missingFields?.length ?? 0,
    websiteExists: !!entity?.website,
    contactExists: !!(entity?.contactEmail || entity?.contactPhone),

    registrationDocumentUploaded: hasDoc('association_certificate'),
    taxDocumentUploaded: hasDoc('tax_document'),

    guideStarFound: !!guideStar,
    nihulTakin: !!guideStar?.hasProperManagementCert,
    approval46: !!guideStar?.approvedForTaxDeduction46,
    recentReportsSubmitted: !!guideStar?.hasSubmittedRecentReports,
    yearFounded: guideStar?.yearFounded ?? null,

    campaignsCount: campaigns.length,
    hasPublishedCampaign: campaigns.some((c) => c.status === 'published'),

    webSearchFound: !!webSearch,
  };
};
