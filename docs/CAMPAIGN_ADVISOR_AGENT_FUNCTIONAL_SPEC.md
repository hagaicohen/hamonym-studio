# CampaignAdvisorAgent – Functional Specification

ממשיך את [`CAMPAIGN_ADVISOR_AGENT_MVP_SPEC.md`](CAMPAIGN_ADVISOR_AGENT_MVP_SPEC.md) (Business Specification) — כאן נכנסות ההחלטות הארכיטקטוניות/הפונקציונליות שהוצאנו בכוונה מהמסמך ההוא. עדיין בשלב אפיון, לא קוד. אותו עיקרון מוביל כמו ב-`ApprovalAgent` (ראו [`APPROVAL_AGENT_CONTEXT.md`](APPROVAL_AGENT_CONTEXT.md)): לא לבנות יותר ממה שצריך.

## ארכיטקטורה (סופית, MVP)

```
Campaign Builder
        │
        ▼
CampaignAdvisorAgent
        │
        ▼
CampaignDataTool
        │
        ▼
CampaignContext
        │
        ▼
Campaign Analysis Engine
        │
        ▼
CampaignFacts
        │
        ▼
Prompt Builder
        │
        ▼
OpenAI
        │
        ▼
AdvisorResponse
        │
        ▼
Campaign UI
```

**Tool אחד בלבד ב-MVP** — `CampaignDataTool` מחזיר את כל נתוני הקמפיין (Campaign, Organization, Story, Hero, Goal, Donation Page, Rewards, Settings). אין קריאות לשירותים חיצוניים, אין latency, אין API שונים לאחד — כל המידע כבר נמצא באותו Backend, ולכן אין שום רווח מפיצול ל-Tools נפרדים בשלב הזה. ראו "צמיחה עתידית" למטה למתי כן יהיה טעם לפצל.

## עקביות מול ApprovalAgent

הארכיטקטורה כמעט זהה ל-`ApprovalAgent` — רק השמות משתנים, כל שאר הזרימה נשארת זהה. כל Agent במערכת עובד באותה צורה; כל אחד מחליף רק את המנוע העסקי שלו. זה מקל על תחזוקה, הרחבה, וכניסת מפתחים חדשים לפרויקט.

| ApprovalAgent | CampaignAdvisorAgent |
|---|---|
| Validation Engine | Campaign Analysis Engine |
| Validation Facts (`ApprovalFacts`) | Campaign Facts (`CampaignFacts`) |
| Recommendation (`ApprovalRecommendation`) | Advisor Response (`AdvisorResponse`) |

זו אותה פילוסופיה שהובילה את `ApprovalAgent`: לא מתחילים עם עשרה Tools, אלא עם המינימום שפותר את הבעיה העסקית — Tool אחד שמרכז את כל נתוני הקמפיין, Analysis Engine אחד שמפיק ממצאים, LLM אחד שמנסח ייעוץ.

## 1. CampaignAdvisorAgent

המנצח על כל התהליך. אחראי:

- קבלת הבקשה
- הפעלת ה-Tool
- בניית ה-Context
- שליחת הפרומפט
- החזרת התוצאה

אין בו לוגיקה עסקית.

## 2. CampaignDataTool

Tool יחיד ב-MVP. טוען את כל נתוני הקמפיין ומחזיר אותם כ-`CampaignContext`:

```
Campaign
Organization
Campaign Type
Story
Hero
Video
Goal
Donation Page
Rewards
Settings
```

המטרה שלו היא לתת תמונה מלאה של הקמפיין ממקום אחד.

## 3. Campaign Analysis Engine (מקביל ל-Validation Engine ב-ApprovalAgent — שם שונה בכוונה)

**לא נקרא "Facts Engine" או "Validation Engine"** — ב-`ApprovalAgent` השם "Validation Engine" התאים כי המטרה הייתה **לאמת** עמידה בכללים (pass/warning/fail). כאן המטרה אינה ולידציה אלא **ניתוח** — התוצרים הם ממצאים אובייקטיביים, לא פסק-דין תקין/לא-תקין. לכן: `Campaign Analysis Engine` (חלופה שנשקלה: `Campaign Inspector`).

**הרכיב הקריטי שזוהה** — בדיוק כמו ש-`ApprovalAgent` לא סמך על ה-LLM לקבוע האם קיים סעיף 46 (Validation Engine כבר קבע זאת בקוד), גם כאן ה-LLM לא צריך "לגלות" ממצאים אובייקטיביים על הקמפיין — הוא צריך **לקבל אותם** ולהשתמש בהם כדי לייעץ.

תפקידו להפיק ממצאים אובייקטיביים, לדוגמה:

- אורך הסיפור: 842 תווים
- יש סרטון: כן
- מספר תמונות: 3
- מספר CTA: 1
- יעד: ₪250,000
- מספר תשורות: 5
- האם קיימת תמונת Hero
- האם חסר תיאור קצר

זה בדיוק העיקרון שהפך את `ApprovalAgent` לפשוט, עקבי ואמין — נשמר גם כאן, עם שם שמתאים לדומיין (ניתוח, לא ולידציה).

## 4. Prompt Builder

בונה Prompt אחד, במקום אחד בקוד. לדוגמה (טיוטה, לא סופי):

```
You are an expert crowdfunding consultant.
Here is the campaign.
...
Analyze it.
Return:
Summary
Strengths
Recommendations
```

## 5. OpenAI

מריץ את המודל. אין בו שום לוגיקה.

## 6. AdvisorResponse

ממיר את תשובת ה-LLM למבנה אחיד, למשל:

```
summary
strengths
recommendations
```

כך ה-UI לא תלוי בפורמט של ה-LLM.

## 7. UI

מציג `Summary` / `Strengths` / `Recommendations`.

עתידי, לא ב-MVP: `Fix` / `Copy` / `Apply` / `Ignore` (פעולות ישירות מתוך ההמלצה).

## Future extension — לא ב-MVP, לא באפיון המפורט

בעתיד, אם וכאשר תהיה סיבה אמיתית (מקורות מידע חיצוניים כמו Analytics / CRM / Facebook / Google Analytics / SEO — לא רק מידע שכבר קיים ב-Backend), אפשר יהיה לפרק:

**את `CampaignDataTool`** לרכיבי Data נפרדים:

```
CampaignDataTool
        │
        ├── OrganizationTool
        ├── MediaTool
        ├── DonationPageTool
        ├── AnalyticsTool
        ├── BenchmarkTool
```

**ואת `Campaign Analysis Engine`** לרכיבי ניתוח ממוקדים (לדוגמה `Story Analyzer`, `Image Analyzer`), אם וכאשר המורכבות תצדיק זאת.

שני הפירוקים האלה לא דורשים לשנות את שאר הארכיטקטורה — הזרימה הכללית (`Context → Analysis Engine → Facts → Prompt → LLM → Response → UI`) נשארת זהה.

## מה אין ב-MVP (בכוונה)

- ❌ RAG
- ❌ Vector DB
- ❌ MCP
- ❌ Multi-Agent
- ❌ Memory
- ❌ Learning
- ❌ Benchmark מול קמפיינים אחרים
- ❌ Agent Planner
- ❌ Workflow Engine
- ❌ פיצול ל-Data Tools / Analysis Tools נפרדים — ראו "Future extension" למעלה

## מה עדיין פתוח (לא הוכרע)

- הפורמט המדויק של `AdvisorResponse` (תואם ל"משימות לביצוע" מה-Business Spec, לא "המלצות" כלליות).
- מבנה ה-Prompt המדויק.
