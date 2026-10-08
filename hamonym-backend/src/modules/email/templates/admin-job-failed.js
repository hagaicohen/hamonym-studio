const { renderAdminAlert, formatTimestamp, formatDuration, opsDashboardUrl } = require('./_admin-alert');

// Event A — a scheduled job ended with job_runs.status='failed'.
// `error` is the job's own thrown message as job-runner.js already stored it
// in job_runs.error; it is an internal diagnostic string, never a payload
// dump, and it is truncated here because an operational email is a pointer to
// the job_runs row, not a replacement for it.
const ERROR_MAX = 300;

module.exports = (data) => {
  const { jobName, jobRunId, failedAtDisplay, failedAt, error, durationMs, triggeredBy } = data;

  const errorText = error ? String(error).slice(0, ERROR_MAX) : null;

  const { html, text } = renderAdminAlert({
    severity: data.severity || 'critical',
    headline: `משימת מערכת נכשלה: ${jobName}`,
    summary: 'המשימה הסתיימה בשגיאה ולא השלימה את פעולתה. יש לבדוק את פרטי הריצה ואת סיבת הכשל.',
    facts: [
      { label: 'משימה', value: jobName },
      { label: 'מזהה ריצה', value: jobRunId },
      { label: 'זמן כשל', value: failedAtDisplay || formatTimestamp(failedAt) },
      { label: 'משך ריצה', value: formatDuration(durationMs) },
      { label: 'הופעלה על ידי', value: triggeredBy },
    ],
    errorDetail: errorText,
    actionRequired: 'לבדוק את הריצה ולהפעיל מחדש אם הסיבה טופלה.',
    actionUrl: opsDashboardUrl(),
    actionLabel: 'פתיחת מסך התפעול',
    note: 'התראה תפעולית אוטומטית. אינה משנה דבר במצב התרומות, החיובים או הקמפיינים.',
  });

  return { subject: `התראה תפעולית: משימת מערכת נכשלה (${jobName})`, html, text };
};
