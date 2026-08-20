# HAMONYM_BILLING_ENGINE_TECHNICAL_DESIGN.md — Domain Model

**סטטוס:** **Frozen v1 — Domain Model בלבד.** אין כאן DB Schema, migrations, API Contracts, UI או קוד — ואין ניסיון לפתור שאלות שלא הוכרעו. השלב הבא (לא במסמך זה): Billing Calculation Pipeline.
**תאריך:** 2026-08-20
**מרחיב:** `docs/HAMONYM_BILLING_ENGINE_SPEC.md` (Business Spec, Frozen v1) — לא סותר אותו, מתרגם אותו למודל דומיין. גם עקבי עם `docs/PAYMENTS_ARCHITECTURE_CONTEXT.md` (ה-Compass שמגדיר Billing Engine כמנוע נפרד מ-Charging Engine).

## מה המסמך הזה כן

מודל הדומיין המלא של Billing Engine כפי שסוכם עם היוזר בסבב תכנון הדרגתי (2026-08-20): הישויות, האחריות של כל אחת, הקשרים ביניהן, שלושת מחזורי החיים (state machines), עקרונות ה-Immutability, שבעת ה-Domain Invariants, מקור האמת בכל שלב, עקרון `asOf/effectiveAt`, וההפרדה בין Simulation/Test/Production.

## מה המסמך הזה לא

לא DB Schema, לא migrations, לא API Contracts, לא UI, לא קוד. לא Billing Calculation Pipeline (איך בפועל נבנה Statement מנתוני גיוס — זה השלב הבא, מסמך/סעיף נפרד). לא אינטגרציית CardCom/Tranzila ספציפית — המודל **provider-agnostic** במכוון; Collection Attempt מתייחס לערוץ (CARD/MASAV/MANUAL) כתווית מופשטת, לא לפרטי API של ספק.

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

## שבעת ה-Domain Invariants

1. **Idempotency** — לכל (Billing Account, Billing Period) קיים **לכל היותר Statement סופי אחד**. הרצה כפולה של אותו Billing Run (למשל טעות ב-Scheduler) חייבת להיות no-op לחשבונות שכבר כוסו — לא ליצור Statement/חיוב נוסף.
2. **בידוד Simulation** — Dry Run לעולם לא יוצר Statement, רק Preview חסר-יכולת-להניע-כסף. Test Statements קיימים רק בסביבת TEST נפרדת.
3. **Traceability** — כל `gross_raised` בסטייטמנט ניתן להסבר חזרה לרכיבי הגיוס הספציפיים שהרכיבו אותו (מנגנון האחסון בפועל לא הוכרע כאן — זו דרישת Domain, לא פרט מימוש).
4. **שימור כסף בין תקופות** — כל רכיב גיוס משתייך ל-Billing Period אחד ויחיד; לא נספר פעמיים, לא נעלם.
5. **הקפאה** — שדות הכסף ב-Statement (כולל `fee_rate`/`vat_rate` כערכים שמורים, לא הפניה חיה) קפואים לעד מרגע `FINALIZED`.
6. **SUSPENDED שייך ל-Billing Account** — לא ל-Statement. Statement פתוח של חשבון מושעה נשאר לגמרי בר-גבייה.
7. **תקרת תשלום** — Σ (Payments מוצלחים המשויכים ל-Statement) **≤** `Statement.total_due`. שוויון ⇒ Statement עובר אוטומטית ל-`PAID`. עודף/refund/credit — מנגנון פיננסי נפרד ומפורש בעתיד, לא תוצר לוואי של retry כפול.

---

## מה במכוון לא הוכרע כאן — לשלבים הבאים

- **Billing Calculation Pipeline** — איך בפועל הופכים נתוני גיוס ל-Statement: מקור קריאת רכיבי הגיוס, בניית Preview, מה בדיוק `FINALIZE` עושה, אכיפת ה-Invariants #1/#3/#4 בפועל (לא רק כעיקרון). זה השלב המיידי הבא.
- DB Schema / migrations.
- API Contracts.
- UI (מסך אדמין "Approve & Charge", ניהול Billing Account, וכו').
- אינטגרציה ספציפית מול CardCom (אשראי) ו-Tranzila/מס"ב — במכוון נדחתה עד שה-Billing Engine עצמו provider-agnostic וסגור.
