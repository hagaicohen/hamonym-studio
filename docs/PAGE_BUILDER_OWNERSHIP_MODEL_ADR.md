# ADR — Generic Page Builder Ownership Model

**Status:** ✅ **Implemented (Phase 3)** — מומש ואומת חי מול שרת/DB/דפדפן אמיתיים (2026-07-29). ראה "יישום Phase 3" בתחתית המסמך. Phase 4 (UX: ניווט בין שותפים, Routing ציבורי, אינטגרציה עם תשורות) עדיין לא התחילה.
**תאריך:** 2026-07-28
**קשור:** [PARTNER_DOMAIN_MODEL_ADR.md](./PARTNER_DOMAIN_MODEL_ADR.md)

## הקשר (Context)

ה-ADR של [Partner Domain Model](./PARTNER_DOMAIN_MODEL_ADR.md) קובע ש-Partner Profile ייבנה "באמצעות אותו Builder" כמו קמפיין. זו לא רק שאלת UX ("אותם Sections") — נבדק בקוד הקיים (2026-07-28) ומדובר בהנחת יסוד ארכיטקטונית שצריכה להשתנות:

- **`CampaignDraft`** (`campaign-studio-state.service.ts:452`) הוא אובייקט שטוח יחיד: שדות קמפיין (id, entityId, status...), Hero, הגדרות תרומה, `offerings`, `sponsors`, `ambassadors`, `updates`, `blocks: CampaignBlock[]`, `layout: CampaignLayout`.
- **`CampaignBlock`** (שם, שורה 269): `{ id, type, order, visible, label, spacingTop, spacingBottom, data }`.
- **אין כיום שום מושג של "עץ בלוקים" ששייך למשהו חוץ מקמפיין בודד.** `blocks` קיים אך ורק בתוך `CampaignDraft` אחד — אין Owner abstraction, אין block-tree ברמת entity, ואין דבר שניתן ל-Reuse בין כמה "בעלים".
- סוגי הבלוקים הקיימים (`BlockType`, אותו קובץ, שורות 21-75): `rich-text, image, video, gallery, split, cta, divider, container, stats, donation-widget, hero, tabs, accordion, rewards, sponsors, ambassadors, donors, updates, share, comments`. **אין** היום `coupons`, `map`/מיקום, או `opening-hours` — אלה Section types חדשים שנדרשים ל-Partner Profile ולא קיימים בשום צורה היום, לא רק "מסוננים החוצה".

מסקנה: "אותו Builder עם Context אחר" נכון ברמת ה-UX, אבל ברמת הארכיטקטורה נדרש שינוי אמיתי במודל הבעלות של ה-state service — לא רק סינון Sections על גבי מבנה קיים.

## החלטה (Decision)

### 1. Draft/Blocks אינם שייכים בהכרח לקמפיין

מבנה הבעלות עובר מ-1:1 קשיח:

```
Campaign → Draft → Blocks
```

ל-Owner כללי:

```
Owner → Draft → Blocks

Owner:
  Campaign
  Partner
  (בעתיד: Organization Profile / Event / ...)
```

כל Draft נושא `ownerType` + `ownerId`; קמפיין קיים הוא פשוט `ownerType: 'campaign'`.

### 2. אותו Builder פועל על Owner Context

לא Builder נפרד לכל Owner Type. כל Section מכריז אילו Owner Types הוא זמין עבורם:

```
Hero              → Campaign, Partner
Gallery           → Campaign, Partner
Story/Rich-text   → Campaign, Partner
Donation Widget   → Campaign בלבד
Stats             → Campaign בלבד
Rewards           → Campaign בלבד
Ambassadors       → Campaign בלבד
Donors            → Campaign בלבד
Updates           → Campaign בלבד
Sponsors          → Campaign בלבד (ראה ADR Partner Domain Model §6 — נשאר נפרד, לא מוחלף)
Coupons (חדש)     → Partner בלבד
Map/Location (חדש)→ Partner בלבד
Opening Hours (חדש)→ Partner בלבד
```

### 2b. Owner Capability Registry — לא רק Section Registry

