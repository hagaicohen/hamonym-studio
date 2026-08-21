# HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md — Domain Model

**סטטוס:** **Frozen v1 — Domain Model + Billing Calculation Pipeline v1.** אין כאן DB Schema, migrations, API Contracts, UI או קוד — ואין ניסיון לפתור שאלות שלא הוכרעו. השלב הבא (לא במסמך זה): DB Schema (Technical Implementation Design).
**תאריך:** 2026-08-20
**מרחיב:** `docs/HAMONYM_BILLING_ENGINE_SPEC.md` (Business Spec, Frozen v1) — לא סותר אותו, מתרגם אותו למודל דומיין. גם עקבי עם `docs/PAYMENTS_ARCHITECTURE_CONTEXT.md` (ה-Compass שמגדיר Billing Engine כמנוע נפרד מ-Charging Engine).

## מה המסמך הזה כן

מודל הדומיין המלא של Billing Engine כפי שסוכם עם היוזר בסבב תכנון הדרגתי (2026-08-20): הישויות, האחריות של כל אחת, הקשרים ביניהן, שלושת מחזורי החיים (state machines), עקרונות ה-Immutability, שמונת ה-Domain Invariants, מקור האמת בכל שלב, עקרון `asOf/effectiveAt`, ההפרדה בין Simulation/Test/Production, **וה-Billing Calculation Pipeline** — כולל audit read-only של המודל הפיננסי הקיים בפועל (`donations`/`campaigns`) שעליו הוא נשען.

## מה המסמך הזה לא

לא DB Schema, לא migrations, לא API Contracts, לא UI, לא קוד. לא אינטגרציית CardCom/Tranzila ספציפית — המודל **provider-agnostic** במכוון; Collection Attempt מתייחס לערוץ (CARD/MASAV/MANUAL) כתווית מופשטת, לא לפרטי API של ספק.

---

## תשע הישויות והאחריות של כל אחת

| ישות | אחריות | Mutable / Immutable |
|---|---|---|
| **Billing Account** | הקשר העסקי בין לקוח (עמותה) ל-Hamonym: עמלה%/מע"מ% ברירת מחדל, אמצעי תשלום מחוברים, ו-**enforcement status** (ACTIVE/SUSPENDED) | Mutable — current state |
| **Billing Period** | חלון זמן טהור וגלובלי לחישוב עמלה (28→28), משותף לכל החשבונות, מנותק לגמרי מכל הרצה קונקרטית | Mutable עד סגירה, אז קפוא |
| **Billing Run** | הרצה קונקרטית אחת של המנוע על Billing Period מסוים — `asOf`, מצב (DRY_RUN / PRODUCTION), סטטוס, מי אישר | Mutable (מתקדם דרך ה-lifecycle שלו) |
| **Billing Preview** | הפלט של Billing Run במצב DRY_RUN בלבד — "מה היה קורה" | קיים רק בתוך ה-Run שיצר אותו; **לעולם לא הופך ל-Statement** |
| **Statement** | כמה Billing Account חייב עבור Billing Period נתון — נוצר **רק** ע"י Billing Run במצב PRODUCTION | **שדות הכסף: Immutable מרגע FINALIZED. הסטטוס (מצב החוב): כן מתקדם** |
| **Routing Decision** | לאיזה ערוץ גבייה (CARD/MASAV/MANUAL) מנותב Statement נתון, ולמה | Append-only log — לא ישות עם lifecycle עצמאי |
| **Collection Attempt** | ניסיון גבייה קונקרטי בודד, בערוץ נתון | Immutable מרגע שנפתר (PENDING→SUCCESS/FAILURE) |
| **Payment** | תנועת כסף אמיתית שהתקבלה בפועל, כתוצאה מ-Collection Attempt מוצלח | Immutable — לא נערך, רק נוצר |
| **Receipt** | מסמך חשבונית מס-קבלה, מונפק לאחר Payment | Immutable מרגע ההנפקה — תיקון = מסמך חדש/מבטל, לא עריכה (עקרון קיים כבר סביב קבלות ב-[[project_cardcom]]) |

---

## הקשרים

```text
Billing Period    1──* Billing Run
Billing Run (DRY_RUN)      1──* Billing Preview
Billing Run (PRODUCTION)   1──* Statement
Billing Account    1──* Statement                     (דרך Billing Period)
Statement          1──* Routing Decision
Statement          1──* Collection Attempt
Collection Attempt 1──0..1 Payment                    (רק ניסיון מוצלח מייצר תשלום)
Statement          1──* Payment                       (לא מונח 1:1! ר' "הבחנת ארבע הישויות" למטה)
Payment            1──1 Receipt
Billing Account    1──1 enforcement status (ACTIVE/SUSPENDED) — עצמאי, לא תלוי ב-Statement בודד
```

