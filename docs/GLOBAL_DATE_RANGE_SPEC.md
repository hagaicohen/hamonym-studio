# Global Date Range — אפיון (Phase 1)

**סטטוס:** טיוטה לדיון
**תאריך:** 2026-07-13
**שייך ל:** [ANALYTICS_VISION.md](./ANALYTICS_VISION.md) — Phase 1

## 1. המצב הקיים (למה זה קריטי לעשות נכון)

בדקתי את הקוד הקיים לפני כתיבת המסמך — וזה בדיוק מה שהערת עליו קודם, רק שזה כבר קרה:

- `reports.service.js` — כל דוח מגדיר טווח זמן משלו, מוטבע בקוד: `campaign-performance` ו-`marketing` לא מסננים לפי זמן בכלל (כל הזמנים), `trends` משווה "החודש" מול "החודש שעבר" בלי אפשרות לשנות, `failures` מחשב KPI על "החודש" בלבד, hardcoded.
- `donations.service.js` (`getEntityDonations`) — יש כבר preset משלו: `'month' | 'last_month' | 'quarter' | 'all'`.
- `donations.service.js` (`getCampaignDonors`) — preset **שלישי**, שונה: `'today' | 'week'`.

שלוש מוסכמות שונות, לא תואמות, כבר קיימות בקוד. זו בדיוק הסכנה שתיארת — אם Phase 1 לא ייעשה נכון, כל Report הבא יוסיף מוסכמה רביעית.

## 2. תשובות לשאלות

### 2.1 מי שומר את הטווח?

**החלטה:** שירות Angular חדש, `AnalyticsRangeService` (אותה תבנית בדיוק כמו `CurrentContextService` הקיים) — signal + persist ל-`localStorage` תחת מפתח מגרסה `analyticsRange_v1`.

**לא** ב-URL בשלב הזה. שיתוף קישור עם טווח תאריכים ("שלח לי את הדוח של הרבעון") הוא תוסף עתידי אמיתי, אבל מוסיף מורכבות (query params sync, ניווט) שלא נחוצה ל-MVP. כשיהיה בו צורך אמיתי — מוסיפים.

```ts
interface AnalyticsRange {
  preset: 'today' | '7d' | '30d' | '90d' | 'year' | 'custom';
  from: string;  // ISO date, resolved
  to: string;    // ISO date, resolved
}
```

ברירת מחדל: `30d`.

### 2.2 איך כל הדוחות מקבלים אותו?

**החלטה:** אף Report לא מחשב תאריכים בעצמו. כולם קוראים מ-`AnalyticsRangeService.activeRange()` ומעבירים את `from`/`to` כמו שהם ל-API.

```
AnalyticsRangeService (signal)
        ↓
   Report Component  (reads activeRange(), reacts to changes)
        ↓
      API call        (from, to — כבר מחושבים)
```

מבחינת קוד Angular, זה בדיוק התבנית שכבר נבנתה ואומתה השבוע לסנכרון עמותה פעילה (`CurrentEntityService` + `effect()` + `untracked()` + השוואת "מזהה אחרון שנטען" כדי למנוע לולאות):

```ts
private lastLoadedRange: string | null = null;

constructor() {
  effect(() => {
    const range = this.analyticsRange.activeRange();
    const key = `${range.from}_${range.to}`;
    if (key === this.lastLoadedRange) return;
    this.lastLoadedRange = key;
    untracked(() => this.load());
  });
}
```

אותו קוד בדיוק, רק עם `AnalyticsRangeService` במקום `CurrentEntityService`. שני ה-`effect`-ים (עמותה + טווח) חיים זה לצד זה באותו קומפוננטה.

### 2.3 מה ה-API מקבל — from/to או preset?

**החלטה: רק `from`/`to`, לעולם לא preset.**

