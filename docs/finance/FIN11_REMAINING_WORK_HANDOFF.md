# FIN-11 — Remaining Work / Handoff

מסמך זה הוא נקודת ההמשך המחייבת ל-FIN-11. **אין להציג כאן שום דבר כגמור שלא אומת בפועל.** אם תתחיל שיחה/session חדש/ה ולא תהיה גישה להיסטוריה — התחל כאן ובקרא את `FIN11_IMPLEMENTATION_STATUS.md` + `FINANCIAL_BUSINESS_DECISIONS.md` לפני כל שינוי.

## מה ממומש בפועל (אומת בבדיקות, לא רק מתועד)

- `foldLateDonationsIntoStatement` — **Stage 1, נדחף, בפרודקשן** (`d8d440e`). עדיין לא מחובר לשום caller/route.
- `getFin11CappedCardProposal` — **Stage 2A, committed, לא נדחף** (`a4c364b`). קריאה טהורה בלבד — לא יוצרת attempt, לא גובה. לא מחוברת לשום caller.
- `resolveAttempt` מחוזק + `payment_exceptions`/`payment_exception_actions` — **Stage 2B, נבדק, לא committed עדיין**. **migration 073 לא הוחלה על שום DB.**

## מה מתועד/מוכרע עסקית בלבד — **לא ממומש**

- אישור+גבייה אוטומטיים באשראי עד ₪3,000 (אין job/cron, אין caller ל-`getFin11CappedCardProposal`).
- Job/schedule ל-6 בחודש (מס"ב).
- מסלול קליטת תוצאות מס"ב (recordMasavResult-מחליף) — **דורש החלטה עסקית חדשה**, לא רק קוד (ר' FIN-15#2 ב-`FINANCIAL_BUSINESS_DECISIONS.md`).
- תנאי גבייה פרטניים ברמת עמותה.
- 3-ניסיונות-אשראי-לכל-היותר + escalation אנושי.
- הבחנת שלבי מס"ב (הוכן/שודר/אומת/נדחה/בהמתנה).
- `routing.js` — עדיין מכריע בינארית לפי סף ₪3,540; לא תומך "שני אמצעים על אותו Statement" בפועל.
- UI לכל חלק ה-overpayment-exception (צפייה בחריגים, override, resolve) — **אין ממשק, רק פונקציות backend**.
- מנגנון ביצוע refund/credit בפועל — **אינו קיים, לא הוכרע עסקית אם/איך יבנה**.

## חייב להיבדק/להיקבע לפני כל הפעלת-כסף-אמיתי

1. **migration 073 חייבת להיות מוחלת לפני כל deploy של קוד Stage 2B — סדר מחייב, לא המלצה**: (א) `scripts/migrate-073.js`, (ב) `scripts/verify-fin11-stage2b-ready.js` (שער fail-fast חדש — read-only, יוצא קוד 1 אם משהו חסר, אומת ריצתית שהוא תופס את המצב הנוכחי במדויק), (ג) רק אז קוד ה-application. ר' `FIN11_STAGE2B_TECHNICAL_DESIGN.md` סעיף 7 לפרטים מלאים.
2. `billing-ops.service.js#reconcileCollectionAttempt` — להוסיף בדיקת סטטוס לפני reconcile (לא עשוי ב-Stage 2B, ר' סיכונים שנותרו).
3. `collection-attempt-reconciliation.job.js`'s "overpaid" check — לתקן השוואה ל-`adjustedTotal` במקום `total_due` גולמי, לפני שיותר מ-payment אחד הופך לנורמה.
4. `routing.js` — להחליט ולממש איך אשראי+מס"ב פועלים על אותו Statement בלי "להכריע מחדש" שוב ושוב.
5. החלטה עסקית מפורשת על מסלול קליטת תוצאות מס"ב (לא קיים היום, V1 boundary מכוון מ-1.9.2026).

## רשימת עבודה מוצעת ל-Stage 3/4/UI (לא מאושרת לביצוע — דורשת אישור נפרד לכל שלב)

**Stage 3 (מס"ב, מוצע)**:
- [ ] חישוב יתרת מס"ב מול `adjustedTotal - payments` (לא `total_due`).
- [ ] עדכון `masav-collection.service.js#openMasavAttempt`/`generateExportExcel` להשתמש ב-`getStatementBalance().outstanding`, לא ב-`total_due` גולמי (פער קיים, מתועד ב-Stage 2B Audit).
- [ ] החלטה עסקית על קליטת תוצאות מס"ב (לא רק קוד).

**Stage 4 (ניתוב משולב + תזמון, מוצע)**:
- [ ] שינוי `routing.js` לדגם שמאפשר שני אמצעים על Statement אחד.
- [ ] Job/schedule ל-28/20:00 (אשראי) ו-6-בחודש (מס"ב).
- [ ] חיבור בפועל של `getFin11CappedCardProposal`/`resolveAttempt` לקריאה אמיתית ל-adapter (`charge()`), כולל 3-ניסיונות-לכל-היותר.

**Finance UI (מוצע)**:
- [ ] מסך חריגי גביית-יתר (`payment_exceptions`) לסופר-אדמין — רשימה, פרטים, override, resolve.
- [ ] תצוגת סטטוס hold ברמת עמותה.
- [ ] תצוגת Stage 2A proposal (לפני שהיא מחוברת לגבייה אמיתית) למטרות בדיקה/שקיפות.

## מה חייב להיבדק לפני כל הפעלה בכסף אמיתי (סיכום)

- [ ] migration 073 הוחלה בסביבת היעד ואומתה (כל הטריגרים קיימים, לא רק הטבלאות).
- [ ] `routing.js` מתוקן לדגם ההיברידי.
- [ ] `reconcileCollectionAttempt` ו-reconciliation job's overpaid-check תוקנו.
- [ ] החלטה עסקית על מס"ב-result-ingestion קיימת וממומשת.
- [ ] UI לחריגים קיים — אין טעם ב-hold-מבלי-יכולת-לסקור.
- [ ] בדיקת end-to-end אמיתית (sandbox CardCom, לא production) של המחזור המלא: proposal → attempt → charge → resolve → (אם רלוונטי) exception → resolve.

**עד שכל הסעיפים לעיל לא סומנו ✅ ואומתו בפועל — אין להפעיל גבייה אמיתית תחת FIN-11.**