---

## שלושה מחזורי חיים (State Machines) — נפרדים לגמרי במכוון

עיקרון-העל שהוביל לפירוק לשלושה צירים: כל ציר עונה על שאלה אחת בלבד, ואסור לדחוף מידע ממישור אחד לתוך אחר.

### 1. Billing Run

```text
DRY_RUN:     RUNNING → COMPLETED
PRODUCTION:  DRAFT → REVIEWED → APPROVED → COLLECTION_STARTED → COMPLETED
```

Dry Run לא נוגע בכסף ולא דורש אישור — הוא רק מריץ חישוב ומפיק Preview. Production Run הוא היחיד שעובר את שער "Approve & Charge".

### 2. Statement — מצב החוב בלבד, בלי ערוץ גבייה

```text
DRAFT → FINALIZED → OPEN → PAID                    (terminal-הצלחה)
                       │
                       └── CANCELLED / WRITTEN_OFF   (רק בעתיד, פעולה מפורשת — לא תוצאה אוטומטית של כשל גבייה)
```

**אין** `COLLECTION_FAILED`/`ROUTED_CARD`/`ROUTED_MASAV` כסטטוסים של Statement. כל עוד יש חוב פתוח — הסטטוס הוא פשוט `OPEN`, בלי קשר לכמה ניסיונות גבייה נכשלו, לאיזה ערוץ מנותב כרגע, או האם החשבון מושעה. שלוש השאלות האלה נענות במקום אחר:

| שאלה | נענית ב- |
|---|---|
| "האם עדיין חייבים כסף?" | **Statement** status |
| "איך מנסים לגבות כרגע?" | **Routing Decision** (הערוץ הנוכחי) |
| "כמה ניסיונות כבר נכשלו?" | **Collection Attempt** (ההיסטוריה) |
| "האם החשבון פעיל?" | **Billing Account** enforcement status |

### 3. Billing Account — enforcement

```text
ACTIVE ⇄ SUSPENDED     (הפיך, לא terminal)
```

