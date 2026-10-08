const { renderAdminAlert, formatTimestamp, opsDashboardUrl } = require('./_admin-alert');

// Events C / D / F / G — one template for every alert whose durable evidence
// is a `reconciliation_findings` row, because they share the same shape
// (severity, finding type, one subject object, found-at, open/closed) and the
// same operator workflow (open the finding in the Platform ops screen, decide,
// mark resolved). What differs is the wording, and that lives HERE rather than
// in the jobs/handlers: the business code passes raw safe values only.
//
// An unknown finding_type still renders — generic wording, every fact shown —
// rather than throwing or silently dropping an alert.
const FINDING_SPEC = {
  // C — payment.handler.js::holdForVerification. Deliberately says only what
  // Gate v1 itself establishes: the donation is HELD (status unchanged, no
  // receipt, no campaign increment). Whether the donor's card was actually
  // charged at CardCom is exactly what is in dispute, so it is never claimed
  // in either direction — the `reasons` list is the evidence.
  gate_v1_mismatch: {
    subject: 'נדרשת בדיקה: תשלום לא הותאם',
    headline: 'תרומה נעצרה לאימות — אי-התאמה מול קארדקום',
    summary: 'שער האימות (Gate v1) זיהה אי-התאמה בין נתוני התשלום שהתקבלו לבין הנתונים השמורים. התרומה נותרה במצב המתנה: לא הונפקה קבלה, לא עודכן סכום הקמפיין, ולא בוצעה כל פעולה אוטומטית. מצב החיוב בקארדקום עצמו אינו נקבע על ידי בדיקה זו וטעון בדיקה ידנית.',
    action: 'לבדוק את העסקה מול קארדקום ולהחליט ידנית — אין להסתמך על השלמה אוטומטית.',
    facts: (d) => [{ label: 'סיבות האי-התאמה', value: Array.isArray(d.reasons) ? d.reasons.join(', ') : d.reasons }],
  },

  // D — stale-pending-donations.job.js. No LowProfileId was ever persisted,
  // so CardCom cannot be queried by any key; not auto-recoverable.
  pending_donation_missing_low_profile_id: {
    subject: 'נדרשת בדיקה: תרומה ממתינה ללא מזהה עסקה',
    headline: 'תרומה ממתינה שאין אפשרות לבדוק מול קארדקום',
    summary: 'התרומה נותרה במצב המתנה ולא נשמר עבורה מזהה עסקה (LowProfileId), ולכן אין מפתח לשאול עליה את קארדקום. המערכת אינה יכולה להשלים או לשלול את התשלום לבד, ואינה מניחה דבר לגבי חיוב בפועל.',
    action: 'לבדוק ידנית בממשק קארדקום לפי מועד וסכום, ולעדכן בהתאם.',
    facts: (d) => [
      { label: 'קמפיין', value: d.campaignId },
      { label: 'עמותה', value: d.entityId },
      { label: 'גיל התרומה (שעות)', value: d.ageHours },
    ],
  },

  // F — stuck-recurring-signups.job.js. Detect-only by design: no repair is
  // attempted anywhere in this path, and the email must not imply one.
  stuck_recurring_signup: {
    subject: 'נדרשת בדיקה: הוראת קבע לא הושלמה',
    headline: 'תשלום הוראת קבע נקלט אך ההרשמה לא הושלמה',
    summary: 'קיימת תרומה במצב שולם שמקושרת להוראת קבע שנשארה במצב ביניים. המערכת אינה מנסה להשלים את ההרשמה אוטומטית — ניסיון כזה עלול ליצור הוראה כפולה אצל התורם.',
    action: 'לבדוק מול קארדקום אם ההוראה אכן נוצרה, ולהשלים או לבטל ידנית בלבד.',
    facts: (d) => [
      { label: 'מצב ההוראה', value: d.instructionStatus },
      { label: 'תרומה משולמת מקושרת', value: d.paidDonationId },
      { label: 'עמותה', value: d.entityId },
    ],
  },

  // G — master-recurring.handler.js::resolveInactiveStatus. CardCom reports
  // exactly one signal (IsActive=false) and no reason; natural completion is
  // ruled out deterministically before this finding is ever recorded. So the
  // only honest statement is "it became inactive and we do not know why".
  recurring_unexplained_inactive: {
    subject: 'נדרשת בדיקה: הוראת קבע הפכה ללא פעילה',
    headline: 'הוראת קבע הפכה ללא פעילה מצד קארדקום — ללא סיבה מדווחת',
    summary: 'קארדקום דיווחה שההוראה אינה פעילה עוד, בשינוי שלא נבע מפעולה של המונים (לא הושעתה, לא בוטלה ולא הסתיימה במספר התשלומים שנקבע). קארדקום אינה מדווחת סיבה, ולכן הסיבה אינה ידועה ואינה משוערת כאן.',
    action: 'לבדוק את ההוראה בממשק קארדקום ולקבוע אם מדובר בתקלת אמצעי תשלום, בהחלטה של התורם או בהחלטה של קארדקום.',
    facts: (d) => [
      { label: 'מצב קודם במערכת', value: d.previousStatus },
      { label: 'מזהה הוראה בקארדקום', value: d.cardcomRecurringId },
      { label: 'עמותה', value: d.entityId },
      { label: 'קמפיין', value: d.campaignId },
    ],
  },
};

const GENERIC = {
  subject: 'נדרשת בדיקה: ממצא תפעולי חדש',
  headline: 'נרשם ממצא תפעולי חדש',
  summary: 'נרשם ממצא תפעולי שדורש בדיקה. לא בוצעה פעולה אוטומטית מתקנת.',
  action: 'לבדוק את הממצא במסך התפעול.',
  facts: () => [],
};

module.exports = (data) => {
  const { findingId, findingType, jobName, subjectType, subjectId, foundAt, details = {} } = data;
  const spec = FINDING_SPEC[findingType] || GENERIC;

  const { html, text } = renderAdminAlert({
    severity: data.severity || 'warning',
    headline: spec.headline,
    summary: spec.summary,
    facts: [
      { label: 'סוג ממצא', value: findingType },
      { label: 'מזהה ממצא', value: findingId },
      { label: 'מקור הזיהוי', value: jobName },
      { label: `מזהה ${subjectType === 'donation' ? 'תרומה' : subjectType === 'recurring_instruction' ? 'הוראת קבע' : subjectType || 'אובייקט'}`, value: subjectId },
      { label: 'זמן זיהוי', value: data.foundAtDisplay || formatTimestamp(foundAt) },
      ...spec.facts(details),
    ],
    actionRequired: spec.action,
    actionUrl: opsDashboardUrl(),
    actionLabel: 'פתיחת מסך התפעול',
    note: 'התראה תפעולית אוטומטית הנשלחת פעם אחת לכל ממצא פתוח. סימון הממצא כטופל נעשה במסך התפעול.',
  });

  return { subject: spec.subject, html, text };
};
