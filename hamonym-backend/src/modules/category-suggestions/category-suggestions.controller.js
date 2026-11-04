const service = require('./category-suggestions.service');

const ERRORS = {
  UNAUTHORIZED: [401, 'נדרשת התחברות'],
  INVALID_LABEL: [400, 'שם הקטגוריה צריך להכיל 2 עד 60 תווים: אותיות, ספרות ורווחים'],
  INVALID_ENTITY: [400, 'הארגון שצוין אינו תקין'],
  FORBIDDEN: [403, 'אין הרשאה להציע קטגוריה עבור ארגון זה'],
  CATEGORY_EXISTS: [409, 'הקטגוריה כבר קיימת ברשימה'],
  RATE_LIMITED: [429, 'נשלחו הצעות רבות בזמן קצר. נסו שוב מאוחר יותר'],
  INVALID_STATUS: [400, 'סטטוס לא תקין'],
  INVALID_NOTE: [400, 'ההערה ארוכה מדי (עד 500 תווים)'],
  NOT_FOUND: [404, 'ההצעה לא נמצאה'],
  ALREADY_REVIEWED: [409, 'ההצעה כבר טופלה'],
};

function handle(res, label, err) {
  const known = ERRORS[err.code];
  if (!known) {
    console.error(`[category-suggestions] ${label} error:`, err.message);
    return res.status(500).json({ error: 'אירעה שגיאה. נסו שוב', code: 'SERVER_ERROR' });
  }
  const body = { error: known[1], code: err.code };
  if (err.category) body.category = err.category;
  return res.status(known[0]).json(body);
}

exports.create = async (req, res) => {
  try {
    const result = await service.create({ label: req.body?.label, entityId: req.body?.entityId, userId: req.user?.id });
    res.status(result.duplicate ? 200 : 201).json({
      duplicate: result.duplicate,
      suggestion: { id: result.suggestion.id, label: result.suggestion.label, status: result.suggestion.status },
    });
  } catch (err) {
    handle(res, 'create', err);
  }
};

exports.list = async (req, res) => {
  try {
    res.json(await service.list({ status: req.query.status || undefined }));
  } catch (err) {
    handle(res, 'list', err);
  }
};

const review = (decision) => async (req, res) => {
  try {
    const suggestion = await service.review({
      id: req.params.id, decision, note: req.body?.note, adminUserId: req.user.id, ip: req.ip,
    });
    res.json({ suggestion });
  } catch (err) {
    handle(res, decision, err);
  }
};

exports.approve = review('approved');
exports.reject = review('rejected');
