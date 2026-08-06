# Decisions — "המונים"

תיעוד קליל של החלטות ארכיטקטורה/מוצר משמעותיות: **מה** הוחלט ו**למה**. לא WHAT נבנה (זה בקוד ובקומיטים) — רק ה-WHY שלא תמיד נשאר גלוי מקריאת הקוד לבד.

---

**2026-07-13**

**Decision:** שכבת ה-Overview נשארת `/dashboard` הקיים — לא נבנה Executive Dashboard חדש.

**Reason:** יש כבר עמוד עם בדיוק המאפיינים המבוקשים (KPI cards, התראות, גרף). הבעיה האמיתית הייתה שהוא מנותק מהדוחות, לא שהוא חסר. ר' [ANALYTICS_VISION.md](./ANALYTICS_VISION.md) §2.1.

---

**2026-07-13**

**Decision:** ה-Advisor מבוסס על `Derived Insights` (תובנות מחושבות דטרמיניסטית) ולא ישירות על `Facts`.

**Reason:** הפרדה בין חישוב לניסוח. חלק מהתובנות ("הקמפיין ירד ב-30%") הן חישוב טהור בלי LLM — ה-LLM נכנס רק לניסוח/תעדוף. משאיר פתח להריץ תובנות מסוימות בלי קריאת LLM בכלל. ר' [ANALYTICS_VISION.md](./ANALYTICS_VISION.md) §4.

---

**2026-07-13**

**Decision:** ה-backend של דוחות/דשבורד מקבל אך ורק `from`/`to` קונקרטיים — לעולם לא preset (`'month'`, `'last_month'` וכו').

**Reason:** לפני ההחלטה כבר היו 3 מוסכמות preset שונות ולא תואמות בקוד (`reports.service.js` עם `date_trunc` מוטבע, `donations.service.js` עם שני enums שונים בשתי פונקציות). preset הוא מושג UI בלבד; ה-frontend מתרגם אותו לתאריכים במקום אחד. ר' [GLOBAL_DATE_RANGE_SPEC.md](./GLOBAL_DATE_RANGE_SPEC.md) §2.3.

---

**2026-07-13**

**Decision:** ב-`campaign-performance` report, `target_amount`/`current_amount`/`pct` נשארים lifetime (לא מסוננים לפי טווח). `raised_in_range`/`donors_in_range` נוספו כשדות משלימים בלבד.

**Reason:** השלמת יעד היא לא מושג תקופתי — קמפיין שמומן לפני שנה עדיין 100% ממומן, לא משנה איזה טווח נבחר. סינון `current_amount` לפי טווח היה משנה את המשמעות של "% מהיעד" בצורה מטעה.

---

**2026-07-13**

**Decision:** מטמון הדשבורד (`dashboard.service.js`) עבר ממפתח `entityId` בלבד למפתח מורכב `entityId_from_to`.

**Reason:** בלי זה, מעבר בין טווחים היה עלול להחזיר בטעות נתונים ממטמון של טווח אחר — התגלה תוך כדי הוספת `from`/`to` לפני שנכתב קוד frontend שהיה חושף את זה בפועל.

---

**2026-07-13**

**Decision:** ב-Dashboard, רק `fundraisingThisMonth`/`donationsThisMonth`/`failedPayments` הפכו לתלויי-טווח. התראות, פעילות אחרונה, גרף 30 הימים, שגרירים מובילים ורשימת הקמפיינים נשארו ללא שינוי.

**Reason:** אלה views של "מצב נוכחי" או "N האחרונים" — לא מטריקות תקופתיות. סינון גרף 30 יום לפי טווח נבחר, למשל, היה יוצר בלבול (מה קורה אם בוחרים "שנה"?).

---

**2026-07-14**

**Decision:** בחירת סוג קמפיין (Campaign Preset) לעולם לא יוצרת Builder נפרד או מנוע נפרד — היא רק טוענת תצורת ברירת מחדל (תוויות, בלוקים מומלצים, CTA, Offering מוכן מראש) לאותו מנוע קמפיינים אחד.

**Reason:** נמנע מ"בוא נבנה Builder מיוחד למירוץ" שחוזר כל פעם שמגיע Use Case חדש. אם החלטה דורשת שינוי ב-Backend — זו כבר לא Preset, זו Offering type חדש. ר' [CAMPAIGN_PRESETS_VISION.md](./CAMPAIGN_PRESETS_VISION.md) §0.

---

**2026-07-14**

**Decision:** Registration הופך את `Offering` הקיים (`type: 'reward'`) לכולל גם `type: 'registration'` — לא נבנית טבלת "Registration Package" נפרדת.

**Reason:** אותה בעיה עסקית (מחיר, מלאי, תיאור, בחירה בעגלה) — פיצול לישות שנייה רק כי המקרה שונה היה יוצר שני מנגנונים מקבילים לתחזק. ר' [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) §1.4.

---

**2026-07-14**

**Decision:** `Registration Order` הוא שכבה שמצורפת ל-`Donation` קיימת (`donation_id`, יחס 1:1) — לא ישות תשלום מקבילה. הכיוון הוא Donation → (אולי) Registration Order, לא ההפך. `Donation` נשארת ה-Source of Truth היחיד של הכסף, ללא שינוי ב-Cardcom/Webhook/סטטוס.

**Reason:** שכפול מנגנון התשלום היה עבודה עצומה ומיותרת. Donation קיימת גם בלי Registration; Registration לעולם לא קיימת בלי Donation. הסטטוס של Participant נגזר מה-Donation, לא מנוהל בנפרד. ר' [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) §1.3.

---

**2026-07-14**

**Decision:** עמוד התורמים (`donors-page`) נשאר מבוסס `donations` בלבד, ללא שינוי. Participant Count (כמה בני אדם נרשמו) הוא KPI נפרד מ-Donation Count (כמה תשלומים) — אסור למזג ביניהם.

**Reason:** הורה שרשם 3 ילדים בתשלום אחד = תורם אחד, 3 משתתפים. אלה שני מספרים לשני דברים שונים. מיזוג ביניהם ייצור דוחות תורמים שגויים. ר' [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) §1.5.

---

**2026-07-15**

**Decision:** `CampaignReward` (frontend interface) הוסב ל-`Offering`, ו-`OfferingType` הערך `'reward'` הוסב ל-`'perk'`. `CampaignDraft.rewards`/`rewardsEnabled` הוסבו ל-`offerings`/`offeringsEnabled`. זו החלטת Domain, לא רק ניקוי קוד — ר' Domain Model ב-[HAMONYM_ARCHITECTURE.md](./HAMONYM_ARCHITECTURE.md) §8.

**Reason:** `reward` הניח שקיים סוג Offering יחיד; ברגע שנוסף `registration` השם כבר לא מייצג את הקטגוריה הכללית. `perk` נבחר על פני `donation`/`support` כדי לא להתנגש עם הישות `Donation` הקיימת בדומיין (כל Offering הוא בסופו של דבר חלק מ-Donation אחת — קריאה ל-type בשם `donation` הייתה יוצרת בלבול. ר' [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) §1.3). מעכשיו `Offering.type` הוא הערכים היחידים המותרים: `perk` | `registration`, וערך חדש (raffle/ticket/וכו') דורש עדכון גם כאן וגם ב-Domain Model — לא רק במקום שהוא נוסף בו.

---

**2026-07-15**

**Decision:** ה-rename ל-`Offering` **לא** כלל את `BlockType` הערך `'rewards'` (בלוק בונה-הדפים שמרנדר את סקשן ה-Offerings), ולא את `CampaignTheme.rewardsBg`/`rewardCardBorder`/`rewardCardBorderActive`/`CampaignLayout.rewardsLayout`. אלה נשארים מילולית `rewards*` בקוד.

**Reason:** בניגוד ל-`CampaignDraft.offerings` (שעובר מיפוי מפורש ל-snake_case קבוע ב-`campaign-api.service.ts`), הערכים האלה חיים בתוך ה-blobs `blocks`/`layout` שנשלחים ונקראים מה-DB כמו שהם (`JSON.stringify` גולמי, בלי מיפוי per-key). כל קמפיין קיים כבר שמור עם `block.type: 'rewards'` ועם `layout.theme.rewardsBg` בפועל — שינוי השם בקוד היה שובר בשקט (בלי שגיאת קומפילציה) את סקשן התשורות ואת הצבעים המותאמים אישית בכל קמפיין שכבר פורסם. שינוי כאן דורש migration script ל-DB, לא רק rename בקוד — ר' ההערות ב-`BlockType`/`CampaignTheme` ב-`campaign-studio-state.service.ts`.

---

**2026-07-15**

**Decision:** `Offering.minimumAmount` נשאר בשם הזה בקוד, גם כש-`type === 'registration'` (שם מוצג/Domain: "מחיר למשתתף"). לא נוסף שדה `price` נפרד.

**Reason:** אותה סיבה בדיוק כמו ה-`BlockType`/theme keys למעלה — `minimumAmount` הוא persisted field מהפיצ'ר הישן (rewards), חי בתוך אותו JSON blob בלי מיפוי per-key. פשרה מכוונת: **Domain** = "Registration price" (כך מנוסח ב-UI דרך `OFFERING_COPY.priceLabel`, ר' `campaign-offerings-step.component.ts`), **Persistence** = `minimumAmount` (ללא שינוי). rename אמיתי דורש migration ל-DB, לא רק ב-frontend.

---

**2026-07-15**

**Decision:** `Offering.key` הוא Identifier, לא "קוד" חופשי. ברגע שיש ל-Registration Offering הרשמות בפועל (`registration_participants` עם `offering_key` תואם), ה-`key` שלו הופך ל-**read-only** — לא לאפשר עריכה שלו מה-Builder.

**Reason:** דוחות/ייצוא/BI/אינטגרציות עתידיות (ר' `HAMONYM_ARCHITECTURE.md` §8, Offering) ישתמשו ב-`key` כמזהה יציב למסלול (למשל `RUN_10`). אם מנהל העמותה יוכל לשנות `key` אחרי שכבר יש נרשמים תחתיו, הדוחות ההיסטוריים "יתבלבלו" בשקט — אין שגיאה, רק נתונים לא עקביים. **לא מיושם עדיין** (ה-Builder עדיין מאפשר עריכת `key` תמיד — ר' `campaign-offerings-step.component.ts`); התיעוד כאן הוא כדי שהנעילה תיושם *לפני* שמישהו יתקל בבעיה, לא אחרי. ר' [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) §1.4 (מה שבמפורש לא בסקופ).

---

**2026-07-15**

**Decision:** `processRegistrationDonation` (backend, `donations.service.js`) הוא שם קבוע ל-business-flow step, לא utility זמני — נבחר במקום `createRegistrationIfNeeded` כי הפונקציה צפויה לגדול (Participants מרובים, חולצות, קופונים, QR, מייל אישור) ולא תישאר "יצירה פשוטה אם צריך".

**Reason:** שם כמו `...IfNeeded` מזמין להתייחס לפונקציה כ-helper שולי; בפועל זו נקודת הכניסה היחידה לכל מה שקורה בצד ה-Registration כשתרומה כוללת Offering מסוג `registration`. שם נכון מהתחלה חוסך rename נוסף כשהיא תגדל.

---

**2026-07-15**

**Decision:** migration 024 (`registration_orders`/`registration_participants`) הורצה בפועל על ה-DB (Supabase, סביבת הפיתוח היחידה הקיימת בפרויקט כרגע — אין הפרדה dev/prod נפרדת). בוצע E2E מלא (donation → registration_order → participant → mock-complete → status='paid') ישירות מול ה-API האמיתי, ואז נוקו כל השורות שנוצרו (כולל `email_logs` שהתגלה כ-FK נוסף לא מתועד קודם) + הוחזרו `campaigns.current_amount`/`supporters_count` ל-0 (חיסור מדויק, לא איפוס).

**Reason:** לא היה ניתן לאמת את שרשרת ה-Registration המלאה (כולל כתיבה אמיתית ל-DB) בלי הטבלאות. ההרצה אושרה במפורש רק אחרי בירור שזו אכן סביבת הפיתוח היחידה ולא סביבה חולקת עם לקוחות מבלי ידיעה. ר' §5 ב-`HAMONYM_ARCHITECTURE.md` — Evolution Rules — לגבי זהירות בפעולות בלתי-הפיכות על נתונים משותפים.

---

**2026-07-15**

**Decision:** Campaign Preset (`CampaignDraft.layout.preset: 'general' | 'donation' | 'race'`) נבנה כ-lookup table בלבד (`builder/presets/campaign-presets.ts`) שמשפיע על: (1) ברירת המחדל של `Offering.type` בטופס ה-Offerings (`registration` ל-race, `perk` אחרת), (2) תווית שלב 4 ב-Stepper ("מסלולי הרשמה" ל-race), (3) כותרת/תת-כותרת/טקסטים בשלב ה-Offerings עצמו. הוא **לא** יוצר מודל/Builder/route נפרד — אותו `/campaigns/create`, אותו `CampaignEditorComponent`, רק ברירות מחדל שונות. "קמפיין כללי" = ההתנהגות המקורית, ללא שינוי כלל (רשת ביטחון לפי `CAMPAIGN_PRESETS_VISION.md` §3). השדה חי בתוך `layout` (לא ישירות על `CampaignDraft`) מאותה סיבה בדיוק כמו `templateId` — עובר כ-blob שלם ל-backend, לא דורש עמודה/migration חדשה.

---

**2026-07-15**

**Decision:** 2.4 — Multi-Participant Registration. `registration_orders` נשאר 1:1 עם `donation` (ללא שינוי), אבל `registration_participants` (שכבר היה מוגדר 1:N ב-migration 024) עכשיו מאוכלס בפועל בכמה שורות — משפחה/קבוצה יכולה להירשם בתשלום אחד, וכל משתתף בוחר **בעצמו** Offering מסוג `registration` (מסלול/מחיר) + `shirt_size` חדש (עמודה, migration 025). ה-UI ב-Checkout הוא Participant repeater ("משתתף 1 / שם / מסלול / חולצה / + הוסף משתתף"), לא "עגלה" — Registration Offerings עברו לעקוף לגמרי את מנגנון ה-cart הכללי (`campaign-preview.component.ts`) וקופצות ישר ל-Checkout.

**Reason:** התייעצות עם איש שטח (חבר שעובד עם "המונים" בפועל) חשפה שהמודל "משתתף בוחר Offering יחיד" לא מספיק — הרשמה אמיתית היא לרוב עבור קבוצה, וכל בן-אדם בקבוצה יכול לבחור מסלול/מחיר שונה. עלה גם רעיון (מ-AI חיצוני) לבנות "Registration Schema" גנרי עם Rules Engine לתמחור מותנה (לדוגמה "אם מקצה=10K אז מחיר=180"). **נדחה** — כי כל תרחיש שהוצג (מקצים/כרטיסים/מחירים שונים) כבר נפתר לגמרי ע"י פשוט יצירת כמה Offerings נפרדים (למשל `RUN10_REG`/`RUN10_VIP`/`RUN5_REG`), בלי מנגנון תמחור מותנה חדש. נוסף רק `shirt_size` — לא `birth_year`/`gender` שהיו ב-Spec המקורי, כי אף אחד לא ביקש אותם עדיין (§4 Evolution Rules: לא בונים "כי אולי"). ר' [REGISTRATION_OFFERING_SPEC.md](./REGISTRATION_OFFERING_SPEC.md) §2.

---

**2026-07-15**

**Decision:** Registration משתמש ב-flow ייעודי משלו ולא משתתף ב-cart הכללי של תרומות. זו החלטת מוצר מכוונת, לא פשרת ביניים זמנית: תרומה = "בחר סכום → אולי תשורה → שלם"; מירוץ = "הוסף משתתף → בחר מסלול → חולצה → הוסף עוד → שלם" — שני flows עסקיים שונים לגמרי, ואין סיבה לכפות עליהם מנגנון עגלה משותף.

**Reason:** לכפות שני flows שונים מהותית על אותו Cart היה מייצר קוד מותנה (if/else על type בכל מקום שהעגלה נוגעת בו) בלי תועלת אמיתית — Registration ממילא לא "מצטרפת" לתרומות אחרות (החלטה קודמת: "אין תרומה נוספת"), אז אין שום מקרה שבו המנגנון המשותף באמת נחוץ. ר' 2.4 למעלה.

**Reason:** זו הייתה מוגדרת ב-`REGISTRATION_OFFERING_SPEC.md` §3 כשלב האחרון, תלוי ב-Registration — שהושלם. המשתמש ציין שהעבודה עד כה (Backend/Registration Flow) "מתחת למים": מנהל עמותה לא רואה שום סימן שהמערכת "מבינה מירוצים" עד שהוא בוחר Preset ורואה תוויות שמתאימות. זהו החלק הראשון של "Race Builder UX" (השלב הבא, לא מומש עדיין: hero copy, CTA, בלוקים מומלצים, שדות ייעודיים כמו תאריך/מיקום מירוץ).

---

**2026-07-15**

**Decision:** נבנה middleware משותף (`entity-permission.middleware.js` — קובץ placeholder ריק שכבר היה קיים בקוד, מעולם לא מולא) שממרכז את הבדיקה "האם המשתמש המחובר באמת שייך ל-entity הזה" (`SELECT 1 FROM user_entities WHERE user_id=$1 AND entity_id=$2`). הוחל על `donations`, `dashboard`, `reports`, `registrations` (שבהם לא הייתה שום בדיקת בעלות — רק JWT תקין), ועל 3 ראוטים ב-`entities` שאפילו `requireAuth` לא היה להם (הורדת/מחיקת מסמכי עמותה ללא אימות בכלל). שלוש מימושים כפולים קיימים (`entities.service.js#checkOwnership`, `campaigns.service.js#validateOwnership`, `ambassadors.service.js#verifyEntityOwnership`, וגם עותק רביעי לא-ידוע קודם בתוך `updateEntity` עצמו) אוחדו לקרוא לפונקציה המשותפת (`isEntityMember`) במקום לשכפל את השאילתה.

**Reason:** אודיט (ביוזמת המשתמש, אחרי שמסך ה-Registration Management חשף שהתבנית "requireAuth בלבד" חוזרת על עצמה) גילה שזו בעיה רוחבית אמיתית: כל משתמש מחובר (כולל תורם/שגריר) יכול היה למשוך תרומות, דוחות, ודשבורד של **כל entity אחר** רק אם ידע/ניחש את ה-UUID שלו — ו-`billing`'s `GET /entity/:entityId` לא היה מאומת בכלל (גם לא JWT). `entities`/`campaigns`/`ambassadors` כן היו מוגנים כבר בחלקם — האודיט מצא את התבנית הנכונה הקיימת (3+1 מימושים זהים) והשתמש בה כבסיס למקום אחד, במקום להמציא דפוס חדש. אומת בפועל מול שרת אמיתי: משתמש-חבר מקבל 200, משתמש-לא-חבר מקבל 403, בלי טוקן מקבל 401 — על כל 6 הראוטים שתוקנו, כולל ה-4 שכבר היו מוגנים (וידוא שהריפקטור לא שינה התנהגות). לא טופלו (דורשים יותר מחשבה): `billing`'s `POST`/`DELETE` (entityId ב-body, לא ב-params — נוסף רק `requireAuth`).

---

**2026-07-15**

**Decision:** נוספה בחירת פלטת צבע (6-8 עיגולי צבע: סגול/כחול/ירוק/טורקיז/כתום/אדום/ורוד/אפור כהה) ישירות במסך בחירת העיצוב (`template-picker.component`), לפני שהמשתמש נכנס ל-Builder. הבחירה גלובלית לכל הכרטיסים (לא per-card) — משנה live את כל תשעת ה-mockups בתצוגה המקדימה, ונשלחת יחד עם התבנית הנבחרת ל-`applyTemplate`. זו **לא** פונקציית color-picker מלאה (9 שדות) — עדיין ניתן לערוך את כל הצבעים בנפרד בשלב "בניית דף" המתקדם יותר.

מבחינה טכנית: `CampaignTemplate` ב-`campaign-templates.ts` עבר משדות סטטיים (`accent`/`preview`/`themeOverride`) לפונקציות שמקבלות `TemplatePalette` (`buildPreview`/`createBlocks`/`buildTheme`), עם `shadesOf(base)` — פונקציה אחת שגוזרת את כל הגוונים הנגזרים (accent/light/pale/paleBg/dark) ממחרוזת hex בודדת. כל תשעת ה-templates (וגם ה-mockup הצבעוני שלהם) עברו להשתמש בגוונים הנגזרים האלה במקום hex מקודד-קשיח, כך שכל שילוב template×palette עובד בלי טבלת צבעים נפרדת לכל שילוב.

**Reason:** המשתמש שאל אם לא כדאי לאפשר בחירת צבע כבר במסך בחירת העיצוב, ולא רק 7 שלבים אחר-כך ב-Page Builder המתקדם. הוצע ואושר איזון: לא color-picker מלא (מסוכן — 9 שדות לא-מתואמים בלי לראות את כל העמוד), אלא 6-8 פלטות מוכנות שמשאירות תחושת "זה שלי" מההתחלה. זה בא ישירות אחרי הנחייה מפורשת מהמשתמש לעצור פיתוח ולעבור לבדיקת UX — אבל המשתמש הבהיר במפורש (אחרי הבהרה הדדית) שזו לא חריגה נקודתית: "אין חריגה. אנחנו נמשיך לפתח... ממשיכים לפתח כרגיל" — כלומר ה-UX Sprint לא מבטל פיתוח שוטף, רק דוחה תכונות race-ספציפיות חדשות.

---

**2026-07-16**

