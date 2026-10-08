const { renderAdminAlert, formatTimestamp, opsDashboardUrl } = require('./_admin-alert');

// Event B — the timing mechanism itself. Two scopes, one template, because
// the operator question is identical ("are the scheduled safeguards actually
// running?") and the wording differs only in what went quiet:
//   scope='scheduler' — the Render Cron trigger's own heartbeat row
//     (cron-entry.js) is older than tolerance: NOTHING is running.
//   scope='job'       — the trigger is alive but one specific job has not
//     succeeded within 2x its own schedule interval.
// Both come from the same detection functions the Platform Admin health
// screen uses (src/modules/platform/cardcom-ops/ops-health.js), so the email
// and the dashboard can never disagree about what "stale" means.
module.exports = (data) => {
  const {
    scope, jobName, minutesSinceLastHeartbeat, lastHeartbeatAt,
    minutesSinceLastSuccess, lastSuccessAt, toleranceMinutes,
  } = data;

  const isScheduler = scope !== 'job';

  const headline = isScheduler
    ? 'מנגנון התזמון אינו מדווח על ריצה'
    : `משימה מתוזמנת אינה רצה בהצלחה: ${jobName}`;

  const summary = isScheduler
    ? 'לא התקבל דיווח ממנגנון התזמון (Render Cron) בפרק הזמן הצפוי. ייתכן שמשימות הרקע התלויות במנגנון זה אינן פועלות כסדרן ונדרשת בדיקה.'
    : 'התזמון עצמו פעיל, אך משימה זו לא סיימה ריצה מוצלחת בתוך פעמיים מרווח התזמון שלה. ייתכן שהיא נתקעת או נכשלת באופן חוזר.';

  const facts = isScheduler
    ? [
        { label: 'רכיב', value: 'Render Cron (scheduler-heartbeat)' },
        { label: 'דיווח אחרון', value: formatTimestamp(lastHeartbeatAt) || 'מעולם לא דיווח' },
        { label: 'דקות מאז הדיווח', value: minutesSinceLastHeartbeat },
        { label: 'סף התראה (דקות)', value: toleranceMinutes },
      ]
    : [
        { label: 'משימה', value: jobName },
        { label: 'הצלחה אחרונה', value: formatTimestamp(lastSuccessAt) || 'מעולם לא הצליחה' },
        { label: 'דקות מאז ההצלחה', value: minutesSinceLastSuccess },
      ];

  const { html, text } = renderAdminAlert({
    severity: data.severity || 'critical',
    headline,
    summary,
    facts,
    actionRequired: isScheduler
      ? 'לבדוק ב-Render את שירות ה-Cron, לוודא שהוא פעיל ושההרצות האחרונות הסתיימו בהצלחה.'
      : `לבדוק את ריצות המשימה במסך התפעול (${opsDashboardUrl()}).`,
    note: 'התראה תפעולית אוטומטית. מגבלה מוכרת: התראה זו עצמה נשלחת ממשימה מתוזמנת, ולכן השתקה מוחלטת של התזמון עשויה לעכב אותה עד שהתזמון יחזור.',
  });

  const subject = isScheduler
    ? 'התראה קריטית: מנגנון התזמון אינו פעיל'
    : `התראה קריטית: משימה מתוזמנת אינה רצה (${jobName})`;

  return { subject, html, text };
};
