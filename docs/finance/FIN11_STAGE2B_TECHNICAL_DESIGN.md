# FIN-11 Stage 2B — Technical Design: Safe Payment Resolution & Overpayment Handling

מסמך זה מתעד את המימוש הטכני של Stage 2B (2026-10), בהתאם להחלטות העסקיות המאושרות ב-`FINANCIAL_BUSINESS_DECISIONS.md` חלק ו'. **מצב**: ממומש ונבדק ב-worktree מבודד (`C:/DEV/HamonymStudio-fin11-stage2b`, commit טרם בוצע עד אישור), **לא נדחף, לא הוחל על DB משותף**.

## 1. מצבי כשל שאותרו (Audit קודם) ואיך הם נסגרו

| מצב כשל | מצב לפני Stage 2B | תיקון |
|---|---|---|
| `resolveAttempt` לא נועל את ה-Statement בכלל | נכתב `payments` בלי שום נעילה | נוספה `SELECT s.id, ba.entity_id ... FOR UPDATE OF s` בתחילת הטרנזקציה — אותו סדר נעילה כמו `openAttempt`/`applyStatementAdjustment`/`foldLateDonationsIntoStatement` (Statement קודם, לעולם לא תרומות/תשלומים קודם) |
| `requested_amount` קפוא, לא מחושב מחדש | ה-balance נקרא *אחרי* ה-INSERT, רק כדי להחליט על סטטוס | `getStatementBalance` נקרא **לפני** ה-INSERT, תחת הנעילה הטרייה — `outstandingBeforePayment` הוא עדכני באמת |
| אין בדיקת גביית-יתר | אין | `overpaymentAmount = max(0, collectedAmount - outstandingBeforePayment)` — מחושב בכל הצלחה |
| הבלעדיות היחידה (`ACTIVE_ATTEMPT_STATUSES`) היא ה-FIN-11 Stage 3/4 מתכוון לרופף | לא טופל (לא בתכולת Stage 2B) | `payment_exceptions`-based hold (entity-wide) נוסף כהגנה **נוספת**, לא כתחליף — `ACTIVE_ATTEMPT_STATUSES` לא נגוע |
| reconcile ידני (`billing-ops.service.js#reconcileCollectionAttempt`) לא בודק סטטוס attempt לפני ריצה | ללא שינוי בשלב זה | **לא תוקן ב-Stage 2B** — ר' סיכונים שנותרו, סעיף 8 |
| "overpaid" check ב-reconciliation job משווה ל-`total_due` גולמי | ללא שינוי בשלב זה | **לא תוקן ב-Stage 2B** — ר' סיכונים שנותרו, סעיף 8 |

## 2. אימות סכום-ספק בפועל — נבדק מחדש, סבב ביקורת שני (דיוק הטענה, לא שינוי לוגיקה)

**הניסוח המדויק חשוב — הנוסח המקורי ("provider-confirmed amount") היה מרחיק לכת מעבר למה שבאמת אומת.** `ResponseCode=0` הוא אישור של CardCom ש**היא עיבדה בהצלחה את הבקשה הספציפית שנשלחה** — זה **אינו** הד עצמאי, שנקבע ע"י הספק בנפרד, לסכום שהוסדר. אין שדה כזה בכלל לקרוא אותו. הטענה שהקוד נשען עליה מצומצמת ומדויקת יותר, ומבוססת על **שתי עובדות נפרדות, שתיהן נבדקו ישירות**, לא על הנחה אחת גורפת:

**עובדה 1 — סכימה (אומתה מול ה-swagger הרשמי של CardCom v11)**: ה-**בקשה** (`TransactionReq`) מקבלת **רק** `TerminalNumber`/`ApiName`/`Amount`/`Token`/`CardExpirationMMYY`/`ExternalUniqTranId`/`ISOCoinId`/`Advanced` (`additionalProperties:false`, **נבדק כסכימה סגורה ומלאה, לא חלקית**) — **אין שדה תשלומים/פיצול-מטבע/גבייה-חלקית** שה-adapter שלנו יכול לשלוח, ו-`cardcom.client.js#chargeToken` **לעולם לא** שולח `Advanced.IsRefund` או שדה-תשלומים כלשהו. ה-**תגובה** (`TransactionInfo`) היא `ResponseCode`+`Description`+`TranzactionId`+`ApprovalNumber` — **אין שדה-סכום בשום כיוון**.

