# FIN-11 — Remaining Work / Handoff

מסמך זה הוא נקודת ההמשך המחייבת ל-FIN-11. **אין להציג כאן שום דבר כגמור שלא אומת בפועל.** אם תתחיל שיחה/session חדש/ה ולא תהיה גישה להיסטוריה — התחל כאן ובקרא את `FIN11_IMPLEMENTATION_STATUS.md` + `FINANCIAL_BUSINESS_DECISIONS.md` לפני כל שינוי.

## מה ממומש בפועל (אומת בבדיקות, לא רק מתועד)

- `foldLateDonationsIntoStatement` — **Stage 1, נדחף, בפרודקשן** (`d8d440e`). עדיין לא מחובר לשום caller/route.
- `getFin11CappedCardProposal` — **Stage 2A, committed, לא נדחף** (`a4c364b`). קריאה טהורה בלבד — לא יוצרת attempt, לא גובה. לא מחוברת לשום caller.
- `resolveAttempt` מחוזק + `payment_exceptions`/`payment_exception_actions` — **Stage 2B, committed (`efbdd2f`+`00de328`), לא נדחף**. **migration 073 לא הוחלה על שום DB.**
- `masav-proposal.service.js` (prepare/list/approve/export proposals) — **Stage 3, committed (`dea7aca`+`5f56b98`), לא נדחף**. **migration 074 לא הוחלה על שום DB.** מנגנון מקביל ל-`masav-collection.service.js` הישן, **עם מודעות חד-כיוונית**: הישן בודק את החדש (לא להפך) — ר' "בדיקות אינטגרציה" למטה.
- `Document.TaxId` (Israel Invoices, ענף עצמאי) — **committed (`1044621`), לא נדחף**. אינו חלק מ-FIN-11 עצמו (קובץ `donations.service.js`, לא נוגע ב-collection/billing engine).
- **הכנת אינטגרציה אומתה (2026-10-16)**: שרשרת FIN-11 (`5f56b98`) + TaxId (`1044621`) שולבו (cherry-pick נקי, אפס קונפליקטים, אפס חפיפת קבצים) בענף worktree מבודד `fin11-integration-prep` (commit `ac2443b`, `C:/DEV/HamonymStudio-fin11-integration`). 80/80 בדיקות קיימות עברו על הענף המשולב. **הענף הזה לא נדחף ולא מוזג ל-main — מחכה לאישור.**
- **תיקון תאימות פריסה (2026-10-16, לא committed עדיין)**: אומת ש-Render מוגדר `Auto-Deploy: On Commit` על `main` — push=deploy בפועל. נמצא ותוקן: `openAttempt`/`openMasavAttempt` (הקיימים) קראו ללא-תנאי לטבלאות 073/074 והיו קורסים לפני המיגרציה. נוסף `fin11-schema-probe.js` (בדיקת `to_regclass` מפורשת, בלי cache, בלי try/catch גנרי) שמדלגת על הבדיקה הרלוונטית רק כשהטבלה שלה חסרה, ולעולם לא מדלגת כשהיא קיימת — שני ה-guards עצמאיים זה מזה, כל אחד בודק רק את הטבלה שלו. `scripts/test-fin11-schema-compat.js` (24/24, **כל ארבעת מצבי המיגרציה**: ללא שתיהן / 073 בלבד / 074 בלבד / שתיהן — אומת ישירות שבמצב חלקי שום הגנה רלוונטית לא מדלגת, וגם שהבדיקה תלוית-client/טרנזקציה, לא pool גלובלי) + אפס רגרסיה ב-80 הבדיקות הקיימות (104/104 סה"כ). ר' `FIN11_IMPLEMENTATION_STATUS.md` לפירוט המלא. **ממתין לאישור commit.**

## מה מתועד/מוכרע עסקית בלבד — **לא ממומש**

- אישור+גבייה אוטומטיים באשראי עד ₪3,000 (אין job/cron, אין caller ל-`getFin11CappedCardProposal`).
- Job/schedule ל-6 בחודש (מס"ב) — `masav-proposal.service.js` מוכן, אבל לא מתוזמן/מופעל אוטומטית.
- מסלול קליטת תוצאות מס"ב (recordMasavResult-מחליף) — **דורש החלטה עסקית חדשה**, לא רק קוד (ר' FIN-15#2 ב-`FINANCIAL_BUSINESS_DECISIONS.md`). Stage 3 **לא** פותר את זה — `masav_collection_proposals.status` עוצר ב-`exported` בכוונה.
- תנאי גבייה פרטניים ברמת עמותה.
- 3-ניסיונות-אשראי-לכל-היותר + escalation אנושי.
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

1. **migrations 073+074 חייבות להיות מוחלות (בסדר הזה) לפני שהגנות FIN-11 Stage 2B/3 פעילות בפועל**: עד 2026-10-16 זה היה חוסם-קריסה (push=deploy ב-Render, `openAttempt`/`openMasavAttempt` הקיימים קראו ללא-תנאי לטבלאות 073/074 ונכשלים אם הן חסרות). **זה תוקן** (`fin11-schema-probe.js`, לא committed עדיין — ר' `FIN11_IMPLEMENTATION_STATUS.md`) — מעתה, אם 073/074 עדיין לא הוחלו כשקוד זה יפרס, מסלולי הגבייה הקיימים ימשיכו לעבוד כמו לפני FIN-11, **אבל** הגנות ה-FIN-11 עצמן (hold על עסקת-יתר, חסימת חפיפת מסלולים) **לא יהיו פעילות** עד שהמיגרציות יוחלו בפועל. סדר מחייב להפעלה מלאה: (א) `scripts/migrate-073.js`, (ב) `scripts/migrate-074.js`, (ג) `scripts/verify-fin11-stage3-ready.js` (בודק את שתיהן, שער fail-fast — read-only, יוצא קוד 1 אם משהו חסר, אומת ריצתית), (ד) קוד ה-application (יכול, אחרי התיקון, להקדים או להתעכב בבטחה — אבל ההגנות מופעלות רק אחרי (א)+(ב)). ר' `FIN11_STAGE2B_TECHNICAL_DESIGN.md` סעיף 7, `FIN11_STAGE3_TECHNICAL_DESIGN.md` סעיף 8, וסעיף "⛔ הממצא המקורי"/"תיקון תאימות פריסה" ב-`FIN11_IMPLEMENTATION_STATUS.md`.
2. `billing-ops.service.js#reconcileCollectionAttempt` — להוסיף בדיקת סטטוס לפני reconcile (לא עשוי ב-Stage 2B, ר' סיכונים שנותרו).
3. `collection-attempt-reconciliation.job.js`'s "overpaid" check — לתקן השוואה ל-`adjustedTotal` במקום `total_due` גולמי, לפני שיותר מ-payment אחד הופך לנורמה.
4. `routing.js` — להחליט ולממש איך אשראי+מס"ב פועלים על אותו Statement בלי "להכריע מחדש" שוב ושוב.
5. החלטה עסקית מפורשת על מסלול קליטת תוצאות מס"ב (לא קיים היום, V1 boundary מכוון מ-1.9.2026). Stage 3 מתעד את המודל התפיסתי (Prepared/Approved/Exported בלבד) אבל לא פותר את זה.
6. **שני מנגנוני מס"ב (ישן+חדש) קיימים זה לצד זה** — צריך הכרעה עתידית: למזג, להחליף, או לתעד במפורש איזה מהם בשימוש לכל תרחיש.

## רשימת עבודה מוצעת ל-Stage 4/UI (לא מאושרת לביצוע — דורשת אישור נפרד לכל שלב)

**Stage 4 (ניתוב משולב + תזמון, מוצע)**:
- [ ] שינוי `routing.js` לדגם שמאפשר שני אמצעים על Statement אחד.
- [ ] Job/schedule ל-28/20:00 (אשראי) ו-6-בחודש (מס"ב).
- [ ] חיבור בפועל של `getFin11CappedCardProposal`/`resolveAttempt` לקריאה אמיתית ל-adapter (`charge()`), כולל 3-ניסיונות-לכל-היותר.

**Finance UI (מוצע)**:
- [ ] מסך חריגי גביית-יתר (`payment_exceptions`) לסופר-אדמין — רשימה, פרטים, override, resolve.
- [ ] תצוגת סטטוס hold ברמת עמותה.
- [ ] תצוגת Stage 2A proposal (לפני שהיא מחוברת לגבייה אמיתית) למטרות בדיקה/שקיפות.
- [ ] מסך הצעות MASAV (`masav_collection_proposals`) — תצוגה מקדימה, אישור, ייצוא, רשימת חריגים (מנדט חסר/attempt לא-פתור).

## מה חייב להיבדק לפני כל הפעלה בכסף אמיתי (סיכום)

- [ ] migrations 073+074 הוחלו בסביבת היעד ואומתו (כל הטריגרים/האינדקסים קיימים, לא רק הטבלאות) — `verify-fin11-stage3-ready.js`.
- [ ] `routing.js` מתוקן לדגם ההיברידי.
- [ ] `reconcileCollectionAttempt` ו-reconciliation job's overpaid-check תוקנו.
- [ ] החלטה עסקית על מס"ב-result-ingestion קיימת וממומשת.
- [ ] UI לחריגי גביית-יתר **וגם** ל-MASAV proposals קיים — אין טעם ב-hold/proposal-מבלי-יכולת-לסקור.
- [ ] הכרעה על שני מנגנוני המס"ב הקיימים זה לצד זה.
- [ ] בדיקת end-to-end אמיתית (sandbox CardCom, לא production) של המחזור המלא: card proposal → attempt → charge → resolve → (אם רלוונטי) exception → resolve → masav proposal → approve → export.

**עד שכל הסעיפים לעיל לא סומנו ✅ ואומתו בפועל — אין להפעיל גבייה אמיתית תחת FIN-11.**
