# Hamonym Collection Engine — Design (2026-08-28)

**סטטוס:** טיוטה לביקורת — לא ממומש, לא מאושר, לא מוקפא. נכתב בעקבות ההחלטה על Billing Account Provisioning (ראו commits `69a0f8a`, `b22ef0a`) ולפי דרישה מפורשת: **Read-only design first — לא לגעת בקוד עד אישור מפורש.**

**קלט:** `docs/BILLING_ENGINE_SESSION_HANDOFF_2026-08-28.md`, `docs/HAMONYM_BILLING_ENGINE_SPEC.md`, `docs/HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md`, מיגרציות 054–058, קוד קיים תחת `src/modules/billing-engine/`, `src/modules/billing/` (entity_billing), ותשתית התשלומים הקיימת של צד התורם (`src/modules/payment/*`, `src/jobs/*`) — Collection לא ממציא תשתית חדשה איפה שיש דפוס מוכח כבר.

---

## 1. גבולות (Scope)

**בפנים:** מה קורה אחרי ש-Statement הגיע ל-`approved` — ניתוב לאמצעי גבייה, ניסיון חיוב בפועל, טיפול בתוצאה (הצלחה/דחייה/כשל טכני/עמימות), ומעבר הסטייטמנט דרך `open` ל-`paid`/`cancelled`/`written_off`.

**מחוץ לגבולות (במפורש):**
- כל מה שקדם ל-`approved` (Calculation, Approval) — קפוא, לא נוגעים.
- Billing Account Provisioning — קיים ובנוי (commit `b22ef0a`), Collection רק *צורך* `billing_accounts`, לא יוצר.
- `entity_billing` (טוקן הכרטיס) — Collection צורך אותו כפי שהוא, לא בונה מחדש. תיקון האבטחה שלו כבר בוצע (commit `69a0f8a`).
- MASAV בפועל — ראו סעיף 7, זהו הפער החסום המרכזי של המסמך הזה.

---

## 2. מה כבר קיים ונעשה שימוש חוזר בו

Collection **אינו** תשתית תשלומים ראשונה בקודבייס — יש כבר מנוע חיוב עובד לצד התורם (LowProfile חד-פעמי + Recurring), עם דפוסים מוכחים בפרודקשן. העיצוב הזה מדויק אליהם, לא ממציא מחדש:

| דפוס קיים | איפה | שימוש חוזר ב-Collection |
|---|---|---|
| Idempotency דו-שכבתי: transport-level (`cardcom_webhook_events.idempotency_key`, היררכיה TranzactionId>LowProfileId>payload hash) + business-level (unique key על העובדה הפיננסית עצמה) | `idempotency.service.js`, migration 055 (`uq_donations_recurring_provider_ref`) | אותו דפוס בדיוק על `collection_attempts`/`payments` (סעיף 5) |
| "לא לנחש סטטוס מ-webhook — לשאול את הספק (GetLpResult) כשיש ספק" | `stale-pending-donations.job.js` | אותו עיקרון בדיוק עבור עמימות בחיוב Collection (סעיף 6) |
| Detect-only jobs, לא auto-repair, על `reconciliation_findings` הקיים | `stale-pending-donations`, `webhook-recovery`, `billing-approval-consistency`, `billing-provisioning-gap` (החדש) | אותה תשתית לזיהוי אנומליות ב-Collection (סעיף 8), בלי טבלה חדשה |
| כשל אמיתי נרשם כרשומה אמיתית (לא נמחק, לא מומר), עם קוד הספק הגולמי — לא טקסונומיה מומצאת | `detail-recurring.handler.js` (`failure_reason = cardcom_recurring_<status>`) | אותו עיקרון עבור `collection_attempts.failure_reason` |
| אטומיות: כתיבת העובדה הפיננסית + עדכון aggregate + מסמך, בטרנזקציה אחת; אימייל/side-effect רק אחרי COMMIT | `donations.service.js` (`withTransaction`, `queueReceiptEmail`) | אותו דפוס עבור עדכון `statements.status` + `payments` |
| "לא להמציא קריאת API לא-מאומתת" — כל קריאה ל-CardCom בקוד הקיים מתועדת כ-Verified מול CardCom support/spec | הערות ב-`recurring.client.js`, `idempotency.service.js` | הבסיס לפער החסום הכי משמעותי של המסמך הזה — ראו סעיף 6.1 |

