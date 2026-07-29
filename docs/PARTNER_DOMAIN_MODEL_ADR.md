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

- **Claim Ownership** — מנהל קמפיין יוצר Partner (`Pending Claim`) לפני שהעסק נרשם בעצמו; מייל הזמנה; ברגע ה-Claim השליטה עוברת לשותף. מודל מוכר (Google Business Profile). לא נדרש ל-MVP כי מנהל הקמפיין יכול פשוט למלא את הפרטים בעצמו.
- **Partner Analytics** (חשיפות, קליקים, קופונים שנוצלו) — נשען על `CampaignPartner` כטבלה קיימת, אז לא חוסם ארכיטקטונית; רק לא נבנה עכשיו.
- **Partner-initiated participation** ("מצא קמפיינים / הגש בקשה") — הרחבה לכיוון Marketplace דו-צדדי. משמעותית מספיק כדי להישאר שלב נפרד לגמרי.

## עיקרון מנחה (Guiding Principle)

> Partner Profiles are reusable platform assets, while CampaignPartner represents the relationship between a partner and a specific campaign. Campaign-specific content belongs to the relationship, not to the partner profile.

כל שאלה עתידית ("איפה שדה X נשמר?", "מי רשאי לערוך אותו?", "האם הוא מתעדכן בכל הקמפיינים?") נגזרת ישירות מהעיקרון הזה.

**מבחן מעשי להוספת שדה ל-`CampaignPartner` (Phase 2):** אם שינוי בשדה אמור להשפיע על **כל** הקמפיינים שבהם השותף משתתף — הוא שייך ל-Partner Profile. אם השינוי אמור להשפיע **רק** על קמפיין אחד — הוא שייך ל-`CampaignPartner`. יש להריץ את המבחן הזה על כל שדה חדש לפני שהוא נוסף, כדי למנוע זליגת אחריות בין שתי הישויות עם הזמן.

## שיקולים עתידיים (Future Considerations — לא MVP)

**Visibility/Status ברמת ה-Partner Profile:** מעבר ל-`visible` שכבר קיים ברמת `CampaignPartner` (האם שותף מוצג *בקמפיין ספציפי*, §4), ייתכן שיידרש בעתיד status ברמת ה-Partner Profile עצמו — למשל `draft / active / hidden / archived` — כדי להבדיל בין "לא מוצג בקמפיין X" לבין "לא מוצג בשום חיפוש/מדריך שותפים כללי, אך עדיין מקושר לקמפיינים קיימים". זה משתלב טבעית עם מודל ה-Entity הקיים (ראה `is_hidden`/`deleted_at` הקיימים כבר על `entities`, ב-`ENTITY_LIFECYCLE_AND_SEO_CONTEXT.md`) ולא דורש שינוי כיוון — רק לא נכלל ב-MVP.

**התפתחות ל-Marketplace דו-צדדי:** עם הזמן, Partner Profile מתמשך + נוכחות במספר קמפיינים + אנליטיקה (חשיפות/כניסות/המרות, ראה §9) + השתתפות ביוזמת השותף — הופכים את "המונים" למשהו קרוב יותר לפלטפורמה שמחברת עמותות ועסקים, לא רק כלי לניהול קמפיין בודד. המודל הנוכחי (Partner כ-Entity, Platform Role נפרד, CampaignPartner כישות מרכזית) תוכנן כך שהוא תומך בכיוון הזה בלי לחסום אותו, אך אינו כולל אף חלק ממנו כעת.

## סדר יישום מוצע (Rollout Order)

| Phase | תוכן | סטטוס |
|---|---|---|
| 1 — Foundation | שני ה-ADR, ההחלטות הארכיטקטוניות (§1-8) | ✅ הושלם (תכנון) |
| 2 — Domain | טבלאות `campaign_partners` + `entity_roles`, הרשאות/בעלות, API | ✅ הושלם (2026-07-28) — ראה "יישום Phase 2" למטה |
| 3 — Builder | Refactor ל-Owner Context ([PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md](./PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md)), Partner Drafts, Sections חדשים | טרם התחיל |
| 4 — UX | ניווט בין שותפים, חזרה לקמפיין, אינטגרציה עם תשורות | טרם התחיל |
| 5 — הרחבות (V2+) | Claim, Analytics, Marketplace, הזמנות לשותפים (§9) | נדחה במפורש |

Phase 2 ו-3 יכולים להתקדם בקצב נפרד זה מזה (זו בדיוק הסיבה ששתי ה-ADR נפרדות) — Phase 4 תלוי בהשלמת שתיהן.

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
