# FIN-11 Stage 3 — Technical Design: Complementary MASAV Collection Proposals

מסמך זה מתעד את המימוש הטכני של Stage 3 (2026-10). **מצב**: ממומש ונבדק ב-worktree מבודד (`C:/DEV/HamonymStudio-fin11-stage3`), **לא בוצע commit עדיין** (ממתין לאישור), **לא נדחף, לא הוחל על DB משותף**.

## 1. התנגשות עם הארכיטקטורה הקיימת — נבדקה, לא נדרש redesign מהותי

נבדקו ישירות: `masav-collection.service.js` (openMasavAttempt/listBlockedStatements/listActionableMasavStatements/generateExportExcel), `routing.js`, `entity_masav_details`. **הממצא**: הקוד הקיים בנוי על **המודל הבינארי הישן** — מס"ב מוחלט *במקום* אשראי, מעל סף ₪3,540 (`routing.js#CARD_MASAV_THRESHOLD`), דרך `collection_attempts(collection_method='masav')` שנשאר `pending` לצמיתות (החלטה עסקית מודעת מ-1.9.2026, ר' FIN-15#2 ב-`FINANCIAL_BUSINESS_DECISIONS.md`). **שום דבר בקוד הזה לא מתאים ל"מס"ב כמשלים לאשראי על אותו Statement"** — זה בדיוק אותו ממצא שתועד כ"כיוון ארכיטקטוני אושר, מימוש דורש פיתוח" ב-FIN-13/14.

**הוחלט: לא redesign — מנגנון מקביל חדש, לגמרי מבודד.** בדיוק כמו ש-Stage 2A בנה `getFin11CappedCardProposal` לצד (לא בתוך) `openAttempt` הישן, Stage 3 בונה `masav-proposal.service.js` לצד (לא בתוך) `masav-collection.service.js` הישן. `routing.js`/`ACTIVE_ATTEMPT_STATUSES`/המודל הבינארי — **לא שונו בכלל**.

