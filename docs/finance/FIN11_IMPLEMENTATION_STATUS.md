# FIN-11 — Implementation Status

מסמך זה הוא מקור-האמת למצב המימוש של FIN-11 על פני שיחות/sessions. מתעדכן בכל שלב. **אין להציג כאן עבודה עתידית כגמורה.**

## טבלת סטטוס

| Stage | סטטוס | Commit | Worktree | קבצים ששונו | בדיקות |
|---|---|---|---|---|---|
| Stage 0 — מסמך החלטות עסקיות | **הושלם, נדחף** | `7310593` | — | `docs/finance/FINANCIAL_BUSINESS_DECISIONS.md` | — |
| Stage 1 — `foldLateDonationsIntoStatement` | **הושלם, נדחף** | `d8d440e` | — (נדחף ל-`origin/main`) | `statement-balance.service.js` | 29/29 PASS |
| Stage 2A — `getFin11CappedCardProposal` | **הושלם, committed, לא נדחף** | `a4c364b` | `C:/DEV/HamonymStudio-fin11-stage2a` | `collection.service.js` | 18/18 PASS |
| בידוד נתוני בדיקה (תקרית) | **הושלם** | (UPDATE ישיר, לא commit קוד) | — | `billing_accounts`/`statements` — 2 שורות הושעו/בוטלו | מאומת read-only |
| Stage 2B — `resolveAttempt` hardening + payment exceptions | **הושלם, committed, לא נדחף** (עברו שני סבבי ביקורת) | `efbdd2f` | `C:/DEV/HamonymStudio-fin11-stage2b` | 11 קבצים — `collection.service.js`, `payment-exceptions.service.js` (חדש), `migrations/073_*.sql` (חדש, לא הוחל), `scripts/{migrate-073,verify-fin11-stage2b-ready,test-fin11-stage2b-resolve}.js` (חדשים), 4 קובצי `docs/finance/FIN11_*.md` (חדשים) + `FINANCIAL_BUSINESS_DECISIONS.md` (עודכן) | 24/24 PASS |
| Stage 3 — MASAV משלים + 3 תיקוני אינטגרציה | **הושלם, committed, לא נדחף** | `dea7aca` | `C:/DEV/HamonymStudio-fin11-stage3` | 12 קבצים — `masav-proposal.service.js` (חדש), `masav-collection.service.js`+`collection.service.js` (עודכנו — תיקוני אינטגרציה), `migrations/074_*.sql` (חדש, לא הוחל), `scripts/{migrate-074,verify-fin11-stage3-ready,test-fin11-stage3-masav-proposal}.js` (חדשים), 4 קובצי `docs/finance/FIN11_*.md` (עודכנו/נוספו) | 36/36 PASS |
| Israel Invoices — `Document.TaxId` (ענף עצמאי, לא FIN-11) | **הושלם, committed, לא נדחף** | `1044621` | `C:/DEV/HamonymStudio-israel-invoices-audit` | 3 קבצים — `donations.service.js` (עודכן, 15 שורות), `test-israel-invoices-tax-id.js` (חדש), `docs/finance/ISRAEL_INVOICES_TAX_ID_AUDIT.md` (חדש) | 9/9 PASS |
| הכנת אינטגרציה (בדיקת שילוב בלבד, לא merge ל-main) | **אומת, לא מאושר ל-merge** | `ac2443b` (ענף `fin11-integration-prep`, לא נדחף, לא ממוזג) | `C:/DEV/HamonymStudio-fin11-integration` | ללא שינויי קוד — cherry-pick נקי של `1044621` על גבי `5f56b98` | 80/80 PASS (24+36+9+11, ללא רגרסיה) |
| Stage 4 — ניתוב משולב + תזמון | **לא התחיל** | — | — | — | — |
| Finance UI | **לא התחיל** | — | — | — | — |

## פירוט Stage 2B

