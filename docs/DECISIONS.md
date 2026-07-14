# Decisions — "המונים"

תיעוד קליל של החלטות ארכיטקטורה/מוצר משמעותיות: **מה** הוחלט ו**למה**. לא WHAT נבנה (זה בקוד ובקומיטים) — רק ה-WHY שלא תמיד נשאר גלוי מקריאת הקוד לבד.

---

**2026-07-13**

**Decision:** שכבת ה-Overview נשארת `/dashboard` הקיים — לא נבנה Executive Dashboard חדש.

**Reason:** יש כבר עמוד עם בדיוק המאפיינים המבוקשים (KPI cards, התראות, גרף). הבעיה האמיתית הייתה שהוא מנותק מהדוחות, לא שהוא חסר. ר' [ANALYTICS_VISION.md](./ANALYTICS_VISION.md) §2.1.

---

**2026-07-13**

**Decision:** ה-Advisor מבוסס על `Derived Insights` (תובנות מחושבות דטרמיניסטית) ולא ישירות על `Facts`.

**Reason:** הפרדה בין חישוב לניסוח. חלק מהתובנות ("הקמפיין ירד ב-30%") הן חישוב טהור בלי LLM — ה-LLM נכנס רק לניסוח/תעדוף. משאיר פתח להריץ תובנות מסוימות בלי קריאת LLM בכלל. ר' [ANALYTICS_VISION.md](./ANALYTICS_VISION.md) §4.

---

**2026-07-13**

**Decision:** ה-backend של דוחות/דשבורד מקבל אך ורק `from`/`to` קונקרטיים — לעולם לא preset (`'month'`, `'last_month'` וכו').

**Reason:** לפני ההחלטה כבר היו 3 מוסכמות preset שונות ולא תואמות בקוד (`reports.service.js` עם `date_trunc` מוטבע, `donations.service.js` עם שני enums שונים בשתי פונקציות). preset הוא מושג UI בלבד; ה-frontend מתרגם אותו לתאריכים במקום אחד. ר' [GLOBAL_DATE_RANGE_SPEC.md](./GLOBAL_DATE_RANGE_SPEC.md) §2.3.

---

**2026-07-13**

**Decision:** ב-`campaign-performance` report, `target_amount`/`current_amount`/`pct` נשארים lifetime (לא מסוננים לפי טווח). `raised_in_range`/`donors_in_range` נוספו כשדות משלימים בלבד.

**Reason:** השלמת יעד היא לא מושג תקופתי — קמפיין שמומן לפני שנה עדיין 100% ממומן, לא משנה איזה טווח נבחר. סינון `current_amount` לפי טווח היה משנה את המשמעות של "% מהיעד" בצורה מטעה.

---

**2026-07-13**

**Decision:** מטמון הדשבורד (`dashboard.service.js`) עבר ממפתח `entityId` בלבד למפתח מורכב `entityId_from_to`.

**Reason:** בלי זה, מעבר בין טווחים היה עלול להחזיר בטעות נתונים ממטמון של טווח אחר — התגלה תוך כדי הוספת `from`/`to` לפני שנכתב קוד frontend שהיה חושף את זה בפועל.

---

**2026-07-13**

**Decision:** ב-Dashboard, רק `fundraisingThisMonth`/`donationsThisMonth`/`failedPayments` הפכו לתלויי-טווח. התראות, פעילות אחרונה, גרף 30 הימים, שגרירים מובילים ורשימת הקמפיינים נשארו ללא שינוי.

**Reason:** אלה views של "מצב נוכחי" או "N האחרונים" — לא מטריקות תקופתיות. סינון גרף 30 יום לפי טווח נבחר, למשל, היה יוצר בלבול (מה קורה אם בוחרים "שנה"?).
