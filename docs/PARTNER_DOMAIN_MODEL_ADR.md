# ADR — Partner Domain Model

**Status:** ✅ **Implemented (Phase 2 — Domain Foundation)** — הדומיין (`entity_roles`, `campaign_partners`, API) ממומש ומוזג ל-`main` (2026-07-28). Phase 3 (Builder) ואילך — עדיין Proposed, לא מומש. ראה "יישום Phase 2" למטה לפרטים המלאים.
**תאריך:** 2026-07-28
**קשור:** [PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md](./PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md)

## הקשר (Context)

תשורות (Rewards/Offerings) בקמפיין מוצעות היום ע"י עסקים/גופים שתומכים בקמפיין. כרגע התשורה היא רק כותרת+תיאור+תמונה+מחיר. יש רצון שלחיצה על "פרטים נוספים" תוביל לדף עשיר של השותף שמציע את התשורה (Hero, גלריה, וידאו, קופונים, יצירת קשר), ושאותו שותף יוכל להשתתף במספר קמפיינים במקביל בלי לשכפל את התוכן שלו.

נבדק בקוד הקיים (2026-07-28) לפני קבלת ההחלטות:

- **`entities.entity_type`** מכיל היום ערכים של **סיווג משפטי/מס**: `association`, `chalatz`, `political_party`, `sole_proprietor`, `company` (מאומת ב-2026-07-28 מול ה-CHECK constraint בפועל ב-DB, `entities_entity_type_check` — זו הוספה עדכנית: בדיקה קודמת שחיפשה רק בקבצי `migrations/*.sql` לא מצאה אותה, כי היא הוגדרה ישירות ב-DB ולא דרך migration מתועד). ה-Extractor להפקת ישות מטקסט חופשי (`hamonym-backend/src/agents/campaign-creation/extractors/free-text.extractor.js:38-44`) ממפה מילות מפתח בעברית (`עמותה`, `חל״צ`, `עוסק מורשה` וכו') לערכים האלה. בכל מקרה — זהו סיווג משפטי, ואין שום קשר בינו לבין "מה התפקיד של הישות בפלטפורמה"; זו בדיוק הסיבה שהמסקנה (§1) לא משתנה למרות התיקון העובדתי.
- **`user_entities`** מכיל `user_id, entity_id, role` — `role` הוא גם הוא טקסט חופשי, בפועל נעשה בו שימוש רק לערך `'owner'` (`entities.service.js:248-267`, נבדק גם ב-`platform.service.js:407`).
- מנגנון ההרשאה `requireEntityOwnership`/`isEntityMember` (`hamonym-backend/src/middleware/entity-permission.middleware.js`) בודק חברות ב-`user_entities` בלבד — לא תלוי כלל ב-`entity_type` — ולכן ניתן ל-reuse מלא בלי שינוי.
- קיים כבר בלוק `sponsors` בבילדר הקמפיין (`campaign-studio-state.service.ts`) — רשימת לוגואים שטוחה (`{id, name, logoUrl, link}`), instance יחיד לקמפיין, בלי Login/Builder/Reuse. זהו concept נפרד, לא תשתית ל-Partner.

## החלטה (Decision)

### 1. הסיווג הפלטפורמי נפרד מהסיווג המשפטי

`entity_type` **לא** ישמש לייצוג "Partner". נייצג את התפקיד בפלטפורמה בנפרד לגמרי מהסיווג המשפטי. **עדכון בעקבות מימוש (ראה "יישום Phase 2" למטה):** זה **לא** יכול להיות שדה יחיד בעל ערך בלעדי (`platform_role`/`entity_kind`) — כי ישות יכולה להחזיק כמה תפקידים בו-זמנית (§7). המימוש הסופי הוא טבלת Join, `entity_roles(entity_id, role)`. הטבלה הבאה ממחישה את העיקרון (ציר משפטי מול ציר פלטפורמי) — לא את הצורה הסופית של הנתונים:

| Legal Type (`entity_type`, קיים) | Platform Role (שדה חדש) |
|---|---|
| עמותה | Organization |
| חל"צ | Organization |
| עוסק מורשה | Partner |
| חברה בע"מ | Partner |
| עוסק פטור | Partner |
| עמותה | Partner *(אפשרי בעתיד — גם עמותה יכולה להציע תשורה)* |

השילוב חופשי — שני צירים בלתי תלויים, לא Enum יחיד.

### 2. Partner הוא Entity לכל דבר

Partner משתמש **במלואו** במנגנון הקיים: `entities`, `users`, `user_entities`, `requireEntityOwnership`, ה-Approval Workflow הקיים (ראה `SUPER_ADMIN_CONTEXT.md`). אין Login/Dashboard/Approval נפרד — רק ערך חדש בשדה ה-Platform Role.

### 3. Partner Profile — פרופיל גלובלי אחד, ניתן ל-Reuse

בעלים: השותף (חברי `user_entities` של אותה entity). מכיל: לוגו, Hero, גלריה, וידאו, אודות, טלפון, מייל, אתר, רשתות. נבנה באמצעות אותו Builder (ראה ADR הנפרדת — [PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md](./PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md)).

### 4. `CampaignPartner` — טבלת קשר, לא תלות של Reward

```
Campaign ←→ CampaignPartner ←→ Partner
                  ↓
               Reward (אופציונלי)
```

`CampaignPartner` הוא הישות המרכזית של הקשר קמפיין-שותף — **לא** Reward. השדות שבבעלות מנהל הקמפיין (לא הפרופיל הגלובלי):

```
campaign_id
partner_id
reward_id        -- nullable: שותף יכול להיות "רק חסות" בלי תשורה
order             -- סדר הופעה בקמפיין
visible
coupon
campaign_message  -- הודעה ספציפית לקמפיין הזה
```

**למה לא `Reward → Partner`:** מחר בבוקר יידרשו שאילתות כמו "כל השותפים של הקמפיין", "עמוד עסקים תומכים", קרוסלת לוגואים, ו"שותפים בלי תשורה בכלל" — כל אלה טבעיים כשה-CampaignPartner הוא הישות המרכזית והתשורה היא שדה אופציונלי שלה, ומסורבלים אם הכיוון הפוך.

### 5. ניווט בין שותפים (Partner Navigation) — חלק מה-MVP

בתחתית דף שותף: ניווט הבא/קודם מבוסס `CampaignPartner.order`, מסונן ל-`visible = true` בלבד. המשתמש נשאר בהקשר הקמפיין (`/campaigns/:slug/partners/:partnerSlug`) — לא יוצא ממנו. כפתור קבוע "חזרה לתשורות הקמפיין".

### 6. Sponsors נשאר בדיוק כמו שהוא

בלוק `sponsors` הקיים **לא** מוחלף ולא עובר מיגרציה. אלה שני concepts שונים במכוון:

| | Sponsor (קיים) | Partner (חדש) |
|---|---|---|
| מהות | Marketing Widget | Platform Entity |
| תוכן | לוגו+קישור | פרופיל עשיר, Builder |
| Login | אין | יש (entity רגיל) |
| Reuse בין קמפיינים | לא | כן |

אם בעתיד יתברר שרוב ה-Sponsors רוצים גם עמוד עשיר — זו החלטת Migration נפרדת, לא כלולה כאן.

### 7. Entity יחיד יכול להיות גם Organization וגם Partner בו-זמנית

**נעול (2026-07-28):** כן, מותר. אין מגבלה מלאכותית האוסרת על entity אחד להחזיק בו-זמנית קמפיינים משלו (Organization) ולהופיע כ-Partner בקמפיין של entity אחר (למשל עמותה שמפעילה קמפיינים ומציעה תשורה לקמפיין של עמותה אחרת; חברה עם קמפיין CSR משלה שגם משתתפת כשותפה בקמפיינים חיצוניים). מכיוון ש-Platform Role הוא שדה נפרד מ-`entity_type` (§1) ולא Enum בלעדי, זה נתמך במודל כפי שהוא — לא נדרש שינוי סכימה נוסף. UX/Dashboard-side (איך זה מוצג לאותו entity שיש לו שני "כובעים") נשאר לשלב המימוש, אך אינו חוסם ארכיטקטונית.

### 8. Slug של Partner — גלובלי, לא per-campaign

**נעול (2026-07-28):** ה-slug הוא מאפיין **גלובלי וייחודי** של ה-Partner Profile עצמו (`partners.slug`, שם עמודה סופי ייקבע במימוש) — לא נגזר או משוכפל per-campaign. אותו slug משמש הן ב-URL המקונן בהקשר קמפיין (`/campaigns/:slug/partners/:partnerSlug`, §5) והן, אם/כאשר ייבנה, ב-route גלובלי עצמאי (`/partners/:partnerSlug`). זה עקבי עם עקרון ה-Reuse: פרופיל אחד, slug אחד, בלי קשר לכמה קמפיינים הוא מקושר.

### 9. נדחה במפורש ל-V2 (לא MVP)

- **Invite Existing Business Users to Partner** *(נקרא בעבר "Claim Ownership" — שונה במכוון, ראה §10)* — מנהל קמפיין יוצר Partner ועורך אותו; מאוחר יותר שולח הזמנה במייל לאיש קשר אצל השותף; כשההזמנה מתקבלת, המשתמש הזה מתווסף כ-**עורך נוסף** על אותו entity (שורה חדשה ב-`user_entities`, לא שינוי לשורה קיימת). **אין** מצב `pending_claim`/`unclaimed` בסכימה — היעדר עורך נוסף הוא פשוט המצב הרגיל (entity עם עורך אחד), לא סטטוס שצריך לייצג. לא נדרש ל-MVP כי מנהל הקמפיין יכול פשוט למלא את הפרטים בעצמו עד שיש למי לשלוח הזמנה.
- **Partner Analytics** (חשיפות, קליקים, קופונים שנוצלו) — נשען על `CampaignPartner` כטבלה קיימת, אז לא חוסם ארכיטקטונית; רק לא נבנה עכשיו.
- **Partner-initiated participation** ("מצא קמפיינים / הגש בקשה") — הרחבה לכיוון Marketplace דו-צדדי. משמעותית מספיק כדי להישאר שלב נפרד לגמרי.

### 10. עריכה = `user_entities` הקיים, לא Owner/Editor חדש (נעול 2026-07-29)

מי רשאי לערוך Partner נקבע **אך ורק** ע"י שורות ב-`user_entities` הקיים (`user_id, entity_id, role`) — בדיוק אותו מנגנון שכבר קובע מי מנהל כל entity אחר במערכת. **אין** צורך במושג חדש ("Editor"/"Owner"/"Claim"/"Ownership Transfer") — `user_entities` הוא כבר טבלת many-to-many, ושום קוד קיים לא מניח שורה יחידה per entity (`isEntityMember`/`requireEntityOwnership` בודקים "האם קיימת שורה", לא "יש בדיוק שורה אחת"). מכאן:

- מי שיוצר Partner מקבל שורת `user_entities` אוטומטית (בדיוק כמו `createEntity` היום) — הוא "העורך הראשון", בלי צורך במונח מיוחד.
- הוספת עורך נוסף (למשל איש קשר אצל השותף עצמו, אחרי §9) היא **שורה נוספת** על אותו `entity_id` — לא "העברה", לא מחיקת השורה הקיימת.
- מנהל קמפיין שרק מקשר Partner קיים דרך `CampaignPartner` **לעולם לא** מקבל שורת `user_entities` על ה-Partner — הוא מקבל רק reference (בדיוק כפי שכבר ממומש ב-Phase 2; §4 ו-Ownership Split כבר תיארו את זה נכון).

**שני צירים נפרדים לגמרי**, ולא להתבלבל ביניהם:

```
user_entities      → מי רשאי לערוך את ה-Partner Profile עצמו
CampaignPartner    → באילו קמפיינים ה-Partner משתתף
```

זו בדיוק ההפרדה שכבר קיימת בעיקרון המנחה (למטה) בין "Partner Profile" ל-"היחס לקמפיין ספציפי" — §10 רק מבהיר איזו טבלה קונקרטית אחראית על כל ציר.

**שלושה מסלולים בלבד להיהפך לעורך (`user_entities`), נעול 2026-07-29 — אין מסלול רביעי, ואין מנגנון הרשאות נוסף:**

1. **מנהל קמפיין** יוצר Partner (אם אינו קיים), בונה לו דף, מחבר אותו לקמפיין שלו — הופך לעורך **כי הוא היוצר** (בדיוק כמו `createEntity` הקיים היום לכל entity).
2. **העסק עצמו** מקבל Invite (§9) ומצטרף כעורך **כי הוזמן** — שורה נוספת על אותו `entity_id`, לא העברה.
3. **Super Admin** יכול הכל — ליצור/לערוך כל Partner, להזמין, להוסיף/להסיר עורכים — **כי הוא מנהל מערכת**, לא כי יש לו שורת `user_entities` משלו (Super Admin routes כבר עוקפים לחלוטין את בדיקת `user_entities`, ר' `entity-permission.middleware.js` — זהה למנגנון הקיים לכל entity אחר בפלטפורמה).

**הערה חשובה — לא לבלבל עם "אין מנגנון חדש":** מיזוג Partners כפולים (למשל שני "קפה לנדוור" שנוצרו בטעות ע"י שני מנהלי קמפיין שונים) **אינו** כלול במודל הזה כפי שהוא — זו לא שאלת הרשאות (`user_entities`) אלא פעולת איחוד נתונים (העברת `campaign_partners.partner_entity_id` מהכפילות לרשומה האמיתית, מיזוג שורות `user_entities`, ואז מחיקה/הסתרה של הכפילות). כלי Super-Admin-בלבד עתידי, קטן אך אמיתי — לא להניח שהוא "מגיע בחינם" מהמודל הקיים.

### 11. Partner יכול להתקיים בלי אף קמפיין (נעול 2026-07-29 — כבר נכון בסכימה הקיימת, ללא שינוי)

**כן.** `Partner ← 0..N CampaignPartners`, לא `Campaign → Partner`. זה כבר בדיוק המצב בסכימה שנבנתה ב-Phase 2, בלי שנדרש לחשוב על זה במפורש עד עכשיו: `entities`/`entity_roles` (הזהות/תפקיד של Partner) אינם תלויים בשום צורה ב-`campaign_partners` — אין FK, אין CHECK, אין טריגר שדורש קיום קישור לקמפיין. entity עם `entity_roles.role='partner'` ואפס שורות `campaign_partners` הוא מצב תקין לגמרי, לא מקרה קצה. המשמעות המעשית: אפשר ליצור Partner, לערוך לו דף מלא, ואפילו להזמין את העסק כעורך (§9) — הכל **לפני** שהוא מקושר לקמפיין ראשון כלשהו. זה בדיוק מה שמאפשר את הרצף הטבעי ב-Phase 4 (יצירה → Discovery/עריכה → רק אז Campaign Linking כ-Epic נפרד ומאוחר).

### 12. "פרטים נוספים" מול "על השותף" — שני מושגים נפרדים (נעול 2026-07-29, לפני Phase 5)

כשתשורה מקושרת ל-Partner (`CampaignPartner`), לחיצת "פרטים נוספים" הקיימת (פותחת את המודל הקיים עם תיאור/מחיר/תמונת התשורה — נבנה מוקדם בסשן זה, לפני שהיה קיים מושג Partner) **לא משתנה ולא מוחלפת**. במקום זאת, מתווספת פעולה נפרדת — **"על השותף"** — שמופיעה **רק** כשלתשורה יש `CampaignPartner` מקושר, ומובילה לדף ה-Partner (Phase 5 Routing, §5 למעלה).

**למה לא החלפה (אופציה A) ולא השארה בלבד (אופציה B):** "מה אני מקבל?" (תוכן התשורה) ו-"מי נותן את ההטבה?" (מי השותף) הן שתי שאלות שונות מבחינת המשתמש. החלפה מלאה מאבדת את תיאור התשורה המהיר; השארה בלבד לא נותנת גישה לדף השותף בכלל. הפרדה לשתי פעולות נפרדות פותרת את שתיהן בלי לפגוע אחת בשנייה, ולא דורשת שינוי במודל/במודל ה-Modal הקיים — רק תנאי הצגה נוסף (`*ngIf` על קיום `CampaignPartner` עבור אותה תשורה) ופעולה חדשה לצידו.

## עיקרון מנחה (Guiding Principle)

> Partner Profiles are reusable platform assets, while CampaignPartner represents the relationship between a partner and a specific campaign. Campaign-specific content belongs to the relationship, not to the partner profile.

כל שאלה עתידית ("איפה שדה X נשמר?", "מי רשאי לערוך אותו?", "האם הוא מתעדכן בכל הקמפיינים?") נגזרת ישירות מהעיקרון הזה.

**מבחן מעשי להוספת שדה ל-`CampaignPartner` (Phase 2):** אם שינוי בשדה אמור להשפיע על **כל** הקמפיינים שבהם השותף משתתף — הוא שייך ל-Partner Profile. אם השינוי אמור להשפיע **רק** על קמפיין אחד — הוא שייך ל-`CampaignPartner`. יש להריץ את המבחן הזה על כל שדה חדש לפני שהוא נוסף, כדי למנוע זליגת אחריות בין שתי הישויות עם הזמן.

**עיקרון הנדסי נוסף (נקבע 2026-07-29, תוך כדי Sprint 5.1 — חל על כל Phase מכאן ואילך):** אם כדי להדגים יכולת חדשה צריך להיכנס למסד הנתונים, להרכיב URL ידנית, או לערוך `localStorage`/JSON ידנית — כנראה שחסרה נקודת כניסה ב-UI. זה לא אומר שכל יכולת חייבת להיות נגישה לכל משתמש (הרשאות עדיין חלות), אלא שלכל יכולת צריכה להיות דרך טבעית להגיע אליה עבור מי שאמור להשתמש/לפתח/לבדוק אותה. שני הקישורים שנוספו ("✏ ערוך דף שותף" בכרטיס תשורה מחוברת, "👁 צפייה בדף הציבורי" בטופבר ה-Builder) הם דוגמה ליישום העיקרון הזה בפועל — **הם אינם scaffolding זמני**, הם Developer/Manager UX לגיטימי שסביר שיישאר גם אחרי ש-Sprint 5.2-5.4 יסתיימו (מנהל קמפיין באמת ירצה לערוך את דף השותף; מי שעורך תוכן באמת ירצה לראות תצוגה מקדימה חיה).

## שיקולים עתידיים (Future Considerations — לא MVP)

**Visibility/Status ברמת ה-Partner Profile:** מעבר ל-`visible` שכבר קיים ברמת `CampaignPartner` (האם שותף מוצג *בקמפיין ספציפי*, §4), ייתכן שיידרש בעתיד status ברמת ה-Partner Profile עצמו — למשל `draft / active / hidden / archived` — כדי להבדיל בין "לא מוצג בקמפיין X" לבין "לא מוצג בשום חיפוש/מדריך שותפים כללי, אך עדיין מקושר לקמפיינים קיימים". זה משתלב טבעית עם מודל ה-Entity הקיים (ראה `is_hidden`/`deleted_at` הקיימים כבר על `entities`, ב-`ENTITY_LIFECYCLE_AND_SEO_CONTEXT.md`) ולא דורש שינוי כיוון — רק לא נכלל ב-MVP.

**התפתחות ל-Marketplace דו-צדדי:** עם הזמן, Partner Profile מתמשך + נוכחות במספר קמפיינים + אנליטיקה (חשיפות/כניסות/המרות, ראה §9) + השתתפות ביוזמת השותף — הופכים את "המונים" למשהו קרוב יותר לפלטפורמה שמחברת עמותות ועסקים, לא רק כלי לניהול קמפיין בודד. המודל הנוכחי (Partner כ-Entity, Platform Role נפרד, CampaignPartner כישות מרכזית) תוכנן כך שהוא תומך בכיוון הזה בלי לחסום אותו, אך אינו כולל אף חלק ממנו כעת.

## סדר יישום מוצע (Rollout Order)

| Phase | תוכן | סטטוס |
|---|---|---|
| 1 — Foundation | שני ה-ADR, ההחלטות הארכיטקטוניות (§1-8) | ✅ הושלם (תכנון) |
| 2 — Domain | טבלאות `campaign_partners` + `entity_roles`, הרשאות/בעלות, API | ✅ הושלם (2026-07-28) — ראה "יישום Phase 2" למטה |
| 3 — Builder | Refactor ל-Owner Context ([PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md](./PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md)), Partner Drafts, Sections חדשים | ✅ הושלם (2026-07-29) |
| 4 — Partner Management | 5 Epics (למטה) | ✅ הושלם (2026-07-29) — Epics 1-4; Epic 5 (Merge) נשאר לא-חובה כמתוכנן |
| 5 — Public Experience | 5 Sprints (למטה) | ▶️ בתהליך — Sprint 0/5.1/5.2/5.3 ✅ הושלמו; 5.4 (Polish) נותר |
| 6 — הרחבות (V2+) | Analytics, Marketplace דו-צדדי (השתתפות ביוזמת השותף) | נדחה במפורש |

**עדכון 2026-07-29 — פיצול Phase 4 המקורית לשתיים:** "UX" הישנה התבררה כשני עניינים נפרדים בעלי סדר תלות טבעי — קודם המערכת צריכה לדעת *מי השותפים ואיך מנהלים אותם* (Partner Management = Back Office), ורק אחר כך נבנית *החוויה הציבורית* סביבם (Public Experience = Front Office). Invite (שהיה תחת "הרחבות V2" הישן) עבר לתוך Phase 4 — הוא חלק אינטגרלי מ"איך יוצרים/מנהלים Partner", לא הרחבה נפרדת.

### Phase 4 — Partner Management: 5 Epics (מוגדר 2026-07-29, ✅ הושלם 2026-07-29)

מטרת הפאזה כולה: לענות על שאלה אחת — **איך Partner נכנס למערכת ואיך מחברים אותו לקמפיינים?**

1. **Partner Creation** — שלושת המסלולים (§10): מנהל קמפיין יוצר Partner; העסק נרשם בעצמו; Super Admin יוצר Partner.
2. **Partner Discovery** — חיפוש Partner קיים (לפני יצירת חדש), מניעת כפילויות, יצירה רק אם לא נמצא.
3. **Invite** (§9) — הזמנה במייל; משתמש קיים → `user_entities` ישירות; משתמש חדש → הרשמה ואז `user_entities`.
4. **Campaign Linking** — מנהל קמפיין בוחר Partner קיים, מחבר לקמפיין, בוחר תשורה, מגדיר Coupon/Visibility/Order (UI מעל ה-API הקיים מ-Phase 2).
5. **Duplicate Merge** — לא חובה לבנות מיידית, אך כדאי להשאיר לפחות Endpoint/Admin Tool בסיסי (ר' ההערה תחת §10 — זו פעולת איחוד נתונים אמיתית, לא "מגיעה בחינם"). **לא נבנה ב-Phase 4** — נשאר עתידי כמתוכנן.

Phase 2 ו-3 יכולים להתקדם בקצב נפרד זה מזה (זו בדיוק הסיבה ששתי ה-ADR נפרדות) — Phase 4 תלוי בהשלמתן; Phase 5 תלויה בהשלמת Phase 4.

### Phase 5 — Public Experience: 5 Sprints (מוגדר 2026-07-29, Sprint 5.1 ✅ + Sprint 0 ✅ הושלמו 2026-07-29)

בניגוד ל-Phase 3/4 (שנבנו כמקשה אחת), Phase 5 מחולקת לספרינטים שכל אחד נותן ערך עצמאי — לא ממתינים לסוף כדי לראות תוצאה. **הוסף בדיעבד, בסדר-קדימות ראשון:**

0. **Sprint 0 — Partner First (Partners Back-Office).** יעד: נקודת כניסה עצמאית ליצירת/ניהול Partner, בלתי-תלויה בקמפיין כלשהו — לא רק תרחיש בדיקה חסר אלא Use Case עסקי חסר (זוהה ע"י המשתמש תוך כדי בדיקת Sprint 5.1). עד אז יצירת Partner התאפשרה רק כתופעת-לוואי של עריכת תשורה בקמפיין, בסתירה בפועל ל-§11 (Partner הוא Entity עצמאי). היצירה-מתוך-קמפיין **נשארת** כקיצור-דרך לגיטימי, אך אינה עוד נקודת הכניסה היחידה/הראשית.

1. **Sprint 5.1 — Public Partner Page.** יעד: כתובת ציבורית קיימת, נטענת ישירות, מציגה דף Partner מלא (Hero/Story/Gallery/Map/Opening Hours/Coupons) דרך Renderer ציבורי. **בלי** ניווט, **בלי** הקשר קמפיין, **בלי** "הבא/קודם" — עמוד עצמאי בלבד.
2. **Sprint 5.2 — Campaign Integration ✅ הושלם (2026-07-30).** מחבר את מה שכבר קיים: תשורה → "🤝 בשיתוף עם X" (§12 — נפרד מ"לפרטים נוספים") → דף השותף מ-5.1, ועם כפתור "← חזרה לקמפיין".
3. **Sprint 5.3 — Partner Navigation ✅ הושלם (2026-07-30).** הבא/קודם בין שותפי קמפיין, לפי הרשימה הציבורית הממוינת (`display_order`) שכבר קיימת מ-Phase 2 — רק UI.
4. **Sprint 5.4 — Polish.** Loading states, SEO/OpenGraph, Breadcrumbs, 404, Empty states, UX ל-sponsor-only (Partner בלי תשורה מקושרת).

**Acceptance Test עסקי נוסף ל-Phase 5 (מוגדר 2026-07-29, לפני תחילת המימוש):** עריכת ה-Hero של Partner, שמירה, ורענון הדף הציבורי — משקף את השינוי **מיד**, בלי "פרסום" נפרד, ובלי להשפיע על קמפיינים אחרים שמשתמשים באותו Partner. זו לא בדיקת Regression רגילה — היא מאמתת את ההבטחה המרכזית של המודל כולו: **Partner אחד, דף אחד, שימוש חוזר במספר קמפיינים** (העיקרון המנחה, למעלה). אם הבדיקה הזו נכשלת, זה סימן שמשהו בדרך חזר בטעות למודל "עותק per-קמפיין" שה-ADR דחה במפורש (§ Partner Domain Model, ההשוואה ל"ארומה בית שמש").

### §13 — מודל שכבתי: Partner Profile / Campaign Participation (נעול 2026-07-30, אחרי Sprint 5.2/5.3)

**הבעיה שהתגלתה:** תצפית ישירה על דף שותף ישן (אמיתי) הראתה שכמעט כל תוכנו — מבצע, קופון, תמונות/סיפור, מיתוג, "בשיתוף עם X" — שייך בפועל **לקמפיין הספציפי**, לא לעסק עצמו. דף Partner יחיד ומשותף (כפי שנבנה ב-Sprint 5.1) לא יכול לשאת תוכן כזה בלי אחת משתי בעיות: (א) לאבד את הפרסום הספציפי-לקמפיין לגמרי, או (ב) לחזור למודל "עותק per-קמפיין" שכבר נדחה במפורש למעלה (ההשוואה ל"ארומה בית שמש") — כי שני קמפיינים ששניהם משתמשים באותו Partner היו "נלחמים" על אותו תוכן משותף.

**הפתרון — שני Owners נפרדים, לא Entity אחד:**

| שכבה | Storage | תוכן | Hero נקרא |
|---|---|---|---|
| **Partner Profile** | `entities.blocks/layout` (Phase 3, קיים) | נצחי: אודות, גלריה, מיקום, שעות פתיחה, אתר, שיתוף | קאבר העסק |
| **Campaign Participation** | `campaign_partners.blocks/layout` (**חדש**, migration `036`) | משתנה מקמפיין לקמפיין: מבצע/קופון, תמונות/סיפור ספציפיים, CTA | באנר המבצע |

הדף הציבורי **מרכיב** (Composition, לא Entity אחד) את שתי השכבות: שדות ה-Hero הקבועים (כותרת, תמונת רקע) **תמיד** מגיעים מ-Partner Profile; Campaign Participation תורם רק **בלוקים** נוספים, מוצגים ראשונים (לפני תוכן ה-Profile) כשיש הקשר קמפיין (`?campaignSlug=`). ביקור ישיר בלי הקשר קמפיין (המקרה שקיים מ-Sprint 5.1) מציג Partner Profile בלבד — שום דבר לא נשבר.

**כלל נעול ב-`owner-registry.ts`:** בלוק שמייצג תוכן פרסומי-לקמפיין (`coupons`) שייך **תמיד** ל-`campaign-partner` בלבד — לעולם לא גם ל-`partner`, כדי שלא יהיה מצב שאף אחד לא זוכר איפה לערוך אותו. `hero` נשאר משותף לשלושת ה-Owners (`campaign`/`partner`/`campaign-partner`) — זה **לא** אותה בעיה, כי כל Owner הוא storage נפרד לגמרי; רק התווית שונה ("Hero" / "קאבר העסק" / "באנר המבצע").

**מה נבנה:**
- Backend: migration `036` (`campaign_partners.blocks/layout`); `getDraft`/`updateDraft`/`getOne` ב-`campaign-partners.service.js` (בעלות = בעלות הקמפיין, כמו `update`/`remove`); `mapPublicRow`/`listPublicForCampaign` מחזירים גם `blocks`/`layout`; routes `GET/PATCH /:id/draft`, `GET /:id`.
- `owner-registry.ts`: `OwnerType` שלישי `'campaign-partner'`; `SECTION_REGISTRY`/`OWNER_CAPABILITIES`/`OWNER_VALIDATORS` מורחבים.
- `createInitialCampaignPartnerDraft()` חדש (מבוסס על `createInitialPartnerDraft`, לא `createInitialDraft` — אותו נימוק).
- `campaign-partner-builder-page` חדש (route `campaign-partners/:id/builder`) — REUSE מלא של Editor+Preview (בדיוק כמו Partner Builder), פלוס מתג דסקטופ/מובייל (`StudioUiService`) שהיה חסר גם ב-Partner Builder עד כה.
- `partner-public-page.component`: `forkJoin` בין Profile ל-Participation (כשיש `campaignSlug`), הרכבה עם namespacing של IDs (`cp-` prefix) כדי למנוע התנגשות.
- קישור "🎯 תוכן ההשתתפות בקמפיין" נוסף ליד "✏ פרופיל השותף" (שונה שם, לא הוסר) בכרטיס תשורה מחובר.
- `isCampaign(draft)`/getter `isCampaign` חדשים ב-Renderer/Editor — מחליפים את כל בדיקות `ownerType !== 'partner'` הקודמות (שפספסו את ה-Owner השלישי) בבדיקה חיובית אחת.

**באג אמיתי שהתגלה ותוקן תוך כדי אימות:** `CampaignPartnersService.listPublicForCampaign` (נבנה קודם באותה ישיבה, ל-Sprint 5.2) לא פרק את עטיפת ה-JSON (`{partners:[...]}`) — גרם ל-`TypeError: X is not iterable` בזמן אמת בכל צרכן של ה-endpoint, כולל תג "בשיתוף עם" עצמו. לא נתפס עד לבדיקה החיה של הפיצ'ר הזה (`ng build` לא תופס טעויות runtime כאלה).

**תוצאות בדיקה (Playwright חי):** שותף נוצר, קושר לקמפיין test אמיתי, "🎯 תוכן ההשתתפות בקמפיין" נפתח, נוסף בלוק קופון (זמין רק כאן), נשמר ואומת ב-DB. הדף הציבורי המורכב (session אנונימי) הציג, בסדר הנכון: פס חזרה לקמפיין ← קאבר העסק (Profile) ← כרטיס הקופון עם קוד/הנחה אמיתיים (Participation) ← תוכן "אודות" (Profile) — בדיוק המבנה שנקבע. אפס שגיאות קונסול אחרי התיקון. `ng build --configuration development` נקי.

**עוד לא נבנה (מחוץ להיקף):** UI לעריכת שדות ה-Hero הקבוע (כותרת/תמונת רקע) בתוך אחד משני ה-Builders עצמם — עדיין רק ב"פרטי בסיס" (שלב 1 קמפיין), לא חלק מהם. אם יתברר כחוסם (למשל: אין דרך להעלות תמונת קאבר לשותף כלל), נדרש Epic נפרד.

## יישום Sprint 0 — Partners Back-Office / Partner First (2026-07-29)

**סטטוס:** הושלם ונבדק חי. Scenario 0 (10 צעדים) אומת מקצה לקצה דרך UI בלבד.

**מה נבנה:**
- `GET /api/entities/my-partners` (`getMyPartners` — `entities` ∩ `user_entities` ∩ `entity_roles.role='partner'`, ממוין לפי שם).
- `GET /api/campaign-partners/partner/:partnerId` (`listCampaignsForPartner` — סימטרי ל-`GET /campaign/:campaignId` הקיים, בעלות נבדקת דרך `isEntityMember`).
- `PartnersListPageComponent` חדש ב-route `/partners` (בתוך ה-shell עם sidebar, לא route ציבורי כמו `partners/:id/view`) — רשימה + טופס יצירה מוטמע ("+ שותף חדש": שם/אתר/קשר, אותו מינימום בדיוק כמו היצירה מתוך `PartnerLinkModalComponent`), מנווט ל-Builder מיד אחרי היצירה (`createEntity` → `addRole(id,'partner')` → navigate).
- פריט ניווט "שותפים" (`PARTNERS`, אייקון חדש) נוסף ל-`NAV_BY_ROLE['entity-manager']` ב-sidebar, אחרי "שגרירים".
- ב-`partner-builder-page`: פאנל "קמפיינים שמשתמשים בשותף הזה (N)" עם מצב-ריק מפורש — הופך את §11 (Partner יכול להתקיים בלי שום קמפיין) לעובדה גלויה בממשק, לא רק הנחת מודל.

**Reason:** תוך כדי בדיקת Sprint 5.1, המשתמש זיהה שזה לא פער-בדיקה אלא Use Case עסקי חסר — יצירת Partner הייתה אפשרית *רק* כתופעת-לוואי של עריכת תשורה בקמפיין, מה שסותר בפועל את §11 (Partner ← 0..N CampaignPartners, קיום עצמאי הוא מצב תקין ולא edge-case). הוגדר "Scenario 0 — Partner First" כ-Acceptance Test מרכזי: כניסה עצמאית ← יצירה ← בניית דף ← הזמנת עורך ← דף ציבורי ← אימות 0 קמפיינים ← קישור מאוחר מתוך קמפיין קיים (חיפוש, לא יצירה חוזרת) ← אימות שהדף הציבורי לא השתנה. היצירה-מתוך-קמפיין נשארת קיימת במפורש כקיצור-דרך, לא בוטלה — רק הפסיקה להיות נקודת הכניסה היחידה.

**תוצאות בדיקה — כל 10 הצעדים אומתו (Playwright, קליקים אמיתיים בלבד, ללא הזרקת נתונים ל-DB):**
1. "שותפים" מוצג ב-sidebar ותפקודי. 2. "שותף חדש" פותח טופס מוטמע. 3. יצירה מעבירה אוטומטית ל-Builder. 4. בלוק Hero נוסף ונשמר. 5. הזמנת עורך נשלחה. 6. פאנל "קמפיינים שמשתמשים" מציג `(0)` + משפט מצב-הריק המדויק. 7. הדף הציבורי נפתח בטאב חדש ומציג תוכן. 8. קמפיין אחר לגמרי → "חבר שותף" → חיפוש (לא יצירה) מוצא את אותו Partner. 9. אחרי החיבור — הדף הציבורי נבדק מ-session אנונימי חדש לגמרי: **ללא שינוי**. 10. הפאנל נבדק מחדש: מציג `(1)`.

אפס שגיאות קונסול. `ng build` עבר נקי. נתוני ה-test נוקו בסוף (כולל סדר מחיקה `email_logs` לפני `entities`, עקב `email_logs_entity_id_fkey` ללא CASCADE).

## יישום Sprint 5.2 + 5.3 — Campaign Integration + Partner Navigation (2026-07-30)

**סטטוס:** הושלם ונבדק חי. נבע מתצפית ישירה של המשתמש בדף השותף שנבנה ב-Sprint 0/5.1 בפועל: "זה לא קמפיין, זה דף עסקי" — חשף שהעורך/הרינדור המשותפים היו ממשיכים "לדלוף" מושגים קמפיין-בלבד (לוגו, תאריך/קטגוריה/מנהל, "₪0 סך גיוס") גם אחרי שהוגדר `ownerType`, כי אף אחד עדיין לא בדק אותם ישירות מול Partner בדפדפן אמיתי.

**תיקוני "Renderer/Editor דולפים" (לא בשום ADR קודם — התגלו בבדיקה חיה):**
- `campaign-preview.component`: לוגו (hero/logo-above-strip/פוטר), meta chips (תאריך סיום/קטגוריה/מנהל), ופס-סטטיסטיקות-גיוס תחתון — כולם `*ngIf` חדש `draft.ownerType !== 'partner'` (לא "אין ערך", אלא "לא רלוונטי בעיקרון"). קישורי ניווט ל"תשורות"/"עדכונים"/"תרומה" הפכו מותנים בקיום הבלוק בפועל (`hasBlockType()` חדש) — קודם היו קבועים ומצביעים לסקשנים שלא קיימים כלל לשותף.
- `campaign-page-builder-step.component` (ה-**עורך**, לא רק הרינדור!): כותרת הצעד, כותרת בלוק-הרקע, וסקשן "פרטי קמפיין" (טוגל לאותו פס-סטטיסטיקות) — תוקנו/הוסתרו לפי `ownerType`.
- שורת הזכויות בפוטר השתמשה ב-`entityName` (שם ה-Entity ה**פעיל של המשתמש המחובר**, לא של השותף המוצג!) — תוקן להשתמש ב-`draft.title` (שם השותף עצמו) כש-`ownerType==='partner'`. זה היה יכול להציג בטעות את שם הארגון של מנהל הקמפיין בפוטר של דף שותף שהוא רק עורך, לא בעלים.

**CTA "קישור לאתר" (נדרש לשותף שאין לו תרומה/הרשמה):** `ctaAction` קיבל ערך שלישי `'link'` + שדה `linkUrl`. Partner חדש מקבל ברירת מחדל `'link'` (לא `'donate'`). בעורך, "תרומה"/"הרשמה למירוץ" מוסתרים ל-Partner; "קישור לאתר" מוצג לכולם (שימושי גם לקמפיין שרוצה כפתור לאתר חיצוני).

**"🤝 בשיתוף עם X" (Sprint 5.2):** `CampaignPartnersService.listPublicForCampaign(slug)` חדש (עוטף `GET /api/campaign-partners/public/:slug` הקיים מ-Phase 2 — לא היה לו צרכן ציבורי עד כה). מוצג בכל 3 תבניות כרטיס תשורה + במודל "פרטים נוספים", **כקישור נפרד** מ"לפרטים נוספים" (§12). מוביל ל-`/partners/:id/view?campaignSlug=&campaignTitle=`.

**"← חזרה לקמפיין" + ניווט בין שותפים (Sprint 5.3):** `partner-public-page.component` קורא `campaignSlug`/`campaignTitle` מ-query params (לא endpoint חדש — נגזר מהקישור הנכנס). אם קיימים: פס עליון לחזרה, ופס תחתון עם שותף קודם/הבא (מאותה רשימה ציבורית, אחרי דה-דופליקציה לפי `partner.id` — שותף יכול לחסות כמה תשורות). ביקור ישיר בכתובת (בלי query params) — המקרה שהיה קיים מאז Sprint 5.1 — פשוט לא מציג את שני הפסים; שום דבר לא נשבר.

**מחיקת שותף:** נעשה שימוש ב-endpoint הקיים `DELETE /api/entities/:id` (soft delete, אותו מסלול self-service כמו מחיקת עמותה). כפתור + מודל type-to-confirm בטופבר ה-Builder וברשימת `/partners`.

**תוצאות בדיקה (Playwright חי, JWT אמיתי):** שותף חדש → Builder ללא לוגו כלל, ללא "קמפיין" בעורך או בפריוויו → הוספת CTA עם "קישור לאתר" בלבד → נשמר ומוצג נכון → מחיקה עם type-to-confirm → נעלם מהרשימה. אפס שגיאות Angular (2 אזהרות Google Sign-In origin, ידועות ולא קשורות). `ng build --configuration development` נקי. **`ng build` production נכשל על budget קיים-מראש** של `campaign-preview.component.css`/`campaign-page-builder-step.component.css` — אומת מול `git show HEAD` שזה קדם לחלוטין לשינוי הזה (לא נגרם כאן, לא תוקן כאן, ממתין לטיפול נפרד באנחלה.json/פיצול קובץ).

## יישום Sprint 5.1 — Public Partner Page (2026-07-29)

**סטטוס:** הושלם ונבדק חי. כל 5 קריטריוני ה-DoD אומתו + Acceptance Test ה-Live-Edit + regression מלא.

**מה נבנה:** `GET /api/entities/:id/public` (`entities.service.js#getPublicPartner` — ללא auth, מסונן ל-`deleted_at IS NULL AND is_hidden=false` וקיום `entity_roles.role='partner'`), route ציבורי `partners/:id/view` וקומפוננטה `partner-public-page` (מייבאת רק `CampaignPreviewComponent`, לא את ה-Builder בכלל — אין אפילו אפשרות טכנית לערוך דרך המסלול הזה).

**באג אמיתי שהתגלה ותוקן (לא ספציפי ל-Partner):** כפתורי "לתמיכה מאובטחת" (nav עליון + sticky bar תחתון ב-`campaign-preview.component`) מעולם לא היו מותנים בקיום בלוק `donation-widget` בפועל — עבדו "במקרה" כי לכל קמפיין קיים תמיד יש כזה. דף Partner (שאין לו בלוק כזה בכלל) חשף את זה מיד. תוקן ע"י `hasDonationWidget(draft)` חדש, אותו דפוס בדיוק כמו `hasAmbassadorsSection()` הקיים.

**תוצאות בדיקה:**
- דף Partner אמיתי (בלוק Hero) נטען **ללא כל token** — הוצג נכון, אפס שגיאות, ללא כפתור שמירה/רכיבי עורך.
- **Live-Edit:** `PATCH /draft` אמיתי (מדמה Save) הוסיף בלוק עם טקסט ייחודי; רענון הדף הציבורי (session אנונימי חדש) הציג אותו מיד — בלי caching, בלי "פרסום".
- Partner מוסתר / לא-קיים → `404` בשני המקרים.
- Regression: קמפיין test עם בלוק donation-widget אמיתי — כפתור התרומה עדיין מופיע (3 מופעים: nav דסקטופ/מובייל + sticky), אפס שגיאות.

`ng build` עבר נקי. כל נתוני ה-test נוקו בסוף.

## יישום Phase 4 (2026-07-29)

**סטטוס:** Epics 1-4 הושלמו ונבדקו end-to-end מול DB/שרת/דפדפן אמיתיים — כל 8 הצעדים של תרחיש ה-Definition of Done שנקבע מראש (מנהל קמפיין → תשורה → "חבר שותף" → חיפוש/יצירה → חיבור → הזמנה → שימוש חוזר ע"י מנהל אחר). Epic 5 (Duplicate Merge) לא נבנה, כמתוכנן.

### תיקון סכימה אמיתי שהתגלה תוך כדי (לא היה ידוע קודם)

`entities.entity_type` הוא **NOT NULL** בפועל ב-DB — לא נראה בשום migration מתועד (אותה תופעה בדיוק כמו ה-CHECK constraint שהתגלה ב-Phase 2: העמודה/האילוץ קדמו לתיקיית ה-migrations). זה סתר ישירות את העיקרון של §1 (סיווג משפטי נפרד לגמרי מתפקיד פלטפורמה) — Partner שנוצר מהר ("שם, לוגו, טלפון, אתר" בלבד, ר' §10 מסלול 1) לא אמור להיאלץ לבחור סיווג משפטי שאין לו. תוקן ב-migration `035_entity_type_nullable.sql`: `ALTER TABLE entities ALTER COLUMN entity_type DROP NOT NULL`. Organizations (דרך אשף "הקמת עמותה/ארגון" הקיים) לא מושפעות — אותו flow כבר תמיד אוסף `entity_type` לפני שליחה.

### מה נבנה

| קובץ | שינוי |
|---|---|
| `hamonym-backend/migrations/034_partner_invites.sql` | טבלה חדשה `partner_invites` (raw token + SHA-256 hash, אותו דפוס כמו `users.password_reset_token`) |
| `hamonym-backend/migrations/035_entity_type_nullable.sql` | `entity_type` הופך Nullable |
| `hamonym-backend/src/modules/partner-invites/*` | חדש — `getInviteByToken` (ציבורי), `acceptInvite` (מאומת, בודק התאמת אימייל + מונע קבלה כפולה) |
| `hamonym-backend/src/modules/email/templates/invite-partner-editor.js` | תבנית מייל חדשה |
| `hamonym-backend/src/modules/entities/entities.service.js/.controller.js/.routes.js` | `searchPartners` (Discovery), `createInvite` |
| `hamonym-app/.../core/services/entities.service.ts` | `searchPartners`, `addRole`, `createInvite`, `getInvite`, `acceptInvite` |
| `hamonym-app/.../campaigns/services/campaign-partners.service.ts` (חדש) | צרכן Frontend ראשון ל-API של Phase 2 |
| `hamonym-app/.../shared/components/partner-link-modal/*` (חדש) | חיפוש/יצירה/חיבור שותף לתשורה |
| `hamonym-app/.../campaign-offerings-step.component.ts/.html/.css` | כפתור "חבר שותף" / "מחובר ל:" לכל תשורה |
| `hamonym-app/.../partner-builder-page.component.ts/.html/.css` | כפתור "הזמן עורך" |
| `hamonym-app/.../auth/pages/accept-invite/*` (חדש) | עמוד ציבורי לקבלת הזמנה |
| `hamonym-app/.../auth/pages/login/login.component.ts` | תמיכה ב-`?returnUrl=` נוספה (אדיטיבי — לא משנה את הניווט הקיים כשה-param נעדר; `register.component.ts` כבר תמך בזה) |
| `hamonym-app/src/app/app.routes.ts` | route חדש `accept-invite` (ציבורי, ללא guard) |

### תוצאות בדיקה — כל 8 הצעדים אומתו, כולל 2 Security Guards

1-2. תשורה חדשה נוספה בפועל דרך ה-UI לקמפיין אמיתי (`gdolim`).
3-4. "חבר שותף" נלחץ; חיפוש "קפה לנדוור" הראה "לא נמצא שותף" (שם ייחודי, לא קיים עדיין).
5-6. Partner נוצר דרך הלשונית השנייה (שם בלבד) **וחובר מיידית** לתשורה — אומת גם ב-DOM ("🤝 מחובר ל:") וגם ב-DB (`campaign_partners.reward_id` תואם בדיוק את `offering.id`).
7. הזמנה נשלחה (נבדק ב-`email_logs`: תבנית ונושא נכונים, `status='disabled'` כצפוי בסביבת dev); התקבלה ע"י משתמש עם אימייל תואם → **שורת `user_entities` שנייה** נוספה (שני עורכים, ללא "העברת בעלות"). **Guards שנבדקו במפורש:** קבלת הזמנה שכבר התקבלה → `410`; קבלת הזמנה ע"י משתמש שהאימייל שלו לא תואם → `403`.
8. מנהל קמפיין **אחר לגמרי** (entity/campaign נפרדים) מצא את אותו Partner דרך `search-partners` וחיבר אותו לקמפיין השני שלו **בלי תשורה** (`reward_id: null`) — מוכיח בפועל את §4 (Reward אופציונלי).

`ng build` עבר נקי בכל שלב. כל נתוני ה-test (2 entities, קמפיין, invites, משתמש) נוקו בסוף; `gdolim` שוחזר במדויק למצבו המקורי (2 תשורות).

### מה עדיין לא נבנה (במכוון, מחוץ ל-Phase 4)

- Epic 5 (Duplicate Merge) — לא MVP.
- UI לעריכת שדות `CampaignPartner` (Coupon/Order/Visibility/Campaign Message) אחרי החיבור הראשוני — כרגע ניתן ליצור/לנתק בלבד דרך ה-UI; עדכון שדות קיים ב-API (Phase 2) אך אין לו טופס.
- Routing ציבורי, ניווט בין שותפים, חיבור "פרטים נוספים" — Phase 5.

## שאלות פתוחות לפני מימוש

אין. השאלה היחידה שנותרה פתוחה (שם השדה) נפתרה בפועל ב-Phase 2 — ראה למטה.

## יישום Phase 2 — Domain Foundation (2026-07-28, רוויזיה אחרי Review)

**סטטוס:** הושלם ונבדק end-to-end מול DB אמיתי. שכבת ה-Domain בלבד — **אין** Builder/UI/Angular/Routing ציבורי/ניווט בין שותפים בשלב הזה. **זו הגרסה השנייה** — הגרסה הראשונה (`entities.is_partner BOOLEAN`) נפסלה ב-Review לפני שנחשבה מוכנה; ראה למטה למה, ומה השתנה. זה בדיוק התהליך שה-ADR נועד לאפשר: Design → Review → Build → **Review** → (תיקון אם צריך).

### התיקון המרכזי: `entity_roles` (טבלת Join), לא `is_partner`/`platform_role` (עמודה יחידה)

הגרסה הראשונה השתמשה ב-`entities.is_partner BOOLEAN`. זה נפסל ב-Review מסיבה עקרונית, לא סגנונית: **כל שדה יחיד — בוליאני או enum — מניח שישות מחזיקה תפקיד אחד**, וזה סותר ישירות את ההחלטה הנעולה §7 ("Entity יכול להיות גם Organization וגם Partner בו-זמנית", וברור שבעתיד עשויים להתווסף עוד תפקידים — Sponsor/Vendor/Municipality). ריבוי דגלים בוליאניים (`is_partner`, `is_vendor`, `is_sponsor`, ...) הוא בדיוק התבנית שה-ADR עצמו נועד למנוע.

**הפתרון:** טבלת `entity_roles (entity_id, role)` — Join Table קלאסית:

```sql
CREATE TABLE entity_roles (
  entity_id  UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('organization', 'partner')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, role)
);
```

הוספת תפקיד עתידי (Sponsor וכו') היא שינוי CHECK constraint + נתונים — **לא** migration שנוגע בכל שאילתה שבדקה עמודה בוליאנית קבועה. `'organization'` כלול ב-CHECK לצורך symmetry אך אין היום שום שורה שנוצרת בפועל עבורו — שום דבר לא בודק "האם ישות יכולה להריץ קמפיין" מול הטבלה הזו (זה עדיין `campaigns.entity_id`, ללא שינוי).

**תיקון עובדתי נוסף ל-§Context:** `entity_type` כן נאכף ע"י CHECK constraint בפועל ב-DB (`entities_entity_type_check`, ערכים: `association/chalatz/political_party/sole_proprietor/company`) — בדיקה קודמת שחיפשה רק בקבצי migrations מתועדים החמיצה אותו כי הוא הוגדר ישירות ב-DB. לא משנה את המסקנה (עדיין ציר סיווג משפטי נפרד לגמרי מתפקיד פלטפורמי) — רק את הניסוח העובדתי.

### שתי שאלות נוספות שעלו ב-Review — הוכרעו במפורש

**מה קורה ל-`CampaignPartner` כש-Partner נמחק?**
- **Hard delete** (מחיקה אמיתית של שורת `entities`, Super-Admin בלבד) → `partner_entity_id` הוגדר `ON DELETE CASCADE`, תואם בדיוק את מפת ה-FK הקיימת למחיקה-קשה של entities (`user_entities` וכו', ראה `ENTITY_LIFECYCLE_AND_SEO_CONTEXT.md`). השורה נעלמת יחד עם ה-Partner.
- **Soft delete** (הרגיל — `entities.deleted_at` בלבד, השורה נשארת) → שורת `campaign_partners` **נשארת קיימת**. הרשימה הציבורית (`listPublicForCampaign`) כבר סיננה `deleted_at IS NULL`/`is_hidden=false` מהגרסה הראשונה, אז זה כבר עבד נכון שם. **התיקון האמיתי** היה ברשימת הבעלים (`listForCampaign`) — נבדק ב-Review שלא סימנה כלום; עכשיו מצטרפת (`JOIN`) ומחזירה `partnerDisplayName`/`partnerDeleted`/`partnerHidden` כדי שמנהל הקמפיין יראה "הקישור הזה מצביע על שותף שנמחק" במקום שהוא ייעלם בשקט או יקרוס.

**מה קורה כשמבטלים תפקיד `partner` בזמן שיש `CampaignPartner` פעילים?**
- **הוחלט: מותר, לא נחסם.** ביטול התפקיד מונע קישורים **חדשים** (הבדיקה ב-`create()` רצה מול `entity_roles` בזמן היצירה בלבד) אבל **לא** פוגע בקישורים שכבר נוצרו כשהתפקיד היה קיים — נבדק במפורש ב-Review (תרחיש 7/7b למטה). ההיגיון: ביטול תג לא מוציא מישהו ממסיבות שהוא כבר הוזמן אליהן, רק עוצר הזמנות חדשות. זו החלטה מודעת, לא side-effect.

### מה נבנה (סופי)

| קובץ | שינוי |
|---|---|
| `hamonym-backend/migrations/032_partner_domain_model.sql` | טבלה `entity_roles`; טבלה `campaign_partners` (אין עוד `entities.is_partner`) |
| `hamonym-backend/scripts/migrate-032.js` | סקריפט הרצה |
| `hamonym-backend/src/modules/entities/entities.service.js` | פונקציות חדשות: `hasRole`/`getRoles`/`addRole`/`removeRole` (ללא שינוי ב-`createEntity`/`updateEntity` — התפקיד חי בטבלה נפרדת, לא בעמודה) |
| `hamonym-backend/src/modules/entities/entities.controller.js` + `.routes.js` | `GET/POST /:id/roles`, `DELETE /:id/roles/:role` — עם `requireEntityOwnership()` (שונה מ-`PATCH /:id` הקיים, שבודק בעלות בתוך ה-service ולא ב-middleware) |
| `hamonym-backend/src/modules/campaign-partners/*` | כמו קודם; `create()` בודק `hasRole(partnerId,'partner')` במקום עמודה; `listForCampaign` מצטרפת ל-`entities` ומחזירה סטטוס partner |
| `hamonym-backend/src/server.js` | ללא שינוי נוסף (mount כבר קיים) |

### Endpoints חדשים (סופי)

| Method | Path | הרשאה |
|---|---|---|
| GET | `/api/campaign-partners/public/:slug` | ציבורי — רק `visible=true` וגם partner לא מוסתר/נמחק |
| GET/POST | `/api/campaign-partners/campaign/:campaignId` | מנהל הקמפיין |
| PATCH/DELETE | `/api/campaign-partners/:id` | מנהל הקמפיין (נגזר מ-`campaign_id`) |
| GET/POST | `/api/entities/:id/roles` | בעלות על ה-entity עצמו (`requireEntityOwnership()`) |
| DELETE | `/api/entities/:id/roles/:role` | בעלות על ה-entity עצמו |

### תוצאות בדיקה (רוויזיה — 11 תרחישים, כולל 3 חדשים מה-Review)

שוב מול DB אמיתי + HTTP חי, נתוני `__PHASE2_SMOKE__` נוקו בסיום. כולם עברו:

1. קישור **לפני** מתן תפקיד `partner` → `400`
2. הענקת תפקיד `partner` דרך `POST /:id/roles` → `200`
3. `GET /:id/roles` מחזיר `['partner']`
4. קישור **אחרי** מתן תפקיד → `201`
5. רשימת בעלים כוללת `partnerDisplayName`/`partnerDeleted:false`/`partnerHidden:false`
6. רשימה ציבורית מציגה את הקישור
7. **ביטול** תפקיד `partner` תוך כדי שהקישור פעיל → `200`, מותר (לא חסום)
7ב. הקישור הקיים עדיין מופיע ברשימת הבעלים אחרי הביטול — לא נפגע
8. ניסיון קישור **חדש** אחרי הביטול → `400` שוב (נחסם כראוי)
9. Soft-delete ל-partner → רשימה ציבורית מתרוקנת (סינון עובד)
9ב. רשימת הבעלים ממשיכה להציג את הקישור עם `partnerDeleted:true` (לא נעלם, לא קרס)
10. עדכון ע"י משתמש שאינו בעל הקמפיין → `403`
11. מחיקת קישור → `204`

### נקודות המחייבות תשומת לב (החלטות יישום, לא סטיות מה-ADR)

- בדיקת `hasRole(partnerId,'partner')` בעת יצירת קישור אינה מפורשת ב-ADR אך הכרחית לשלמות המודל — ניתן לוותר עליה בעתיד אם תתברר כמגבילה מדי.
- ניהול תפקידים (`/roles`) הוא self-service — כל entity owner יכול להעניק/לבטל תפקיד `partner` לעצמו, אין שכבת אישור נפרדת (Super Admin וכו'). שווה לשקול גייט בעתיד, בפרט לפני שהתפקיד הזה נותן גישה לתוכן רגיש.
- **לא נבנה** endpoint לחיפוש/גילוי entities עם תפקיד `partner` (Phase 4/UX) — הדומיין תומך בזה טכנית (`SELECT entity_id FROM entity_roles WHERE role='partner'`) בלי שינוי סכימה.
