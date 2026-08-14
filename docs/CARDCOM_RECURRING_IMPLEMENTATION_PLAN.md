# CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md — Recurring Charging Engine: Implementation Design

**סטטוס:** Implementation Design, לא Architecture, לא קוד. מרחיב את `docs/CARDCOM_RECURRING_ARCHITECTURE.md` (Design, נעול ברמת העקרונות) אחרי ש-CardCom Contract Research נסגר ברובו (2026-08-11 עד 2026-08-14, כולל ניסויים אמפיריים אמיתיים מול CardCom Test — לא רק תיעוד).
**תאריך:** 2026-08-14

## מה המסמך הזה כן

תרגום של ה-Contract שאומת בפועל למבנה מימוש קונקרטי: flow, מודל נתונים, client/webhook structure, correlation/idempotency, וסדר בנייה מומלץ. **כל קביעה מתויגת באחת משלוש קטגוריות, לאורך כל המסמך:**

* **Verified** — נבדק בפועל מול CardCom (ניסוי אמיתי או תשובת תמיכה ישירה), לא רק תיעוד.
* **Hamonym decision** — לא עובדה של CardCom בכלל; החלטת עיצוב שלנו, יכולה להיקבע כאן.
* **דורש אימות** — עדיין לא נבדק, gate מפורש לפני שלב מימוש ספציפי (לא רשימת Unknowns כללית — ראו סעיף Gates).

## מה המסמך הזה לא

אין כאן קוד, DB migration, או שמות עמודות/endpoints סופיים. שמות שמופיעים כאן הם כיוון, לא מפרט נעול — ייקבעו בזמן המימוש עצמו.

---

## 0. תקציר המצב לפני שממשיכים

מחקר ה-Contract כלל: Create (LowProfile→Recurring), Master webhook אמיתי, Detail webhook אמיתי (הצלחה **וכשל**, `ONHOLD` — נלכד 2026-08-14). **לא כלול עדיין:** Detail webhook על סטטוסים אחרים מ-`ONHOLD` (`LOSTDEBT`/`DEBTAUTOBILLING`/`PAYBYOTHERE`/`PENDINGFORPROCESSING`/`OTHER`), Pause/Resume בפועל (רק PHP רשמי), Cancel, סיום טבעי, Idempotency של Create עצמו. הרשימה המלאה עם raw findings נמצאת בזיכרון הפרויקט (`project_cardcom.md`) — המסמך הזה מתמצת רק את מה שרלוונטי להחלטות מימוש.

---

## 1. Flow מלא: מהבחירה של התורם ועד יצירת ה-Master

```text
תורם בוחר "תרומה חודשית" (Hamonym decision — UI, טרם תוכנן)
        │
        ▼
Hamonym: LowProfile/Create (REST v11)
Operation=ChargeAndCreateToken  ← Verified: Operation=ChargeOnly נכשל (ResponseCode=8500)
        │
        ▼
תורם משלים תשלום ראשון בדף CardCom
        │
        ▼
LowProfile Webhook קיים (payment.handler.js, ללא שינוי ללוגיקה הקיימת)
GetLpResult → markDonationPaid → donation #1 = donation רגילה, paid
        │
        ▼
[חדש] אם ה-donation מסומנת כ-"recurring signup":
Name-to-Value RecurringPayment.aspx
Operation=NewAndUpdate
LowProfileDealGuid = donation.low_profile_id   ← Verified: LowProfileId ≡ LowProfileDealGuid
        │
        ▼
Response סינכרוני: ResponseCode=0, AccountId, RecurringId  ← Verified מבנה
        │
        ▼
[חדש] Hamonym יוצרת Recurring Instruction מקומי (AccountId+RecurringId), מקשרת ל-donation #1
        │
        ▼
CardCom Scheduler (הגדרות→6→2) — Verified: רץ עצמאית, בלי Hamonym cron
        │
        ▼
Detail Webhook לכל מחזור → donation חדשה + finalizePaidDonation (סעיף 7)
```

**נקודת החלטה פתוחה, Hamonym decision, לא נסגרה כאן במכוון:** האם ה-Recurring Instruction המקומי נוצר ברגע שמתקבלת תשובת ה-Create הסינכרונית (`ResponseCode=0`+`RecurringId`), או רק אחרי שמתקבל `MasterRecurring` webhook מאמת? הניסוי האמפירי (2026-08-14) הראה שה-response הסינכרוני אמין (לא כמו Redirect), אבל היוזר קבע במפורש **לא** להסיק מזה החלטה סופית לפני שנראה גם מה המשמעות המדויקת של "active" ב-Master webhook עצמו. **המלצה, לא החלטה נעולה:** ליצור מקומית מבוסס-response הסינכרוני (מקביל להתנהגות הקיימת עם `LowProfileId`), ולתת ל-Webhook לעדכן/לאשש בהמשך — לא לחכות לו כתנאי ליצירה הראשונית.

---

## 2. מודל הנתונים המינימלי (קונספטואלי, לא Schema)

