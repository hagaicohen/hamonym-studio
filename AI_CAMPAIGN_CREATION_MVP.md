# AI-Assisted Campaign Creation — מסמך MVP

**סטטוס:** טיוטה לאישור (טרם מומש בקוד)
**תאריך:** 2026-07-22
**נשען על:** [AI_CAMPAIGN_CREATION_VISION.md](AI_CAMPAIGN_CREATION_VISION.md) (13 החלטות ארכיטקטוניות, מאושר)

מסמך זה מפרט את מה שהחלטה 10 והחלטת ה-Scope במסמך החזון משאירות פתוח: שדות מדויקים, מסכים, ו-Failure Strategy. שום דבר כאן לא סותר את מסמך החזון — אם יש סתירה, מסמך החזון גובר.

---

## 1. היקף (תזכורת מהחזון)

- שני Extractors בלבד ב-v1: **✍️ טקסט חופשי** (Sprint 1) ו-**🌐 אתר אינטרנט** (Sprint 2).
- One-shot בלבד — אין session, אין multi-turn.
- Brief אחד משולב גם כשיש גם פרטי עמותה חדשה וגם פרטי קמפיין (החלטה 10).
- AI עובד על עמותה קיימת ומאושרת, **או** יוצר טיוטת עמותה חדשה (`status: draft`) דרך אותו מסלול שה-wizard הידני משתמש בו.

## 1.5 מיקום קוד ותשתית קיימת (החלטה 11 בחזון)

`hamonym-backend/src/agents/campaign-creation/` — לא תיקיית-על נפרדת. משתמש ב-`llm.service.js`/`trace.util.js` המשותפים שכבר קיימים ומשמשים את `ApprovalAgent`/`CampaignAdvisorAgent`:

```
src/agents/campaign-creation/
  campaign-creation.pipeline.js
  campaign-creation.prompt.js
  campaign-creation.types.js       // ExtractedFacts, Brief
  extractors/
    free-text.extractor.js
    website.extractor.js
```

**פתוח לבירור טכני (לא לתכנון)**: `guidestar.service.js` הקיים (`src/agents/approval/`) מאפשר אימות `organizationNumber` מול מרשם עמותות אמיתי. אם ישולב, זה עשוי לשדרג את §5/§6 למטה (מ"תמיד דורש אישור ידני" ל"ניתן לאימות אוטומטי") — להחליט בשלב המימוש, לא כאן.

## 2. מיפוי לשדות אמיתיים בקוד

נבדק מול הקוד הקיים (לא מזיכרון) — שני מודלים נפרדים, בדיוק כמו שהוחלט:

- `OrganizationRegistrationState` — `organization-registration-state.service.ts`
- `CampaignDraft` — `campaign-studio-state.service.ts`

### ExtractedFacts v1 (תוצר Extraction — עובדות בלבד)

```typescript
interface ExtractedFacts {
  source: 'free_text' | 'website';
  sourceRaw: string;          // הקלט הגולמי, לצורך regenerate/debug — לא נשמר ב-Draft

  // עמותה (ממופה בהמשך ל-OrganizationRegistrationState שדות STEP 1-2)
  organizationName?: string;       // → organizationName
  organizationNumber?: string;     // → organizationNumber (לרוב לא ניתן לחילוץ, נשאר ריק)
  entityTypeGuess?: string;        // → entityType (ניחוש, תמיד לאישור ידני — ר' §5)
  categoryGuess?: string[];        // → selectedCategories / primaryCategory
  organizationDescription?: string;// → organizationDescription
  logoUrl?: string;                // → logoPreview (אם נמצא לוגו באתר; לא רלוונטי ל-free_text)

  // קמפיין (ממופה בהמשך ל-CampaignDraft שדות Step 1)
  suggestedTitle?: string;         // → title
  suggestedShortDescription?: string; // → shortDescription
  suggestedTargetAmount?: number;  // → targetAmount (ניחוש גס, לאישור)
  heroImages?: string[];           // מועמדים ל-coverImageUrl
  socialLinks?: string[];          // מוצג ב-Brief כמידע תומך, לא נשמר לשדה קיים ב-v1
  contactEmail?: string;           // מוצג ב-Brief כמידע תומך בלבד — ר' §5 (לא נכתב ל-fullName/phone/email)
  contactPhone?: string;
}
```