**Decision:** Registration Options — הופרדו לגמרי מ-`Offering`/`campaigns.rewards`. `Offering` חוזר להיות מושג "תשורה" טהור (`id, title, description, minimumAmount, stock, imageUrl, featured` — בלי `type`/`key`). קטגוריית/מסלול הרשמה הפכה למודל עצמאי — `RegistrationOption` (`id, key, title, description, price`) — עם טבלה אמיתית משלו בבקאנד (`registration_options`, migration 026), לא JSONB אטום. `registration_participants` עודכן: `offering_key`/`offering_title` שונו ל-`option_key`/`option_title` (עדיין snapshot, לא FK חי), ונוסף `registration_option_id` (FK אמיתי, `ON DELETE SET NULL`). נוסף שלב Builder נפרד ("הרשמה", שלב 5, אחרי תשורות) — `campaign-registration-step` — עם UI נפרד לגמרי מה-Offerings step: אין type toggle, אין enable-toggle (המצב "יש הרשמה" נגזר מ-`registrationOptions.length > 0`, לא Boolean נפרד), ויש שדה `registrationFieldLabel`/`registrationFieldIcon` שהמנהל בעצמו קובע (עם הצעות לדוגמה מה-Preset: מסלול/כרטיס/סוג משתתף/סוג תורם) — כך שהמושג נשאר גנרי ולא נעול ל"מסלול מירוץ" בלבד. בעמוד הציבורי: **אין Block חדש** — Registration היא Action (כמו Donate), לא Content — ה-`donation-widget` הקיים (שכבר קיים בכל תבנית) הופך להצגת "הרשמה" במקום "תרומה" כש-`registrationOptions.length > 0`, ולא פותר Card-grid חדש. בבקאנד: `processRegistrationDonation` עכשיו מוודא מול ה-DB (לא סומך על הלקוח) שכל `registrationOptionId` שנשלח קיים, שייך לקמפיין, ופעיל — ומשתמש בכותרת מה-DB (לא ממחרוזת שנשלחה מהלקוח) ל-snapshot.

**Reason:** המשתמש שיתף צילומי מסך ממימוש קודם בוורדפרס שחשף שהמימוש הנוכחי "מדליף" שפת תשורות לתוך זרימת ההרשמה (placeholder בתצוגה המקדימה אמר "כותרת התשורה", alt-text אמר "תמונת תשורה") — ומבחינה עסקית, קטגוריית משתתף במירוץ היא לא "מתנה לתורם", היא מי-משתתף ובכמה. זה מבטל את ההחלטה הקודמת (2026-07-15, "Offering already had everything needed") — נשאלה שאלה מפורשת עד כמה עמוק להפריד (UI בלבד מול מודל-נתונים אמיתי), והמשתמש בחר "הפרדה אמיתית במודל נתונים" באופן מפורש. תהליך העיצוב עבר כמה סבבי חידוד מפורשים מהמשתמש: (1) שם המושג הוא "Registration Option" ולא "Category" כי "קטגוריה" לא תמיד מתאר נכון את מה שהיוזר רואה (מסלול/סוג תורם/כרטיס — לכן `registrationFieldLabel` ניתן להגדרה), (2) **הערה קריטית**: אסור להוסיף Block חדש — Registration הוא Action כמו Donate, לא Content כמו Story/Gallery/FAQ, והוספת Block חדש הייתה פותחת דלת ל-"Petitions Block / Events Block / Membership Block" — בדיוק הסחף שהארכיטקטורה הזו נמנעת ממנו, (3) לוותר על `registrationEnabled` בתור Boolean נפרד — `registrationOptions.length > 0` מספיק, פחות State לתחזק, (4) הצעות ה-`registrationFieldLabel` כוללות אייקון (🏃/🎫/👤) לא רק טקסט, כדי שהמנהל יזהה מהר יותר מה הוא בונה. הופעלה טבלה אמיתית (לא JSONB) גם כי זה סוגר פער אמיתי שהאודיט הקודם (entity-ownership) לא כיסה: לפני זה, שום קוד בבקאנד לא בדק שה-`offering_key`/`offering_title` שנשלחו מהלקוח אכן תואמים Offering אמיתי בקמפיין — עכשיו, עם טבלה אמיתית, יש ולידציה אמיתית. ר' `docs/REGISTRATION_CONTEXT.md` המעודכן למודל החדש.

---

**2026-07-16**

**Decision:** שלב Publish מייצר כותרת/תיאור קצר מוצעים (AI) כשהשדות הייעודיים ריקים, במקום לנחש אותם מתוך טקסט חופשי בעזרת Regex/היוריסטיקה. שינוי `hasTitle`/`hasShortDescription` ב-`campaign-advisor.analysis.js` **לא** התבצע — הם ממשיכים לבדוק רק את השדה הייעודי (בכוונה — זו לא בעיה שצריך "לתקן" בזיהוי, אלא הבדלה מכוונת בין Metadata למשפט Content). נוספה יכולת חדשה, נפרדת לגמרי מ-`/advise` הקיים: `POST /api/campaigns/:id/generate-metadata` (`campaign-advisor.agent.js#generateMetadata`) — קורא ל-LLM (לא Regex) עם התוכן החופשי בפועל (`extractStoryText`, סורק בלוקי rich-text בדיוק כמו `hasStoryContent`), ומחזיר `{ suggestedTitle, suggestedShortDescription }` (כל שדה `null` אם לא צריך אותו, או אם אין מספיק תוכן אמיתי כדי לייצר בביטחון — לא ניחוש/מילוי גנרי). בשלב Publish: אם השדה ריק, מוצגת אוטומטית כרטיסיית הצעה עם "✨ אמץ את ההצעה" / "✕ לא תודה" — לא חוסם פרסום (זה כבר לא היה חסום קודם), ולא נכשל בצורה גלויה למשתמש אם ה-LLM נכשל.

**Reason:** המשתמש שאל איך המערכת יודעת אם יש כותרת, בהינתן שהיא לא חייבת להיות בשדה הייעודי — יכולה להיות חלק מטקסט חופשי. ההצעה הראשונית שלי הייתה היוריסטיקה ("הפסקה הראשונה הקצרה"), והמשתמש דחה אותה במפורש: זו "הנחה שלא כדאי להניח" — היוריסטיקת מיקום על טקסט חופשי היא שברירית ולא ניתנת להצדקה סמנטית. הפתרון שהוא הציע: להפריד בין **Metadata** (כותרת/תיאור קצר/SEO — שדות מערכת) לבין **Content** (התוכן החופשי שהמשתמש בונה) — ה-Builder נשאר "טיפש" ולא מנסה לפרש טקסט חופשי; ורק בשלב הפרסום, אם Metadata חסר, ל-AI (לא לקוד) יש תפקיד ברור: לנסח כותרת/תיאור מהתוכן שכבר נכתב, עם אפשרות לאמץ/להתעלם. זה מוטמע בתוך Campaign Advisor הקיים (משתמש ב-`llmService.complete` המשותף, לא בונה client חדש) אבל כ-endpoint נפרד מ-`/advise` — מטרות שונות (ייעוץ איכותני מול טקסט קונקרטי לאימוץ), לא כדאי לערבב בין שתי צורות Response. במפורש **לא** נבנה: ציון "Confidence %" (דיוק מזויף — LLM לא יכול להעריך הסתברות באמת), וכפתור שלישי "ערוך בעצמי" (כבר קיים באופן טבעי — ניווט חופשי בין שלבים + פרסום לא חסום ממילא). שם ה-endpoint שונה מ-`suggest-metadata` ל-`generate-metadata` לפי בקשת המשתמש — "הוא לא 'מוצא' Metadata, הוא מייצר אותה מתוך הסיפור." אומת מול שרת אמיתי עם קריאת LLM אמיתית: קמפיין עם תוכן אמיתי (סיפור על עמותת ילדים חולי סרטן) הפיק תיאור קצר רלוונטי בפועל (72 תווים, בתוך המגבלה); קמפיין ריק החזיר `null` בלי לנחש.

---

**2026-07-16**

**Decision:** **תוקנה** ההחלטה הקודמת מאותו יום ("Registration is an Action, not a Block — ה-donation-widget הופך מ'תרומה' ל'הרשמה'"). זו הייתה טעות אמיתית: כש-`registrationOptions.length > 0`, ה-widget היה **מחליף** לגמרי את ה-UI של תרומה חופשית ב-UI של הרשמה בלבד — כלומר במירוץ לא הייתה שום דרך לתרום כסף בלי להירשם. עכשיו שני ה-Actions **מתקיימים יחד**: אם יש Registration Options, מוצג אזור "🏃 הרשמה" (הכפתור הקיים, ללא שינוי) ומתחתיו, אחרי מפריד "או", אזור תרומה חופשית רגיל (בורר סכומים + סכום חופשי + כפתור "לתמיכה מאובטחת" נפרד, פותח checkout במצב 'donation' בדיוק כמו קודם) — שני כפתורים נפרדים, שני מצבי checkout נפרדים, בלי לערבב אותם לתשלום אחד. בקמפיין תרומות רגיל (ללא Registration Options) שום דבר לא השתנה.

**Reason:** המשתמש בדק את הזרימה בפועל (יצר 2 סוגי משתתפים בקמפיין מירוץ) ודיווח על שני דברים: (1) "אין תמיכה" להזנת כמה משתתפים עם סוג נבחר לכל אחד — בדיקת קוד הראתה שה-repeater ב-`checkout-modal` (`addParticipant`/`optionFor`/select per-participant) כן קיים ותקין; הבעיה האמיתית שעליה דיווח היא #2: (2) "יש הרשמה למירוץ, אבל עדיין יוזר גם צריך להיות מסוגל לתרום לקמפיין כספים בלי קשר למירוץ, סכום חופשי או לבחור סכום" — זו בדיוק ההתנהגות שנעלמה כשה-widget "הוחלף" במקום "הורחב". התיקון משחזר את מסלול התרומה החופשית כברירת מחדל תמיד קיימת, ומוסיף עליו (לא במקומו) את מסלול ההרשמה כשרלוונטי.

---

**2026-07-16**

**Decision:** `createCampaign` כבר לא חוסם יצירת קמפיין על העדר כותרת. `title` ריק מקבל ברירת מחדל אוטומטית ("קמפיין ללא כותרת"), **בדיוק** באותה צורה ש-`slug` ריק כבר קיבל ברירת מחדל אוטומטית (`draft-{timestamp}-...`) — אותו דפוס קיים, לא דפוס חדש. הזרימה בפרונט (`campaign-editor.component.ts#navigateToStep`) עודכנה כך שבשמירה הראשונה (`!draft.id`) היא מסנכרנת בחזרה את **כל** תשובת השרת (`this.state.patch(res)`, לא רק `id`) — כדי שברירות המחדל של השרת (כותרת/slug) לא יימחקו בטעות בשמירה הבאה, שהייתה שולחת שוב את הערך הריק מהלקוח.