לפי העיקרון שכבר קבוע ב-Design doc: לא להוסיף שדות רק כי CardCom מחזירה אותם.

**Recurring Instruction (חדש, מקומי):**
* זיהוי Hamonym: תורם, קמפיין, ישות (מה ש-CardCom לא יודע).
* זיהוי CardCom: `account_id`, `recurring_id` — **Verified** כמפתחות קורלציה יציבים, עקביים בכל ארבעת המקורות (SOAP/REST v11/Name-to-Value/Webhook).
* סטטוס מקומי — מתעדכן **רק** ע"י Webhook, לא מחושב מקומית (עקבי עם Source of Truth). ה-enum עצמו נשאר **Provisional** במכוון (ר' Design doc) — `Inactive` מעולם לא נצפה בפועל.
* Snapshot של סכום/תדירות ל-UI — **מתח לא-פתור, Hamonym decision:** cache מקומי (נוח ל-UI, עלול להתיישן) מול שליפה חיה תמיד מ-`GetRecurringPayment` (עקבי יותר עם Source of Truth, פחות נוח). **המלצה:** cache, מתעדכן מה-Webhook (לא polling), לא live-query בכל render.

**Recurring Charge — אין טבלה חדשה.** משתמשים ב-`donations` הקיימת (בדיוק לפי המלצת ה-Design doc), עם עמודת קישור חזרה ל-Recurring Instruction (שם/צורה טרם נקבעו — `recurring_instruction_id` nullable, כיוון בלבד). `provider_reference` הקיימת (כבר בשימוש ל-LowProfile TranzactionId) **ניתנת לשימוש חוזר** לאותה מטרה עבור Detail charges — **Verified** ש-`InternalDealNumber` (Webhook) ≡ `TranzactionId` (History), אז זה אותו סוג ערך שה-donations הקיימת כבר יודעת לאחסן.

---

## 3. היחס בין תרומה ראשונה, Master, ותרומות חודשיות

