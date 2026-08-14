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

מחקר ה-Contract כלל: Create (LowProfile→Recurring), Master webhook אמיתי, Detail webhook אמיתי (הצלחה), ניסוי Failure אמיתי (`ONHOLD`). **לא כלול עדיין:** Detail webhook אמיתי של כשל, Pause/Resume בפועל (רק PHP רשמי), Cancel, סיום טבעי, Idempotency של Create עצמו. הרשימה המלאה עם raw findings נמצאת בזיכרון הפרויקט (`project_cardcom.md`) — המסמך הזה מתמצת רק את מה שרלוונטי להחלטות מימוש.

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
* **Detail charge לא-מוצלח (`ONHOLD` וכו'):** **Hamonym decision, לא נבדק:** ליצור donation עם `status='failed'` (לנראות בדף ניהול תרומות, עקבי עם התנהגות קיימת של תרומות חד-פעמיות שנכשלו) — או לא ליצור שורה בכלל. **המלצה:** כן ליצור, לשקיפות מול הארגון — אבל זו החלטה, לא עובדה מ-CardCom.

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
* **דורש אימות (לא Hamonym decision, לא Verified עדיין):** שם השדה/casing המדויק של ה-Secret בתוך ה-Form (`Secret`? `secret`?) — ידוע שהוא **קיים** בגוף הבקשה, לא ידוע השם המדויק. לבדוק מול ה-payload הגולמי שנלכד לפני מימוש ה-validation.

**Dispatcher:** `webhook.dispatcher.js` הקיים (switch לפי `RecordType`, בנוי מראש, לא מחובר) — **זה בדיוק ה-endpoint שהוא נכתב עבורו במקור** (RecordType אמין כאן, בניגוד ל-LowProfile). לחבר אותו ל-route החדש, לא לכתוב דיספצ'ר שני.

---

## 6. Correlation ו-Idempotency

**Master:** קורלציה לפי `recurring_id` — **Verified** אמין (עקבי בכל ארבעת המקורות, ומעבר לזה: תשובת ה-Create הסינכרונית כבר נותנת אותו לפני שהוודברת מגיע בכלל).

**Detail:** קורלציה לפי `recurring_id`+`RowID` — **Verified**, שניהם עקביים בין Webhook ל-`GetRecurringPaymentHistory`.

**Idempotency key — המלצה מבוססת ראיה, לא עוד ניחוש:** `InternalDealNumber` (השם שמופיע ב-Webhook עצמו, **Verified** ≡ `TranzactionId` ב-History) — מקביל ישיר לתקדים המוכח של LowProfile (`TranzactionId`→`LowProfileId`→hash קנוני). `RowID` מועמד גיבוי סביר. **דורש אימות:** האם `InternalDealNumber` קיים גם ב-Webhook **כשל** (לא רק הצלחה) — אם לא, נדרש fallback ל-`RowID` בדיוק כמו שההיררכיה הקיימת כבר בנויה לתמוך במקרה כזה (לא ארכיטקטורה חדשה — אותו pattern, מיושם שוב).

**Hamonym decision:** לשימוש חוזר ב-`cardcom_webhook_events` הקיימת (יש כבר עמודת `record_type` מוכנה) מול טבלה נפרדת — Design doc כבר נטה לכיוון שימוש חוזר, לא נסגר כאן סופית.

---

## 7. שימוש ב-`finalizePaidDonation` — נקודה טכנית שלא הייתה גלויה קודם

**חשוב, לא הודגש מספיק בניתוח הקודם:** `markDonationPaid` הקיים בנוי כ-`UPDATE ... WHERE status != 'paid'` — הוא **מניח שה-donation row כבר קיימת** (ב-`pending`). לתרומה חד-פעמית זה נכון (Hamonym יצרה אותה ב-`createDonation`). **ל-Detail charge זה לא נכון** — Hamonym לא יזמה את החיוב הזה מראש, אין donation `pending` ממתינה. Detail charge מוצלח דורש **INSERT ישיר כ-`paid`**, לא UPDATE — התבנית הקרובה יותר בקוד הקיים היא `createManualDonation` (INSERT ישיר עם `status='paid'`, ואז `finalizePaidDonation`), **לא** `markDonationPaid`. זו תובנה לתכנון, לא סתם "תשתמשו ב-finalizePaidDonation" — צריך פונקציה חדשה שמדמה את ה-INSERT-ישיר-כ-paid pattern, לא את ה-UPDATE pattern.

---

## 8. טיפול ב-`SUCCESSFUL`/כשל/`ONHOLD` — בלי להמציא Semantics

**Verified מהניסוי:** `ONHOLD` לא הפך את ה-Master ל-Inactive, ו-`NumOfPaymentsAlreadyCharged` עלה גם עליו (סופר ניסיונות, לא הצלחות — טעות מודל-נתונים שכבר נמנעה).

**Hamonym decision, מומלצת:** ל-v1, לטפל ב-`SUCCESSFUL` במפורש (מסלול section 7), ובכל שאר הסטטוסים (`PENDINGFORPROCESSING`/`DEBTAUTOBILLING`/`LOSTDEBT`/`PAYBYOTHERE`/`ONHOLD`/`OTHER`) **באופן אחיד** — לשמור את הסטטוס הגולמי, **לא** לבנות מיפוי עדין (למשל "זה זמני, חכה" מול "זה סופי") לפני שרואים יותר מ-payload אחד לכל סטטוס. זה בדיוק העיקרון שכבר קבוע ב-Design doc, לא שינוי — רק אישוש שהניסוי לא נותן סיבה לסטות ממנו.

---

## 9. Pause / Resume / Cancel / Skip Month

| פעולה | מנגנון | סטטוס |
|---|---|---|
| Skip חודש (דחיית חיוב) | `Operation=update` + `RecurringId` + `NextDateToBill` חדש | **Verified** — בדיוק המנגנון שהופעל בניסויים (גם אם לכיוון אחר, המנגנון זהה) |
| Pause | `Operation=update` + `RecurringId` + `IsActive=false` | Documented-only (PHP רשמי) — **לא הורץ בפועל** |
| Resume | אותו דבר, `IsActive=true` | Documented-only — **לא הורץ בפועל** |
| Cancel | **אין מנגנון CardCom נפרד שנמצא.** | **Hamonym decision:** להתייחס כ-`IsActive=false` (זהה ל-Pause), עם דגל/פרשנות מקומית בלבד להבדיל "מושהה, מצפים לחידוש" מ-"בוטל, לא מצפים". CardCom לא יודעת את ההבדל — זו סמנטיקה של Hamonym בלבד. |

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
| Master webhook handler | לאמת שם/casing מדויק של שדה ה-Secret מול payload גולמי אמיתי. |
| Detail webhook handler — הצלחה | אותו gate כמו Master (Secret field name). |
| Detail webhook handler — כשל | **חסום.** payload אמיתי של Detail-failure לא נלכד (בעיה תפעולית ב-webhook.site, לא ב-CardCom) — לבדוק קודם את דוח היסטוריית החיובים בפאנל הניהול (עשוי לשמור את מה שכבר נשלח, בלי ניסוי נוסף). |
| Pause/Resume | לא חוסם קריטית — מנגנון `Operation=update` כבר מוכח לשדות אחרים. מומלץ להריץ בפועל לפני כתיבת הקוד הספציפי, לא הכרחי. |
| Cancel | אין gate CardCom — Hamonym decision בלבד (סעיף 9). |
| סיום טבעי (`TotalNumOfBills`) | לא דחוף — סביר של-Hamonym ישתמש ב-`TotalNumOfBills` גדול (כמו בניסוי, `99999`) לתרומות מתמשכות בפועל, לא מספר סופי. לדחות בלי דאגה. |
| Create idempotency/retry | **לא לחכות לתשובת CardCom** — להגן בצד Hamonym (בדיקת existing Recurring Instruction לפני יצירה חדשה) בלי קשר למה ש-CardCom עושה. |
| `ReturnValue` correlation | **מיותר במודל הזה** — `RecurringId` (Verified, סינכרוני מה-Create response) מספיק לקורלציה. לא נדרש עוד מחקר על `ReturnValue` כדי להתקדם. |

---

## 13. סדר מימוש מומלץ בשלבים

1. **מודל נתונים + LowProfile recurring-signup path** — הכי לא-חסום, אפס gates מהותיים. מייצר `RecurringId` אמיתיים שאפשר להשתמש בהם גם להמשך הבדיקות.
2. **Master webhook endpoint + handler** — כמעט לא חסום (רק אימות שם שדה Secret).
3. **Detail webhook handler — מסלול הצלחה** — אותו gate, ומחבר ל-`finalizePaidDonation` (עם התיקון מסעיף 7 — INSERT ישיר, לא UPDATE).
4. **Detail webhook handler — מסלול כשל** — **ממתין** ללכידת payload אמיתי (gate מפורש, סעיף 12).
5. **Pause/Resume/Cancel + Personal Area UI** — אחרי בדיקה אמפירית קצרה של `IsActive` בפועל (מומלץ, לא חוסם).
6. **Reconciliation Job** — nice-to-have, אחרי שהזרימה הליבתית יציבה.

**לא לממש עדיין — זהו תכנון, לא הוראה לפתוח PR.**