מעבר ל-`availableFor` (אילו Sections זמינים), ה-Builder צריך לשאול שאלות כלליות יותר על ה-Owner ("יש לו יעד גיוס?", "מותר לו לפרסם תרומות?") בלי לדעת בעצמו מה זה Campaign או Partner. הפתרון: Registry נפרד של יכולות, לא ענפי `if`:

```ts
OwnerCapabilities = {
  campaign: { canPublish: true,  hasGoal: true,  hasDonations: true,  hasRewards: true,  supportsCoupons: false },
  partner:  { canPublish: true,  hasGoal: false, hasDonations: false, hasRewards: false, supportsCoupons: true  },
};
```

אותו עיקרון בדיוק כמו Section Registry — הוספת Owner Type שלישי מוסיפה שורה כאן, לא לוגיקה חדשה בקוד ה-Builder.

### 2c. Validation Registry

אותו עיקרון גם על Validation/Publish Rules — לא `if (ownerType === 'campaign') validateCampaign(draft)`, אלא ספק Validation רשום per-owner-type:

```ts
OwnerValidationProvider = {
  campaign: CampaignValidator,
  partner:  PartnerValidator,
};
```

בלי זה, ה-`if`-ים פשוט עוברים דירה מה-Builder אל שכבת ה-Validation — ואז ה-ADR הזו לא באמת נאכפת, רק זזה למקום אחר.

### 3. Section types חדשים נדרשים — לא רק סינון

`coupons`, `map`/מיקום, `opening-hours` (וכנראה `about`/`contact`) הם `BlockType` חדשים לגמרי, עם `BlockData` משלהם, שצריך לעצב ולממש — זו עבודה נטו-חדשה, נפרדת מהגנרליזציה של ה-Owner.

### 4. תאימות לאחור — אדיטיבי, בלי מיגרציה

בהתאם לתבנית שכבר מבוססת בפרויקט הזה (כל שדה חדש ב-`CampaignLayout` מוגדר `optional`, ברירת מחדל = ההתנהגות הקיימת המדויקת): `ownerType`/`ownerId` על Draft קיים יכולים להיות מוסקים כ-`'campaign'`/`campaign.id` באופן implicit עבור כל טיוטה קיימת, בלי migration בפועל על נתונים קיימים.

## תוצאות/עלות (Consequences)

