// OrganizationResearchTool — real internet research about a specific
// organization, via llm.service.js's completeWithWebSearch(). Explicit
// opt-in only (2026-07-23 decision): unlike Facts extraction (free, fast,
// runs on every submission), a live web search costs money and adds
// latency per call, so this only runs when the user deliberately asks for
// it — same "explicit control over consequential/costly things" principle
// as the createNewOrg toggle, not something to silently default on.
//
// Deliberately narrow for now: takes a name/website, returns raw grounded
// text + sources for the campaign-creation Brief step to fold in as extra
// context (see brief.builder.js). NOT a general-purpose "Data Layer" tool
// reused across ApprovalAgent/CampaignAdvisorAgent yet — those are real
// existing consumers that could benefit, but wiring them in without a
// concrete need in front of us would be building for a hypothetical
// consumer (ADR decision 4/9). Easy to extract into a shared location once
// a second real caller actually shows up.

const llmService = require('../../llm.service');

// @param {{ organizationName?: string|null, websiteUrl?: string|null }} params
// @returns {Promise<{ text: string, sources: Array<{title: string, url: string}> } | null>} null when there's nothing to search for
exports.research = async ({ organizationName, websiteUrl }) => {
  if (!organizationName && !websiteUrl) return null;

  const subject = [
    organizationName ? `עמותת/ארגון בשם "${organizationName}"` : null,
    websiteUrl ? `אתר: ${websiteUrl}` : null,
  ].filter(Boolean).join(', ');

  const prompt = `חפש מידע פומבי ואמין באינטרנט על ${subject}, ארגון ללא מטרות רווח בישראל.
תן סיכום עשיר (בעברית) שמכסה: מטרת הארגון ותחום הפעילות, מאז מתי הוא פועל (אם ידוע), תוכניות/פעילויות מרכזיות, והשפעה/היקף פעילות אם יש נתונים.
דווח רק מה שמצאת בפועל במקורות אמינים — אל תמציא פרטים. אם לא מצאת מספיק מידע אמין, אמור זאת במפורש במקום להשלים בניחוש.`;

  try {
    return await llmService.completeWithWebSearch(prompt);
  } catch {
    // Search failing (rate limit, network, no results) shouldn't fail the
    // whole campaign-creation request — same partial-success philosophy as
    // a failed website fetch during combined intake.
    return null;
  }
};