**קבצים ששונו/נוספו** (diff מלא מול `a4c364b`):
- `hamonym-backend/src/modules/collection-engine/collection.service.js` — `resolveAttempt` חוזק (נעילת Statement, חישוב-יתרה-מחדש, זיהוי גביית-יתר); `openAttempt`/`getFin11CappedCardProposal` קיבלו בדיקת hold. הערות הקוד עודכנו בסבב ביקורת שני לדייק את טענת אימות-הסכום (ר' Technical Design סעיף 2).
- `hamonym-backend/src/modules/billing-engine/payment-exceptions.service.js` — **חדש**: `hasOpenCollectionHold`, `overrideCollectionHold`, `resolvePaymentException`.
- `hamonym-backend/migrations/073_fin11_payment_exceptions.sql` — **חדש, לא הוחל על שום DB**.
- `hamonym-backend/scripts/migrate-073.js` — **חדש**, runner סטנדרטי, לא הורץ.
- `hamonym-backend/scripts/verify-fin11-stage2b-ready.js` — **חדש**, שער fail-fast לפריסה (read-only), אומת ריצתית שהוא תופס נכון מצב-DB לא-מוכן.
- `hamonym-backend/scripts/test-fin11-stage2b-resolve.js` — **חדש, זה מיקום קבוע בריפו ל-24 הבדיקות** (ר' פירוט תוצאות למטה). הרץ: `node scripts/test-fin11-stage2b-resolve.js` מתוך `hamonym-backend/`.
- `docs/finance/FINANCIAL_BUSINESS_DECISIONS.md` — עודכן (חלק ו' נוסף, סעיפים פתוחים סומנו כנסגרו).
- `docs/finance/FIN11_STAGE2B_TECHNICAL_DESIGN.md`, `FIN11_DECISION_LOG.md`, `FIN11_REMAINING_WORK_HANDOFF.md`, (ועדכון ל-)`FIN11_IMPLEMENTATION_STATUS.md` — **חדשים**.

**תוצאות בדיקות**: 24/24 PASS, מורץ מהמיקום הקבוע בריפו (`scripts/test-fin11-stage2b-resolve.js`) — אומת מחדש לאחר ההעברה מה-scratchpad, לפני commit. ר' `FIN11_STAGE2B_TECHNICAL_DESIGN.md` סעיפים 1-6 למיפוי מדויק בין בדיקה לדרישה. אפס רשומות קבועות נוצרו ב-DB המשותף (0 ישויות ZZZ_TEST נותרו).

**שער פריסה חדש, אומת ריצתית**: `scripts/verify-fin11-stage2b-ready.js` מול ה-DB האמיתי (ללא migration 073) מחזיר קוד-יציאה 1 ומפרט במדויק אילו טבלאות/טריגרים חסרים — ר' Technical Design סעיף 7.

**Commit `efbdd2f` — לא נדחף.** בוצע לאחר שני סבבי ביקורת (הראשון: נעילה+חישוב-יתרה-מחדש; השני: דיוק טענת אימות-הסכום + שער fail-fast לפריסה — ר' `FIN11_DECISION_LOG.md` #13-14).

## פירוט Stage 3

**קבצים ששונו/נוספו** (diff מלא מול `00de328`):
- `hamonym-backend/src/modules/billing-engine/masav-proposal.service.js` — **חדש**: `prepareMasavProposal`, `prepareMasavProposalsForStatements`, `listMasavProposals`, `approveMasavProposal`, `exportMasavProposals`, `checkMasavMandate`, `findUnresolvedAttempt`, `hasActiveMasavProposal`, `hasExportedMasavProposal`.
- `hamonym-backend/src/modules/collection-engine/masav-collection.service.js` — **עודכן** (תיקון אינטגרציה #1): `openMasavAttempt` בודק `hasActiveMasavProposal` לפני פתיחת attempt.
- `hamonym-backend/src/modules/collection-engine/collection.service.js` — **עודכן** (תיקון אינטגרציה #3): `openAttempt`/`getFin11CappedCardProposal` בודקים `hasExportedMasavProposal` (require עצל, לא circular).
- `hamonym-backend/migrations/074_fin11_masav_collection_proposals.sql` — **חדש, לא הוחל על שום DB**.
- `hamonym-backend/scripts/migrate-074.js`, `verify-fin11-stage3-ready.js` (שער fail-fast, אומת ריצתית), `test-fin11-stage3-masav-proposal.js` (36 בדיקות, מיקום קבוע בריפו) — **חדשים**.
- `docs/finance/FIN11_STAGE3_TECHNICAL_DESIGN.md` — **חדש**. `FIN11_DECISION_LOG.md`, `FIN11_IMPLEMENTATION_STATUS.md`, `FIN11_REMAINING_WORK_HANDOFF.md`, `FINANCIAL_BUSINESS_DECISIONS.md` — **עודכנו**.

**תוצאות בדיקות**: 36/36 PASS (27 מקוריות + 9 תיקוני-אינטגרציה), מורץ מהמיקום הקבוע בריפו. **רגרסיה אומתה**: `test-fin11-stage2b-resolve.js` רץ מחדש על ה-worktree הזה (עם `collection.service.js` המעודכן) — 24/24 PASS, ללא פגיעה. אפס רשומות קבועות נוצרו ב-DB המשותף (0 ישויות ZZZ_TEST נותרו).

**שער פריסה**: `scripts/verify-fin11-stage3-ready.js` בודק migration 074 וגם תלות Stage 2B (073) — אומת ריצתית. **הערה חשובה**: תיקוני האינטגרציה הרחיבו את תלות migration 074 גם ל-`masav-collection.service.js` הישן — שער הפריסה מכסה את זה (אותה טבלה), אבל משמעותו התרחבה.

**במהלך תיקון #2 התגלה ותוקן באג אמיתי** (לא רק פער): סדר נעילות שגוי ב-`approveMasavProposal`/`exportMasavProposals` (proposal לפני Statement, ההפך מכל שאר הקוד) — סיכון deadlock ממשי, לא תיאורטי. תוקן לעקביות מלאה.

**Commit `dea7aca` — לא נדחף.** אושר ובוצע לאחר אימות diff מלא (12 קבצים, ללא שינויים לא-קשורים) והרצת בדיקות אחרונה (36/36) מיד לפני ה-commit.

## הכנת אינטגרציה — Git (2026-10-16)

נבדקה האינטגרציה בין שרשרת FIN-11 (Stage1→2A→2B→3) לבין ענף TaxId העצמאי, **ללא merge ל-main וללא push**:

- **שרשרת ה-commits של FIN-11 כבר לינארית מראש**: `d8d440e → a4c364b → efbdd2f → 00de328 → dea7aca → 5f56b98`. כל worktree נבנה מה-worktree הקודם, לא מ-`origin/main` בכל פעם — כך ש-`5f56b98` (ראש Stage 3) **כבר מכיל** את Stage1+2A+2B+3 במלואם. אין צורך ב-merge בין השלבים האלה, רק אישור push.
- **TaxId (`1044621`) ענף נפרד**, עלה ישירות מ-`d8d440e` (`origin/main` הנוכחי), ללא תלות בשלבי FIN-11 2A/2B/3.
- **בדיקת חפיפת קבצים** בין `d8d440e..5f56b98` לבין `d8d440e..1044621`: **אפס קבצים משותפים** — FIN-11 נוגע ב-`collection-engine`/`billing-engine`/migrations 073-074; TaxId נוגע רק ב-`donations.service.js` + קבצים חדשים משלו.
- נפתח worktree בידוד חדש `C:/DEV/HamonymStudio-fin11-integration` (ענף `fin11-integration-prep`), מ-`5f56b98`, ובוצע **cherry-pick** נקי (לא merge) של `1044621` → commit `ac2443b`. **אפס קונפליקטים.**
- **כל 4 חבילות הבדיקות הורצו מחדש על הענף המשולב** (80/80 PASS): `test-fin11-stage2b-resolve.js` (24/24), `test-fin11-stage3-masav-proposal.js` (36/36), `test-israel-invoices-tax-id.js` (9/9), `test-donation-cardcom-separation.js` (11/11). אפס רשומות ZZZ_TEST נותרו.
- `scripts/verify-fin11-stage2b-ready.js`/`verify-fin11-stage3-ready.js` הורצו מול ה-DB האמיתי (עדיין לא הוחלו migrations 073/074 עליו) — **נכשלו כצפוי** (exit 1, מפרט בדיוק אילו טבלאות/טריגרים חסרים) — מאשר ששער ה-fail-fast ממשיך לעבוד נכון גם על הענף המשולב.
- **ענף `fin11-integration-prep` (commit `ac2443b`) נשאר worktree מקומי בלבד — לא push, לא merge ל-main, מחכה לאישור.**

## ✅ ממצא חוסם Push (2026-10-16) — תוקן, לא עוד חוסם

**עדכון**: תוקן באותו יום. ר' "תיקון תאימות פריסה" מתחת לממצא המקורי לפרטי התיקון, הבדיקות, ורצף הפריסה המוצע. **הקוד עדיין לא נדחף** — התיקון ממתין לאישור commit נפרד, בנוסף לאישור ה-push עצמו.

## ⛔ הממצא המקורי (לרקע, נשאר כתיעוד)

**המסלולים הקיימים, החיים, של הגבייה בפרודקשן (לא רק הפונקציות החדשות של FIN-11) תלויים כעת ללא תנאי בטבלאות שמיגרציות 073/074 יוצרות:**

1. `collection.service.js#openAttempt` (שורה 26) — הפונקציה הקיימת, המשמשת בפועל את מסלול הגבייה באשראי (ר' הערות ב-`billing-ops.service.js`: "the authoritative decision is still made inside collection.service.js"). שורה 52 קוראת ללא-תנאי ל-`paymentExceptions.hasOpenCollectionHold(entity_id, client)` — שאילתת `SELECT` ישירה על `payment_exceptions` (migration 073), **בלי try/catch, בלי fallback**. שורה 86 קוראת ללא-תנאי ל-`hasExportedMasavProposal` — שאילתה ישירה על `masav_collection_proposals` (migration 074), גם היא בלי fallback.
2. `masav-collection.service.js#openMasavAttempt` (שורה ~92) — המסלול הישן/קיים של מס"ב, קורא ללא-תנאי ל-`hasActiveMasavProposal`, שאילתה נוספת על `masav_collection_proposals`.
3. `payment-exceptions.service.js#hasOpenCollectionHold` עצמה היא `client.query(...)` גולמי, ללא bloc try/catch — אם הטבלה לא קיימת, היא פשוט תזרוק `42P01: relation "payment_exceptions" does not exist`.

**המשמעות המאומתת**: אם הקוד המשולב (`ac2443b`) ירוץ בפרודקשן לפני שמיגרציות 073 ו-074 הוחלו על ה-DB — **כל קריאה אמיתית ל-`openAttempt` וכל קריאה אמיתית ל-`openMasavAttempt` תיכשל עם שגיאת DB**, כלומר **מסלול הגבייה הקיים (לא רק FIN-11) מושבת לחלוטין**, לא רק "מתנהג מעט שונה". זה תואם בדיוק את תנאי ה-STOP שהוגדר: קיים מסלול ייצור קיים שתלוי כעת בטבלאות של 073/074.

**המשמעות ל-Push**: `git push` עצמו (הכנסת קוד למאגר) אינו מריץ קוד. **אומת בפועל (2026-10-16): Render מוגדר ל-`Auto-Deploy: On Commit` על ענף `main`** — כלומר push ל-`origin/main` הוא דה-פקטו deploy מיידי לפרודקשן. לכן הממצא הזה היה חוסם ממשי, לא תיאורטי.

## תיקון תאימות פריסה (2026-10-16)

**מנגנון**: קובץ חדש `hamonym-backend/src/modules/billing-engine/fin11-schema-probe.js` — שתי פונקציות (`isPaymentExceptionsSchemaPresent`, `isMasavProposalsSchemaPresent`) שבודקות נוכחות טבלה דרך `to_regclass('public.<table>')` (בדיקת קטלוג זולה, בלי table scan, בלי lock, בלי cache — אין מה שיכול "להתיישן"). זו בדיקה מפורשת וממוקדת לשתי הטבלאות הספציפיות האלה בלבד — **לא** try/catch גנרי שמכסה/מבליע כל שגיאת DB.

**שילוב** — שלושת מקומות הקריאה שזוהו בממצא נעטפו ב-`if (await isXSchemaPresent(client))`:
1. `collection.service.js#openAttempt` — `hasOpenCollectionHold` (שורה ~52) ו-`hasExportedMasavProposal` (שורה ~86) כל אחת מעוטפת בבדיקת הנוכחות המתאימה.
2. `masav-collection.service.js#openMasavAttempt` — `hasActiveMasavProposal` מעוטפת ב-`isMasavProposalsSchemaPresent`.

**התנהגות**:
- **כשהטבלה לא קיימת** (לפני המיגרציה): הבדיקה מדולגת, הפונקציה הישנה ממשיכה בדיוק כמו לפני ש-FIN-11 נגע בה. זה נכון ובטוח — לא "דילוג על בדיקה אמיתית", כי לפני שהטבלה קיימת, שום payment_exceptions/masav_collection_proposals לא יכול להתקיים פיזית.
- **כשהטבלה קיימת** (אחרי המיגרציה): הבדיקה **לעולם לא מדולגת** — ההגנות (hold עסקת-יתר, חפיפת מסלולים, הגנת concurrency) ממשיכות לפעול במלואן, בלי שינוי.
- `resolveAttempt` ו-`getFin11CappedCardProposal` (ופונקציות ה-Stage3 העצמאיות) **לא שונו** — הן כבר "נכשלות סגור" כנדרש (requirement 3): `resolveAttempt` כותבת ל-`payment_exceptions` רק בעסקת-יתר אמיתית (ואם הטבלה חסרה שם, זריקת שגיאה היא ההתנהגות הנכונה — עדיף קריסה גלויה מהסתרת עסקת-יתר אמיתית), ו-`getFin11CappedCardProposal` אינה מחוברת לשום caller בפרודקשן כיום כך שאין סיכון פריסה ממנה.

**בדיקת ארבעת מצבי המיגרציה (2026-10-16, סבב ביקורת שני)**: כל אחד משני ה-guards נשען על בדיקת-נוכחות **עצמאית** לטבלה שלו (לא דגל משולב אחד) — מה שאומר שמצב migration **חלקי** (073 בלי 074, או 074 בלי 073) הוא מצב אמיתי ונפרד שצריך אימות ישיר, לא הנחה שנגזרת מ"שתיים" ו"אפס". אומת ב-4 מצבים נפרדים, לא רק 2:

| מצב DB | openAttempt — hold עסקת-יתר (073) | openAttempt/openMasavAttempt — חפיפת MASAV (074) |
|---|---|---|
| ללא 073 וללא 074 | מדולג (נכון — אין טבלה) | מדולג (נכון — אין טבלה) |
| 073 בלבד | **פעיל ונכון** (Part C1) | מדולג, לא זורק (Part C2/C3) |
| 074 בלבד | מדולג, לא זורק (Part D3) | **פעיל ונכון** (Part D1/D2) |
| 073+074 | **פעיל ונכון** (Part B1) | **פעיל ונכון** (Part B2/B3) |

בשום מצב הגנה רלוונטית לא דולגה כשהטבלה שלה קיימת — כל guard "עיוור" רק לטבלה של ה-guard האחר, ולא לשלו.

**היקף/חוזק הבדיקה**:
- נבדק (ואומת, Part E) ש-`isPaymentExceptionsSchemaPresent`/`isMasavProposalsSchemaPresent` נקראות **רק** עם ה-`client` הטרנזקציוני של הקריאה המוגנת — אף פעם לא עם `pool` גולמי. הודגם ישירות: אותה DDL לא-committed נראית `true` מה-client שבתוך הטרנזקציה ו-`false` מחיבור אחר (`pool`) — מראה בדיוק למה להעביר `client` קריטי, ולמה אסור "לשכוח" את זה ברפקטור עתידי. נוסף גם grep סטטי (E3/E3a) שמאשר ששום call site אינו קורא לפונקציית הבדיקה בלי ארגומנט/עם `pool` גולמי.
- `to_regclass` בודק **קיום טבלה בלבד**, לא עמודות/טריגרים/אינדקסים — לכן טבלה "חלקית" (DDL שנעצר באמצע) עדיין תיחשב "קיימת". זה לא נבדק כתרחיש דינמי כי Postgres מריץ מחרוזת multi-statement יחידה (כמו ב-`migrate-073.js`/`migrate-074.js`, שאינה עוטפת BEGIN/COMMIT בעצמה) כיחידה אטומית אחת תחת ה-simple query protocol — אם היא נכשלת באמצע, שום חלק ממנה לא מתבצע, אז "טבלה חלקית" לא יכול לקרות ממסלול ה-migrate הזה. זו גבול ידוע של הבדיקה, לא פגם שתוקן — אם מישהו ייצור בעתיד טבלה דרך מסלול שונה (לא `CREATE TABLE IF NOT EXISTS` אטומי), ייתכן מצב "קיימת אך חסרה טריגר", ושגיאת DB אמיתית תעלה (לא בייפס שקט) בקריאה הבאה שתלויה בטריגר/אינדקס — מתועד כאן במפורש כגבול, לא כסיכון סמוי.
- שגיאות DB אמיתיות (לא "טבלה חסרה") ממשיכות להתפשט כרגיל: אין try/catch סביב הבדיקה או סביב הקריאות המוגנות ברמת ה-guard — אם `client.query` נכשל מכל סיבה אחרת (חיבור, הרשאות, טבלה אחרת חסרה), ה-`await` יזרוק ו-`openAttempt`/`openMasavAttempt` יתפסו את זה ב-catch הכללי שלהם (ROLLBACK + rethrow), בדיוק כמו כל שגיאה אחרת בפונקציה.

**בדיקות**: `scripts/test-fin11-schema-compat.js` — **24/24 PASS** (Part A=2+2, Part C=2+3, Part D=2+3, Part B=2+4, Part E=4).

**רגרסיה**: כל 4 חבילות הבדיקות הקיימות (24+36+9+11) הורצו מחדש על הקוד המתוקן — 80/80 PASS, אפס שינוי בתוצאה. סה"כ **104/104 PASS**.

**מצב**: תוקן ונבדק בארבעת המצבים, **לא committed** — ממתין לאישור commit נפרד (בנוסף לאישור ה-push).

## היסטוריית תקריות (לשקיפות)

- **תקרית נתוני-בדיקה (Stage 2A)**: הכנסה ישירה ל-`payments` (append-only, חוסם גם DELETE) יצרה 2 שורות קבועות. טופל: מחיקת כל מה שניתן, השעיית 2 `billing_accounts`, ביטול 2 `statements` — מאומת read-only שאין השתתפות ב-jobs/reports. ר' `project_fin11_hybrid_collection.md` (זיכרון) לפרטים מלאים.