- דורש refactor אמיתי של `CampaignStudioStateService` (לא רק Angular template filtering) — `draft`, `patch()`, וכל המתודות התלויות ב-`entityId`/מבנה קמפיין צריכות להיות מודעות ל-Owner, או לחיות מאחורי שכבת הפשטה חדשה.
- ה-Renderer הקיים (`campaign-preview.component`) מבוסס היום על `CampaignDraft` ספציפי לקמפיין (donation widget, stats וכו' תלויים ב-entity/קמפיין באופן ישיר) — רינדור דף Partner ידרוש Renderer מקביל/כללי יותר, לא בהכרח את אותו קומפוננטה כמו שהיא.
- שלושה Section types חדשים (לפחות) לפיתוח מלא: Coupons, Map/Location, Opening Hours.
- לא חוסם את ה-MVP של Partner Domain Model — זו בדיוק הסיבה שהיא ADR נפרדת: אפשר לתכנן/לממש את שכבת ה-Owner בלי לגעת עדיין בתוכן הספציפי של Partner, ולהפך.

## עיקרון מנחה

> לב ההחלטה הזו אינו "אילו Sections מוצגים" — הוא "מי הבעלים של עץ ה-Blocks". ברגע שהבעלות היא Owner כללי ולא Campaign קשיח, גם השאלה "אילו Sections זמינים" הופכת לפרטי יישום (`availableFor`) ולא לשינוי מודל.

## הנחיית מימוש — לשמור על ה-Builder עצמו גנרי (2026-07-28)

הסיכון המרכזי במימוש: נטייה טבעית לפזר במהלך העבודה תנאים כמו `if (ownerType === 'campaign') ... else if (ownerType === 'partner') ...` בכל מקום בקוד ה-Builder/Renderer. זה מכרסם בהדרגה בדיוק את מה שה-ADR הזו נועדה למנוע — Builder כללי לכאורה שבפועל שוב תלוי-Campaign בכל מקום.

**הכלל:** ה-Builder/Renderer/State Service עצמם לא אמורים לדעת "מה זה Campaign" ו"מה זה Partner" — רק *"מהן היכולות של ה-Owner הזה"*. ה-Owner-specific-ness צריכה להתרכז אך ורק ב:

- `availableFor` על כל Section (§2) — לא בלוגיקת רינדור מפוזרת.
- Validators/Publish Rules ספציפיים ל-Owner Type (אם יידרשו) — כאובייקט קונפיגורציה per-owner-type, לא כענפי `if`.
- Navigation (למשל ניווט בין שותפים, ראה Partner Domain Model ADR §5) — מיושם כיכולת שה-Owner Type "מספק", לא כתנאי מותנה בתוך רכיב משותף.

אם בעתיד יתווסף Owner Type שלישי (Organization Profile / Event וכו'), המבחן לכך שהעיקרון נשמר: אין צורך לגעת בקוד ה-Builder/Renderer הקיים — רק להוסיף קונפיגורציה חדשה (Sections + availableFor + capabilities) עבור ה-Owner Type החדש.

## Definition of Done — Phase 3 (נקבע 2026-07-28, לפני תחילת המימוש)

מבחני הקבלה של ה-ADR הזו. כל אחד מהם צריך להיות אמת לפני שה-Phase נחשב גמור — לא רק "יש קוד שעובד":

- [x] **אין `if (ownerType === ...)` / `switch (ownerType)` מפוזר** בקוד ה-Builder/Renderer/State Service. Owner-specific-ness מרוכזת ב-`owner-registry.ts` בלבד; ה-getters ב-`campaign-page-builder-step.component.ts` קוראים `isSectionAvailableFor()`, לא בודקים `ownerType` ישירות.
- [x] **הוספת Owner Type שלישי היא קונפיגורציה בלבד** — נבדק ארכיטקטונית: הוספת ערך ל-`OwnerType` + שורות ב-3 ה-Registry-ים היא כל מה שנדרש; לא נבדק בפועל ע"י הוספת Owner שלישי אמיתי (לא נדרש ל-MVP).
- [x] **כל Section רשום ב-Registry** — `SECTION_REGISTRY` הוא המקור היחיד; `coupons`/`map`/`opening-hours` נוספו כרישום Registry, לא כענף `switch` חדש (מלבד `defaultBlockData()`'s `switch` על `BlockType` — זה switch תקין וקיים-מראש על *סוג הבלוק*, לא על *סוג הבעלים*, ולכן לא סותר את הכלל).
- [x] **Builder של Campaign ממשיך לעבוד ללא Regression** — מאומת חי (Playwright): שלב "בניית דף" על קמפיין אמיתי (`gdolim`) זהה ב-100% למצב הקודם; ובנפרד, עמוד ציבורי חי (קמפיין test עם entity `active`, נמחק בסוף) נטען ללא שגיאות דרך `campaign-preview.component` — אותו קובץ שקיבל את הרחבות הרינדור ל-Partner. ראה "יישום Phase 3" למטה + [PAGE_BUILDER_PHASE3_ACCEPTANCE_TESTS.md](./PAGE_BUILDER_PHASE3_ACCEPTANCE_TESTS.md) לפרטים המלאים.

## יישום Phase 3 (2026-07-29)

**סטטוס:** הושלם ונבדק end-to-end מול DB/שרת/דפדפן אמיתיים.

### תיקון תכנון משמעותי שהתגלה תוך כדי המימוש

ה-ADR הזו שיערה שיידרש "Adapter Pattern" לטעינה/שמירה per-owner-type בתוך `CampaignStudioStateService`. בפועל, קריאה מלאה של הקובץ (1150+ שורות) גילתה ש-`CampaignStudioStateService` **כבר לא תלוי ב-HTTP בכלל** — הוא `BehaviorSubject` טהור עם `patch()`/`sync()`/`loadDraft()`/`reset()`; כל טעינה/שמירה מול השרת מתבצעת תמיד ברמת ה-page component (`campaign-studio-page.component.ts` קורא ל-`campaignApi.getById()` ואז ל-`state.loadDraft()`). המשמעות: לא נדרש שינוי בתוך ה-service כדי לתמוך ב-Partner — רק host page מקביל (`partner-builder-page.component`) שקורא ל-endpoint אחר (`/api/entities/:id/draft` במקום `/api/campaigns/:id`) ומזין את אותו `state.loadDraft()`. זה בדיוק מוכיח את העיקרון המנחה של ה-ADR בצורה חזקה יותר משצפוי: ה-state/Builder/Renderer באמת לא צריכים לדעת כלום על ה-Owner, כי הם כבר לא נגעו בפרטיסטנס מלכתחילה.

### מה נבנה

| קובץ | שינוי |
|---|---|
| `hamonym-app/.../services/owner-registry.ts` | חדש — `SECTION_REGISTRY`, `OWNER_CAPABILITIES`, `OWNER_VALIDATORS` |
| `hamonym-app/.../services/campaign-studio-state.service.ts` | `ownerType?`/`ownerId?` על `CampaignDraft`; 3 `BlockData` חדשים (`Coupons`/`Map`/`OpeningHours`); `createInitialPartnerDraft()` חדש; `defaultBlockData()` מטפל ב-3 הסוגים החדשים |
| `hamonym-app/.../campaign-page-builder-step.component.ts/.html` | `addableBlocks`/`blockGroups`/`nestedBlockGroups` הפכו ל-getters מסוננים לפי Registry; עורך UI לשלושת הבלוקים החדשים |
| `hamonym-app/.../campaign-preview/campaign-preview.component.ts/.html/.css` | רינדור לשלושת הבלוקים החדשים (מפה = Google Maps embed ללא API key) |
| `hamonym-app/.../studio/pages/partner-builder-page/*` (חדש) | host page מינימלי: אותו `<app-campaign-page-builder-step>`/`<app-campaign-preview>`, בלי stepper/topbar/publish |
| `hamonym-app/src/app/core/services/entities.service.ts` | `getDraft()`/`updateDraft()` חדשים |
| `hamonym-app/src/app/app.routes.ts` | route חדש `partners/:id/builder` (guard: `authGuard` בלבד) |
| `hamonym-backend/migrations/034_partner_draft.sql`* | `entities.blocks`/`entities.layout` (JSONB, אותה צורה כמו campaigns) |
| `hamonym-backend/src/modules/entities/entities.service.js/.controller.js/.routes.js` | `getDraft`/`updateDraft` + `GET/PATCH /:id/draft` (`requireEntityOwnership()`) |

*מספור בפועל: `033_partner_draft.sql` (הבא בתור אחרי `032` מ-Phase 2).

### תוצאות בדיקה — Playwright חי מול שרת/DB אמיתיים

**Scenario 1 (Regression):** קמפיין אמיתי `gdolim`, JWT אמיתי + `userRoles_v1`/`currentContext_v1` ב-localStorage (כדי לעבור את `campaignEditorGuard` הקיים) — קבוצות הבלוקים בשלב "בניית דף" (תוכן/פריסה/גיוס/נתונים/קהילה/עיצוב) זהות ב-100% לפני/אחרי, אותם סוגים בדיוק, אותו סדר; קבוצת "עסק" (Partner-only) לא מופיעה כלל (0 matches). אפס שגיאות קונסול.

**Scenario 2 (Partner Builder):** entity שותף חדש עם `entity_roles.role='partner'` — קבוצת "עסק" מופיעה (Coupons/Map/Opening Hours); נוספו Hero, Gallery, Map, Coupons דרך אותו UI, נראו ברינדור החי, ואומתו כשמורים בפועל ב-`entities.blocks` אחרי לחיצה על "שמירה" (`SELECT blocks FROM entities` הראה 4 הרשומות עם הסוגים הנכונים). אפס שגיאות קונסול (מלבד אזהרת Google Sign-In מקומית, לא קשורה לקוד).

`ng build` עבר נקי בכל שלב. כל נתוני ה-test נוקו בסיום.

### מה עדיין לא נבנה (במכוון, מחוץ ל-Phase 3)

- Routing ציבורי (`/campaigns/:slug/partners/:partnerSlug`), ניווט בין שותפים, חיבור "פרטים נוספים"→דף שותף — Phase 4.
- הוספת Owner Type שלישי בפועל (רק אומת ארכיטקטונית, לא הוכח בקוד).
- Publish/Validation אמיתיים ל-Partner (`OWNER_VALIDATORS` נשאר no-op הונסטי — אין ולידציה כזו גם לקמפיין היום).
