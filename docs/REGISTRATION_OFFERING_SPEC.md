# Registration Offering — Functional Spec

**סטטוס:** פרק 1 (Business Model) ופרק 2 (Data Model, ראשוני) מאושרים. שאר הפרקים (User Flow מפורט, Checkout UI, API, Migration) ייקבעו תוך כדי המימוש — נקודת ההתחלה מוגדרת ב-§3.
**תאריך:** 2026-07-14
**שייך ל:** [CAMPAIGN_PRESETS_VISION.md](./CAMPAIGN_PRESETS_VISION.md)

זווית הראייה של המסמך הזה: **איך Registration משתלב בפלטפורמת התרומות הקיימת של המונים** — לא איך בונים מערכת לניהול מירוצים. המטרה היא להרחיב את המנוע הקיים, לא ליצור מנוע שני.

## 1. Business Model

### 1.1 שלוש הישויות העסקיות

**Registration Offering** — האפשרות שהמארגן מציע. לדוגמה: "5 ק"מ", "10 ק"מ", "21 ק"מ". יש לה מחיר קבוע למשתתף, ואופציונלית מלאי (מקסימום נרשמים). זו לא הרשמה בפועל — זו ה"מדף" שממנו בוחרים. זהו סוג נוסף של Offering (`type: 'registration'`), לצד `type: 'reward'` הקיים.

**Registration Order** — העסקה שהמשלם מבצע. תשלום אחד, יכול להכיל כמה Registration Offerings ברב-כמות (2 מבוגרים במסלול 10 ק"מ + ילד אחד במסלול 5 ק"מ), ואופציונלית תרומה נוספת מעל המחיר.

**Participant** — כל אדם שנרשם בפועל. שם, גיל, מידת חולצה, מסלול וכו'. נוצר רק ב-Checkout — לא קיים בשלב העגלה.

### 1.2 זרימת העגלה

```
Cart
  Registration Offering × Quantity     (עדיין בלי פרטי אנשים — רק "2× 10 ק"מ")
    ↓
Checkout
  איסוף פרטי Participant לכל יחידה + תרומה אופציונלית
    ↓
Submit
  Participants + Registration Order + Donation נוצרים יחד, כתשלום אחד
```

פרטי המשתתפים (שם/גיל/מידה) לא נאספים בעגלה — רק כמות ובחירת מסלול. כל השאר עובר ל-Checkout, בהתאם לכמות שנבחרה.

### 1.3 היחס בין Registration Order ל-Donation — ההחלטה הכי חשובה במסמך

**Donation ≠ Registration Order — אבל לכל Registration Order יש בדיוק Donation אחת.**

זו לא הוראה לבנות צינור תשלום שני. ההפך:

- **Donation** — רשומת התשלום. אותה טבלה, אותו Cardcom, אותו Webhook, אותו lifecycle של `status` (`pending`/`paid`/`failed`) שכבר קיים היום — **ללא שינוי כלשהו**.
- **Registration Order** — רשומה מובנית שמצורפת ל-Donation ספציפית (קשר `donation_id`), רק כאשר אותה Donation הגיעה מ-Registration checkout. היא לא מחליפה את ה-Donation — היא שכבת מידע נוספת עליה.
- **Participant** — ילד של Registration Order (יחס 1:N).

```
Donation                          (קיים, ללא שינוי — התשלום עצמו)
    ↑  1:1 (רק כשמדובר בהרשמה)
Registration Order                (חדש — פרטי העסקה)
    ↑  1:N
Participant                       (חדש — כל נרשם בנפרד)
```

**למה זו ההחלטה הנכונה:** היא שומרת על 100% מהתשתית הקיימת (Cardcom, Webhook, עמוד תרומות, ניהול סטטוס תשלום, דוחות) בלי לגעת בה. הסטטוס של Registration Order ושל כל Participant **נגזר** מה-Donation שלהם — לא מנוהל כישות נפרדת. תשלום שנכשל = הרשמה שנכשלה, אוטומטית, בלי סנכרון ידני בין שתי מערכות סטטוס.