**עדכון (המשך session, 2026-10): שלושה תיקוני אינטגרציה נקודתיים בוצעו** (ר' סעיף 11) — `masav-collection.service.js` ו-`collection.service.js` **כן שונו**, אבל כהוספות-בדיקה מינימליות (guard checks), לא redesign: שתי הפונקציות ממשיכות להתנהג זהה בכל מקרה שלא נכנס למצב החפיפה החדש שזוהה. אין שינוי להתנהגות קיימת בשום תרחיש שלא היה רלוונטי קודם, אין שינוי לinvariant חשבונאי מאושר.

**אין קונפליקט חוסם** — ולכן לא נדרשה עצירה-ודיווח לפני מימוש (כנדרש אם היה redesign מהותי).

## 2. כללי חישוב MASAV

`prepareMasavProposal(statementId)` משתמש **רק** ב-`getStatementBalance(statementId).outstanding` — הכולל כל `payments` קיים (מכל שיטה), כל `statement_adjustments` לגיטימי (כולל Stage 1 late-fold), **לעולם לא** הנחה קבועה של "total_due מינוס ₪3,000". נבדק ישירות (בדיקות 2/3/6/7): אשראי חלקי → השארית בלבד; אשראי נכשל סופית → הסכום המלא (כי `payments` לא מכיל שום דבר מאותו attempt — אין צורך בלוגיקה מיוחדת, `getStatementBalance` כבר נכון מעצם ההגדרה); adjustment לגיטימי (חיוב/זכות) → משפיע נכון בשני הכיוונים.

## 3. מניעת גבייה כפולה

**"לא פתור" = כל `collection_attempts` בסטטוס `pending`/`ambiguous`, בכל שיטה** — לא רק אשראי. נבדק ישירות שהבדיקה (`ACTIVE_ATTEMPT_STATUSES`, מיובא, לא משוכפל) חוסמת גם attempt אשראי pending/ambiguous וגם (אילו נוצר) attempt מס"ב ישן pending לצמיתות. **timeout לעולם לא נחשב כשל מאומת** — נבדק (#4/#5): pending/ambiguous מוחרגים, לא מוכללים.

כשל אשראי **מאומת** (status `declined`/`technical_failure`, טרמינלי, לא `pending`/`ambiguous`) **אינו** חוסם הכללה ב-MASAV — ונבדק (#3) שהסכום המלא כלול, **בלי מנגנון מיוחד** (`getStatementBalance` כבר מחשב את זה נכון, כי attempt שנכשל אף פעם לא מייצר payment).

## 4. מניעת גבייה כפולה — טריות (Staleness)

**זה לא רק "בדוק פעם אחת ב-prepare"** — אישור וייצוא **מוודאים מחדש**, לא סומכים על המספר השמור:
- `approveMasavProposal` בודק מחדש: hold, attempt לא-פתור, מנדט, **ו-`getStatementBalance` טרי** — אם משהו השתנה מאז ה-prepare (לדוג': תשלום אשראי חדש התקבל), ה-proposal **לא מאושר**, מסומן `superseded`, והקריאה מחזירה `needsRePrepare:true`. **נבדק ישירות** (#13): proposal שהוכן ל-2000, תשלום של 500 מתקבל, ניסיון אישור נחסם (`outstanding_changed`), ה-proposal המקורי מסומן superseded, הכנה חדשה נותנת 1500 — המספר הנכון.
- `exportMasavProposals` **כעת גם היא** מוודאת יתרה טרייה (תיקון #2, סעיף 11) — לא רק בודקת `status='approved'`.

## 5. מניעת ייצוא/אישור כפולים

**מבני, לא רק קונבנציית UI**: `idx_masav_proposals_active_per_statement` (unique partial index על `status IN ('proposed','approved')`) מבטיח proposal פעיל אחד בלבד ל-Statement. `approveMasavProposal`/`exportMasavProposals` בודקים `status` תחת נעילה (`FOR UPDATE`) לפני כל שינוי — ניסיון אישור/ייצוא שני על proposal שכבר עבר את השלב נכשל במפורש (`PROPOSAL_NOT_PROPOSED`/`PROPOSAL_NOT_APPROVED`). **נבדק** (#10/#10a, #11/#11a).

## 6. סמנטיקת פישור Tranzila — נבדקה, לא הומצאה יכולת

נבדק ישירות: `masav.adapter.js` נשאר `NOT_IMPLEMENTED` (ללא שינוי), `masav-collection.service.js`'s ה-V1 boundary (ר' header comment שלו) אומר במפורש: אחריות Hamonym מסתיימת בייצוא הקובץ — **אין, ולא היה, שום API לקבלת תוצאה מ-Tranzila בקוד הזה.**

**המודל התפיסתי המתועד (לא ממומש כסטטוסים נוספים ב-DB — אין דרך לדעת אף אחד מהם בפועל)**: Prepared → Approved → Exported (**השלושה היחידים שהמערכת יכולה לדעת היום**) → Transmitted/Accepted → Confirmed Collected → Rejected/Returned → Requires Investigation (**השלושה האחרונים — לגמרי מחוץ ליכולת המערכת כיום, תהליך ידני מלא מחוץ למערכת**). `masav_collection_proposals.status` **עוצר ב-`exported`** בכוונה — **לא** נוסף סטטוס `confirmed_collected`/`rejected` כי שום דבר בקוד לא יכול לקבוע אותם. **נבדק ישירות** (#12/#12a/#12b): אחרי export, סטטוס ה-Statement לא משתנה, outstanding לא משתנה, אפס payments נוצרים — ייצוא הוא שידור, לא גבייה.

## 7. זרימת Super Admin (backend בלבד, אין frontend בשלב זה)

```
prepareMasavProposal(statementId)         -- חישוב/רענון, לא כתיבת payment
  → listMasavProposals({status:'proposed'})  -- תצוגה מקדימה לאדמין
  → approveMasavProposal({proposalId, superAdminUserId, reason})  -- אישור מפורש, re-verify
  → exportMasavProposals({proposalIds, superAdminUserId})  -- בניית קובץ Excel, platform_audit_log
  → [אדמין מוריד ומעלה ל-Tranzila בעצמו -- מחוץ למערכת, כבר תמיד היה כך]
```
אין route/controller חדש בשלב הזה (לפי ההנחיה המפורשת — אין frontend/UI ב-Stage 3). פונקציות ה-service מוכנות לחיבור עתידי.

## 8. שינויי מודל נתונים

**Migration 074** (`074_fin11_masav_collection_proposals.sql`) — **לא הוחלה על אף DB. מוכנה ונבדקה בלבד** (בתוך BEGIN...ROLLBACK). טבלה חדשה אחת: `masav_collection_proposals` — עובדות קפואות (`statement_id`/`entity_id`/`proposed_amount`/`outstanding_at_proposal`/`created_at`, אכוף ע"י טריגר) + lifecycle ניתן-לשינוי (`status`/`approved_*`/`exported_*`). **`collection_attempts`/`payments`/`statements` — אין שינוי סכימה.**

### ⚠️ תלות פריסה — הורחבה (עדכון, המשך session)
`masav-proposal.service.js` תלוי ב-runtime בקיום `masav_collection_proposals` (migration 074) **וגם** ב-`payment_exceptions` (migration 073, Stage 2B — `hasOpenCollectionHold`). **כעת גם**: `masav-collection.service.js#openMasavAttempt` (הישן!) ו-`collection.service.js#openAttempt`/`getFin11CappedCardProposal` תלויים ב-`masav_collection_proposals` — תיקוני האינטגרציה (סעיף 11) הרחיבו את טביעת-הרגל של migration 074 לקוד שהיה *לפני* FIN-11. `scripts/verify-fin11-stage3-ready.js` **מכסה את שתי התלויות** (073+074) — אומת ריצתית. סדר פריסה מחייב: migration 073 → migration 074 → `verify-fin11-stage3-ready.js` → קוד (כולל `masav-collection.service.js` הישן!).

## 9. כיסוי בדיקות — 36/36 PASS

אשראי שולם במלואו/חלקית/נכשל-סופית/pending/ambiguous; תרומות מאוחרות; תיקוני Statement (חיוב וזכות); hold מ-Stage 2B; מנדט חסר/לא-מורשה; ייצוא כפול; אישור כפול; **טריות** (יתרה משתנה בין prepare ל-approve → נחסם ולא מאושר בשקט); בידוד ישות; idempotency; concurrency אמיתי (שתי connections, נעילת Statement); Tranzila-קיבל≠נגבה; **+9 בדיקות חדשות** (סעיף 11): חפיפה ישן/חדש (כולל exported), טריות-בזמן-ייצוא, חסימת-אשראי-מול-מס"ב-מיוצא.

## 10. סיכונים שנותרו (עודכן, המשך session)

1. ~~חפיפה בין המנגנון הישן והחדש~~ — **נפתר** (סעיף 11, תיקון #1).
2. ~~אימות יתרה טרי בזמן ייצוא~~ — **נפתר** (סעיף 11, תיקון #2) — וכך גם באג סדר-הנעילה שהתגלה באותו סבב.
3. ~~מניעת גבייה באשראי מול מס"ב מיוצא~~ — **נפתר** (סעיף 11, תיקון #3).
4. **תלות-פריסה כפולה, הורחבה** (073+074) — כעת כוללת גם את `masav-collection.service.js` הישן (לא רק קוד FIN-11 עצמו). עדיין לא נדחף/הוחל.
5. **אין route/UI** — שום דבר מהמנגנון הזה (ישן או חדש) לא נגיש לאדמין בפועל עדיין.
6. **`listBlockedStatements`/`listActionableMasavStatements`/`generateExportExcel`** — לא מודעים ל-proposals חדשים (UX בלבד, לא כספי — ר' סעיף 11 "מה לא תוקן בכוונה").
7. **אין job/schedule** ל-6 בחודש — ההכנה חייבת הפעלה ידנית/יזומה.
8. **סמנטיקת Tranzila** נשארת תהליך ידני מלא, מתועד לא ממומש.

## 11. תיקוני אינטגרציה (המשך session, 2026-10) — שלושת הפערים שזוהו בעצירה הקודמת

### תיקון #1 — חפיפה בין המנגנון הישן והחדש
`masav-collection.service.js#openMasavAttempt` קורא כעת ל-`hasActiveMasavProposal(statementId, client)` (חדש, `masav-proposal.service.js`) מיד אחרי בדיקת ה-active-attempt הקיימת. אם קיים proposal במצב `proposed`/`approved`/**`exported`** — ה-openMasavAttempt הישן נחסם (`fin11_masav_proposal_active`) ונרשם finding. **אין circular require**: `masav-collection.service.js` (קובץ אחר מ-`collection.service.js`!) מייבא את `masav-proposal.service.js` לראשונה, אין מחזור. נבדק #16/#16a/#16b.

### תיקון #2 — אימות יתרה טרי בזמן ייצוא + באג נעילה אמיתי שהתגלה ותוקן
`exportMasavProposals` מחשב כעת `getStatementBalance` מחדש, תחת נעילת Statement טרייה, **עבור כל proposal בנפרד** בתוך ה-batch, לפני בנייתו לקובץ. אי-התאמה ל-`proposed_amount` → `superseded` + `PROPOSAL_STALE_AT_EXPORT` (כל הקריאה, batch כולו, נכשלת — אין ייצוא חלקי-מעורב-טריות/לא-טרי). נבדק #17/#17a/#17b/#17c.

**תוך כתיבת התיקון התגלה באג אמיתי, לא קשור לגביית-יתר**: `approveMasavProposal`/`exportMasavProposals` (הגרסה המקורית) נעלו את שורת ה-proposal *לפני* ה-Statement — ההפך המדויק מ-`prepareMasavProposal`. תחת תחרות אמיתית זה סיכון deadlock של ממש (Postgres `40P01`), לא רק תיאורטי. **תוקן**: שתי הפונקציות כעת מצצות (`SELECT` בלי נעילה) את `statement_id`, נועלות Statement, ואז נועלות את ה-proposal — עקביות מלאה עם `prepareMasavProposal` וכל שאר הקוד בבסיס הזה. ההערה המקורית בראש הקובץ שטענה "אין סיכון deadlock" הייתה שגויה — תוקנה גם היא.

### תיקון #3 — מניעת גבייה באשראי מול מס"ב-מיוצא-לא-פתור
`collection.service.js#openAttempt` ו-`#getFin11CappedCardProposal` קוראים כעת ל-`hasExportedMasavProposal(statementId, client)` — אם קיים proposal `exported` על **אותו** Statement, שניהם נחסמים (`masav_proposal_exported_unresolved`). **require עצל (בתוך גוף הפונקציה, לא בראש הקובץ)**: הכרחי, כי `masav-proposal.service.js` כבר מייבא את `collection.service.js` בראש הקובץ שלו (ל-`ACTIONABLE_STATEMENT_STATUSES`/`ACTIVE_ATTEMPT_STATUSES`) — require עליון בכיוון ההפוך היה circular. נבדק #18/#18a (כולל בידוד per-Statement, לא entity-wide).

### מה לא תוקן בכוונה
`listBlockedStatements`/`listActionableMasavStatements`/`generateExportExcel` (קריאה-בלבד, המנגנון הישן) — לא עודכנו. אין סיכון כספי (לא כותבות), רק אפשרות ל-UX מטעה (רשימה שמציגה Statement שבו יש proposal פעיל). מתועד כפער קטן שנותר, לא קריטי.
