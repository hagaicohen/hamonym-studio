// Validation Engine — turns ApprovalFacts (raw verified values) into
// ApprovalChecks (explicit pass/warning/fail verdicts, each with an
// explanation). This is where business rules about what's critical vs.
// nice-to-have live — in code, not in the prompt, and not left for the LLM
// to (re-)decide. "Missing סעיף 46" is a fact the code already knows how to
// judge; the LLM's job is to weigh already-judged checks and explain, not
// to figure out what each one means.

// @param {import('./approval.types').ApprovalFacts} facts
// @returns {import('./approval.types').ApprovalCheck[]}
exports.buildApprovalChecks = (facts) => [
  {
    id: 'registration_document',
    title: 'מסמך רישום',
    status: facts.registrationDocumentUploaded ? 'pass' : 'fail',
    explanation: facts.registrationDocumentUploaded ? 'מסמך הרישום הועלה' : 'לא הועלה מסמך רישום',
  },
  {
    id: 'tax_document',
    title: 'אישור מס',
    status: facts.taxDocumentUploaded ? 'pass' : 'fail',
    explanation: facts.taxDocumentUploaded ? 'אישור המס הועלה' : 'לא הועלה אישור מס',
  },
  {
    id: 'contact_info',
    title: 'פרטי קשר',
    status: facts.contactExists ? 'pass' : 'fail',
    explanation: facts.contactExists ? 'קיימים פרטי קשר לעמותה' : 'אין פרטי קשר (אימייל או טלפון)',
  },
  {
    id: 'nihul_takin',
    title: 'ניהול תקין',
    status: facts.nihulTakin ? 'pass' : 'fail',
    explanation: facts.nihulTakin ? 'אישור ניהול תקין בתוקף' : 'אין אישור ניהול תקין בתוקף',
  },
  {
    id: 'guidestar',
    title: 'רישום ב-GuideStar',
    status: facts.guideStarFound ? 'pass' : 'warning',
    explanation: facts.guideStarFound ? 'העמותה נמצאה ברישום GuideStar' : 'העמותה לא נמצאה ברישום GuideStar',
  },
  {
    id: 'approval_46',
    title: 'סעיף 46',
    status: facts.approval46 ? 'pass' : 'warning',
    explanation: facts.approval46 ? 'העמותה מוכרת לצורך זיכוי מס לפי סעיף 46' : 'העמותה אינה מוכרת לפי סעיף 46',
  },
  {
    id: 'recent_reports',
    title: 'דיווחים עדכניים',
    status: facts.recentReportsSubmitted ? 'pass' : 'warning',
    explanation: facts.recentReportsSubmitted ? 'הוגשו דוחות בשנתיים האחרונות' : 'לא הוגשו דוחות בשנתיים האחרונות',
  },
  {
    id: 'website',
    title: 'אתר אינטרנט',
    status: facts.websiteExists ? 'pass' : 'warning',
    explanation: facts.websiteExists ? 'לעמותה יש אתר אינטרנט' : 'לעמותה אין אתר אינטרנט',
  },
  {
    id: 'profile_complete',
    title: 'פרופיל מלא',
    status: facts.profileComplete ? 'pass' : 'warning',
    explanation: facts.profileComplete ? 'הפרופיל מלא' : `הפרופיל חסר (${facts.missingFieldsCount} שדות חסרים)`,
  },
  {
    id: 'has_campaign',
    title: 'קמפיין קיים',
    status: facts.campaignsCount > 0 ? 'pass' : 'warning',
    explanation: facts.campaignsCount > 0 ? `לעמותה ${facts.campaignsCount} קמפיינים` : 'לעמותה אין קמפיינים עדיין',
  },
];
