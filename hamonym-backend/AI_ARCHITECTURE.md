# AI Architecture — עקרונות שכבת ה-AI ב"המונים"

**תאריך:** 2026-07-23
**סוג מסמך:** עקרונות, לא מימוש. לא צפוי להשתנות גם אם יוחלף המודל (GPT-4o-mini → משהו אחר) או ייווסף ספק חדש.
**למי זה מיועד:** כל מי שמוסיף יכולת AI חדשה למערכת — התשובה לשאלה "איך בונים את זה כאן", לא "איך קוראים לפונקציה".

## מה כבר קיים (לא היפותטי)

שלוש יכולות AI אמיתיות, לא Feature בודד:

```
src/agents/
  llm.service.js       # OpenAI wrapper משותף — complete() + completeWithWebSearch()
  trace.util.js         # createTracer(name).trace(step, fn, summarize)
  approval/              # ApprovalAgent — שופט מוכנות עמותה קיימת לאישור (guidestar.org.il)
  campaign-advisor/      # CampaignAdvisorAgent — מייעץ על קמפיין קיים
  campaign-creation/      # בונה קמפיין/עמותה חדשים ממקור חיצוני (Facts → Brief → Draft)
```

## 1. מטרת שכבת ה-AI

**תפקידה**: לקבל החלטות תוכן ויצירה שדורשות שיפוט — מה לכתוב, אילו פרטים חסרים, איזו תמונה הכי מתאימה — על סמך הֶקְשֵר שהמערכת כבר אספה.

**מה היא לא עושה**: לא שומרת נתונים, לא אוכפת הרשאות, לא מבצעת תשלומים, לא מרנדרת HTML/CSS, ולא מחליטה כלום שיש לו כבר תשובה דטרמיניסטית בקוד.

**למה היא קיימת**: כי "מה לכתוב על הקמפיין הזה" ו"האם התמונה הזו מטושטשת" הן החלטות שדורשות שיפוט אמיתי — לא כי צריך AI בשביל דברים שאפשר לכתוב כ-`if`.

## 2. עקרונות יסוד