**עובדה 2 — קוד (ניתן למעקב ישיר בריפו הזה)**: השדה `Amount` שבאמת נשלח ל-CardCom ב-`charge()` הוא `opened.requestedAmount` (מ-`runCollectionForStatement`) — **אותו מספר בדיוק** שנכתב ל-`collection_attempts.requested_amount` באותה טרנזקציה ב-`openAttempt`. `grep` מאשר: העמודה הזו **לעולם לא** מתעדכנת (`UPDATE`) בשום מקום בקוד הזה אחרי ה-INSERT הראשוני.

**המסקנה, בדיוק עד כמה שהיא נתמכת**: כש-SHAPE של בקשה/תגובה אין בו שום שדה שיכול לשנות סכום בשני הכיוונים, וה-`Amount` שנשלח הוא מוכח-זהה ל-`requested_amount` — "הסכום ש-CardCom ביצעה בהצלחה" ו-"`requested_amount`" הם **אותו מספר מעצם הבנייה**, לא בגלל ש-CardCom "אישרה" אותו שוב בנפרד. **זו אינה חוק כללי על ה-API של CardCom** — צורת-קריאה אחרת (למשל קריאה שמשתמשת ב-`Advanced.IsRefund` או בשדה תשלומים) תחייב בדיקה מחדש מאפס. זה תקף **ספציפית** לצורת-הקריאה האחת שה-adapter הזה שולח.

**מה זה עדיין לא פותר (ולא מתחזה לפתור)**: האם `requested_amount` עדיין היה הסכום הנכון-לבקש **מהצד שלנו**, נוכח כל מה שיכול היה לקרות מרגע פתיחת הניסיון — זו שאלה נפרדת לגמרי, שנפתרת ע"י נעילה+חישוב-יתרה-מחדש (סעיף 1 לעיל), לא ע"י שום דבר שה-provider מחזיר או לא מחזיר.

## 3. אסטרטגיית טרנזקציה ונעילה

```
resolveAttempt(attemptId, statementId, outcome):
  BEGIN
  LOCK statements (FOR UPDATE OF s)          -- ראשון, תמיד, אותו סדר כמו כל שאר הכותבים
  UPDATE collection_attempts (status, provider_reference, ...)
  IF outcome.outcome === 'succeeded':
      collectedAmount = attempt.requested_amount      -- סעיף 2 לעיל
      balanceBeforePayment = getStatementBalance()    -- תחת הנעילה הטרייה
      INSERT payments (amount = collectedAmount)       -- מלא, לעולם לא נחתך
      overpaymentAmount = max(0, collectedAmount - balanceBeforePayment.outstanding)
      IF overpaymentAmount > 0:
          INSERT payment_exceptions (status='open', hold_new_collection=true)
          recordFinding(severity='critical')           -- מתריע לסופר-אדמין
      balanceAfterPayment = getStatementBalance()       -- נקרא שוב, אחרי ה-INSERT
      IF balanceAfterPayment.collected >= balanceAfterPayment.adjustedTotal:
          UPDATE statements SET status='paid'
  COMMIT
```

**סדר נעילה עקבי** (Statement תמיד ראשון) נבדק מול כל שאר הכותבים הקיימים (`openAttempt`, `applyStatementAdjustment`, `reopenStatementForCollection`, `foldLateDonationsIntoStatement`) — כולם נועלים Statement ראשון. **אין deadlock אפשרי** כתוצאה מהשינוי הזה.

## 4. אסטרטגיית Idempotency

