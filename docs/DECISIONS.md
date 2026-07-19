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