1. **AI מחליט, המערכת מבצעת** — ה-AI אף פעם לא כותב ל-DB ישירות, לא קורא ל-Payment, לא בודק הרשאות. הוא מחזיר JSON; קוד דטרמיניסטי (`draft.builder.js` וכדומה) הוא זה שממפה/מבצע.
2. **Business Rules נשארים בקוד, לא בפרומפט** — כלל כמו "יעד גיוס לא יכול להיות שלילי" נאכף בקוד, לא נשען על "בקשה נחמדה" למודל. דוגמה קונקרטית: `suggestedTargetAmount` נאכף כ-`null` בקוד (`brief.builder.js`) בלי תלות בציות המודל לפרומפט.
3. **Stateless** — כל קריאה מכילה את כל ההֶקְשֵר הדרוש לה. אין Session, אין זיכרון בין קריאות. גם ה"סבב שאלות הבהרה" (`/refine-brief`) הוא שתי בקשות stateless נפרדות, לא שיחה — הפרונטאנד מעביר את ה-Context מחדש בכל פעם.
4. **AI לא ממציא — הוא בוחר מרשימה שהמערכת נותנת לו** — כל פעם שיש רשימה סגורה אמיתית (31 קטגוריות, 6 סוגי ישות, קודי תמונה שהועלו בפועל), היא נשלחת ל-AI במפורש בפרומפט, והוא **חייב** לבחור מתוכה — אף פעם לא מומצא. כל ערך שמוחזר נבדק מחדש בקוד מול הרשימה שנשלחה בפועל לפני שהוא נחשב אמין (`sanitizeGalleryCuration`, אימות `entityTypeGuess`, ולידציית `heroVideoUrl` ברג'קס).
5. **No generic abstractions before a second real consumer** — לא בונים Framework/Interface/Factory כלליים על סמך צורך אחד. הוכח שוב ושוב (`categoryGuess` לפני חיבור לרשימה האמיתית, `templateSuggestion`/`paletteSuggestion` שנדחו כי אין קטלוג, ה-`Brief` שלא עבר Rename ל-Specification כי אין עדיין Director שני אמיתי).

## 3. הזרימה הכללית

```
Context (Facts שכבר חולצו + מקורות נוספים אופציונליים)
   ↓
Prompt Builder  (בוחר מה לכלול — ExtractedFacts / OnlineResearch / UserAnswers / תמונות)
   ↓
LLM  (llm.service.js — complete() או completeWithWebSearch())
   ↓
Specification  (JSON גולמי מהמודל)
   ↓
Sanitize/Project  (בדיקת גבולות — whitelist, לא סומכים על שום דבר גולמי)
   ↓
Deterministic Builder  (draft.builder.js וכדומה — קוד רגיל, לא LLM)
```

## 4. סוגי Outputs — לא "תשובת טקסט"

| סוג | דוגמה אמיתית |
|---|---|
| **Narrative** | `story` — פסקת תוכן מלאה |
| **Decisions** | `category`, `entityTypeGuess` — בחירה מתוך רשימה סגורה |
| **Recommendations** | `designIntent`, `galleryCuration` — המערכת/המשתמש עדיין יכולים לשנות |
| **Specification** | ה-`Brief` כולו — אובייקט שקוד אחר (לא LLM) ממפה למודל נתונים אמיתי |
| **Questions** | `clarifyingQuestions` — כשה-AI מזהה שחסר לו מידע שרק בן-אדם יודע |

## 5. מתי מוסיפים Agent/Pipeline חדש?

- יש אחריות עסקית חדשה (לא עוד וריאציה של קיים).
- הפרומפט שונה מהותית, לא רק עוד שדה על אותו Brief.
- ה-Output שונה במבנה, לא רק בתוכן.
- קונבנציית שם: `*.agent.js` שופט/מייעץ על משהו קיים; `*.pipeline.js` בונה State חדש. תיקיה משלו תחת `src/agents/`.

## 6. מתי לא בונים Framework — לקחים אמיתיים, לא תיאורטיים

- **לא** יוצרים Enum/רשימת ערכים שאין לה מקור אמיתי במערכת (Templates/Palettes לא קיימים היום כקטלוג סגור — `templateSuggestion` נדחה עד שיהיה).
- **לא** מוסיפים שכבת הפשטה (Interface, Factory, "Director" כללי) לפני שיש **שני** צרכנים אמיתיים שזקוקים לה — לא אחד.
- **לא** מעבירים Business Logic ל-LLM — גם כשזה נראה נוח. הכלל תמיד נשאר בקוד, ה-LLM רק מציע ערך שהכלל הזה יבדוק אחר כך.
- **לא** כופלים עלות/latency (למשל לולאת ביקורת-עצמית שמדרגת ומשכתבת) בלי ראיה שזה באמת משפר תוצאות — נדחה עד שיש דרך למדוד.

## 7. חלוקת אחריות — הטבלה הכי חשובה במסמך

| אחריות ה-LLM | אחריות המערכת |
|---|---|
| כתיבת תוכן (story, titles) | שמירת נתונים (DB) |
| קבלת החלטות יצירתיות בתוך רשימה סגורה | הרשאות (`requireAuth`, `requireEntityOwnership`) |
| זיהוי מידע חסר (`clarifyingQuestions`) | תשלומים (Cardcom) |
| בחירת/אצירת מדיה (`galleryCuration`) | ולידציה סופית (unique constraints, שדות חובה) |
| המלצות (`designIntent`) | Business Rules (יעד גיוס, סטטוסים, מי יכול למחוק מה) |
| יצירת Specification (`Brief`) | Rendering בפועל (Angular, CSS, Templates) |

אם מפתח חדש בצוות מפנים את הטבלה הזו לפני שהוא כותב פרומפט — קשה הרבה יותר "לזלוג" לוגיקה עסקית לתוך טקסט חופשי שמודל שפה קורא.

## ראו גם

- `hamonym-app/AI_CAMPAIGN_CREATION_VISION.md` — ה-ADR המלא של pipeline יצירת הקמפיינים (המימוש הראשון של העקרונות האלה).
- `hamonym-app/AI_CREATIVE_DIRECTOR_CONCEPT.md` — הדיון שהוביל למסמך הזה: איפה `Brief` עומד כ-Specification, ולמה לא בוצע Rename.
