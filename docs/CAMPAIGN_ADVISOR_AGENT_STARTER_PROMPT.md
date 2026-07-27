# Campaign Advisor Agent — Starter Prompt for a New Chat

Paste the prompt below into a new conversation to start building this Agent, without re-deriving the architecture from scratch. It intentionally references the `ApprovalAgent` built for entity approval (see [`APPROVAL_AGENT_CONTEXT.md`](APPROVAL_AGENT_CONTEXT.md)) as the pattern to reuse.

---

## The prompt

```
אנחנו מתחילים לבנות Agent חדש עבור מערכת "המונים".

כבר בנינו Approval Agent לעמותות עם הארכיטקטורה הבאה:

- Agent
- Tools
- Context
- Validation Engine
- Prompt Builder
- OpenAI
- UI

אנחנו רוצים לשמור בדיוק על אותה ארכיטקטורה גם ל-Agent החדש.

המטרה של ה-Agent החדש היא לנתח קמפיין ולהציע שיפורים, לא לאשר אותו.

אני לא רוצה לקפוץ ישר ל-RAG, Multi-Agent או MCP.

אני רוצה לבנות את המערכת בהדרגה, כמו שעשינו ב-Approval Agent.

המטרה שלך היא לעזור לי לאפיין ולבנות את ה-Agent הזה שלב אחר שלב.

נתחיל קודם בשאלה אחת בלבד:

מה הבעיה העסקית שה-Agent הזה פותר, ומה צריכה להיות התוצאה הסופית שהוא מחזיר?

אל תציע קוד עדיין.
אל תציע RAG.
אל תציע טכנולוגיות מתקדמות.
נתחיל מהאפיון העסקי, ואז נבנה את ה-Agent בהדרגה.
```

---

## Naming decision (already made, don't re-litigate)

**Call it `CampaignAdvisorAgent`, not `CampaignAnalysisAgent`.**

Reasoning: its job isn't only to analyze — it's to *advise*:
- Improving the campaign story/narrative.
- Improving the donation page.
- Improving the goal/target amount.
- Improving images.
- Improving conversion rates.
- Identifying weak points.

"Advisor" also holds up if capabilities grow beyond pure analysis later — "Analysis" would need renaming the moment the Agent starts suggesting anything.

---

## Why this doc exists

Same reason `APPROVAL_AGENT_CONTEXT.md` exists: so a fresh chat doesn't have to reconstruct hard-won architectural decisions (or re-litigate ones already settled, like the Agent's name) from nothing. Once the Campaign Advisor Agent has real progress, it should get its own `CAMPAIGN_ADVISOR_AGENT_CONTEXT.md` following the same structure — architecture diagram, what's real vs. stubbed, verified-this-session log, next steps.
