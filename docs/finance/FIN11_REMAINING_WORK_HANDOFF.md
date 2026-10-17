# FIN-11 — Remaining Work / Handoff

מסמך זה הוא נקודת ההמשך המחייבת ל-FIN-11. **אין להציג כאן שום דבר כגמור שלא אומת בפועל.** אם תתחיל שיחה/session חדש/ה ולא תהיה גישה להיסטוריה — התחל כאן ובקרא את `FIN11_IMPLEMENTATION_STATUS.md` + `FINANCIAL_BUSINESS_DECISIONS.md` לפני כל שינוי.

## מה ממומש בפועל (אומת בבדיקות, לא רק מתועד)

- `foldLateDonationsIntoStatement` — **Stage 1, נדחף, בפרודקשן** (`d8d440e`). עדיין לא מחובר לשום caller/route.
- `getFin11CappedCardProposal` — **Stage 2A, committed, לא נדחף** (`a4c364b`). קריאה טהורה בלבד — לא יוצרת attempt, לא גובה. לא מחוברת לשום caller.
- `resolveAttempt` מחוזק + `payment_exceptions`/`payment_exception_actions` — **Stage 2B, committed (`efbdd2f`+`00de328`), לא נדחף**. **migration 073 לא הוחלה על שום DB.**
- `masav-proposal.service.js` (prepare/list/approve/export proposals) — **Stage 3, committed (`dea7aca`+`5f56b98`), לא נדחף**. **migration 074 לא הוחלה על שום DB.** מנגנון מקביל ל-`masav-collection.service.js` הישן, **עם מודעות חד-כיוונית**: הישן בודק את החדש (לא להפך) — ר' "בדיקות אינטגרציה" למטה.
- `Document.TaxId` (Israel Invoices, ענף עצמאי) — **committed (`1044621`), לא נדחף**. אינו חלק מ-FIN-11 עצמו (קובץ `donations.service.js`, לא נוגע ב-collection/billing engine).
- **הכנת אינטגרציה אומתה (2026-10-16)**: שרשרת FIN-11 (`5f56b98`) + TaxId (`1044621`) שולבו (cherry-pick נקי, אפס קונפליקטים, אפס חפיפת קבצים) בענף worktree מבודד `fin11-integration-prep` (commit `ac2443b`, `C:/DEV/HamonymStudio-fin11-integration`). 80/80 בדיקות קיימות עברו על הענף המשולב. **הענף הזה לא נדחף ולא מוזג ל-main — מחכה לאישור.**
- **תיקון תאימות פריסה — הושלם, נדחף** (`dd727a1`, 2026-10-17). `fin11-schema-probe.js` מגן על `openAttempt`/`openMasavAttempt` מפני קריסה לפני מיגרציה. ר' `FIN11_IMPLEMENTATION_STATUS.md` לפירוט.
- **מיגרציות 073+074 — הוחלו בפועל על ה-DB המשותף** (2026-10-17), לאחר גיבוי מאומת (`pg_dump` + `pg_restore --list`, שמור ב-`C:\HamonymBackups\`). `verify-fin11-stage3-ready.js` מאשר: OK. הגנות FIN-11 Stage 2B/3 **פעילות בפועל כעת** בקוד שכבר נדחף.
- **Stage 4 — ניתוב משולב + תזמון — הושלם, לא committed** (`C:/DEV/HamonymStudio-fin11-stage4`, ממתין לאישור commit). שכבת תזמון/ריטריי מעל מה שכבר קיים (`openFin11CappedCardAttempt`, `collectWithRetries`, 3 jobs חדשים — **לא רשומים** ב-`src/jobs/index.js`, לכן לא פעילים). ר' `FIN11_IMPLEMENTATION_STATUS.md`/`FIN11_STAGE4_TECHNICAL_DESIGN.md` לפירוט מלא. 28/28 PASS + 100/100 קיימות ללא רגרסיה.

## מה מתועד/מוכרע עסקית בלבד — **לא ממומש**

- מסלול קליטת תוצאות מס"ב (recordMasavResult-מחליף) — **דורש החלטה עסקית חדשה**, לא רק קוד (ר' FIN-15#2 ב-`FINANCIAL_BUSINESS_DECISIONS.md`). Stage 3 **לא** פותר את זה — `masav_collection_proposals.status` עוצר ב-`exported` בכוונה. Stage 4 **לא** נגע בזה (מחוץ לתחום).
- תנאי גבייה פרטניים ברמת עמותה.
- escalation אנושי אחרי מיצוי 3 ניסיונות — **ה-finding עצמו ממומש** (Stage 4, `fin11_card_attempts_exhausted`); תהליך-המשך אנושי (מי בודק, איך סוגרים) לא מוגדר מעבר לפוליסיה העסקית הקיימת (סופר-אדמין בודק סטטוס אמיתי מול הספק → אם לא נגבה, יכול לכלול בתהליך המס"ב הידני).
- הבחנת שלבי מס"ב (הוכן/שודר/אומת/נדחה/בהמתנה) — מתועד תפיסתית ב-`FIN11_STAGE3_TECHNICAL_DESIGN.md` סעיף 6, **רק 3 השלבים הראשונים (Prepared/Approved/Exported) ניתנים למימוש בפועל**.
- `routing.js` — עדיין מכריע בינארית לפי סף ₪3,540; לא תומך "שני אמצעים על אותו Statement" בפועל. Stage 3 **לא נגע בו בכוונה** (מנגנון מקביל).
- UI לכל חלק ה-overpayment-exception (צפייה בחריגים, override, resolve) — **אין ממשק, רק פונקציות backend**.
- UI למעקב/אישור/ייצוא הצעות MASAV (`masav_collection_proposals`) — **אין ממשק, רק פונקציות backend**.
- `masav-collection.service.js` הישן — **שונה נקודתית** (`openMasavAttempt` בודק proposal פעיל, ר' "בדיקות אינטגרציה" למטה) אבל **לא מוזג** עם המנגנון החדש; `listBlockedStatements`/`listActionableMasavStatements`/`generateExportExcel` לא עודכנו (קריאה-בלבד, לא כותבות). שני מנגנוני מס"ב קיימים כרגע זה לצד זה, עם מודעות חד-כיוונית.
- מנגנון ביצוע refund/credit בפועל — **אינו קיים, לא הוכרע עסקית אם/איך יבנה**.

## בדיקות אינטגרציה — נפתרו (2026-10, המשך session)

שלוש הבדיקות שזוהו בעצירה הקודמת **תוקנו, נבדקו (36/36 PASS), ותועדו**. ר' `FIN11_STAGE3_TECHNICAL_DESIGN.md` סעיף 11 לפירוט המלא של כל תיקון. תקציר:

### א. חפיפה בין מנגנון המס"ב הישן והחדש — נפתר
`openMasavAttempt` (הישן) כעת קורא ל-`hasActiveMasavProposal` (חדש) לפני פתיחת ניסיון — אם קיים proposal פעיל (`proposed`/`approved`/`exported`) על ה-Statement, הישן נחסם (`fin11_masav_proposal_active`) ונרשם finding. **נבדק ישירות** (#16/#16a/#16b): כולל שהחסימה תקפה גם כש-proposal כבר `exported` (לא רק proposed/approved). `listBlockedStatements`/`listActionableMasavStatements` (קריאה-בלבד, לא כותבות) **לא עודכנו** — אין סיכון כספי מרשימה לא-מעודכנת, רק UX; מתועד כפער קטן שנותר.

### ב. אימות יתרה טרי בזמן ייצוא — נפתר
`exportMasavProposals` כעת מחשב `getStatementBalance` מחדש, תחת נעילת Statement טרייה, **לכל proposal בנפרד** בתוך ה-batch, ומשווה ל-`proposed_amount` המאושר. אם היתרה השתנתה — ה-proposal מסומן `superseded` וכל קריאת ה-export (כל ה-batch) נכשלת (`PROPOSAL_STALE_AT_EXPORT`), כדי לא לייצא קובץ חלקי-תקף. **נבדק ישירות** (#17/#17a/#17b/#17c): תשלום שמתקבל בין אישור לייצוא חוסם את הייצוא, מסמן superseded, ו-re-prepare נותן את הסכום הנכון.

**ממצא נוסף שהתגלה ותוקן באותו סבב**: בעת כתיבת התיקון הזה התגלה **באג אמיתי בסדר הנעילות** — `approveMasavProposal`/`exportMasavProposals` נעלו את שורת ה-proposal *לפני* ה-Statement (ההפך מ-`prepareMasavProposal`), סיכון deadlock ממשי בתחרות אמיתית. תוקן: שתי הפונקציות כעת "מציצות" ל-`statement_id` בלי נעילה, נועלות Statement, ואז נועלות את ה-proposal — עקביות מלאה עם כל שאר הקוד בבסיס הזה (Statement קודם, לעולם לא אחרת).

### ג. מניעת גבייה באשראי בזמן שהוראת מס"ב מיוצאת עדיין לא נפתרה — נפתר
`openAttempt` ו-`getFin11CappedCardProposal` כעת קוראים ל-`hasExportedMasavProposal` (require עצל בתוך גוף הפונקציה, לא בראש הקובץ — נמנע מ-circular require אמיתי, כי `masav-proposal.service.js` כבר מייבא את `collection.service.js` בראש הקובץ שלו) — אם קיים proposal `exported` לא-פתור על **אותו** Statement, שניהם נחסמים (`masav_proposal_exported_unresolved`). **נבדק ישירות** (#18/#18a): כולל בידוד — Statement אחר של אותה עמותה לא מושפע (הבדיקה היא per-Statement, לא entity-wide).

**שלושת הפערים תוקנו כתיקונים נקודתיים, לא redesign — שום invariant כספי קיים לא השתנה, שום stage קודם לא נגוע.**

## חייב להיבדק/להיקבע לפני כל הפעלת-כסף-אמיתי

1. **✅ migrations 073+074 הוחלו בפועל (2026-10-17)** על ה-DB המשותף, עם גיבוי מאומת קודם ו-`verify-fin11-stage3-ready.js` מאשר OK אחריהן. הגנות FIN-11 Stage 2B/3 (hold על עסקת-יתר, חסימת חפיפת מסלולים) **פעילות בפועל כעת**, לא רק בקוד שמוכן להן.
2. `billing-ops.service.js#reconcileCollectionAttempt` — להוסיף בדיקת סטטוס לפני reconcile (לא עשוי ב-Stage 2B, ר' סיכונים שנותרו).
3. `collection-attempt-reconciliation.job.js`'s "overpaid" check — לתקן השוואה ל-`adjustedTotal` במקום `total_due` גולמי, לפני שיותר מ-payment אחד הופך לנורמה.
4. `routing.js` — **עדיין לא נוגע, בכוונה**. Stage 4 לא עבר דרכו: `openFin11CappedCardAttempt` הוא מסלול עצמאי (כמו `getFin11CappedCardProposal` לפניו), לא קריאה ל-`resolveCollectionMethod`. ה"ניתוב המשולב" בפועל נשאר: אשראי מוגבל ל-₪3,000 (Stage 4, אוטומטי כשיופעל) + מס"ב על השארית (Stage 3, הכנה אוטומטית כשיופעל + אישור/ייצוא ידני) — שני מסלולים עצמאיים שמתואמים רק דרך ה-guards (hold/exported-masav), לא דרך הכרעה בינארית אחת ב-`routing.js`. אם בעתיד ירצו גם את המסלול הישן (`openAttempt`/`openMasavAttempt` לפי `routing.js`) לפעול במקביל על סף ₪3,540 — עדיין צריך הכרעה.
5. החלטה עסקית מפורשת על מסלול קליטת תוצאות מס"ב (לא קיים היום, V1 boundary מכוון מ-1.9.2026). Stage 3 מתעד את המודל התפיסתי (Prepared/Approved/Exported בלבד) אבל לא פותר את זה.
6. **שני מנגנוני מס"ב (ישן+חדש) קיימים זה לצד זה** — צריך הכרעה עתידית: למזג, להחליף, או לתעד במפורש איזה מהם בשימוש לכל תרחיש.

## רשימת עבודה — Stage 4/UI

**Stage 4 (ניתוב משולב + תזמון) — הושלם בקוד, לא מופעל**:
- [x] Job/schedule ל-28/20:00 (אשראי) ו-6-בחודש (מס"ב) — `fin11-card-collection.job.js`, `fin11-masav-prepare.job.js`, `fin11-card-retry-sweep.job.js` (נוסף, לא היה ברשימה המקורית). **לא רשומים ב-`src/jobs/index.js` — לא פעילים.**
- [x] חיבור בפועל של גבייה מוגבלת לקריאה אמיתית ל-adapter (`charge()`), כולל 3-ניסיונות-לכל-היותר — `openFin11CappedCardAttempt`/`collectWithRetries`. **האדפטר האמיתי ייקרא בפועל רק אם/כש-jobs אלה יירשמו.**
- [ ] שינוי `routing.js` לדגם שמאפשר שני אמצעים על Statement אחד — **לא בוצע, בכוונה** (ר' סעיף 4 למעלה). Stage 4 עוקף את השאלה הזו, לא פותר אותה.

**Finance UI (מוצע)**:
- [ ] מסך חריגי גביית-יתר (`payment_exceptions`) לסופר-אדמין — רשימה, פרטים, override, resolve.
- [ ] תצוגת סטטוס hold ברמת עמותה.
- [ ] תצוגת Stage 2A proposal (לפני שהיא מחוברת לגבייה אמיתית) למטרות בדיקה/שקיפות.
- [ ] מסך הצעות MASAV (`masav_collection_proposals`) — תצוגה מקדימה, אישור, ייצוא, רשימת חריגים (מנדט חסר/attempt לא-פתור).

## מה חייב להיבדק לפני כל הפעלה בכסף אמיתי (סיכום)

- [x] migrations 073+074 הוחלו בסביבת היעד (הפרודקשן המשותף) ואומתו — `verify-fin11-stage3-ready.js`: OK (2026-10-17).
- [ ] `routing.js` מתוקן לדגם ההיברידי — **לא בוצע, בכוונה** (Stage 4 עוקף, לא פותר).
- [ ] `reconcileCollectionAttempt` ו-reconciliation job's overpaid-check תוקנו.
- [ ] החלטה עסקית על מס"ב-result-ingestion קיימת וממומשת.
- [ ] **רישום שלושת ה-jobs החדשים (`fin11-card-collection`/`fin11-card-retry-sweep`/`fin11-masav-prepare`) ב-`src/jobs/index.js`** — צעד נפרד, מפורש, שמפעיל קריאה אמיתית לאדפטר CardCom. לא בוצע, דורש אישור נפרד מכל מה שלמעלה.
- [ ] UI לחריגי גביית-יתר **וגם** ל-MASAV proposals קיים — אין טעם ב-hold/proposal-מבלי-יכולת-לסקור.
- [ ] הכרעה על שני מנגנוני המס"ב הקיימים זה לצד זה.
- [ ] בדיקת end-to-end אמיתית (sandbox CardCom, לא production) של המחזור המלא: card proposal → attempt → charge → resolve → (אם רלוונטי) exception → resolve → masav proposal → approve → export.

**עד שכל הסעיפים לעיל לא סומנו ✅ ואומתו בפועל — אין להפעיל גבייה אמיתית תחת FIN-11.**
