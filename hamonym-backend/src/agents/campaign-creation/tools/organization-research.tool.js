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
//
// Tried returning structured JSON (facts split from prose, per user
// request) by combining the Responses API's web_search tool with strict
// json_schema output in the same call — found live (2026-07-23) that this
// measurably degrades grounding: the citations/annotations OpenAI attaches
// to free-text output disappear in strict JSON mode, and the numbers that
// came back read as generic/plausible rather than the specific, real,
// well-cited figures the free-text mode reliably produced. Kept the
// raw-text-plus-annotations design deliberately rather than "fixing" it
// into something that looks more reusable but is quietly worse — a
// separate structuring pass (a second, ordinary complete() call over the
// already-grounded text) is the safer way to get Facts-shaped output later,
// not combining structuring with the search call itself.

const llmService = require('../../llm.service');
const db = require('../../../db/db');

const CACHE_TTL_DAYS = 30;

async function getCached(organizationName, websiteUrl) {
  try {
    const result = await db.query(
      `SELECT research_text, sources FROM organization_research_cache
       WHERE (lower(organization_name) = lower($1) OR website_url = $2)
         AND created_at > NOW() - INTERVAL '${CACHE_TTL_DAYS} days'
       ORDER BY created_at DESC
       LIMIT 1`,
      [organizationName || '', websiteUrl || ''],
    );
    if (!result.rows.length) return null;
    return { text: result.rows[0].research_text, sources: result.rows[0].sources, fromCache: true };
  } catch {
    return null; // cache lookup failing shouldn't block a fresh search
  }
}

async function saveToCache(organizationName, websiteUrl, research) {
  try {
    await db.query(
      `INSERT INTO organization_research_cache (organization_name, website_url, research_text, sources)
       VALUES ($1, $2, $3, $4)`,
      [organizationName || null, websiteUrl || null, research.text, JSON.stringify(research.sources)],
    );
  } catch {
    // caching is an optimization, not correctness — a failed write just
    // means the next request searches again, nothing more.
  }
}

// @param {{ organizationName?: string|null, websiteUrl?: string|null }} params
// @returns {Promise<{ text: string, sources: Array<{title: string, url: string}>, fromCache: boolean } | null>} null when there's nothing to search for.
//   fromCache costs nothing to carry today (observability — was this a real
//   API call or a cache hit) and leaves room to grow this shape later (e.g.
//   an eventual `facts` field) without an internal API break — per review
//   feedback, not because there's a concrete second consumer yet.
exports.research = async ({ organizationName, websiteUrl }) => {
  if (!organizationName && !websiteUrl) return null;

  const cached = await getCached(organizationName, websiteUrl);
  if (cached) return cached;

  const subject = [
    organizationName ? `עמותת/ארגון בשם "${organizationName}"` : null,
    websiteUrl ? `אתר: ${websiteUrl}` : null,
  ].filter(Boolean).join(', ');

  const currentYear = new Date().getFullYear();
  const prompt = `חפש מידע פומבי ואמין באינטרנט על ${subject}, ארגון ללא מטרות רווח בישראל.
תן סיכום עשיר (בעברית) שמכסה: מטרת הארגון ותחום הפעילות, מאז מתי הוא פועל (אם ידוע), תוכניות/פעילויות מרכזיות, והשפעה/היקף פעילות אם יש נתונים.
דווח רק מה שמצאת בפועל במקורות אמינים — אל תמציא פרטים. אם לא מצאת מספיק מידע אמין, אמור זאת במפורש במקום להשלים בניחוש.
לגבי נתונים מספריים/סטטיסטיקות (למשל "X ילדים טופלו", "Y תרומות גויסו"): ציין אותם רק אם הם מתוך ${currentYear - 2}-${currentYear} או מאוחר יותר, ותמיד ציין את השנה שאליה הנתון מתייחס. נתון ישן יותר או נתון בלי שנה ברורה — עדיף להשמיט אותו לגמרי מאשר להציג אותו כאילו הוא עדכני.`;

  try {
    const fresh = await llmService.completeWithWebSearch(prompt);
    await saveToCache(organizationName, websiteUrl, fresh);
    return { ...fresh, fromCache: false };
  } catch {
    // Search failing (rate limit, network, no results) shouldn't fail the
    // whole campaign-creation request — same partial-success philosophy as
    // a failed website fetch during combined intake.
    return null;
  }
};