**אושר:** Donation היא ה-Source of Truth של הכסף, ולא משוכפלת. הכיוון הוא **Donation → Registration Order**, לא ההפך:

```
Registration Order       ✗  לא כך:  Order → Payment → Donation
    ↓ נוצר מ-
Donation
```

```
Donation                  ✓  כך:  Donation → (אולי) Registration Order
    ↓ עשויה לגרור
Registration Order
```

**Donation קיימת גם אם אין Registration. Registration לעולם לא קיימת בלי Donation.**

**אושר גם:** אין טבלת "Registration Package" נפרדת. Registration Offering הוא שימוש נוסף באותו Offering שכבר תוכנן (`type: 'registration'`, לצד `type: 'reward'`) — לא ישות חדשה.

### 1.4 מה במפורש לא בסקופ (v1)

- ביטול או עריכת משתתף בודד אחרי תשלום.
- העברת הרשמה בין אנשים.
- רשימת המתנה כשהמלאי אוזל — רק חסימת רכישה כשאוזל.

המודל העסקי **מאפשר** את כל אלה בעתיד, כי Participant הוא רשומה עצמאית ולא שדה טקסט חופשי — פשוט לא בונים UI/API בשבילם עכשיו.

### 1.5 גבול מפורש: עמוד התורמים לא משתנה

עמוד התורמים (`donors-page`) מבוסס `donations` ונשאר כך **ללא שינוי**. אם הורה רשם 3 ילדים ושילם פעם אחת — יש **תורם אחד** ו-**3 משתתפים**. אלה שני מספרים שונים, לשני דברים שונים:

- **Donation Count** — כמה תשלומים/תורמים. נשאר כמו שהוא היום.
- **Participant Count** — כמה בני אדם נרשמו. KPI חדש, שייך ל-Registration בלבד.

**אזהרה מפורשת לכל מי שממשיך את המסמך הזה:** אל תמזגו בין השניים. אל תוסיפו ספירת Participants לעמוד התורמים. אם צריך תצוגה של משתתפי מירוץ — זה מסך/דוח נפרד, לא שינוי לעמוד הקיים.

## 2. Data Model (ראשוני)

```
Campaign
    │
    ├── Offerings
    │      ├── type: reward         (קיים)
    │      └── type: registration   (חדש — "5 ק"מ", "10 ק"מ" וכו')
    │
    └── Donations                   (קיים, ללא שינוי — התשלום)
            │
            └── Registration Orders (חדש, 1:1 עם Donation שמקורה בהרשמה)
                    │
                    └── Participants (חדש, 1:N)
```

**טבלאות חדשות (שמות ראשוניים, לא סופיים):**

```
registration_orders
  id
  donation_id        -- FK ל-donations, unique (יחס 1:1)
  campaign_id
  created_at

registration_participants
  id
  registration_order_id   -- FK ל-registration_orders
  offering_id              -- FK ל-Offering שנבחר (המסלול)
  name
  gender
  shirt_size
  birth_year
  distance                 -- או נגזר מ-offering_id
  created_at
```

הסטטוס (`pending`/`paid`/`failed`) **לא** מאוחסן כאן — הוא תמיד נקרא מה-`donations` הקשורה, דרך `registration_orders.donation_id`. אין שדה status כפול.

## 3. נקודת המשך למימוש

סדר הבנייה שכבר סוכם (לא תלוי בסדר כתיבת המסמך):

```
1. Offering.type              -- שדה סכימה בלבד, 'reward' כברירת מחדל
2. Registration Offering       -- הפרק הזה: Order + Participants + Checkout
3. Sections + Auto Tabs         -- מקביל, לא תלוי, שיפור Content Model
4. Campaign Presets             -- אחרון, תלוי ב-2
```

מה שעדיין לא הוחלט, וממתין לשלב המימוש עצמו (לא ממציאים תשובות עכשיו): שמות טבלאות/עמודות סופיים, ה-API הספציפי של ה-Checkout, טיפול ב-webhook כשל-Donation יש Registration Order מצורף, ותצוגת ה-Participants באדמין.
