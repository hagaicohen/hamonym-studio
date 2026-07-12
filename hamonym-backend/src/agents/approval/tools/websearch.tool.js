// FUTURE ENHANCEMENT — deliberately not built, not a gap in Phase 1.
// Explicit decision: an approval decision can be made in full from
// GuideStar + documents + system data; a website/social-media presence is
// nice-to-have, not a requirement, so it's not worth the new dependency
// (a paid search API — Google has no free one) until real usage shows it's
// actually needed. webSearch is optional on ApprovalContext, so this
// returns null rather than a fake placeholder object — a real search
// service can replace this body later without changing ApprovalAgent or
// the Context shape.
exports.searchWeb = async (_entityName) => {
  return null;
};
