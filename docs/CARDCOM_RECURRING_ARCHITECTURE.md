# CARDCOM_RECURRING_ARCHITECTURE.md — Recurring Charging Engine: Design

**סטטוס:** Design, לא Architecture. מרחיב את `docs/PAYMENTS_ARCHITECTURE_CONTEXT.md` (Compass, נעול) ואת `docs/CARDCOM_INTEGRATION.md` (LowProfile, v1 סגור ומוכח בפרודקשן) — לא סותר אף אחד מהם.
**תאריך:** 2026-08-11

## מה המסמך הזה כן

Design למודול חדש בתוך ה-**Charging Engine** (ר' Compass): גביית **הוראות קבע** מתורמים דרך CardCom. Lifecycle, Source of Truth, Webhooks, מודל נתונים קונספטואלי, והממשק מול `src/modules/billing/` הקיים.

## מה המסמך הזה לא

אין כאן קוד, DB migrations, REST API contracts, או UI. אלה יתוכננו בזמן המימוש. כל מקום שבו המסמך מזכיר שם endpoint, קובץ, או פעולת CardCom — זו כוונת מיקום/כיוון, לא מפרט סגור.

---

## יחס ל-Compass ול-LowProfile

הכל מתחת לסעיף "Engine 1 – Charging Engine" ב-Compass. שני העקרונות הכי רלוונטיים משם, שחוזרים כאן שוב ושוב:

* **Source of Truth:** "CardCom is the operational source of truth for payment execution and recurring billing status." זה נכתב ב-Compass **לפני** שהוראות קבע נבנו — כלומר הכוונה המקורית כבר כללה אותן.
* **Internal Model:** Compass כבר קורא לזה בשם — `Recurring Payment` ו-`Recurring Charge`, כל אחת עם lifecycle משלה, "must not be merged with another entity". המסמך הזה משתמש באותם שמות.

מ-LowProfile (`docs/CARDCOM_INTEGRATION.md`) יש שלושה לקחים ישירים שהמסמך הזה בונה עליהם, לא ממציא מחדש:

1. **Webhook נפרד לגמרי, לא דיסקרימינטור על אותו endpoint.** זה כבר נחקר ואומת (Architecture Change, 2026-08-10): LowProfile / Recurring / Invoices הן משפחות Webhook נפרדות אצל CardCom. ה-endpoint הקיים `/api/payment/webhook` שייך ל-LowProfile בלבד מטבעו. הוראות קבע צריכות **endpoint משלהן**.
2. **כאן `RecordType` הוא שדה אמיתי ומתועד** (`MasterRecurring`/`DetailRecurring`, מקור: [מרכז התמיכה של CardCom](https://support.cardcom.solutions/hc/he/articles/360017105139)) — בניגוד ל-LowProfile, שם `RecordType` הוכח נעדר מ-payload אמיתי. `webhook.dispatcher.js` (קיים, לא מחובר כרגע לשום route) נכתב במקור בהנחה הלא-נכונה שגם LowProfile משתמש ב-`RecordType`. זה בדיוק ה-endpoint שבו ההנחה הזו נכונה.
3. **תיעוד לבד לא מספיק — צריך payload אמיתי לפני שסוגרים מימוש.** LowProfile לימד את זה בצורה כואבת (ה-Bug של `responseCode` לא אמין ב-Redirect, שגרם לתרומה שנדחתה להיסמן כ-`paid`, מתועד ב-`CARDCOM_INTEGRATION.md`). כל קביעה במסמך הזה שמסתמכת רק על תיעוד CardCom, ולא על payload שנלכד בפועל, מסומנת במפורש למטה כ-**טעון אימות**.

---

## Lifecycle

### Recurring Instruction (Master) — "הוראת הקבע עצמה"

**Provisional lifecycle — עדיין לא סגור, במכוון.** שלושת המצבים למטה (`pending_confirmation`/`active`/`inactive`) הם המודל הפנימי ההגיוני ביותר כרגע. **עדכון 2026-08-14:** התקבל Master payload אמיתי (מוקפא ע"י `Operation=Update` על `RecurringId` קיים, לא ע"י יצירה חדשה) — אישר ש-Webhook נשלח אכן על **כל** שינוי שדה (כאן: שינוי `NextDateToBill` בלבד, לא `IsActive`), בדיוק כפי שהמאמר הרשמי כבר קבע ("אסור לפרש כ-created event בלבד"). **עדיין לא נצפה** מעבר ל-Inactive בפועל, ולא סיום טבעי — לכן ה-enum עצמו **נשאר Provisional במכוון**, גם אחרי שהתקבל payload אמיתי. אל תתייחסו לשלושת המצבים כ-enum סגור בזמן המימוש — הם נקודת פתיחה, לא מפרט.

```text
                 תורם משלים Recurring Checkout מול CardCom
                                  │
                                  ▼
                    pending_confirmation  (נוצר מקומית, ממתין ל-Webhook)
                                  │
                    MasterRecurring Webhook: ההוראה הפכה Active
                                  ▼
                              active  ──────────────┐
                                  │                  │
        MasterRecurring Webhook: ההוראה הפכה Inactive │  ביטול ביוזמת Hamonym
                                  │                  │  (API call ל-CardCom —
                                  ▼                  │   קיים? טעון אימות)
                             inactive  ◄──────────────┘
```

* **הקמה (`pending_confirmation`):** מקביל ל-`donations` שנוצרת ב-`pending` לפני שה-Webhook מגיע — אותו עיקרון בדיוק, לא המצאה חדשה. ההוראה נחשבת אמיתית רק אחרי אירוע `MasterRecurring` שמאשר אותה — לא לפני, ולא כתוצאה מ-Redirect. זה הלקח הישיר מ-Phase 2 של LowProfile: אם קיים Redirect ל-UX בתהליך ההרשמה להוראת קבע (ככל הנראה כן, כי CardCom מבוססת Redirect), הוא **UX בלבד מהיום הראשון** — לא כותב סטטוס, לא חוזר על הטעות שתוקנה ב-P1.
* **חיוב חודשי:** CardCom מבצעת את הגבייה בעצמה, לפי הלוח הפנימי שלה — Hamonym לא "מפעילה" חיוב חודשי, לא Polling, לא Cron שמנסה לחייב. זה ישיר מעיקרון "External Systems Own Their Domain" ב-Compass: CardCom אחראית על הוראות קבע, לא Hamonym. כל מה שמגיע ל-Hamonym עבור חיוב הוא **דיווח בדיעבד** דרך `DetailRecurring`.
* **כשל:** מדווח כאירוע `DetailRecurring` עם סטטוס שאינו `SUCCESSFUL` — ר' Recurring Charge למטה. זה לא משנה את סטטוס ה-`Recurring Instruction` עצמה (ה-Master) — כשל בחיוב בודד ≠ ההוראה הפכה Inactive. שני ה-lifecycle-ים נפרדים, כמו שה-Compass דורש ("must not be merged with another entity").
* **ביטול:** יכול לקרות משני כיוונים, ושניהם **טעוני אימות**:
  * **CardCom-initiated / דיווח:** הופעת `MasterRecurring` עם Inactive. הסיבה (תורם ביטל מול CardCom? כרטיס פג תוקף? מדיניות CardCom?) לא מתועדת במלואה — פתוח כבר ב-Compass (Open Questions).
  * **Hamonym-initiated:** האם קיים API call ל-CardCom לביטול יזום (לדוגמה מתוך מסך ניהול תורם)? זו בדיוק השאלה שה-Compass כבר משאיר פתוחה תחת "Cancel Recurring". לא להניח שהיא קיימת עד שנמצא ב-CardCom API v11 docs ומאומת.
* **השהיה (Pause/Resume):** **לא בהנחה שקיימת.** מופיעה כ-Open Question ב-Compass ולא נפתרה. עד לאימות מול CardCom (docs רשמי + payload/API call אמיתי) — אין להניח "Paused" כמצב נפרד מ-`inactive`. אם CardCom לא תומכת בזה כ-first-class capability, הפתרון (אם יידרש בעתיד) הוא Business Logic בצד Hamonym, לא state חדש שממציאים בצד CardCom.

### Recurring Charge (Detail) — "ניסיון גבייה בודד"

כל אירוע `DetailRecurring` מתייחס לניסיון גבייה אחד. הסטטוסים הגולמיים המתועדים ב-Compass:

`SUCCESSFUL` · `PENDINGFORPROCESSING` · `DEBTAUTOBILLING` · `LOSTDEBT` · `PAYBYOTHERE` · `ONHOLD`

זה **לא** בינארי `paid`/`failed`. זו הנקודה שכבר סומנה ב-`CARDCOM_INTEGRATION.md` (סעיף סדר מימוש, פריט 7): "כאן צריך State Machine אמיתי — `status != 'paid'` לא מספיק." המסמך הזה לא סוגר את מיפוי הסטטוסים הזה — זה בדיוק סוג ההחלטה שצריך payload אמיתי כדי לקבוע נכון.

**עדכון 2026-08-14 — ניסוי Failure ראשון בוצע בפועל, נגד `RecurringId=44197`:** `FlexItem.Price=6000` (מעל הסף המוכר מ-LowProfile חד-פעמי) → שני ניסיונות גבייה חזרו `Status=ONHOLD`, `ResposeCode=60000004` (קוד חברת האשראי, לא `ResponseCode` של CardCom), `ProcessID=-50` (שלילי — לעומת `ProcessID` חיובי בניסיון מוצלח קודם; **לא להסיק חוק כללי מ-n=1**). ממצאים Verified מכריעים:

* **`NumOfPaymentsAlreadyCharged` סופר ניסיונות, לא הצלחות.** עלה מ-2 ל-4 גם כששני הניסיונות היו `ONHOLD`. **אסור לפרש את השדה הזה כ"מספר תרומות מוצלחות"** — זו טעות מודל-נתונים אפשרית שהניסוי הזה מונע.
* **`IsActive` שרד כשל — Verified, לא רק הנחה.** נשאר `true` אחרי שני ניסיונות `ONHOLD` רצופים. מאשר את ההנחה שכבר הייתה במסמך ("כשל בחיוב בודד ≠ Inactive") — עכשיו עם ראיה.
* **`NextDateToBill` מתקדם לחודש הבא גם אחרי כשל.** CardCom לא "מנסה שוב באותו מחזור" באופן גלוי — לפחות לא דרך שינוי גלוי ב-`NextDateToBill`. משמעות: אם קיים retry אוטומטי, הוא לא בהכרח קורה *לפני* שהמחזור הבא כבר תוזמן — מנגנון ה-retry/dunning בפועל **עדיין Unknown**.
* **שתי רשומות `ONHOLD` בהפרש 8 דקות, כל אחת `BillingAttempts=1` בנפרד (לא `BillingAttempts=2` על אותה רשומה).** זה תומך בפרשנות ש-CardCom החזירה שני ניסיונות/מחזורים **נפרדים** (סביר: ה-job הופעל ידנית פעמיים) — **לא** הוכחה למנגנון retry-אוטומטי-פנימי של CardCom. לא להניח retry עד שיש הוכחה ברורה יותר.
* **`DetailRecurring` webhook של הכשל הזה — נלכד בפועל (2026-08-14, ניסוי שני).** ה-Gate שהיה חסום נסגר. עד עכשיו כל הממצאים למעלה הגיעו מ-`GetRecurringPaymentHistory` בלבד — עכשיו יש גם payload גולמי אמיתי מה-Webhook עצמו, נגד אותה הוראה (`RecurringId=44197`).

**עדכון 2026-08-14 (המשך) — `DetailRecurring` failure webhook נלכד, Verified מהמשטח עצמו לא רק מ-History:**

Transport זהה למה שכבר תועד (form-urlencoded). Form values שנלכדו (מסומן ע"י המדווח כ"רלוונטיים" — לא בהכרח הרשימה המלאה, לכן לא להסיק היעדרות שדה שלא מופיע כאן):

```text
RecordType=DetailRecurring
Status=ONHOLD
ResposeCode=60000004
ProcessID=-50
RecurringId=44197
RowID=387791
InternalDealNumber=258752910
PaymentNum=5
Sum=6000.00
BillingAttempts=1
ActualBillingType=CreditCard
AccountId=21479
CreateDate / LastBillDate / OriginalNextDateToBill — פורמט DD/MM/YYYY hh/mm
Secret=<configured recurring webhook secret>
+ שדות שלא נצפו קודם בכלל: DepartmentId, FinalDebitCoinId, InvoiceDescription,
  IsIncludesVAT, IsInvoiceCreate, IsReNewOrder, Quantity
```

**מה זה סוגר, Verified:**
* Contract בסיסי של `DetailRecurring` (RecordType/RecurringId/RowID/InternalDealNumber/PaymentNum/Sum) **זהה במבנה גם בכשל וגם בהצלחה** — אין שדות חובה שנעלמים.
* **`InternalDealNumber` קיים גם בכשל**, לא רק בהצלחה — סוגר את ה"דורש אימות" שהיה פתוח סביב מפתח ה-idempotency (ר' `CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md` סעיף 6).
* **שם שדה ה-Secret מאומת סופית: `Secret` (PascalCase)** — עד עכשיו היה ידוע רק "קיים בגוף ה-Form", לא השם המדויק.
* `ONHOLD`+`ResposeCode=60000004`+`ProcessID=-50`+`BillingAttempts=1` — תואם ב-100% למה שכבר נראה ב-`GetRecurringPaymentHistory` באותו ניסוי. **זו הפעם הראשונה שיש אישוש ישיר Webhook↔History בכשל** (בהצלחה זה כבר הוכח קודם דרך `InternalDealNumber`↔`TranzactionId`).

**מה נשאר לא הוכח, במכוון לא להסיק מעבר לזה:**
* רק `ONHOLD` נצפה. `LOSTDEBT`/`DEBTAUTOBILLING`/`PAYBYOTHERE`/`PENDINGFORPROCESSING`/`OTHER` — עדיין לא payload אמיתי.
* `ProcessID=-50` נצפה שוב, `BillingAttempts=1` — אין עדיין הוכחה לערכים אחרים או להתנהגות retry.
* לא הוכח אם הרשימה שנלכדה היא כל השדות שה-Webhook שולח בכשל, או תת-קבוצה.

---

## Source of Truth

זהה לעיקרון הקיים ב-Compass, בלי שינוי: **CardCom הוא מקור האמת התפעולי, גם לסטטוס ההוראה עצמה (Master) וגם לכל ניסיון גבייה (Detail).** Hamonym לא מחשבת, לא מנחשת, ולא "משלימה" סטטוס — רק קוראת את מה ש-Webhook מדווח, בדיוק כמו ש-`payment.handler.js` עושה עבור LowProfile.

מכאן נגזר ישירות:

* אין Polling כחלק מהזרימה הרגילה (Compass: Event Driven). Reconciliation Job לאיתור פערים אפשרי, אך לא כתחליף ל-Webhook.
* אם קיים Redirect UX בתהליך ההרשמה להוראת קבע — הוא לא כותב סטטוס. שוב: זה לא המלצה, זו טעות שכבר קרתה בפועל ב-LowProfile (P1, ₪5,001) ותוקנה. אין סיבה לחזור עליה כאן ביודעין.

---

## Webhooks

| ערוץ | Endpoint (כיוון, לא סגור) | RecordType אמין? | סטטוס |
|---|---|---|---|
| LowProfile (חד-פעמי) | `POST /api/payment/webhook` | **לא** — הוכח נעדר מ-payload אמיתי | ✅ קיים, מוכח בפרודקשן |
| Recurring (הוראות קבע) | endpoint נפרד, למשל `POST /api/payment/recurring-webhook` (כבר מוזכר ככיוון עתידי ב-`CARDCOM_INTEGRATION.md`) | **כן — Verified (2026-08-14), לא רק Documented-only.** payload אמיתי התקבל ל-`MasterRecurring`, ל-`DetailRecurring` הצלחה (`SUCCESSFUL`), **וגם ל-`DetailRecurring` כשל (`ONHOLD`)** — מול הוראת קבע test אמיתית (`RecurringId=44197`). | 🩹 שלד בלבד (`master-recurring.handler.js`, `detail-recurring.handler.js`) — עדיין לא קוד, אבל ה-contract שהם יצטרכו לממש כבר לא ניחוש, כולל מסלול הכשל |
| Documents | endpoint נפרד עתידי | לא נבדק | 🩹 שלד בלבד (`document.handler.js`) |

**שני ממצאים חדשים, Verified, קריטיים לכל endpoint עתידי — שונים מהותית מ-LowProfile:**

* **Transport: `application/x-www-form-urlencoded`, לא JSON.** ה-endpoint הקיים ל-LowProfile (`/api/payment/webhook`) מצפה ל-body JSON. Recurring webhook עתידי יצטרך body parsing שונה — לא ניתן להעתיק את ה-route הקיים כמו שהוא.
* **`Secret` מגיע כשדה בתוך ה-Form Body, בשם המדויק `Secret` (PascalCase) — Verified**, לא כ-`?secret=` ב-query string. זה **שונה מ-LowProfile** (ששם ה-secret נוסע ב-URL, `WebHookUrl` שכולל `?secret=`). `cardcom.validator.js::validateWebhookSecret` הקיים בודק `req.query.secret` — תבנית הזו **לא** ניתנת להעתקה ישירה ל-Recurring; endpoint עתידי יצטרך לבדוק `body.Secret`, לא query string. זה היה מתויג באותו קובץ קיים כ-"ASSUMPTION, not yet confirmed" — עכשיו סגור עם תשובה אמפירית כולל השם המדויק (נלכד ב-`DetailRecurring` failure webhook, 2026-08-14).

**נקודות חשובות:**

* שלושת ה-handlers (`master-recurring.handler.js`, `detail-recurring.handler.js`, `document.handler.js`) **כבר קיימים כשלד no-op** ב-`src/modules/payment/handlers/` — נבנו מראש לקראת השלב הזה. Reuse before Replace: הם המקום הטבעי למימוש, לא קבצים חדשים.
* `webhook.dispatcher.js` הקיים (עם ה-`switch(payload.RecordType)`) **נכתב במקור עבור ה-endpoint הלא נכון** (LowProfile) ולכן הוסר מהמסלול שלו. אבל הלוגיקה שלו — ניתוב לפי `RecordType` — היא בדיוק מה שנדרש ל-Recurring webhook, כי שם `RecordType` כן אמין. **הכיוון הנכון הוא לחבר את ה-dispatcher הקיים ל-endpoint החדש**, לא לכתוב דיספצ'ר שני.
* אותו עקרון Idempotency + Audit-first שכבר הוכח ב-LowProfile (Secret Validation → Idempotency Check → Audit Log → Business Handler, מהתרשים ב-Compass) חל באותה מידה כאן. השאלה אם להשתמש **באותה** טבלת `cardcom_webhook_events` (שכבר יש בה עמודת `record_type` מוכנה בדיוק לזה) או בטבלה נפרדת — היא החלטת schema, לא ארכיטקטורה, ונשארת לזמן המימוש. אבל **צורת** ה-idempotency key חייבת ללמוד מ-LowProfile: hash גולמי של JSON הוכח שביר (JSONB לא שומר סדר מפתחות) — המזהה העסקי האמיתי (מה שה-Compass קורא Recurring Payment/Charge ID) צריך להיות המפתח הראשי, לא hash, בדיוק כמו ש-`TranzactionId` הוא המפתח ל-Payment.
* **טעון אימות:** האם קריאת ה-Recurring Create תומכת ב-`WebHookUrl` per-request (כמו ש-LowProfile מקבל, ר' `createDonation`), או שה-URL מוגדר פעם אחת במסוף CardCom עבור כל ה-Recurring traffic? זה קובע אם נדרשת אותה עבודה שנעשתה עבור LowProfile (הוספת `WebHookUrl` ל-payload) או הגדרת מסוף חד-פעמית.

---

## מודל הנתונים (קונספטואלי — לא Schema)

שתי ישויות דומיינ חדשות, בשמות שה-Compass כבר קבע:

**Recurring Instruction** (= "Recurring Payment" ב-Compass) — ההוראה עצמה. שייכת לתורם + לקמפיין/ישות, נושאת את המזהה של CardCom להוראה, וסטטוס מקומי שמשקף (לא קובע) את מה ש-`MasterRecurring` דיווח לאחרונה.

**Recurring Charge** (= "Recurring Charge" ב-Compass) — ניסיון גבייה בודד, קשור ל-Recurring Instruction שלו, נושא את הסטטוס הגולמי מ-`DetailRecurring` (לא ממופה מראש ל-`paid`/`failed` — ר' Lifecycle למעלה).

**הקשר ל-`donations` — המלצת המסמך:** גבייה חודשית מוצלחת (Recurring Charge שהסתיים ב-`SUCCESSFUL`) היא, מבחינת המשמעות העסקית, תרומה — צריכה קבלה, צריכה לעדכן `campaigns.current_amount`/`supporters_count`, צריכה להופיע להיסטוריית התורם. `donations.service.js::finalizePaidDonation` כבר עושה בדיוק את זה, כבר idempotent (constraint על `receipts.donation_id`), וכבר מוכח בפרודקשן. ההמלצה: **כל Recurring Charge מוצלח סוגר/יוצר שורת `donations`** (עם קישור חזרה ל-Recurring Instruction שהפיקה אותה), **דרך `finalizePaidDonation` הקיים** — לא בניית מסלול מקביל של receipt/aggregate-update ייעודי ל-Recurring. זו הרחבה ישירה של אותו עיקרון Reuse before Replace שכבר הוכח נכון ב-LowProfile (`markDonationPaid` עוטף את `finalizePaidDonation` במקום לשכתב SQL). זו **המלצת Design**, לא Schema סגור — הצורה המדויקת (עמודה חדשה? טבלת קישור?) נשארת להחלטת מימוש.

`Recurring Instruction` עצמה (ה-Master, לא כל charge) **אינה** שורת `donations` — היא ישות נפרדת (בדיוק כמו ש-Compass דורש: "must not be merged with another entity"). מה שנכנס ל-`donations` זה רק תוצרי הגבייה בפועל.

**עדכון 2026-08-14 — מזהי Correlation ל-Recurring Charge, Verified משני משטחי API בו-זמנית:** `DetailRecurring` webhook אמיתי ו-`GetRecurringPaymentHistory` (REST v11) נבדקו זה מול זה על אותו חיוב בפועל. תוצאה: **`DetailRecurring.InternalDealNumber` ≡ `GetRecurringPaymentHistory.TranzactionId`** (אותו ערך מספרי, שני שמות שונים בשני משטחי API) — ו-`RowID` זהה בשניהם. כלומר יש שרשרת מזהים מלאה ומאומתת: `RecurringId → RowID → TranzactionId/InternalDealNumber`. זה המועמד המעשי ביותר למפתח idempotency/correlation של Recurring Charge — עדיין לא נבחר סופית (זו החלטת מימוש), אבל כבר לא ניחוש.

**נשאר Unknown, לא נסגר בטעות:** `ReturnValue` לא נצפה בפועל בשני ה-Webhooks (Master/Detail) — אבל **ההוראה שנבדקה מעולם לא הוגדרה עם `ReturnValue` אמיתי ב-Create שלה** (ראו evidence מוקדם יותר: "בניסוי שלנו `ReturnValue=null`"). לכן זו **לא** הוכחה שה-Webhook לא נושא `ReturnValue` — רק שאין לנו עדיין ניסוי שבו הוא הוגדר בכלל. דורש ניסוי ייעודי (Create חדש עם `ReturnValue` אמיתי) לפני שקובעים משהו.

---

## הקשר ל-`src/modules/billing/` הקיים

**התשובה הקצרה: אין ממשק ביניהם, ובכוונה.**

`src/modules/billing/` הקיים (`billing.service.js`, `cardcom.service.js`) **אינו** ה-Billing Engine שה-Compass מגדיר (Tranzila MASAV, גביית עמלת Hamonym מהעמותה). זה כבר תועד במפורש ב-`CARDCOM_INTEGRATION.md`: מודול נפרד, קדם ל-Compass, שאוגר **טוקן כרטיס ברמת עמותה** (`createOpenFieldsLowProfile`, `Operation: CreateToken`) — הישות שנשמרת שם היא **הארגון**, לא התורם.

הישות שהמסמך הזה מתאר — Recurring Instruction — שייכת ל-**Charging Engine**: הישות היא **התורם**, המנגנון הוא CardCom Recurring LowProfile (`MasterRecurring`/`DetailRecurring`), לא OpenFields.

לכן, לפי אותו עיקרון Engine Independence שכבר קיים ב-Compass בין Charging ל-Billing — הוא חל כאן באותה מידה בין שני "האזורים" הללו בתוך ה-Charging Engine עצמו:

* **אין** טבלה משותפת בין Recurring Instruction לבין `entity_billing` (טוקן העמותה).
* **אין** Webhook endpoint משותף. בפרט: `billing.controller.js::cardcomCallback` הוא stub מת (`console.log` בלבד, בלי Secret validation, בלי Idempotency, בלי Audit — מתועד ככזה ב-`CARDCOM_INTEGRATION.md`'s Current State). **אסור** להשתמש בו או להרחיב אותו עבור Recurring Webhook — ה-webhook החדש בונה מהיסוד באותה רמת קפדנות שכבר הוכחה ב-`/api/payment/webhook`, וחי ב-`src/modules/payment/`, לא ב-`src/modules/billing/`.
* **אין** handler משותף.
* השיתוף היחיד הלגיטימי, אם בכלל, הוא ברמת תשתית גנרית בלבד — למשל HTTP wrapper ל-CardCom API (`cardcom.client.js` הקיים כבר בתוך `src/modules/payment/cardcom/`) — לא ברמת לוגיקה עסקית. זה מקביל בדיוק לאיך ש-Charging ו-Billing (Compass) לא חולקים לוגיקה, רק "שניהם נוגעים בכסף".

מסמך זה לא נוגע בארכיטקטורה של `src/modules/billing/` — רק קובע שהיא לא חלק מהזרימה של Recurring Instructions.

---

## Open Questions (טעונות אימות מול CardCom — payload/API אמיתי, לא רק תיעוד)

יורש ישירות מ-Compass (Open Questions › CardCom), עדיין לא נפתר:

* Pause / Resume — קיים כ-capability אצל CardCom? אם לא — Business Logic בצד Hamonym, לא state של CardCom.
* Cancel Recurring — יזום ע"י Hamonym: קיים API call? מה ה-response contract?
* Token Replacement — כרטיס שפג תוקף/הוחלף, איך זה מתעדכן בהוראה קיימת.
* Chargeback / Refund Flow עבור חיוב שכבר בוצע דרך הוראת קבע.

נוספות, ספציפיות למסמך הזה:

* מיפוי מדויק של סטטוסי `DetailRecurring` (`PENDINGFORPROCESSING`/`DEBTAUTOBILLING`/`LOSTDEBT`/`PAYBYOTHERE`/`ONHOLD`) ל-state machine בפועל — אילו סופיים, אילו ממתינים לאירוע נוסף.
* האם קריאת ה-Recurring Create תומכת ב-`WebHookUrl` per-request כמו LowProfile, או דורשת הגדרת מסוף.
* מה בדיוק גורם ל-`MasterRecurring` Inactive (ביטול תורם/כרטיס פג/מדיניות CardCom) — משפיע על מה Hamonym צריכה להציג לצוות התומכים.
* האם ה-Redirect UX (אם קיים) בתהליך ההרשמה להוראת קבע חושף אותן בעיות אמינות (`ResponseCode`) שכבר נמצאו ב-LowProfile — לבדוק מראש, לא לגלות שוב באירוע production.

עד לאימות — **אל תמומש** מנגנון שמניח תשובה לאחת מהשאלות האלה.

---

## Next Step

**לא DB, לא API.** השלב הבא הוא מחקר ממוקד מול CardCom שסוגר את ה-Recurring Contract האמיתי — בדיוק רשימת ה-Open Questions למעלה: Create (הקמת הוראה, כולל `WebHookUrl` per-request או לא), Master webhook (payload אמיתי — אילו מצבים באמת קיימים, לא רק שלושת אלה שהונחו למעלה), Detail webhook (payload אמיתי לכל סטטוס, לא רק השמות מהתיעוד), Cancel, Pause/Resume, Token Replacement. רק אחרי שיש payloads/API responses אמיתיים לכל אחד מאלה — יש בסיס לתכנן Schema ו-API contract בלי לנחש.
