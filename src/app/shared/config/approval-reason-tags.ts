export type ApprovalReasonTag =
  | 'missing_docs'
  | 'unclear_docs'
  | 'wrong_details'
  | 'missing_tax_document'
  | 'no_payment_provider'
  | 'billing_issue'
  | 'no_billing_method'
  | 'missing_logo'
  | 'missing_contact'
  | 'incomplete_profile'
  | 'other';

export const APPROVAL_REASON_TAGS: { key: ApprovalReasonTag; label: string }[] = [
  { key: 'missing_docs',         label: 'מסמכים חסרים' },
  { key: 'unclear_docs',         label: 'מסמכים לא קריאים' },
  { key: 'wrong_details',        label: 'פרטי עמותה שגויים' },
  { key: 'missing_tax_document', label: 'חסר אישור מס (סעיף 46)' },
  { key: 'no_payment_provider',  label: 'לא הוגדר חיבור לסליקה (CardCom)' },
  { key: 'billing_issue',        label: 'בעיית סליקה' },
  { key: 'no_billing_method',    label: 'לא הוגדר אמצעי חיוב (כרטיס אשראי או מס״ב)' },
  { key: 'missing_logo',         label: 'חסר לוגו' },
  { key: 'missing_contact',      label: 'חסרים פרטי איש קשר' },
  { key: 'incomplete_profile',   label: 'פרופיל העמותה לא הושלם (תיאור, מטרות)' },
  { key: 'other',                label: 'אחר' },
];

export function approvalReasonLabel(key: string): string {
  return APPROVAL_REASON_TAGS.find((t) => t.key === key)?.label ?? key;
}