ה-`preset` (`30d`, `year` וכו') הוא מושג של ממשק המשתמש בלבד — הבורר צריך לדעת מה המשתמש בחר, כדי לסמן את הכפתור הנכון. אבל ברגע שהבחירה מתורגמת לתאריכים קונקרטיים (ב-`AnalyticsRangeService`, פעם אחת, במקום אחד), ה-backend מקבל תמיד את אותו חוזה קבוע:

```
GET /api/reports/entity/:id/campaigns?from=2026-06-13&to=2026-07-13
GET /api/reports/entity/:id/trends?from=2026-06-13&to=2026-07-13
GET /api/reports/entity/:id/marketing?from=2026-06-13&to=2026-07-13
GET /api/reports/entity/:id/failures?from=2026-06-13&to=2026-07-13
```

**למה לא preset בצד השרת:** אם השרת מפרש `'month'`, כל endpoint צריך להחליט בעצמו מה זה אומר (כמו שכבר קרה — `donations.service.js` בעצמו מגדיר `'month'` בשתי דרכים שונות בשתי פונקציות). כשה-frontend הוא היחיד שמחליט "30 יום = מ-X עד Y", יש הגדרה אחת ל"עכשיו", אזור זמן אחד, ומקום אחד שבו טעות בחישוב תאריך יכולה לקרות — לא ארבעה.

כל query בשרת הופך לפשוט ואחיד:

```sql
WHERE entity_id = $1 AND completed_at >= $2 AND completed_at < $3
```

**מיגרציה (לא בסקופ של Phase 1 עצמו, אבל כפוף לאותו חוזה כשיגיע התור):** שלושת המקומות הקיימים שכבר ממציאים preset משלהם (`reports.service.js`, `donations.service.js` פעמיים) ימירו בעתיד לאותו חוזה `from`/`to`. Phase 1 עצמו מתמקד רק ב-4 טאבי הדוחות (`campaign-performance`, `trends`, `marketing`, `failures`) — עמוד התרומות/תורמים לא נכנס לסקופ הזה.

### 2.4 איך מתנהג Drill Down?

**החלטה: יורש את הטווח הגלובלי הפעיל, לא מאפס אותו.**

אם אני בתוך `30 יום` ולוחץ על `23 תרומות`, הרשימה שנפתחת מסוננת גם היא ל-`30 יום` — אותו `from`/`to` בדיוק מועבר הלאה. אין מצב שבו drill-down "שוכח" את הטווח שבחרתי ומראה הכל.

### 2.5 איך ה-Advisor מקבל את הטווח?

**מצב היום:** `CampaignAdvisorAgent` הקיים לא מושפע מ-Phase 1 בכלל — כל ה-Facts שלו הם תכונות סטטיות של קמפיין בודד (יש וידאו? יש CTA? יש יעד תאריך?), לא נתונים תלויי-זמן. אין שינוי נדרש בו.

**עתידי:** ברגע שיוקם Advisor שמייצר Derived Insights תלויות-זמן (למשל "הקצב ירד ב-30% בשלושת הימים האחרונים" — בדיוק הדוגמה מ-`ANALYTICS_VISION.md`), ה-Analysis Engine שלו חייב לקבל `from`/`to` באותו חוזה בדיוק כמו כל Report — לא המצאת מנגנון שלישי. "תן לי תובנות" על 30 יום ולא על שנה זה בדיוק אותה שאלה כמו "תראה לי את הדוח" על 30 יום ולא על שנה.

## 3. סדר הבנייה

```
1. AnalyticsRangeService     — השירות עצמו (signal + localStorage + resolve preset→dates)
        ↓
2. Backend: from/to בכל endpoint — 4 דוחות קיימים מקבלים פרמטרים חדשים, מחליפים hardcoded date_trunc
        ↓
3. Dashboard                 — מתחבר ל-AnalyticsRangeService (עם טווח ברירת מחדל, עדיין בלי בורר ויזואלי)
        ↓
4. DateRangePicker           — קומפוננטה ויזואלית, כותבת ל-AnalyticsRangeService בלבד
        ↓
5. Reports (4 טאבים)         — מתחברים אחרון, כי יש להם הכי הרבה לוגיקת query קיימת להחליף
```

הסדר הזה מפריד בדיקות שרת מבדיקות UI: אחרי שלב 2 אפשר לבדוק את כל 4 ה-endpoints ישירות עם `from`/`to` (curl/Postman) ולוודא תשובות נכונות, עוד לפני שקיים ממשק. ה-DateRangePicker מגיע רק בשלב 4, אחרי שהחוזה כבר הוכח נכון מקצה לקצה על Dashboard.

## 4. מה בסקופ Phase 1, מה לא

**בסקופ:**
- `AnalyticsRangeService` + `DateRangePicker`
- 4 טאבי הדוחות (`campaign-performance`, `trends`, `marketing`, `failures`) עוברים ל-`from`/`to`
- Dashboard (הכרטיסים הקיימים) מתחברים לאותו טווח

**לא בסקופ (מיגרציה עתידית, לא Phase 1):**
- עמוד התרומות (`donations-page`) ועמוד התורמים (`donors-page`) — ממשיכים עם ה-`period` הקיים שלהם בינתיים.
- שיתוף טווח דרך URL.
- Advisor תלוי-זמן — לא קיים עדיין.

## 5. Success Criteria (ל-Phase 1 הזה, לא לכל המערכת)

- שינוי טווח בבורר אחד מרענן את כל 4 טאבי הדוחות והדשבורד, בלי לפתוח כל אחד בנפרד.
- אין בקוד ה-frontend של אף Report קריאה ל-`new Date()` לחישוב "לפני 30 יום" — כל חישוב תאריך במקום אחד (`AnalyticsRangeService`).
- ה-backend של 4 הדוחות מקבל אך ורק `from`/`to`, אף אחד מהם לא מפרש preset.
- **Source of Truth יחיד לכל טווח זמן**: כל הדוחות מציגים את אותו מספר כאשר הם נשאלים על אותו טווח. אם Dashboard מציג ₪152,000 על טווח מסוים, אף Report לא יכול להציג מספר שונה על אותו טווח בדיוק — כי כולם משתמשים באותו `from`/`to` ובאותה הגדרת "תרומה בטווח" (`completed_at >= from AND completed_at < to`, `status = 'paid'`).