---

## 3. מודל הנתונים המוצע

שלוש טבלאות חדשות, באותה רוח כמו `statements`/`statement_components` (054): מופרדות לפי אחריות, append-only איפה שזו עובדה היסטורית, ולא ממציאות עמודת cache שכבר נכשלה במקום אחר בקודבייס (`campaigns.current_amount` מוזכר במפורש ב-TECHNICAL_DESIGN.md כדוגמה למה להימנע ממנה).

### `collection_attempts`
כל ניסיון גבייה בפועל נגד Statement — אחד או יותר לכל Statement (ניסיון ראשון, retry אחרי כשל טכני, ניסיון אחרי שהעמידה עודכנה).

```
id                 UUID PK
statement_id       UUID NOT NULL REFERENCES statements(id)
collection_method  VARCHAR(10) NOT NULL CHECK (IN ('card','masav'))
attempt_number     INT NOT NULL          -- 1, 2, 3... per statement_id, לא global
status             VARCHAR(20) NOT NULL CHECK (IN
                     ('pending','succeeded','declined','technical_failure','ambiguous'))
provider           VARCHAR(20) NOT NULL DEFAULT 'cardcom'
provider_reference TEXT                  -- TranzactionId וכו', write-once אחרי שנקבע
provider_raw_status TEXT                 -- קוד/סטטוס גולמי מהספק, לא מתורגם
failure_reason     TEXT                  -- כשל טכני/דחייה — גולמי, לא טקסונומיה מומצאת
requested_amount   NUMERIC(12,2) NOT NULL  -- = statements.total_due בזמן היצירה (snapshot)
initiated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
resolved_at        TIMESTAMPTZ            -- מתי הגענו לסטטוס סופי (לא pending/ambiguous)
created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE (statement_id, attempt_number)
```

**למה `attempt_number` ולא רק "השורה האחרונה":** מונע דו-משמעות איזה ניסיון "הניסיון הפעיל" כשיש race בין worker-ים (סעיף 6.3) — יש בדיוק שורה אחת לכל (statement, number), ואפשר לדעת אטומית מי ניסה קודם.

**`requested_amount` על השורה, לא רק מ-JOIN ל-statements:** אם Statement אחר-כך מבוטל/נכתב-לחובה, ה-attempt עדיין מספר בדיוק כמה ניסינו לגבות באותו רגע — אותו עיקרון כמו `statement_components.amount_snapshot`.

### `payments`
עובדה פיננסית — תשלום שהתקבל בפועל. Append-only, לעולם לא UPDATE/DELETE (טריגר חוסם, אותו דפוס כמו `statement_components`). נוצר רק כתוצאה של `collection_attempts.status = 'succeeded'`, יחס 1:1 עם ה-attempt המצליח שיצר אותו.

```
id                    UUID PK
statement_id          UUID NOT NULL REFERENCES statements(id)
collection_attempt_id UUID NOT NULL UNIQUE REFERENCES collection_attempts(id)
amount                NUMERIC(12,2) NOT NULL
provider              VARCHAR(20) NOT NULL
provider_reference    TEXT NOT NULL       -- immutable, ה-fact היחיד שמוכיח שהכסף אכן זז
received_at           TIMESTAMPTZ NOT NULL
created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()

UNIQUE (provider, provider_reference)      -- אותו provider_reference פעמיים = אותו אירוע, לא שני תשלומים
```

**מדוע טבלה נפרדת מ-`collection_attempts` ולא רק `status='succeeded'` על ה-attempt:** אותה סיבה בדיוק כמו ההפרדה `donations`/`statement_components` — "התשלום קרה" הוא עובדה כספית סופית שצריכה FK-target יציב (חשבוניות/קבלות עתידיות יצביעו ל-`payments`, לא ל-`collection_attempts`), בעוד ה-attempt עצמו הוא רשומת תהליך (יכול להיות `ambiguous` ואז מתברר).

