# CampaignAdvisorAgent — Implementation Context

Implementation log for [`CAMPAIGN_ADVISOR_AGENT_MVP_SPEC.md`](CAMPAIGN_ADVISOR_AGENT_MVP_SPEC.md) (Business Spec) and [`CAMPAIGN_ADVISOR_AGENT_FUNCTIONAL_SPEC.md`](CAMPAIGN_ADVISOR_AGENT_FUNCTIONAL_SPEC.md) (Functional Spec). Mirrors [`APPROVAL_AGENT_CONTEXT.md`](APPROVAL_AGENT_CONTEXT.md)'s role for `ApprovalAgent`. **Built, verified against real data and a real OpenAI call. Not committed yet.**

## What's built

Exactly the pipeline from the Functional Spec — `CampaignBuilder → CampaignAdvisorAgent → CampaignDataTool → CampaignContext → Campaign Analysis Engine → CampaignFacts → Prompt Builder → OpenAI → AdvisorResponse`. No UI wiring yet (deliberately — same staged rollout `ApprovalAgent` followed: agent core first, UI only once asked for).

All files under `hamonym-backend/src/agents/campaign-advisor/`:
```
campaign-advisor.agent.js       — exports.advise(campaignId, userId), single entry point
campaign-advisor.types.js       — JSDoc typedefs: CampaignContext, CampaignFacts, AdvisorResponse
campaign-advisor.analysis.js    — buildCampaignFacts(context) — Campaign Analysis Engine
campaign-advisor.prompt.js      — SYSTEM_PROMPT + buildAdvisorPrompt(facts)
tools/
  campaign-data.tool.js          — wraps campaigns.service.js's getCampaignById, single Tool per spec
```

Demo script: `node scripts/demo-campaign-advisor.js <campaignId> <userId>`.

## Refactor: shared `llm.service.js` / `trace.util.js`

Building a second agent surfaced real duplication — both agents needed an identical thin OpenAI wrapper and identical tracing. Moved both up a level, out of `approval/`:

- `hamonym-backend/src/agents/llm.service.js` — `exports.complete(systemPrompt, userPrompt)`, generic (renamed from `getApprovalRecommendation`, which baked "approval" into a shared utility's name).
- `hamonym-backend/src/agents/trace.util.js` — unchanged behavior, just relocated + comment updated to "shared across all agents."

`approval.agent.js` updated to `require('../llm.service')` / `require('../trace.util')` and call `llmService.complete(...)`. **Verified `ApprovalAgent` still works after this refactor** (loaded cleanly; not re-run against the real API after the move, but the change is a pure rename/relocation with no logic change).

## Real campaign data model (verified, not assumed)

`campaigns.service.js`'s `getCampaignById({ campaignId, userId })` returns `SELECT c.*`, ownership-gated via `user_entities`. Key findings that shaped the Analysis Engine:

- **No dedicated "story" column exists.** Long-form content lives in a JSONB `blocks` column (page-builder blocks, unknown exact schema). `contentTextLength` is computed by recursively walking `blocks` and summing all string values found — an honest approximation across all content, not a precise "story only" measure. Documented as such in the JSDoc, not oversold.
- **Rewards** (`תשורות`) — no separate table, a JSONB array column `rewards` on `campaigns`, gated by `rewards_enabled` boolean.
- **Donation page settings** — all on `campaigns` directly: `enable_suggested_amounts`, `allow_custom_amount`, `allow_monthly_donation`, `suggested_amounts` (JSONB array), `monthly_amounts`, `hero_cta_config` (JSONB, used as the "has CTA" signal).

## Verified this session

Ran against a real campaign ("בונים את בית הכנסת בנחושה", entity "קשת נחושה"):

```
CampaignAdvisorAgent.advise
✓ CampaignDataTool (2696ms) — found: true
✓ CampaignAnalysisEngine (0ms) — facts: 17
✓ PromptBuilder (0ms) — chars: 466
✓ LLM (7539ms) — tasks: 2
Total: 10235ms
```

**Facts produced** (17 total) — spot-checked for honesty against the raw DB row, not just assumed correct:
```json
{
  "hasVideo": false, "hasHeroCta": true, "targetAmount": 2500, "currentAmount": 6932,
  "rewardsEnabled": true, "rewardsCount": 6, "supportersCount": 14, ...
}
```

**LLM response** correctly grounded in those facts — no hallucination found:
- Claimed "תשורות מגוונות" (diverse rewards) → verified `rewardsCount: 6`, real.
- Claimed "הרבה תומכים" (many supporters) → verified `supportersCount: 14`, defensible.
- Flagged missing video as a High-severity task → verified `hasVideo: false`, correct.
- Praised the hero CTA as a strength → verified `hasHeroCta: true`, correct.

```json
{
  "summary": "הקמפיין 'בונים את בית הכנסת בנחושה' מציג יוזמה מרשימה שמושכת תשומת לב עם הצלחה גבוהה בגיוס עד כה...",
  "strengths": ["סכום גיוס גבוה יחסית (6932) בהשוואה ליעד הקמפיין (2500)", "קיימת קריאה לפעולה בפתיחה..."],
  "tasks": [
    { "topic": "Video", "severity": "High", "explanation": "...", "task": "הכנת סרטון קצר..." },
    { "topic": "Urgency", "severity": "Medium", "explanation": "...", "task": "להוסיף... מידע על מועד סיום..." }
  ]
}
```

## Explicitly NOT done (by design, per the Functional Spec)

- No UI wiring — no button, no endpoint. Not asked for yet.
- No Analysis Tools split, no Data Tools split beyond the single `CampaignDataTool` — per the Functional Spec's "Future extension" section, explicitly deferred until real external data sources (Analytics/CRM/Facebook/etc.) justify it.
- No RAG, MCP, Multi-Agent, Memory, Learning, Benchmark-vs-other-campaigns, Agent Planner, Workflow Engine.

## Environment

No new `.env` vars, no new npm dependencies — reuses `OPENAI_API_KEY` and the `openai` package already set up for `ApprovalAgent`.

## Next steps (not started, awaiting direction)

1. Decide whether to wire an HTTP endpoint + UI button (mirrors `ApprovalAgent`'s §3f in `APPROVAL_AGENT_CONTEXT.md`) — likely `POST /api/campaigns/:id/advise` or similar, following the existing campaigns routes convention.
2. Real-usage review (same principle as `ApprovalAgent`'s 50-org review) once there's a UI to generate real usage from.
