# CardCom — Terminal Ownership Audit + Collection Adapter Research (2026-08-28)

**סטטוס:** ממצאי אודיט + מחקר תיעוד ציבורי. לא קוד, לא מיגרציה, לא commit. נכתב בעקבות שאלה מפורשת של המשתמש: לפני שממשיכים לבנות מעל `docs/HAMONYM_COLLECTION_ENGINE_DESIGN_2026-08-28.md`, להוכיח שהמודל הבסיסי — "טוקן העמותה נוצר ונטען תחת המסוף של Hamonym, לא של העמותה" — הוא מה שהמערכת בפועל עושה, לא רק מה שהיא מתכוונת לעשות.

**מסקנת-על:** האודיט חזר **PASS**. המחקר בתיעוד הציבורי של CardCom צמצם את מה שבאמת צריך לשאול את התמיכה לנקודה טכנית אחת וצרה.

---

## חלק א' — אודיט בעלות מסוף (קריאה בלבד)

### הדיאגרמה בפועל (לא הכוונה — מה שהקוד עושה)

```
תרומה:  Donor card ──► [entity.cardcom_terminal_number אם verified, אחרת HAMONYM_CARDCOM_TERMINAL] ──► עמותה (או חשבון פלטפורמה, ב-fallback)
עמלה:   Entity card ──► HAMONYM_CARDCOM_TERMINAL (תמיד, ללא יוצא מן הכלל) ──► Token ב-entity_billing ──► (עתידי) Collection מחייב אותו Token דרך אותו מסוף ──► Hamonym
```

### הממצאים לפי סעיף

**1. זרימת תרומה** (`donations.service.js:217-254, 342-349`, `recurring.service.js`)
`hasVerifiedCardcom` = לעמותה יש `cardcom_terminal_number`+`cardcom_api_username`+`cardcom_api_password_encrypted` **וגם** `cardcom_connection_status='success'`. אם כן — אלה הערכים שנשלחים ל-CardCom. אם לא — **fallback מפורש ומתועד בקוד עצמו** (2026-08-04) ל-`HAMONYM_CARDCOM_TERMINAL`/`HAMONYM_CARDCOM_API_NAME`/`HAMONYM_CARDCOM_API_PASSWORD`. הערת הקוד: *"Funds land in the platform's own account in that case, not the entity's — settlement to the entity is a separate, manual step for now."*

**2. זרימת `entity_billing`/OpenFields** (`cardcom.service.js#createOpenFieldsLowProfile`, `billing.service.js#createBilling`/`getLowProfileResult`)
כל שלוש הקריאות ל-CardCom במודול הזה שולחות `TerminalNumber`/`ApiName`/`ApiPassword` **תמיד ורק** מ-`process.env.HAMONYM_CARDCOM_TERMINAL`/`HAMONYM_CARDCOM_API_NAME`/`HAMONYM_CARDCOM_API_PASSWORD`. **הוכחה, לא הסקה**: אין בקבצים האלה שום שאילתה או תנאי שתלוי ב-`entities.cardcom_terminal_number`. ה-Token שחוזר (`TokenInfo.Token`/`Token`/`CardToken`/`TranzactionInfo.Token`) נשמר ב-`entity_billing.token` — נוצר תחת חשבון Hamonym.

**3. מה שמור ב-`entity_billing`**
`token`, `last4`, `exp_month`, `exp_year`, `card_holder_name`, `provider`, `is_default`, `status`. אין עמודת terminal על השורה — תקין, כי יש מסוף Hamonym קבוע אחד, אין צורך לשמור "איזה מסוף" per-row. `Hamonym terminal + entity token + Statement.total_due` מספיק לחיוב עתידי.

**4. בדיקת ערבוב בין שני ההקשרים**
| תרחיש | נמצא? |
|---|---|
| קרדנציאלס-תרומה-של-עמותה נכנסים ל-`entity_billing` | ❌ לא נמצא |
| קרדנציאלס Hamonym משמשים לתרומות רגילות | ⚠️ **כן — אבל כ-fallback מכוון ומתועד**, לא ערבוב בטעות (ראו סעיף 5) |
| Token של תרומה נעשה בו שימוש חוזר לחיוב Hamonym | ❌ לא נמצא |
| Token של `entity_billing` מועבר למסוף עמותה | ❌ לא נמצא |

