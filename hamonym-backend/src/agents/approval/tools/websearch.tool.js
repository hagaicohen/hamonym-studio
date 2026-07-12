// No web-search integration exists yet — Google has no free API, and a paid
// one (Google Custom Search / SerpAPI) hasn't been chosen yet. webSearch is
// optional on ApprovalContext, so this returns null rather than a fake
// placeholder object — a real search service can replace this body later
// without changing ApprovalAgent or the Context shape.
exports.searchWeb = async (_entityName) => {
  return null;
};
