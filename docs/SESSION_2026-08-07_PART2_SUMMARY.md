# Session Summary — 2026-08-07 (Part 2) — Workspace QA pass + real features

**מטרת המסמך:** המשך ישיר ל-`SESSION_2026-08-07_SUMMARY.md` (שכיסה את ה-Reset הארכיטקטוני ל-Campaign Workspace). המסמך ההוא סיכם את המעבר לארכיטקטורה; **המסמך הזה מסכם את סבב ה-QA בפועל על 7 הדפים + כל הפיצ'רים האמיתיים שנבנו תוך כדי** — נקודת המשך לצ'אט הבא, קרא אותו במקום את כל ההיסטוריה.

---

## התמונה הגדולה

היוזר עבר ידנית על כל דפי ה-Workspace ודיווח באגים/בקשות בזרם רציף. חלק גדול מהעבודה לא היה תיקוני UI קטנים אלא **פיצ'רים אמיתיים חסרים** שהתגלו תוך כדי הבדיקה: לשגרירים לא הייתה יכולת הוספה/ייבוא בכלל, למשתתפי הרשמה לא היה שום ניהול, ל"הזנת תרומה ידנית" לא היה backend, וללקוחות לא הייתה הפרדה בין AI זמין/לא-זמין.

---

## מה נבנה (לפי תחום, לא לפי סדר כרונולוגי)

### 1. שגרירים (`campaign-ambassadors-page`) — מדף תצוגה בלבד לניהול מלא
- **הוספה ידנית** — טופס (שם, טלפון, אימייל, יעד אישי, הודעה אישית), שומר ל-backend האמיתי (`AmbassadorService.create`).
- **עריכה** — אותו טופס, `AmbassadorService.update`.
- **ייבוא מאקסל/CSV** — הועתק מ-`campaign-ambassadors-step` הישן בבילדר (שכתב רק ל-draft מקומי) ונקשר ל-backend האמיתי (`importBulk`) — כולל תיקון תופעה של Excel שמפיל `0` מוביל ממספרי טלפון (`normalizePhone`).
- **פס התקדמות ליעד** — טור "התקדמות" מאוחד (היה "יעד"+"גייס" נפרדים) עם bar גרדיאנט + אחוז, גם בעמוד הייעודי וגם בווידג'ט "שגרירים מובילים" בדשבורד הראשי (`ambPct`/`ambProgressPct` היו קיימים אך לא היו מחוברים בטמפלט בכלל).
- **באג ספינר כפול** — `loader.hide()` יש לו מינימום 600ms תצוגה (נגד flicker), שהתנגש עם הספינר המקומי. תוקן ל-`loader.forceHide()` — תוקן גם ב-Registrations/Donations/Donors/Reports באותו אופן.

### 2. משתתפי הרשמה (`registrations` module) — פיצ'ר חדש מקצה לקצה
לא היה קיים בכלל ניהול משתתפים ברמת קמפיין (רק דף ישות-רחב, קריאה בלבד, ייצוא CSV בלבד). משתתף אינו רשומה עצמאית — הוא תלוי ב-`registration_order` שתלוי ב-`donations` (שם נמצא סטטוס התשלום).
- **Backend**: `registrations.service.js` — `createManualRegistration` + `importBulk`, כל שורה יוצרת donation (`status='paid'`, `source` ידני) + `registration_order` + `registration_participant` בטרנזקציה אחת, ואז מעדכן `campaigns.current_amount/supporters_count` + `finalizePaidDonation` (קבלה + קישור לחשבון תורם) — בדיוק כמו תרומה אמיתית.
- **Frontend**: טופס הוספה + ייבוא (אותו UX כמו שגרירים), קטגוריה מזוהה לפי כותרת טקסט (Excel לא יכול לשאת UUID).
- ה-`campaignId` תמיד null-safe מול `registration_options` (טבלה אמיתית, מסונכרנת מ-JSONB בכל שמירה — `syncRegistrationOptions` ב-`campaigns.service.js`).