### `billing_receipts`
מסמך חשבונאי שהופק לעמותה על סמך תשלום שהתקבל. **לא ממומש בעיצוב הזה** — התייחסות בלבד: 1:1 עם `payments`, append-only, מספור עוקב (אותו רעיון כמו `receipts` הקיים לתורמים). הפקת מסמך אמיתי (חשבונית מס/קבלה לעמותה) היא Business Rule + אינטגרציה (איזה ספק מסמכים? יש כבר אחד ל-`receipts`?) שלא אומתה כחלק מהעיצוב הזה — **דורשת סבב נפרד**, לא מוצג כאן מעבר לזה שהטבלה צריכה להתקיים.

### שינוי יחיד לטבלה קיימת
`statements.status` — אין צורך בעמודה חדשה, `CHECK` הקיים (058) כבר כולל `open`/`paid`/`cancelled`/`written_off`. Collection הוא הקוד הראשון שבאמת יכתוב את הערכים האלה.

---

## 4. מכונת המצבים של Statement — בדיוק מתי כל מעבר קורה

זו הייתה דרישה מפורשת — הנה ההגדרה המדויקת, לא "בערך":

```
draft --[Approval Engine, קיים]--> approved
approved --[Collection Router מתחיל ניסיון ראשון]--> open
open --[payment מכסה total_due במלואו]--> paid
open --[Super Admin, פעולה ידנית מפורשת]--> written_off
approved/open --[Super Admin, פעולה ידנית מפורשת]--> cancelled
```

- **`approved → open`**: קורה ברגע שנוצר `collection_attempts` הראשון (attempt_number=1) עבור ה-Statement — לא לפני. Statement יכול לשבת ב-`approved` זמן לא מוגבל אם Collection עדיין לא הגיע אליו (למשל תור עמוס, או Router עדיין לא רץ) — `approved` = "חוב קיים, טרם ניסינו לגבות." `open` = "בתהליך גבייה פעיל."
- **`open → paid`**: אך ורק כש-`payments` חדש נוצר ו-`SUM(payments.amount WHERE statement_id=X) >= statements.total_due`. **תשלום חלקי לא הופך ל-`paid`** — אין בעיצוב הזה מושג של "תשלום חלקי מתמשך"; אם CardCom/Tranzila תמיד מחייבים סכום מלא (ההנחה הסבירה, לא מאומתת ל-MASAV — ראו סעיף 7), `SUM >= total_due` ו-`amount == total_due` שקולים בפועל, אבל `SUM` עמיד יותר אם אי פעם יהיה ניסיון גבייה חלקי מכוון.
- **`open → written_off`**: פעולת Super Admin מפורשת בלבד ("ויתרנו על הגבייה") — Collection **לא** עושה את זה אוטומטית אחרי N ניסיונות כושלים. זו החלטה עסקית (לוותר על חוב), לא טכנית.
- **`approved`/`open → cancelled`**: פעולת Super Admin מפורשת ("ה-Statement הזה לא היה צריך להיווצר") — שונה מ-`written_off` (חוב אמיתי שוויתרנו עליו) ב-*כוונה*, לא בטכניקה; שתיהן טרמינליות, שתיהן דורשות אדם.
- **retry אחרי כשל**: Statement **נשאר** ב-`open` — retry יוצר `collection_attempts` נוסף (attempt_number+1) על אותו Statement, לא הופך אותו בחזרה ל-`approved`. אין "un-opening".

**מה זה לא מגדיר (במפורש, לביקורת ולא כברירת מחדל שקטה):** מדיניות retry בפועל — כמה ניסיונות, כמה זמן בין ניסיון לניסיון, מתי להפסיק ולחכות לפעולת Super Admin (`written_off`). זו החלטה עסקית (בדיוק כמו `fee_rate`) שלא הוכחה מהריפו — **שאלה פתוחה, ראו סעיף 9**.

---

## 5. זרימת מסלול הכרטיס (Card Rail)

```
approved Statement
  → Collection Router: preferred_collection_method='card' → resolve payment instrument
  → SELECT * FROM entity_billing WHERE entity_id=X AND is_default=true AND status='active'
    (בזמן הניסיון עצמו, לא מצביע קאש — כפי שהוחלט באודיט הקודם)
  → אין מכשיר תשלום פעיל? → collection_attempts (status='technical_failure',
    failure_reason='no_active_payment_instrument') — לא מנסים, לא שוברים
  → יש מכשיר → INSERT collection_attempts (status='pending', attempt_number=next)
  → קריאת CardCom "חייב את הטוקן הזה" (הפער החסום — סעיף 6.1)
  → תגובה → סעיף 6 (הצלחה/דחייה/כשל טכני/עמימות)
```

