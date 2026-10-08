const { renderAdminAlert, formatTimestamp } = require('./_admin-alert');

// Event H — platform.service.js::hardDeleteEntity completed. Irreversible, so
// this is a record-of-fact notification: by the time it is sent the entity,
// its campaigns and its donations are already gone and nothing in this path
// can or should undo that. The wording never suggests a recovery option that
// does not exist.
module.exports = (data) => {
  const { entityId, entityName, actingAdminName, actingAdminId, deletedAt, auditLogId, notes } = data;

  const { html, text } = renderAdminAlert({
    severity: data.severity || 'administrative',
    headline: 'עמותה נמחקה לצמיתות מהפלטפורמה',
    summary: 'בוצעה מחיקה לצמיתות של עמותה, כולל הקמפיינים והתרומות המקושרים אליה. הפעולה אינה הפיכה. רשומת הביקורת נשמרה ומהווה את התיעוד הקבוע של המחיקה.',
    facts: [
      { label: 'שם העמותה', value: entityName },
      { label: 'מזהה עמותה', value: entityId },
      { label: 'בוצע על ידי', value: actingAdminName || (actingAdminId != null ? `משתמש ${actingAdminId}` : null) },
      { label: 'זמן ביצוע', value: data.deletedAtDisplay || formatTimestamp(deletedAt) },
      { label: 'רשומת ביקורת', value: auditLogId },
      { label: 'הערות', value: notes },
    ],
    actionRequired: null,
    note: 'התראה תפעולית אוטומטית. אין אפשרות לשחזר את הנתונים שנמחקו דרך המערכת.',
  });

  return { subject: 'התראה: עמותה נמחקה לצמיתות', html, text };
};
