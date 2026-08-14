# PAYMENTS_ARCHITECTURE_CONTEXT.md — Hamonym Payments Architecture

**סטטוס:** v1 — Architecture Compass, נעול. **Charging Engine (LowProfile) ממומש ומוכח בפרודקשן** מ-2026-08-11 — ר' `docs/CARDCOM_INTEGRATION.md` לפרטים. Billing Engine (Tranzila MASAV) טרם ממומש.
**תאריך:** 2026-08-07

**מטרת המסמך:** גבולות אחריות, זרימות עבודה ועקרונות ארכיטקטוניים לתחום הכספים — לא UI, לא API לפרטי פרטים. זהו מסמך "compass": ברירת המחדל היא לתכנן מימוש בתוך הגבולות שהוא מתאר, לא לבקר או להשלים אותו ביוזמה.

---

## Scope

מסמך זה מגדיר את הארכיטקטורה של תחום הכספים ב-Hamonym.

הוא אינו מגדיר:

* UI / UX.
* REST API Contracts.
* Database Schema.
* ספק סליקה מסוים מעבר לגבולות האחריות שלו.
* Business Rules מפורטים (לדוגמה אחוזי עמלה).

מסמכים אלה יתועדו בנפרד.

---

## Overview

מערכת הכספים של Hamonym מורכבת משני מנועים נפרדים לחלוטין:

1. **Charging Engine** – אחראי על גביית תרומות מהתורמים.
2. **Billing Engine** – אחראי על גביית עמלת Hamonym מהעמותות.

אין לערבב ביניהם.

---

## Context Diagram

```text
                        Donor
                          │
                          ▼
                   Charging Engine
                          │
                          ▼
                       CardCom
                          │
          ┌───────────────┴───────────────┐
          │                               │
      Webhooks                      Settlement
          │                               │
          ▼                               ▼
      Hamonym DB                    Organization

                          │
                          ▼
                   Billing Engine
                          │
                          ▼
                    Tranzila MASAV
                          │
                          ▼
                    Hamonym Revenue
```

---

# Engine 1 – Charging Engine

## Purpose

ניהול מחזור החיים המלא של תרומה, החל מלחיצה על "תרום" ועד לעדכון נתוני הקמפיין.

## Responsibility

המנוע אחראי על:

* יצירת Checkout.
* שליחת המשתמש ל-CardCom.
* קבלת אירועים מ-CardCom.
* עדכון מסד הנתונים.
* עדכון הקמפיין.
* עדכון Dashboard.
* יצירת Donation במערכת.

המנוע **אינו מחייב אשראי בעצמו**.

CardCom מבצעת את הסליקה.

---

## Source of Truth

**CardCom is the operational source of truth for payment execution and recurring billing status. Hamonym maintains its own business model derived from those events.**

---

## Integration

Hamonym מתקשרת עם CardCom באמצעות:

* Checkout API
* DoTransaction
* GetLpResult
* Webhooks

---

## סוגי האירועים שנשלחים מ-CardCom

### 1. Payment (Low Profile)

עסקה חד־פעמית.

מטרת האירוע:

להודיע שתהליך התשלום הסתיים.

לאחר קבלת האירוע יש לבצע GetLpResult ולקחת ממנו את נתוני העסקה.

---

### 2. MasterRecurring

אירוע הקשור להוראת הקבע עצמה.

לדוגמה:

* נוצרה הוראת קבע חדשה.
* ההוראה הפכה ל-Active.
* ההוראה הפכה ל-Inactive.

זה **אינו** חיוב כספי.

זהו שינוי בישות Recurring Payment.

---

### 3. DetailRecurring

אירוע הקשור לחיוב חודשי בפועל.

CardCom שולחת אירוע עבור כל חיוב או שינוי סטטוס של חיוב.

לדוגמה:

* SUCCESSFUL
* PENDINGFORPROCESSING
* DEBTAUTOBILLING
* LOSTDEBT
* PAYBYOTHERE
* ONHOLD

כל אירוע כזה מתייחס לניסיון גבייה מסוים.

---

### 4. Document Notifications

אם מופעל Webhook למסמכים,

CardCom יכולה לדווח על יצירת:

* Receipt
* Invoice
* Credit Document

---

## Webhooks

כל Webhook מתקבל באמצעות HTTP POST.

במסוף CardCom מוגדרת כתובת ה-POST.

יש להשתמש ב-Secret לצורך אימות.

---

## Recommended Internal Flow

```text
CardCom

↓

Webhook

↓

Validate Secret

↓

Idempotency Check

↓

Audit Log

↓

Business Handler

↓

Update Database

↓

Publish Domain Events

↓

Update Dashboard
```

---

## Internal Model

The Charging Engine manages the following domain entities:

* Transaction
* Recurring Payment
* Recurring Charge
* Document

Each entity has its own lifecycle and must not be merged with another entity.

---

# Engine 2 – Billing Engine

## Purpose

גביית עמלת Hamonym מהעמותות.

המנוע אינו קשור לתרומות של התורמים.

---