**Router** הוא הקוד היחיד שקורא ל-`entity_billing` — כפי שהוחלט: Collection לא משכפל טוקן/FK לתוך `billing_accounts` או `collection_attempts`, רק `entity_id` על ה-Statement (דרך `billing_accounts.entity_id`) ומ-Router שואל את `entity_billing` בזמן אמת.

---

## 6. טיפול בתוצאה — הצלחה / דחייה / כשל טכני / עמימות

### 6.1 [סגור 2026-08-29] הפער היה: אין בקודבייס שום קריאת API מאומתת ל"חייב טוקן קיים חד-פעמית"

**עדכון 2026-08-29:** הפער נסגר. ראו `docs/CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH_2026-08-28.md` חלק ג' לראיות המלאות (Swagger v11 הרשמי + שני מאמרי תמיכה רשמיים של CardCom שנשלפו ישירות). `Transactions/Transaction` עם `Token`+`CardExpirationMMYY` (בלי `CVV2` — מתועד כלא-נדרש למסוף מודל-טוקן) הוא הקריאה הנכונה. מומש ב-`cardcom-token-charge.adapter.js`, `NOT_IMPLEMENTED=false`. הטקסט המקורי מתחת נשמר כתיעוד היסטורי של השאלה כפי שנוסחה לפני הפתרון.

זו לא נקודה קוסמטית — זו הסיבה שהעיצוב הזה **לא יכול** לרדת לרמת קוד עדיין בלי אימות נוסף. שלוש הקריאות הקיימות ל-CardCom בקודבייס הן:

1. `GetLpResult` (`billing.service.js`, `cardcom.client.js`) — קריאה בלבד, לא חיוב.
2. LowProfile `Create` (`cardcom.service.js`) — יוצר session חדש לתורם, לא מתאים לחיוב טוקן קיים ברקע בלי דף checkout.
3. Recurring v10 Name-to-Value API (`recurring.client.js`) — מיועד ל-subscription מתוזמן (`NextDateToBill`/`TimeIntervalId`), לא ל"חייב פעם אחת עכשיו."

