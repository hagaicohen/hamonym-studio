// Documentation only — this backend is plain JS/CommonJS with no
// TypeScript, so there's no compiler to enforce this. It exists so every
// Agent's output has one stable, named shape to describe and import from,
// instead of passing raw service rows around.
//
// This is the boundary between "data access" and everything downstream
// (prompt building, LLM calls): tools never return raw DB rows into a
// Context — they shape them into these types first. In particular, Entity
// deliberately excludes payment credentials (cardcom_api_password, etc.)
// that entitiesService.getEntityById's raw row carries — those must never
// reach a prompt or LLM call.

/**
 * @typedef {Object} Entity
 * @property {string} id
 * @property {string} entityType
 * @property {string} displayName
 * @property {string|null} legalName
 * @property {string|null} registrationNumber
 * @property {string|null} description
 * @property {string|null} logoUrl
 * @property {string|null} website
 * @property {string|null} city
 * @property {string|null} address
 * @property {string|null} contactFullName
 * @property {string|null} contactEmail
 * @property {string|null} contactPhone
 * @property {string} status
 * @property {boolean} isProfileComplete
 * @property {boolean} requiresCompletion
 * @property {string[]} missingFields
 * @property {string|null} primaryCategory
 * @property {string[]} secondaryCategories
 * @property {string[]} campaignTypes
 * @property {string} createdAt
 */

/**
 * @typedef {Object} GuideStarOrganization
 * Real integration (guidestar.org.il REST API) — shaped down from their
 * ~30-field response to what matters for an approval decision.
 * @property {string} registrationNumber
 * @property {string} name
 * @property {string} status - e.g. "עמותה רשומה"
 * @property {number} yearFounded
 * @property {string|null} goal - Free-text stated purpose.
 * @property {string|null} primaryClassification
 * @property {boolean} hasProperManagementCert - "ניהול תקין"
 * @property {boolean} properManagementCertValidNextYear
 * @property {boolean} approvedForTaxDeduction46 - סעיף 46
 * @property {boolean} hasSubmittedRecentReports
 * @property {string} guidestarUrl
 */

/**
 * @typedef {Object} UploadedDocument
 * @property {'association_certificate'|'tax_document'} type
 * @property {string|null} name
 * @property {string|null} mime
 * @property {boolean} hasData - Whether a file was actually uploaded, without embedding the raw blob in the Context.
 */

/**
 * @typedef {Object} Campaign
 * @property {string} title
 * @property {string} status
 * @property {number} targetAmount
 * @property {number} currentAmount
 * @property {number} supportersCount
 * @property {string} createdAt
 */

/**
 * @typedef {Object} WebSearchResult
 * No real web-search integration exists yet — shape is undecided. Reserved
 * for when tools/websearch.tool.js has real data to return.
 */

/**
 * @typedef {Object} ApprovalContext
 * @property {Entity|null} entity
 * @property {GuideStarOrganization|null} [guideStar]
 * @property {WebSearchResult|null} [webSearch]
 * @property {UploadedDocument[]} documents
 * @property {Campaign[]} campaigns
 */

/**
 * @typedef {Object} ApprovalRecommendation
 * @property {string} summary - Free-text checklist-style summary (✔/⚠ lines), in Hebrew.
 * @property {number} confidence - 0-100.
 * @property {string} recommendation - Free-text recommendation, in Hebrew.
 */

/**
 * @typedef {Object} ApprovalFacts
 * Built by approval.facts.js from an ApprovalContext — one flat, uniform
 * shape regardless of which tool a fact came from. Every value here is
 * something the code already checked (a boolean/count/string), not a
 * judgment call — the LLM interprets these, it doesn't derive them.
 * @property {string|null} entityName
 * @property {string|null} entityStatus
 * @property {boolean} profileComplete
 * @property {number} missingFieldsCount
 * @property {boolean} websiteExists
 * @property {boolean} contactExists
 * @property {boolean} registrationDocumentUploaded
 * @property {boolean} taxDocumentUploaded
 * @property {boolean} guideStarFound
 * @property {boolean} nihulTakin - "ניהול תקין"
 * @property {boolean} approval46 - סעיף 46
 * @property {boolean} recentReportsSubmitted
 * @property {number|null} yearFounded
 * @property {number} campaignsCount
 * @property {boolean} hasPublishedCampaign
 * @property {boolean} webSearchFound
 */

/**
 * @typedef {Object} ApprovalCheck
 * Built by approval.checks.js (Validation Engine) from ApprovalFacts — a
 * fact turned into an explicit business verdict. The LLM never decides
 * `status` itself; it only receives already-judged checks to weigh and
 * explain.
 * @property {string} id
 * @property {string} title - Hebrew label.
 * @property {'pass'|'warning'|'fail'} status
 * @property {string} explanation - Hebrew, one sentence.
 */

module.exports = {};