### Brief v1 (תוצר Generation — מוכן ל-commit, לתצוגה ולעריכה)

Brief הוא בעצם preview חלקי של שני ה-Draft objects, לא type חדש נפרד — פשוט תת-קבוצה נבחרת של שדותיהם, ממולאת מ-`ExtractedFacts` + החלטות ברירת מחדל (template/tone/CTA):

**קטע עמותה** (רלוונטי רק אם אין entity קיים משויך למשתמש):
`entityType`, `organizationName`, `organizationNumber` (ריק אם לא נמצא — שדה חובה לפני commit, ר' §6), `primaryCategory`/`selectedCategories`, `organizationDescription`, `logoPreview`

**קטע קמפיין**:
`title`, `slug` (נגזר אוטומטית מ-`title`), `shortDescription`, `category`, `targetAmount`, `coverImageUrl` (מהצעות `heroImages`), `heroType` (`'image'` ברירת מחדל ב-v1 — וידאו לא נתמך ב-Extraction), template נבחר (מתוך `TEMPLATE_PALETTES`/`campaign-presets` הקיימים — לא סכימה חדשה)

**לא כלול ב-Brief של v1** (נשארים כברירות מחדל של `createInitialDraft()` / ברירות מחדל קיימות של ה-wizard, ניתנים לעריכה מאוחר יותר ב-Studio): `fundingType`, `startDate`/`endDate`, `offerings`, `registrationOptions`, `sponsors`, `ambassadors`, `updates`, `blocks`, `layout`. אלה שייכים לעריכה ב-Studio אחרי היצירה, לא לרגע ה-Brief — עומד בקנה אחד עם היקף ה-MVP המצומצם.

## 3. מסך הכניסה (v1)

לפי החלטה 8 — רק שני chips פעילים, השאר מוצגים אך לא AI:

```
איך תרצה להתחיל?

🌐 יש לנו אתר אינטרנט
✍️ אין אתר — אספר בכמה מילים
────────────────────────
⚡ Wizard מהיר   (ללא AI, קיים כמסלול נפרד)
🛠 Studio מתקדם  (קיים היום)
```

## 4. הזרימה

```
בחירת מקור (🌐/✍️)
   │
   ▼
מסך קלט (URL / textarea)
   │
   ▼
Extraction  →  ExtractedFacts
   │
   ▼
Brief Builder  →  Brief (מוצג לאישור)
   │
   ▼
משתמש עורך שדות חסרים/שגויים ישירות במסך ה-Brief
   │
   ▼
אישור  →  יצירת/עדכון OrganizationDraft (אם נדרש) + CampaignDraft
   │
   ▼
מעבר ל-Campaign Studio, שלב 1, לעריכה נוספת רגילה
```

אין מסך "טוען..." ממושך בלי הסבר — כפתור השליחה עובר ל-state טעינה עם טקסט ("קוראים את האתר שלכם...") כדי לנהל ציפיות ל-~10-30 שניות (website) מול כמעט-מיידי (free text).

## 5. גבולות מידע — מה AI לעולם לא ממלא

ישירות מהשדות הקיימים ב-`OrganizationRegistrationState`, לא רק תיאורטי:

**סליקה/בנקאות (STEP 4-5) — לא קיימים ב-Facts/Brief כלל:**
`provider`, `terminalNumber`, `apiUsername`, `apiPassword`, `paymentMethod`, `cardHolderName`, `cardNumber`, `expiry`, `cvv`, `masavUploaded`, `masavFileName`

**מסמכים משפטיים — לא ניתנים לחילוץ, נשארים ריקים לתיוג ידני:**
`certificateFileUrl`, `section46FileUrl`

**פרטי איש קשר של הרושם (לא של הארגון) — לעולם לא נכתבים אוטומטית, גם אם `contactEmail`/`contactPhone` נמצאו באתר:**
`fullName`, `phone`, `email` — אלה שדות "מי ממלא את הטופס", ברירת מחדל היא המשתמש המחובר. אם נמצא אימייל/טלפון ציבורי של הארגון באתר, הוא מוצג ב-Brief כ"מידע תומך" בלבד (`contactEmail`/`contactPhone` ב-`ExtractedFacts`), לא נכתב לשדות האלה.

**מספר עמותה (`organizationNumber`) — שדה חובה שלא ממולא אוטומטית ברמת ודאות גבוהה:** גם אם Extraction "מוצא" מחרוזת שנראית כמו מספר עמותה בטקסט/אתר, היא מוצגת ב-Brief כהצעה הדורשת אישור מפורש (לא preselected/pre-confirmed) — בגלל ה-`UNIQUE` constraint ב-DB, טעות כאן חוסמת את המשתמש האמיתי.

## 6. כללי מינימום — לא מומצאים מחדש

Brief לא "מאשר" בעצמו השלמות — הוא רק ממלא שדות. אותם כללים קיימים ב-`OrganizationRegistrationStateService` ממשיכים לקבוע:

- שמירת טיוטת עמותה עדיין דורשת `entityType` + `organizationName` + `organizationNumber` (ה-minimum הקיים, עקב `registration_number` UNIQUE) — אם Extraction לא מצא `organizationNumber`, ה-Brief חוסם commit של קטע העמותה עד שהמשתמש ימלא אותו ידנית (בדיוק כמו wizard רגיל).
- אם למשתמש כבר יש entity מאושר (`status: approved`), קטע העמותה ב-Brief לא מוצג בכלל — ה-AI יוצר קמפיין בלבד תחת ה-entity הקיים.

## 7. Failure Strategy

| מצב | טיפול |
|---|---|
| טקסט חופשי קצר מדי / לא מכיל מידע רלוונטי | Brief מוצג עם רוב השדות ריקים + הודעה: "לא הצלחנו למצוא מספיק מידע — אפשר למלא ידנית או לנסות שוב עם פירוט נוסף" |
| URL לא תקין / לא נגיש / timeout | הודעת שגיאה מיידית לפני הרצת Extraction, לא Brief ריק אחרי המתנה |
| Fetch מצליח אך העמוד JS-rendered ללא תוכן שרת-side | מתייחסים כמו "לא נגיש" — לא מנסים headless rendering ב-v1 (out of scope) |
| LLM call נכשל / timeout | הודעת שגיאה + כפתור "נסה שוב", ה-Input הגולמי נשמר בזיכרון local כדי לא לאבד את מה שהמשתמש כבר נתן |
| SSRF guard חוסם את ה-URL (כתובת פנימית/private range) | הודעת שגיאה גנרית ("לא הצלחנו לגשת לכתובת הזו") — לא לחשוף פרטי חסימה פנימיים |

כל מקרי הכשל **לעולם לא** חוסמים לגמרי — המשתמש תמיד יכול לעבור ל-⚡ Wizard מהיר או 🛠 Studio מתקדם כמוצא, כי שלוש נקודות הכניסה מזינות את אותו מודל (החלטה 1).

## 8. אבטחה — Website Extractor (v1, חובה לא nice-to-have)

- **SSRF guard**: חסימת fetch לכתובות פרטיות/פנימיות (`localhost`, `127.0.0.1`, `169.254.0.0/16`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), ולפרוטוקולים שאינם `http`/`https`.
- **Timeout** קשיח על ה-fetch (מוצע: 10 שניות) ועל שלב ה-LLM.
- **הגבלת גודל** תוכן שנשלף (מוצע: לא יותר מ-~2MB HTML גולמי) לפני parsing.

## 9. מחוץ לסקופ (מאושר כבר בחזון, מפורט כאן לבהירות)

PDF, Word, OCR, Canva, Dropbox, Facebook, Instagram, YouTube, הודעות קוליות, multi-turn/Missing Fields אינטראקטיבי, Campaign Advisor, Readiness Check.

---

## 10. Website Extractor — Acceptance Criteria (לפני שורת קוד ראשונה)

מסמך עבודה, לא ADR — סוגר את הפרמטרים התפעוליים הקונקרטיים שחסרים מ-§7-9 לפני שמתחילים לכתוב.

**קריטריון הצלחה של הספרינט (לא "זה עובד על אתרים" — משהו מדיד):**
> אותו ארגון, מורץ פעם אחת דרך ✍️ Free Text ופעם אחת דרך 🌐 Website (עם תיאור מקביל) — צריך להניב `ExtractedFacts` דומה באיכות ובמבנה. זו ההוכחה שה-Extractors באמת ניתנים להחלפה מאחורי אותו חוזה, לא רק "עוד מקור קלט".

**דפים:**
- דף **בודד** — ה-URL שהמשתמש הדביק, ותו לא. **אין crawling** של לינקים פנימיים ב-v1 (בחירת "אילו דפים לסרוק" היא כבר בעיה של crawler כללי — מחוץ לסקופ לגמרי, לא רק "לגל הבא").
- אין בדיקת `robots.txt` — זה לא bot שסורק את האתר מיוזמתו, זה fetch יזום של URL שהמשתמש עצמו סיפק במפורש (אותו עיקרון כמו שדפדפן לא בודק robots.txt כשמשתמש מקליד כתובת).

**Hard failure מול Partial Success — קו גבול מפורש:**
- **Hard failure** (לפני שמגיעים ל-Extraction בכלל, אין קריאת LLM): URL לא תקין מבנית, SSRF-guard חוסם, timeout על ה-fetch, status code שאינו 2xx.
- **Partial Success** (fetch הצליח → **תמיד** ממשיכים ל-Extraction, גם אם התוכן דל): התוכן המנורמל (אחרי HTML→טקסט) קצר/ריק — מטופל **בדיוק כמו טקסט קצר ב-FreeTextExtractor** (nulls כנים, לא שגיאה). אותו `MIN_TEXT_LENGTH` guard חל גם כאן, אחרי הנרמול.
- קו הגבול היחיד: **הצלחת ה-fetch עצמו** (2xx, לא נחסם) — לא איכות/כמות התוכן.

**HTML→Text (חדש, לא הוחלט קודם):** נרמול בסגנון Readability (תוכן מרכזי בלבד — לא ניווט/footer/scripts) לפני שליחה לאותו Extraction prompt ששימש את Free Text. לא raw HTML.

**אסטרטגיית Fixtures (שונה במתכוון מ-Sprint 1):**
- Corpus דטרמיניסטי = קבצי **HTML מקומיים** (לא fetch אמיתי) שמוזנים ישירות לשלב הנרמול+Extraction — נותן corpus יציב לבדיקות חוזרות, כמו ב-Sprint 1.
- בנוסף: כמה **smoke tests ידניים** מול אתרי עמותות אמיתיים קטנים ויציבים — לא חלק מה-corpus האוטומטי (לא דטרמיניסטי מטבעו — תוכן אתר יכול להשתנות), רק כדי לוודא שה-fetch/SSRF-guard/timeout עובדים בפועל מול רשת אמיתית.

---

## מה הלאה

לאחר אישור מסמך זה — פירוק לטיקטים טכניים אינו חלק ממסמך התכנון עצמו.