### 3. שינוי ניתוב מהותי — "תרומות ונתונים" עברו מ-Link-out ל-Routes אמיתיים
ההחלטה המקורית (link ל-`/donations?campaignId=` וכו') **הורגשה כ"יצאתי מהקמפיין"** בפועל — Shell שונה לגמרי (Sidebar ראשי, לא ה-Workspace sidebar). תוקן: 4 routes חדשים, שטוחים, ללא AppLayout shell (אותו דפוס כמו Rewards/Ambassadors):
- `campaigns/:id/donations`, `campaigns/:id/donors`, `campaigns/:id/reports`, `campaigns/:id/registrations`.
- כל אחד מהדפים (`DonationsPageComponent`/`DonorsPageComponent`/`ReportsPageComponent`/`RegistrationsPageComponent`) מזהה **דרך איזה route הוא נטען** (`route.paramMap.get('id')` מול `queryParamMap.get('campaignId')`) ומציג את `campaign-management-sidebar` + כפתור "→ חזרה לסקירה כללית" רק במצב campaign-scoped. הנתיבים הישנים (`/donations?campaignId=` וכו') עדיין עובדים כמו שהיו (מסך ישות-רחב עם Sidebar הראשי).
- דוח "ביצועי קמפיינים" (`campaign-performance-report`) עבר ניקוי כשמסונן לקמפיין אחד: הוסרו העמודה/הכרטיס/הכפתור שהיו הגיוניים רק לרשימת קמפיינים ("קמפיינים פעילים 1/1", "הצג את כל הקמפיינים", עמודת שם קמפיין, חיפוש/סינון סטטוס), הכותרת עוברת ל"ביצועי קמפיין" (יחיד).
- באג CSS משמעותי: כרטיסי KPI לא נמתחו לרוחב מלא — `.don-kpi-row--3` (class חדש) התנגש בספציפיות עם `.don-kpi-row` הבסיסי (4 עמודות) מ-`reports-shared.css`. תוקן עם selector משולב (`.don-kpi-row.don-kpi-row--3`), מרוכז ב-`reports-shared.css` כמקור אמת יחיד, ומיושם גם ב-Marketing/Trends (יש להם תמיד 3 כרטיסים) — Failures יש לו 4, לא נגעתי.

### 4. AI Visibility Gate — פיצ'ר מלא (Backend + Frontend)
בקשה שחזרה 4+ פעמים על פני כמה שיחות (ראה [[project_ai_visibility_gate]] בזיכרון) — סוף סוף מומש:
- **מיגרציה 041**: `entities.ai_features_enabled BOOLEAN DEFAULT false` — **נכתבה, לא הורצה עדיין** (`node scripts/migrate-041.js`).
- **Backend gating אמיתי**, לא רק UI: `src/middleware/ai-access.middleware.js` — `requireAiAccessForCampaign` (ל-`/campaigns/:id/advise`, `/generate-metadata`) ו-`requireAiAccessFromBody` (ל-campaign-creation ול-partner-import, שאין להן campaignId עדיין ברגע הקריאה — ה-frontend שולח `entityId` בגוף הבקשה).
  - **חריג אמיתי טופל**: `/partners/create/ai` חייב לעבוד למשתמש חדש **בלי שום entity** — ה-middleware מאפשר `entityId` חסר רק אם למשתמש באמת אין entities בכלל (בדיקת `user_entities`), אחרת נדחה.
  - **`/partner-import/clone` לא נשער** — הקוד עצמו מתעד "No LLM, no classification" — זו לא יכולת AI בכלל.
- **Platform Admin control**: `PlatformService.setAiAccess()` → `POST /organizations/:id/ai-access`, מתועד ב-audit log כמו approve/suspend. טוגל חדש בעמוד פרטי הארגון (`platform-organization-detail-page`), נפרד מ-workflow האישור (זו הגדרה מתמשכת, לא פעולת חד-פעמית).
- **Frontend greyed-out** (לא מוסתר לגמרי — עם tooltip מסביר): כפתור "✨ צור עם AI" ברשימת הקמפיינים, כפתור "AI advisor" בטופבר הבילדר, טאב "ייבוא מאתר 🤖" במודל שיוך שותפים. הצעה אוטומטית ל-metadata ב-publish-step פשוט לא מופעלת (זו לא כפתור, אין למה "להאפיר").
- **Route guard** על `/campaigns/create/ai` (לא על `/partners/create/ai` — אותו חריג).

### 5. כספים — הזנת תרומה ידנית (Finance panel אמיתי, לא Mock)
הפאנל הישן הציג שני כרטיסי Mock ("נתונים פיננסיים"/"סקירה מהירה") עם מספרים קבועים — מבלבל במיוחד אחרי שכבר יש קישורי אמת ל-Donations/Donors/Reports. הוחלף בפעולה אמיתית אחת: **הזנת תרומה ידנית**.
- **מיגרציה 040** (`donations.source/supporters_count/entered_by/note`) — **הורצה בפועל** (`node scripts/migrate-040.js`, אושר ע"י המשתמש).
- Backend: `createManualDonation` — יוצר donation אמיתי (`status='paid'`), מעדכן טוטלים, `finalizePaidDonation`. אימייל/טלפון תורם נתמכים (מפעיל קבלה אוטומטית אם יש אימייל).
- Frontend: מודל עם סכום (מעוצב בפסיקים, `1,000`), מקור (העברה/צ'ק/מזומן/אחר), הצהרה חובה ("אני מצהיר שהכספים אמיתיים...").

### 6. Builder — שער "פרסום משנה את מרכז הכובד" (סוף סוף מומש)
עיקרון שתועד עוד ב-05-08 ("Publish shifts the system's center of gravity") אבל לא יושם כי שלבי תוכן בבילדר לא היה להם תחליף אמיתי ב-Workspace. **עכשיו יש** (בזכות כל מה שנבנה השבוע) — מומש שלב 1:
- `campaign-editor.component.ts`: `PUBLISHED_GATED_STEPS = [1,3,4,5,6,7,8]` (בסיס/תרומה/תשורות/הרשמה/חסויות/שגרירים/עדכונים) מוצגים כ-disabled (עם tooltip) לקמפיין שכבר פורסם (`status !== 'draft'`). **לא נגעתי**: שלב 2 (סוג/מחזור-חיים — אין לו עדיין תחליף ב-Workspace), שלב 9 (בניית דף — עיצוב), שלב 10 (פרסום — אירוע חד-פעמי).
- ניווט (Next/Prev/קליק ישיר) מדלג אוטומטית על שלבים מנוטרלים — הכללתי את הלוגיקה הקיימת שהייתה מיוחדת רק ל"הרשמה בקמפיין מתמשך" לכלל גנרי (`nearestEnabledStep`).
- קמפיין שפורסם נוחת כברירת מחדל בשלב 9 (בניית דף), לא בשלב 1 המנוטרל.

### 7. עמוד הקמפיין הציבורי (`campaign-preview.component`) — כמה סבבי פוליש
- **כרטיסי עדכונים** — היו תמונה+כותרת+תיאור+"קראו עוד" עם heuristic שביר (סופר תווים, לא בודק אם בפועל נחתך — נכשל על טקסט קצר עם הרבה שורות). הוחלף לגמרי: **תמונה+כותרת בלבד**, קליק על כל הכרטיס פותח popup עם התוכן המלא — אין יותר heuristic לשגיאה. Pagination הפך מ"הצג עוד" מצטבר ל-Paging אמיתי (▲/▼, 3 בכל פעם) בכל 3 הווריאנטים (סליידר/רשימה/Sidebar).
- **אייקוני KPI** — הוחלפו מאימוג'י צבעוני לאייקוני קו מונוכרומטיים (SVG inline), האייקון של "עדכונים" הוחלף מ-megaphone (מורכב) ל-bell (פשוט יותר, גדול יותר).
- **"נותר ליעד"** — האייקון היה $ (דולר) — הוחלף לגליף ₪.
- **תורמים** — הוסר "Top 10" (קופסה נפרדת שהצטלבה עם "תורמים" בעמודה שכנה בגלל חוסר `gap` בגריד). הוחלף בפילטר מאורגן: תקופה (כבר היה) + מיון חדש (אחרונות/הגדולות ביותר) שממיין את אותה הרשימה במקום קופסה כפולה.

### 8. תיקוני UI קטנים נוספים
- Modal תשלום (`checkout-modal`) — הכפתור הראשי היה צמוד לקצה התחתון (padding לא מספיק + חוסר margin אחרי `.payment-logos`).
- טופס תרומה (`campaign-donation-page`) — צ'יפים של סכומים מוצעים לא הציגו פסיקים (type=number לא יכול), ו-4 ספרות נחתכו (spin-buttons של הדפדפן אכלו את הרוחב הצר). הוחלף ל-text input עם עיצוב ידני.
- הגדרות קמפיין — הייתה שמירה אוטומטית שקטה בלי שום פידבק ("שומר.../✓ נשמר" נוסף), הערה גלויה למה ה-slug נעול (במקום רק hover tooltip).
- Rewards page — טופס היה מוגבל ל-640px למרות שהפאנל רחב יותר — הוסר ה-cap.

---

## מה מאומת ומה לא

- **`tsc --noEmit` ו-`ng build --configuration development`** — נבדקו אחרי **כל** שינוי בסבב הזה, תמיד נקיים.
- **בדיקה ידנית בדפדפן** — בוצעה ע"י המשתמש (זה מה שהניע את כל הסבב — screenshot אחרי screenshot). **לא בוצעה על ידי Claude** (אין גישה לדפדפן).
- **מיגרציית 040 (הזנת תרומה ידנית)** — הורצה בפועל, אושרה ע"י המשתמש.
- **מיגרציית 041 (AI Visibility Gate)** — **נכתבה בלבד, לא הורצה.** צריך `node scripts/migrate-041.js` מתוך `hamonym-backend` לפני שה-toggle ב-Platform Admin או ה-gating בפועל יעבדו (עד אז `ai_features_enabled` פשוט לא קיים בטבלה).

---

## פערים ידועים / לא הושלם

| פריט | סטטוס |
|---|---|
| מיגרציה 041 לא הורצה | **חוסם** — ה-AI gate כתוב אבל לא פעיל עד שהעמודה קיימת ב-DB |
| Marketing/Trends/Failures reports לא מסוננים לפי קמפיין | הכרטיסים נמתחו לרוחב מלא (כמו שהתבקש), אבל רק "ביצועי קמפיינים" מקבל `campaignId` בפועל — שלושת האחרים עדיין ישות-רחב גם כשנטענים מתוך קמפיין ספציפי |
| `partner-link-modal` — סיכון דריסת קמפיין | **עדיין פתוח, קריטי** (ראה [[Session Part 1]]) — לא נגעתי בזה הסבב |
| Builder gating — שלב 2 (סוג/מחזור חיים) | במכוון לא נועל — אין עדיין תחליף ב-Workspace |
| Registration participants — אין UI לעריכה/מחיקה של משתתף בודד | רק הוספה/ייבוא/צפייה/ייצוא — תואם את ה-MVP שכבר הוגדר לדף ההרשמות (`docs/DECISIONS.md`, 2026-07-15) |

---

## קבצי מפתח לצ'אט הבא

- `src/middleware/ai-access.middleware.js` — ליבת ה-AI Gate.
- `src/app/core/guards/ai-feature.guard.ts` — route guard מקביל בפרונט.
- `src/app/modules/registrations/` — כל מודול המשתתפים (חדש).
- `src/app/app.routes.ts` — כל ה-`CAMPAIGN_*_ROUTE` הקבועים (8 עכשיו) + התבנית לזיהוי campaign-scoped.
- `migrations/040_manual_donation_entry.sql`, `041_entity_ai_features.sql` — 041 טרם רץ.