אף אחת מהשלוש אינה "חייב טוקן X בסכום Y עכשיו, פעם אחת" — בדיוק הפעולה ש-Collection צריך. יש ל-CardCom כנראה endpoint מתאים (למשל `Transactions/Transaction` עם `Token` ב-REST v11, או `Operation=ChargeOnly` ברקורינג עם `TotalNumOfBills=1`) — **לא מאומת מול CardCom support/spec**, באותה רמת קפדנות שכל קריאה קיימת בקודבייס הזה כבר עברה (`recurring.client.js`'s own comments: "confirmed directly by CardCom support", "verified empirically"). **אין לממש שום קריאת חיוב-טוקן לפני שהיא מאומתת באותה רמה** — זו בדיוק הדרישה "if a business default cannot be proven, stop and report" מוחלת על טכני, לא רק על מסחרי.

### 6.2 הצלחה
`ResponseCode=0` + מזהה עסקה אמיתי (TranzactionId מקביל) → בטרנזקציה אחת: `collection_attempts.status='succeeded'` + `provider_reference` (write-once) + INSERT ל-`payments` + אם `SUM(payments) >= total_due`: `statements.status='paid'`. Side-effects (הפקת קבלה, התראה לעמותה) רק אחרי COMMIT — אותו דפוס כמו `queueReceiptEmail`.

### 6.3 דחייה אמיתית (Decline)
תגובה חד-משמעית מהספק ("אין כיסוי", "כרטיס חסום" וכו') → `collection_attempts.status='declined'`, `failure_reason` = הקוד הגולמי מהספק (לא טקסונומיה מומצאת — אותו עיקרון כמו `cardcom_recurring_<status>`). Statement נשאר `open`. מדיניות retry על דחייה = שאלה פתוחה (סעיף 9) — לא כל דחייה שווה (אין כיסוי היום ≠ כרטיס גנוב).

### 6.4 כשל טכני (Technical Failure)
Timeout, שגיאת רשת, 5xx מהספק, "אין מכשיר תשלום פעיל" → `collection_attempts.status='technical_failure'`. שונה מ-Decline בכך שהוא **תמיד** בר-ניסיון-חוזר (זה לא אמר כלום על יכולת התשלום של העמותה) — לעומת Decline שדורש שיקול דעת.

### 6.5 עמימות (Ambiguous) — הכי חשוב, ולפי אותו עיקרון קיים
Timeout **אחרי** שהבקשה כבר נשלחה לספק — לא ברור אם החיוב קרה בפועל בצד CardCom או לא. **בשום מקרה לא מנחשים.** אותו עיקרון בדיוק כמו `stale-pending-donations.job.js`: `collection_attempts.status='ambiguous'`, ו-job נפרד (מקביל ל"B5") שואל את הספק ישירות (query call מאומת, לא ניחוש) האם החיוב בפועל הצליח, ורק אז פותר את ה-ambiguity ל-`succeeded`/`declined`/`technical_failure` בהתאם. **Statement לא זז מ-`open` כל עוד יש attempt פעיל ב-`ambiguous`** — ה-Router לא פותח ניסיון נוסף על אותו Statement עד שהעמימות נפתרת (מונע חיוב כפול אם בסוף מתברר שהראשון כן הצליח).

---

## 7. מסלול MASAV — חסום, לא רק "עוד לא ממומש"

שני ממצאים סותרים בין המסמכים עצמם, שחייבים הכרעה לפני שאפשר לתכנן קוד:

1. `docs/PAYMENTS_ARCHITECTURE_CONTEXT.md` (2026-08-07, "Architecture Compass, נעול"): "גביית העמלה אינה מתבצעת דרך CardCom. היא מתבצעת באמצעות **Tranzila MASAV**."
2. `docs/HAMONYM_BILLING_ENGINE_SPEC.md`/`TECHNICAL_DESIGN.md` (2026-08-20+, מאוחרים יותר): לא מזכירים Tranzila בכלל — `billing_accounts.preferred_collection_method IN ('card','masav')` בלי לקבוע ספק לצד ה-MASAV.

המסמך המוקדם קדם לבניית `entity_billing`/CardCom-לגבייה (המימוש בפועל של מסלול הכרטיס) ולכן ייתכן מאוד שהוא **מיושן**, לא סותר במכוון — אבל שני המסמכים "נעולים"/"מוקפאים" באופן פורמלי, ואף אחד לא ביטל את השני במפורש. **לא מניח בעצמי איזה מהם נכון — זו בדיוק הכרעה שדורשת אותך.**

בנוסף, ונפרד מהשאלה של הספק: **אין היום שום שדה IBAN/מספר חשבון בנק מובנה בשום מקום בסכימה** (אושר באודיט הקודם) — `entities.billing_masav_file_name` הוא רק שם קובץ שהועלה. גם אם ההכרעה על הספק תיפול היום, מסלול MASAV לא יכול לרדת לרמת קוד לפני שיש מקום לאחסן פרטי חשבון בנק אמיתיים.

**מסקנה לעיצוב הזה:** `collection_method='masav'` מוגדר בסכימה (`collection_attempts.collection_method`) כדי שהמודל לא יצטרך מיגרציה נוספת ביום שה-MASAV ייפתר, אבל **שום קוד לא ינסה לבצע גבייתMASAV בפועל** עד שתי הכרעות נפרדות: (א) מי הספק, (ב) איפה מאוחסנים פרטי החשבון. `Collection Router` עבור `preferred_collection_method='masav'` פשוט ירשום ממצא ("MASAV not yet implemented") ולא ינסה כלום — מפורשות, לא ישקוט.

---

## 8. Concurrency, Reconciliation, ואינווריאנטים

### 8.1 Concurrency — שני workers לא יפתחו שני ניסיונות על אותו Statement
אותו דפוס מוכח כמו `approval.service.js` (`ORDER BY id FOR UPDATE`, סדר נעילה קבוע) ו-`job-runner.js` (advisory lock טרנזקציוני): לפני יצירת `collection_attempts` חדש, ה-Router נועל את שורת ה-Statement (`SELECT ... FOR UPDATE`) בתוך אותה טרנזקציה שבודקת "יש כבר attempt פעיל (pending/ambiguous) על ה-Statement הזה?" — אם כן, לא פותחים שני. אין race אפשרי מבנית, לא רק "בפועל לא קרה."

### 8.2 ניסיונות חלקיים/חוזרים
`UNIQUE (statement_id, attempt_number)` מונע כתיבה כפולה של אותו ניסיון. אם ה-Router עצמו קורס בין "פתחתי pending" ל"קיבלתי תשובה" (לא timeout מול הספק — קריסת התהליך שלנו) — ה-attempt נשאר `pending` לנצח בלי job שמפנה אליו. **צריך job מקביל ל-`webhook-recovery`**: `collection_attempts` ב-`pending` מעל X דקות → לשאול את הספק ישירות (כמו 6.5) אם קרה משהו, לא סתם לפתוח ניסיון נוסף מעליו.

### 8.3 Reconciliation
שני findings חדשים על התשתית הקיימת (`reconciliation_findings`, בלי טבלה חדשה):
- `collection_attempt_stuck_pending` — attempt ב-`pending`/`ambiguous` מעל סף זמן, אף אחד לא פתר.
- `statement_payments_exceed_total_due` — אמור להיות בלתי אפשרי מבנית (Router לא פותח attempt נוסף על Statement `paid`), אבל נבדק ישירות בכל זאת — אותו עיקרון "belt-and-suspenders" כמו `billing-approval-consistency.job.js`.

### 8.4 `provider_reference` בלתי-הפיך
`payments.provider_reference` הוא ה-fact היחיד שמוכיח שכסף אמיתי זז — write-once (כמו `donations.provider_charged_at`), `UNIQUE (provider, provider_reference)` מונע משיכה כפולה של אותו אירוע ספק לשני payments שונים.

---

## 9. שאלות פתוחות — דורשות הכרעה לפני מימוש

1. ~~**קריאת CardCom ל"חייב טוקן קיים חד-פעמית"**~~ — **סגור 2026-08-29**, ראו סעיף 6.1 ו-`CARDCOM_TERMINAL_AUDIT_AND_ADAPTER_RESEARCH` חלק ג'. נותר תנאי מקדים תפעולי בלבד (לא ארכיטקטוני): לוודא כש-603 ייפתר ש-HAMONYM_CARDCOM_TERMINAL מוגדר אצל CardCom כמסוף "מודל טוקן / ללא CVV".
2. **ספק MASAV** — Tranzila (מסמך 2026-08-07) או לא נקבע (מסמכים מאוחרים יותר)? (סעיף 7)
3. **אחסון פרטי בנק ל-MASAV** — איפה, ומתי נבנה (סעיף 7).
4. **מדיניות Retry** — כמה ניסיונות, כמה זמן בין ניסיון לניסיון, מתי Collection מפסיק ומחכה לפעולת Super Admin (סעיף 4, 6.3). החלטה עסקית, לא טכנית.
5. **`billing_receipts`** — לא מעוצב בכלל (סעיף 3) — איזה ספק מסמכים, אם בכלל קיים כבר אחד לתורמים שאפשר לעשות לו שימוש חוזר.
6. **סף "תקוע" ל-`pending`/`ambiguous`** (8.2) — כמה זמן לפני שmarking כתקוע, מקביל ל-`STALE_AFTER_HOURS=2` הקיים.

**המלצה:** לפתור #1–#2 קודם (חוסמים ממש את היכולת לכתוב שורת קוד ראשונה), #4 לפני approveStatement הראשון בפרודקשן (אחרת "open" יכול לשבת בלי מדיניות ברורה), #3/#5 יכולים להמתין עד שהחיוב עצמו עובד על מסלול הכרטיס.

---

## 10. מה לא נכלל בכוונה

- שום קוד מומש כחלק ממסמך זה.
- שום מיגרציה רצה — כל הסכימה בסעיף 3 היא הצעה בלבד.
- Router/attempt/payment logic בפועל — ממתין להכרעת סעיף 9.1 קודם.
