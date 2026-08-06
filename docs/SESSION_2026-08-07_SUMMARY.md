# Session Summary — 2026-08-07 — Campaign Workspace

**מטרת המסמך:** רצף עבודה ארוך (התחיל למעשה ב-2026-08-06, נמשך ליום הבא) שהוביל ל-Reset ארכיטקטוני מלא של Campaign Management Dashboard לכדי **Campaign Workspace**. מסמך הזה הוא **נקודת המשך** לצ'אט חדש — קרא אותו במקום את כל ההיסטוריה. לארכיטקטורה המלאה והעקרונות ראה `CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md` (עודכן באותו סבב) — המסמך הזה הוא "מה קרה בפועל ומה עדיין פתוח", לא אפיון.

---

## התמונה הגדולה

התחלנו מ-Dashboard יחיד עם קומפוננטות בילדר מוטמעות ב-Accordion. **זה נזנח**. הארכיטקטורה הנוכחית:

```
Campaign Workspace
   │
   ├── Overview        /campaigns/:id/dashboard
   ├── Rewards         /campaigns/:id/rewards
   ├── Sponsors        /campaigns/:id/sponsors
   ├── Registration    /campaigns/:id/registration
   ├── Donation Settings /campaigns/:id/donation
   ├── Ambassadors     /campaigns/:id/ambassadors  (קדם ל-Workspace, מודל נתונים נפרד — ראה "פערים" למטה)
   ├── Settings        /campaigns/:id/settings
   └── Visibility      /campaigns/:id/visibility
```