**Reason:** התיקון הקודם מאותו יום (באנר שגיאה כשהשמירה נכשלת) היה נכון כשלב ביניים אבל לא פתר את הבעיה האמיתית — הוא רק **הציג** את הכישלון בצורה יפה יותר, בעוד המשתמש עדיין נתקע: "הוא מנסה לבדוק עם הקמפיין טוב וזה בכלל לא השלב הנכון. אני עדיין בבניה שלו." המשתמש עדיין ב"בנייה" של הקמפיין ולא אמור להיחסם מלשמור **שום** שלב (כולל סוגי משתתפים בהרשמה) רק כי עוד לא הגיע לשלב שבו הוא ממלא כותרת — זה בדיוק הניגוד לניווט חופשי בין שלבים שכבר סוכם (ר' למעלה, 2026-07-16, "לשפר את חוויית המעבר בין שלבים"). מציאת דפוס ה-slug הקיים ממש ליד קוד ה-throw (Evolution Rules §1 — קודם מחפשים דפוס קיים) חשפה שהפתרון הנכון כבר קיים בקוד בשביל שדה אחר; רק היה צריך להחיל אותו גם על title. אומת מול שרת אמיתי: יצירת קמפיין בלי כותרת → 200 עם כותרת ברירת מחדל; שמירת סוג משתתף (Registration Option) מיד אחר כך → מצליחה.

---

**2026-07-16**

**Decision:** נוספו שתי תבניות עיצוב חדשות ב-Template Picker: "סיידבר ימין/שמאל (לאורך כל העמוד)" — בהן הסיידבר (נתונים+תרומה) רץ לאורך כל גובה העמוד, כולל לצד ה-Hero, ולכן ה-Hero לא תופס את כל רוחב השורה (מוצג בעמודת התוכן הראשית בלבד). המימוש: שדה חדש ועצמאי על `CampaignLayout` — `heroPlacement?: 'full-width' | 'main-column'` — **נפרד** מ-`layoutMode` בכוונה (layoutMode אומר איפה הסיידבר, heroPlacement אומר איפה ה-Hero — שני צירים, לא Enum משולב אחד). ה-Hero הפך ל-`<ng-template>` אחד שמוצג בשני מקומות אפשריים ב-`campaign-preview.component.html`: למעלה בעמוד (כברירת מחדל, ותמיד במובייל) או כילד ראשון בעמודה הראשית של הסיידבר (דסקטופ בלבד, כש-`heroPlacement==='main-column'`) — אין שכפול קוד, אין CSS חדש (ה-sticky rail הקיים כבר "רץ" לאורך כל השורה מרגע שה-Hero נכנס לאותה שורת flex). שתי התבניות החדשות משתמשות ב-layoutMode **הייעודי הקיים** `'sidebar-right'`/`'sidebar-left'` (לא ב-`'standard'` + container blocks, כמו שתי תבניות הסיידבר המקוריות) עם בלוקים שטוחים — ולכן `migrateSidebarToContainers()` (שרץ אוטומטית ב-`ngOnInit` של שלב "בניית דף") קיבל תנאי חדש: לדלג על המרה כש-`heroPlacement==='main-column'`, אחרת הוא היה הופך את המבנה השטוח למבנה container אוטומטית ומוחק את האפקט.

**Reason:** הצעה ראשונה שלי הייתה 4 ערכי `layoutMode` חדשים (`sidebar-right-full` וכו') — נדחתה במפורש: "תגיע ל-20 Layout Modes" ברגע שתתווסף עוד וריאציית Hero (Hero קטן/בלי תמונה/עם וידאו). המודל הנכון: heroPlacement כתכונה עצמאית מ-layoutMode. תוך כדי מימוש התגלה משהו קריטי יותר: שתי תבניות הסיידבר ה**קיימות** כבר לא באמת משתמשות ב-`layoutMode:'sidebar-right/left'` — הן `layoutMode:'standard'` עם container blocks מקוננים (המנגנון האמיתי היום), ו-`sidebar-right/left` הוא ערוץ **legacy בלבד**, שרץ אוטומטית דרך `migrateSidebarToContainers()` בכל פעם שנכנסים לשלב "בניית דף". זה יצר התלבטות אמיתית: להפוך את Hero לבלוק חדש בתוך מערכת ה-container (כדי לעבוד עם המנגנון החדש), או להשאיר את Hero מחוץ ל-Page Builder ולהשתמש מחדש בערוץ ה-legacy בכוונה. המשתמש בחר מפורשות באפשרות השנייה, מאותה סיבה בדיוק שהנחתה את כל הפרויקט: "אל תבנו מנוע כללי כשיש צורך אחד קונקרטי" — הפיכת Hero לבלוק הייתה פותחת מיד שאלות (מחיקה? שכפול? שני Hero? גרירה?) שאין צורך אמיתי לפתור עכשיו. הפתרון הסופי: לגיטימציה מחדש לערוץ ה-legacy כמנגנון **מכוון**, לא רק היסטורי, עבור הצורך הקונקרטי הזה — עם שער אחד ב-`migrateSidebarToContainers` שמזהה את הכוונה (`heroPlacement`) ולא הופך אותה ל-container.

---

**2026-07-26**

**Decision:** Fixed: תצוגת הקמפיין הציבורית (`campaign-preview.component.html`, בלוק `stats`) מכבדת עכשיו את `visible`/`order` השמורים ב-`StatsBlockData.items` עבור חמשת ה-KPI האמיתיים (`supporters`, `ambassadors`, `days_remaining`, `start_date`, `end_date`) — במקום 4 קופסאות מקודדות קשיח שהתעלמו לגמרי מהקונפיגורציה שכבר קיימת ב-Builder ("סדר וחשיפה"). `target`/`raised`/`percent` נשארים קבועים באזור ה-Progress (טבעת + "גויס עד כה"/"מתוך"), ו-"נותר ליעד" נשאר קבוע וגם הוא — שניהם **לא** StatKey-ים בני-הגדרה ולא חלק מהלולאה. מומש כ-method חדש יחיד, `visibleGridStats()`, שמסנן את `visibleStats()` הקיים לחמשת המפתחות האלה; ה-HTML הפך מ-4 `div`-ים קבועים ל-`*ngFor` + `[ngSwitch]` על האייקון בלבד (אותם SVG בדיוק לכל מפתח, בלי CSS/Layout חדש).

**Reason:** התגלה תוך כדי שיחת מוצר על "האם צריך להציע ליוזר קולקציה של Layouts שונים לתצוגת נתונים+תרומה" — לפני שבונים Layouts חדשים בדקנו את מצב הקוד הקיים, וגילינו ש-`StatsBlockData.items` (עם `visible`/`order` לכל KPI) וה-Builder editor שעורך אותו כבר קיימים במלואם, אבל התצוגה החיה לא קוראת מהם בכלל — פער בין מודל לתצוגה, לא feature חסר. המשתמש אישר מפורשות להתחיל בתיקון הזה בלבד (Scope: לחבר, לא לשנות UI/CSS/Layout/Refactor) לפי הכלל שכבר נקבע בפרויקט: "כל Refactor חייב לפתוח Feature קונקרטי; כל Feature חייב לפתור בעיה אמיתית של משתמש" — וכאן אין הצדקה עדיין ל-Conversion Widget/Layouts נוספים בלי נתוני שימוש אמיתיים. נקודת החיכוך היחידה: "נותר ליעד" (הפרש יעד-גויס) מוצג היום אך **אינו** StatKey קיים בכלל במודל — הוחלט (מפורשות ע"י המשתמש) שהוא שייך סמנטית לאזור ה-Progress (Ring/Percentage/Raised/Remaining), לא לרשימת ה-KPI האמיתיים (Donors/Ambassadors/Days/Start/End), ולכן נשאר קבוע ומחוץ למערכת ה-`visible`/`order` לגמרי — לא נוסף StatKey חדש כדי "לסגור" אותו, כדי לא ליצור מורכבות מיותרת סביב מקרה יחיד בלי צורך מוכח. אומת מול שרת אמיתי ו-DB אמיתי (Supabase dev): נוצר קמפיין test זמני (slug ייחודי) עם קונפיגורציית KPI אמיתית, נצפה ב-Playwright headless מול `/campaigns/:slug/view` — הגריד הציג בדיוק את חמשת ה-KPI הגלויים בסדר הנכון (כולל `start_date`/`end_date`, שמעולם לא היה להם HTML קודם לכן), ולא הציג `ambassadors` המוסתר; קונפיגורציה שנייה מעורבבת (סדר שונה, `ambassadors` גלוי) הניבה גריד שונה בהתאם — מוכיח data-driven אמיתי, לא צירוף מקרים. קמפיין ה-test נמחק מיד אחרי, לפי דפוס הניקוי הקיים (ר' E2E test cleanup). **תופעת לוואי צפויה ומכוונת:** קמפיינים קיימים שלא שונו ב-Builder יראו שינוי ויזואלי (למשל היעלמות קופסת "שגרירים" שהייתה מוצגת עם ערך קבוע `0`, והחלפת סדר `תומכים`/`ימים נותרו`) — זו לא רגרסיה אלא התאמת המימוש למודל שהיה קיים כל הזמן וההתעלמות ממנו הייתה הבאג.

---

**2026-07-26**

**Decision:** נוסף שדה חדש ל-`CampaignLayout` — `conversionWidgetLayout?: 'classic' | 'unified' | 'compact'` — שקובע איך בלוקי `stats` ו-`donation-widget` (שביחד מכונים "Conversion Widget") מוצגים זה לצד זה. **Classic** (ברירת מחדל/`undefined`, כמו כל קמפיין קיים) הוא בדיוק המראה של היום — שני כרטיסים נפרדים. **Unified** ממזג ויזואלית את שני הכרטיסים לכרטיס רציף אחד (ללא רפקטור/שינוי DOM structure): קלאסים `conv-unified`/`conv-compact` נוספו ישירות על `.hm-stats`/`.hm-donate` הקיימים ב-`campaign-preview.component.html`, וכל הלוגיקה — merge של הגבול/עיגול הפינות בין שני ה-`div`-ים העצמאיים לגמרי, כולל ביטול ה-`gap:16px` של `.sidebar-rail-inner` באמצעות `margin-bottom: -16px` על הכרטיס העליון (ולא נגיעה ב-`gap` עצמו, שמשותף לכל הבלוקים ברייל). **Compact** מקטין ריפוד/גדלים (טבעת, אייקונים, כפתורי סכום, כפתור CTA) לצפיפות גבוהה יותר. אין קומפוננטות Angular חדשות, אין שינוי בפונקציות/אירועים/state — רק `[class.conv-unified]`/`[class.conv-compact]` מותנים ו-CSS. בקרה ל-Builder נוספה ב-`campaign-page-builder-step` בתוך ה-stats-editor הקיים (לא שלב/קומפוננטה נפרדת) — שורת `direction-toggle` (Classic/Unified/Compact, מדגם CSS קיים בדיוק כמו size sm/md/lg), עם מתודה `setConversionWidgetLayout()` שמבצעת `state.patch()` על `layout`, באותו דפוס בדיוק כמו `setOfferingsLayout()` הקיים עבור `rewardsLayout`.

**Reason:** נבנה כ-MVP מכוון-scope לפי ספסיפיקציה שכתב המשתמש במפורש: "בחירה עיצובית בלבד, ללא Refactor, ללא מנוע Templates, ללא Drag & Drop, ללא JSON Layouts — כל Layout הוא HTML/CSS ידניים." חשוב: זה נבנה **מיד** אחרי סבב שלם שבו סוכם (ותועד ב-DECISIONS.md, למעלה) לחכות לראיות שימוש אמיתיות לפני שמוסיפים יכולת חדשה, ולא לגעת ב-`campaign-preview` שוב בלי הצדקה קונקרטית. כשנשאל אם יש ראיה חדשה, המשתמש אישר במפורש שאין — זה רצון אישי שלו ("אני מעוניין שיהיו כמה טמפלטים נוספים"), ולשאלה מפורשת אם הוא דוחה את הכלל שסוכם, ענה: "הכלל עצמו לא נכון כמוחלט" — כלומר "לחכות לראיות" הוא heuristic ברירת מחדל טוב, לא Gate מוחלט שדורש הצדקה כדי לעקוף אותו; שיקול דעת מוצרי של בעל הפרויקט מספיק כשלעצמו. אומת מול שרת/DB אמיתיים: קמפיין test זמני (סלאג ייחודי, נמחק בסוף) עם container בסגנון sidebar rail (בדיוק כמו שהתבניות הרגילות מייצרות) — Classic, Unified ו-Compact כל אחד נצפה בנפרד ב-Playwright headless מול `/campaigns/:slug/view`, ותועד בצילום מסך: Unified מיזג את שני הכרטיסים לרצף אחד חלק בלי תפר גלוי; Compact הראה ריפוד/גדלים מוקטנים תוך שמירה על שני כרטיסים נפרדים. `ng build` עבר נקי (כולל הבקרה החדשה ב-Builder — Angular's strict template type-check היה תופס טעות הקלדה בשם השדה/המתודה). **מגבלה ידועה, לא תוקנה בכוונה (מחוץ ל-Scope):** מיזוג ה-`unified` מניח שהבלוקים `stats`+`donation-widget` נצמדים זה לזה אנכית (המקרה השכיח, וה-פריסה שכל התבניות הקיימות בונות) — אם הם מסודרים בשורה (container `direction:'row'`) או עם בלוק אחר ביניהם, ה-CSS לא "יודע" למזג אותם וזה יראה פשוט כמו שני כרטיסים נפרדים (לא שבור, רק לא ממוזג). זה נבדק ונצפה בפועל תוך כדי האימות (קמפיין test ראשון היה במקרה בפריסת row, וחשף את המגבלה לפני שהוחלף בקמפיין test עם פריסה אנכית תקנית).

---

**2026-07-26**

**Decision:** הורחב `conversionWidgetLayout` מ-3 ל-5 ערכים: נוספו `'hero'` ו-`'split-horizontal'` (סה"כ: `classic | unified | compact | hero | split-horizontal`), לפי הדמיה שהמשתמש הביא (6 קונספטים מעוצבים) ובחירה מפורשת שלו לגבי אילו שווה להוסיף. **Hero** משתמש בדיוק במנגנון המיזוג של Unified (radius+gap-cancel) ומוסיף עליו רקע גרדיאנט בצבעי הת'מה **הדינמיים** של הקמפיין עצמו (`var(--hm-primary)`/`var(--hm-secondary)`, כבר מוגדרים ב-root של `.campaign-page`) — לא צבע קבוע (למרות שבהדמיה שהמשתמש הביא זה יצא סגול, כי זה צבע הת'מה של אותה הדמיה) — יחד עם override מקיף לכל הטקסטים/אייקונים/כפתורים לניגודיות לבנה על הרקע הכהה. **Split Horizontal** הופך את `.hm-stats` לרשימה אנכית צרה (העמודה הימנית, RTL) לצד `.hm-donate` הרחב (העמודה השמאלית) — מומש עם `.sidebar-rail-inner:has(> .block-wrap > .hm-stats.conv-split) { flex-direction: row }`, שהופך את כל שורת ה-flex לרוחבית *רק* כשקיים ילד עם `conv-split`, ופנימית `.hm-stat-grid` עובר מ-grid של 4 עמודות לרשימת שורות (icon+label) אנכית. אין קומפוננטות/state/פונקציות חדשות — אותו דפוס בדיוק כמו Unified/Compact.

**Reason:** לפי המסגרת שסוכמה קודם לכן באותו יום (טבלת 3 ה-Tiers) — זו תוספת מסוג Tier 2 (Small UX: "עוד Layout, עוד Theme, עוד View"), ולכן לא נדרשה שאלת Evidence, רק שיקול דעת מוצרי. מתוך 4 קונספטים חדשים בהדמיה (Hero Card, Split Horizontal, Minimal, Highlight Amount) המשתמש בחר לשמר רק שניים — הקריטריון שהגדיר: "כל Template צריך להיות כזה שגם בלי לקרוא את השם, במבט של שנייה תגיד: אה... זה כבר נראה אחרת" — Minimal ו-Highlight Amount נפסלו כווריאציות קלות מדי של הקיים, Hero ו-Split עברו כי הם "נראים כמו תבנית אחרת, לא רק CSS אחר". Unified — שהיה קיים כבר לפני ההדמיה החדשה ולא הופיע בה — נשאל עליו במפורש והוחלט להשאיר (5 בסה"כ, לא 4), כדי לא לאבד יכולת קיימת בטעות רק כי נשמטה מרשימת ההדמיה. **החלטת מימוש מרכזית:** צבעי Hero נלקחים דינמית מת'מת הקמפיין (לא סגול קבוע) — כדי שהתבנית תתאים לכל קמפיין, לא רק לצבעי ההדמיה הספציפית שהוצגה. **תלות טכנית חדשה:** `:has()` (CSS relational selector) — נתמך בדפדפנים מודרניים (Chrome/Edge/Safari/Firefox גרסאות 2023+), לא בדפדפנים ישנים; הוחלט שזה קביל בלי דיון נוסף כי שאר הקוד כבר לא תומך בדפדפנים ישנים באופן מוצהר. **מגבלה ידועה, אותה קטגוריה כמו Unified:** `split-horizontal` עובד רק כש-stats+donation הם שני הילדים היחידים ב-`.sidebar-rail-inner` (המקרה בכל תבנית ברירת מחדל) — container מותאם-אישית עם בלוקים נוספים בסיידבר לא יתפצל. אומת מול שרת/DB אמיתיים: קמפיין test חדש (סלאג ייחודי, container בפריסת sidebar rail תקנית, נמחק בסוף) — כל 5 הערכים נצפו בנפרד ב-Playwright headless מול `/campaigns/:slug/view` ותועדו בצילומי מסך: Hero הראה כרטיס גרדיאנט רציף עם ניגודיות תקינה; Split הראה עמודה ימנית צרה (רשימת KPI) לצד עמודה שמאלית רחבה (תרומה) — מיקום ה-Split יצא **מראה** מהדמיית ה-LTR המקורית (stats מימין, לא משמאל) בגלל ה-RTL של האתר, וזו התנהגות נכונה/צפויה, לא באג; Classic נבדק שוב בסוף לוודא שאין רגרסיה מהוספת ה-CSS החדש — זהה לחלוטין להיום. `ng build` עבר נקי. אפס שגיאות קונסול בכל הבדיקות.

---

**2026-07-26**

**Decision:** נוסף שדה חדש ל-`CampaignLayout` — `rewardsPlacement?: 'below' | 'sidebar'` — שקובע איפה בלוק ה-`rewards` (תשורות/Offerings) מוצג. **`below`** (ברירת מחדל/`undefined`, כמו כל קמפיין קיים) הוא בדיוק המצב היום: carousel אופקי ברוחב מלא מתחת לאזור הסיידבר. **`sidebar`** מרנדר את התשורות **בתוך** הסיידבר עצמו (`.sidebar-rail-inner`, מתחת ל-stats+donation-widget), כרשימה אנכית של כרטיסים קומפקטיים — לא ה-carousel הקיים, HTML/CSS נפרד לגמרי (`.hm-reward-list`/`.hm-reward-list-card`, ללא `.hm-slider-outer`/חיצי ניווט/scroll-snap), אבל אותם שדות/פונקציות בדיוק (`selectOffering`, `isOfferingInCart`, `removeOffering`, `scrollToDonation`). המימוש הלוגי ב-`sidebarBlocks()`/`belowSidebarBlocks()` (`campaign-preview.component.ts`): כש-`rewardsPlacement==='sidebar'`, `sidebarBlocks()` מוסיף את בלוק ה-rewards (אם visible וטרם נתפס) ל**סוף** הרשימה שהיא כבר בונה — בין אם דרך container מפורש עם `railZone:'sidebar'` ובין אם דרך ה-fallback הישן (stats/donation-widget בלבד) — ו-`belowSidebarBlocks()` מוציא אותו מה-`FULL_WIDTH_TYPES` filter בהתאם, כדי שלא ירונדר פעמיים. בקרה ל-Builder נוספה ב-`campaign-offerings-step` (לא שלב נפרד) — שתי כפתורים "מתחת לתוכן"/"בסיידבר" — **מוצגת רק** כש-`layoutMode` הוא `sidebar-right`/`sidebar-left` (אין סיידבר להציב בו תשורות אחרת), עם מתודה `setRewardsPlacement()` באותו דפוס בדיוק כמו `setOfferingsLayout()`/`setConversionWidgetLayout()`.

**Reason:** המשתמש צירף צילום מסך של קמפיין וורדפרס ישן שבו התשורות מוצגות כרשימה אנכית בסיידבר, וביקש אפשרות דומה כאן — "היוזר יבחר איך למקם". Tier 2 (עוד placement/view option, לא Refactor/מנוע) לפי המסגרת שנקבעה — בוצע ישירות בלי לשאול על Evidence. **באג אמיתי שהתגלה תוך כדי האימות (לא בתכנון):** הניסוח הראשוני התייחס רק ל-fallback הישן (stats/donation-widget בלבד, בלי container מפורש) — קמפיין test ראשון (משוכפל מ-`gdolim`, שמשתמש כבר במנגנון ה-container המודרני `railZone:'sidebar'`) חשף שה-early-return הקיים ב-`sidebarBlocks()` מדלג לגמרי על הלוגיקה החדשה כש-container מפורש קיים — התשורות נשארו למטה בפועל, למרות ש-`rewardsPlacement` היה מוגדר נכון ב-DB. תוקן על ידי הוצאת לוגיקת ה-rewards מהתנאי (מוסיפה לתוצאה הסופית בשני המסלולים, לא רק בנפילה חזרה), ואומת מחדש. אומת סופית מול שרת/DB אמיתיים: קמפיין test עם שלוש "תשורות" מזויפות (חולצה/תעודה/סיור) על גבי `gdolim` (sidebar-left, container מפורש) — `below` הראה carousel סגול רגיל בלי שינוי; `sidebar` הראה את שלוש הכרטיסיות ברשימה אנכית לבנה בתוך הסיידבר, מתחת לתרומה, כולל תג "מומלץ" על הפריט המסומן — נבדק ישירות ב-DOM (`closest('.sidebar-rail-inner')`) שהתשורות אכן זזו, לא רק ויזואלית. `ng build` עבר נקי. אפס שגיאות קונסול. קמפיין ה-test נמחק בסוף.

---

**2026-07-26**

**Decision:** `rewardsPlacement?: 'below'|'sidebar'` **הוחלף** (לא נשמר לצד) ב-שדה כללי אחד — `sidebarSections?: Array<'rewards'|'donors'|'ambassadors'|'updates'|'sponsors'>` — שמכסה את **חמשת** הבלוקים שהיו FULL_WIDTH_TYPES קבועים: תשורות, תורמים שלנו, שגרירים, עדכונים, וחסויות. כל אחד מקבל וריאנט תצוגה קומפקטי-אנכי נפרד לגמרי מהתצוגה הרגילה שלו (לא CSS בלבד — markup נפרד, אותו דפוס בדיוק כמו rewards):
- **תורמים** (`.hm-donor-list-sidebar`/`.hm-donor-list-row`) — מדלג על שורת הסטטיסטיקות/טאבי-תקופה/פאנל Top-10; משתמש חוזר ב-`visibleDonors`/`canShowMore`/`showMoreDonors` הקיימים ללא שינוי.
- **שגרירים** (`.hm-amb-list-sidebar`/`.hm-amb-list-row`) — מדלג על חיפוש/מיון/grid דו-טורי; משתמש חוזר ב-`ambVisible`/`ambPct()`/`viewAmbassador()`/`openJoinModal()`.
- **עדכונים** (`.hm-update-list-sidebar`) — **הוסיפו pagination חדש** (`visibleUpdates(draft)`/`canShowMoreUpdates(draft)`/`showMoreUpdates(draft)` ב-TS), כי בניגוד לתורמים/שגרירים לא היה מנגנון show-more קיים כלל עבור עדכונים (התצוגה הרגילה תמיד מרנדרת את כל `draft.updates`).
- **חסויות** — הכי קל מבין החמישה: אין דאטה/פאגינציה חדשה, רק CSS (`.hm-sponsors--sidebar-list`) שהופך את ה-grid העוטף (flex-wrap רוחבי) לעמודה אנכית צרה — אותו markup `.hm-sponsor-card` בדיוק.

מתודות משותפות (`isSidebarSection()`/`setSidebarSection()`) הועברו מ-component ספציפי (offerings-step) ל-`CampaignStudioStateService` עצמו, כדי שכל אחד מחמשת ה-Builder steps (Offerings/Ambassadors/Sponsors/Updates, ו-Page Builder בשביל Donors שאין לו step ייעודי) יוכל לקרוא להן ישירות דרך `state.isSidebarSection(type)`/`state.setSidebarSection(type, bool)` בלי כפילות קוד.

**Reason:** מיד אחרי שנבנה placement ל-rewards בלבד, המשתמש ביקש את אותו הדבר עבור שגרירים/תורמים/עדכונים ("גם שגרירים, תורמים שלנו, עדכונים. אופציה ליוזר לשים את זה בצד — בסיידבר"), ותוך כדי העבודה גם עבור חסויות ("גם החסויות. אפשרות שיהיו בסיידבר") — Tier 2 מובהק (עוד placement option לכל אחד, לא מנוע/Refactor). **החלטת ריפקטור מוצדקת ולא ספקולטיבית:** הכללת `rewardsPlacement` ל-`sidebarSections` בוצעה **רק** כי היא פותחת בפועל את הצורך המיידי (4 בלוקים נוספים עם אותה לוגיקה בדיוק) — לא "כדי שיהיה נקי", תואם את הכלל "כל Refactor חייב לפתוח Feature קונקרטי". מכיוון ש-`rewardsPlacement` מעולם לא נפרס לפרודקשן אמיתי (רק על קמפייני test זמניים שנמחקו), אין דאגת migration — השדה הוחלף ישירות, לא נוסף לצידו. אומת מול שרת/DB אמיתיים: קמפיין test אחד עם דאטה אמיתי לכל חמשת הסוגים (שתי תרומות אמיתיות בטבלת `donations`, שני עדכונים, שתי חסויות, שגרירים ריק) — כל חמשת הבלוקים נבדקו ישירות ב-DOM (`closest('.sidebar-rail-inner')`) שהם אכן עברו לסיידבר יחד באותה קריאת `sidebarSections`; ואז `sidebarSections` אופס לריק ואומת מחדש שכל חמשת הבלוקים חוזרים למראה הרוחב-המלא המקורי בלי שינוי — regression check מלא לפני ולאחר. `ng build` עבר נקי לאורך כל השלבים. אפס שגיאות קונסול. כל נתוני ה-test (קמפיין + תרומות) נמחקו בסוף.

---

**2026-07-26**

**Decision:** ל-`.sidebar-rail` (הסיידבר ה-`position: sticky`) נוסף `max-height: calc(100vh - 32px)` + `overflow-y: auto` (במובייל, שם הוא `position: static` ולא sticky, זה מבוטל בחזרה ל-`max-height: none`/`overflow-y: visible`).

**Reason:** המשתמש שאל "לאן היוזר ינווט מפה אם הוא לוחץ על התפריט" כשסקשן עבר לסיידבר — בדיקה בפועל (קליק אמיתי + מדידת מיקום DOM) אישרה שהניווט עצמו תקין (ה-`id` נשאר על האלמנט גם כשהוא זז), אבל חשפה תופעת לוואי אמיתית: כשכמה סקשנים (תשורות+תורמים+שגרירים+עדכונים+חסויות) נערמים יחד בסיידבר, הוא יכול להיות **גבוה בהרבה** מעמודת התוכן הראשית (Hero+סיפור) לצידו — וללא הגבלת גובה, כל הדף גדל כדי להתאים לסיידבר, כך שגלילה לסקשן נמוך בסיידבר משאירה שטח לבן ריק בצד עמודת התוכן שכבר נגמרה. אומת מול שרת אמיתי: אותו תרחיש בדיוק (5 סקשנים בסיידבר, סיידבר בגובה 1634px מול viewport 800px) — לפני התיקון, קליק על "תשורות" גילה שטח לבן ריק מימין; אחרי התיקון, ה-Hero נשאר גלוי במלואו ורק הסיידבר גולל פנימית (`clientHeight:768px` מתוך `scrollHeight:1634px`, `overflow-y:auto`) — כל שלושת קישורי הניווט שנבדקו עדיין הביאו את היעד בדיוק ל-top:0 בתוך הגלילה הפנימית. `ng build` עבר נקי. אפס שגיאות קונסול.

---

**2026-07-27**

**Decision:** בעמוד הקמפיין הציבורי נוסף פס "חזרה לעריכה" (`canEdit`, `campaign-public-page.component.ts`), מוצג רק למנהל הישות שבבעלותה הקמפיין — **לעולם לא** לפי query-param/state/referrer, אלא באמצעות בדיקת בעלות אמיתית מול השרת: אם קיים token, מתבצעת קריאה שקטה ברקע ל-endpoint המאומת הקיים (`getBySlug()`, שכבר עושה JOIN מול `user_entities`) — הצלחה = הצגת הפס; כישלון (403/404, כולל למבקר אנונימי לגמרי בלי token) = שום דבר לא מוצג ולא נכשל בצורה גלויה. במקרה שהקריאה הציבורית הרגילה כבר נכשלה (Fallback הקיים ל-entity לא-מאושר, ר' `ownerPreview`) — `canEdit` מוגדר `true` ישירות, בלי קריאה כפולה, כי אותה קריאה מאומתת כבר הוכיחה בעלות. הפס עצמו וה-CSS שלו הם שימוש חוזר מדויק ב-`.ambassador-edit-bar`/`.ambassador-edit-btn` הקיימים (אותו pattern בדיוק שכבר קיים לשגריר צופה בדף שלו) — אין CSS חדש. כפתור "חזרה לעריכה" מנווט ל-`/campaigns/{id}/edit` (`goToEdit()`), אותו route בדיוק שכבר קיים ומוגן ב-`campaignEditorGuard`.

**Reason:** המשתמש ביקש דרך לחזור למצב עריכה כשעוברים מהדשבורד/מהעורך למצב צפייה, בלי שזה יהיה נגיש למבקר מבחוץ. נבדק בקוד הקיים: `ownerPreview` הישן מטפל **רק** במקרה של entity שעדיין לא מאושר (ה-fallback המאומת רץ כי ה-endpoint הציבורי מחזיר 404) — לקמפיין רגיל שכבר גלוי לציבור (המקרה הנפוץ) לא הייתה שום בדיקת בעלות בכלל, ולכן מנהל שצופה בקמפיין החי שלו לא קיבל שום אינדיקציה. ההחלטה המרכזית: לבדוק בעלות בצד השרת (לא query-param/state), כדי שלעולם לא ידלוף אפילו קיום האפשרות למבקר שאינו הבעלים. אומת מול שרת אמיתי: JWT אמיתי (לא מזויף) נוצר עבור user_id אמיתי שמנהל את הישות (`user_entities`), הוזרק ל-localStorage, ונטען מול קמפיין test אמיתי (entity פעילה, קמפיין ציבורי רגיל) — הפס הופיע רק עם ה-token (`canEdit=true`), ולא הופיע בכלל בביקור אנונימי (`canEdit=false`) לאותו קמפיין בדיוק. **מגבלת בדיקה (לא באג):** קליק בפועל על הכפתור בסביבת הבדיקה ניווט אל `/welcome` ולא `/campaigns/:id/edit` — כי `campaignEditorGuard` (קוד קיים, לא נגעתי בו) דורש שגם `CurrentContextService` יהיה מאוכלס (roles/context), מה שקורה רק בזרימת login אמיתית ולא רק מ-token גולמי שהוזרק ידנית לבדיקה. קריאת ה-`router.navigate(['/campaigns', id, 'edit'])` עצמה זהה בדיוק לתבנית קיימת שכבר עובדת באפליקציה (`editMyAmbassadorPage()`), ולכן לא נדרש אימות חי נוסף מעבר לזה. `ng build` עבר נקי. אפס שגיאות קונסול. קמפיין ה-test נמחק בסוף.

---

**2026-07-28**

**Decision:** לכרטיס התשורה בסיידבר (`.hm-reward-list-card`) נוספו שלושה שיפורים, בהשראת מימוש קודם שהמשתמש הראה מוורדפרס: (1) `rewardsImagePosition?: 'inline'|'above'|'below'` — שדה חדש על `CampaignLayout`, ברירת מחדל `'inline'` (האייקון הקטן הקיים, ללא שינוי) — `'above'`/`'below'` מרנדרים את תמונת התשורה (אם קיימת) כבאנר ברוחב מלא לפני/אחרי בלוק הטקסט במקום האייקון הקטן; (2) אפקט hover שמחליף צבעים — הכרטיס עצמו הופך לצבע הכפתור (`--hm-secondary`), והכפתור הופך ללבן עם הטקסט בצבע המקורי, בדיוק כמו שהמשתמש תיאר; (3) כפתור "לפרטים נוספים" שפותח **מודל** (לא הרחבה In-place כמו ב-carousel) — משתמש חוזר במעטפת ה-modal הקיימת של הצטרפות שגרירים (`.hm-join-overlay`/`.hm-join-modal`/`.hm-join-header`/`.hm-join-body`/`.hm-join-footer`), מציג את תיאור התשורה **המלא** (לא מקוצץ ל-2 שורות כמו בכרטיס עצמו) — אם התיאור מכיל כמה שורות (`\n`), הן מוצגות כרשימה ממוספרת אמיתית (`<ol>`); שורה בודדת מוצגת כפסקה רגילה. כפתור "לבחירה" בתחתית המודל סוגר אותו ובוחר את התשורה (משתמש חוזר ב-`selectOffering()` הקיים).

**Reason:** המשתמש הראה צילומי מסך ממערכת וורדפרס ישנה עם כרטיסי תשורה עשירים יותר, וביקש 3 דברים יחד: מיקום תמונה גמיש, אפקט hover של החלפת צבעים, ואופציה למודל ל"פרטים נוספים" — ואישר "תעשה את זה גמיש, מצד שני ברור ליוזר". **החלטת מודל, לא הרחבה In-place:** נשאלה שאלה מפורשת "אולי כשלוחצים על פרטים נוספים זה יפתח משהו בצורה מודאלית?" — התשובה הייתה כן, בגלל שהסיידבר כבר height-capped עם גלילה פנימית (ר' DECISIONS.md 2026-07-27) — הרחבת טקסט ארוך In-place הייתה דוחפת את שאר הבלוקים בסיידבר עמוק יותר לתוך אותה גלילה, בדיוק הבעיה שתוקנה שם; מודל לא תלוי בגובה הסיידבר בכלל. **תוך כדי העבודה** המשתמש גם ביקש לשנות select דו-אפשרויות ("הגבלת כמות"/"ללא הגבלה") בטופס עריכת התשורה ל-toggle — בוצע בנפרד, החליף select+options ב-`.rs-switch`/`.rs-slider` הקיים (כבר בשימוש באותו קומפוננטה לטוגל "אפשור תשורות"), אין CSS חדש. בקרת מיקום התמונה ב-Builder מוצגת **רק** כש-`state.isSidebarSection('rewards')` — לא רלוונטית לקרוסלת ה-carousel, שיש לה כבר "מבנה כרטיסיה" (rewardsLayout) משלה. אומת מול שרת/DB אמיתיים: קמפיין test עם תשורה אחת (תמונה אמיתית + תיאור תלת-שורתי) — כל שלוש מצבי `rewardsImagePosition` נצפו (inline זהה להיום, above/below מציגים באנר תמונה מלא), hover הראה את החלפת הצבעים המדויקת שהמשתמש תיאר, קליק על "לפרטים נוספים" פתח מודל עם רשימה ממוספרת אמיתית (1. 2. 3.) במקום פסקה אחת. `ng build` עבר נקי בכל שלב. אפס שגיאות קונסול. קמפיין ה-test נמחק בסוף.

---

**2026-07-28**

**Decision:** מבנה כרטיס התשורה בסיידבר הוגדר כסדר **קבוע**, לא עוד תלוי-מצב: **סכום → כותרת → תמונה → פירוט**, תמיד באותו סדר. `rewardsImagePosition` פושט מ-3 ערכים (`inline|above|below`) ל-**2**: `'full'` (ברירת המחדל החדשה — לא `'inline'` כמו קודם) מרנדר את התמונה כשורה נפרדת ברוחב מלא אחרי הכותרת; `'inline'` מרנדר אותה כאייקון קטן **בתוך** שורת הכותרת (אין שורת תמונה נפרדת בכלל). נוסף `rewardsImageSize?: number` (px, ברירת מחדל 120) שקובע את גובה שורת התמונה במצב `'full'` — נשלט ע"י סליידר חדש ב-Builder (טווח 60–240px), כדי שהתמונה לעולם לא תיכפה גדולה מדי. בנוסף הוסר ה-`select` הישן להגבלת כמות תשורה (`הגבלת כמות`/`ללא הגבלה`) והוחלף ב-toggle (`.rs-switch`/`.rs-slider` הקיים, כבר בשימוש לטוגל "אפשור תשורות" באותו קומפוננטה).

**Reason:** המשתמש נתן ספסיפיקציה מפורשת אחרי שראה את הכרטיס עם 'above'/'below' העצמאיים: "המבנה צריך להיות שתמיד הסכום למעלה. מתחת כותרת. מתחת תמונה. ומתחת פירוט" — סדר קבוע, לא רשימת אפשרויות עצמאיות. "עכשיו נשחק עם התמונה כשהיא יכולה להיות במקרה ה-DEFAULT שלה — מתחת לכותרת — או בצד, אייקון קטן" — כלומר רק שתי אפשרויות (לא שלוש), וה-DEFAULT הוא התמונה המלאה מתחת לכותרת (לא ה-`'inline'` הקודם). מכיוון שהשדה נוסף השבוע ומעולם לא היה בשימוש בקמפיין אמיתי חי, הוחלף השדה ישירות (ללא alias/migration) — כולל שינוי ה-default עצמו. "לא כדאי שהיא תהיה גדולה מדי, לתת ליוזר לשחק עם הגודל" — הוביל ל-`rewardsImageSize` + סליידר, באותו דפוס בדיוק כמו סליידר `borderRadius` הקיים לבלוק ה-stats. **שאלה נפרדת שנשאלה ונענתה:** "איפה מעצבים את ה-POPUP של פרטים נוספים? זה ממש דורש עיצוב של דף" — הובהר שהמודל היום לא מעוצב ב-Builder בכלל (עיצוב קבוע, שאול ממודל הצטרפות-שגריר), אבל בפועל כבר משתמש ב-`var(--hm-secondary)` לצבע המחיר/הכפתור (לא צבעים קשיחים) — כך שהוא כן עוקב אחרי ת'מת הקמפיין באופן חלקי כבר היום; עיצוב ייעודי מקיף יותר (layout/גופנים משלו) הוגדר כ-Tier 3 נפרד, לא בוצע בסבב הזה. אומת מול שרת/DB אמיתיים: קמפיין test עם תשורה אחת (תמונה+תיאור תלת-שורתי) — סדר ה-DOM נבדק ישירות (`.hm-reward-list-card > *`) ואומת כ-`price-top → title-row → img → desc → more → btn` הן במצב `full` והן ב-`inline` (שם `img` נעדר לגמרי מהסדר, כמצופה); שינוי `rewardsImageSize` ל-220px הראה תמונה גבוהה משמעותית מברירת המחדל (120px), מוכיח שהסליידר אכן שולט בגודל. `ng build` עבר נקי. אפס שגיאות קונסול. קמפיין ה-test נמחק בסוף.

---

**2026-07-29**

**Decision:** מומש Phase 3 (Page Builder Owner Context) — ראה `PAGE_BUILDER_OWNERSHIP_MODEL_ADR.md` להחלטה המקורית. שינוי הליבה: נוסף `owner-registry.ts` (`hamonym-app/src/app/modules/campaigns/services/`) עם שלושה Registry-ים — `SECTION_REGISTRY` (אילו `BlockType` זמינים לאיזה `OwnerType`, `'campaign'|'partner'`), `OWNER_CAPABILITIES` (יכולות כלליות כמו `hasGoal`/`hasDonations`/`supportsCoupons`), ו-`OWNER_VALIDATORS` (Extension point ריק בכוונה — אין היום שום ולידציה לפני פרסום לאף Owner Type, נבדק בקוד ולא הומצא). `CampaignDraft` קיבל `ownerType?`/`ownerId?` אופציונליים (undefined=`'campaign'`, זהה בדיוק להתנהגות הקיימת). ב-`campaign-page-builder-step.component.ts`, `addableBlocks`/`blockGroups`/`nestedBlockGroups` הפכו מקבועים ל-getters שמסננים לפי `isSectionAvailableFor(type, ownerType)` — לקמפיין (ownerType לא מוגדר) זה no-op מוחלט כי כל סוג בלוק קיים כבר כלל `'campaign'` ב-Registry.

נוספו שלושה `BlockType` חדשים ל-Partner בלבד: `coupons`/`map`/`opening-hours` (data interfaces + עורך UI ב-`campaign-page-builder-step` + רינדור ב-`campaign-preview` — מפה משתמשת ב-Google Maps embed ללא API key, `map?q=...&output=embed`, כי אין מפתח Maps מוגדר בפרויקט בכלל). `map`/`opening-hours` הוגדרו Single-Instance (כמו `hero`), `coupons` לא (חוזר, כמו `gallery`).

**גילוי מרכזי תוך כדי המימוש (חסך עבודה משמעותית):** `CampaignStudioStateService` כבר **חסר כל תלות ב-HTTP** — הוא BehaviorSubject טהור (`patch`/`sync`/`loadDraft`/`reset`), וטעינה/שמירה מהשרת מתבצעות תמיד מחוץ לו (ברמת ה-page component). המשמעות: לא נדרש "Adapter Pattern" בתוך ה-service עצמו כפי שה-ADR שיער — רק host page חדש (`partner-builder-page.component`) שקורא `entities/:id/draft` (במקום `campaigns/:id`) וקורא ל-`state.loadDraft(...)` בדיוק כמו שהעורך הקיים כבר עושה. נוספה `createInitialPartnerDraft(entityId, displayName)` — **לא** בנויה על `createInitialDraft()` הקיים כי זו מזרעת בלוקי-ברירת-מחדל קמפיין-בלבד (`stats`/`donation-widget`/...) שלא רלוונטיים ל-Partner; פרופיל שותף חדש מתחיל עם `blocks: []` ריק.

Backend: migration `033_partner_draft.sql` — `entities.blocks`/`entities.layout` (JSONB, אותה צורה בדיוק כמו `campaigns.blocks`/`campaigns.layout`), פונקציות `getDraft`/`updateDraft` נפרדות ב-`entities.service.js` (לא הוזרמו לתוך ה-`updateEntity` הענק הקיים — concern נפרד לגמרי מהגדרות הפרופיל/Cardcom/onboarding), ו-routes חדשים `GET/PATCH /api/entities/:id/draft` עם `requireEntityOwnership()`. Route חדש בפרונט: `partners/:id/builder` (guard: `authGuard` בלבד — הבעלות נאכפת בשרת).

**Reason:** אישור מפורש להתחיל Phase 3 בהתאם ל-Rollout שסוכם, כולל Definition of Done + Acceptance Tests שנקבעו מראש (`PAGE_BUILDER_PHASE3_ACCEPTANCE_TESTS.md`) — לא לחרוג מהם תוך כדי מימוש. אומת מול שרת/DB/דפדפן אמיתיים (Playwright, JWT אמיתי + `userRoles_v1`/`currentContext_v1` ב-localStorage כדי לעבור את `campaignEditorGuard`):

- **Scenario 1 (Regression):** קמפיין אמיתי קיים (`gdolim`) — קבוצות/סוגי הבלוקים בשלב "בניית דף" זהות ב-100% למה שהיה לפני (תוכן/פריסה/גיוס/נתונים/קהילה/עיצוב, אותם סוגים בדיוק, אותו סדר), וקבוצת "עסק" (Partner-only) **לא** מופיעה כלל בהקשר קמפיין (0 matches). אפס שגיאות קונסול.
- **Scenario 2 (Partner Builder):** entity שותף חדש (`entity_roles.role='partner'`) — קבוצת "עסק" **כן** מופיעה; נוספו בזה אחר זה Hero, Gallery, Map, Coupons דרך אותו UI בדיוק, נראו ברינדור החי (`<app-campaign-preview>` ללא שום שינוי קוד), ואומתו כשמורים בפועל ב-DB (`entities.blocks` מכיל את כל 4 הסוגים) אחרי לחיצה על "שמירה". אפס שגיאות קונסול (מלבד אזהרת Google Sign-In מקומית, לא קשורה).

`ng build` עבר נקי בכל שלב. כל נתוני ה-test (entity שותף + roles + user_entities) נוקו בסיום.

---

**2026-07-29 (המשך)**

**Decision/תוספת:** נסגר הפער שדווח ב-Acceptance Tests (Scenario 5 — הצפייה הציבורית בקמפיין לאחר פרסום, לא רק שלב "בניית דף" בעורך). אומת בנפרד: קמפיין test חד-פעמי עם entity `status='active'` (נמחק בסוף) נטען חי דרך `/campaigns/:slug/view` (אותו `campaign-preview.component` שקיבל את הרחבות הרינדור ל-Partner ב-Phase 3) — נטען תקין, אפס שגיאות קונסול.

**Reason/גילוי אגבי (לא קשור ל-Phase 3):** תוך כדי הבדיקה התגלה ש-`gdolim` — הקמפיין ששימש כ"קמפיין אמיתי" לאורך כל בדיקות ה-Regression בסשן הזה — מחזיר בפועל 404 בעמוד הציבורי, כי ה-entity שלו במצב `status='draft'`, לא `'active'` (תנאי קיים ב-`getCampaignBySlugPublic`: `e.status='active'`). זו עובדה קיימת מראש ב-DB (לא נגרמה משום שינוי כאן), ולמעשה אין כרגע אף קמפיין ב-DB הזה שעונה על תנאי הפרסום הציבורי המלאים — נקודה שכדאי לדעת לבדיקות עתידיות (Playwright/manual) שמניחות "יש קמפיין פורסם אמיתי לבדוק מולו".

---

**2026-07-29 (המשך שני)**

**Decision:** מומש Phase 4 (Partner Management) — כל 5 ה-Epics מ-`PARTNER_DOMAIN_MODEL_ADR.md`. ה-Definition of Done שנקבע מראש היה תרחיש עסקי אחד (לא טכני): מנהל קמפיין פותח תשורה, לוחץ "חבר שותף", מחפש/יוצר Partner, מחבר אותו לקמפיין; מזמין את העסק כעורך; מנהל קמפיין אחר מוצא את אותו Partner ומשתמש בו. **כל 8 הצעדים אומתו חיים** (Playwright + קריאות API אמיתיות מול DB אמיתי, נתוני test נוקו בסוף):

**Backend חדש:**
- `GET /api/entities/search-partners?q=` — חיפוש Partners לפי שם (`entity_roles.role='partner'`), פלטפורמה-רחב, לא מוגבל ל-entities של המשתמש (זו בדיוק הנקודה של Discovery).
- `partner_invites` (migration `034`) + מודול `partner-invites` — טוקן גולמי + hash SHA-256 (אותו דפוס בדיוק כמו `users.password_reset_token`/`platform.service.js#createAdminUser`, לא הומצא דפוס חדש), `GET /api/invites/:token` ציבורי, `POST /api/invites/:token/accept` מאומת. תבנית מייל חדשה `invite-partner-editor`.
- **תיקון אמיתי שהתגלה תוך כדי:** `entities.entity_type` הוא בפועל **NOT NULL** ב-DB (לא נראה בקבצי migrations מתועדים — קודם לתיקייה הזו, כמו ה-CHECK constraint שהתגלה ב-Phase 2). זה סתר ישירות את §1 של ה-ADR (סיווג משפטי נפרד מתפקיד פלטפורמה) — Partner שנוצר מהר ע"י מנהל קמפיין (שם/לוגו/קשר בלבד) לא אמור להיאלץ לבחור סיווג משפטי. תוקן במיגרציה `035`: `ALTER TABLE entities ALTER COLUMN entity_type DROP NOT NULL`.

**Frontend חדש:**
- `owner-registry`-adjacent: `CampaignPartnersService` (צרכן ראשון של ה-API של Phase 2, שלא היה לו עדיין consumer בפרונט).
- `PartnerLinkModalComponent` — מודל "חבר שותף" בתוך `campaign-offerings-step`: חיפוש שותף קיים / יצירת שותף חדש (שם+אתר+קשר בלבד — לא אשף ההקמה המלא של עמותה) וחיבור מיידי לתשורה (`rewardId` = `offering.id`).
- כרטיס תשורה מציג "🤝 מחובר ל: X" עם אפשרות ניתוק, או כפתור "חבר שותף" אם עדיין לא מחובר — מוצג רק כש-`draft.id` קיים (קמפיין נשמר לפחות פעם אחת).
- `partner-builder-page` קיבל כפתור "👥 הזמן עורך" (טופס אימייל קטן).
- עמוד חדש `accept-invite` (ציבורי, ללא guard) — מציג את שם ה-Partner למי שנשלחה אליו ההזמנה; אם מחובר כבר — כפתור קבלה; אם לא — קישורי כניסה/הרשמה עם `?email=&returnUrl=/accept-invite?token=` (נעזר במנגנון `returnUrl` הקיים כבר ב-`register.component.ts`; **נוסף לראשונה** גם ל-`login.component.ts`, תוספתי — לא משנה את זרימת ה-Navigation הקיימת כשה-param נעדר).

**Reason:** "בא נעשה את זה כמו שצריך" — אישור מפורש להתחיל Phase 4 עם Definition of Done עסקי, לא טכני, בדיוק לפי הדפוס שכבר עבד ב-Phase 2/3. אומת סוף-לסוף:

1-2. תשורה נוספה בפועל דרך ה-UI לקמפיין אמיתי (`gdolim`).
3-4. "חבר שותף" נלחץ, חיפוש "קפה לנדוור" — לא נמצא (עדיין לא קיים).
5-6. Partner חדש נוצר ("שם בלבד") **וחובר מיידית** לתשורה — `campaign_partners.reward_id` תואם בדיוק את `offering.id`, נבדק ב-DOM ("מחובר ל:") וב-DB.
7. הזמנה נשלחה (נרשמה ב-`email_logs`, תבנית נכונה), התקבלה ע"י משתמש עם אימייל תואם → שורת `user_entities` שנייה נוספה (Partner יש לו עכשיו **שני** עורכים, בלי שום "העברה"). **גם אומתו שני guard-ים ביטחוניים:** ניסיון לקבל הזמנה שכבר התקבלה → `410`; ניסיון לקבל הזמנה עם משתמש שהאימייל שלו לא תואם → `403`.
8. מנהל קמפיין **אחר לגמרי** (entity/campaign נפרדים, לא קשור למי שיצר את ה-Partner) חיפש "קפה" דרך `search-partners` ומצא את אותו Partner, וחיבר אותו לקמפיין השני שלו **בלי תשורה** (sponsor-only, `reward_id: null`) — מוכיח את §4 (Reward אופציונלי ל-CampaignPartner).

`ng build` עבר נקי בכל שלב. כל נתוני ה-test (2 entities, קמפיין, invites, משתמש) נוקו בסוף; קמפיין `gdolim` שוחזר במדויק ל-2 התשורות המקוריות שלו.

---

**2026-07-29 (המשך שלישי)**

**Decision:** מומש Sprint 5.1 (Public Partner Page) — הצעד הראשון ב-Phase 5, לפי העיקרון "Public Pages הם Renderers בלבד" שנקבע מראש. נוסף endpoint ציבורי `GET /api/entities/:id/public` (ללא auth) המחזיר `{displayName, logoUrl, blocks, layout}` רק אם ה-entity לא מחוק, לא מוסתר, ומחזיק בפועל תפקיד `'partner'` (`entity_roles`) — אחרת `404`. בפרונט, קומפוננטה חדשה `partner-public-page` ב-route ציבורי `partners/:id/view` (ללא guard) בונה אובייקט draft (דרך `createInitialPartnerDraft`, אותו factory שכבר קיים מ-Phase 3) ומזין אותו ל-`<app-campaign-preview>` — **אותו** Renderer בדיוק שכבר משמש לכל דבר אחר, בלי שום שינוי קוד בו לצורך זה. אין `CampaignPageBuilderStepComponent`, אין קריאה מאומתת כלשהי, אין state עריכה — בדיוק "חלון" על הנתונים, לא "לוגיקה עסקית" כפי שהוגדר בעיקרון.

**באג אמיתי שהתגלה תוך כדי אימות (לא קשור ל-Partner באופן ישיר):** כפתור "לתמיכה מאובטחת" (גם ב-nav העליון וגם ב-sticky bar התחתון) התברר כלא-מותנה בכלל בקיום בלוק `donation-widget` בפועל — הוא הופיע גם בדף Partner (שאין לו שום זרימת תרומה). זה עבד "במקרה" עד היום כי לכל קמפיין קיים תמיד היה בלוק donation-widget (מ-`createInitialDraft()`), אז אף אחד לא שם לב שהתנאי חסר. תוקן ע"י `hasDonationWidget(draft)` חדש (אותו דפוס בדיוק כמו `hasAmbassadorsSection()` הקיים — בדיקת קיום בלוק, לא קשור ל-ownerType) שמותנה עליו גם כפתור ה-nav (דסקטופ+מובייל) וגם ה-sticky bar.

**Reason:** אישור מפורש להתחיל Sprint 5.1 עם עיקרון "Renderer בלבד" ו-Definition of Done ברור מראש. אומת מול שרת/DB/דפדפן אמיתיים:

- דף Partner אמיתי (עם בלוק Hero) נטען **ללא כל token ב-localStorage** (בדיקת אנונימיות אמיתית, לא רק missing-auth-header) — הוצג נכון, אפס שגיאות קונסול, אין כפתור "שמירה" ואין רכיבי עורך כלשהם בדף.
- **בדיקת Live-Edit (המרכזית):** נשלחה קריאת `PATCH /api/entities/:id/draft` אמיתית (מדמה Save מה-Builder) שהוסיפה בלוק rich-text עם טקסט ייחודי; רענון הדף הציבורי (דפדפן חדש, עדיין ללא auth) הציג את הטקסט מיד — **בלי שום "פרסום" נפרד ובלי מנגנון caching**, בדיוק כפי שהעיקרון דורש.
- Partner מוסתר (`is_hidden=true`) ו-Partner שלא קיים — שניהם החזירו `404` תקין.
- Regression: קמפיין test אמיתי עם בלוק donation-widget עדיין מציג את כפתור "לתמיכה מאובטחת" (nav + sticky) בדיוק כמו לפני התיקון — 3 מופעים, אפס שגיאות.

`ng build` עבר נקי בכל שלב. כל נתוני ה-test (partner + entities/campaign לבדיקת regression) נוקו בסוף.

---

**2026-07-29 (המשך רביעי)**

**Decision:** נוספו שני קישורי ניווט קטנים, לא כפיצ'ר מוצר אלא כדי שה-Acceptance Test של Sprint 5.1 יהיה ניתן להרצה מקצה לקצה **דרך ה-UI בלבד**, בלי שליפת ID מה-DB: (1) בכרטיס תשורה מחוברת ל-Partner ("מחובר ל: X") — קישור חדש "✏ ערוך דף שותף" ל-`/partners/:id/builder`. (2) בטופבר של ה-Partner Builder — קישור חדש "👁 צפייה בדף הציבורי" ל-`/partners/:id/view` (נפתח בטאב חדש). שני הקישורים משתמשים ב-`partnerEntityId`/`entityId` שכבר קיימים ב-state, אין endpoint חדש.

**Reason:** המשתמש ציין בצדק שבדיקה שדורשת שליפת ID מה-DB "בודקת את היישום, לא את המוצר" ולא משחזרת זרימת משתמש אמיתית — וביקש דרך זמנית ונוחה במקום זאת, במפורש כשיפור לחוויית הפיתוח/בדיקות עד ש-Sprint 5.2 יחבר את הניווט האמיתי (מהתורם, לא ממנהל הקמפיין). אומת מלא-לגמרי דרך UI בלבד (Playwright מדמה קליקים אמיתיים, ללא שאילתת SQL כלשהי לצורך הניווט עצמו): קמפיין → תשורות → הוספת תשורה → "חבר שותף" → יצירת שותף חדש → "✏ ערוך דף שותף" (נפתח טאב חדש) → הוספת בלוק Hero → שמירה → "👁 צפייה בדף הציבורי" (טאב שלישי) → מציג את התוכן → נבדק שוב באותו URL מדפדפן אנונימי חדש לגמרי (ללא token כלל) — עדיין מציג נכון. אפס שגיאות קונסול לאורך כל השרשרת. נתוני ה-test נוקו בסוף.

---

**2026-07-29 (הבהרה)**

שני קישורי הניווט מהרשומה הקודמת ("✏ ערוך דף שותף", "👁 צפייה בדף הציבורי") **אינם scaffolding זמני לבדיקות** — הם Developer/Manager UX לגיטימי שנשאר גם אחרי סיום Phase 5: מנהל קמפיין באמת ירצה לערוך את דף השותף שיצר, וכל עורך תוכן ירצה לראות תצוגה חיה של מה שהוא בונה. הוגדר גם עיקרון הנדסי כללי לפרויקט (נוסף ל-Guiding Principle ב-`PARTNER_DOMAIN_MODEL_ADR.md`): אם הדגמת יכולת חדשה דורשת גישה ל-DB/הרכבת URL ידנית — כנראה חסרה נקודת כניסה ב-UI, גם אם הפתרון הוא Developer UX ולא בהכרח נגישות לכל משתמש.

---

**2026-07-29 (המשך חמישי)**

**Decision:** נוסף אזור עצמאי חדש "שותפים" (`/partners`) — נקודת כניסה ראשית ליצירת/ניהול Partner, **בלתי-תלויה בכלל בקמפיין**. עד כה יצירת Partner התאפשרה רק כתופעת-לוואי של עריכת תשורה בקמפיין ("חבר שותף" ב-`campaign-offerings-step`), מה שסתר בפועל את §11 (Partner הוא Entity עצמאי, `Partner ← 0..N CampaignPartners`) — למרות שה-DB/API כבר תמכו בקיום Partner בלי שום קמפיין, לא הייתה שום דרך ב-UI *להגיע* למצב הזה במכוון.

**מה נבנה:**
- Backend: `GET /api/entities/my-partners` (`getMyPartners` — כל ה-entities שיש למשתמש עליהם `user_entities` וגם תפקיד `entity_roles.role='partner'`), `GET /api/campaign-partners/partner/:partnerId` (`listCampaignsForPartner`, סימטרי ל-`GET /campaign/:campaignId` הקיים, בעלות נבדקת דרך `isEntityMember`).
- Frontend: `PartnersListPageComponent` חדש ב-route `/partners` (בתוך ה-shell הרגיל, עם sidebar) — רשימת Partners של המשתמש + טופס "+ שותף חדש" מוטמע (שם/אתר/קשר בלבד, אותו מינימום כמו היצירה מתוך קמפיין) שמנווט ישר ל-Builder אחרי היצירה. נוסף פריט ניווט "שותפים" ל-sidebar (role `entity-manager`). ב-`partner-builder-page` נוסף פאנל "קמפיינים שמשתמשים בשותף הזה (N)" עם מצב-ריק מפורש: "עדיין אין קמפיינים מחוברים — זה תקין, שותף יכול להתקיים גם בלי קמפיין" — הופך את §11 לעובדה גלויה למשתמש, לא רק להנחת מודל מאחורי הקלעים.
- היצירה מתוך תשורת קמפיין (`campaign-offerings-step` → "חבר שותף" → יצירה) **נשארה בדיוק כפי שהייתה** — קיצור-דרך לגיטימי לנוחות, לא בוטלה. הנתיב החדש הוא נקודת הכניסה ה*ראשית*, לא היחידה.

**Reason:** המשתמש זיהה שזה לא רק פער בתסריטי בדיקה אלא **Use Case עסקי חסר בפועל** — עסק/חברה שרוצה עמוד שותף משלו לא אמור להיות תלוי בכך שמישהו קודם ייצור קמפיין ויערוך תשורה כדי שהוא "יתגלה". הוגדר "Scenario 0 — Partner First" כתרחיש ה-Acceptance המרכזי, עם קדימות מפורשת מעל שאר תרחישי Phase 5: כניסה למסך שותפים ← "שותף חדש" ← יצירה ← בניית הדף ← הזמנת עורך ← צפייה בדף הציבורי ← אימות "0 קמפיינים" ← פתיחת קמפיין קיים ← חיבור **אותו** Partner (חיפוש, לא יצירה חוזרת) ← אימות שהדף הציבורי לא השתנה ואך ורק נוספה רשומת שיוך.

**תוצאות בדיקה:** כל 10 הצעדים של Scenario 0 אומתו חיים (Playwright, קליקים אמיתיים בלבד — UI, ללא זריקת נתונים ישירה ל-DB, בהתאם לעיקרון שנקבע ברשומה הקודמת):
1. "שותפים" מופיע ב-sidebar ותפקודי.
2. "שותף חדש" פותח טופס יצירה מוטמע.
3. Partner נוצר ומעביר אוטומטית ל-Builder שלו.
4. נוסף בלוק Hero ונשמר בהצלחה.
5. הזמנת עורך נשלחה ("✓ ההזמנה נשלחה").
6. פאנל "קמפיינים שמשתמשים בשותף הזה" מציג בדיוק `(0)` + משפט מצב-הריק המדויק שנקבע מראש.
7. הדף הציבורי (`/partners/:id/view`) נפתח בטאב חדש ומציג את התוכן.
8. קמפיין קיים אחר לגמרי → תשורה → "חבר שותף" → **חיפוש** (לא יצירה) מוצא את אותו Partner בשם.
9. לאחר החיבור: דף השותף הציבורי נבדק מחדש מ-session אנונימי לגמרי (טאב חדש, ללא token) — **ללא שינוי כלשהו** בתוכן.
10. פאנל "קמפיינים שמשתמשים" נבדק מחדש מ-session מאומת — מציג כעת `(1)`.

אפס שגיאות קונסול לאורך כל השרשרת. `ng build` עבר נקי. כל נתוני ה-test (Partner, invite, email_logs, שיוך לקמפיין) נוקו בסוף — כולל הקפדה על סדר המחיקה (`email_logs` לפני `entities`, עקב `email_logs_entity_id_fkey` ללא CASCADE).

**לא בוטל, לא שונה:** היצירה מתוך תשורת קמפיין; מבנה `entity_roles`/`campaign_partners`; שום endpoint קיים.

---

**2026-07-29/30 (המשך שישי)**

**Decision:** מומשו Sprint 5.2 (Campaign Integration) + Sprint 5.3 (Partner Navigation) + סדרת תיקוני ניקיון שהמשתמש ביקש לאחר שצפה בדף השותף בפועל: "זה לא קמפיין, זה דף עסקי". בפועל דף השותף (Builder + Public) המשיך "לדלוף" מושגים קמפיין-בלבד שהיו תמיד בלתי-מותנים ב-Renderer/Editor המשותפים — לא רק ניסוח, גם תוכן חסר-משמעות (לוגו, תאריך סיום/קטגוריה/מנהל, סטטיסטיקת גיוס "₪0").

**מה נבנה:**

1. **CTA — אפשרות "קישור לאתר" (חסרה עד כה):** `CtaBlockData.ctaAction` קיבל ערך שלישי `'link'` (+ שדה `linkUrl`), לצד `'donate'`/`'register'` הקיימים. שותף חדש מקבל ברירת מחדל `ctaAction:'link'` (לא `'donate'`, שאין לו משמעות בלי תרומה) — `defaultBlockData()` קיבל פרמטר `ownerType` לצורך זה. בעורך (`campaign-page-builder-step`), אפשרויות "תרומה"/"הרשמה למירוץ" מוסתרות כש-`ownerType==='partner'`, ו"קישור לאתר" מוצג לכולם. ב-Renderer, `onCtaClick()` חדש (מחליף את התנאי הישן שהיה קבוע רק donate/register) פותח את ה-URL בטאב חדש.

2. **ניקוי "זה לא קמפיין" — Renderer (`campaign-preview.component`):** לוגו (hero + logo-above-strip + פוטר) מוסתר לגמרי כש-`ownerType==='partner'` — לא רק "אין לוגו מוגדר", אלא שהאזור כולו לא רלוונטי לדף עסקי. Meta chips בהירו (תאריך סיום/קטגוריה/מנהל) הוסתרו לגמרי מאותה סיבה. פס תחתון של סטטיסטיקות גיוס ("ימים נותרו"/"מהיעד"/"סך גיוס"/"תומכים", תמיד `₪0`/`0%` לשותף שאין לו תרומות) הוסתר לגמרי. קישורי ניווט (עליון + drawer מובייל + פוטר) ל"תשורות"/"עדכונים"/"תרומה" מותנים כעת בקיום הבלוק בפועל (`hasBlockType()` חדש) במקום קבועים תמיד — היו מצביעים לסקשנים שלא קיימים בכלל לשותף. "אודות הקמפיין" → "אודות" לשותף. שורת הזכויות בפוטר: משתמשת ב-`draft.title` (שם השותף) ולא ב-`entityName` (שהוא בטעות שם ה-Entity הפעיל של המשתמש המחובר, לא של השותף!) כש-`ownerType==='partner'`, ומשפט "תרומות מוכרות לצרכי מס" מוסתר.

3. **ניקוי "זה לא קמפיין" — Editor (`campaign-page-builder-step`), התגלה תוך כדי אימות חי:** הבדיקה החיה הראשונה חשפה ש-3 הניסוחים האלה דלפו גם ל-**עורך עצמו**, לא רק לרינדור: כותרת הצעד ("בניית דף הקמפיין"), כותרת בלוק הרקע ("רקע הקמפיין"), וסקשן שלם ("פרטי קמפיין" — טוגל להצגת אותו פס-סטטיסטיקות-גיוס תחתון) שהוסתר עכשיו לגמרי לשותף (במקום להציע טוגל לתוכן שלא יכול להיות מוצג בכלל).

4. **מחיקת שותף (Soft delete):** נעשה שימוש ב-endpoint הקיים `DELETE /api/entities/:id` (`softDeleteEntity` — אותו מסלול self-service בדיוק כמו מחיקת עמותה, בעלות נבדקת בתוך ה-service). נוסף כפתור "🗑 מחק שותף" + מודל type-to-confirm (הקלדת שם השותף במדויק) בשני מקומות: טופבר ה-Partner Builder, וכרטיס ברשימת `/partners`. הפעולה הפיכה רק ע"י Super Admin (כמו כל soft-delete אחר במערכת) — הוסבר במפורש בטקסט המודל.

5. **Sprint 5.2 — "בשיתוף עם X" על כרטיס תשורה:** נוסף `CampaignPartnersService.listPublicForCampaign(slug)` (עוטף את ה-endpoint הציבורי הקיים מ-Phase 2, `GET /api/campaign-partners/public/:slug`, שלא היה לו עדיין צרכן בפרונט הציבורי). ב-`campaign-preview.component`, כש-`ownerType!=='partner'` וקיים slug, נטען המיפוי reward→partner ומוצג קישור "🤝 בשיתוף עם X" בכל אחת מ-3 תבניות כרטיס התשורה (רשימת-סיידבר / סליידר / image-hero) + במודל "פרטים נוספים" — קישור **נפרד** מ"לפרטים נוספים" (§12: "מה אני מקבל" ו"מי נותן את ההטבה" הן שתי שאלות שונות, שני קישורים נפרדים, לא אחד מחליף את השני). מוביל ל-`/partners/:id/view?campaignSlug=&campaignTitle=`.

6. **Sprint 5.3 — ניווט בין שותפים + "חזרה לקמפיין":** `partner-public-page.component` קורא כעת `campaignSlug`/`campaignTitle` מ-query params. אם קיימים: מוצג פס עליון "← חזרה ל-{כותרת הקמפיין}" (קישור ל-`/campaigns/:slug/view`), ונטענת רשימת השותפים הציבורית של אותו קמפיין (אותו endpoint כמו סעיף 5) כדי לחשב שותף קודם/הבא (אחרי דה-דופליקציה — שותף יכול לחסות כמה תשורות באותו קמפיין) ולהציג פס תחתון עם קישורי ניווט (שומרים את אותם query params, כך שהניווט בין שותפים באותו קמפיין נשאר רציף).

7. **עיצוב רשימת `/partners`:** הכותרת עודכנה להתאים בדיוק למבנה/עיצוב של `/campaigns` (title+description מימין, כפתור "+ שותף חדש" משמאל, אותם ערכי padding/font/רוחב-כפתור) — לפי בקשה מפורשת של המשתמש אחרי שצפה בדף.

**Reason:** המשתמש ביקש במפורש "לשכוח את המילה קמפיין בהקשר הזה" ונתן דוגמת-ייחוס (עמוד עסקי עם טקסט/תמונות/CTA/קישור לאתר/כפתור חזרה לקמפיין/ניווט לעסקים אחרים בקמפיין), והדגיש שהבילדר צריך "REUSE" מלא של תשתית ה-Builder/Preview הקיימת — לא בנייה מקבילה. אושר ש-Editor+Preview כבר חולקים בדיוק את אותם קומפוננטות (`CampaignPageBuilderStepComponent`/`CampaignPreviewComponent`) ללא כפילות.

**תוצאות בדיקה (Playwright חי, JWT אמיתי למשתמש קיים, כל צעד דרך UI בלבד):**
- דף `/partners`: כותרת+כפתור בפריסה הנכונה (ימין/שמאל), נבדק חזותית.
- שותף חדש נוצר → Builder: אין לוגו כלל בהירו (במקום placeholder "🏢"), אין "קמפיין" בטקסט העורך (`hasKampainEditor:false`) ואין בפריוויו (`hasKampainPreview:false`), פאנל "קמפיינים שמשתמשים (0)" תקין.
- הוספת בלוק CTA → רק "קישור לאתר" זמין (לא תרומה/הרשמה) → הזנת URL → נשמר ומוצג בפריוויו החי כפתור "לאתר שלנו" ירוק תקין (`ctaLinkOptionFound:true`).
- לחיצה על "מחק שותף" → מודל type-to-confirm נפתח (`modalVisible:true`) → הקלדת השם המדויק → מחיקה → ניווט אוטומטי ל-`/partners` → השותף שנמחק **לא** מופיע ברשימה (`stillListed:0`).
- אפס שגיאות Angular קונסול (2 אזהרות `Failed to load resource: 403` + `GSI_LOGGER` — Google Sign-In origin, לא קשור, ידוע ולא חדש).

`ng build --configuration development` עבר נקי. **הערה חשובה, לא קשורה לשינוי הזה:** `ng build` הרגיל (production, ברירת המחדל) נכשל על budget של `anyComponentStyle` (מקסימום 16kB) — `campaign-preview.component.css` (כ-76kB) ו-`campaign-page-builder-step.component.css` (כ-20kB) חורגים ממנו. אומת מול `git show HEAD` שזה **קדם לשינוי הזה לגמרי** (הקובץ כבר עמד על כ-100KB לפני שנגעתי בו) — לא קשור לעבודה הנוכחית, לא תוקן כאן, ראוי לטיפול נפרד (העלאת ה-budget ב-`angular.json` או פיצול הקובץ). כל נתוני ה-test (2 שותפי בדיקה, כולל hard-delete מלא בסוף — לא רק soft — כדי לא להשאיר רשומות מיותמות) נוקו.

---

**2026-07-30 (עדכון מודל — Partner Profile / Campaign Participation)**

**Decision:** פוצל מודל הדף הציבורי של Partner לשתי שכבות, לפי תצפית ישירה של המשתמש בדף שותף אמיתי (ישן): כמעט כל תוכנו (מבצע, קופון, תמונות/סיפור ספציפיים לקמפיין, "בשיתוף עם X") שייך בפועל **לקמפיין הספציפי**, לא לעסק עצמו — דף שותף אחד ומשותף לא יכול לייצג את זה בלי לאבד את הפרסום הספציפי-לקמפיין, או לחזור למודל "עותק לכל קמפיין" שכבר נדחה קודם ב-ADR הזה.

**הפתרון (אומץ במפורש, עם שיפור אחד):** שני "Owner" נפרדים, לפי אותו Pattern שכבר קיים פעמיים (`campaigns.blocks/layout`, `entities.blocks/layout`):
- **Partner Profile** (`entities.blocks/layout`, קיים) — נצחי: אודות, גלריה, מיקום, שעות פתיחה, אתר, שיתוף. "Hero" כאן = **קאבר העסק**.
- **Campaign Participation** (`campaign_partners.blocks/layout`, **חדש** — migration `036`) — משתנה מקמפיין לקמפיין: קופון/מבצע, תמונות/סיפור ספציפיים, CTA. "Hero" כאן = **באנר המבצע**.

הדף הציבורי **מרכיב** את שתי השכבות כשיש הקשר קמפיין (`?campaignSlug=`), ומציג Partner Profile בלבד כשאין (ביקור ישיר, בדיוק כמו ב-Sprint 5.1). שדות ה-Hero הקבועים ברמת הדף (כותרת, תמונת רקע) תמיד מגיעים מ-Partner Profile — "Campaign Participation" תורם רק **בלוקים** נוספים (מוצג ראשון, לפני תוכן הפרופיל), לא דורס את השדות הקבועים.

**כלל חדש ב-owner-registry.ts (נעול):** בלוק שמייצג תוכן פרסומי-לקמפיין (`coupons`) שייך תמיד ל-`campaign-partner` בלבד, לעולם לא גם ל-`partner` — כדי שאף אחד לא יתבלבל איפה לערוך אותו. `hero` נשאר משותף לשלושת ה-Owners (Campaign/Partner/CampaignPartner) — לא אותה בעיה, כי מדובר ב-3 storages נפרדים לגמרי, רק תוויות שונות ("Hero" / "קאבר העסק" / "באנר המבצע").

**מה נבנה:**
- Backend: migration `036_campaign_partner_draft.sql` (`campaign_partners.blocks/layout`); `getDraft`/`updateDraft`/`getOne` חדשים ב-`campaign-partners.service.js` (בעלות נבדקת מול הקמפיין, אותו דפוס כמו `update`/`remove` הקיימים); `mapPublicRow`/`listPublicForCampaign` מחזירים כעת גם `blocks`/`layout`; routes חדשים `GET/PATCH /api/campaign-partners/:id/draft`, `GET /api/campaign-partners/:id`.
- Frontend: `owner-registry.ts` — `OwnerType` שלישי `'campaign-partner'`; `createInitialCampaignPartnerDraft()` חדש (`campaign-studio-state.service.ts`); `CampaignPartnersService.getDraft/updateDraft/getOne/listPublicForCampaign` (האחרון תוקן — **באג אמיתי**: ה-endpoint הציבורי מחזיר `{partners:[...]}` אבל השירות החזיר את הגוף הגולמי בלי לפרוק, גרם ל-`TypeError: X is not iterable` בזמן אמת בכל מקום שצרך את ה-endpoint הזה, כולל תג "בשיתוף עם" מ-Sprint 5.2 שנבנה קודם באותה ישיבה — נתפס ותוקן רק בבדיקה החיה של הפיצ'ר הזה).
- `campaign-partner-builder-page` חדש (route `campaign-partners/:id/builder`) — Editor+Preview זהים ב-100% ל-Partner Builder (REUSE מלא, כמו שהמשתמש ביקש), פלוס מתג דסקטופ/מובייל בטופבר (`StudioUiService.setDevice`, אותו מנגנון כמו ה-Studio הראשי) שהיה חסר גם ב-Partner Builder הרגיל.
- `partner-public-page.component` — `forkJoin` בין `getPublicPartner` (Profile) ל-`listPublicForCampaign` (Participation, כשיש `campaignSlug`); בלוקי Campaign Participation מקבלים תחילית `cp-` למניעת התנגשות ID עם בלוקי Profile; מורכבים `[...campaignBlocks, ...profileBlocks]`.
- קישור חדש "🎯 תוכן ההשתתפות בקמפיין" ליד "✏ פרופיל השותף" (שונה שם, לא הוסר) בכרטיס התשורה המחובר ב-`campaign-offerings-step`.
- `campaign-preview.component`/`campaign-page-builder-step.component`: מתודת `isCampaign(draft)`/getter `isCampaign` חדשים — מחליפים את כל בדיקות ה-`ownerType !== 'partner'` הקודמות (שהיו מפספסות את ה-Owner השלישי) בבדיקה חיובית אחת ("האם זה קמפיין אמיתי"). כותרות/סקשנים הרלוונטיים (שם הצעד, "רקע ה-", "טקסטי ה-", "פרטי קמפיין") מותאמים לפי 3 ה-Owners.

**Reason:** המשתמש הצביע על תמונה אמיתית של דף שותף ישן שהוכיחה שהמודל החד-שכבתי לא נכון; הציע בעצמו את הפיצול Profile/Participation; קלוד (בשיחה חיצונית שהמשתמש הביא) הציע לממש אותו כ-Composition (לא שכפול) תוך שימוש חוזר באותו Pattern JSONB — המשתמש אימץ את זה כמעט כפי שהוא, עם תיקון אחד: Hero כן שייך גם ל-Profile (בתור "קאבר העסק"), לא רק לקמפיין.

**תוצאות בדיקה (Playwright חי, נתוני fixture אמיתיים — entity+campaign+reward נוצרו ישירות ב-DB לצורך המהירות, הקישור/עריכה/הרכבה עצמם נבדקו אך ורק דרך UI אמיתי):**
1. שותף חדש נוצר דרך `/partners`, נוסף בלוק "טקסט" ל-Profile, נשמר.
2. בקמפיין test, "חבר שותף" → חיפוש ומציאת אותו שותף → חיבור.
3. קישור חדש "🎯 תוכן ההשתתפות בקמפיין" נלחץ (טאב חדש) → Builder נטען עם כותרת "שותף X × קמפיין Y", ללא "קמפיין" בטקסט העורך.
4. נוסף בלוק קופון (זמין רק כאן, לא ב-Profile Builder) → נשמר → אומת ב-DB.
5. **הדף הציבורי המורכב** (`/partners/:id/view?campaignSlug=...`), מ-session אנונימי לגמרי: פס "← חזרה ל'קמפיין בדיקה CP'" ✓, קאבר העסק ("שותף CP QA", מ-Profile) ✓, **מיד אחריו** כרטיס הקופון (מ-Participation, עם קוד/הנחה/תיאור אמיתיים) ✓, **ואז** תוכן ה-Profile ("טקסט") ✓ — בדיוק הסדר שהמשתמש ציין ("Hero העסק ↓ מבצע ↓ אודות").

אפס שגיאות קונסול (אחרי תיקון ה-`listPublicForCampaign`). `ng build --configuration development` נקי (production build עדיין נכשל על אותו budget קיים-מראש, לא קשור). כל נתוני ה-fixture (entity, campaign, campaign_partners row) נמחקו לגמרי (hard delete) בסוף.

**עוד לא נבנה (במכוון, מחוץ להיקף):** UI לעריכת שדות ה-Hero הקבוע (כותרת/תמונת רקע) בתוך Partner/CampaignPartner Builder עצמם — עדיין רק ב"פרטי בסיס" (שלב 1 של הקמפיין), שאינו חלק מאף אחד משני ה-Builders החדשים; אם יתברר שזה חוסם שימוש אמיתי (למשל אין דרך להעלות תמונת קאבר לשותף כלל), נדרש Epic נפרד.

---

**2026-07-30 (המשך — 3 תיקונים אחרי שהמשתמש בדק את ה-Builder בפועל)**

לאחר שהמשתמש פתח בפועל Partner Builder חדש ובחן אותו לצד תצלום מסך של הבילדר האמיתי של קמפיינים, עלו 3 בעיות נפרדות:

**1. Hero כפוי — "אל תתקע לי את זה, תתחיל מדף ריק":** דף Partner/CampaignPartner חדש (בלי אף בלוק) עדיין הציג את ה-Hero הקבוע (כותרת השם הגדולה על רקע כהה) כי `isEmpty()` בודק `!draft.title` — ו-`createInitialPartnerDraft` תמיד ממלא `title` (שם העסק). **תוקן:** שלוש נקודות ה-`ngTemplateOutlet` של ה-Hero הקבוע ב-`campaign-preview.component.html` (מסלול רוחב-מלא, מסלול sidebar-main-column, וה-fallback שלו) קיבלו תנאי `isCampaign(draft) &&` נוסף — כעת דף Partner/CampaignPartner חדש הוא לגמרי ריק (רק ה-site header), וה-Hero מופיע **רק** אם המשתמש הוסיף אותו בעצמו כבלוק מתוך "הוסף בלוק" (מנגנון שכבר קיים, `hasHeroBlock`/`blockTpl`, לא נבנה מחדש).

**2. חוסר מתג דסקטופ/מובייל ב-Partner Builder:** קיים כבר ב-`campaign-partner-builder-page` (נבנה באותה ישיבה) אך לא ב-`partner-builder-page` המקורי. **תוקן:** נוספו אותם כפתורי `🖥`/`📱` (`StudioUiService.setDevice`) + מסגרת טלפון (390px, אותו pattern כמו `.preview-inner--mobile` בסטודיו הראשי) גם ל-Partner Builder, ליצירת פריטות מלאה בין שני ה-Builders.

**3. באג אמיתי — "יצרת אותי בתור מנהל עמותה של קפה לנדוור, זה לא נכון":** נמצא המקור: `ROLE_META['entity-manager'].label` ב-`current-context.service.ts` הוא מחרוזת קבועה **"מנהל עמותה"**, לא תלוית-entity — כי עד היום כל entity תחת role זה היה עמותה אמיתית. אחרי בניית `/partners`, שותף עסקי חדש (למשל "קפה לנדוור") מקבל גם הוא שורת `user_entities`, ולכן `getMyEntities()` (המזין את ה-switcher בטופבר) החזיר אותו לצד עמותות אמיתיות — ומעבר אליו בסוויצ'ר מציג "מנהל עמותה" על עסק, לא עמותה. **תוקן ב-backend** (`entities.service.js#getMyEntities`): נוסף `AND NOT EXISTS (SELECT 1 FROM entity_roles WHERE entity_id=e.id AND role='partner')` — Partner entities מנוהלים אך ורק דרך `/partners`, לעולם לא כ"הרצת כל האפליקציה בתור הארגון הזה" (§11: אין להם קמפיינים משלהם במודל הזה). כל 5 קוראי ה-endpoint (login, settings, organization-registration, platform-users impersonation) נבדקו — כולם היו צריכים בדיוק את ההחרגה הזו. §7 ("Entity יכול להיות גם Organization וגם Partner בו-זמנית") נשאר תיאורטי (לא נבנה בפועל, כמו שכבר תועד ב-ADR) — אם ייבנה אי-פעם, יש לחזור לסינון הזה.

**תוצאות בדיקה (Playwright + API ישיר):**
- שותף חדש → Builder ריק לגמרי (רק nav), ללא Hero. אימות חזותי מסך מלא.
- מתג `📱` הופך את הפריוויו למסגרת טלפון 390px תקינה.
- קריאת API ל-`GET /api/entities/my` לפני/אחרי הענקת תפקיד `partner` לישות test — נעלמת מהרשימה מיד אחרי, בעוד 2 העמותות האמיתיות של המשתמש נשארות.

אפס שגיאות קונסול. `ng build --configuration development` נקי. כל נתוני ה-test נמחקו (hard delete).

---

**2026-07-30 (המשך — טופבר זהה לחלוטין לבילדר הקמפיינים)**

המשתמש ביקש שוב, אחרי תצלום מסך משווה: כפתורי דסקטופ/מובייל/תצוגה-מלאה **ממורכזים** למעלה (לא בתוך אזור הפעולות), עם האייקונים האמיתיים (lucide), בדיוק כמו `campaign-studio-topbar.component`. **תוקן** בשני ה-Builders (Partner Profile + Campaign Participation): טופבר עבר ל-`display:grid; grid-template-columns:1fr auto 1fr` כדי שאשכול המתג יהיה ממורכז אמיתי; נוספו אייקוני `Monitor`/`Smartphone`/`Maximize2`/`Minimize2` מ-`lucide-angular` (זהה לחלוטין לסטודיו הראשי); נוסף גם כפתור "תצוגה מלאה" (`StudioUiService.setFullscreen`, לא היה קיים כלל קודם) שמסתיר את פאנל העריכה ומרחיב את הפריוויו למסך מלא — אותה התנהגות בדיוק כמו `campaign-studio-page.component`. אומת חזותית: מסך רגיל תקין, לחיצה על "תצוגה מלאה" מסתירה את העורך ומציגה פריוויו מלא ברקע כהה, בדיוק כמו בתצלום ההתייחסות. אפס שגיאות קונסול, `ng build --configuration development` נקי.

---

**2026-07-30 (המשך — "אין PREVIEW, אני רואה רק עורך")**

בדיקת DOM ישירה (Playwright, מדידת `getBoundingClientRect`) אימתה שהעימוד בפועל **כן** מחולק נכון לשתי עמודות (עורך 481px מימין, פריוויו 1439px משמאל, `flex-direction:row` תקין) — לא באג מבני. הסיבה האמיתית: `isEmpty(draft)` (הקובע מתי מוצג placeholder "תצוגה מקדימה חיה") בודק `!draft.title` — ול-Partner/CampaignPartner יש תמיד `title` (שם העסק / "שותף × קמפיין"), ואחרי הסרת ה-Hero הכפוי (רשומה קודמת) דף חדש-לגמרי מציג פשוט שטח לבן ריק, בלי שום סימן שיש שם בכלל פריוויו. **תוקן:** `isEmpty()` בודק כעת מספר בלוקים (`blocks.length === 0`) עבור owners שאינם קמפיין; הודעת ה-placeholder הותאמה גם היא ("הוסיפו בלוק ראשון מהעריכה שמימין" במקום "הזינו כותרת ותמונה", שלא רלוונטי בלי "פרטי בסיס"). אומת חזותית: דף שותף חדש-לגמרי מציג כעת אייקון עין + "תצוגה מקדימה חיה" + ההנחיה החדשה, במקום שטח לבן ללא הסבר. אפס שגיאות קונסול, `ng build --configuration development` נקי.

---

**2026-07-30 (המשך — שדה "שם הבלוק" מטעה + גודל/מיקום תמונה)**

שתי בקשות מהמשתמש, גם בבילדר הקמפיינים וגם בשל השותף (רכיב עריכה משותף):

**1. שדה "שם הבלוק (לצורך זיהוי)" מטעה עבור טקסט/וידאו/גלריה:** בפועל, עבור 3 סוגי בלוקים אלה בלבד, `block.label` **מוצג בפועל** ככותרת חזותית בדף (`.section-heading` ב-`campaign-preview.component.html`) — לא רק "לזיהוי" פנימי בעורך, כפי שהניסוח הטעה. **תוקן:** הניסוח/ה-placeholder של השדה (אחד, גנרי, בראש כל עורך-בלוק) הפכו תלויי-סוג: "כותרת (רשות — מוצגת בדף)" לטקסט/וידאו/גלריה, נשאר "שם הבלוק (לצורך זיהוי)" לכל שאר הסוגים (שם באמת רק לזיהוי בעורך). לא חובה בשני המקרים.

**2. גודל/מיקום לבלוק תמונה:** בלוק "תמונה" תמך רק בהעלאה/כיתוב — תמיד רוחב-מלא, בלי אפשרות להקטין/למקם. **נוסף:** `ImageBlockData.widthPercent`/`align` (ברירת מחדל 100%/ללא — התנהגות זהה לתמונות קיימות, ללא regression); סליידר "רוחב התמונה" (20-100%) + כפתורי מיקום ימין/מרכז/שמאל (מוצגים רק כשהרוחב <100%) בעורך; ברינדור, `.block-image` הפך ל-flex-column עם `align-items` דינמי + `img` עם `width.%` דינמי.

**תוצאות בדיקה (Playwright, בדיקת DOM ישירה — לא רק צילומי מסך, בגלל flakiness בתזמון screenshot מול renders):** בלוק תמונה נוסף, קובץ הועלה בפועל (`POST /api/media/upload` → 200, URL אמיתי מ-Supabase), `<img>` קיבל `src` תקין. סליידר הוזז ל-40% → `img.style.width === '40%'` באמת. לחיצה על "שמאל" → `container.style.alignItems === 'flex-end'` (מיפוי נכון ל-RTL: שמאל=flex-end). אפס שגיאות קונסול. `ng build --configuration development` נקי. כל נתוני ה-test (5 שותפי בדיקה שנוצרו/נוקו תוך כדי אבחון) נוקו לגמרי.

---

**2026-07-30 (המשך — חלוקה ניתנת לגרירה בין עורך לפריוויו)**

עד כה `.pb-editor-card`/`.cpb-editor-card` היו ברוחב קבוע (480px), בלי דרך למשתמש לשנות את היחס. **נוסף** בר-הפרדה (`.pb-resizer`/`.cpb-resizer`, 6px, `cursor:col-resize`) בין העורך לפריוויו בשני ה-Builders (Partner Profile + Campaign Participation); גרירה שלו (`(window:mousemove)`/`(window:mouseup)` בבינדינג גלובלי) מעדכנת `editorWidth` (px, גבולות 320–900) בזמן אמת — העורך יושב מימין (RTL), ולכן רוחבו נמדד כ-`window.innerWidth - clientX` של העכבר. הבר מוסתר אוטומטית ב-fullscreen (אין עורך להראות) וב-`@media (max-width:900px)` (הפריסה מתחלפת לערימה אנכית, ואז הרוחב 100% מקבל `!important` כדי לגבור על ה-inline style של הגרירה).

**תוצאות בדיקה (Playwright, מדידת `getBoundingClientRect` לפני/אחרי גרירה אמיתית של העכבר):** רוחב העורך עלה מ-480px ל-736px אחרי גרירת הבר 250px שמאלה — בדיוק כמצופה. אומת גם חזותית (הבר הסגול נראה בבירור, הפריסה מתעדכנת חלק). אפס שגיאות קונסול, `ng build --configuration development` נקי, נתוני test נוקו.

---

**2026-07-30 (המשך — Popup vs. עמוד עצמאי: המערכת הישנה כבר הכריעה)**

המשתמש שאל אם "על השותף" אמור להיפתח כ-Popup או בתוך הקמפיין. תצלום מסך מהמערכת הישנה (`hamonym.com/business/{slug}`) חשף שגם שם זה תמיד היה **עמוד עצמאי עם URL משלו** — לא Popup, לא embedding אמיתי בתוך ה-DOM/גלילה של הקמפיין. זה בדיוק התבנית שכבר נבנתה (`/partners/:id/view?campaignSlug=`).

**Decision (סופי לעכשיו):** קישור "🤝 בשיתוף עם" (בכל 3 תבניות כרטיס התשורה + מודל "פרטים נוספים") הופך מ-`target="_blank"` ל**ניווט רגיל באותו טאב** — תואם את התנהגות המערכת הישנה, טוב יותר ל-SEO/שיתוף-קישורים/היסטוריית דפדפן. `New Tab` **נשאר** רק ב-Back Office (👁 "צפייה בדף הציבורי"/"צפייה בדף המורכב" מתוך ה-Builders) — שם זה בדיוק ההתנהגות שעורך תוכן רוצה (השארת העורך פתוח). **לא נבנה מנגנון בחירה בין Popup לעמוד** — אין הצדקה כרגע (עלות תחזוקה/UX/בדיקות מול היעדר צורך מוכח); אם עמותות אכן יבקשו את זה בעתיד, ישוקל כחלק מ-Sprint 5.4 או אחרי, לא כעת.

`ng build --configuration development` נקי אחרי ההסרה.

---

**2026-07-30 (המשך — פישוט אלמנט "מסגרת")**

המשתמש: אלמנט ה"מסגרת" לא ברור לשימוש — "זה בעצם סוג של טבלה שאתה יכול להכניס בה אלמנטים, זה לצד זה או זה מעל זה" — משתמש כנראה לא יבין מה לעשות איתו.

**אבחון:** לבלוק היו **2 מצבי-תצוגה נפרדים** שלא נפתחים יחד: (1) `editingBlockId` — פותח את "הגדרות הבלוק" (כיוון/צבעים/ריפוד...), (2) `containerViewState` (Map נפרד) — מחזור תלת-מצבי `closed → preview → open` שקבע האם עץ-הילדים מוצג. אפשר היה ללחוץ על כותרת הבלוק ולראות רק את הילדים ("+ הוסף לכאן") **בלי** לראות בכלל את הבחירה בין "שורה" ל"עמודה" — היא הייתה קבורה מאחורי לחיצה שנייה על אותה כותרת. בנוסף, הוספת בלוק "מסגרת" חדש מה-picker פתחה את הגדרות הבלוק (`editingBlockId`) אך **לא** את `containerViewState`, כך שגם עץ-הילדים (הריק) לא הופיע כלל בבלוק חדש-לגמרי.

**תוקן:**
1. `containerViewState` פושט מ-3 מצבים (`open`/`preview`/`closed`) ל-2 (`open`/`closed`) — לחיצה אחת על כותרת הבלוק מציגה כעת **גם** את ההגדרות **וגם** את עץ הילדים ביחד, תמיד.
2. `openNewBlockEditor()` (הפונקציה שרצה כשמוסיפים בלוק חדש) מקבלת כעת גם `type`, ומסמנת `containerViewState` כ-`'open'` עבור container/tabs/accordion — מסגרת חדשה מציגה מיד את שני החלקים יחד, לא רק את ההגדרות.
3. נוסף משפט הסבר קבוע ("טבלת פריסה מחזיקה כמה בלוקים ומסדרת אותם זה מעל זה או זה לצד זה. הוסיפו בלוקים מתחת, ובחרו כאן איך יוצגו:") **מיד לפני** הבחירה בין הכיוונים — לא רק "כיוון" יבש.
4. תוויות הכפתורים/הצ'יפ עצמם שונו מ"עמודה"/"שורה" הטכניים ל-"זה מעל זה (עמודה)"/"זה לצד זה (שורה)" — משתמשים ישירות בניסוח של המשתמש עצמו.
5. שם הבלוק (ב-`BLOCK_LABELS`, בפיקר ובכותרת ברירת המחדל) שונה מ-"מסגרת" ל-**"טבלת פריסה"** — מתאר מיד את מה שהמשתמש תיאר ("סוג של טבלה").

**תוצאות בדיקה (Playwright):** בלוק "טבלת פריסה" חדש נוסף מה-picker → לחיצה אחת (אוטומטית בהוספה) חושפת בבת אחת: משפט ההסבר, בחירת "זה לצד זה"/"זה מעל זה", צבעים/תמונת-רקע/ריפוד, **וגם** "0 בלוקים" + "+ הוסף לכאן" + מצב-ריק — הכול יחד, בלי לחיצה נוספת. אומת חזותית (2 צילומי מסך, למעלה ולמטה של הפאנל). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-30 (המשך — "חזרה לעריכה" בדף שותף ציבורי + גבולות ל"טבלת פריסה")**

**1. "חזרה לעריכה" חסר בדף השותף הציבורי:** ל-`campaign-public-page.component` כבר יש דפוס קיים בדיוק לזה — `canEdit` (נבדק בשקט מול ה-endpoint המאומת/מוגן-בעלות, לעולם לא דרך דגל ב-URL) + פס "✏️ חזרה לעריכה". **הועתק** ל-`partner-public-page.component`: אחרי טעינת הדף הציבורי, אם קיים טוקן, נשלחת קריאה שקטה ל-`GET /api/entities/:id` (מוגן `requireEntityOwnership()`, אותה קריאה שה-Builder עצמו כבר משתמש בה) — הצלחה = `canEdit=true` ומוצג פס "אתה צופה בדף הציבורי של השותף שלך" + כפתור "✏️ חזרה לעריכה" ל-`/partners/:id/builder`. זר/אנונימי מקבל 401/403 בשקט, הפס לא מוצג.

**2. גבולות ל"טבלת פריסה":** נוספו ל-`ContainerBlockData`: `borderWidth`/`borderRadius` (למסגרת החיצונית, ברירת מחדל זהה להתנהגות הקיימת — ללא regression), ו-`childDividerColor`/`childDividerWidth` (**קו הפרדה בין הבלוקים עצמם**, נפרד לגמרי מהמסגרת החיצונית — `border-inline-end`/`border-bottom` על כל ילד חוץ מהאחרון, לפי כיוון שורה/עמודה, כדי לתמוך גם ב-RTL נכון). בעורך: סליידרי עובי/רדיוס מוצגים רק כשיש בפועל צבע מסגרת חיצונית; color-picker + סליידר עובי לגבול הפנימי מוצגים רק כשנבחר צבע.

**תוצאות בדיקה (Playwright, כולל אינטראקציה אמיתית עם ה-color-picker):** דף שותף ציבורי כמנהל מחובר → פס "חזרה לעריכה" מוצג עם הטקסט הנכון, לחיצה מנווטת בחזרה ל-Builder. בלוק "טבלת פריסה" → בחירת צבע ל"מסגרת חיצונית" (קליק על `.cp-trigger` → בחירת swatch) → סליידרי "עובי מסגרת"/"עיגול פינות" מופיעים מיד; אותו דבר עבור "גבול בין הבלוקים" → "עובי הגבול הפנימי" מופיע. אומת חזותית (כל הפקדים מוצגים יחד, מסודר). אפס שגיאות קונסול, `ng build --configuration development` נקי, נתוני test נוקו.

---

**2026-07-30 (המשך — פישוט נוסף ל"טבלת פריסה" + הסרת פס "אודות" מיותר)**

**1. שני "פסים אפורים" ב"טבלת פריסה":** אובחנו בדיוק (Playwright, בדיקת `border-top`/`border-bottom` בפועל ב-DOM): (א) `.editor-divider` הגנרי שמופיע אחרי "שם הבלוק" עבור **כל** סוג בלוק, (ב) `border-top` קבוע שהיה על `.container-editor` עצמו. שניהם הוסרו/הותנו עבור בלוק container: ה-`.editor-divider` הגנרי מוצג רק כש-`block.type !== 'container'`, וה-`border-top` של `.container-editor` הוסר לגמרי (במקום זאת הכרטיס מקבל את המסגרת שלו מה-wrapper החדש, ראה סעיף הבא).

**2. סדר האלמנטים הוחלף + נכנס ל"פאנל עיצוב":** לפי בקשת המשתמש — "יש לנו שני בלוקים: בלוק אחד של האלמנטים שמרכיבים את הטבלה, ומתחת בלוק של העיצוב". **בוצע:** עץ-הילדים (ה"+ הוסף לכאן" + רשימת הבלוקים) **הועבר להיות ראשון**, מיד אחרי שדה "שם הבלוק". **מתחתיו** — כל הגדרות העיצוב הקיימות (הסבר, כיוון, חלוקת-רוחב, צבעים, עובי/רדיוס מסגרת, גבול פנימי, תמונת רקע, ריפוד/מרווח) עברו לתוך `.container-design-section` **חדש** — פאנל מתקפל בדיוק כמו "רקע הדף"/"צבעי תמה" הקיימים (`toggleSection`/`isSectionCollapsed`, עם מפתח ייחודי לכל בלוק: `'container-design-' + block.id`, כי יכולים להיות כמה "טבלאות פריסה" בעמוד אחד). **הפאנל מתחיל מקופל כברירת מחדל** — פחות בלגן בעין, בדיוק כמבוקש; המשתמש פותח אותו רק כשבאמת רוצה לגעת בעיצוב.

**3. פס "אודות" מיותר בדף הציבורי:** ל-Partner/CampaignPartner, שורת הניווט העליונה (`<nav class="campaign-nav">`) הייתה יכולה להכיל **רק** קישור "אודות" (donate/ambassador לא רלוונטיים במודל הזה כלל) — פס שלם להצגת קישור אחד. **הוסר לגמרי** (גם הגרסה למחשב וגם התפריט הנייד) עבור `!isCampaign(draft)` — עמוד שותף/השתתפות הוא עמוד קצר וגלילה אחת, לא צריך ניווט פנימי.

**תוצאות בדיקה (Playwright):** בדיקת DOM order בפועל אישרה סדר `editor-field (שם) → container-children-tree → container-design-section → spacing-editor`; הפאנל אכן מקופל כברירת מחדל (`.container-editor` לא קיים ב-DOM עד שנפתח בלחיצה). דף שותף ציבורי — `document.querySelectorAll('.campaign-nav').length === 0`. אומת גם חזותית (2 צילומי מסך: מצב מקופל + מצב פתוח, ללא אף קו אפור מיותר; ודף ציבורי בלי פס אודות, עם פס "חזרה לעריכה" עדיין מוצג נכון מהתיקון הקודם). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-30 (המשך — regression מהתיקון הקודם + מרווחים חיצוניים לתוך "עיצוב")**

**באג אמיתי שנגרם ע"י התיקון הקודם באותו יום:** העברת `container-children-tree` **לתוך** `.block-editor` (כדי שיופיע ראשון) יצרה תלות לא-רצויה ב-`editingBlockId` של הבלוק עצמו. לחיצה על "+ הוסף לכאן" מזיזה את `editingBlockId` ל**ילד** החדש (כדי לפתוח את העורך שלו) — מה שסגר בטעות את `.block-editor` של ה**הורה** (הטבלה) על כל תוכנו, כולל עץ-הילדים שהמשתמש בדיוק ניסה להשתמש בו כדי להוסיף עוד בלוק. בעצם, כל לחיצה על "+ הוסף לכאן" "סגרה" ויזואלית את הפאנל.

**תוקן:** `container-children-tree` הוחזר להיות **אח (sibling)** של `.block-editor`, לא צאצא שלו — ממוקם **לפני** `.block-editor` ב-DOM (כדי לשמור על הסדר "ילדים קודם"), אבל תלוי **אך ורק** ב-`getContainerViewState(id)` — בלתי-תלוי לגמרי ב-`editingBlockId`. עכשיו: לחיצה על "+ הוסף לכאן" פותחת את העורך של הילד החדש (מצופה ורצוי), אבל עץ-הילדים של ההורה **נשאר גלוי** לאורך כל הדרך — אפשר להוסיף בלוק אחרי בלוק ברצף בלי שהפאנל "נעלם".

**"מרווחים חיצוניים" (spacingTop/spacingBottom) הוכנסו ל"עיצוב":** הסקשן הגנרי הזה (קיים לכל סוג בלוק) הוסתר במפורש עבור container (`*ngIf="block.type !== 'container'"`), ואותם סליידרים בדיוק נוספו **בתוך** `.container-editor` (בתוך פאנל "עיצוב" המתקפל), מיד אחרי "ריפוד"/"מרווח בין בלוקים" — כך שכל בקרות המרווח/גודל של הטבלה מרוכזות במקום אחד, לא מפוזרות בין הפאנל הכללי לסקשן נפרד בתחתית.

**תוצאות בדיקה (Playwright):** נוסף בלוק "טבלת פריסה" → נפתח פאנל "עיצוב" → אומת ש"מרווחים חיצוניים" מופיע **בתוכו** (`spacingInDesignPanel:1`) וש**אינו** כפול בסקשן הגנרי (`genericSpacingHidden:0`). נלחץ "+ הוסף לכאן" והוסף בלוק טקסט — עץ הילדים נשאר גלוי, המונה עדכן ל-"1 בלוקים". נלחץ שוב והוסף בלוק תמונה — עץ הילדים **עדיין** גלוי, המונה עדכן ל-"2 בלוקים" (לפני התיקון זה היה נכשל). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-30 (המשך — "שם הבלוק" למעלה + טוגל כיוון ישיר בעץ-הילדים + כפתור "חזרה לעריכה" בתצוגה מלאה)**

**1. שדה "שם הבלוק" הועבר להיות הראשון בפאנל:** עבור בלוק container בלבד, שדה "שם הבלוק (לצורך זיהוי)" הוצא **מתוך** `.block-editor` (שם היה תלוי ב-`editingBlockId`, אחרי עץ-הילדים) והפך ל-`.container-name-field` **חדש** — אח (sibling) עצמאי, ממוקם **לפני** `container-children-tree`, תלוי אך ורק ב-`getContainerViewState(id)` (אותה עקרון בדיוק כמו עץ-הילדים עצמו — לא ייעלם כש-`editingBlockId` עובר לילד). השדה המקורי בתוך `.block-editor` הוסתר עבור container (`*ngIf="block.type !== 'container'"`) כדי לא להכפיל.

**2. "זה מעל זה" בכותרת עץ-הילדים הפך מטקסט לטוגל אמיתי:** במקום להראות רק כתובית read-only, נוספו שני כפתורי טוגל קומפקטיים (☰ / ⬛⬜) שקוראים ישירות ל-`updateContainerField(id,'direction',...)` — כך שאפשר להחליף בין "זה מעל זה"/"זה לצד זה" **בלי לפתוח את פאנל "עיצוב" המקופל** בכלל. הטוגל המלא (עם התוויות המפורטות) נשאר גם בתוך פאנל "עיצוב" — שתי נקודות כניסה לאותו state, לא כפילות סותרת.

**3. כפתור "חזרה לעריכה" בתצוגה מלאה — היה קיים ב-Campaign Studio (`campaign-studio-topbar.component`) אבל חסר בשני ה-Builders של Partner:** נוסף ל-`partner-builder-page.component` וגם ל-`campaign-partner-builder-page.component` — אותו דפוס בדיוק: כש-`s.fullscreen===true`, הכותרת הרגילה מוחלפת בכפתור "◄ חזרה לעריכה" בפינה הימנית-עליונה (חלק מ-`.pb-title-group`/`.cpb-topbar-title`), קורא ל-`toggleFullscreen()` כדי לצאת חזרה לתצוגה מפוצלת.

**תוצאות בדיקה (Playwright):** DOM order בפועל: `block-header → container-name-field → container-children-tree → block-editor` (השדה אכן ראשון). עדכון השדה החדש עדכן את `block.label` בפועל (מופיע ב-`.block-user-label`). לחיצה על טוגל "⬛⬜" בעץ-הילדים שינתה state בפועל — גם `active` על הטוגל העליון וגם על הטוגל בפאנל "עיצוב" (אותו state). כפתור "חזרה לעריכה": נעדר במצב רגיל, מופיע בתצוגה מלאה, לחיצה יוצאת בהצלחה מהתצוגה המלאה (`.pb-page--fullscreen` נעלם). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — הטוגל בעץ-הילדים לא היה ברור, הוחלף לטוגל טקסטואלי)**

**בעיה:** הטוגל שנוסף בסבב הקודם (☰/⬛⬜, שני כפתורי-אייקון קטנים וצפופים) לא היה מספיק ברור — לא נראה כמו בקרה לחיצה, ולא הסביר מה כל אופציה עושה.

**תוקן:** הוחלף לגמרי לאותו סגנון `.direction-toggle`/`.direction-btn` שכבר קיים ומוכר בפאנל "עיצוב" (שני כפתורים לבנים ברוחב מלא, האקטיבי מודגש עם רקע לבן+צל, טקסט מלא בשני הכפתורים בו-זמנית) — הפעם עם ניסוח מפורש יותר: **"☰ הבלוקים אחד מתחת השני"** / **"⬛⬜ הבלוקים זה לצד זה"**, במקום הסימנים לבד. הכותרת שופצה לשתי שורות: שורה 1 = הטוגל ברוחב מלא, שורה 2 = מונה הבלוקים + "+ הוסף לכאן" (כמו קודם).

**תוצאות בדיקה (Playwright):** שני הכפתורים מציגים את הטקסט המלא כצפוי; הכפתור הפעיל בהתחלה הוא "אחד מתחת השני"; לחיצה על "זה לצד זה" מחליפה את ה-active בפועל. אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — הטוגל העליון הוחלף שוב, הפעם לזהות מלאה עם "סידור הבלוקים")**

**המשתמש ביקש עקביות:** הטוגל העליון (בכותרת עץ-הילדים) יהיה **בדיוק** אותו דבר כמו הטוגל הקיים תחת "סידור הבלוקים" בפאנל "עיצוב" — לא ניסוח דומה, אלא זהה. הוחלף ה-markup לחלוטין: אותם שני ה-SVG icons (פסים אופקיים/אנכיים בשקיפות יורדת) ואותו נוסח מדויק — **"זה מעל זה (עמודה)"** / **"זה לצד זה (שורה)"** — במקום "☰ הבלוקים אחד מתחת השני" / "⬛⬜ הבלוקים זה לצד זה" מהסבב הקודם. שני הטוגלים ממשיכים לקרוא לאותו `updateContainerField(id,'direction',...)`, כך שהם תמיד מסונכרנים.

**תוצאות בדיקה (Playwright):** טקסט הכפתורים בטוגל העליון ובטוגל התחתון זהה מילה במילה. לחיצה על הטוגל העליון עדכנה גם את ה-`active` בטוגל התחתון (אותו state). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — גרירה-והשלכה (drag & drop) מה"הוסף בלוק" אל התצוגה החיה, כולל גרירת-מיקום-מחדש לבלוקים קיימים)**

**הבקשה:** אפשרות לגרור בלוק ישירות מה-picker (עליון/תחתון/מיני-picker בתוך container) אל מיקום מדויק בתצוגה החיה (preview) — לא רק "+ הוסף בלוק"/"+ הוסף לכאן" שמוסיפים תמיד בסוף. בהמשך, המשתמש גם ביקש (אחרי שבדק בעצמו) אפשרות לגרור **בלוקים קיימים** כדי להחליף סדר ביניהם.

**ארכיטקטורה:**
1. **State חדש ב-`CampaignStudioStateService`:** `draggedBlockType$`/`setDraggedBlockType` (סוג בלוק חדש מה-picker) ו-`draggedExistingBlockId$`/`setDraggedExistingBlockId` (id של בלוק קיים שנגרר) — שני State-ים בלעדיים זה לזה (הפעלת אחד מאפסת את השני). `focusBlockRequest$` — "one-shot" request שנשלח אחרי הוספה מוצלחת כדי שהעורך (`campaign-page-builder-step`) יפתח את הבלוק החדש (קורא ל-`openNewBlockEditor` הקיים).
2. **`insertBlockAt(type, parentId, index)`** — יוצר בלוק חדש **בדיוק** במיקום הנתון בתוך scope (רמה עליונה/תוך container ספציפי), במקום להוסיף תמיד בסוף. משייך מחדש `order` לכל ה-scope (1..N) כדי שהמיקום יהיה חד-משמעי בלי תלות בפערים קודמים ב-`order`.
3. **`moveBlockTo(id, parentId, index)`** — אותו רעיון עבור בלוק **קיים**: מנתק אותו מהקונטיינר הישן שלו (אם היה), מחשב מחדש `order` בתוך ה-scope החדש. כולל תיקון "index shift" קלאסי כשמזיזים בתוך אותו scope (המיקום שחושב כלל את הבלוק הנגרר עצמו לפני ההסרה, לכן מפחיתים 1 אם המיקום הישן קטן מהיעד). מוגן ע"י `isSameOrDescendant` — אי אפשר לשחרר קונטיינר לתוך עצמו/אחד מילדיו.
4. **`resolveDropTarget()` ב-`campaign-preview.component.ts`** — hit-testing על `document.elementFromPoint(x,y)`, קורא תגיות `data-block-id`/`data-parent-id`/`data-container-body`/`data-empty-container` שנוספו לכל ה-wrappers הרלוונטיים (block-wrap בכל 5 מסלולי הרינדור השונים — standard/magazine, sidebar main/fallback, sidebar rail, below-sidebar — וגם container-child). מחשב אם הנקודה קרובה יותר ל"לפני"/"אחרי" הבלוק שנמצא (חצי עליון/תחתון לעמודה, ימני/שמאלי ל-row עם תשומת לב ל-RTL: אינדקס 0 מוצג הכי ימני), או "לתוך" קונטיינר (אם נחתה ישירות על ה-`data-container-body` או על placeholder ריק). Fallback: כלום לא זוהה → הוספה בסוף ה-scope השטוח.
5. **מקור הגרירה:** ה-picker items (`draggable`+`dragstart`/`dragend`) לבלוק **חדש**; ידית גרירה ייעודית (⋮⋮, `.block-drag-handle`) בכותרת כל בלוק ב-`campaign-page-builder-step` לבלוק **קיים** — ידית נפרדת (לא כל הכותרת) כדי לא להתנגש עם הקליק להרחבה/כיווץ או כפתורי הפעולה.
6. **אינדיקטור ויזואלי:** `div.dnd-drop-indicator` יחיד, `position:fixed`, ממוקם ישירות לפי `indicatorRect` (קואורדינטות viewport אמיתיות מ-`resolveDropTarget`) — לא תלוי בגלילה/מיקום ב-DOM. קו (line-h/line-v) להכנסה לפני/אחרי, מסגרת מקווקוות (box) להכנסה לתוך קונטיינר/placeholder ריק.

**שני באגים אמיתיים שנתפסו (חלקם ע"י המשתמש בעצמו בבדיקה חיה, לא ע"י ה-Playwright):**

1. **`order` של הבלוק החדש לא עודכן בפועל** — `insertBlockAt` בנה `orderById` נכון אבל `blocks.push(newBlock)` דחף את האובייקט המקורי (`order:0`) במקום הגרסה עם ה-`order` המחושב — התוצאה: כל בלוק חדש נדחק תמיד להתחלה בפועל, בלי קשר לאן שוחרר. תוקן: `blocks.push({ ...newBlock, order: orderById.get(id)! })`.
2. **גרירה למרחב ריק "מתחת" לבלוק קיים לא עבדה** ("אני רוצה לגרור אלמנט אחר מתחת לאלמנט הראשון - זה לא עובד, הוא מחייב אותי לגרור מעל/על האלמנט הראשון") — הסיבה: ה-`@HostListener('dragover'/'drop')` היו קשורים ל-**host element של הקומפוננטה עצמה** (`<app-campaign-preview>`), אבל השטח הריק **מתחת** לתוכן בפועל שייך ל-wrapper הגלילה של **הדף המארח** (`.pb-preview-card`/`.cpb-preview-card`/`.preview-inner`, תלוי בדף) — **מחוץ** לתת-העץ של `<app-campaign-preview>` לגמרי, כך שאירוע שם אף פעם לא "מבעבע" (bubble) לקומפוננטה. תוקן: הוחלף ל-`@HostListener('document:dragover'/'document:drop')` — גלובלי, לא תלוי ב-DOM subtree, ממשיך להשתמש ב-`elementFromPoint` בדיוק כמו קודם לזיהוי המטרה בפועל. גם `dragleave` הוחלף ל-`document:dragend` גלובלי (מנקה את האינדיקטור בכל סיום גרירה, כולל שחרור מחוץ לחלון/ביטול ב-Escape, ולא רק "יצאתי מהאלמנט").

**תוצאות בדיקה (Playwright, כולל דמוי DnD אמיתי ע"י דיספצ' ידני של DragEvent+DataTransfer משותף — הגרירה של Playwright עצמה לא מפעילה dragstart/dragover/drop אמיתיים):** בלוק חדש מה-picker בין שני בלוקים קיימים → סדר נכון; הוספה לרקע/מקום ריק → מתווסף בסוף; הוספה ל-placeholder ריק של container → הופך לילד שלו + נפתח העורך שלו אוטומטית (`focusBlockRequest$`); גרירת container בכיוון row (RTL) לצד ימני/שמאלי של ילד קיים → סדר נכון בשני הכיוונים; גרירת בלוק שני לתוך שטח ריק **מתחת** לבלוק יחיד קיים (התרחיש שנכשל) → מתווסף בהצלחה עכשיו; גרירת-מיקום-מחדש של בלוק קיים (ידית ⋮⋮) לתחילת הרשימה → סדר מתעדכן נכון. אומת גם ידנית מול קמפיין אמיתי וקיים (בזיכרון בלבד, בלי לחיצה על "שמירה" — שום דבר לא נשמר לשרת). אפס שגיאות קונסול חדשות. `ng build --configuration development` נקי. נתוני test (9 שותפי-QA) נוקו.

---

**2026-07-31 (המשך — גרירת בלוקים ישירות מתוך התצוגה החיה עצמה, לא רק מרשימת הבלוקים בעורך)**

**הבקשה:** "תן לי אפשרות לגרור אלמנטים שנמצאים על ה-PREVIEW לעלות אותם מעל אלמנט, או מתחתיו" — עד כה גרירת-מיקום-מחדש לבלוק קיים דרשה למצוא את השורה שלו ברשימת הבלוקים בעורך (ידית ⋮⋮ שם); המשתמש רוצה לתפוס בלוק ישירות איפה שהוא **רואה** אותו, בתצוגה החיה.

**מימוש:** נוספה `.preview-drag-handle` (⠿) — span קטן, `position:absolute` בפינה (top:6px, inset-inline-end:6px), `draggable="true"` — לכל אחד מ-6 אתרי ה-wrap ב-`campaign-preview.component.html` (אותם 6 אתרים שכבר קיבלו `data-block-id` בסבב הקודם: content-blocks, main-column, main fallback, sidebar rail, below-sidebar, container-child). מוסתר כברירת מחדל (`opacity:0`), מופיע רק ב-hover על הבלוק עצמו (`.block-wrap:hover .preview-drag-handle`) — כדי לא "להזדהם" חזותית עם התוכן האמיתי שמבקר יראה. `pointer-events:none` כשמוסתר, כדי לא לחסום מעבר עכבר לתוכן שמתחתיו.

`onExistingBlockDragStart`/`onExistingBlockDragEnd` בקומפוננטת ה-preview עצמה — קוראים לאותו `state.setDraggedExistingBlockId(...)` בדיוק כמו ידית ⋮⋮ בעורך (`onBlockDragStart` ב-`campaign-page-builder-step`) — אין הבדל מבחינת ה-drop target resolution (`resolveDropTarget`) בין "נגרר מהעורך" לבין "נגרר מהתצוגה עצמה"; שתי הידיות הן פשוט שני מקורות-גרירה שונים לאותו state משותף.

**תוצאות בדיקה (Playwright):** קיום הידית ב-DOM, `opacity:0` כברירת מחדל, `opacity:1` אחרי `page.hover()` אמיתי (סימולציית `mouseenter` ידנית לא מפעילה `:hover` אמיתי — נבדק גם ישירות עם CSS pseudo-class אמיתי כדי לוודא שזה לא false negative). גרירה מהידית של בלוק ראשון אל מתחת לבלוק אחרון → סדר מתעדכן נכון (הבלוק שנגרר עבר לסוף הרשימה). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — משוב משתמש: "הסמל לא ברור" + "הגרירה לא עובדת" על ידית התצוגה)**

**1. הסמל לא ברור:** התו היוניקוד "⠿" (Braille dots) שנבחר לידית לא בהכרח מרונדר בבירור בכל גופן/מערכת הפעלה. הוחלף ב-icon אמיתי מ-`lucide-angular` (שכבר בשימוש בכל שאר האפליקציה) — `GripVertical`, אותו icon בדיוק גם בידית של התצוגה החיה (`campaign-preview.component`) וגם בידית המקבילה בעורך עצמו (`campaign-page-builder-step` — הייתה "⋮⋮" טקסטואלי, גם היא הוחלפה לאותו icon לעקביות ויזואלית).

**2. הגרירה לא עובדת — באג אמיתי, לא רק תפיסה:** `.preview-drag-handle` היה מוגדר `pointer-events:none` כברירת מחדל ועובר ל-`auto` רק כש-`.block-wrap:hover` פעיל (`opacity`+`pointer-events` יחד). גרירת HTML5 טבעית דורשת mousedown+תזוזה קטנה **בפועל** על האלמנט כדי שהדפדפן "יתחיל" רשמית drag session — ומאחר שהידית קטנה (26×22px במקור), התזוזה הראשונית הקטנה הזו יכולה בקלות "לצאת" מהתחום הקטן הזה עוד לפני שהדפדפן הספיק להתחייב לגרירה, מה שגורם ל-`:hover` (ולכן ל-`pointer-events`) לחזור ל-`none` **באמצע המחווה** ולבטל את הגרירה בשקט. **תוקן:** `pointer-events` נשאר תמיד `auto` (לא תלוי ב-hover יותר) — ה-`opacity` בלבד עושה את התפקיד של "מוצג רק ב-hover", בלי לסכן את אמינות הגרירה. גם הוגדל מ-26×22 ל-34×30 (מטרה יותר סלחנית לאצבע/עכבר).

**מגבלת בדיקה (תועד לשקיפות):** דיספצ' ידני של DragEvent הוכיח שה-handlers עצמם (`onExistingBlockDragStart`, `resolveDropTarget`, `onPreviewDrop`) נכונים — אבל גם `page.mouse` הגולמי של Playwright וגם `locator.dragTo()` הייעודי לא הצליחו לגרום לאירוע `drop` אמיתי להיווצר בסימולציה של גרירה טבעית (HTML5 `draggable`), למרות ש-`dragover` כן נורה, כולל `preventDefault()` נכון וזיהוי יעד נכון — מגבלה ידועה של Playwright/CDP בסימולציית drag-and-drop טבעי, לא התנהגות שניתן לשחזר אצל משתמש אמיתי עם עכבר אמיתי. כלומר: התיקון עצמו (הסרת התלות ב-hover) מבוסס על ניתוח קוד קונקרטי, לא על "בדיקה שעברה" — יש לאמת בדפדפן אמיתי.

**תוצאות בדיקה (Playwright + הודאה במגבלה):** אימות ויזואלי (צילום מסך) של האייקון החדש — ברור ומזוהה כידית גרירה. אימות שהמנגנון הפנימי (event handlers, hit-testing, resolveDropTarget) עובד נכון. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — עוד באג אמיתי בגרירה + מרכוז האייקון בפועל)**

**המשתמש המשיך לדווח שהגרירה לא עובדת, עם רמז מדויק:** "אולי האייקון של הגרירה נגרר, האלמנט עצמו, הבלוק, לא נגרר." זה הוביל לבדיקה ממוקדת יותר, וחשפה **עוד** באג אמיתי, בלתי-תלוי בקודם:

**`dropEffect` קבוע ל-`'copy'` בלי קשר לסוג הגרירה:** `onPreviewDragOver` הגדיר תמיד `event.dataTransfer.dropEffect = 'copy'` — אבל `onExistingBlockDragStart`/`onBlockDragStart` (גרירת בלוק **קיים**, בין אם מהידית בתצוגה או מהעורך) מגדירים `effectAllowed = 'move'`, לא `'copy'`. לפי מפרט ה-HTML5 Drag & Drop, `dropEffect` שנקבע ב-`dragover` **חייב** להיות אחד מהערכים המותרים ב-`effectAllowed` שהוגדר ב-`dragstart` — אחרת חלק מהדפדפנים פשוט **לא יורים את אירוע `drop`** בכלל, גם אם `dragover` עצמו נורה כרגיל וגם אם `preventDefault()` נקרא נכון (בדיוק התסמין שהיה: הכל "נראה" תקין מבפנים, אבל שום דבר לא זז בפועל). **תוקן:** `dropEffect` נגזר עכשיו לפי סוג הגרירה בפועל — `'move'` כשגוררים בלוק קיים (`draggingExistingId`), `'copy'` כשגוררים סוג חדש מה-picker.

**הנקודות באייקון לא היו ממורכזות בפועל (סעיף 2 בבקשת המשתמש):** נמדד ישירות (`getBoundingClientRect`) — פער של 5px מעל מול 11px מתחת (לא סימטרי אנכית, אף שהאופקי כן היה תקין). הסיבה: ה-host element של `<lucide-icon>` לא ממלא את ציר-הרוחב הצולב (cross-axis) של ה-flex container שלו כברירת מחדל, מה שהשאיר אותו תלוי בהתנהגות inline/baseline לא-חזויה. **תוקן:** `.preview-drag-handle lucide-icon`/`.block-drag-handle lucide-icon` הופכים במפורש ל-flex box תואם-גודל לאייקון עצמו (`width/height:16px`/`14px` + `display:flex; align-items/justify-content:center`), כך שהמרכוז לא תלוי בהתנהגות ברירת המחדל.

**תוצאות בדיקה (Playwright):** מדידת מרכוז מדויקת אחרי התיקון — 10px/10px אופקית, 8px/8px אנכית (סימטרי לחלוטין, לעומת 5px/11px לפני). גרירה מדומה (DragEvent+DataTransfer משותף) עדיין מציגה סדר נכון אחרי התיקון. כמו בסבב הקודם — Playwright לא יכול לאשר סופית את תיקון ה-`dropEffect` מול גרירת HTML5 **אמיתית** (מגבלת CDP ידועה), כך שהתיקון מבוסס על ניתוח קונקרטי של מפרט ה-Drag & Drop, לא על "בדיקה שעברה" בלבד — נדרש אישור בדפדפן אמיתי. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — עיצוב כותרת לבלוק טקסט + שליטה נפרדת ברוחב/גובה תמונה)**

**1. עיצוב כותרת (בלוק "טקסט"):** ל-`RichTextBlockData` נוסף `headingStyle?: TextStyle` (אותו מודל בדיוק שכבר משמש Hero/CTA — align/color/fontSize/position). ב-`campaign-page-builder-step`, כשיש `block.label` (הכותרת שמוצגת בפועל בדף — ראו `.section-heading`), מופיע `<app-text-style-editor>` (`showPosition=false`, `showCta=false` — אין צורך בהם כאן) עם ברירת מחדל שמשקפת בדיוק את המראה הקבוע הקיים היום (`align:center, fontSize:'lg'→22px, color:''→primaryColor`), כך שאף בלוק קיים לא "קופץ" חזותית עד שהמשתמש בפועל משנה משהו. ב-preview, `.section-heading` (משותף ל-rich-text/video/gallery) מקבל את הסטייל הזה **רק** עבור rich-text — video/gallery ממשיכים עם המראה הקבוע הקודם, כבקשת המשתמש שדיבר ספציפית על "בלוק של טקסט".

**2. שליטה נפרדת ברוחב/גובה תמונה:** "רוחב התמונה" (widthPercent, 20-100%) הקיים **נשאר בדיוק כפי שהוא** — עדיין גורר גם רוחב וגם גובה יחד (יחס-הגובה-רוחב הטבעי של הדפדפן, ללא שינוי, כמבוקש מפורשות: "תשאיר את זה"). נוסף `heightPx?: number` **עצמאי** ל-`ImageBlockData` — סליידר "גובה התמונה" נפרד (80-600px, ברירת מחדל "אוטומטי"). כשמוגדר, ה-`<img>` מקבל `height:Npx; object-fit:cover` — התמונה נחתכת כדי למלא בדיוק את הגובה שנבחר, בלי קשר לרוחב שנקבע בנפרד ב-widthPercent. כפתור "↺ גובה אוטומטי" מנקה את `heightPx` וחוזר בדיוק להתנהגות המקורית (ללא `height`/`object-fit` בכלל).

**תוצאות בדיקה (Playwright):** כותרת — ברירת המחדל תואמת בדיוק את הקיים (`textAlign:center, fontSize:22px`) לפני כל שינוי; אחרי בחירת "שמאל"+"XL" בעורך → `textAlign:left, fontSize:28px` בפועל בתצוגה. תמונה — לפני הזזת סליידר הגובה: אין `style.height`/`objectFit` בכלל (זהה להתנהגות הקיימת); אחרי הזזה ל-400 → `height:400px; objectFit:cover` בפועל (`computedHeight:400px`); לחיצה על "גובה אוטומטי" → חוזר בדיוק למצב הריק. אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — פאנל "עיצוב הכותרת" הועבר מיד אחרי שדה הכותרת)**

**בקשת המשתמש:** הפאנל יופיע **מיד אחרי הכותרת עצמה** (לא אחרי עורך התוכן/מרווח שורות כמו שהיה), סגור כברירת מחדל. הועבר להיות בתוך אותו `.editor-field` של שדה "כותרת" עצמו — מיד אחרי שדה הקלט, לפני ה-divider שמפריד לשאר עורך הבלוק. הסגירה-כברירת-מחדל כבר הייתה קיימת (`app-text-style-editor`'s own `expanded=false`) — לא נדרש שינוי נוסף שם.

**תוצאות בדיקה (Playwright):** אימות DOM בפועל — `<app-text-style-editor>` נמצא בתוך אותו `.editor-field` כמו שדה הכותרת (`tseIsInsideLabelField:true`), ו-`.tse-body` (התוכן המורחב) לא קיים ב-DOM כלל לפני לחיצה (`tseBodyExists:false`) — מאומת סגור כברירת מחדל. אומת גם חזותית. אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — קישורים בטקסט עשיר נפתחים בטאב חדש)**

**הבעיה:** בעורך הטקסט העשיר (`rich-text-editor.component.ts`, מבוסס TipTap), כפתור "🔗" (הוספת קישור) יצר `<a href="...">` רגיל — לפי ברירת המחדל של TipTap, בלי `target="_blank"`. קליק על קישור חיצוני בתוך טקסט קמפיין היה מנווט את התורם/המבקר **הרחק מדף התרומה עצמו**.

**תוקן בשתי שכבות:**
1. **מקור (עורך):** `Link.configure(...)` קיבל `HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' }` — כל קישור **חדש** שנוצר מעכשיו כולל את זה ישירות ב-HTML הנשמר.
2. **הגנה בתצוגה (preview):** `safeHtml()` ב-`campaign-preview.component.ts` עבר דרך `forceLinksNewTab()` חדשה — פרסור ה-HTML ל-DOM זמני, אכיפת `target="_blank" rel="noopener noreferrer"` על **כל** `<a href>` שנמצא, ואז סריאליזציה בחזרה. זה מכסה גם בלוקים ישנים שכבר נשמרו **לפני** התיקון (שהקישורים שלהם לא כוללים את התכונה בכלל) — לא רק תוכן חדש.

**תוצאות בדיקה (Playwright):** הקלדת טקסט + סימונו + לחיצה על "🔗" בעורך → הקישור שנוצר בפועל כולל `target="_blank" rel="noopener noreferrer"`, גם בתוכן הגולמי של העורך וגם בתצוגה החיה. אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — פריסת שלושה-אזורים לעורך הבלוקים: החנות / תוכן הדף / עיצוב כללי)**

**הבעיה:** "יש בלגן בעין" — שלושה חלקים מרכזיים (picker הבלוקים הניתנים-להוספה, עץ הבלוקים בפועל שכבר בדף, והגדרות עיצוב כלליות בתחתית) זרמו כאחד ברצף אחיד, בלי הפרדה חזותית ברורה, ובנוסף ה-picker הופיע **פעמיים** (למעלה ולמטה, אחרי כל הגדרות העיצוב) — מה שהחמיר את התחושה שאין סדר ברור.

**פתרון — שלושה פאנלים נפרדים, נפתחים/נסגרים, עם כותרת וצבע ייחודי לכל אחד** (לפי בקשה מפורשת: "תעשה ששלושת החלקים האלה הם כמו פאנלים... עם כותרת ברורה"):
1. **🧱 "הוסיפו בלוקים לדף" (החנות)** — סגור כברירת מחדל, גוון סגול (תואם את כפתור ההוספה הקיים). הכותרת עצמה **היא** כפתור הפתיחה/סגירה (`showBlockPicker` ישירות) — לא כפתור נפרד בתוך הפאנל, כדי לא ליצור שני מתגים לאותה פעולה.
2. **📄 "תוכן הדף"** — **פתוח כברירת מחדל** (הדבר המרכזי שהמנהל בא לראות), גוון כחול בהיר, כולל תג-ספירה חי ("X בלוקים") וטקסט מצב-ריק ("עדיין אין בלוקים בדף — הוסיפו את הראשון מהחנות שמעל ⬆️") כשאין בלוקים.
3. **🎨 "עיצוב כללי"** — סגור כברירת מחדל, גוון ענבר/כתום, עוטף את כל תתי-הסעיפים הקיימים (טקסטי Hero/צבעי תמה/רקע/פוטר) ללא שינוי בהם עצמם — רק שכבת-עטיפה חדשה שממסגרת אותם כקטגוריה אחת ברורה.

ה-picker **הכפול** (למטה, אחרי כל הגדרות העיצוב) **הוסר לגמרי** — כפתור אחד ב"חנות" בראש הפאנל מספיק, ופותר את חוסר-הסדר של "למה יש שני מקומות להוסיף בלוק."

**מימוש טכני:** שלוש עטיפות `.builder-zone` חדשות (`--store`/`--content`/`--design`, כל אחת עם `border`/`background` צבעוניים משלה), כותרת אחידה (`.builder-zone-header`: אייקון + כותרת + [ספירה] + שברון) שקוראת ל-`toggleSection('zone-content'/'zone-design')` (אותו מנגנון `expandedSections`/`isSectionCollapsed` הגנרי הקיים — עכשיו עם `'zone-content'` **מוזרע מראש** לתוך ה-`Set` הראשוני כדי שיתחיל פתוח, בניגוד לכל שאר המפתחות שמתחילים סגורים).

**תוצאות בדיקה (Playwright):** אומתו 3 הפאנלים קיימים עם המחלקות הנכונות; מצב התחלתי — חנות סגורה, תוכן-הדף **פתוח**, עיצוב סגור (בדיוק כמתוכנן); טקסט מצב-ריק מוצג נכון; הוספת בלוק → תג-הספירה מתעדכן ל"1 בלוקים" והבלוק מופיע בפועל בתוך אזור "תוכן הדף"; פתיחת "עיצוב כללי" → 4 תתי-הסעיפים מופיעים. אומת גם חזותית (2 צילומי מסך: מצב ריק עם 3 הפאנלים בצבעים נבדלים, ומצב אחרי הוספה+פתיחה). אפס שגיאות קונסול. `ng build --configuration development` נקי (כולל אימות שקינון ה-`ng-container`/`div` תקין - שגיאת template הייתה נתפסת ב-build). נתוני test נוקו.

---

**2026-07-31 (המשך — רמז שימוש בפאנל "הוסיפו בלוקים" + אימות גרירה-לתוך-container)**

**1. רמז ("טולטיפ") בפאנל "הוסיפו בלוקים":** כשה-picker נפתח, מופיע כעת `.picker-hint` — שורת טקסט קצרה בגוון סגול תואם ("💡 גררו בלוק ישירות למיקום הרצוי בתצוגה שמימין, או פשוט לחצו עליו כדי להוסיף אותו בסוף הדף") מיד מעל רשת הבלוקים — כדי ששני נתיבי ההוספה (גרירה למיקום מדויק / קליק להוספה מהירה בסוף) יהיו גלויים וברורים, לא רק מובנים-מאליהם.

**2. אימות: גרירת שני בלוקים לתוך "טבלת פריסה" חדשה:** המשתמש ביקש לוודא שהמנגנון הקיים (drag-and-drop לתוך container, שנבנה בסבבים קודמים) עובד בפועל לתרחיש הקונקרטי הזה. **אין צורך בשינוי קוד** — נבדק ישירות ועובד כבר כמצופה: container חדש נוצר עם `direction:'column'` (זה מעל זה) כברירת מחדל; גרירת שני בלוקים חדשים (מה-picker) ישירות לתוך ה-placeholder הריק של הקונטיינר → שניהם נכנסים כילדים שלו (`2 בלוקים`), מוצגים stacked (`flexDirection:'column'` בפועל); לחיצה על "זה לצד זה" בטוגל העליון → אותם שני בלוקים עוברים ל-`flexDirection:'row'` (side-by-side) מיידית, בלי לגרור מחדש.

**תוצאות בדיקה (Playwright):** `hintText` מאומת; `defaultDirection:'column'` על container חדש; `childCountAfter:2` אחרי שתי גרירות נפרדות לתוך אותו placeholder; `stackedLayout:'column'` לפני המעבר, `rowLayout:'row'` אחריו. אומת גם חזותית (צילום מסך מראה את שני הבלוקים בפועל בתוך "טבלת פריסה", "2 בלוקים"). אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — קו מקווקו סביב "טבלת פריסה" בתצוגה החיה, עריכה-בלבד)**

**הבקשה:** קו מקווקו סביב כל container בתצוגה, כדי שהמשתמש יבין מיד "יש כאן טבלת פריסה — אפשר לגרור לתוכה".

**מימוש:** `[class.block-container--zone]="pageBuilderActive"` על `.block-container` ב-`campaign-preview.component.html` (חל אוטומטית על **כל** container, כולל מקוננים, כי זה אותו template רקורסיבי) — `outline: 1.5px dashed #c4b5fd` דרך `outline` ולא `border`, בכוונה: `outline` יושב מחוץ למודל הקופסה לגמרי ולא מתנגש עם `border` שהמשתמש עצמו בוחר בפאנל העיצוב (צבע/עובי מסגרת לדף הציבורי). מוצג **תמיד** כשנמצאים בבילדר (לא רק בזמן גרירה בפועל) — הרעיון הוא שהמנהל יזהה "זה אזור-הכנסה" גם לפני שהוא מתחיל לגרור משהו. מוסתר לגמרי מהמבקר האמיתי בדף הציבורי (מותנה ב-`pageBuilderActive`, בדיוק כמו שאר תגיות ה-`data-*` שכבר נוספו לצורך הגרירה).

**תוצאות בדיקה (Playwright):** `outlineStyle:'dashed', outlineColor:'rgb(196,181,253)'` (הסגול של המותג), `hasZoneClass:true` על container חדש. אומת גם חזותית — קו מקווקו סגול ברור סביב אזור ה-placeholder הריק. אפס שגיאות קונסול. `ng build --configuration development` נקי. נתוני test נוקו.

---

**2026-07-31 (המשך — אימות סופי: הקו המקווקו נעלם בדף הציבורי האמיתי)**

**המשתמש ביקש אישור מפורש** שהקו המקווקו הוא **עריכה-בלבד** ונעלם כשמציגים את הדף בפועל. במקום להסתפק בהצהרה, בוצע אימות end-to-end אמיתי: נוצר container בבילדר → `hasZoneClass:true, outlineStyle:'dashed'` → **נשמר בפועל** (לחיצה על "שמירה", לא רק state בזיכרון) → נטען הדף הציבורי האמיתי (`/partners/:id/view`, ללא הרשאות עריכה) → `hasZoneClass:false, outlineStyle:'none'`. מאומת גם חזותית — צילום מסך של הדף הציבורי מראה עמוד נקי לגמרי, בלי שום עקבות לקו המקווקו או ל-placeholder הריק (שגם הוא מותנה `pageBuilderActive`). נתוני test (כולל השותף השמור) נוקו.

---

**2026-07-31 (המשך — יצירת דף שותף בעזרת AI, על גבי הצינור הקיים של "יצירת קמפיין עם AI")**

**הבקשה:** להרחיב את `/campaigns/create/ai` (extract-documents → Brief → Draft) כך שיתמוך גם ביצירת **דף שותף עסקי**, לא רק קמפיין — מסמך/תמונה של עסק (PDF, JPEG וכו') → דף שותף מוכן עם Hero + טקסט "אודות" + גלריה, בלי שהמנהל יצטרך להקליד הכל ידנית.

**החלטת מפתח: שימוש חוזר מלא בצינור הקיים, בלי לבנות משהו חדש.** בדיקה (agent חקירה) גילתה שהארכיטקטורה הקיימת כבר מפרידה בין "חילוץ עובדות" (`ExtractedFacts`, גנרי לגמרי) ל"כתיבת Brief" (הפרומפט היחיד שבאמת תלוי בהקשר — קמפיין=תרומה מול שותף=עסק) ל"בניית בלוקים" (100% בצד ה-frontend, גנרי לחלוטין, לא תלוי ב-ownerType). המשמעות: כל הלוגיקה של `applyStoryContent`/`interleaveStoryWithImages`/`addGalleryBlock` ב-`ai-campaign-creation-page.component.ts` נעשית שימוש חוזר **בלי שינוי אחד** — רק שכבת ניתוב/UI חדשה סביבה.

**מימוש:**
- **Backend:** `targetType: 'campaign'|'partner'` מועבר מה-frontend דרך `extract-documents`/`refine-brief` עד ל-`briefBuilder.build()`, שבוחר בין `BRIEF_SYSTEM_PROMPT` (קמפיין) ל-`BRIEF_SYSTEM_PROMPT_PARTNER` (שותף) — פרומפט Hebrew מקביל מלא עם מסגור עסקי: `suggestedTargetAmount` תמיד null (לא רלוונטי), קריאות-לפעולה בלי שפת תרומה ("בקרו באתר שלנו"/"צרו קשר"), הסיפור מתאר את העסק עצמו (מסגרת "אודות" ירוקה-עד, לא appeal לתרומה), ו-`urgency` כמעט תמיד low/medium. אותה צורת JSON בדיוק כמו הפרומפט של קמפיין — Extraction עצמו לא צריך לדעת כלום על ה-targetType (Facts גנרי לגמרי).
- **Frontend:** route חדש `/partners/create/ai` (עם `authGuard` בלבד, לא `campaignEditorGuard` — כי משתמש שיוצר את השותף הראשון שלו עדיין אין לו role של entity-manager, וה-guard הרגיל היה חוסם אותו). אותו קומפוננטה בדיוק (`AiCampaignCreationPageComponent`) מזהה `creationMode:'partner'` לפי ה-URL, ומחביאה את בורר "קמפיין/עמותה חדשה/שניהם" ואת שדה "יעד גיוס" (שניהם לא רלוונטיים לשותף). יצירה בפועל: `createEntity()` + `addRole('partner')` (הרבה יותר פשוט מהאשף הרב-שדות של הקמת עמותה) → זריעת `draft.blocks = [heroBlock, storyBlock]` ידנית (כי `createInitialPartnerDraft()` מתחיל עם `blocks:[]`, בניגוד לקמפיין) → אותם helper methods הגנריים בונים את שאר הבלוקים → שמירה → ניווט ל-`/partners/:id/builder`.
- **UI entry point:** כפתור "🤖 צור בעזרת AI" ב-`partners-list-page` (גם בכותרת וגם ב-empty state) — בלי זה, ה-route היה קיים אבל בלתי-נגיש מהממשק.

**תוצאות בדיקה (Playwright, end-to-end אמיתי מול backend+DB אמיתיים):** קלט טקסט חופשי על עסק נגרות בדיוני → ה-UI הציג נכון מסך ייעודי ("✨ יצירת דף שותף עם AI") בלי בורר-מצב ובלי שדה יעד-גיוס → ה-Brief שחזר תיאר את העסק במסגרת "אודות" גנרית (לא תרומה) → אישור יצר entity אמיתי עם role `partner`, בנה draft עם 2 בלוקים (Hero + טקסט "אודות" עם התוכן שנוצר), שמר, וניווט ל-`/partners/:id/builder` בפועל — מאומת חזותית בצילום מסך של הבילדר האמיתי מציג את שם העסק ואת טקסט "אודות". אפס שגיאות קונסול. `ng build --configuration development` נקי (frontend). נתוני test (השותף שנוצר, וגם entity זמני נפרד לבדיקת הכפתור ב-partners-list-page) נוקו דרך `DELETE /api/entities/:id`.

---

**2026-08-04**

**Decision:** פרטי קשר של שותף (טלפון/מייל/לוגו) עורכים ב-**עמוד נפרד** (`/partners/:id/details`), לא בפאנל בתוך ה-Partner Builder.

**Reason:** ניסיון ראשון הטמיע פאנל "פרטי עסק" בתוך `partner-builder-page` — נדחה במפורש ("לא אוהב את הפיתרון"). הפרדה בין "פרטי קשר של הישות" (אדמיניסטרטיבי) לבין "תוכן הדף העסקי" (עיצוב/בלוקים) עקבית עם ההפרדה הקיימת בין Entity ל-Draft בכל שאר המערכת. גם חשף באג אמיתי: `entities.service.js#updateEntity` הוא **לא** partial patch — הוא דורס כל השדות (~30 עמודות) מכל מה שנשלח, כולל טיפול בשדה חסר כ-`null` מפורש. כל caller חייב לטעון את הישות המלאה ולשלוח אותה חזרה עם spread. ר' [`SESSION_2026-08-04_SUMMARY.md`](SESSION_2026-08-04_SUMMARY.md) §1.

---

**2026-08-04**

**Decision:** לוגו קמפיין תמיד מוצג בתוך עיגול (badge), אף פעם לא כפס/סטריפ צבעוני ברוחב מלא — גם במיקום "מעל" ה-Hero.

**Reason:** מיקום "מעל" השתמש בפס צבעוני ברוחב מלא (`.hm-logo-above-strip`), לא עקבי עם מיקומי "שמאל"/"מרכז" שכבר עיגול (`.hm-hero-org-logo`). לפי הנחיה מפורשת ("ובכלל. תמיד עיגול") — אותה שפה חזותית בכל מקום שהלוגו מופיע, בלי קשר למיקום שנבחר. ר' [`SESSION_2026-08-04_SUMMARY.md`](SESSION_2026-08-04_SUMMARY.md) §6.

---

**2026-08-04**

**Decision:** לפני שמניחים שדיווח "שיניתי X ולא קרה כלום" הוא באג בלוגיקה/בערכים — לבדוק קודם אם ה-CSS בכלל **קורא** את המשתנה.

**Reason:** נמצא פעמיים באותו סשן: בקרת "צבע אייקונים"/"רקע"/"מסגרת" בבלוק Stats הייתה קיימת בעורך ונשמרת ל-draft, אבל `.hm-stat-icon` ב-CSS היה עם ערכים קשיחים (`background:#ffffff`) שלא קראו מהמשתנה בכלל — זה מה ש"אייקון לבן נעלם" התברר להיות בפועל. אותו דבר בדיוק עם `--hm-logo-bg`: משתנה CSS שהוגדר ונקשר ב-template אבל אף selector לא צרך אותו, ובלי שום בקרת עורך בכלל. שני המקרים תוקנו באותו תבנית: חיווט המשתנה בפועל לתוך ה-CSS הצורך, פלוס טיפול מפורש ב-`'' → 'transparent'` (בינדינג ערך ריק ל-`[style.--x]` לא מפעיל נכון את ה-fallback של `var()`). ר' [`SESSION_2026-08-04_SUMMARY.md`](SESSION_2026-08-04_SUMMARY.md) §5.

---