שתי שכבות, שתיהן קיימות מראש וממשיכות ללא שינוי:
1. **`payments.collection_attempt_id UNIQUE`** + **`payments(provider, provider_reference) UNIQUE`** (migration 059) — resolveAttempt שני על אותו attempt זורק `23505`, נתפס ע"י כל הקוראים הקיימים (`collection-attempt-reconciliation.job.js`, `billing-ops.service.js#reconcileCollectionAttempt`) כ"הפסד race תקין", לא שגיאה. **נבדק מחדש** (בדיקה #5) — עדיין עובד בדיוק כך לאחר השינוי.
2. **הנעילה החדשה** (סעיף 3) מוסיפה סריאליזציה אמיתית: שני `resolveAttempt` מקבילים על **אותו Statement** (לא רק אותו attempt) כעת נעצרים זה מול זה ב-lock, לא רק מתמודדים על ה-UNIQUE constraint בסוף. **נבדק** (בדיקה #13/13a — connection אמיתי שני חסום עד ש-connection ראשון משתלט).

## 5. חישוב גביית-יתר

```
overpaymentAmount = max(0, collectedAmount - outstandingBeforePayment)
```

כאשר `outstandingBeforePayment = getStatementBalance(statementId).outstanding`, ו-`getStatementBalance` כולל `adjustedTotal` (כל `statement_adjustments`, כולל תיקוני תרומות-מאוחרות מ-Stage 1) ולא `total_due` גולמי. **נבדק** (בדיקה #6): תשלום ששווה בדיוק ל-`adjustedTotal` (לא ל-`total_due` המקורי) **אינו** מסומן כגביית-יתר.

**לעולם לא נכתב מחדש תשלום היסטורי** — `payments` נשארת append-only (DB trigger קיים, לא נגוע). חריג גביית-יתר הוא שורה **נפרדת** (`payment_exceptions`), לא עדכון ל-payment הקיים.

## 6. מחזור חיים של חריג (Exception Lifecycle)

```
[detected: status='open', hold=true] ──override_hold──> [status='open', hold=false]
        │                                                        │
        └──────────────────resolve(refund/credit/no_overpayment)─┴──> [status='resolved', hold=false]
```
- **זיהוי**: קורה **רק** בתוך הטרנזקציה של `resolveAttempt` עצמה (אטומי עם ה-payment שגרם לו). אין נתיב אחר ליצירת שורה.
- **Override** (כלל 4.10): מסיר את ה-hold **מבלי** לפתור את החריג — פעולת אדמין נפרדת, רשומה ב-`payment_exception_actions` (append-only).
- **Resolve** (כלל C): רושם **החלטה בלבד** — `resolve_refund`/`resolve_credit`/`resolve_no_overpayment` — **לא מבצע** שום תשלום/זיכוי בפועל. סוגר גם את ה-hold אוטומטית (חריג שהוכרע כבר לא צריך להמשיך לחסום).
- חריג שנפתר **לא ניתן לפתור שוב** — נבדק (#11b).
- העמודות העובדתיות (`collected_amount`, `overpayment_amount`, וכו') **קפואות** ברגע היצירה — טריגר ייעודי (`trg_payment_exceptions_enforce_immutable_facts`) חוסם כל שינוי בהן, אפילו ע"י UPDATE ישיר. **נבדק** (#12).

## 7. שינויי מודל נתונים

**Migration 073** (`073_fin11_payment_exceptions.sql`) — **לא הוחלה על אף DB משותף/production. מוכנה ונבדקה בלבד**, בתוך טרנזקציית BEGIN...ROLLBACK (DDL ב-Postgres הוא טרנזקציוני באופן מלא — CREATE TABLE בתוך טרנזקציה שמתבצע לה ROLLBACK לא משאיר עקבות).

שתי טבלאות חדשות:
- **`payment_exceptions`** — שורה אחת לאירוע-זיהוי. `status`/`hold_new_collection` בלבד ניתנים לעדכון (אכוף ע"י טריגר, לא רק קונבנציה); שאר העמודות קפואות.
- **`payment_exception_actions`** — append-only (DB triggers חוסמים UPDATE **וגם** DELETE, כמו `statement_adjustments`), תיעוד כל פעולת אדמין.

**אין שינוי לסכימה הקיימת** — `payments`/`collection_attempts`/`statements` ללא שינוי מבני, רק לוגיקת-קוד.

### ⚠️ תלות פריסה קריטית — סדר פריסה מחייב + שער fail-fast

`openAttempt` ו-`getFin11CappedCardProposal` (Stage 2A) כעת **תלויים ב-runtime** בקיום טבלת `payment_exceptions` (קוראים ל-`hasOpenCollectionHold`). **אומת בפועל, לא רק בתיאוריה**: קריאה ישירה ל-`hasOpenCollectionHold` מול ה-DB האמיתי (שעליו migration 073 לא הוחלה) מחזירה בפועל `42P01: relation "payment_exceptions" does not exist`. `openAttempt` הוא המסלול האמיתי שה-pilot מסתמך עליו היום — פריסת הקוד הזה בלי המיגרציה **תשבור אותו**.

**סדר פריסה מחייב (לא אופציונלי, לא "אפשר גם ביחד")**:
1. הרץ את `scripts/migrate-073.js` על סביבת-היעד.
2. הרץ את `scripts/verify-fin11-stage2b-ready.js` **(חדש — שער fail-fast)** על אותה סביבת-יעד. סקריפט זה בודק (read-only בלבד, אין DDL, אין כתיבה): קיום שתי הטבלאות, קיום כל העמודות הצפויות בכל אחת, וקיום שלושת הטריגרים (`trg_payment_exceptions_enforce_immutable_facts`, `trg_payment_exception_actions_no_update`, `trg_payment_exception_actions_no_delete`). **יוצא עם קוד 1 ומדפיס בדיוק מה חסר אם משהו לא תקין** — ניתן לחבר כשער-חוסם ב-pipeline פריסה (לא רק אזהרה טקסטואלית במסמך).
3. **רק אחרי** ששני השלבים לעיל הצליחו — לפרוס/להפעיל מחדש את קוד ה-application.

**אומת ריצתית**: הרצת `verify-fin11-stage2b-ready.js` מול ה-DB הנוכחי (שעליו המיגרציה **לא** הוחלה) מחזירה קוד-יציאה `1` ומפרטת בדיוק אילו טבלאות/טריגרים חסרים — מאשר שהשער תופס את המצב הבעייתי במדויק, לפני שקוד ה-application אפילו מגיע לרוץ.

זו תלות-סדר-פריסה שחייבת להיסגר (migration → verify → קוד, לעולם לא ביחד/הפוך) לפני כל push/deploy — ר' Remaining Work/Handoff.

## 8. תאימות לאחור וסיכונים ידועים שנותרו

**תאימות לאחור**: `openAttempt`/`resolveAttempt`'s הקיים חותם חוזים (signature, return shape) לא השתנה — רק נוספו שדות (`overpayment` ב-return של `resolveAttempt`, שהוא `null` בכל המקרים הקיימים). כל הבדיקות הקיימות (Stage 1: 29/29, Stage 2A: 18/18) ממשיכות לעבור ללא שינוי.

**סיכונים ידועים שנותרו, לא טופלו ב-Stage 2B**:
1. **תלות-סדר-פריסה** (סעיף 7 לעיל) — הסיכון הגבוה ביותר, תפעולי לא טכני.
2. `billing-ops.service.js#reconcileCollectionAttempt` עדיין לא בודק את סטטוס ה-attempt לפני reconcile — ההגנה היחידה נשארת ה-UNIQUE constraint (מספיקה כנגד double-payment, לא כנגד reconcile מיותר/מבלבל).
3. `collection-attempt-reconciliation.job.js`'s בדיקת "overpaid" (`SUM(payments) > total_due`) עדיין משווה ל-`total_due` גולמי, לא ל-`adjustedTotal` — ברגע שכמה payments לגיטימיים (אשראי+מס"ב עתידי) יהפכו לנורמה, זה ייצור false positive. **לא תוקן בכוונה** (מסומן כפתוח, לא בתכולת Stage 2B לפי ההחלטה).
4. `routing.js`'s המודל הבינארי (סף ₪3,540) לא שונה — אין עדיין דרך שאשראי ומס"ב יפעלו **שניהם** על אותו Statement; Stage 2B רק מכין את ה-`resolveAttempt`/exception layer שיהיה בטוח כשזה יקרה.
5. אין מנגנון ביצוע refund/credit בפועל — מתועד כמגבלה, לא נבנה.
6. `hasOpenCollectionHold` לא נבדקה שהחלת ה-hold לא "תוקעת" עמותה לצמיתות אם מעולם לא נפתר/נדרס החריג (expected — זו ההתנהגות המאושרת: בלי אדמין, אין גבייה) — אין timeout אוטומטי, ולא צריך להיות אחד בשלב זה.
