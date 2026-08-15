# CARDCOM_OPERATIONAL_PROCESSES.md — Reconciliation, Recovery, Jobs, Admin Operations

**סטטוס:** Design + Audit. מרחיב את `docs/PAYMENTS_ARCHITECTURE_CONTEXT.md` (Compass), `docs/CARDCOM_INTEGRATION.md` (LowProfile), ו-`docs/CARDCOM_RECURRING_ARCHITECTURE.md`/`CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md` (Recurring) — לא סותר אף אחד מהם.
**תאריך:** 2026-08-15/16 (עבודה עצמאית, היוזר לא זמין)

## מה המסמך הזה כן

מיפוי מלא של כל התהליכים האוטומטיים/תפעוליים סביב CardCom — מה קורה כשמשהו נכשל באמצע, איך מזהים פער בין CardCom ל-Hamonym, ואילו Jobs/מסכי ניהול נדרשים כדי שהמערכת תהיה עמידה ולא רק "עובדת כשהכל הולך חלק".

## מה המסמך הזה לא

אין כאן מימוש של Reconciliation שמתקן כסף אוטומטית, אין UI מלא, ואין migration שרץ בלי אישור. כל מקום שבו נדרשת החלטה כספית/מוצרית מסומן כ-**Open Decision**.

---

## חלק א' — Audit: שרשרת CardCom הקיימת, מאומת מול קוד+מיגרציות בפועל

לא הסתמכתי על המסמכים הקודמים בלבד — כל שורה כאן נבדקה נגד הקוד החי (2026-08-14/15).

### A1. LowProfile (תרומה חד-פעמית / תשלום ראשון של הוראת קבע)

| | |
|---|---|
| **מפעיל** | `POST /api/donations` → `donations.service.js::createDonation` |
| **API CardCom** | `POST /api/v11/LowProfile/Create` |
| **Identifiers** | `LowProfileId` (מוחזר סינכרונית), `ReturnValue=donationId` |
| **נכתב ל-DB** | `donations` (`status='pending'`, `low_profile_id`) |
| **Idempotency** | אין צורך — קריאה חד-פעמית ביצירה |
| **כשל חלקי** | אם הקריאה ל-CardCom נכשלת (network/ResponseCode≠0) — `donations.status='failed'` נכתב מיד, סינכרוני. **אין מצב "תקוע"** כאן. |
| **שחזור אירוע כיום** | ✅ `GetLpResult` (כבר בשימוש, `cardcom.client.js`) — ניתן לשאול לפי `low_profile_id` בדיעבד, לא רק ב-webhook החי. |

### A2. LowProfile Webhook → אימות → סימון paid/failed

| | |
|---|---|
| **מפעיל** | `POST /api/payment/webhook` ← CardCom (WebHookUrl per-request) |
| **API CardCom** | קריאה חוזרת ל-`GetLpResult` (לא סומכים על ה-webhook payload עצמו) |
| **Identifiers** | `ReturnValue`(=donationId) מזהה את השורה; `TranzactionId`/`LowProfileId` idempotency |
| **נכתב ל-DB** | `donations.status='paid'`+`provider_reference`, `campaigns.current_amount`/`supporters_count`, `cardcom_webhook_events` (audit+idempotency) |
| **Idempotency** | **שתי שכבות**: (1) `idempotency.service.js::claim` על `TranzactionId`→`LowProfileId`→hash, (2) `markDonationPaid`'s `WHERE status != 'paid'` ברמת ה-donation עצמו |
| **✅ תוקן (2026-08-15) — היה כשל חלקי, ממצא Audit אמיתי** | `markDonationPaid` עטף עכשיו את שלוש הכתיבות (`donations` UPDATE → `campaigns` UPDATE → receipt INSERT) ב-**transaction אחת** (`withTransaction`, client ייעודי, אותו pattern כמו `job-runner.js`). `emailService.queue()` יוצא **רק אחרי COMMIT**, מחוץ לטרנזקציה בכוונה — כשל תור/שליחה לא יכול להפוך תשלום מוצלח לכישלון (עטוף ב-try/catch שלא זורק). ה-guard `WHERE status != 'paid'` **לא השתנה** — עכשיו הוא בטוח באמת: אחרי התיקון `paid`⇔"מסונכרן במלואו" הוא עובדה מבנית אחת (הכל קורה או שהכל מתגלגל אחורה), כך ש-redelivery על שורה לא-`paid` מתקן אותה כראוי במקום להיחסם. **הסתייגות:** שורות `paid` היסטוריות מלפני התיקון אינן מכוסות רטרואקטיבית — נשארות תלויות ב-A8/B11 (`aggregate-consistency`) כרשת ביטחון. נבדק ב-42/42 תרחישי regression נגד ה-DB האמיתי (תרומה רגילה, redelivery, receipt קיים מראש, rollback בשלוש נקודות שונות, email שנכשל אחרי COMMIT, concurrent execution). |
| **שחזור אירוע כיום** | ✅ `GetLpResult` שוב, לפי `low_profile_id` השמור. |

### A3. Recurring Signup (Create)

