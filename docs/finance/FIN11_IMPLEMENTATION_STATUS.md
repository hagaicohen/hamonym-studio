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
| Stage 3 — חישוב יתרת מס"ב | **לא התחיל** | — | — | — | — |
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

## היסטוריית תקריות (לשקיפות)

- **תקרית נתוני-בדיקה (Stage 2A)**: הכנסה ישירה ל-`payments` (append-only, חוסם גם DELETE) יצרה 2 שורות קבועות. טופל: מחיקת כל מה שניתן, השעיית 2 `billing_accounts`, ביטול 2 `statements` — מאומת read-only שאין השתתפות ב-jobs/reports. ר' `project_fin11_hybrid_collection.md` (זיכרון) לפרטים מלאים.
