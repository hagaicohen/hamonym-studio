# ADR — Generic Page Builder Ownership Model

**Status:** מוצע (Proposed) — תכנון בלבד, טרם מומש בקוד.
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