השעיה נגזרת מכללי העסק (למשל 3 כשלונות/12 יום ללא הרשאת מס"ב — ר' Business Spec) אבל **אינה** סוגרת את ה-Statement. Statement פתוח של חשבון מושעה נשאר לגמרי בר-גבייה, וברגע שמתקבל תשלום מלא — הוא הופך `PAID`, בלי קשר לכך שהחשבון עדיין (או כבר לא) מושעה.

---

## הבחנת ארבע הישויות: Statement / Routing / Attempt / Payment

זו ההבחנה המרכזית שהמודל כולו נבנה סביבה:

- **Statement** = **החוב**. כמה, למה, לאיזו תקופה. Snapshot קפוא.
- **Routing Decision** = **דרך הגבייה שנבחרה כרגע**. CARD/MASAV/MANUAL, ולמה נבחרה. משתנה לאורך זמן (append-only log), אבל לא "יוצר" חוב חדש כשהוא משתנה.
- **Collection Attempt** = **ניסיון קונקרטי**. אירוע בודד, מתועד, immutable ברגע שנפתר. ריבוי Attempts = ה-Audit Trail של "מה ניסינו".
- **Payment** = **כסף שהתקבל בפועל**. תוצר של Attempt מוצלח. **Statement 1──\* Payment, לא 1:1** — `total_due` הוא החוב; ה-Statement הופך `PAID` כאשר סכום ה-Payments המוצלחים מגיע אליו (ר' Invariant #7). זה לא דורש לפתח partial payments עכשיו — רק לא לחסום את זה במודל, כי המקרה הידוע מה-Business Spec (סכום מעל 3,540₪ בלי הרשאת מס"ב → אפשרות ל"תשלום אחד/תשלומים") כבר תלוי בזה.

---

## עקרונות Immutability

**קפוא לעד:**
- שדות הכסף ב-Statement (`gross_raised`, `fee_rate`, `vat_rate`, `fee_amount`, `vat_amount`, `total_due`) — מרגע `FINALIZED`. `fee_rate`/`vat_rate` נשמרים כ**ערכים** על ה-Statement עצמו, לא כהפניה חיה להגדרה גלובלית (כדי ששינוי עתידי בשיעור המע"מ לא "יזיז" סטייטמנטים היסטוריים).
- **זהות רכיבי המקור** ש-`gross_raised` חושב מהם — לא רק הסכום הכולל. ר' Invariant #8 למטה: הסבר היסטורי ל-Statement לא יכול להיות תלוי בשאילתה עתידית חוזרת למקור הנתונים.
- תוצאת Collection Attempt — מרגע שנפתר (SUCCESS/FAILURE). לא נערך אחורה; ניסיון נוסף = Attempt חדש.
- Receipt — מרגע ההנפקה. תיקון = מסמך חדש/מבטל.

**כן משתנה:**
- סטטוס Statement (מתקדם דרך ה-lifecycle).
- חיבורי אמצעי תשלום ו-enforcement status ב-Billing Account.
- לוג Routing Decisions (רק נוספות רשומות, לא נערכות).

---

## Source of Truth בכל שלב

| שלב | מקור האמת |
|---|---|
| Calculate (בתוך Billing Run) | נתוני Charging Engine (donations/campaigns) עד `asOf` — **לא** נתוני Billing Engine עצמו |
| אחרי FINALIZED | ה-**Statement עצמו** — אף תהליך לא מחשב מחדש מה-Charging Engine שוב |
| Collection | תוצאת ה-**Collection Attempt** בפועל — לא ההנחה שב-Routing Decision |
| מס"ב | אילו Statements מנותבים כרגע ל-MASAV (דרך Routing Decision) — מס"ב **צורך** Statements קיימים, לא מחשב עמלה בעצמו |

---

## עקרון `asOf` / `effectiveAt` — הזמן הוא Input

- `Billing Period` נגזר מ-`asOf` בלבד — "מהו ה-28 האחרון ומה הקודם לו" הוא פונקציה טהורה של `asOf`, לא קריאה לשעון.
- כל Billing Run נושא `asOf` מפורש משלו — לא "עכשיו" מרומז.
- Collection Attempt נושא זמן-אפקטיבי משלו, כך שניתן "להזיז זמן קדימה" בסימולציה (retry אחרי X ימים) בלי לגעת בשעון האמיתי.
- המטרה: לדמות ביום עבודה אחד רצף חודשים שלם — כולל carry-over, כשלי גבייה, מעבר למס"ב, והשעיה — בלי להמתין ללוח השנה.

## הפרדת Simulation / Test / Production

שלוש רמות, מופרדות בקפדנות:

1. **Dry Run (Simulation)** — מייצר **Billing Preview בלבד**. אין אליו שום הפניה מ-Routing Decision/Attempt/Payment/Receipt. **לעולם לא פונה ל-payment provider אמיתי ולעולם לא יכול לחייב כרטיס.**
2. **Test Execution** — יכול ליצור Statements/Attempts אמיתיים לצורך בדיקה, אבל **רק בסביבת TEST נפרדת** (הפרדה סביבתית, לא `is_test=true` בתוך אותן טבלאות ייצור).
3. **Production Execution** — המסלול היחיד שמותר לו לבצע חיוב אמיתי, עם הרשאות ו-safeguards מתאימים.

---

## שמונת ה-Domain Invariants

1. **Idempotency** — לכל (Billing Account, Billing Period) קיים **לכל היותר Statement סופי אחד**. הרצה כפולה של אותו Billing Run (למשל טעות ב-Scheduler) חייבת להיות no-op לחשבונות שכבר כוסו — לא ליצור Statement/חיוב נוסף.
2. **בידוד Simulation** — Dry Run לעולם לא יוצר Statement, רק Preview חסר-יכולת-להניע-כסף. Test Statements קיימים רק בסביבת TEST נפרדת.
3. **Traceability (ברגע החישוב)** — כל `gross_raised` בסטייטמנט ניתן להסבר חזרה לרכיבי הגיוס הספציפיים שהרכיבו אותו.
4. **שימור כסף בין תקופות** — כל רכיב גיוס משתייך ל-Billing Period אחד ויחיד; לא נספר פעמיים, לא נעלם. הגבול מוגדר כ-**half-open interval** `[period_start, period_end)` — ר' "עקרון גבולות הזמן" בסעיף ה-Pipeline למטה.
5. **הקפאה** — שדות הכסף ב-Statement (כולל `fee_rate`/`vat_rate` כערכים שמורים, לא הפניה חיה) קפואים לעד מרגע `FINALIZED`.
6. **SUSPENDED שייך ל-Billing Account** — לא ל-Statement. Statement פתוח של חשבון מושעה נשאר לגמרי בר-גבייה.
7. **תקרת תשלום** — Σ (Payments מוצלחים המשויכים ל-Statement) **≤** `Statement.total_due`. שוויון ⇒ Statement עובר אוטומטית ל-`PAID`. עודף/refund/credit — מנגנון פיננסי נפרד ומפורש בעתיד, לא תוצר לוואי של retry כפול.
8. **🆕 Traceability immutable (לנצח, לא רק ברגע החישוב)** — היכולת להסביר Statement קפוא **אסור** שתהיה תלויה בשאילתה עתידית חוזרת למקור הנתונים (`donations` או כל מקור אחר). ברגע `FINALIZED`, יש להקפיא לא רק את הסכום אלא גם את **זהות** קבוצת Billing Components המדויקת ששימשה לחישובו. **מנגנון האחסון (טבלת קישור, JSON snapshot, או אחר) לא הוכרע כאן — זו דרישת Domain, לא פרט מימוש.** הנימוק: אם רכיב מקור נערך/נמחק/refund בעתיד, שאילתה חוזרת עלולה להחזיר תוצאה שונה מזו ששימשה בפועל לחישוב הסטייטמנט ההיסטורי — וזה סותר את עקרון ה-Snapshot הקפוא.

---

## Billing Calculation Pipeline — audit + pipeline מאושרים (2026-08-20)

### Audit read-only של המודל הפיננסי הקיים (`hamonym-backend`)

**מקור האמת בפועל ל-`raised` של קמפיין:** **לא** `campaigns.current_amount`. זהו contador שמתעדכן ב-4 מקומות לא-טרנזקציוניים ביניהם (`markDonationPaid`, `handleMockComplete`, `createManualDonation`, `detail-recurring.handler.js`) — יש עליו job ייעודי (`aggregate-consistency.job.js`) שכבר תפס drift אמיתי בפרודקשן. מקור האמת האמיתי הוא **`donations`** ישירות, בתבנית `SUM(amount) WHERE status='paid'` — תבנית קיימת וחוזרת כבר ב-4 מקומות אחרים בקוד (`reports.service.js`, `dashboard.service.js`, `platform.service.js`, וה-job עצמו).

**שלושת סוגי הרכיבים — מתכנסים לאותה טבלה, אותו status, אותו timestamp:**

| סוג רכיב | זיהוי ב-`donations` | Status שמחייב עמלה | Business Effective Time |
|---|---|---|---|
| תרומה חד-פעמית (כרטיס) | `source IS NULL`, `recurring_instruction_id IS NULL` | `status='paid' AND is_mock=false` | `completed_at` |
| חיוב recurring בודד | `recurring_instruction_id IS NOT NULL` | `status='paid' AND is_mock=false` | `completed_at` |
| הזנה/תרומה ידנית | `source IN ('bank_transfer','check','cash','other')` | `status='paid' AND is_mock=false` | `completed_at` |

כל חיוב recurring חודשי הוא `INSERT` עצמאי (`detail-recurring.handler.js:58-83`, לא `UPDATE`) — רכיב כספי משלו, מתוארך ומזוהה בנפרד, בדיוק כפי שנדרש ל-Traceability.

**Gaps שזוהו מול ה-Invariants:**
- `is_mock` **לא מסונן** באף שאילתת aggregate קיימת בקוד — סיכון ישיר ל-Invariant #2 אם Billing ישתמש בתבנית הקיימת כמות-שהיא.
- אין ל-Billing Account (`entities`) שדה `fee_rate`/`vat_rate` משלו עדיין — נדרש למימוש Invariant #5.
- אין אכיפת DB-level ל-"Statement סופי יחיד לכל (Account, Period)" — כרגע רק עיקרון (Invariant #1).
- אין ייצוג ל-refund/chargeback בקוד כלל (`grep -i refund` — אפס תוצאות) — לא חוסם את ה-Pipeline, Open Question לעתיד.

### עקרון גבולות הזמן — Half-Open Interval

Billing Period מוגדר כ-**`[period_start, period_end)`**: `completed_at >= period_start AND completed_at < period_end`. **לא** `BETWEEN` (סגור בשני הקצוות). כך רכיב שהושלם בדיוק ב-`period_end` (למשל 28/08 20:00:00.000) משתייך **בוודאות** לתקופה הבאה בלבד — אין מצב שרכיב שייך לשתי תקופות, או שאין לו תקופה. זהו הבסיס המתמטי ל-Invariant #4.

### הפייפליין המאושר

| שלב | Input | פעולה | Output | Invariant מוגן |
|---|---|---|---|---|
| **Select** | Billing Account (`entity_id`) + Billing Period bounds `[start, end)` | `donations WHERE entity_id=X AND status='paid' AND is_mock=false AND completed_at>=start AND completed_at<end` | קבוצת שורות מועמדות | #2 |
| **Normalize** | שורות גולמיות (source שונה) | מיפוי ל-`{amount, completed_at, origin_type, origin_id}` אחיד | רשימה נורמלית | מכין ל-#3/#8 |
| **Assign Period** | `completed_at` לכל שורה | אימות half-open בטווח המדויק | רשימה מאושרת-period | #4 |
| **Validate** | הרשימה המאושרת | בדיקת שפיות: אין `id` כפול, כל שורה `paid`+`is_mock=false` בפועל | רשימה תקפה | מכין ל-#1 |
| **Aggregate** | הרשימה התקפה | `gross_raised = Σ amount` | סכום יחיד + **רשימת זהויות הרכיבים** (לא רק הסכום) | #3, מכין ל-#8 |
| **Calculate Fee/VAT** | `gross_raised` + `fee_rate`/`vat_rate` מ-Billing Account | `fee_amount`, `vat_amount`, `total_due` | שלושה ערכים | הכנה ל-#5 |
| **Preview** | הפלט המלא, `Billing Run.mode=DRY_RUN` | אין כתיבה מחייבת | `Billing Preview` בלבד | #2 — לא ממשיך הלאה לעולם |
| **Finalize** | אותו פלט, `Billing Run.mode=PRODUCTION` | בדיקת #1 מפורשת ("כבר יש Statement?"), הקפאת הסכום **וגם** זהות הרכיבים | `Statement` קפוא + Traceability קפואה | #1, #4, #5, #6, **#8** |

### דוגמה מספרית מלאה

**Billing Account:** עמותת ALS · `fee_rate=3%` · `vat_rate=18%` · **Billing Period:** `[28/07/2026 20:00, 28/08/2026 20:00)`

| # | מקור | סכום | `completed_at` | נכלל? |
|---|---|---:|---|---|
| 1 | כרטיס, חד-פעמי | 15,000 ₪ | 03/08 | ✅ |
| 2 | כרטיס, חד-פעמי | 12,000 ₪ | 10/08 | ✅ |
| 3 | recurring, חיוב #4 | 1,500 ₪ | 05/08 | ✅ |
| 4 | recurring, חיוב #2 | 800 ₪ | 12/08 | ✅ |
| 5 | ידני, bank_transfer | 25,000 ₪ | 15/08 | ✅ |
| 6 | ידני, check | 5,700 ₪ | 20/08 | ✅ |
| 7 | כרטיס, חד-פעמי | 20,000 ₪ | 27/08 23:00 | ✅ |
| 8 | כרטיס, חד-פעמי | 500 ₪ | 28/08 19:30, `is_mock=true` | ❌ (Select, Invariant #2) |
| 9 | recurring, כושל | 900 ₪ | 22/08, `status='failed'` | ❌ (Select) |
| 10 | כרטיס, חד-פעמי | 3,000 ₪ | **28/08 20:00:00** בדיוק | ❌ (half-open — שייך לתקופה **הבאה**, לא לזו) |

`gross_raised = 15,000+12,000+1,500+800+25,000+5,700+20,000 = 80,000 ₪` (רכיבים 1-7 בלבד, זהותם קפואה יחד עם הסכום — Invariant #8)
`fee_amount = 80,000 × 0.03 = 2,400 ₪` · `vat_amount = 2,400 × 0.18 = 432 ₪` · `total_due = 2,832 ₪`

```text
Billing Account: עמותת ALS
Billing Period:  [28/07 20:00, 28/08 20:00)
gross_raised:    80,000 ₪  (7 רכיבים, זהותם קפואה — לא נשלפים מחדש מ-donations)
fee_rate:        3%   (מוקפא)
vat_rate:        18%  (מוקפא)
total_due:       2,832 ₪
status:          DRAFT → FINALIZED  (רק אם PRODUCTION)
```

---

## מה במכוון לא הוכרע כאן — לשלבים הבאים

- **DB Schema** (Technical Implementation Design) — זה השלב המיידי הבא.
- migrations.
- API Contracts.
- UI (מסך אדמין "Approve & Charge", ניהול Billing Account, וכו').
- אינטגרציה ספציפית מול CardCom (אשראי) ו-Tranzila/מס"ב — במכוון נדחתה עד שה-Billing Engine עצמו provider-agnostic וסגור.
- מנגנון האחסון הקונקרטי ל-Invariant #8 (Traceability immutable) — טבלת קישור/JSON snapshot/אחר.
- ייצוג refund/chargeback.