**5. אותו משתנה סביבה, שני תפקידים — flag לטיפול נפרד**
`HAMONYM_CARDCOM_*` משרת גם fallback לעיבוד תרומות אמיתיות (עמותה בלי מסוף מאומת) וגם את מנגנון גביית העמלה מהעמותה. עמותה בלי מסוף משלה — כספי התרומות שלה עוברים כרגע דרך אותו חשבון סוחר פיזי שדרכו Hamonym עתידה לגבות ממנה עמלה. **לא פוסל את Collection**, אבל דורש בעתיד החלטה עסקית/חשבונאית נפרדת: האם בכלל לאפשר לעמותה בלי מסוף מאומת לקבל תרומות דרך מסוף Hamonym. **הוחלט (המשתמש, 2026-08-28): לתעד כפריט פתוח, לא לשנות כחלק מ-Collection.**

**6. שגיאת 603**
אומת: השגיאה (`billing.service.js#createBilling`/`getLowProfileResult`) נוצרה תוך שימוש ב-`HAMONYM_CARDCOM_TERMINAL`/`HAMONYM_CARDCOM_API_NAME`/`HAMONYM_CARDCOM_API_PASSWORD` — בדיוק המסוף שישמש את Collection. רלוונטי ישירות ל-Collection, לא בעיה נפרדת. פירוט ראו חלק ב'.

### מסקנה פורמלית: **PASS**

> "האם `entity_billing` יוצר את ה-Token תחת מסוף Hamonym או תחת מסוף העמותה" — **הוכח, לא הוסק**: מסוף Hamonym, תמיד. **אין צורך לחזור אחורה ל-`entity_billing`.**

המודל המסחרי המיועד ל-Collection מאושר:

```
Entity payment card → token owned by Hamonym CardCom terminal → Hamonym terminal charges platform fee → Hamonym
```

ה-fallback של תרומות (סעיף 5) הוא נושא נפרד — תועד, לא טופל כחלק מ-Collection.

---

## חלק ב' — מחקר תיעוד ציבורי של CardCom (ללא פנייה לתמיכה)

מקורות: Swagger v11 הרשמי (`secure.cardcom.solutions/swagger/v11/swagger.json`), SDK קוד-פתוח (`MosheRivkin/cardcom-ts-sdk`), חיפוש ציבורי. **לא בוצעה פנייה לתמיכה. לא מומש אדפטר.**

### טבלת ראיות

