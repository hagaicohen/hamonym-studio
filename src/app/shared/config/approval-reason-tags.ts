export type ApprovalReasonTag = 'missing_docs' | 'unclear_docs' | 'wrong_details' | 'billing_issue' | 'other';

export const APPROVAL_REASON_TAGS: { key: ApprovalReasonTag; label: string }[] = [
  { key: 'missing_docs',   label: 'מסמכים חסרים' },
  { key: 'unclear_docs',   label: 'מסמכים לא קריאים' },
  { key: 'wrong_details',  label: 'פרטי עמותה שגויים' },
  { key: 'billing_issue',  label: 'בעיית סליקה' },
  { key: 'other',          label: 'אחר' },
];

export function approvalReasonLabel(key: string): string {
  return APPROVAL_REASON_TAGS.find((t) => t.key === key)?.label ?? key;
}