| | |
|---|---|
| **מפעיל** | `payment.handler.js` אחרי LowProfile מוצלח, אם `donation.recurring_instruction_id` קיים → `recurring.service.js::completeSignup` |
| **API CardCom** | Name-to-Value `RecurringPayment.aspx`, `Operation=NewAndUpdate` |
| **Identifiers** | `AccountId`+`RecurringId` (מוחזרים סינכרונית) |
| **נכתב ל-DB** | `recurring_instructions.status='active'`+`cardcom_account_id`+`cardcom_recurring_id`+`total_installments`(snapshot) |
| **Idempotency** | `if (row.cardcom_recurring_id \|\| row.status === 'completed') return;` — guard מפורש |
| **⚠️ כשל שקט — ממצא Audit, עכשיו עם detection (2026-08-15)** | `completeSignup` נקרא בתוך `try/catch` ב-`payment.handler.js` עם `console.error` בלבד. כשל CardCom-side (network/`ResponseCode≠0`) כבר מטופל סביר (`status='creation_failed'`+`failure_reason`, גלוי). התרחיש שנשאר בעייתי: קריסה *לפני* הכתיבה הראשונה משאירה `status='pending_payment'` (לא אפילו `pending_creation`) **לצמיתות**. **✅ עכשיו מזוהה** — `src/jobs/stuck-recurring-signups.job.js` (החליף את ה-B6 המקורי למטה): `status IN ('pending_payment','pending_creation') AND EXISTS donation.status='paid'` תואם. **Detect/report בלבד, במכוון** — לא קורא ל-`createRecurring` אוטומטית, כי אין דרך דטרמיניסטית לדעת אם CardCom כבר יצרה הוראה בפועל לפני הקריסה (ר' Open Decision B6 המעודכן למטה). |
| **שחזור אירוע כיום** | ⚠️ חלקי — `GetRecurringPaymentHistory`/`GetRecurringPayment` לפי `RecurringId`, אבל **רק אם** ה-`RecurringId` כבר ידוע (אם ה-Create עצמו נכשל בלי תיעוד, אין דרך היום לדעת אם CardCom בכל זאת יצרה הוראה). |

### A4. MasterRecurring Webhook

| | |
|---|---|
| **מפעיל** | `POST /api/payment/recurring-webhook` ← CardCom |
| **נכתב ל-DB** | `recurring_instructions.status` (`active`/`paused`/`cancelled`/`completed`/`inactive` — Phase 7 logic), `next_date_to_bill` |
| **Idempotency** | claim() ברמת ה-webhook (אבל ר' ממצא למטה) + הלוגיקה עצמה idempotent מטבעה (UPDATE נטול side-effects אחר) |
| **⚠️ ממצא Audit — idempotency claim() לא באמת משתמש במזהה עסקי כאן** | `idempotency.service.js::buildKey` בודק `TranzactionId`→`LowProfileId`→hash. **ל-Master/Detail payloads אין אף אחד מהשניים** (יש `RecurringId`/`InternalDealNumber`/`RowID`) — כלומר **כל** webhook של הוראות קבע נופל ל-hash fallback, לא לזיהוי עסקי אמיתי. לא באג פונקציונלי (ה-handler-level idempotency של Detail כבר מכסה את הסיכון האמיתי), אבל שם ה-`key_type` שיופיע ב-`cardcom_webhook_events` יהיה `payload_hash` כמעט תמיד עבור Recurring — משפיע על שאילתות Reconciliation שינסו לחפש לפי מזהה עסקי. |
| **שחזור אירוע כיום** | ✅ `GetRecurringPayment` לפי `RecurringId`. |

### A5. DetailRecurring Webhook (הצלחה/כשל)

| | |
|---|---|
| **נכתב ל-DB** | `donations` (INSERT ישיר, לא UPDATE) — `paid`/`failed`, `provider_reference=InternalDealNumber`, `provider_row_id`, `provider_status_code` |
| **Idempotency** | **Handler-level, לא רק outer claim():** `WHERE recurring_instruction_id=$1 AND provider_reference=$2` — זו ההגנה האמיתית, לא תלויה ב-idempotency_key החיצוני |
| **✅ תוקן (2026-08-15) — היה אותו כשל-חלקי כמו A2** | ה-INSERT (donation)+campaign UPDATE+receipt INSERT עטופים עכשיו באותה טרנזקציה אחת (`withTransaction`), אותו תיקון ואותה סיבה כמו A2. Redelivery של אותו `DetailRecurring` payload נבדק ב-regression — יוצר donation אחד בלבד, aggregate מתעדכן פעם אחת. |
| **שחזור אירוע כיום** | ✅ `GetRecurringPaymentHistory` לפי `RecurringId` — כבר Verified שה-`TranzactionId`(History)≡`InternalDealNumber`(Webhook), כך שאפשר להשוות. |

### A6. Pause / Resume / Cancel

| | |
|---|---|
| **מפעיל** | קריאה יזומה מקוד Hamonym (`recurring.service.js`) — **לא** webhook-driven |
| **נכתב ל-DB** | `status`, רק **אחרי** `ResponseCode='0'` מ-CardCom — כשל לא כותב state |
| **Idempotency** | no-op מפורש אם כבר באותו מצב |
| **שחזור** | לא רלוונטי — אלה פעולות יזומות, לא אירועים לשחזר |

### A7. Receipt/Email

| | |
|---|---|
| **מפעיל** | `finalizePaidDonation` → `emailService.queue()` |
| **⚠️ ממצא Audit קריטי — fire-and-forget אמיתי, לא רק בתיאוריה** | `email.service.js::queue` הוא `setImmediate` + `.catch(console.error)`. **אין queue table, אין retry, אין backoff.** כשל שליחה (provider down, rate limit) נרשם ל-`email_logs.status='failed'` **ולא קורה שום דבר אחר**. אף job/תהליך לא קורא כיום את `email_logs WHERE status='failed'`. |
| **Document webhook (קבלה/חשבונית מ-CardCom עצמה)** | `document.handler.js` הוא **stub ריק לגמרי** (`exports.handle = async () => {}`) — לא ממומש בכלל, לא רק "לא בדוק". |

### A8. Data Consistency — נקודת תורפה מבנית

`campaigns.current_amount`/`supporters_count` מתעדכן **בנפרד, בכל אחד מ-4 code paths שונים**: `markDonationPaid` (LowProfile), `detail-recurring.handler.js` (Recurring), `createManualDonation`, `handleMockComplete`. **אין מקור אמת מחושב** (למשל VIEW/trigger שמחשב מ-`donations` בפועל) — כל באג/כשל-חלקי באחד מהם יוצר drift שקט. זה בדיוק הלקח שכבר נלמד פעם אחת בכאב (Phase 1 cleanup incident, memory: "לחשב aggregate מחדש מ-donations כמקור אמת, לא +/- ידני").

---

## חלק ב' — Operational Processes Map

לכל תהליך: `Trigger | Frequency | Source of Truth | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action`.

### B1. Payment Reconciliation (LowProfile)
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job | יומי (מוצע) | CardCom | `GetLpResult` לפי `low_profile_id` לכל donation `pending`>X שעות | **Detect-only בשלב 1** — כותב ל-`reconciliation_findings` (מוצע), לא נוגע ב-`donations` | לפי `low_profile_id`, טבעי | שגיאת CardCom API → מדלג, מנסה שוב בריצה הבאה | ✅ טבלת findings | `Run now` (read-only) |

### B2. Recurring Reconciliation (הוראות)
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job | יומי | CardCom | `GetRecurringPayment` לכל `cardcom_recurring_id` פעיל מקומית | Detect-only — משווה `status`/`next_date_to_bill`/`NumOfPaymentsAlreadyCharged` | לפי `RecurringId` | — | ✅ | `Run now` |

### B3. Webhook Recovery (הגיע, processing נכשל)
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job + Admin | **✅ מאושר: כל 15 דקות** | `cardcom_webhook_events.error IS NOT NULL` | אין קריאת CardCom נדרשת — המידע כבר אצלנו (raw_payload) | Re-run אותו handler על ה-`raw_payload` השמור | claim() כבר קיים, redelivery מלאכותי בטוח | ריצה חוזרת נכשלת → נשאר error, לא retry אינסופי (max attempts) | ✅ קריטי | `Retry processing` (מבוקר, לא מסה) |

**✅ סמנטיקת מדדים תוקנה (2026-08-15).** `payment.handler.js::handle` היה "שקט" — `return` בלי לזרוק גם כשלא היה מה לתקן (payload בלי `ReturnValue`, או עסקה שעדיין לא הצליחה אצל CardCom) — אז "לא זרק" נספר כ-`recovered` גם כשבפועל שום דבר לא תוקן. `handle()` מחזיר עכשיו outcome object (`{outcome: 'paid'|'already_paid'|'not_paid_at_cardcom'|'no_donation_id'}`), שינוי חוזה תוסף בלבד — הקריאות הקיימות (`payment.controller.js`, `webhook.dispatcher.js`) ממשיכות ל-await ולהתעלם מהערך. הדוח של ה-job עצמו הוחלף מ-`{checked, recovered, stillFailing}` ל-`{examined, recovered, alreadyConsistent, processed, notRouted, failed}`:
- `recovered` — donation שבאמת עבר `pending→paid` בריצה הזו (המסלול היחיד שבו יש מידע עשיר מספיק כדי לדעת).
- `alreadyConsistent` — נבדק ולא היה מה לתקן (LowProfile route בלבד).
- `processed` — מסלול Recurring/Document רץ בלי לזרוק; **לא** נטען שתוקן משהו — 3 ה-handlers שם (`master-recurring`/`detail-recurring`/`document`) לא מחזירים תוצאה עשירה יותר, לא הורחב חוזה שלהם בסבב הזה.
- `notRouted` — `webhookDispatcher` לא מצא handler ל-`RecordType` (הענף השקט שתועד ב-A4/A6 הישן) — **לא** נספר כהצלחה, ה-`error` נשאר רשום במקום להתנקות.

### B4. Lost Webhook Detection (CardCom ביצעה, Webhook לא הגיע כלל)
זו בעצם התוצר הצדדי של B1/B2 — לא job נפרד. אם `GetLpResult`/`GetRecurringPaymentHistory` מראה עסקה ש-**אין לה** שורת `donations` תואמת (`provider_reference` לא קיים), זה בדיוק "webhook אבד". **Detect-only**, לא auto-repair.

### B5. Stale Pending Donations
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job | **✅ מאושר: כל שעה** | `donations.status='pending' AND created_at < NOW()-interval` | `GetLpResult` (אותו מנגנון כמו B1, אפשר לאחד) | Detect-only | לפי `low_profile_id` | — | ✅ | `Run now` |

### B6. Stuck Recurring Signups — ✅ ממומש (2026-08-15), detect-only
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job (`stuck-recurring-signups`, טרם מחובר ל-scheduler) | **✅ מאושר: כל שעה** (הועלה מ"יומי עד dedup" אחרי שה-dedup מומש — ר' חלק י') | `recurring_instructions.status IN ('pending_payment','pending_creation') AND EXISTS donation.status='paid'` | אין קריאת CardCom — כל המידע כבר מקומי | כותב ל-`reconciliation_findings` (`finding_type='stuck_recurring_signup'`) בלבד — לא נוגע ב-`recurring_instructions`/`donations` | לא רלוונטי (detect-only, לא כותב state) | — | ✅ קריטי | ⚠️ **Open Decision** — ר' למטה |

**עודכן מה-B6 המקורי (2026-08-15):** התנאי המקורי (`pending_creation AND updated_at < NOW()-interval`) היה מפספס את התרחיש הגרוע יותר — קריסה *לפני* `completeSignup`'s הכתיבה הראשונה משאירה `status='pending_payment'`, לא מגיעה אפילו ל-`pending_creation`. התנאי החדש תופס את שני התתי-מקרים גם יחד, ומבחין "מה שעדיין עובר checkout" (`pending_payment` בלי donation `paid`) מ"תשלום הצליח אבל ההוראה לא נסגרה" (התנאי המלא) — נבדק ב-regression מול שלושה מצבים (תקוע/בריא/עדיין-ב-checkout), התוצאה נכונה בכל השלושה.

**Open Decision B6 (לא נפתר):** אם `completeSignup` נכשל אחרי ש-CardCom כבר יצרה בפועל הוראת קבע (הקריאה הצליחה אצל CardCom, אבל ה-UPDATE המקומי נכשל) — **אין לנו דרך היום לחפש "כל ה-RecurringId-ים תחת AccountId מסוים"** בלי לדעת אותם מראש. זו הסיבה שה-job לא קורא אוטומטית ל-`createRecurring` בתור recovery — retry כזה עלול ליצור הוראת קבע כפולה בלי שיש דרך לבדוק מראש אם אחת כבר קיימת. נשאר Detect/report בלבד עד שאחד משניים ייפתר: endpoint חדש מ-CardCom, או החלטה מוצרית להסתפק ב-alert+תיקון ידני.

### B7. Receipt/Document Recovery
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job | כל שעה | `donations.status='paid' AND` אין `receipts` תואם, **או** `email_logs.status='failed'` | אין (מידע מקומי בלבד) | קריאה חוזרת ל-`finalizePaidDonation`/`emailService.send` (לא queue) | `receipts` UNIQUE(donation_id) כבר idempotent | max retries, אז מסומן ל-admin | ✅ | `Retry` |

### B8. Recurring Failures (מעבר ל-`failed` donation)
Verified: CardCom **לא** מנסה שוב אוטומטית בתוך אותו מחזור (NextDateToBill מתקדם גם אחרי כשל) — retry/dunning, אם יידרש, הוא **Hamonym decision עתידי**, לא קיים היום. **Open Decision**, לא בהיקף העבודה העצמאית הזו (משנה תזרים כספי).

### B9. Natural Recurring Completion
**Event-driven, לא Reconciliation** — Phase 7 כבר סוגר את זה בזמן אמת דרך `MasterRecurring`. תפקיד ה-Reconciliation (B2) הוא **רק** רשת ביטחון: אם Master אבד, B2 יגלה `NumOfPaymentsAlreadyCharged >= total_installments-1` מקומית מול CardCom ויתקן.

### B10. Payment Method / מוחלפים
**Verified (מ-Contract Research):** CardCom מנהלת מוחלפים אוטומטית עבור CardCom-managed billing — Hamonym לא צריכה לצרוך `GetMuhlafim*`. **מסקנה: אין job נדרש כאן מעבר ל-Monitoring כללי** (B12) — אם כרטיס נכשל סופית, זה כבר מגיע כ-DetailRecurring כשל (B8/הקיים).

### B11. Data Consistency (Aggregate Repair)
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Scheduled Job | **✅ מאושר: פעם ביום** | `donations` (מקור אמת פנימי, לא CardCom) | אין | Detect-only: `SUM(amount) WHERE status='paid'` מול `campaigns.current_amount` | — | — | ✅ קריטי | `Repair` — **פעולה כספית-פנימית, לא יוצרת חיוב, אבל דורשת אישור מפורש בכל הרצה (לא auto)** |

### B12. Monitoring/Health
| Trigger | Frequency | SoT | Read API | DB impact | Idempotency | Failure handling | Admin visibility | Admin action |
|---|---|---|---|---|---|---|---|---|
| Passive (נגזר מ-jobs אחרים + webhook timestamps) | תמידי | `cardcom_webhook_events` timestamps, `job_runs` (מוצע) | `LowProfile/Create` test call קיים (`testCardcomConnection`) | — | — | — | ✅ ראשי המסך | — |

---

## חלק ג' — Source of Truth: אימות מול APIs אמיתיים

**העיקרון שהיוזר ביקש לאמת:**
- CardCom = מקור אמת לסליקה. ✅ **אפשרי במלואו** — כל event (LowProfile/Master/Detail) ניתן לשחזור לאחור דרך API אמיתי (`GetLpResult`/`GetRecurringPayment`/`GetRecurringPaymentHistory`), לא רק Webhook.
- Hamonym DB = מקור אמת למודל העסקי. ✅ תקף — `total_installments`/`billing_anchor_day`/`status` הפנימי הם עובדות של Hamonym, CardCom לא יודעת עליהן.
- Webhooks = מסלול ראשי בזמן אמת. ✅ מאומת לאורך כל הפרויקט (Phase 1-7).
- Reconciliation = רשת ביטחון. ✅ **אפשרי, עם הסתייגות אחת:** B6 (RecurringId שנוצר ב-CardCom בלי שנשמר מקומית) **אין** API שמאפשר "תן לי את כל ה-RecurringId תחת AccountId X" — הרשת הזו יש בה חור אחד ידוע. שאר התהליכים — כן ניתנים למימוש אמיתי, לא תיאורטי.

---

## חלק ד' — Reconciliation APIs, Verified/Documented/Unknown

| API | שימוש | סטטוס |
|---|---|---|
| `GetLpResult` | LowProfile — שחזור תוצאת עסקה לפי `low_profile_id` | **Verified** — כבר בשימוש חי ב-`payment.handler.js`, לא רק לזמן אמת |
| `GetRecurringPayment` (REST v11) | מצב נוכחי של הוראה (`IsActive`/`NextDateToBill`/`NumOfPaymentsAlreadyCharged`) | **Verified** (2026-08-14, דרך Thunder — פורמט הבקשה המדויק **לא** נמצא על ידי מקוד; GET רגיל נכשל 405/415/400/401 בכל הניסיונות. **Unknown למימוש: הפורמט המדויק שעבד ב-Thunder לא תועד בקוד** — נדרש מהיוזר לפני מימוש B2) |
| `GetRecurringPaymentHistory` | היסטוריית חיובים להוראה, כולל כשלים | **Verified** (בשימוש ידני לאורך הפרויקט) — פורמט תאריך `DDMMYYYY` ללא מפרידים, שונה מכל endpoint אחר |
| `ChangeStatusForHistoryRecurringToIrrevocable` | לא רלוונטי — פועל על רשומת History בודדת, לא נוגע ב-Reconciliation |
| `GetMuhlafim*` (×3) | מוחלפים | **לא נדרש** — B10 סגור, CardCom מנהלת בעצמה |
| `IsBankNumberValid` | לא רלוונטי לזרימה הנוכחית | — |
| RecurringId enumeration ("כל ה-RecurringId תחת AccountId") | **לא נמצא endpoint** | **Unknown — Gate אמיתי ל-B6** |

**⚠️ Gate מפורש לפני מימוש B2 (Recurring Reconciliation):** הפורמט המדויק של `GetRecurringPayment` REST v11 request (headers/body/method) לא הצליח להיסגר על ידי בעצמאות — הצליח רק ב-Thunder Client של היוזר. **לא ממציא ניחוש נוסף** (כבר 4 ניסיונות כושלים מתועדים בזיכרון הפרויקט) — ממתין לפורמט המדויק מהיוזר לפני שממש B1/B2 בקוד אמיתי. התכנון/הטבלאות למעלה תקפים ללא תלות בזה.

---

## חלק ה' — Job Infrastructure

**מצב קיים, מאומת:** **אין** שום תשתית cron/scheduler בפרויקט — `package.json` לא כולל `node-cron`/`node-schedule`/`bull`/`agenda`, אין `render.yaml`/`Procfile` בריפו, `npm start` מריץ תהליך Node יחיד (`node src/server.js`). Render deployment מוגדר כנראה כולו דרך ה-Dashboard (לא ב-repo) — **לא נגיש לי לבדיקה**.

**המלצה, מנומקת לא כי היא נוחה:**
- **In-process scheduler (`node-cron` בתוך אותו Node process הקיים), לא Render Cron Job נפרד, לא worker dyno נפרד — לפחות לשלב 1.**
- **נימוק:** הפרויקט כולו רץ כ-web service יחיד על Render (לא נראה evidence ל-worker). הוספת Render Cron Job נפרד = deployment target נוסף, environment vars כפולים, וסיכון run-מקביל בין ה-cron וה-web אם לא נזהרים. In-process עם locking (למטה) הוא הצעד הכי קטן שמספק את הצורך המיידי (jobs שרצים אחת ל-X זמן, לא high-throughput), בלי לשנות טופולוגיית deployment בזמן שהיוזר לא זמין לאשר שינוי כזה. **מתי לעבור ל-worker נפרד:** אם ה-jobs יתחילו לצרוך CPU/זמן משמעותי שמתחרה עם ה-web traffic, או אם Render Cron Job מתגלה כבר מוגדר בדשבורד (לא נבדק).
- **Deploy/restart:** Render מבצע restart מלא בכל deploy — in-process scheduler "מתאפס" ומתחיל מחדש; `job_runs.last_run` (מוצע למטה) שורד restart כי הוא ב-DB, לא בזיכרון.
- **מניעת ריצה כפולה:** advisory lock ברמת Postgres (`pg_try_advisory_lock`, מפתח קבוע לכל job) — לא תלוי בכמה instances רצים (מגן גם אם Render יגדיל בעתיד ל-2+ dynos), ולא דורש טבלת lock נפרדת.

---

## חלק ו' — Job Framework (תכנון, migration לא רץ)

```
job_runs
  id, job_name, status ('running'/'success'/'failed'),
  started_at, finished_at, duration_ms,
  result_summary JSONB (counts: found/repaired/skipped),
  error TEXT,
  triggered_by ('scheduler'/'admin:<user_id>')
```

**Registry:** אובייקט JS פשוט `{ name, schedule, handler, timeoutMs }` — לא over-engineering, תואם את גודל הפרויקט (אין עדיין 20 jobs). כל job:
1. `pg_try_advisory_lock` — נכשל→ skip בשקט (job כבר רץ).
2. INSERT ל-`job_runs` (`status='running'`).
3. מריץ עם `Promise.race` מול timeout.
4. UPDATE `job_runs` עם תוצאה/שגיאה, `pg_advisory_unlock`.

**Manual `Run now`:** אותו handler בדיוק, `triggered_by='admin:<id>'` — **לא path נפרד**, כדי שלא יהיה drift בין הרצה אוטומטית לידנית.

**Retry policy:** ברירת מחדל — **אין retry אוטומטי בתוך ריצה בודדת** (job שנכשל מחכה לריצה המתוזמנת הבאה, לא מנסה שוב מיד) — מונע flood אם CardCom API נופל. Exception: B3 (Webhook Recovery) עצמו הוא כבר "ה-retry" של תהליכים אחרים.

**Migration מוצע (`050_job_runs.sql`), טרם נכתב/רץ — ממתין ל-Open Decision על scope.**

---

## חלק ז' — Admin Operations — עיצוב, לא UI מלא

מסך אחד: **Platform Admin → Payments / CardCom Operations**, מתחת ל-`requireSuperAdmin` (כבר קיים).

**Observe (תמיד מותר, read-only):**
`GET /api/platform/cardcom/health` — connectivity, last webhook per type, jobs last/next run.
`GET /api/platform/cardcom/findings` — reconciliation discrepancies (מ-`reconciliation_findings`, מוצע).
`GET /api/platform/cardcom/failures` — donations/recurring שנכשלו, webhook events עם `error`.

**Repair local state (מותר בזהירות, לא כסף):**
`POST /api/platform/cardcom/jobs/:name/run` — Run now.
`POST /api/platform/cardcom/webhook-events/:id/retry` — Retry processing (מריץ מחדש handler על raw_payload שמור, לא קריאה חדשה ל-CardCom).
`POST /api/platform/cardcom/aggregates/:campaignId/repair` — **מחשב מחדש מ-`donations`, לא +/- ידני** (לקח מ-Phase 1).

**Financial action — אסור כברירת מחדל, לא נבנה כלל בשלב הזה:**
כל דבר שיוצר Update/Create/charge חדש מול CardCom (mass retry, חיוב ידני, שינוי `TotalNumOfBills`) — **לא בהיקף העבודה העצמאית**, נשאר Open Decision.

---

## חלק ח' — Security & Audit — ממצאים

| בדיקה | ממצא |
|---|---|
| Secret validation | ✅ שני המסלולים בודקים (`?secret=` ל-LowProfile, `body.Secret` ל-Recurring) — Verified בקוד |
| Secret בלוגים | ✅ **תוקן בעבר** (Phase-קודם הסיר `console.log` שהדפיס secret) — לא נמצא הישנות |
| Card/Token בלוגים | ✅ לא נמצאה קריאת `console.log`/`console.error` שמדפיסה `TokenInfo`/מספרי כרטיס בקוד שנבדק |
| הרשאות Admin | ✅ `requireSuperAdmin` קיים ומיושם, מתאים לשימוש חוזר |
| Audit trail לפעולות ידניות | ⚠️ **חסר היום** — Pause/Resume/Cancel לא נכתבים לשום audit log נפרד (רק `updated_at`), ואין `admin_user_id` שביצע פעולה. **מומלץ להוסיף ל-job_runs/action log כשממש** |
| Replay/idempotency | ✅ קיים (ר' חלק א'), עם ההסתייגות על Recurring hash-fallback שכבר תועדה |
| חשיפת CardCom credentials | ✅ `entities.cardcom_api_password_encrypted` — שם העמודה מרמז הצפנה; **לא בדקתי אם ההצפנה בפועל ממומשת או שהשם מטעה** (מחוץ להיקף הזמן הזמין) — מומלץ בדיקה נפרדת |

**לא נמצאה בעיית אבטחה חדשה שדורשת עצירה מיידית.** הפריט היחיד שראוי לתשומת לב לפני build של Admin UI: audit trail לפעולות admin ידניות.

---

## חלק ט' — סטטוס מימוש

**✅ 2026-08-15 — migrations 050+051 רצו נגד ה-DB האמיתי, אושרו על ידי היוזר. שלושת ה-jobs נבדקו DB-level, לא רק syntax.**

**ממצאים אמיתיים מהריצה (לא test bugs):**
- `webhook-recovery`: `payment.handler.js::handle` "שקט" כשהעסקה לא נמצאת/לא הצליחה (`return` בלי לזרוק) — מונה ה-`recovered` של ה-job **לא אמין** כאינדיקציה לתיקון-אמיתי, רק ל"רץ בלי לזרוק". טעון החלטה עתידית (להבחין success/no-op בערך החזרה של ה-handler).
- `stale-pending-donations`: מצא בפועל **4 תרומות `pending` ישנות אמיתיות** בפרודקשן (מ-04-11/08, לא מהעבודה הזו) — אושרו כ"עדיין pending אצל CardCom", אין כסף נסתר.
- `aggregate-consistency`: מצא **drift אמיתי** בקמפיין "קיץ כמו כולם" (`summer-gdoilm`) — `supporters_count=9` רשום מול `8` בפועל. **לא תוקן** (detect-only), ממתין להחלטת repair.

**חקירה מעמיקה של הממצאים #1/#2 (לפי בקשת היוזר) — תכנון מדויק, לא מומש:**

**#1 (Transaction):** `finalizePaidDonation(donationId, client=db)` מקבל client אופציונלי; `markDonationPaid` פותח client ייעודי+`BEGIN`, עוטף donation UPDATE→campaign UPDATE→receipt INSERT, `COMMIT`, **ורק אז** `emailService.queue()` (מחוץ לטרנזקציה בכוונה — לא תולים מייל בטרנזקציה שעוד יכולה להתגלגל). נדרש באותו אופן ב-4 call sites (`markDonationPaid`, `detail-recurring.handler.js`, `createManualDonation`, `handleMockComplete`). דפוס ה-client-ייעודי+transaction **כבר אומת עובד** ב-`job-runner.js` נגד אותו DB.

**#2 (completeSignup recovery) — שני תת-מקרים:** כשל CardCom-side כבר מטופל סביר (`status='creation_failed'`+`failure_reason`, גלוי). **הפער האמיתי:** קריסה *לפני* הכתיבה הראשונה משאירה `status='pending_payment'` (לא even `pending_creation`) לצמיתות, בלי סימן. **תיקון ל-B6 (לא job נפרד "stale pending_creation" גנרי):** `status IN ('pending_payment','pending_creation') AND EXISTS (SELECT 1 FROM donations WHERE recurring_instruction_id=ri.id AND status='paid')`.

**סיווג A (לפני scheduler) / B (jobs מכסים מספיק) / C (חוב טכני) של 5 ממצאי ה-Audit:**
| # | ממצא | סיווג |
|---|---|---|
| 1 | Transaction חסר ב-markDonationPaid/Detail | **A** |
| 2 | completeSignup בלוע | **A** (תת-מקרה קריסה-מוקדמת) / **B** (תת-מקרה CardCom-failure) |
| 3 | Email fire-and-forget | **C** (בתנאי שתיקון #1 בוצע) |
| 4 | document.handler.js ריק | **C** |
| 5 | Aggregates ב-4 מסלולים | **B** (aggregate-consistency כבר מכסה, הוכיח עצמו בפועל) |

**✅ תיקוני Reliability A מומשו ונבדקו (2026-08-15), אחרי אישור מפורש של היוזר לתכנון שהוצג למעלה:**
- **#1** — atomic transaction ב-`markDonationPaid`/`detail-recurring.handler.js`/`createManualDonation`/`handleMockComplete` (donation→campaign→receipt, אחת אחרי השנייה, email רק אחרי COMMIT). ר' A2/A5 למעלה לפרטים.
- **#2** — `src/jobs/stuck-recurring-signups.job.js`, detect-only, מחליף את ה-B6 המקורי. ר' חלק ב'/B6 למעלה.
- **B3** — `webhook-recovery` קיבל סמנטיקת מדדים אמיתית (`examined/recovered/alreadyConsistent/processed/notRouted/failed`) במקום "לא זרק = recovered". ר' B3 למעלה.
- **Regression: 42/42** תרחישים עברו נגד ה-DB האמיתי (ישות/קמפיין סינתטיים, נוקו במלואם בסוף; `getLpResult`/`createRecurring` הוחלפו זמנית ב-stubs — בלי חיוב CardCom חדש). כיסוי: תרומה חד-פעמית, redelivery, receipt קיים מראש, rollback בשלוש נקודות שונות בטרנזקציה, email שנכשל אחרי COMMIT, concurrent execution, DetailRecurring success+redelivery, recurring signup+idempotency, stuck-instruction מול הוראה בריאה/עדיין-ב-checkout, וארבע הקטגוריות החדשות של webhook-recovery.
- **לא נגעתי:** שני ממצאי ה-Data (4 ה-pending הישנות, drift ב-"קיץ כמו כולם") — נשארים בדיוק כפי שהיו, בכוונה.

**עדיין לא מומש:** B1/B2 (Gate פורמט `GetRecurringPayment`), scheduler חיבור ל-`server.js` (החלטה נפרדת, מכוונת — מה רץ אוטומטית/באיזו תדירות/מה מנהל הפלטפורמה רואה, לפני שמחברים).

---

## חלק י' — Operational Policy (2026-08-16): Dedup, Schedule, Admin API, Alerts

**החלטה:** לפני חיבור scheduler — קודם dedup ל-`reconciliation_findings`, כדי לא להפעיל מנגנון שכבר ידוע שייצר findings כפולים על כל ריצה.

### Dedup — סמנטיקה + migration (`052_reconciliation_findings_dedup.sql`, **מוכן, טרם רץ**)

- `last_seen_at` (חדש) — מתעדכן בכל ריצה שעדיין רואה את אותה בעיה. `found_at` נשאר בלי שינוי — "מתי התגלה לראשונה" נשאר אמין לכל אורך חיי finding פתוח אחד.
- **"פתוח" = `resolved_at IS NULL`.** Partial UNIQUE INDEX על `(job_name, finding_type, subject_type, subject_id) WHERE resolved_at IS NULL` — DB-level, לא רק application logic, כך ששני runs שרצים כמעט-בו-זמנית (scheduler tick + admin "Run now") לא יכולים ליצור שני findings פתוחים לאותו subject; ה-`ON CONFLICT` של Postgres פותר את זה אטומית.
- **UPSERT משותף** — `src/jobs/reconciliation-findings.js::recordFinding` — שלושת ה-jobs שכותבים findings (`aggregate-consistency`, `stale-pending-donations`, `stuck-recurring-signups`) עברו אליו במקום `INSERT` גולמי. `webhook-recovery` לא משתמש ב-`reconciliation_findings` בכלל — הוא כבר self-resolving דרך `cardcom_webhook_events.error`.
- **Auto-resolve** — כל אחד מהשלושה מריץ בסוף הריצה שלו `UPDATE ... SET resolved_at=NOW(), resolved_by='system' WHERE ... resolved_at IS NULL AND NOT EXISTS (<תנאי הבעיה עדיין קיים ל-subject הזה>)`. בכוונה **לא** "חסר מרשימת הריצה הזו" (שתי מתוך שלושה עובדות עם `LIMIT 50` — diff מול תוצאה חתוכה היה שקרי אם יש יותר מ-50 findings בבת אחת) — במקום זה, בדיקה ישירה של ה-subject הספציפי מול התנאי החי. נכון גם אם יש הרבה יותר מ-50 findings.
- **מדיניות הישנות (recurrence), נבחרה במפורש:** אם finding נפתר (auto או admin) והבעיה חוזרת אחר כך — **finding חדש**, לא reopen. הסיבה: `found_at`/`resolved_at` על השורה הישנה נשארים תיעוד אמין של "מתי האירוע הספציפי הזה היה פתוח" — reopen היה מטשטש את זה. ה-partial index מגן רק על שורות פתוחות, אז שורה שנפתרה לא חוסמת INSERT חדש — המנגנון הזה בעצם "בא בחינם" מבחירת ה-partial index, לא נדרש קוד נוסף.
  - **הסתייגות ידועה, לא נפתרת עכשיו:** אם admin סוגר finding ידנית בזמן שהבעיה עדיין קיימת בפועל (למשל ה-4 pending הישנות — לעולם לא "יפתרו" אוטומטית כי `status` שלהן נשאר `pending` לצמיתות, ולא כתקלה), הריצה הבאה תיצור finding **חדש** לאותו subject, לא תישאר שקטה. זו לא באג — זו תוצאה ישירה של המדיניות שנבחרה — אבל אם רוצים "acknowledge בלי שיחזור" לתרחיש כמו הפנדינג הישנות, זה ידרוש state שלישי (מוצע: `acknowledged`, נפרד מ-`resolved`) שלא נבנה כרגע. מסומן לתשומת לב עתידית, לא נפתר.

### תדירות מאושרת (production schedule)

| Job | תדירות מאושרת | הערה |
|---|---|---|
| `webhook-recovery` | כל 15 דקות | ר' B3 למעלה |
| `stale-pending-donations` | כל שעה | ר' B5 למעלה |
| `stuck-recurring-signups` | כל שעה (הועלה מ"יומי עד dedup") | ר' B6 למעלה |
| `aggregate-consistency` | פעם ביום | ר' B11 למעלה |

מתועד כשדה `schedule` (cron expression) על אובייקט ה-export של כל job — **מידע תיעודי בלבד, לא מחובר לשום מנגנון הרצה בפועל.** `job-runner.js`'s `register()` כבר עושה spread על כל שדה, אז זה עובר בשקט בלי שינוי התנהגות.

### Admin API — הושלם (רובו כבר היה קיים מהסבב הקודם)

`src/modules/platform/cardcom-ops/` — כל מה שנדרש להצגה כבר קיים:

| נדרש | Endpoint | הערה |
|---|---|---|
| מצב 4 ה-jobs | `GET /health` | `jobs[]`, `knownJobs[]` |
| last run/duration/result | `GET /jobs/runs?jobName=` | כולל `result_summary` |
| findings פתוחים | `GET /findings` | ברירת מחדל `resolved_at IS NULL` |
| severity | `GET /findings` | עמודה קיימת |
| first seen / last seen | `GET /findings` | **חדש הסבב הזה:** `last_seen_at` נוסף ל-SELECT, המיון עבר מ-`found_at DESC` ל-`last_seen_at DESC` (findings פעילים למעלה) |
| subject | `GET /findings` | `subject_type`+`subject_id`+`details` |
| `Run now` | `POST /jobs/:name/run` | כבר קיים, דרך אותו `job-runner.run()` שה-scheduler ישתמש בו — `triggered_by='admin:<id>'` |
| סימון resolved | `POST /findings/:id/resolve` | כבר קיים — `resolved_by='admin:<id>'`, שונה מ-`'system'` (auto-resolve) |

**גבול Observe→Repair→Financial נשמר** — שום endpoint חדש לא נוגע ב-`donations`/`campaigns`/`recurring_instructions`. הכל תחת `requireSuperAdmin`, ללא שינוי.

### Alerts — מחושב ב-API, לא מערכת התראות חדשה

`GET /health` מחזיר עכשיו `alerts[]`, מחושב מנתונים שכבר נשלפים באותה קריאה (לא query נוסף, לא external service):

1. `job_failed` — הריצה האחרונה של job כלשהו הסתיימה ב-`status='failed'`.
2. `webhook_recovery_unresolved` — `webhook-recovery`'s `result_summary` האחרון מכיל `failed>0` או `notRouted>0` — בדיוק שתי התוצאות שבמכוון **לא** נספרות כ-`recovered` (ר' חלק ב'/B3).
3. `critical_findings_open` — יש `reconciliation_findings` פתוח בחומרה `critical`.

**בשלב הזה — Dashboard של Platform Admin (טרם נבנה) הוא מקום ההתראה היחיד**, לא Slack/email/push. תואם את ההחלטה לא לבנות מערכת התראות חדשה.

### מה לא מומש בכוונה (לפי ההנחיה)

Recurring charge-history reconciliation, B2 מול `GetRecurringPayment`, webhook canary, email retry, document reconciliation, automatic repair ל-lost payment, automatic retry של `createRecurring`, Personal Area, scheduler עצמו.

**⚠️ Migration 052 מוכן, טרם רץ נגד ה-DB.** עד שירוץ — הקוד החדש (`recordFinding`) ייכשל בכל ניסיון לכתוב finding (ה-`ON CONFLICT` שלו מפנה ל-index שעוד לא קיים). זו הסיבה שהבדיקות הספציפיות ל-dedup לא רצו עדיין בסבב הזה.