## Responsibility

Billing Engine אחראי על:

* חישוב העמלה.
* סגירת מחזור חיוב.
* יצירת קובץ מס"ב.
* שליחת קובץ ל-Tranzila.
* מעקב אחר תוצאות הגבייה.
* הפקת מסמכים חשבונאיים.

---

## Source of Truth

מקור האמת הוא סכומי התרומות שנגבו בפועל.

אין לגבות עמלה על תרומות שלא נגבו.

---

## MASAV

גביית העמלה אינה מתבצעת דרך CardCom.

היא מתבצעת באמצעות **Tranzila MASAV**.

---

## Monthly Flow (Architecture)

בכל סגירת מחזור:

1. לחשב את סך התרומות שנגבו בפועל.
2. לחשב את עמלת Hamonym.
3. ליצור קובץ מס"ב.
4. לשלוח אותו ל-Tranzila.
5. לעקוב אחר סטטוס הגבייה.
6. להפיק חשבונית במידת הצורך.

זוהי הזרימה הארכיטקטונית — **בלי תאריכים קבועים**. התאריכים המדויקים הם קונפיגורציה עסקית, ראו סעיף נפרד למטה.

---

## Current Business Billing Cycle

> המחזור העסקי הנוכחי של Hamonym הוא:
>
> * 28 בחודש – סגירת מחזור חיובים.
> * 6–7 בחודש – כספי הסליקה צפויים להגיע לעמותה.
> * 7 בחודש – שליחת מס"ב באמצעות Tranzila.
>
> אלו הם פרמטרים עסקיים הניתנים לשינוי, ואינם חלק מהארכיטקטורה של המנוע.

אם בעוד שנתיים ה-28 ישתנה ל-25 — זה עדכון של מחזור העבודה העסקי, לא שינוי ארכיטקטורה.

---

## Required Organization Data

כל עמותה צריכה להגדיר:

* Bank
* Branch
* Account Number
* MASAV Authorization
* Authorization PDF

---

# Architecture Principles

## Engine Ownership

| תחום | Charging Engine | Billing Engine |
|---|:---:|:---:|
| Checkout / Payment Pages | ✅ | ❌ |
| תורמים | ✅ | ❌ |
| הוראות קבע | ✅ | ❌ |
| Webhooks מ-CardCom | ✅ | ❌ |
| Dashboard של קמפיין | ✅ | ❌ |
| קבלות לתרומות (כחלק מתהליך התרומה) | ✅ | ❌ |
| חישוב עמלות | ❌ | ✅ |
| סגירת מחזור חודשי | ❌ | ✅ |
| יצירת קובץ מס"ב | ❌ | ✅ |
| Tranzila MASAV | ❌ | ✅ |
| גביית עמלה מהעמותה | ❌ | ✅ |
| דוחות וחשבוניות עמלה | ❌ | ✅ |

כך לא נשאר ספק לאיזה מנוע שייך כל פיצ'ר.

---

## Separation of Concerns

Charging Engine אינו מכיר MASAV.

Billing Engine אינו מכיר Checkout.

כל מנוע אחראי על תחום אחד בלבד.

---

## Engine Independence

שני המנועים פועלים באופן עצמאי.

* Charging Engine יכול להמשיך לפעול גם אם Billing Engine מושבת.
* Billing Engine אינו משתתף בתהליך התרומה בזמן אמת.
* נקודת החיבור היחידה ביניהם היא נתוני התרומות שנגבו בפועל, המשמשים את Billing Engine לחישוב העמלות.

עיקרון זה מונע מצב שבו מישהו "יקצר דרך" ויחבר בין המנועים בצורה שתיצור תלות מיותרת.

---

## External Systems Own Their Domain

Hamonym אינה משכפלת אחריות של מערכות חיצוניות.

CardCom אחראית על:
* סליקה
* הוראות קבע
* Tokens

Tranzila אחראית על:
* מס"ב

Hamonym אחראית על:
* Business Logic
* Campaigns
* Donations
* Billing
* Reporting

כאשר קיימת יכולת מובנית אצל ספק חיצוני, יש להעדיף שימוש בה על פני פיתוח מנגנון מקביל בתוך Hamonym, אלא אם קיימת סיבה עסקית או טכנית ברורה לעשות אחרת.

---

## Event Driven

כל אירוע שמגיע מ-CardCom מטופל כאירוע מערכת.

Polling אינו חלק מהזרימה הרגילה. ניתן להשתמש ב-Reconciliation Jobs לצורך איתור פערים או התאוששות מתקלות.

---

## Audit

יש לשמור כל Webhook שהתקבל לפני כל עיבוד עסקי.

---

## Idempotency

כל Webhook חייב להיות ניתן לעיבוד חוזר ללא יצירת כפילויות.

---

## Open Questions

### CardCom

* Pause / Resume.
* Cancel Recurring.
* Token Replacement.
* Chargeback.
* Refund Flow.
* Split Payments.
* Digital Wallet.

### Business Design

* Donation Lifecycle
* Refund Policy
* Failed Donation Policy
