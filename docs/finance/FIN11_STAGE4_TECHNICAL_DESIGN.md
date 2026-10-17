# FIN-11 Stage 4 — Technical Design: Scheduling & Orchestration

תאריך: 2026-10-17. Worktree: `C:/DEV/HamonymStudio-fin11-stage4`. **לא committed, לא נדחף, שום job לא רשום/פעיל.**

## 1. מטרה ותחום

Stage 4 הוא שכבת **תזמון ואוטומציה** מעל מה שכבר קיים ונבדק (Stage 2A/2B/3). הוא **לא** מוסיף לוגיקה פיננסית חדשה — הוא מחבר מנגנונים קיימים (`resolveAttempt`, `prepareMasavProposalsForStatements`) ל-jobs מתוזמנים, ומוסיף **אחד** מנגנון כתיבה חדש (`openFin11CappedCardAttempt`) שבלעדיו אין דרך לפתוח ניסיון גבייה בפועל בסכום מוגבל.

**עיקרון מנחה**: "Card collection on the 28th at 20:00, capped at ₪3,000; MASAV complementary on the 6th, manual approve/export; preserve all Stage 2B/3 protections."

## 2. למה לא לשנות את `openAttempt`

`collection.service.js#openAttempt` הוא המסלול הקיים, היחיד, שמשמש את הגבייה הבינארית (אשראי *או* מס"ב, לפי סף ₪3,540 ב-`routing.js`). שינוי שלו לתמוך בסכום מוגבל היה משנה בשקט את ההתנהגות של **כל** Statement בפרודקשן היום — ההערה בקוד שלו (שנכתבה ב-Stage 2A) מזהירה מפני זה במפורש. Stage 4 ממשיך את אותה החלטה: `openFin11CappedCardAttempt` הוא פונקציה **נפרדת**, ב-`fin11-card-collection.service.js` (לא ב-`collection.service.js`), שמשכפלת את רצף ה-guards של `getFin11CappedCardProposal` (אותו תקדים: Stage 2A כבר שכפל את ה-guards של `openAttempt` מול אותה סיבה) אבל **כן כותבת** — היא ה-write-counterpart שחסר ל-proposal הקריא-בלבד.

## 3. קבצים

| קובץ | תפקיד |
|---|---|
| `src/modules/billing-engine/fin11-card-collection.service.js` | `openFin11CappedCardAttempt`, `runFin11CardCollectionCycle`, `collectWithRetries` |
| `src/jobs/fin11-card-collection.job.js` | ה-job ל-28/20:00 — מוצא את התקופה שנסגרה (reuse של `computeMostRecentCycleBoundary`), רץ `collectWithRetries` על כל Statement פעיל בה |
| `src/jobs/fin11-card-retry-sweep.job.js` | sweep שעתי (15 אחרי reconciliation) ל-Statements שה-attempt האחרון שלהם הפך מ-`ambiguous` לכשל מאומת **אחרי** ריצת ה-job הראשי |
| `src/jobs/fin11-masav-prepare.job.js` | תזמון יומי ל-6-בחודש — קורא ל-`prepareMasavProposalsForStatements` (Stage 3) על התקופה שנסגרה בחודש הקודם |
| `scripts/test-fin11-stage4-orchestration.js` | 28 בדיקות |

כל שלושת ה-jobs **לא רשומים** ב-`src/jobs/index.js` — `scheduler.js` לא מפעיל אותם. אימות: `git diff` ל-`index.js` ריק.

## 4. `openFin11CappedCardAttempt` — רצף מלא

זהה ל-`getFin11CappedCardProposal` (נעילת Statement → hold-check (073, מוגן ע"י `fin11-schema-probe`) → not-actionable check → active-attempt check → exported-MASAV check (074, מוגן) → balance read), בתוספת **אחרי** זה:

1. **בדיקת 3-ניסיונות + כשל-מאומת-בלבד** (חדש ב-Stage 4): נקרא את ה-`collection_attempts` האחרון מסוג `card` ל-Statement הזה.
   - אם קיים ואינו `declined`/`technical_failure` (כלומר `succeeded`/`pending`/`ambiguous`) → skip (`latest_attempt_not_a_confirmed_failure`). pending/ambiguous כבר חסומים גם ע"י active-attempt check למעלה — זו הגנה שנייה, מפורשת, לא הסתמכות-יחידה.
   - אם קיימים 3 ניסיונות ← skip (`max_attempts_reached`) + `recordFinding` קריטי (`fin11_card_attempts_exhausted`) — **אין השעיה אוטומטית, אין מעבר אוטומטי למס"ב** (החלטה עסקית).
2. קריאת `entity_billing` **ישירות דרך ה-client** (לא `billingRepository`, שמשתמש ב-`pool` הגלובלי — ראו הערה בסעיף 8 למה זה חשוב לבדיקות).
3. `requestedAmount = min(outstanding, 3000)`.
4. INSERT ל-`collection_attempts` עם הסכום המוגבל, flip ל-`open` אם היה `approved`.

## 5. `collectWithRetries` — הלופ

```
for i in 0..MAX_CARD_ATTEMPTS (inclusive, 4 איטרציות):
  cycle = runFin11CardCollectionCycle()  // open → charge → resolveAttempt
  if cycle.skipped: break
  if outcome == 'succeeded': break
  if outcome not in {declined, technical_failure}: break  // ambiguous -- never retried blind
```

**למה 4 איטרציות ולא 3**: גרסה ראשונה עצרה בדיוק ב-3 מחזורי-חיוב ממשיים, מה שאומר שה-finding על מיצוי המכסה **לא** היה נרשם באותה הרצה — רק בקריאה עתידית כלשהי ל-`openFin11CappedCardAttempt`. האיטרציה ה-4 היא **תמיד** skip-בלי-חיוב (המכסה כבר מלאה אחרי ה-3 הראשונות) — היא זו שרושמת את ה-finding, באותו רגע שהמכסה התמלאה. נבדק ישירות (בדיקה 4).

**סינכרוני בכוונה**: CardCom's `charge()` הוא request/response סינכרוני (ר' `collection.service.js`'s own comment — אין מודל authorize-then-capture, אין שדה-סכום בתגובה). כשל מאומת ידוע מיידית, אז ריטריי מיידי (בתוך אותה קריאה) הוא תקף — אין בפוליסיה העסקית מרווח-זמן-מינימלי בין ניסיונות, רק מכסה של 3.

## 6. ה-sweep — למה הוא קיים בנפרד

אם ניסיון ראשון חוזר `ambiguous` (לא `declined`), ה-loop למעלה עוצר (לעולם לא ריטריי על ambiguous). `collection-attempt-reconciliation.job.js` הקיים (לא שונה) פותר ambiguous מאוחר יותר, בתזמון השעתי שלו. אם הפתרון הזה מתגלה ככשל מאומת — Statement כזה "מגיע" לפחות מ-3 ניסיונות אם אין מי שיבדוק אותו שוב. `fin11-card-retry-sweep.job.js` הוא ה"מי" הזה: שאילתה ממוקדת ל-Statements עם attempt אחרון מסוג `declined`/`technical_failure` ומכסה-נותרת, קוראת ל-`collectWithRetries` עליהם.

**חשוב**: קריאה אחת ל-sweep יכולה לפתוח **יותר** מניסיון אחד (אם יש עדיין יותר מניסיון-מכסה אחד נותר, והתוצאה ממשיכה להיות כשל מאומת) — `collectWithRetries` לא "יודע" שזו קריאת-sweep, הוא פשוט ממשיך לפי אותה לוגיקה. נבדק ישירות (בדיקה 6d: Statement עם ניסיון קיים אחד מקבל 2 נוספים מקריאת sweep אחת, לא 1).

## 7. `fin11-masav-prepare.job.js` — סיכון נמוך, גם אם יופעל בטעות

בשונה משני ה-jobs האחרים, זה קורא רק ל-`prepareMasavProposalsForStatements` (Stage 3) — אידמפוטנטי, לא כותב payment, לא ממש. גם אם ייקרא פעמים רבות, לא יזיק. נותר **לא-רשום** בכל זאת, כי ההנחיה "do not activate production jobs" לא הוגדרה לפי רמת-סיכון.

## 8. פערי-לוואי שתוקנו בבדיקות קיימות (לא ב-Stage 4 עצמו)

שלושה קבצי בדיקה קיימים (Stage 2B/3 + `test-fin11-schema-compat.js` מ-Stage "תיקון תאימות פריסה") הניחו, בכתיבתם, שמיגרציות 073/074 **לא** מוחלות על ה-DB האמיתי — הם מריצים את ה-SQL שלהן בתוך טרנזקציית BEGIN...ROLLBACK משל עצמם כדי לעבוד גם לפני וגם אחרי. מאז שהוחלו בפועל (משימה נפרדת, אושרה בנפרד, 2026-10-17):

1. `CREATE TRIGGER` (בשונה מ-`CREATE TABLE`) אין לו `IF NOT EXISTS` — הרצה חוזרת נכשלת. **תוקן**: `DROP TRIGGER IF EXISTS` לפני כל re-apply.
2. "מצב חלקי" (רק 073, או רק 074) לא ניתן יותר לדימוי רק ע"י "לא להחיל" את השני — הוא קיים באמת. **תוקן**: `DROP TABLE IF EXISTS ... CASCADE` מפורש בתוך הטרנזקציה, לפני re-apply.
3. `providerReference: 'tx-5'` הקבוע ב-`test-fin11-stage2b-resolve.js` התנגש עם שורת ה-`payments` הקבועה שנותרה מתקרית נתוני-הבדיקה של Stage 4 עצמו (ר' `FIN11_IMPLEMENTATION_STATUS.md`) — שתיהן השתמשו ב-"tx-5" כ-literal גנרי, בלי קשר. **תוקן**: שינוי ל-`tx-2b-N`.

שלושתם תוקנו ב-`billingRepository`-תאימות: `openFin11CappedCardAttemptCore` (ה-mirror בבדיקות) קורא ל-`entity_billing` ישירות דרך `client`, לא דרך `billingRepository.getActiveDefaultByEntityId` (שמשתמש ב-`pool` הגלובלי ולכן לא רואה fixtures לא-committed בתוך טרנזקציית בדיקה) — עקרון שחל גם על `openFin11CappedCardAttempt` האמיתי עצמו, שמקבל את זה "חינם" כי הוא לא ב-mirror, הוא קורא ל-`billingRepository` כרגיל נגד DB אמיתי.

## 9. מיפוי בדיקות (28 סה"כ)

| # | בודק |
|---|---|
| 1-2 | תקרה ל-3000; אין תקרה כשמתחת לתקרה |
| 3-3b | ריטריי על כשל מאומת; עצירה על ambiguous |
| 4-4d | מכסת 3 + איטרציה 4 (skip-בלי-חיוב) + finding יחיד |
| 5-5a | ה-job מוצא את התקופה הנכונה בלבד |
| 6-6d | ה-sweep: לא-מוצא ambiguous/exhausted, מוצא confirmed-with-budget, פותח עד המכסה |
| 7-8 | succeeded → paid בסכום המוגבל המדויק; אידמפוטנטיות אחרי הצלחה |
| 9-9c | עסקת-יתר על סכום מוגבל (לא רק מלא) + hold חוצה-Statement + בידוד entity |
| 10-10a | `previousIsraelYearMonth` — גבול שנה |
| 11 | masav-prepare מול תקופה שלא קיימת |

## 10. מה לא ממומש / ידוע-חסר

- `routing.js` לא נוגע — ר' `FIN11_REMAINING_WORK_HANDOFF.md` סעיף 4.
- מסלול קליטת תוצאות מס"ב — לא קיים, Stage 4 לא פותר.
- שום UI — חריגים/proposals/jobs נראים רק ב-DB/לוגים.
- רישום ה-jobs ב-`index.js` — צעד נפרד, לא בוצע.

## 11. רצף פריסה מוצע (כשיאושר)

1. אישור+commit של Stage 4 (קוד זה).
2. Push (Render = push=deploy, כבר אומת) — הקוד "רדום", שום job לא פעיל.
3. **בנפרד, בעתיד**: הוספת שורת `jobRunner.register(...)` ל-`index.js` לכל job — זו הפעלה אמיתית, דורשת אישור מפורש נפרד לכל אחד (האדפטר האמיתי של CardCom ייקרא).
