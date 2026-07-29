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
