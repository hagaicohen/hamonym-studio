# Israel Invoices — Audit תמיכה במספר הקצאה (`tax_id`)

**מצב**: **ממומש ונבדק, שלושה סבבים. worktree מבודד (`C:/DEV/HamonymStudio-israel-invoices-audit`), לא הוחל commit — ממתין לאישור.** נבדק ישירות בקוד (לא הונח) בכל טענה שמסומנת "מאומת"; טענות שלא נבדקו ישירות מסומנות "הנחה" במפורש.

**⚠️ קרא את סעיף 4 לפני סעיפים 1-3** — הסבב השני (ר' סעיף 4) מתקן כיוון: סעיפים 1-3 נכונים עובדתית כפי שהיו, אבל ה**מסקנה** שנבעה מהם בסבב הראשון (צורך במנגנון הנפקת-חשבוניות עצמאי) **הייתה הרחבה מוגזמת**. הסבב השני בדק ישירות מול ה-API הרשמי של CardCom ומצא: **התיקון הנדרש קטן בהרבה** — שדה קיים ב-API, לא נשלח היום.

**הסבב השלישי (ר' סעיף 7) מימש את התיקון** — שורה אחת ב-backend, בדיקות, ותיעוד. **לא בוצע commit** — ממתין לאישורך.

**טרמינולוגיה נכונה (לפי הדרישה)**: **מספר הקצאה — Allocation Number**. לא "מספר הוצאה". מסמך זה משתמש במונח הנכון בלבד.

## רקע הדרישה

במערכת ה-Hamonym הקודמת (legacy) בוצע תיקון שמעביר את מספר הזהות/ח.פ של הלקוח תחת פרמטר `tax_id`, לתמיכה במספרי הקצאה לפי מערכת "חשבוניות ישראל". המטרה של ה-Audit הזה: לקבוע אם הפלטפורמה החדשה (זו שבפיתוח כרגע) תומכת בכך, ואם לא — לאן בדיוק הפער.

---

## 1. מה קיים כבר בפועל

### א. שדה זיהוי דונור — קיים, אבל רק בטופס הציבורי
**מאומת**: עמודת DB `donations.donor_id_number VARCHAR(20)` — `hamonym-backend/migrations/003_donations.sql:18`.

זרימה מלאה, מאומתת קוד-אחרי-קוד:
- **Checkout V2** (הטופס הציבורי הנוכחי): `src/app/modules/campaigns/shared/components/checkout-v2/checkout-v2.component.ts:385` — `idNumber`, עם אימות checksum ישראלי (`isValidId`, שורות 406-417), **אופציונלי** (לא חובה).
- תבנית: `checkout-v2.component.html:181-192` — שדה בשם "תעודת זהות", `maxlength="9"`.
- **Checkout V1** (הישן): `checkout-modal.component.ts:87,200,336` — אותו שדה, מותנה בדגל `donorFields.showIdNumber`.
- מודל Frontend: `donation.service.ts:34` — `idNumber?: string`.
- דגל קונפיגורציה (**ללא ממשק אדמין חשוף**, לפי הערת קוד): `campaign-api.service.ts:176` — `showIdNumber: data.donor_fields?.show_id_number ?? false`.
- כתיבה ל-DB: `hamonym-backend/src/modules/donations/donations.service.js:459,472` — `donor_id_number` נכתב מ-`donor.idNumber || null`.

**ממצא חשוב שנבדק ישירות**: ה-`idNumber` הזה **משמש בפועל קודם כל לאימות כרטיס אשראי** — מוזרם כ-`cardOwnerId`/`CardOwnerIdValue` לווידג'ט ה-OpenFields של Cardcom (`checkout-v2.component.html:259`, `openfields-form.component.ts:65,483`), עם ברירת מחדל דמה `'000000000'` כשריק (`openfields-form.component.ts:483`). זו קונבנציית-תשלום, לא שדה-חשבונאות — השימוש העיקרי המאומת שלו אינו לתיעוד מס.

### ב. שדה זיהוי — **חסר לגמרי** בטופס "הזנת תרומה ידנית" (אדמין)
**מאומת שלילית**: `campaign-dashboard-finance.component.html:14-56` — השדות הם סכום, מקור, מספר תומכים, שם/אימייל/טלפון דונור, הערה, declared. **אין שום שדה ת.ז/ח.פ**.
`donations.service.js:1462` — `createManualDonation(entityId, { campaignId, amount, source, supportersCount, donorName, donorEmail, donorPhone, note, clientSubmissionKey }, enteredByUserId)` — **אין פרמטר `donorIdNumber`**, ואין `donor_id_number` ב-INSERT (שורות 1507-1513). אומת ישירות.

### ג. אינטגרציית חשבונית/קבלה — Cardcom בלבד, בלי Document.TaxId
**מאומת**: אין בכלל ספק-חשבוניות נפרד (לא Green Invoice, לא EZcount/iCount/Rivhit) — חיפוש מלא בריפו שליל. המנגנון היחיד הקיים: שדה `Document` בתוך `POST /LowProfile/Create` של Cardcom עצמה —

```js
// hamonym-backend/src/modules/donations/donations.service.js:576-582
Document: {
  To:       donor.name,
  Email:    donor.email,
  Phone:    donor.phone,
  Mobile:   donor.phone,
  Products: products,
},
```

**מאומת**: האובייקט `Document` **אין בו שום שדה לתעודת-זהות/ח.פ/מספר-הקצאה**. אין אפילו `DocumentType` — איזה מסמך Cardcom מנפיקה (אם בכלל) תלוי בקונפיגורציית הטרמינל שלה בלבד, לא בפיילוד הזה.

`cardcom.mapper.js` (`hamonym-backend/src/modules/payment/cardcom/cardcom.mapper.js`) — **קובץ ריק, 0 בייט**, מאומת.

### ד. סוגי מסמכים — אין הבחנה בקוד בין קבלה לחשבונית מס, כי Hamonym לא מנפיקה שום דבר בעצמה
**מאומת**: `document.handler.js` (handler ל-webhook של מסמכים מ-Cardcom) הוא stub מלא:
```js
// TODO — Document Notifications: Receipt / Invoice / Credit Document created
// by Cardcom. Not implemented until a real payload is captured.
exports.handle = async (_payload) => {};
```
לא מחובר לשום route (מאומת, `docs/CARDCOM_INTEGRATION.md`).

טבלת `receipts` הפנימית (`migrations/017_receipts_and_donor_accounts.sql:4-15`) **אינה מסמך חשבונאי** — רק `donation_id, entity_id, campaign_id, amount, donor_name, donor_email, issued_at`. אין בה שדה-מס בכלל.

תבנית המייל לדונור (`src/modules/email/templates/receipt.js:3-10`) מכריזה במפורש: "אין מסמך חשבונאי/מס רשמי בפועל בזרימה הזו" — מונח נייטרלי "אישור תרומה" נבחר בכוונה, לא "קבלה"/"חשבונית".

**מסקנה**: כל מסמך מס אמיתי שקיים היום (אם בכלל) מונפק **ע"י Cardcom עצמה**, לפי קונפיגורציית הטרמינל — לא ע"י לוגיקה של Hamonym, ובלי שום נראות למספר-זהות/הקצאה מהפיילוד הנוכחי.

### ה. חיפוש מילולי `tax_id` / "הקצאה"
**מאומת שלילית, חיפוש מלא בריפו**: המחרוזת `tax_id`/`taxId`/`TaxId` — **אפס תוצאות** בכל הקוד (frontend+backend). המחרוזות `הקצאה`/`מספר הקצאה`/`חשבוניות ישראל`/`allocation` — **אפס תוצאות**, גם בקוד וגם בכל קובצי `docs/*.md` הקיימים. אין שום מודעות קיימת לדרישה הזו בקוד או בתיעוד.

---

## 2. מה חסר

1. **שום שדה בשם `tax_id` לא קיים** — השדה הקיים (`donor_id_number`/`idNumber`) הוא ת.ז ישראלית בלבד, לא ח.פ/מספר-תאגיד, ומיועד היום לאימות-כרטיס לא לחשבונאות.
2. **אין שדה ת.ז/ח.פ בטופס הזנה ידנית (אדמין)** — פער מלא, גם ברמת UI וגם ברמת backend.
3. **אין העברה של `donor_id_number` ל-Cardcom's `Document` payload בכלל** — אפילו אם השדה היה קיים אצל כל הדונורים, הוא לא מגיע לשום מקום שיכול ליצור מסמך-מס עם מספר הקצאה.
4. **אין הבחנה בקוד בין "קבלת תרומה" ל"חשבונית מס"** — אין לוגיקה שמחליטה איזה סוג מסמך צריך להיווצר, ולכן אין נקודה טבעית להחליט "כאן צריך מספר הקצאה, כאן לא".
5. **אין שום מנגנון חשבונית בפועל שמונפק ע"י Hamonym** — ה-Document payload הנוכחי לא כולל `DocumentType`, אז כל יצירת-מסמך תלויה בקונפיגורציית Cardcom בלבד, לא בקוד.

---

## 3. קבצים ופונקציות רלוונטיים (לשימוש בהמשך)

| שכבה | קובץ | מה קורה שם |
|---|---|---|
| Frontend — טופס ציבורי | `checkout-v2.component.ts`/`.html` | שדה `idNumber`, אימות checksum, אופציונלי |
| Frontend — טופס ציבורי ישן | `checkout-modal.component.ts`/`.html` | אותו שדה, מותנה ב-flag |
| Frontend — מודל | `donation.service.ts:34` | `idNumber?: string` |
| Frontend — קונפיגורציה | `campaign-api.service.ts:176` | `showIdNumber` flag, ללא UI אדמין |
| Frontend — הזנה ידנית (אדמין) | `campaign-dashboard-finance.component.html:14-56` | **אין שדה ת.ז/ח.פ** |
| Backend — יצירת תרומה (ציבורי) | `donations.service.js:459,472` | כותב `donor_id_number` |
| Backend — הזנה ידנית | `donations.service.js:1462`, `donations.controller.js:156-159` | **אין `donorIdNumber`** |
| Backend — DB | `migrations/003_donations.sql:18` | `donor_id_number VARCHAR(20)` |
| Backend — Cardcom payload | `donations.service.js:554-583` | `Document` object, אין שדה-מס |
| Backend — Cardcom client | `payment/cardcom/lowprofile.client.js:19-26` | שולח את ה-payload |
| Backend — webhook מסמכים | `payment/handlers/document.handler.js` | stub, לא מחובר |
| Backend — מיפוי (ריק) | `payment/cardcom/cardcom.mapper.js` | 0 בייט |
| Backend — קבלה פנימית | `migrations/017_receipts_and_donor_accounts.sql:4-15` | לא מסמך חשבונאי |

---

## 4. עדכון קריטי (סבב שני) — תוקן כיוון ה-Audit, לפי הערת המשתמש

**הערה שהתקבלה, נכונה**: הסבב הראשון של ה-Audit הרחיב את השאלה ל"האם Hamonym צריכה להנפיק חשבוניות-מס בעצמה" — זו **לא** בהכרח הדרישה המקורית. הדרישה המקורית: לוודא שניתן להעביר את מספר הזיהוי ל-CardCom **דרך מנגנון המסמכים הקיים**, כמו במערכת הישנה. הסבב הזה בדק בדיוק את זה — ישירות מול ה-API הרשמי של CardCom (swagger רשמי, `secure.cardcom.solutions/swagger/v11/swagger.json`, לא הונח ולא הוסק מתיעוד שלישי), לא הרחבה תפיסתית.

**ממצא מאומת, ישיר מה-swagger הרשמי של CardCom**: לאובייקט `Document`/`DocumentBase` (אותו אובייקט שהקוד הקיים כבר שולח ל-`POST /LowProfile/Create`) יש שדה **`TaxId`** (string, עד 50 תווים, אופציונלי), עם התיאור המדויק הבא בתיעוד הרשמי:

> "Business registration number or user Identity number"

כלומר: **שדה אחד בודד מכיל גם ת.ז (אדם פרטי) וגם ח.פ (תאגיד)** — בדיוק התשובה לשאלה #4 שהוצבה. השדה **קיים כבר ב-API, לא הומצא, ולא דורש ספק חדש**.

חיפוש מלא בכל ה-swagger (כ-400,000 תווים, נקרא במלואו) אחר "allocation"/"מספר הקצאה"/"Israel Invoices"/"Hakatza" — **אפס תוצאות**. אין פרמטר נפרד למספר-הקצאה ב-API. **הנחה, לא עובדה מאומתת**: סביר שכ-CardCom היא ספקית מסמכים מורשית בישראל, היא עצמה פונה לרשות המסים ומקבלת את מספר ההקצאה **אוטומטית** בצד שלה כשהיא מנפיקה חשבונית-מס אמיתית עם `TaxId` תקין — זו לא דרישה שה-caller (Hamonym) צריך לספק בעצמו. **לא אומת במפורש בתיעוד ה-swagger עצמו** — רק היעדר-שדה-מקביל שתומך בהשערה הזו.

**מסקנה מתוקנת, ממוקדת**: **אין צורך במנגנון הנפקת-חשבוניות חדש**. הבעיה האמיתית פשוטה בהרבה: הקוד הקיים **לא שולח** את `TaxId` בכלל, אף שהוא כבר אוסף ערך מתאים (`donor_id_number`) ושולח payload ל-`Document` object הנכון. זה פער של **שורה אחת חסרה**, לא ארכיטקטורה חסרה.

---

## 5. הצעת מימוש מינימלית מתוקנת (לא בוצעה — הצעה בלבד, קוד לא שונה)

**לא נדרש מנגנון הנפקת-חשבוניות עצמאי.** לא נדרש ספק חדש. התיקון המלא, לפי הראיות:

1. **Backend — שורה אחת**: ב-`donations.service.js`, Document object, להוסיף `...(donor.idNumber ? { TaxId: donor.idNumber } : {})` — **spread מותנה, לא `|| null`**: מוציא את המפתח `TaxId` כליל כשאין ערך, לא שולח ריק/null (ר' סעיף 7 — **ממומש בפועל**).
2. **טופס ציבורי**: כבר אוסף ושומר `donor_id_number` — **אין צורך בשינוי**.
3. **טופס הזנה ידנית (אדמין)**: **הוחלט לא להוסיף שדה** — ר' סעיף 7ג, ממצא קריטי: `createManualDonation` אף פעם לא קוראת ל-CardCom כלל.
4. **לא להוסיף `tax_id` כשדה חובה** — נשאר אופציונלי כמו היום (**ממומש**, ר' סעיף 7).
5. **`DocumentTypeToCreate`** — שדה קיים ב-API שקובע איזה סוג מסמך CardCom מנפיקה; הקוד הנוכחי לא שולח אותו בכלל. **לא נדרש שינוי לזה לצורך מספר הקצאה בלבד** — זו שאלה נפרדת.

---

## 6. שאלות פתוחות שנותרו (צומצמו משמעותית מהסבב הקודם)

1. **לשותף שלך**: במערכת הישנה, `tax_id` הועבר ישירות ל-CardCom (לאותו endpoint/שדה דומה), או למערכת חשבוניות אחרת? **אני לא יכול לאמת את זה בעצמי — אין לי גישה לקוד המערכת הישנה בשיחה הזו.** בהינתן הממצא החדש (CardCom עצמה תומכת ב-`TaxId` על אותו endpoint שגם הפלטפורמה החדשה כבר משתמשת בו), סביר (**הנחה, לא עובדה**) שהתשובה היא "ישירות ל-CardCom" — אבל זה צריך אימות מהשותף, לא ממני.
2. ת.ז בלבד מול ת.ז+ח.פ: `TaxId` של CardCom מקבל את שניהם כמחרוזת אחת — האם צריך הבחנה בצד הטופס (לדעת אם הדונור תאגיד), או שמספיק להמשיך לאסוף ערך בודד כמו היום?
3. האם יש צורך עסקי לחייב את השדה (למשל מעל סכום תרומה מסוים) — **לא דורש פתרון טכני כדי להחליט**, אבל גם לא תנאי מקדים לתיקון השורה-האחת שהוצע בסעיף 5#1.
4. `DocumentTypeToCreate` — אם יש כוונה עתידית לקבוע איזה סוג מסמך CardCom מנפיקה (ולא להסתמך על קונפיגורציית הטרמינל), זו החלטה נפרדת מה-`TaxId`.

---

## 7. מימוש (סבב שלישי, 2026-10) — בוצע ונבדק, לא בוצע commit

### א. שינוי קוד — שורה אחת, קובץ אחד
`hamonym-backend/src/modules/donations/donations.service.js`, בתוך אובייקט `Document` שה-`createDonation` הציבורית שולחת ל-CardCom:
```js
Document: {
  To:       donor.name,
  Email:    donor.email,
  Phone:    donor.phone,
  Mobile:   donor.phone,
  ...(donor.idNumber ? { TaxId: donor.idNumber } : {}),
  Products: products,
},
```
משתמש ב-`donor.idNumber` הקיים — אותו ערך שנאסף ונשמר כבר היום כ-`donor_id_number` (`checkout-v2`/`checkout-modal` → `donation.service.ts` → `donations.controller.js` → `donations.service.js`). **אין שינוי לשום קובץ אחר**.

### ב. שדה נשאר אופציונלי — אומת ישירות
`...(donor.idNumber ? {...} : {})` — spread מותנה: כש-`idNumber` ריק/חסר, המפתח `TaxId` **לא קיים בכלל** באובייקט שנשלח (לא `null`, לא מחרוזת ריקה). דונורים שלא מוסרים זיהוי ממשיכים לעבוד בדיוק כמו היום — **לא נבדקה שום הפעלה אמיתית מול CardCom** (כנדרש), אבל ה-payload עצמו אומת שהוא תקין בשני המקרים.

### ג. ממצא קריטי שנחשף בזמן המימוש — טופס הזנה ידנית נשאר **ללא** שינוי, בכוונה
נבדק ישירות: `createManualDonation` (`donations.service.js:1477`) **אף פעם לא קוראת ל-CardCom כלל** — היא כותבת תרומה בסטטוס `'paid'` ישירות (`INSERT INTO donations (...) VALUES (...,'paid',...)`, ללא `LowProfile/Create`, ללא `Document`). **לכן לא נוסף שדה ת.ז/ח.פ לטופס הזנה ידנית בסבב הזה** — הוספת שדה כזה הייתה משתמעת כאילו הוא מזין מסמך-מס דרך CardCom, וזו **הטעיה** (בדיוק מה שההנחיה הזהירה ממנה במפורש). אם תרומות הזנה-ידנית יזדקקו אי-פעם לחשבונית-מס עם מספר הקצאה — זו החלטה/מנגנון נפרד לגמרי, לא הרחבה של התיקון הזה.

### ד. תמיכה בת.ז **וגם** ח.פ — ללא שינוי לקוד קיים
`TaxId` של CardCom (לפי ה-swagger הרשמי) מקבל "Business registration number or user Identity number" — **מחרוזת אחת, לא שני שדות**. הקוד שהתווסף **אגנוסטי לחלוטין** לסוג הערך — מעביר כל מה שנשמר ב-`donor.idNumber` בלי בדיקה. ה-validator הקיים בפרונטאנד (`checkout-v2.component.ts#isValidId`) מיישם את נוסחת ה-checksum המשוקלל הסטנדרטית הישראלית — **הנחה, לא אומתה באופן עצמאי**: נוסחת ה-checksum הזו משמשת בישראל גם למספרי ת.ז וגם למספרי ח.פ (רישום חברות/עמותות), כך שסביר שה-validator הקיים כבר מקבל את שניהם ללא שינוי — אבל זה לא נבדק מול מספרי ח.פ אמיתיים, ולכן **לא שונה** (כדי לא להחליש אימות בלי ביטחון). **לא בוצע שום שינוי ל-frontend בסבב הזה.**

### ה. בדיקות — 9/9 PASS (קובץ חדש) + 11/11 PASS (רגרסיה, קובץ קיים)
`hamonym-backend/scripts/test-israel-invoices-tax-id.js` — **חדש**, עוקב אחרי הקונבנציה הקיימת בדיוק (`test-donation-cardcom-separation.js` הישן, שכבר קובע באופן מפורש: "לא להפעיל donation אמיתית בלי אישור" — לכן הבדיקה היא סריקת-מקור סטטית + שכפול-לוגי מבודד, לא הפעלה מלאה של `createDonation`):
1. סריקת מקור: ה-spread המותנה קיים בדיוק כצפוי.
2. סריקת מקור: `TaxId` לעולם לא נשלח ללא תנאי.
3. סריקת מקור: שאר שדות `Document` (To/Email/Phone/Mobile/Products) נשארו בדיוק כמו שהיו.
4. סריקת מקור: קובץ האימות (`checkout-v2.component.ts`) לא נגוע.
5. ת.ז תקין (9 ספרות) → `TaxId` מועבר בדיוק.
6. ח.פ-shaped (9 ספרות) → `TaxId` מועבר בדיוק, **בלי טיפול מיוחד** — מוכיח תמיכה-כפולה.
7/7a. זיהוי חסר (ריק/undefined) → מפתח `TaxId` נעדר לגמרי משני המקרים.
8. אין רגרסיה — שאר שדות ה-`Document` נכונים לצד `TaxId`.

**רגרסיה**: `test-donation-cardcom-separation.js` (הקובץ הקיים היחיד שבודק את האזור הזה) — **הורץ מחדש, 11/11 PASS**, ללא פגיעה.

### ו. מגבלות ידועות — איך לאמת מספר הקצאה בעתיד
- **שליחת `TaxId` אינה מוכיחה הנפקת מספר הקצאה בפועל.** ה-API של CardCom לא מחזיר שום אישור/ערך למספר-הקצאה ב-`LowProfile/Create` עצמו (אומת: אין שדה כזה בתגובה). אימות אמיתי ידרוש: (א) לבדוק עם CardCom/בדרישות Document שנוצר בפועל (למשל `GetDocument`/`DocumentSearchRequest`, שלא נבדקו לעומק בסבב הזה), ו/או (ב) לבדוק ישירות מול תיעוד/תמיכה של CardCom מה קורה בפועל כש-`TaxId` מועבר.
- **רק הזרימה הציבורית מושפעת** — תרומות recurring/token-charge ממשיכות דרך endpoint אחר (`/Transactions/Transaction`), שלפי בדיקה קודמת (FIN-11) **אין לו שדה `Document` בכלל** — אין הרחבה אפשרית לשם בלי לבדוק את ה-schema הזה בנפרד.
- **טופס הזנה ידנית נשאר ללא כיסוי** — ראה סעיף ג לעיל.
- **אין אימות עם ח.פ אמיתי** — ה-validator הקיים לא שונה ולא נבדק מול מספרי ח.פ אמיתיים.