| # | שאלה | תשובה מתועדת | מקור | אי-ודאות שנותרה |
|---|---|---|---|---|
| 1 | חוזה חיוב Token מדויק | `POST /api/v11/Transactions/Transaction` (לא `LowProfileChargeToken` — זה שם endpoint ישן/צד-שלישי). Body: `TerminalNumber`, `ApiName`, `Amount`, `Token` (GUID, לדוגמה `84cc1f4f-c089-410b-9f93-6437ac9abba6`). Response: `TransactionInfo` עם `ResponseCode`+`Description` (אותה קונבנציה כמו `GetLpResult` הקיים). | Swagger v11 הרשמי | האם `CardExpirationMMYY`/`CVV2` נדרשים גם במצב חיוב-טוקן טהור או רק בחיוב-כרטיס-גולמי — הסכימה המלאה של `TransactionReq` לא נשלפה במלואה |
| 2 | האם `entity_billing.token` בפורמט הנכון | Token לדוגמה בתיעוד = GUID. שליפת הטוקן בקוד הקיים (`billing.service.js`) תואמת סבירות ל-GUID. | היסק בין תיעוד לקוד קיים | אין עדיין Token אמיתי בטבלה (0 שורות) להשוואה בפועל |
| 3 | האם ה-credentials של `entity_billing` מתאימים | 603 היא שגיאת אימות גולמית ("שם משתמש או סיסמה שגויים") — לא שגיאת הרשאה-לפעולה ולא קונפיגורציית-מסוף. אותם credentials נכשלו כבר בקריאה בסיסית (`GetLpResult`). | תגובת CardCom בפועל | לא ידוע אם סיסמה שגויה סתם, טרמינל לא קיים, או חשבון לא מופעל — דורש גישה לחשבון/תמיכה |
| 4 | `UniqAsmachta`/`UniqAsmachtaReturnOriginal` | **לא מופיעים כלל ב-Swagger v11** — חיפוש טקסטואלי מלא, שלילי. | Swagger v11, חיפוש שלילי מאומת | כנראה שדות מה-API הישן (Name-to-Value v10 — אותה משפחה כמו `recurring.client.js` הקיים) או מ-API החשבוניות — לא אומת היכן |
| 5 | Idempotency בחיוב | נמצא מועמד: `ExternalUniqTranId`. | Swagger v11 (חלקי) | **הנקודה המרכזית שנותרה פתוחה** — האם זה שדה חופשי-קביעה-שלנו *בבקשת החיוב עצמה*, או רק פרמטר לשליפה החוזרת (#6) |
| 6 | פישוק עמימות אחרי timeout בלי `InternalDealNumber` | **נמצא endpoint ייעודי**: `POST /api/v11/Transactions/GetTransactionByExternalUniqTran`. תיאור רשמי מילולי: *"use to validate if there is a successful transaction using the External UniqTranId parameter."* | Swagger v11 הרשמי | תלוי בפתרון #5 |
| 7 | Lookup API לפי מזהה שלנו | נפתר ע"י אותו endpoint כמו #6 — אין צורך ב-endpoint נוסף. | Swagger v11 הרשמי | ראו #5/#6 |
| 8 | שדות הצלחה/כשל לשמירה ב-`collection_attempts`/`payments` | `ResponseCode`, `Description`, `TranzactionId` (אותה קונבנציה כמו `GetLpResult` הקיים), כנראה גם `ApprovalNumber`. | Swagger v11 (חלקי) + עקביות עם קוד קיים | הסכימה המלאה של `TransactionInfo` לא נשלפה שדה-שדה |

### אפיון 603
לא ניתן לפענח מספרית מתיעוד ציבורי (אין טבלת קודי-שגיאה חשופה ב-Swagger) — **אבל זה לא נדרש**: CardCom עצמה כבר החזירה טקסט מפורש "שם משתמש או סיסמה שגויים". כשל אימות גולמי, לא כשל הרשאה-לפעולה ולא כשל קונפיגורציית-מסוף. לא שונו סודות/credentials.

### המסקנה
השאלה שנותרה ל-CardCom — אם בכלל — צומצמה לנקודה טכנית אחת: **האם `ExternalUniqTranId` הוא שדה חופשי שאנחנו קובעים בבקשת `Transactions/Transaction` עצמה** (ואז `GetTransactionByExternalUniqTran` פותר את מניעת-החיוב-הכפול במלואו מהתיעוד הציבורי), **או רק פרמטר לשליפה** (ואז נדרש מנגנון נפרד ליצירת מפתח ה-idempotency). 603 היא בעיה נפרדת ומיידית יותר — טעונה טיפול מול CardCom/החשבון לפני כל בדיקת חיוב אמיתית, בלי קשר לשאלת ה-API.

**לא מומש אדפטר (במקור). לא נשלחה פנייה לתמיכה.**

---

## חלק ג' — סגירת הפער: CVV2, ExternalUniqTranId, ומימוש האדפטר (2026-08-29)

**סטטוס:** האדפטר מומש. סעיף זה מתעד את הראיות שסגרו את השאלה הפתוחה היחידה מחלק ב' (סעיף 9.1) ואת מה שנבנה בעקבותיה. קריאה בלבד בוצעה מול Swagger v11 הרשמי (סכימות ממוקדות בלבד, לא כל הקובץ) ומול שני מקורות CardCom רשמיים נוספים שנשלפו ישירות דרך ה-Zendesk Help Center Public API (קריאה בלבד, ללא עקיפת הרשאות — endpoint ציבורי לתוכן מפורסם):

1. `support.cardcom.solutions` article 360002653694 — "מסופי הוראת קבע - ללא דרישה ל CVV".
2. `cardcomapi.zendesk.com` article 28452352778770 — "Step 3 – Token Charging / Frame Capture / Direct Interface Credit Card Charging (Do Transaction)" — **המקור הקובע**, כולל טבלת פרמטרים מלאה ל-`Transactions/Transaction`.

### CVV2 — נפתר סופית

מהמקור הקובע (Do Transaction, טבלת פרמטרים רשמית):

> "Note: For token charging, the terminal must not require CVV from credit companies. Such a terminal does not verify the card's expiry date (only requires it to be in the future), does not check CVV, and ID verification is optional depending on the agreement with the credit company."
>
> "Requirements & Necessary models: Terminal without CVV requirement – for the token model. Token model – for token charging and refunding."

בטבלת הפרמטרים עצמה: `CVV2` מופיע כפרמטר **רגיל (לא red/bold)** = אופציונלי, לעומת `CardExpirationMMYY` שמסומן במפורש **"mandatory"** בטור התיאור (למרות ש-nullable ב-OpenAPI — בדיוק המקרה שהמשימה הזהירה מפניו: nullable לבד לא מספיק, וכאן יש הוכחה מפורשת בתיעוד לכיוון ההפוך מהניחוש הנאיבי).

מקור תומך נוסף (`support.cardcom.solutions` 360002653694, מצוטט מילולית):
> "לפי תקן PCI אסור לאף אחד לשמור את ה-3 ספרות בגב הכרטיס (CVV) חוץ מחברת האשראי עצמה. לכן בעסקה הראשונית... מחזיק הכרטיס מזין אותו בפעם הראשונה... לאחר מכן הפרטים מוצפנים אצלנו דרך אסימון... ונשלחים לחיוב חוזר אבל כמובן כבר ללא ה-CVV... כאשר הסליקה היא בקארדקום לא חייב 2 מסופים בשביל סליקת הוראות קבע כי הסליקה בקארדקום היא בלי דרישת CVV ותז."

**מסקנה:** CVV2 **לא נדרש** לחיוב Token — בתנאי ש-**המסוף עצמו מוגדר על ידי CardCom כמסוף "מודל טוקן / ללא דרישת CVV"**. זו לא תכונה אוטומטית של כל מסוף — היא הסדר שנעשה מול CardCom (ראו "הגשת בקשה למסוף ללא חובת CVV" במקור התומך). **תנאי מקדים לא מאומת עדיין**: האם `HAMONYM_CARDCOM_TERMINAL` בפועל מוגדר ככזה. זה נקשר ישירות לחקירת שגיאת 603 הקיימת — כשהגישה לחשבון תתאפשר, יש לוודא זאת מול CardCom/לוח הבקרה כחלק מפתרון 603, לא כפריט נפרד. **זו אינה חסימה ארכיטקטונית** (entity_billing כבר לא שומר CVV, וזה נכון) — זו נקודת אימות תפעולית שכבר משויכת ל-603.

### תגלית נוספת: `ExternalUniqTranIdResponse`

מטבלת הפרמטרים הרשמית: שדה `ExternalUniqTranIdResponse` (boolean, default `false`) קובע את ההתנהגות בשליחה חוזרת של אותו `ExternalUniqTranId`:
- `false` (ברירת מחדל) → שגיאה 608.
- `true` → **לא מחייב את הכרטיס שוב, אלא מחזיר את תגובת העסקה המקורית**.

לא נעשה בו שימוש במימוש הנוכחי (סעיף הבא) — האדפטר מטפל ב-608 דרך `reconcile()`/`GetTransactionByExternalUniqTran` בהתאם לעיצוב הקיים, לא דרך הדגל הזה. תועד כאפשרות עתידית לפישוט, לא מומש כדי לא לשנות את מנגנון ה-ambiguity המאושר בלי צורך.

### מיפוי מדויק — `TransactionReq` (Do Transaction)

נדרשים לפי הסכימה הרשמית: `TerminalNumber`, `ApiName`, `Amount` בלבד. `additionalProperties: false`.

| שדה ב-collection_attempts/billing | שדה CardCom | הערה |
|---|---|---|
| `HAMONYM_CARDCOM_TERMINAL` | `TerminalNumber` | |
| `HAMONYM_CARDCOM_API_NAME` | `ApiName` | |
| `statements.total_due` (בזמן פתיחת הניסיון) | `Amount` | |
| `entity_billing.token` | `Token` | |
| `entity_billing.exp_month`+`exp_year` | `CardExpirationMMYY` | בנוי הגנתית (ראו קוד) — CardCom `TokenInfo.CardYear` הוא integer, לא אומת אם דו-ספרתי או ארבע-ספרתי (0 שורות אמיתיות ב-entity_billing עד כה) |
| `collection_attempts.id` | `ExternalUniqTranId` | מאושר, ר' חלק ב' |
| — | `CVV2` | **לא נשלח בכוונה** |
| — | `ApiPassword` | **לא קיים כלל ב-`TransactionReq` העליון** — קיים רק תחת `Advanced.ApiPassword`, ונדרש רק אם `IsRefund=true`. שליחתו ב-top-level תידחה (`additionalProperties:false`) |

### מיפוי מדויק — `TransactionInfo` (תגובה)

`ResponseCode` (0=הצלחה), `Description`, `TranzactionId` (int64 → `payments.provider_reference`/`collection_attempts.provider_reference` כ-string), `ApprovalNumber`. אין צורך בשדות נוספים לצורך Collection Phase הנוכחי (הרחבה עתידית: `Last4CardDigitsString`, `Brand`, `CardName` — לא נדרשים כרגע, `entity_billing.last4` כבר קיים בנפרד).

### זהות עסקה קנונית ל-`payments.provider_reference`

`TranzactionId` (int64) — זהה מבחינת קונבנציה ל-`GetLpResult` הקיים בקוד התרומות. **Scope של הייחודיות לא מתועד בשום מקום ב-Swagger** (גלובלי מול per-terminal) — `payments` כבר מגן נכון (`UNIQUE (provider, provider_reference)`, לא רק `provider_reference` לבדו), כך שאין הנחה חזקה מדי אם ה-scope בפועל הוא per-terminal.

### תיקון תקלה שנחשפה באודיט מקור הטוקן (task 3, לא CVV2)

`billing.service.js#createBilling` (חילוץ הטוקן): שרשרת ה-fallback המקורית כללה `result?.Token || result?.CardToken` — **שני שדות שלא קיימים כלל בסכימת `LowProfileResult` הרשמית** (ל-`LowProfileResult` יש `additionalProperties:false`; המקומות היחידים לטוקן הם `TokenInfo.Token` ו-`TranzactionInfo.Token`). הוסרו — קוד מת שלא היה יכול להיכשל בפועל, אבל מטעה. תוקן, ר' commit.

`cardcom.service.js#createOpenFieldsLowProfile`: השדה `Operation: 'CreateToken'` **אינו ערך חוקי** ב-enum הרשמי (`ChargeOnly | ChargeAndCreateToken | CreateTokenOnly | SuspendedDeal | Do3DSAndSubmit`). תוקן ל-`CreateTokenOnly` (התואם את הכוונה: `Amount:1` + `CreateToken:true`, בלי חיוב אמיתי). **לא אומת אם התקלה הזו הייתה גורמת בפועל לכשל אצל CardCom** — entity_billing עדיין 0 שורות, ו-603 חוסם כל בדיקה אמיתית ממילא — אבל זו תקלה מוכחת מול הסכימה, לא ניחוש, ותוקנה כתיקון מכני.

### מסקנה סופית (2026-08-28)

**אין חסם ארכיטקטוני נוסף.** CVV2 אינו נדרש לחיוב Token והמודל הקיים (entity_billing בלי CVV) תקין ומתאים. שגיאת 603 נותרת חוסם תפעולי יחיד — וכעת יש לה תוספת קונקרטית לבדוק כשהגישה תתאפשר: לוודא ש-HAMONYM_CARDCOM_TERMINAL מוגדר כמסוף "מודל טוקן / ללא CVV" אצל CardCom. **האדפטר מומש** (`src/modules/collection-engine/adapters/cardcom-token-charge.adapter.js`) עם בדיקות מוקיות (mocked HTTP, `scripts/test-cardcom-token-charge-adapter.js`) — לא בוצעה ולא נדרשה שום קריאה אמיתית ל-CardCom.

---

## חלק ד' — אימות אמפירי חי מול CardCom האמיתית (2026-08-30)

כל מה שחלק ג' ניבא מהתיעוד — **אומת בפועל**, לא רק בתיעוד: 603 נפתר (רוטציית credentials אצל CardCom), token אמיתי נוצר דרך OpenFields (פעולה ידנית, לא ניתנת לאוטומציה), וחיוב Token אמיתי של ₪1 בוצע מול טרמינל `1000` **בלי לשלוח CVV2 בכלל** — הצליח (`ResponseCode:0`, `TranzactionId:260726786`). `GetTransactionByExternalUniqTran` עם אותו `ExternalUniqTranId` (`91a053f1-ae81-4323-b101-d8a9b62f9002`) החזיר **את אותו `TranzactionId` בדיוק**. פרטים מלאים ב-`docs/BILLING_ENGINE_SESSION_HANDOFF_2026-08-28.md`, סעיף MILESTONE UPDATE.

**מה שזה סוגר אמפירית (לא רק תיעודית):** מודל "מסוף מודל-טוקן לא דורש CVV" — נכון **בפועל על הטרמינל הספציפי הזה** (`1000`), לא רק לפי תיעוד CardCom הכללי. **מה שזה לא סוגר:** האם `1000` הוא מסוף הדמו הציבורי של CardCom או מסוף Hamonym ייעודי — הצלחת חיוב לא מבחינה בין השניים; זו שאלה נפרדת (חשבונאית/ארכיטקטונית), לא רלוונטית לתפקוד ה-Collection עצמו.

**האדפטר עודכן מ-mock-tested ל-live-verified.** בנוסף, מנגנון Recovery Orchestration (`src/jobs/collection-attempt-reconciliation.job.js`) מומש כדי ש-`adapter.reconcile()` לא יישאר פונקציה קריאה בלבד — ר' handoff לפרטים.