כל "עולם" הוא **דף נפרד** (לא Accordion), עם **Sidebar קבוע** (`campaign-management-sidebar`) לניווט. כל דף **עצמאי**: שולף קמפיין בעצמו (`campaignApi.getById`), שומר בעצמו (`campaignApi.update`, בד"כ Auto-save לכל פעולה) — לא תלוי ב-`CampaignStudioStateService` המשותף עם הבילדר.

**עיקרון מרכזי:** כל דף הוא Template ייעודי (CONTENT בלבד — בלי Layout/מיקום/צבעים, אלה נשארים בבילדר), אבל קורא/כותב לאותו מודל נתונים בדיוק (`CampaignDraft`, אותן עמודות JSONB) ולאותם Services משותפים. "לא לשכפל לוגיקה" ≠ "להטמיע את אותה קומפוננטה" — זו ההחלטה שתיקנה את הבעיה המקורית (Design מעורב בתוך Content).

---

## מה נבנה (הכל, לפי סדר)

1. **Sidebar משותף** — `campaign-management-sidebar` — ניווט בין כל דפי ה-Workspace, תג "Campaign Workspace" בראש.
2. **Overview (Dashboard) שוכתב מהיסוד** — Hero KPI מאוחד (סכום/יעד/%/תומכים/ימים/תשורות/עדכונים), Updates מוטבע ומרכזי, "דורש תשומת לב" (רק פריטים אמיתיים — כרגע רק "תשורות אזלו"), כרטיסי כניסה ל"תוכן הקמפיין" (לא טפסים), Finance/Analytics Mock מתויג בכנות.
3. **5 דפים ייעודיים חדשים**: Rewards, Sponsors, Registration, Donation, Settings, Visibility — כולם Auto-save, כולם ללא פקדי Design.
4. **Ambassadors** — הדף הקיים (קדם לעבודה הזו) קיבל את אותו Sidebar + תוקן רוחב לאחידות.
5. **Updates** — עבר כמה סבבי שכתוב:
   - כותרת + תוכן נפרדים, שניהם Rich Text (`RichTextEditorComponent` המשותף — אותו עורך שה-Story בבילדר משתמש בו).
   - עורך כותרת ב-mode "Compact" (`@Input compact` חדש שנוסף ל-`RichTextEditorComponent` — טולבר מצומצם: גודל פונט/צבע/יישור בלבד, בלי כותרות/רשימות/בולד וכו').
   - קומפוזר עבר לתוך **חלון מודלי** (נפתח מ-"+ הוסף עדכון חדש" / "עריכה"), לא יושב קבוע בראש הפאנל.
   - פיד מקופל כברירת מחדל (Badge+תאריך+כותרת), קליק פותח (תיאור מלא+פעולות), Paging ("הצג עוד").
   - כרטיסים עם Border ברור, תמונה קטנה בצד (לא Banner גדול).
   - תצוגה מקדימה חיה (`previewUpdate` getter, `ngTemplateOutlet` משותף עם הפיד האמיתי).
6. **עמוד ציבורי (`campaign-preview.component`)** — עדכונים:
   - **באג אמיתי תוקן**: עדכוני טיוטה היו מוצגים לציבור (אין סינון סטטוס) — נוסף `publishedUpdates()`.
   - Paging גם ב-List View (לא רק Sidebar).
   - כרטיסים בגובה אחיד (title/desc עם line-clamp), "קראו עוד" מופיע רק כשבאמת נחתך (heuristic לפי אורך טקסט), פותח Popup.
   - כותרת/תיאור מוצגים כ-HTML בטוח (`safeHtml`) בכל 3 התצוגות (Slider/List/Sidebar) — כי הכותרת הפכה ל-Rich Text.
7. **Rewards page — סבב תיקונים נרחב**:
   - רשימת תשורות בתחתית הפכה מרשימה פשוטה לקרוסלה (כמו העמוד הציבורי) + חיפוש טקסט חופשי.
   - טופס: היה 2-עמודות → התבלגן → חזר לעמודה אחת (640px), עם תיקון אמיתי לבאג ה-Toggle (`transform: translateX(-16px)` היה הפוך — גרם לכפתור הפנימי לזוז **מחוץ** לרצועה; תוקן ל-`+16px`).
   - שדות מספריים (סכום/כמות): חסימת מקלדת בפועל (רק ספרות), לא רק סינון אחרי הקלדה.
   - אזור העלאת תמונה — הפך ל-Dropzone ברור.
   - כפתור "בחר עסק" — עוצב כ-CTA ברור (היה נראה כמו שדה טקסט מושבת), עם רמז "מלאו כותרת קודם" כשמושבת.
   - חלון "בחר עסק" (`partner-link-modal`) — הודעת ריק תוקנה: מבחין בין "אין שום עסק בעמותה" ל"לא נמצא לפי החיפוש".
8. **KPI (Overview)** — פס ההתקדמות נמתח למקסימום, `.ckp-primary` מקבל יותר משקל יחסי, Breakpoint נוסף ל-420px למובייל.
9. **אחידות רוחב** — כל 7 הדפים הייעודיים (Rewards/Sponsors/Registration/Donation/Settings/Visibility/Ambassadors) הוסרה מהם הגבלת `max-width` שונה שהייתה לכל אחד — עכשיו כולם ברוחב זהה לעמודת ה-Overview.

---

## מה מאומת ומה לא

- **`tsc --noEmit` ו-`ng build --configuration development`** — נבדקו אחרי **כל** שינוי, תמיד נקיים.
- **בדיקה ידנית בדפדפן — לא בוצעה על ידי (אין לי גישה לדפדפן).** כל הפידבק שהוביל לתיקונים (Toggle חתוך, טופס מבולגן, תמונה גדולה מדי וכו') הגיע מבדיקה ידנית **שלך**. זה אומר: כל מה שעדיין לא נבדק ידנית עלול להסתיר עוד באגים מהסוג הזה (במיוחד: Sponsors/Registration/Donation/Settings/Visibility — לא קיבלו סבב QA כמו שה-Rewards page קיבל).

---

## ⚠️ סיכון פתוח — קריטי, לא תוקן

**חלון "בחר עסק" (`partner-link-modal.component.ts`) עלול למחוק בפועל קמפיין אמיתי.**

הפונקציה `goCreateNewPartner()` שומרת את הקמפיין באמצעות:
```ts
this.campaignApiService.update(this.campaignId, this.campaignState.draft)
```
כאשר `campaignState` הוא ה-`CampaignStudioStateService` **הישן** (הבילדר). ב-Rewards page (וכל שאר הדפים הייעודיים) השירות הזה **לעולם לא נטען** — הדפים האלה עצמאיים ולא תלויים בו בכלל. כלומר אם משתמש בדף התשורות ילחץ "בחר עסק" ← "יצירת שותף חדש" ← "המשך ליצירת שותף", הקוד ישלח ל-Backend את ה-draft **הריק/ברירת-מחדל** של אותו singleton, במקום הקמפיין האמיתי — **דריסה אמיתית של נתונים**.

**לא תוקן.** אפשרויות לתיקון (לא הוכרעו):
1. להזין ל-`PartnerLinkModalComponent` את ה-draft האמיתי דרך `@Input`, ולהשתמש בו במקום ב-`campaignState.draft`.
2. לחסום את הנתיב "יצירת שותף חדש" מתוך הדפים הייעודיים (רק "חיפוש שותף קיים" זמין שם), עד שהתיקון האמיתי ייעשה.

**המלצה: לפתור את זה לפני שממשיכים לפתח עוד, ולפני שמישהו אמיתי משתמש בתכונה הזו.**

---

## החלטות שהתקבלו בסבב הזה (לא לפתוח מחדש בלי סיבה)

- **מוקאפ חיצוני = השראה עיצובית בלבד, לא מפרט יכולות.** נדחו במפורש: תזמון עדכונים (Scheduled) — סותר את `CAMPAIGN_UPDATES_UX_SPEC.md`; לייקים/תגובות על עדכונים — Hamonym היא פלטפורמת גיוס, לא רשת חברתית. נשמר כזיכרון קבוע (`feedback_mockup_design_only`).
- **"קרא עוד" שייך לעמוד הציבורי, לא לדשבורד הניהולי.** בדשבורד מנהל התוכן רואה את הטקסט המלא ישירות (בלי חיתוך/פופאפ) — ההיגיון: זה מסך ניהול, לא פיד צריכה.
- **Type/Lifecycle ו-Publish** — במכוון לא הועברו ל-Workspace. Type דורש דיון UX נפרד (יש שם קונפליקט מירוץ ספציפי-לאשף). Publish הוא אירוע חד-פעמי, נשאר Builder-only לצמיתות.
- **Ambassadors כבר משתמש במודל נתונים נפרד** (טבלת SQL אמיתית, לא JSONB) — פער ידוע שקדם לעבודה הזו, לא תוקן ולא בטווח.

---

## פערים ידועים / לא הושלם

| פריט | סטטוס |
|---|---|
| בדיקה ידנית מלאה לכל 7 הדפים | לא בוצעה — רק Rewards עבר סבב אמיתי |
| סיכון דריסת קמפיין ב-`partner-link-modal` | **פתוח, קריטי** |
| Sidebar במובייל | מוסתר לגמרי מתחת ל-860px, אין תחליף (המבורגר/דראוור) |
| "כספים" (Finance) ב-Overview | עדיין Mock — לא יכולת בילדר, מעולם לא היה בטווח ה-Migration |
| Analytics | Placeholder "בקרוב" בלבד, בכוונה — אין נתוני מגמה אמיתיים |
| הגבלת הבילדר לקמפיין שפורסם | **לא בוצעה** — כל שלבי הבילדר עדיין פעילים גם לקמפיין חי, כי אין עדיין אימות Production לאף יכולת ב-Workspace (ראה כלל הברזל ב-Migration Plan) |

---

## קבצים מרכזיים לצ'אט הבא

- `docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md` — הארכיטקטורה, העקרונות, Migration Plan המלא.
- `src/app/modules/campaigns/shared/components/campaign-management-sidebar/` — הניווט המשותף.
- `src/app/modules/campaigns/pages/campaign-dashboard-page/` — Overview.
- `src/app/modules/campaigns/pages/campaign-{rewards,sponsors,registration,donation,settings,visibility}-page/` — 6 הדפים הייעודיים.
- `src/app/modules/campaigns/shared/components/partner-link-modal/` — **מכיל את הבאג הפתוח**.
- `src/app/app.routes.ts` — כל ה-Routes החדשים (`CAMPAIGN_REWARDS_ROUTE` וכו').

---

## הערה טכנית על המסמך הזה

גילינו תוך כדי שיש **שתי תיקיות `docs/` נפרדות** בסביבת העבודה: `HamonymStudio/docs/` (מחוץ ל-git repo של hamonym-app) ו-`HamonymStudio/hamonym-app/docs/` (בתוך ה-repo, זו שנדחפת ב-`git push`). הן היו לא מסונכרנות. **הקובץ הזה הועתק בכוונה לתיקייה השנייה (הזו) כדי שיהיה ב-git ויעבור בפועל ב-push** — לא רק על הדיסק המקומי. אם ממשיכים לעבוד, כדאי לכתוב מסמכים חדשים ישירות לכאן (`hamonym-app/docs/`), לא לתיקיית ה-docs החיצונית.