* **תרומה ראשונה (LowProfile):** donation רגילה, `markDonationPaid`/`finalizePaidDonation` **ללא שינוי כלל**. **Verified:** היא **לא** נספרת ב-`NumOfPaymentsAlreadyCharged` — שני payment events נפרדים לגמרי מבחינת CardCom (TranzactionId שונה).
* **קישור בדיעבד, Hamonym decision, המלצה:** ברגע שה-Recurring Instruction נוצר (אחרי donation #1), לעדכן את donation #1 עם `recurring_instruction_id` — כדי שהיא תופיע נכון בהיסטוריית התורם כחלק מהסדרה, למרות שהיא לא "cycle #1" מבחינת CardCom.
* **כל Detail charge מוצלח (`Status=SUCCESSFUL`):** donation חדשה, מקושרת מהתחלה (יודעים את ה-`recurring_id` מה-Webhook).
* **Detail charge לא-מוצלח (`ONHOLD` וכו'):** **Hamonym decision — ננעלה ומומשה (2026-08-14):** כן ליצור donation עם `status='failed'`, `amount=Sum`, `recurring_instruction_id`, `provider_reference=InternalDealNumber` — לשקיפות מול הארגון/תורם/תמיכה/reconciliation, כי היה ניסיון חיוב אמיתי. `failure_reason` שומר קוד גולמי יציב (`cardcom_recurring_<status בלועזית קטנה>`, למשל `cardcom_recurring_onhold`) — **לא** תרגום אנושי מומצא. **לא** `finalizePaidDonation`, **לא** aggregate, **לא** receipt. Idempotency זהה למסלול ההצלחה (`recurring_instruction_id`+`provider_reference`) — נבדק אקטיבית שredelivery לא יוצר שורה שנייה. ר' `detail-recurring.handler.js`.

---

## 4. `recurring.client` — הפרדת REST v11 מ-Name-to-Value

**המלצה (כבר ניתנה בסבב קודם, מקובעת כאן):** קובץ נפרד, לצד `cardcom.client.js` הקיים ב-`src/modules/payment/cardcom/`, לא בתוכו. נימוק: `cardcom.client.js` הקיים הוא JSON/axios נקי (`getLpResult`, `testConnection`); Name-to-Value הוא query-string flat encoding (`RecurringPayments.X=Y`) עם תשובה בפורמט `key=value&key2=value2` (לא JSON) — פרוטוקול שונה מהותית, לא רק endpoint שונה. אין דבר דומה לפרסור הזה בקוד הקיים היום — נדרש utility חדש (לא `JSON.parse`).

**פרט תפעולי מהמאמר הרשמי, לא הודגש מספיק קודם:** התיעוד עצמו ממליץ **POST**, לא GET, לשימוש אמיתי (GET מוצג בדוגמאות להמחשה בלבד). **דורש אימות:** להריץ בפועל עם POST לפני סגירת ה-client, לא רק להניח שזה זהה ל-GET.

---

## 5. Master/Detail Webhook Endpoint

מרחיב את מבנה הקבצים שכבר קיים ב-Design doc (`handlers/master-recurring.handler.js`, `handlers/detail-recurring.handler.js` — כבר קיימים כשלד no-op, לא מחוברים לשום route).

**Verified, קריטי לקוד:**
* Endpoint חדש נדרש (למשל `/api/payment/recurring-webhook`) — לא ניתן לשתף עם `/api/payment/webhook` הקיים.
* **Transport: `application/x-www-form-urlencoded`, לא JSON.** ה-route החדש צריך body parser אחר (`express.urlencoded`) — לא את מה שה-route הקיים משתמש בו.
* **Secret מגיע כשדה בגוף ה-Form, לא ב-`?secret=` ב-URL** — `cardcom.validator.js::validateWebhookSecret` הקיים (בודק `req.query.secret`) **לא ניתן להעתקה** ל-route הזה כמו שהוא.
* **Verified (2026-08-14, מ-`DetailRecurring` failure payload):** שם השדה המדויק הוא `Secret` (PascalCase) — `body.Secret`, לא `body.secret`. הגייט נסגר.

**Dispatcher:** `webhook.dispatcher.js` הקיים (switch לפי `RecordType`, בנוי מראש, לא מחובר) — **זה בדיוק ה-endpoint שהוא נכתב עבורו במקור** (RecordType אמין כאן, בניגוד ל-LowProfile). לחבר אותו ל-route החדש, לא לכתוב דיספצ'ר שני.

---

## 6. Correlation ו-Idempotency

**Master:** קורלציה לפי `recurring_id` — **Verified** אמין (עקבי בכל ארבעת המקורות, ומעבר לזה: תשובת ה-Create הסינכרונית כבר נותנת אותו לפני שהוודברת מגיע בכלל).

**Detail:** קורלציה לפי `recurring_id`+`RowID` — **Verified**, שניהם עקביים בין Webhook ל-`GetRecurringPaymentHistory`.

**Idempotency key — נקבע, לא עוד ניחוש:** `InternalDealNumber` (השם שמופיע ב-Webhook עצמו, **Verified** ≡ `TranzactionId` ב-History) — מקביל ישיר לתקדים המוכח של LowProfile (`TranzactionId`→`LowProfileId`→hash קנוני). **Verified (2026-08-14):** `InternalDealNumber` קיים גם ב-Webhook **כשל** (`ONHOLD`, ערך `258752910`), לא רק בהצלחה — אין צורך ב-fallback ל-`RowID` כמפתח ראשי, `RowID` נשאר גיבוי תיאורטי בלבד (עדיין לא נדרש בפועל).

**Hamonym decision:** לשימוש חוזר ב-`cardcom_webhook_events` הקיימת (יש כבר עמודת `record_type` מוכנה) מול טבלה נפרדת — Design doc כבר נטה לכיוון שימוש חוזר, לא נסגר כאן סופית.

---

## 7. שימוש ב-`finalizePaidDonation` — נקודה טכנית שלא הייתה גלויה קודם

**חשוב, לא הודגש מספיק בניתוח הקודם:** `markDonationPaid` הקיים בנוי כ-`UPDATE ... WHERE status != 'paid'` — הוא **מניח שה-donation row כבר קיימת** (ב-`pending`). לתרומה חד-פעמית זה נכון (Hamonym יצרה אותה ב-`createDonation`). **ל-Detail charge זה לא נכון** — Hamonym לא יזמה את החיוב הזה מראש, אין donation `pending` ממתינה. Detail charge מוצלח דורש **INSERT ישיר כ-`paid`**, לא UPDATE — התבנית הקרובה יותר בקוד הקיים היא `createManualDonation` (INSERT ישיר עם `status='paid'`, ואז `finalizePaidDonation`), **לא** `markDonationPaid`. זו תובנה לתכנון, לא סתם "תשתמשו ב-finalizePaidDonation" — צריך פונקציה חדשה שמדמה את ה-INSERT-ישיר-כ-paid pattern, לא את ה-UPDATE pattern.

---

## 8. טיפול ב-`SUCCESSFUL`/כשל/`ONHOLD` — בלי להמציא Semantics

**Verified מהניסוי:** `ONHOLD` לא הפך את ה-Master ל-Inactive, ו-`NumOfPaymentsAlreadyCharged` עלה גם עליו (סופר ניסיונות, לא הצלחות — טעות מודל-נתונים שכבר נמנעה).

**Hamonym decision, מומלצת:** ל-v1, לטפל ב-`SUCCESSFUL` במפורש (מסלול section 7), ובכל שאר הסטטוסים (`PENDINGFORPROCESSING`/`DEBTAUTOBILLING`/`LOSTDEBT`/`PAYBYOTHERE`/`ONHOLD`/`OTHER`) **באופן אחיד** — לשמור את הסטטוס הגולמי, **לא** לבנות מיפוי עדין (למשל "זה זמני, חכה" מול "זה סופי") לפני שרואים יותר מ-payload אחד לכל סטטוס. זה בדיוק העיקרון שכבר קבוע ב-Design doc, לא שינוי — רק אישוש שהניסוי לא נותן סיבה לסטות ממנו.

### 8.1 השוואה — `DetailRecurring SUCCESSFUL` מול `DetailRecurring ONHOLD` מול `GetRecurringPaymentHistory`

| שדה | SUCCESSFUL Webhook (2026-08-14, PaymentNum=2) | ONHOLD Webhook (2026-08-14, PaymentNum=5) | `GetRecurringPaymentHistory` (אותו ניסוי ONHOLD) |
|---|---|---|---|
| `RecordType` | `DetailRecurring` | `DetailRecurring` | — (שדה לא קיים ב-REST v11, שם endpoint אחר) |
| `Status` / מקביל | `SUCCESSFUL` | `ONHOLD` | `Status=ONHOLD` (זהה) |
| קוד תגובה | `ResponseCode=0` | `ResposeCode=60000004` (שם שדה **שונה**, שגיאת כתיב מקורית של CardCom) | `ResposeCode=60000004` (אותו שם/ערך) |
| מזהה עסקה | `InternalDealNumber` (קיים) | `InternalDealNumber=258752910` (קיים — **Verified חדש**, סוגר gate) | `TranzactionId` (אותו ערך, שם אחר — קשר כבר Verified) |
| `RowID` | קיים | `387791` | `387791` (זהה) |
| `Sum` | `100` | `6000.00` | `SumToBill=6000` (זהה בערך, שם שדה שונה) |
| `BillingAttempts` | `1` | `1` | `1` |
| `ProcessID` | לא תועד ברשימה שנלכדה קודם | `-50` | `-50` (זהה) |
| `Secret` | לא תועד ברשימה שנלכדה קודם (לא אומת אם קיים שם) | `Secret=<...>`, שם שדה **`Secret`** — Verified | — (לא רלוונטי, REST v11 לא Webhook) |

**מסקנה:** ה-Contract הבסיסי של `DetailRecurring` (RecordType/RecurringId/RowID/InternalDealNumber/PaymentNum/Sum/BillingAttempts) **יציב בין הצלחה לכשל** — אין צורך בפרסור שונה לפי סטטוס, רק בענף החלטה על הערך של `Status`. ה-**היחס בין `ResponseCode` (הצליח בעבר) ל-`ResposeCode` (מופיע בכשל) נשאר לא-מוסבר** — ייתכן ששניהם יכולים להופיע יחד ב-payload מלא; הרשימה שנלכדה בניסוי הכשל תויגה ע"י המדווח כ"שדות רלוונטיים" ולא כדאמפ גולמי מלא, אז **אי-הופעת `ResponseCode` ברשימה אינה הוכחה להיעדרו** — לא לקבע בקוד הנחה על בסיס זה.

### 8.2 Semantics מדויקים ל-Phase 4 — טבלת החלטה, Verified מול fallback

| `Status` שמתקבל | פעולה | סיווג |
|---|---|---|
| `SUCCESSFUL` | INSERT donation `paid` (pattern כמו `createManualDonation`, **לא** `markDonationPaid` — סעיף 7) → `finalizePaidDonation` | **Verified** — כבר ממומש ב-Phase 3, ללא שינוי |
| `ONHOLD` | INSERT donation `status='failed'`, `amount=Sum`, `failure_reason='cardcom_recurring_onhold'` — **לא** ליצור קבלה, **לא** לעדכן aggregate, **לא** `finalizePaidDonation` | **מומש ונבדק (2026-08-14)** — `detail-recurring.handler.js`. נבדק empirically כולל redelivery (guard לא יוצר שורה שנייה) |
| `PENDINGFORPROCESSING` / `DEBTAUTOBILLING` / `LOSTDEBT` / `PAYBYOTHERE` / `OTHER` | **אותה פעולה כמו `ONHOLD`** (branch אחיד `Status !== 'SUCCESSFUL'`, לא ייחודי לכל סטטוס), `failure_reason='cardcom_recurring_<status>'` נגזר דינמית מ-`Status` הגולמי | **Fallback לא-מאומת מפורש** — אף אחד מהם לא נצפה ב-payload אמיתי. ההנחה שה-Contract הכללי (RecordType/RecurringId/RowID/InternalDealNumber) יציב גם עבורם נשענת על כך שהוא יציב בין `SUCCESSFUL`↔`ONHOLD` (שתי נקודות דגימה), **לא** על ראייה ישירה של הסטטוסים האלה עצמם — אבל הקוד מטפל בהם נכון כברירת מחדל כי הענף לא תלוי בערך המדויק |

**✅ Schema question ננעלה ומומשה (2026-08-14):** `migrations/045_donations_provider_raw_ids.sql` הוסיפה שתי עמודות nullable, גנריות (לא `cardcom_*`, כי `donations` היא טבלה כללית לא ספציפית לספק) — `provider_row_id` (`RowID`), `provider_status_code` (`ResposeCode`). נשמרות **גם** ב-`SUCCESSFUL` **וגם** בכשל, כשהשדה קיים ב-payload. **לא** חלק מ-idempotency — `provider_reference`(=`InternalDealNumber`) נשאר המפתח היחיד, ללא שינוי. נבדק אמפירית: SUCCESSFUL שומר `provider_row_id`, `provider_status_code` נשאר `null` (השדה לא הופיע ב-payload ההצלחה שנלכד); ONHOLD שומר את שתיהן.

**מה זה אומר בקוד (כיוון, לא Schema סופי):** `detail-recurring.handler.js` מקבל ענף אחד (`if Status === 'SUCCESSFUL' → success path`, `else → failure path` אחיד) — לא `switch` לפי כל ערך אפשרי של `Status`. זה כבר היה העיקרון לפני הניסוי (section 8 המקורי) — הניסוי לא נתן סיבה לסטות ממנו, רק אישר אותו על נתון אמיתי אחד (`ONHOLD`) ולא רק בתיאוריה.

**נשאר Hamonym decision, לא נסגר כאן:**
* האם ליצור שורת `donations` בכלל עבור כשל, או רק ל-`SUCCESSFUL` (שקיפות מול הארגון מול "רעש" בדף התרומות) — כבר הועלה בסעיף 3, עדיין פתוח.
* אם כן — איזה `status` פנימי (`failed`? ערך חדש?) ואיזה טקסט ל-`failure_reason`.
* Idempotency ל-branch הכשל: אותו `InternalDealNumber` כמו הצלחה — Verified שהוא קיים, אז אותו קוד idempotency-guard (`WHERE recurring_instruction_id=$1 AND provider_reference=$2`, כבר ממומש ל-Phase 3) עובד ללא שינוי.

---

## 9. Pause / Resume / Cancel / Skip Month

| פעולה | מנגנון | סטטוס |
|---|---|---|
| Skip חודש (דחיית חיוב) | `Operation=update` + `RecurringId` + `NextDateToBill` חדש | **Verified** — בדיוק המנגנון שהופעל בניסויים (גם אם לכיוון אחר, המנגנון זהה) |
| Pause | `Operation=update` + `RecurringId` + `IsActive=false` | **✅ Verified (2026-08-14, `RecurringId=44197`).** משבית בפועל — job לא מחייב גם כש-`NextDateToBill` הגיע. `MasterRecurring` webhook יורה על השינוי. |
| בזמן Pause | — | **✅ Verified:** `NextDateToBill` קופא (לא מתקדם), `NumOfPaymentsAlreadyCharged` לא זז. |
| Resume | `Operation=update` + `RecurringId` + `IsActive=true` + `NextDateToBill` מפורש (Hamonym קובעת את הערך, לא סומכת על מה ש-CardCom מחזיקה) | **✅ Verified.** מצב סופי אחרי הניסוי: `IsActive=true`, `NextDateToBill` בדיוק כפי שנקבע, סכום ללא שינוי. |
| Cancel | **✅ ננעל ומומש (2026-08-14, Phase 6).** אותו `Operation=update`+`IsActive=false` כמו Pause — **אין מנגנון CardCom נפרד**, אומת שוב שלא נמצא בשום מקור (SOAP WSDL/REST v11 swagger/PHP samples). | **Hamonym decision, ננעלה:** `status='cancelled'`+`cancelled_at`. סופי מבחינת Hamonym — **לא ניתן ל-Resume דרך הקוד** (guard מפורש). CardCom עצמה לא יודעת את ההבדל מ-Pause ולא הייתה מונעת `IsActive=true` מאוחר יותר — זו מדיניות Hamonym בלבד, לא מגבלת ספק. חזרה עתידית = signup חדש. |

---

## 9.1 Phase 5 — תכנון מימוש (Pause/Resume), אחרי Contract Verified במלואו

**היקף:** Pause + Resume בלבד. **לא** Cancel (סעיף 9 למעלה משאיר את זה כ-Hamonym decision נפרדת, לא ננעלה).

**`recurring.client.js` — נדרשת פונקציה חדשה, לא קיימת היום:** הקובץ מכיל היום רק `createRecurring` (`Operation=NewAndUpdate`). Pause/Resume דורשים `updateRecurring({ terminalNumber, userName, apiPassword, recurringId, isActive, nextDateToBill? })` — `Operation=update` + `RecurringPayments.RecurringId=<קיים>` + השדה(ות) לשינוי, בדיוק לפי `DisableRecurringPayment.php`/`UpdateRecurringPayment.php` הרשמיים ולפי הניסוי שאומת. פונקציה אחת גנרית, לא שתיים נפרדות ל-Pause/Resume — ההבדל הוא רק בערכים שנשלחים.

**Endpoint/Controller — כיוון, לא סופי:** קריאה יזומה ע"י Hamonym (admin action היום, Personal Area בעתיד — סעיף 10) → controller חדש/מורחב ב-`recurring.service.js` (יש כבר `createSignup`/`completeSignup` שם — מוסיפים `pauseRecurring(instructionId)`/`resumeRecurring(instructionId)`). **לא** webhook — זו פעולה יזומה, סינכרונית, לא event נכנס.

**Pause — לוגיקה:**
1. לקרוא את `recurring_instructions` הקיימת, לוודא `status` פעיל (idempotency: אם כבר `paused`, לא לקרוא ל-CardCom שוב).
2. `updateRecurring({ recurringId, isActive: false })`.
3. אם `ResponseCode=0` — לעדכן `status='paused'` מקומית (ר' סעיף 4 בתשובה הקודמת). אם נכשל — **לא** לעדכן מקומית, להחזיר שגיאה לקורא (סעיף 5, כבר הוסכם).
4. **לא** נוגעים ב-`NextDateToBill` בקריאה הזו — מיותר, `IsActive=false` כבר מספיק (Verified).

**Resume — לוגיקה:**
1. לוודא `status='paused'` מקומית (idempotency דומה).
2. לחשב `nextDateToBill` לפי הכלל שנקבע: יום-העוגן המקורי, המופע הקרוב הבא **בעתיד בלבד** — אין catch-up, אין חיוב מיידי, אין שינוי קבוע של יום החיוב. (מקור יום-העוגן: `billing_anchor_day` — ר' למטה.)
3. `updateRecurring({ recurringId, isActive: true, nextDateToBill })`.
4. אם `ResponseCode=0` — `status='active'` + `next_date_to_bill` מקומי מתעדכן לערך שנקבע. אם נכשל — לא לעדכן, שגיאה לקורא.
5. `MasterRecurring` webhook (Verified שיורה על שינוי `IsActive`) יגיע בהמשך ויאשר/יסנכרן שוב — אין תלות בו לפני שמעדכנים מקומית (אותו pattern כמו Create ב-Phase 1: סומכים על ה-response הסינכרוני, ה-webhook הוא אישוש/סנכרון נוסף, לא gate).

**`billing_anchor_day` — כן, נשאר בתכנון, migration לא מבוצע עדיין (לפי הנחיה מפורשת):**
הניסוי הוכיח ש-`NextDateToBill` קופא בזמן Pause — טכנית זה מספיק היום כדי לגזור את יום העוגן מ-`next_date_to_bill` שנשמר לפני ה-Pause. אבל **זה לא משנה את ההמלצה** — יום העוגן הוא כלל עסקי של Hamonym (למשל: לתורם שנרשם ב-15 לחודש, "15" הוא ה-anchor), לא נגזרת של שדה תפעולי אצל ספק סליקה שיכול (עקרונית, בעתיד) להשתנות בלי אזהרה. `next_date_to_bill` נדרס בכל Update/webhook — עמודה עצמאית (`recurring_instructions.billing_anchor_day`, INT 1-31, נגזרת פעם אחת מ-`next_date_to_bill` **בזמן ה-Create המקורי**, לא בזמן Pause) נותנת עצמאות מלאה, בעלות זניחה (עמודה אחת nullable). **Migration בפועל — רק בהנחייה מפורשת נפרדת**, כפי שנקבע.

**Idempotency/guards:** Pause על הוראה כבר `paused` → no-op (לא קורא ל-CardCom שוב). Resume על הוראה שכבר `active` → no-op. אין race condition חדש — פעולות יזומות, לא webhooks מקבילים.

**✅ ממומש ואומת (2026-08-14), נגד `RecurringId=44197` האמיתי (Test):**
- `migrations/046_recurring_billing_anchor_day.sql` — `recurring_instructions.billing_anchor_day` (SMALLINT, 1-31, nullable, `CHECK`). רץ בפועל. **אין backfill גורף** — לפי הנחיה מפורשת: קיים רק לחדשות (`completeSignup` נקבע כעת גם הוא) ולישנות בעת שימוש ראשון (lazy, בתוך `pauseRecurring`).
- `recurring.client.js::updateRecurring` — `Operation=update`, שולח רק את השדות שהקורא ביקש לשנות (`IsActive`/`NextDateToBill`), לא את כולם כברירת מחדל.
- `donations.service.js::resolveCardcomCredentialsForEntity` (חדש, מיצוי מ-`resolveCardcomCredentials` הקיים ל-helper משותף) — Pause/Resume פועלים על `recurring_instructions.entity_id` ישירות, אין donation ליהנות ממנו.
- `recurring.service.js::pauseRecurring`/`resumeRecurring` — לוגיקה כפי שתוכננה למעלה, כולל `nextOccurrenceOfAnchorDay` (יום עוגן, מופע עתידי קרוב, clamp לחודשים קצרים).

**נבדק אמפירית, נגד CardCom Test בפועל (לא רק unit) — entity/campaign זמניים, `RecurringId=44197` (Test) עצמו נגע בפועל, לא מדומה:**
- Pause: הצליח (`ResponseCode=0`), `status→'paused'`, `billing_anchor_day` נשמר.
- Pause שוב (redelivery): `{alreadyPaused:true}`, לא נשלחה קריאה נוספת ל-CardCom.
- Resume: הצליח, **`nextOccurrenceOfAnchorDay(14)` חישב `14/09/2026` — תואם בדיוק את מה שהיוזר קבע ידנית בניסוי הקודם**, אימות עצמאי לכלל שנקבע. `status→'active'`.
- Resume שוב: `{alreadyActive:true}`, לא נשלחה קריאה נוספת.
- **כשל Update — נבדק עם `RecurringId` בדוי (`999999999`) על הוראה זמנית נפרדת:** CardCom החזירה שגיאה אמיתית ("Recurring Id not found") גם ל-Pause וגם ל-Resume — בשני המקרים הקוד **זרק** ו-**לא** עדכן `status` מקומית (אומת ישירות מה-DB אחרי).
- מצב סופי של `RecurringId=44197` (Test) בסוף הריצה: `IsActive=true`, `NextDateToBill=14/09/2026` — זהה למצב שהיוזר השאיר בניסוי הידני, לא נדרס.

---

## 9.2 Phase 6 — תכנון+מימוש (Cancel), ללא ניסוי CardCom חדש

**היקף:** Cancel בלבד — סיום קבוע מבחינת Hamonym.

**Contract — לא נבדק כניסוי חדש, נגזר מ-Phase 5:** אין מנגנון CardCom ייעודי ל-ביטול הוראה (אומת שוב מול כל המקורות שכבר נסקרו — SOAP WSDL, REST v11 swagger, PHP samples רשמיים; ה-endpoint היחיד שנשמע קרוב, `ChangeStatusForHistoryRecurringToIrrevocable`, פועל על רשומת History בודדת, לא על ה-Order). Cancel משתמש **באותה קריאה בדיוק** כמו Pause — `Operation=update`+`IsActive=false` — שכבר Verified אמפירית ב-Phase 5. **חשוב:** מבחינה טכנית CardCom לא הייתה מונעת `IsActive=true` על הוראה "מבוטלת" מאוחר יותר — אין באמת נעילה בצד הספק. הסופיות היא **מדיניות מוצר של Hamonym בלבד**, לא מגבלה טכנית.

**Hamonym decision (ננעלה 2026-08-14):**
- `Pause` = זמני, ניתן Resume.
- `Cancel` = סופי מבחינת Hamonym. `status='cancelled'`+`cancelled_at`. **לא ניתן ל-Resume דרך הקוד** — `resumeRecurring` זורק guard מפורש על `status==='cancelled'`. חזרה עתידית של תורם = signup חדש (donation+recurring_instruction חדשים), לא החייאת הישן — היסטוריה נקייה, אין עמימות לגבי איזו "הסכמה" בתוקף.

**✅ ממומש ואומת (2026-08-14), נגד `RecurringId=44197` האמיתי (Test):**
- `migrations/047_recurring_cancelled_at.sql` — `recurring_instructions.cancelled_at` (TIMESTAMPTZ, nullable). רץ בפועל.
- `recurring.service.js::cancelRecurring` — אותה תבנית כמו `pauseRecurring`/`resumeRecurring`: guard על `cardcom_recurring_id` קיים, no-op אם כבר `cancelled`, `ResponseCode!=='0'`→ throw בלי לכתוב state מקומי, הצלחה→`status='cancelled'`+`cancelled_at=NOW()`. **אין** finalize/payment/receipt/aggregate — לא נוגע בכלל בתשלומים.
- `resumeRecurring` עודכן עם guard חדש: `status==='cancelled'` → throw מיידי, **לפני** כל קריאה ל-CardCom (בדיקה מקומית טהורה).

**נבדק אמפירית נגד CardCom Test בפועל:**
- Cancel (`RecurringId=44197`) הצליח (`ResponseCode=0`), `status→'cancelled'`, `cancelled_at` נשמר.
- Cancel שוב: `{alreadyCancelled:true}`, ללא קריאה נוספת ל-CardCom.
- Resume על הוראה `cancelled`: נזרקה שגיאה **מקומית** מיד, `status` נשאר `cancelled` ללא שינוי.
- כשל Update (`RecurringId` בדוי, הוראה נפרדת): CardCom החזירה "Recurring Id not found", הקוד זרק, `status` נשאר `active` ללא שינוי.
- **`RecurringId=44197` שוחזר בסוף הבדיקה** (קריאה ישירה, לא דרך ה-guard של הקוד — ניקוי מכוון של fixture הבדיקה המשותף) בחזרה ל-`IsActive=true`, `NextDateToBill=14/09/2026` — אותו מצב ידוע-טוב כמו לפני הבדיקה.

---

## 10. Personal Area של התורם — טרם נחקר, שרטוט בלבד

**Hamonym decision מלאה, לא נחקר מול CardCom בכלל בשיחה הזו.** הצעת MVP: מציג את ה-snapshot המקומי (סעיף 2) — סכום, תדירות, `next_date_to_bill`, סטטוס. פעולות (Pause/Skip/Cancel) קוראות ל-backend של Hamonym, שקורא ל-CardCom Update — התורם לעולם לא קורא ל-CardCom ישירות. זה לא הרחבה מבוססת-ראיה כמו שאר המסמך — סעיף פתוח לתכנון UX נפרד.

---

## 11. Recovery / Reconciliation אם Webhook אבד

**Hamonym decision, מוצע חדש, מבוסס על מה שכבר Verified:** בגלל ש-`GetRecurringPaymentHistory` ו-Webhook מתואמים לחלוטין עכשיו (`InternalDealNumber`≡`TranzactionId`, `RowID` זהה) — ניתן לבנות Reconciliation Job תקופתי (למשל יומי) שקורא `GetRecurringPaymentHistory` לכל Recurring Instruction מקומי פעיל, ומשווה מול donations קיימות (לפי `provider_reference`). כל History row בלי donation מקומית תואמת = webhook שאבד → מפעיל את אותה לוגיקת סגירה כאילו ה-webhook הגיע. עקבי עם עיקרון ה-Design doc ("Reconciliation Job לאיתור פערים אפשרי, אך לא כתחליף ל-Webhook") — לא היה מפורט קודם באותה רמת קונקרטיות, כי לא היה עדיין את הקורלציה המוכחת שמאפשרת אותו.

---

## 12. Gates — מה בדיוק חוסם כל שלב מימוש (לא רשימת Unknowns כללית)

| שלב מימוש | Gate |
|---|---|
| LowProfile recurring-signup path (`ChargeAndCreateToken`) | **אין gate — Verified במלואו.** |
| `recurring.client` — Create/Update דרך Name-to-Value | **אין gate מהותי** — לוודא POST (לא רק GET) לפני סגירה סופית. |
| אורקסטרציה (LowProfile מוצלח → Recurring Create) | **אין gate CardCom — רק Hamonym decision** (סעיף 1), טרם ננעל סופית. |
| Master webhook handler | **אין gate — Verified (2026-08-14).** שם שדה ה-Secret (`Secret`, PascalCase) אומת מ-payload גולמי. |
| Detail webhook handler — הצלחה | **אין gate — Verified.** |
| Detail webhook handler — כשל | **אין gate מהותי — Verified ל-`ONHOLD` (2026-08-14), payload גולמי אמיתי מה-Webhook עצמו.** שאר הסטטוסים (`LOSTDEBT`/`DEBTAUTOBILLING`/`PAYBYOTHERE`/`PENDINGFORPROCESSING`/`OTHER`) עדיין fallback לא-מאומת — לא חוסם v1 כי ההחלטה (section 8.2) היא branch אחיד "לא-`SUCCESSFUL`", לא מיפוי ייחודי לכל סטטוס. |
| Pause/Resume | **אין gate — Verified (2026-08-14).** |
| Cancel | אין gate CardCom — Hamonym decision בלבד (סעיף 9). |
| סיום טבעי (`TotalNumOfBills`) | לא דחוף — סביר של-Hamonym ישתמש ב-`TotalNumOfBills` גדול (כמו בניסוי, `99999`) לתרומות מתמשכות בפועל, לא מספר סופי. לדחות בלי דאגה. |
| Create idempotency/retry | **לא לחכות לתשובת CardCom** — להגן בצד Hamonym (בדיקת existing Recurring Instruction לפני יצירה חדשה) בלי קשר למה ש-CardCom עושה. |
| `ReturnValue` correlation | **מיותר במודל הזה** — `RecurringId` (Verified, סינכרוני מה-Create response) מספיק לקורלציה. לא נדרש עוד מחקר על `ReturnValue` כדי להתקדם. |

---

## 13. סדר מימוש מומלץ בשלבים

1. **מודל נתונים + LowProfile recurring-signup path** — הכי לא-חסום, אפס gates מהותיים. מייצר `RecurringId` אמיתיים שאפשר להשתמש בהם גם להמשך הבדיקות.
2. **Master webhook endpoint + handler** — כמעט לא חסום (רק אימות שם שדה Secret).
3. **Detail webhook handler — מסלול הצלחה** — אותו gate, ומחבר ל-`finalizePaidDonation` (עם התיקון מסעיף 7 — INSERT ישיר, לא UPDATE).
4. **Detail webhook handler — מסלול כשל — ✅ מומש ונבדק (2026-08-14).** ר' סעיף 8.2.
5. **🎉 Pause/Resume (Phase 5) — ממומש ואומת (2026-08-14).** ר' §9.1.
6. **🎉 Cancel (Phase 6) — ממומש ואומת (2026-08-14).** ר' §9.2. Personal Area UI נשאר מחוץ להיקף — סעיף 10 למטה.
7. **Reconciliation Job** — nice-to-have, אחרי שהזרימה הליבתית יציבה.

**לא לממש עדיין — זהו תכנון, לא הוראה לפתוח PR.**
