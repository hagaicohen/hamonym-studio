const { renderAdminAlert, formatTimestamp, opsDashboardUrl } = require('./_admin-alert');

// UI parity with admin-job-failed.js (2026-10-08): error as its own labeled
// block via errorDetail, and a real "פתיחת מסך התפעול" button via
// actionUrl/actionLabel instead of a raw URL inside the action sentence.

// Event E — webhook-recovery.job.js tried to re-process a stored CardCom
// webhook and gave up. Only the two give-up outcomes reach here (`failed`,
// `not_routed`); an event that was actually recovered sends nothing.
//
// SAFETY: the raw_payload is deliberately NOT rendered. A CardCom webhook
// body can carry donor identity and transaction detail; the email carries the
// cardcom_webhook_events row id so an operator can open the real row, plus
// the record type and the stored error string. No payload dump, no
// credentials, ever.
const ERROR_MAX = 300;

const OUTCOMES = {
  not_routed: {
    headline: 'עדכון מקארדקום לא נותב לאף מטפל',
    summary: 'התקבל עדכון מקארדקום מסוג שאין לו מטפל במערכת, ולכן הוא לא עובד. הנתון נשמר במלואו ואינו אובד — אך שום מצב במערכת לא התעדכן בעקבותיו.',
    action: 'לבדוק את סוג העדכון ולהחליט אם נדרש מטפל חדש או שמדובר בעדכון שאין צורך לעבד.',
  },
  failed: {
    headline: 'עדכון מקארדקום נכשל גם בניסיון ההשלמה',
    summary: 'עדכון שהתקבל מקארדקום נכשל בעיבוד, וגם ניסיון ההשלמה האוטומטי החוזר נכשל. ייתכן שמצב התרומה או הוראת הקבע במערכת אינו משקף את מה שקרה בקארדקום.',
    action: 'לבדוק את השגיאה, לתקן את המקור, ואז להפעיל מחדש את משימת ההשלמה.',
  },
};

module.exports = (data) => {
  const { webhookEventId, recordType, outcome, error, receivedAt, attemptedAt } = data;
  const spec = OUTCOMES[outcome] || OUTCOMES.failed;

  const { html, text } = renderAdminAlert({
    severity: data.severity || 'warning',
    headline: spec.headline,
    summary: spec.summary,
    facts: [
      { label: 'מזהה עדכון', value: webhookEventId },
      { label: 'סוג רשומה', value: recordType || 'LowProfile' },
      { label: 'תוצאה', value: outcome },
      { label: 'זמן קבלה', value: data.receivedAtDisplay || formatTimestamp(receivedAt) },
      { label: 'זמן ניסיון ההשלמה', value: data.attemptedAtDisplay || formatTimestamp(attemptedAt) },
    ],
    errorDetail: error ? String(error).slice(0, ERROR_MAX) : null,
    actionRequired: spec.action,
    actionUrl: opsDashboardUrl(),
    actionLabel: 'פתיחת מסך התפעול',
    note: 'התראה תפעולית אוטומטית הנשלחת פעם אחת לכל עדכון כזה, גם אם משימת ההשלמה תנסה אותו שוב.',
  });

  return { subject: 'נדרשת בדיקה: עדכון תשלום מקארדקום לא נקלט', html, text };
};
