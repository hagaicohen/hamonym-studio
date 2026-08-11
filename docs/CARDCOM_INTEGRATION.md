# CARDCOM_INTEGRATION.md — Charging Engine: Design

**סטטוס:** Engineering Design, לא Architecture. מרחיב את `PAYMENTS_ARCHITECTURE_CONTEXT.md`, לא משנה אותו.
**תאריך:** 2026-08-09, עודכן לאחרונה 2026-08-11

## מצב נוכחי (2026-08-11) — קרא את זה קודם, לא את הפירוט הכרונולוגי למטה

**LowProfile (תשלום חד-פעמי) — v1 יציב, מוכח בפרודקשן, סגור.**

- Webhook (`POST /api/payment/webhook`) הוא **מקור האמת היחיד** לסטטוס תרומה. `handleReturn` (Return Redirect) הוא **UX בלבד** — לא כותב DB, לא מחליט paid/failed (Phase 2 הושלם).
- זרימה: `createDonation` (שולח `WebHookUrl` per-request) → CardCom → `payment.controller.js` → **ישירות** ל-`payment.handler.js` (**לא** דרך `webhook.dispatcher.js` — הוסר מהמסלול, ר' Architecture Change למטה) → `GetLpResult` → `markDonationPaid`.
- Idempotency מבוסס מפתח עסקי (`TranzactionId`→`LowProfileId`→hash קנוני), migration 043, **רץ ואומת**.
- Definition of Done מלא (9/9) אומת בפרודקשן על תרומה אמיתית: webhook הגיע, secret תקין, idempotency claim, `payment.handler` רץ, `GetLpResult` הצליח, `markDonationPaid` רץ, קבלה אחת בלבד, קמפיין עודכן פעם אחת בלבד, **retry אמיתי דרך ה-HTTP endpoint החי אומת** (`{"success":true,"duplicate":true}`, בלי side effects).
- **פתוח, לא דחוף:** Phase 2.5 Cleanup (הסרת `captureWebhookPayload` + לוג `WebHookUrl` הזמני, שניהם עדיין Instrumentation לגיטימי לא Debug leftovers). Receipt #35 (נוצרה מ-Bug שתוקן) — החלטה חשבונאית פתוחה, לא למחוק. `HAMONYM_CARDCOM_TERMINAL=1000` הוא טרמינל הדמו/בדיקה הכללי של CardCom — לוודא בעתיד שזה חשבון פרודקשן אמיתי.
- **לא התחיל:** MasterRecurring/DetailRecurring/Document (שלדי handler ריקים בלבד, endpoint נפרד עתידי, לא dispatcher משותף). Billing Engine (Tranzila MASAV).

**הפירוט הכרונולוגי למטה (מ-2026-08-09) משאיר את היסטוריית החקירה, אבל חלקים ממנו (בעיקר "Exit Criteria" ו-Production Checklist הישנים) תועדו *לפני* שהאימות המלא בפרודקשן קרה בפועל — הם הוחלפו במעשה, לא עודכנו checkbox-by-checkbox. אל תסתמך עליהם כמצב נוכחי, רק כהיסטוריה.**

---

## מה המסמך הזה כן

מבנה קוד ליישום ה-**Charging Engine** (תרומות דרך CardCom): Entry Points, Controllers, Services, Handlers, Domain Events, וחלוקת אחריות בין המחלקות.

## מה המסמך הזה לא

Database Schema, REST API מלא, Queue, Event Bus, Retry Mechanisms, UI. אלה יתוכננו בזמן המימוש, לא כאן.

**🔴 P1, אושר ותוקן 2026-08-11 — `handleReturn` סימן תרומה שנדחתה כ-`paid`:** תרומת ₪5,001 נדחתה בפועל ע"י CardCom (הודעת דחייה מוצגת לתורם: "לא ניתן לחייב כרטיס זה, אנא החלף כרטיס", מ-`secure.cardcom.solutions` עצמו). ה-Redirect שהגיע ל-`GET /api/donations/return` הכיל **גם** `status=failed` **וגם** `ResponseCode=0` (CardCom, לא סותר את עצמו בהכרח — כנראה ResponseCode כאן לא אומר מה שחשבנו). `handleReturn` הישן: `status==='success' || String(responseCode)==='0'` — ה-`||` גרם ל-`ResponseCode=0` לנצח את `status=failed`. **תוצאה בפועל:** donation סומן `paid`, קמפיין "קיץ כמו כולם" קיבל +₪5,001 ו-+1 תומך שגויים, **נוצרה קבלה אמיתית (מספר 35)**.

**תוקן:** `handleReturn` מסתמך אך ורק על `status` (איזה URL — Success/Failed — CardCom בחר, נקבע מראש על ידינו) — לא עוד על `responseCode` שהוכח לא אמין ב-Redirect. **מתויג TEMPORARY במפורש בקוד** — Redirect עדיין לא מקור אמת לשום דבר, גם לא ל-`status` באופן עקרוני; זה רק התיקון הזמין הכי אמין כל עוד `handleReturn` עדיין פעיל.

**נתונים תוקנו:** `donations` הוחזר ל-`failed`; `campaigns.current_amount`/`supporters_count` הוחזרו לערך הנכון (5205→204, 7→6). **`receipts` (מספר 35) — לא נגעתי בכוונה.** שאלה חשבונאית (מספור רץ, מסמך מבטל?) שדורשת החלטה נפרדת, לא טכנית.

> **TODO — Receipt #35 נוצרה בעקבות Bug ב-`handleReturn` (2026-08-11). אין למחוק או לשנות עד לקבלת החלטה חשבונאית מפורשת.**

**עדכון קריטי 2026-08-10 — Idempotency נבנה מחדש אחרי כשל אמפירי:** הרצה חוזרת בפועל של payload אמיתי (event id=2) גילתה שה-idempotency המקורי (SHA256 של `JSON.stringify(payload)`) נכשל — לא זיהה duplicate, כי JSONB ב-Postgres לא שומר סדר מפתחות מקורי, אז `JSON.stringify` על אותו payload בדיוק (אחרי round-trip דרך ה-DB) הפיק מחרוזת שונה ולכן hash שונה. תוקן ל**היררכיית מזהים עסקיים**: `TranzactionId` (מזהה עסקה רשמי של CardCom, מתועד) → `LowProfileId` (מזהה checkout session, fallback) → hash קנוני (מיון מפתחות רקורסיבי, לא `JSON.stringify` גולמי — fallback אחרון בלבד). migration 043 (`payload_hash`→`idempotency_key` + עמודת `key_type` לצורך חקירה). אומת אמפירית: אותו payload אמיתי, נשלף טרי מה-DB פעמיים, זוהה כ-duplicate נכון בפעם השנייה.

## מה שלא כלול כאן

**`src/modules/billing/` הקיים (טוקן כרטיס ברמת עמותה, `entity_billing`, OpenFields) אינו חלק מהמסמך הזה.** הוא מודול נפרד, כבר מחובר לאשף רישום עמותה ולהגדרות. לפי החלטת הפרויקט: ה-Billing Engine נשאר כפי שמוגדר ב-Compass (Tranzila MASAV), לא בוטל ולא מוזג לתוך ה-Charging Engine — גם אם המימוש שלו עדיין לא קיים. אין להסיק מהעבודה הנוכחית על Charging Engine שום דבר לגבי גורל המודול הזה.

---

## Current State — מה כבר קיים בקוד

לפני תכנון מבנה חדש — זה מה שכבר בנוי ב-`hamonym-backend`, ולא כדאי לשכפל:

| קובץ | מה יש בו היום |
|---|---|
| `src/modules/donations/donations.service.js::createDonation` | **קיים ופעיל.** יוצר donation ב-`pending`, בונה LowProfile מלא מול CardCom (per-entity credentials או fallback ל-Hamonym), שומר `low_profile_id`. Reuse before Replace — אין לבנות מחדש. |
| `src/modules/donations/donations.service.js::handleReturn` | **קיים ופעיל, אך זה Return Redirect לא Webhook.** מטפל בחזרת הדפדפן, ובפועל גם מעדכן סטטוס+קמפיין+`finalizePaidDonation` — ר' הפער מול העיקרון ב-Entry Points למעלה. |
| `src/modules/donations/donations.service.js::finalizePaidDonation` | **קיים ופעיל.** סוגר donation כ-`paid` (קבלה, חשבון תורם) — כבר idempotent (constraint על `receipts.donation_id`). זו ה-"Business Handler" מהזרימה המתועדת ב-Compass. **Reuse before Replace** — אין לבנות אותה מחדש. |
| `src/modules/payment/` | שלד כמעט ריק, לא בשימוש אמיתי כרגע: `payment.routes/controller/service.js` + `cardcom/cardcom.client.js`/`cardcom.validator.js` — היום רק `test-connection`. מועמד סביר למקם בו את ה-Webhook החדש כנקודת כניסה נפרדת מ-`donations`, אך לא נקבע עדיין (תלוי בהחלטה על יחס ל-`handleReturn`). |
| `src/modules/billing/billing.controller.js:121` (`cardcomCallback`) | **Stub, לא בשימוש אמיתי.** מדפיס `console.log` ומחזיר `{success:true}`. אין בו Secret validation, Idempotency, Audit, GetLpResult, או donation update. לא ה-webhook handler האמיתי, ולא שייך למודול `billing` בכלל. |
| Idempotency / Audit persistence | **לא קיים.** אין טבלה לשמירת webhook events גולמיים או למניעת עיבוד כפול. נדרש בזמן המימוש (schema — לא כאן). |

---

## Entry Points

1. **Checkout** — **קיים בפועל**, לא חדש. `POST /api/donations` → `donations.service.createDonation` — יוצר donation ב-`pending`, בונה LowProfile מלא מול CardCom (עם קרדנציאלס אמיתיים per-entity או fallback ל-Hamonym), שומר `low_profile_id`. **עודכן 2026-08-10:** נוסף `WebHookUrl` ל-payload (per-request, לפי תיעוד רשמי CardCom API v11 — לא הגדרת טרמינל) — `${BACKEND_URL}/api/payment/webhook?secret=${CARDCOM_WEBHOOK_SECRET}`. זה גם פותר את הפער שתועד בממצא ה-audit הקודם: עובד זהה בין אם התרומה עוברת בטרמינל הפלטפורמה או בטרמינל פרטי של עמותה, כי זה per-request ולא תלוי בהגדרה שתוגדר (או לא תוגדר) בטרמינל ספציפי.
2. **Return Redirect** — **קיים בפועל, אך מ-2026-08-11 הוא UX בלבד.** `GET /api/donations/return` → `handleReturn`. **Phase 2 הושלם** — ר' סעיף מיד למטה.
3. **Webhook** — **קיים ומוכח בפועל מ-2026-08-11.** `POST /api/payment/webhook` — נקודת הכניסה האסינכרונית מ-CardCom, ומאותו תאריך גם היחידה שמחליטה מצב עסקי.

**Phase 2 הושלם (2026-08-11) — Webhook הוא מקור האמת היחיד:**

```text
CardCom
        │
        ├──────────────► Webhook
        │                    │
        │                    ▼
        │             Source of Truth
        │             (payment.handler → GetLpResult → markDonationPaid)
        │
        ▼
Redirect (handleReturn)
        │
        ▼
Frontend UX only — לא כותב DB, לא מחליט paid/failed
```

`handleReturn` עכשיו עושה שלושה דברים בלבד: קורא פרמטרים מה-URL, בודק שה-donation קיימת (404 אם לא — לא קשור לתשלום, רק הגנה מפני ID שגוי), ומחליט לאיזה עמוד Frontend להפנות (`status` משמש רק לניתוב, לא לכתיבת סטטוס — זה בטוח כי זה ה-URL *אנחנו* בחרנו לשלוח ל-CardCom, לא שדה שהם ממלאים). **לא קורא יותר** ל-`markDonationPaid`/`markDonationFailed`/`updateCampaign`/`createReceipt`. אושר ב-Definition of Done לפני המעבר (9/9 קריטריונים ✅, כולל בדיקת "אין עיבוד כפול" ו-Retry אמיתי דרך ה-HTTP endpoint).

**הרקע המלא (2026-08-09 עד 2026-08-11):** מתועד למעלה ובקטע P1 — `handleReturn` היה מקור העדכון היחיד בפועל, בלי הגנת idempotency, ואז נמצא Bug אמיתי (`responseCode` לא אמין) שגרם לתרומה שנדחתה להיסמן כ-`paid`. זה בדיוק מה שהוביל למעבר הזה.

---

## מבנה קבצים מוצע

מרחיב את `src/modules/payment/` הקיים, לא מקביל אליו:

```
src/modules/payment/
  payment.routes.js            existing — route ל-webhook
  payment.controller.js        existing — webhook entry point, קורא ל-payment.handler.js ישירות

  webhook.dispatcher.js        קיים, לא בשימוש יותר מ-payment.controller.js —
                                נשאר על המדף, לא נמחק (ר' Architecture Change למטה)

  cardcom/
    cardcom.client.js          existing — + DoTransaction, GetLpResult
    cardcom.validator.js       existing — + webhook secret validation

  handlers/
    payment.handler.js             Low Profile (חד-פעמי) — הלוגיקה היחידה שרצה כרגע
    master-recurring.handler.js    שלד no-op, ממתין ל-endpoint ייעודי עתידי
    detail-recurring.handler.js    שלד no-op, ממתין ל-endpoint ייעודי עתידי
    document.handler.js            שלד no-op, ממתין ל-endpoint ייעודי עתידי

  idempotency/
    idempotency.service.js         "האם כבר עיבדתי את זה" — ר' Idempotency Check בזרימה המתועדת

  audit/
    audit.service.js               "מה קיבלתי" — נשמר לפני כל עיבוד עסקי

  events/                      new, טרם מומש
    donation-charged.event.js
    recurring-status-changed.event.js
```

---

## Architecture Change (2026-08-10) — הוסר ה-Dispatcher מ-`/api/payment/webhook`

**שלוש ראיות בלתי תלויות** (לא ניחוש): (1) תיעוד רשמי של CardCom ל-LowProfile API v11 — payload ה-Webhook המתועד שם אין בו `RecordType`. (2) Payload אמיתי מהפרודקשן — גם בו אין `RecordType`. (3) מסמך CardCom "ריכוז ממשקי Webhook" — LowProfile / Recurring / Invoices הן משפחות Webhook **נפרדות לגמרי**, לא endpoint משותף עם discriminator.

**מסקנה:** `POST /api/payment/webhook` (ה-URL שנשלח ב-`WebHookUrl` בתוך `createDonation`) הוא **מיועד ל-LowProfile בלבד, מטבעו** — אין צורך לזהות "איזה סוג אירוע זה". ה-`switch(RecordType)` פתר בעיה שלא קיימת עבור ה-endpoint הזה.

**מה בוצע:**
- `payment.controller.js::handleWebhook` קורא כעת ישירות ל-`handlers/payment.handler.js` — לא דרך `webhook.dispatcher.js`.
- לוגיקת ה-`NOT_ROUTED` observability (שנוספה קודם באותו יום) הוסרה מהקובץ הזה — לא רלוונטית יותר, אין יותר "לא נותב" ב-endpoint שמטבעו LowProfile בלבד.

**מה לא השתנה בכוונה:** `payment.handler.js`, `GetLpResult`, `markDonationPaid` — אף אחד מהם לא נגע. `webhook.dispatcher.js` ו-`handlers/master-recurring.handler.js`/`detail-recurring.handler.js`/`document.handler.js` **לא נמחקו** — נשארים בקוד, לא מחוברים לשום route, בסיס ל-endpoint ייעודי עתידי (`/api/payment/recurring-webhook` וכו') כשהוראות קבע יבנו בפועל — שם `RecordType` כן מתועד כשדה אמיתי (MasterRecurring/DetailRecurring).

## חלוקת אחריות

* **`payment.controller.js`** — מקבל HTTP, לא מקבל החלטות עסקיות (עקבי עם העיקרון הקיים ב-`HAMONYM_ARCHITECTURE.md` §2: Controllers דקים). **עודכן 2026-08-10 (Architecture Change):** קורא ל-Secret validation, ואז **ישירות** ל-`payment.handler.js` — לא עוד דרך Dispatcher, כי `/api/payment/webhook` מיועד ל-LowProfile בלבד מטבעו (ר' Architecture Change למטה).
* **`webhook.dispatcher.js`** — **לא מחובר יותר לשום route** (מ-2026-08-10). התיאור המקורי שלו (switch לפי recordType, מפנה ל-Handler המתאים) עדיין תקף כקוד, אבל הוא לא בשימוש. נשאר כבסיס אפשרי ל-endpoint נפרד עתידי של Recurring, איפה ש-`RecordType` כן שדה אמיתי מתועד.
* **`handlers/*.handler.js`** — לוגיקה עסקית פר-סוג-אירוע. `payment.handler.js` קורא ל-`GetLpResult` ואז ל-`donations.service.markDonationPaid` (עוטף את `finalizePaidDonation`) — **לא כותב מחדש** את עדכון הקמפיין/קבלה/חשבון תורם. זו הלוגיקה היחידה שרצה בפועל היום — שלושת ה-handlers האחרים הם no-op stubs.
* **`idempotency.service.js`** — בדיקה בלבד, לא ידע עסקי.
* **`audit.service.js`** — כתיבה בלבד של payload גולמי, לפני שהוא מגיע ל-Handler.
* **`events/*.event.js`** — Domain Events שמפורסמים אחרי עדכון ה-DB, לצריכה ע"י Dashboard/Analytics — לא הלוגיקה שמעדכנת אותם.
* **`donations` module** — נשאר הבעלים של ישות ה-Donation עצמה. `payment` module מתאם את פרוטוקול CardCom, לא כפול אחריות.

---

## סדר מימוש מוצע

1. ✅ Webhook Endpoint (`payment.routes.js` + `payment.controller.js`) — `POST /api/payment/webhook`
2. ✅ Secret Validation (`cardcom.validator.js::validateWebhookSecret`) — דרך `?secret=` ב-URL, מול `CARDCOM_WEBHOOK_SECRET`. **הוגדר ואומת בפרודקשן (Render).**
3. ✅ Idempotency (`idempotency/idempotency.service.js::claim({ provider, payload })`) — INSERT אטומי ל-`cardcom_webhook_events` (migration 042 + 043, **שתיהן רצו ואומתו**) עם `UNIQUE(idempotency_key)` — היררכיית מפתחות עסקיים (`TranzactionId`→`LowProfileId`→hash קנוני), לא hash גולמי של JSON (שהוכח לא אמין, ר' הערה למעלה). `provider` נכנס למפתח אך לא בשימוש מעבר לזה — הטבלה נשארת ייעודית ל-CardCom בלבד. אומת גם דרך retry אמיתי ב-HTTP endpoint החי, לא רק בקריאה ישירה לפונקציה.
4. ✅ Audit Log — משולב עם ה-Idempotency claim (אותו insert הוא גם רשומת ה-audit — ר' הערה ב-`idempotency.service.js` למה זה נכון לעשות באותה פעולה אטומית). `audit/audit.service.js::recordProcessed` מסמן הצלחה/שגיאה אחרי שה-handler רץ.
5. ✅ Payment Handler → `donations.service.markDonationPaid` (עוטף את `finalizePaidDonation` הקיים) — `handlers/payment.handler.js`, קורא ל-`GetLpResult` (נוסף ל-`cardcom.client.js`) לפני שהוא סוגר את ה-donation.
6. 🩹 MasterRecurring Handler — **שלד בלבד**, `handle` הוא no-op. **לא מחובר לשום route** (ה-dispatcher שבו הוא נכתב הוסר מהמסלול החי, ר' Architecture Change) — ימתין ל-endpoint ייעודי כש-Recurring יתחיל.
7. 🩹 DetailRecurring Handler — **שלד בלבד**, no-op. שים לב: כאן צריך State Machine אמיתי (ר' דיון Tech Lead Review) — `status != 'paid'` לא מספיק לסטטוסים כמו `LOSTDEBT`/`ONHOLD`.
8. 🩹 Document Handler — **שלד בלבד**, no-op.
9. Domain Events — לא בוצע
10. Dashboard Update — כבר קורה בעקיפין (`markDonationPaid` קורא ל-`invalidateDashboard` הקיים)

**נבדק ולא נבנה (2026-08-09) — דורש החלטה נפרדת, לא רק "להוסיף":** ל-`hamonym-backend` אין שום test framework (`npm test` הוא stub שנכשל, אין jest/mocha/vitest ב-package.json, אין קובץ test/spec אחד בכל הריפו) ואין ספריית logging (`console.log`/`console.error` בלבד בכל מקום, אין winston/pino). לכתוב unit tests או logging מסודר ל-webhook בלבד, בלי להחליט על framework לכל הבקאנד, ייצור קונבנציה יחידה ומבודדת. זו החלטה גדולה יותר מ"תוסיף בדיקות" — לא בוצעה, ממתינה להנחיה.

**לפני שממשיכים ל-MasterRecurring/DetailRecurring/Document (2026-08-09):** נוסף capture זמני — `payment.controller.js::captureWebhookPayload` שומר כל payload גולמי שמתקבל (אחרי אימות secret) ל-`logs/cardcom-webhook-capture.jsonl` (git-ignored). מטרה: לראות payload אמיתי אחד לפני שבונים handlers נוספים על ההנחה הלא-מאומתת.

**Exit Criteria (2026-08-09, מורחב) — לא "Payload אמיתי נלכד", אלא "המערכת השלימה בהצלחה Donation אמיתית מקצה לקצה". ארבע קבוצות:**

### 1. Infrastructure — התקשורת עם CardCom עובדת
- [ ] Backend נגיש מהאינטרנט, Webhook מגיע
- [ ] Secret Validation עובדת
- [ ] השרת החזיר `HTTP 200` ל-CardCom (לא 401/500 — אחרת CardCom עשוי לבצע Retry, וזה משנה את מה שרואים בבדיקה)
- [ ] אין Exceptions בלוג
- [ ] Payload נשמר ב-`logs/cardcom-webhook-capture.jsonl` — JSON תקין, אין שדות חסרים, לשים לב לשדות בלתי-צפויים

### 2. Business — המערכת עושה את מה שמצפים
- [ ] Dispatcher מזהה את סוג האירוע נכון (RecordType מאומת בפועל מול הערך שנלכד, לא הנחה)
- [ ] `GetLpResult` נקרא בהצלחה — לא Timeout, לא Authentication Error, לא "Transaction not found"
- [ ] Donation הרלוונטי עבר בפועל ל-`status='paid'`, `provider_reference` התמלא — **דרך ה-webhook, לא (רק) דרך `handleReturn`**
- [ ] `campaigns.current_amount`/`supporters_count` עודכנו (`markDonationPaid`'s aggregate update)
- [ ] `cardcom_webhook_events` — נכתבה שורה, `record_type` נכון, `processed_at` התמלא, `error` ריק

### 3. Reliability — המערכת עומדת במצבים אמיתיים
- [x] **Idempotency נבדקה בפועל ותוקנה (2026-08-10), ואומתה שוב (2026-08-11)** — הבדיקה הראשונה הייתה קריאה ישירה ל-`idempotency.service.js` (לא HTTP). **מאז אומת גם דרך ה-HTTP endpoint החי בפרודקשן**: replay של payload אמיתי ל-`POST /api/payment/webhook` עם ה-secret האמיתי החזיר `{"success":true,"duplicate":true}`, בלי side effects.
- [x] **אין עדכון כפול (אומת 2026-08-11)** — על תרומה אמיתית: קבלה אחת בדיוק, `campaign.current_amount`/`supporters_count` עלו בדיוק פעם אחת. נבדק גם אחרי retry מלא דרך ה-HTTP endpoint — אפס שינוי נוסף.

### 4. Rollback Readiness — המעבר מ"אימות" ל-Production בטוח
- [ ] אפשר להפעיל מחדש את ה-capture במהירות אם מתגלה בעיה אחרי שהוא הוסר (לא נמחק סופית מה-git history, רק מהקוד הפעיל)
- [ ] יש תיעוד של payload אמיתי אחד לפחות לכל סוג אירוע שנתמך באותו רגע (לא רק Payment)
- [x] **בוצע 2026-08-10:** טיפול ב-RecordType לא מזוהה — `webhook.dispatcher.js`'s `default` כבר לא `return null` שקט. מחזיר `{ routed: false, reason }` מפורש; `payment.controller.js` מגיב עם `console.warn` + רישום ב-`cardcom_webhook_events.error` בתחילית `NOT_ROUTED:` (לא `error` סתמי — זה routing gap, לא כשל עיבוד, ר' הבחנה מפורשת בקוד). **זה observability בלבד** — לא נוגע בזיהוי הדיסקרימינטור עצמו, לא מנחש `RecordType` חדש. השלב הבא (שכתוב ה-dispatcher על בסיס contract אמיתי) עדיין ממתין לדגימות payload נוספות (בעיקר כישלון אמיתי).

רק כשכל הרשימה למעלה ✅ — למחוק את `captureWebhookPayload` ואת נקודת הקריאה לה ב-`handleWebhook`, ורק אז לעבור ל-`MasterRecurring`.

**Cleanup Sprint מתוכנן (2026-08-11, אחרי שP2 נסגר, לפני שמתחילים Recurring):** `captureWebhookPayload` + לוג ה-`WebHookUrl` הזמני ב-`createDonation` — הם **Instrumentation**, לא Debug leftovers, כל עוד P2 פתוח; להסיר רק כשהוא נסגר. גם: הפיכת `handleReturn` ל-UX בלבד (Phase 2 TODO), ובדיקה האם `webhook.dispatcher.js` עדיין רלוונטי לעתיד (Recurring) או שאפשר למחוק. לא עכשיו. חיפוש ברשת אישר חלקית: CardCom משתמשת ב-`RecordType` בפועל עבור וובהוק הוראות קבע — `MasterRecurring` בעת יצירת ההוראה, `DetailRecurring` לכל חיוב בפועל (מקור: [מרכז התמיכה של CardCom](https://support.cardcom.solutions/hc/he/articles/360017105139)) — אבל לא נמצא אישור אם ה-webhook החד-פעמי (`Payment`/Low Profile) משתמש באותו שדה, ולא נמצא תיעוד למנגנון אימות חתימה/header (הדפים החסומים ב-403 ל-bots). מומלץ גם לפנות ל-dev@secure.cardcom.co.il לאימות רשמי, בנוסף ל-capture.

**שינוי נלווה שבוצע (לא היה מתוכנן במקור, נדרש בגלל Current State):** `handleReturn` שוכתב לקרוא ל-`markDonationPaid`/`markDonationFailed` המשותפים במקום כפילות SQL — זה מתקן את חוסר ה-idempotency שתועד קודם ב-Entry Points, אבל **`handleReturn` עדיין קורא בפועל ל-finalize** (לא הועבר עדיין למצב UX-בלבד). המעבר הזה מכוון — ר' ההערה בתשובת הצ'אט: מוקפא עד שה-Webhook מאומת מול תעבורת CardCom אמיתית וה-WebHookUrl מוגדר במסוף.

---

## Production Checklist

לא קוד — צ'קליסט. שער בין "Approved, ready for staging" ל-"ready for production":

- [x] migration 042 + 043 רצו ואומתו — `cardcom_webhook_events` קיימת עם `idempotency_key`/`key_type`
- [x] Exit Criteria מולאו בפועל — DoD מלא (9/9) אומת בפרודקשן, כולל תרחיש הצלחה, כישלון (₪5,001, נדחתה), retry, ו-Phase 2
- [ ] להסיר את `captureWebhookPayload` ואת נקודת הקריאה לה ב-`handleWebhook`
- [x] **בוצע 2026-08-11:** הוסרה הלוגיקה העסקית מ-`handleReturn` — Phase 2 הושלם
- [ ] להחליט על test framework + logging library לבקאנד (לא קיימים כלל היום) לפני שכותבים tests/logging ל-webhook
- [ ] להפעיל ניטור production על ה-webhook (שגיאות, זמני תגובה) — `cardcom_webhook_events.error` נותן שכבה בסיסית כבר עכשיו
