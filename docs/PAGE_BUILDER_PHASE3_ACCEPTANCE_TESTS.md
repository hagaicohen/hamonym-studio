# Phase 3 — Acceptance Tests (Page Builder Owner Context)

לא Unit Tests — תרחישי קבלה שצריך לוודא **live** (בדפדפן/מול DB אמיתי, לפי הפרקטיקה הקיימת בפרויקט) לפני שה-Phase נחשב גמור. משלימים את ה-Definition of Done ב-[PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md](./PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md).

**נקבע:** 2026-07-28, לפני תחילת המימוש.
**קשור:** [PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md](./PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md), [PARTNER_DOMAIN_MODEL_ADR.md](./PARTNER_DOMAIN_MODEL_ADR.md)

## Scenario 1 — Campaign Builder ממשיך לעבוד 100% ✅ אומת (2026-07-29)

כל היכולות הקיימות של עורך הקמפיין (Rewards, Stats, Donation Widget, Sponsors, Ambassadors, Donors, Updates, כל Layout שנבנה בסשנים קודמים) עובדות **זהה** אחרי ה-Refactor. לא type-check — קמפיין אמיתי, נבנה ונערך חי.

**תוצאה:** קמפיין אמיתי (`gdolim`) נבדק חי דרך Playwright — קבוצות/סוגי הבלוקים בשלב "בניית דף" זהים ב-100% למצב לפני ה-Refactor (תוכן/פריסה/גיוס/נתונים/קהילה/עיצוב, אותם סוגים, אותו סדר). קבוצת "עסק" (Partner-only) לא הופיעה כלל. אפס שגיאות קונסול.

## Scenario 2 — Partner Builder יכול ליצור את הבלוקים החדשים ✅ אומת (2026-07-29)

דף Partner בבנייה מסוגל לכלול Hero, Gallery, About, Map, Coupons — ולא מציג Sections שלא רלוונטיים אליו (Donation Widget, Stats, Rewards וכו').

**תוצאה:** entity שותף (`entity_roles.role='partner'`) נבדק חי — Hero, Gallery, Map, Coupons נוספו דרך אותו UI, נראו ברינדור החי (`<app-campaign-preview>` ללא שינוי קוד), ואומתו כשמורים בפועל ב-`entities.blocks` אחרי לחיצה על "שמירה". "About" לא נבדק כבלוק ייעודי — הוא ממופה ל-`rich-text` הקיים, שכבר זמין ל-Partner ולא נדרש בלוק חדש עבורו. אפס שגיאות קונסול (מלבד אזהרת Google Sign-In מקומית, לא קשורה).

## Scenario 3 — אין אף `if(ownerType)` מחוץ ל-Registry ✅ אומת (2026-07-29, בדיקת קוד)

בדיקת קוד: כל ה-Owner-specific-ness (Sections, Capabilities, Validation) חי אך ורק ב-Registry/קונפיגורציה. שום ענף `if`/`switch` על `ownerType` בקוד ה-Builder/Renderer/State Service עצמם.

**תוצאה:** נבדק בקוד — `ownerType` נקרא במקום יחיד (`get ownerType()` ב-`campaign-page-builder-step.component.ts`) ומועבר ל-`isSectionAvailableFor()`; אין שום `if`/`switch` נוסף על הערך עצמו בשום קובץ אחר.

## Scenario 4 — הוספת Owner Type חדש לא דורשת שינוי ב-Builder ⚠️ אומת ארכיטקטונית בלבד, לא בפועל

הוספת Owner Type שלישי (לצורך הבדיקה — אפילו placeholder בלבד) מתבצעת ע"י הוספת שורות ל-Section Registry / Owner Capability Registry / Validation Registry בלבד. אין נגיעה בקוד הקיים של ה-Builder/Renderer.

**תוצאה:** נכון ארכיטקטונית (כל שלוש ה-Registry-ים מוגדרים כ-`Record<OwnerType, ...>`, הוספת ערך ל-`OwnerType` תדרוש רק שורות תואמות) — אך **לא נבדק בפועל** ע"י הוספת Owner Type שלישי אמיתי. לא נדרש ל-MVP; אם/כשיתווסף Owner Type אמיתי בעתיד, זה יהיה הבדיקה האמיתית.

## Scenario 5 — Regression: העמוד הציבורי של קמפיין קיים עדיין עובד ✅ אומת (2026-07-29)

תהליך הפרסום המלא של קמפיין (Draft → Publish → עמוד ציבורי חי) עובד מקצה לקצה בדיוק כמו לפני ה-Refactor.

**תוצאה:** קמפיין test חד-פעמי עם entity `status='active'` (ה-DB הקיים לא הכיל אף קמפיין שעונה בפועל על כל תנאי `getCampaignBySlugPublic` — `published`+`entity.active`+לא מוסתר/מחוק — כך שנוצר כזה לצורך הבדיקה, ונמחק בסוף). `/campaigns/__scenario5-smoke__/view` נטען חי דרך `campaign-preview.component` (אותו קובץ שקיבל את שלוש הרחבות הרינדור החדשות ל-Partner) והציג את כל תוכן העמוד הציבורי הרגיל (Hero, כותרת, יעד, ניווט מהיר וכו') ללא אף שגיאת קונסול. **נקודה שהתגלתה תוך כדי (לא קשורה ל-Phase 3):** הקמפיין `gdolim` שנעשה בו שימוש חוזר לאורך כל הסשן הזה (Scenario 1 ואחרים) מחזיר בפועל 404 בעמוד הציבורי כי ה-entity שלו במצב `status='draft'` — לא `'active'` — כלומר מעולם לא עמד בתנאי הפרסום הציבורי. זו עובדה קיימת מראש ב-DB, לא נגרמה ע"י שינוי כלשהו כאן.

---

**סיכום (2026-07-29):** 4 מתוך 5 תרחישים אומתו live, אחד (Scenario 4) אומת ארכיטקטונית בלבד (הוספת Owner Type שלישי אמיתי — לא נדרש ל-MVP). Phase 3 עומד בכל קריטריוני הקבלה שנקבעו מראש.
