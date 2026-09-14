// Shared job/finding label + area-classification logic, extracted from
// platform-cardcom-ops-page.component.ts (UX simplification pass,
// 2026-09-14) so both the "תרומות" page and the "חיובי עמותות" (Billing
// Ops) page's own "דורש טיפול" section can classify the exact same
// health/findings data by area without duplicating the mapping tables --
// one source of truth for "which job/finding belongs to which operator
// world." Pure data + pure functions, no Angular dependency, no new
// backend call: both pages still fetch via the existing CardcomOpsService.

// Human names for every job that has ever written to `job_runs` or
// `reconciliation_findings` -- see platform-cardcom-ops-page's original
// comment (2026-09-07 audit) for the exact grep this was built from.
export const JOB_LABELS: Record<string, string> = {
  'webhook-recovery': 'שחזור Webhooks',
  'stale-pending-donations': 'תרומות שממתינות זמן רב',
  'aggregate-consistency': 'בדיקת עקביות תרומות',
  'stuck-recurring-signups': 'הרשמות לחיוב קבוע שנתקעו',
  'billing-approval-consistency': 'בדיקת אישורי חיוב',
  'billing-provisioning-gap': 'בדיקת הגדרת גבייה לעמותות',
  'collection-attempt-reconciliation': 'בדיקת ניסיונות גבייה',
  'billing-monthly-cycle': 'מחזור חיוב חודשי אוטומטי',
  'recurring-payment-reconciliation': 'התאמת חיובי הוראות קבע',
  'masav-collection': 'גביית מס"ב',
  'collection-router': 'ניתוב גבייה',
  'payment_verification_gate': 'שער אימות תשלום',
};

export const JOB_FREQUENCY_LABELS: Record<string, string> = {
  'webhook-recovery': 'כל 15 דקות',
  'stale-pending-donations': 'כל שעה',
  'stuck-recurring-signups': 'כל שעה',
  'aggregate-consistency': 'פעם ביום',
  'billing-approval-consistency': 'כל שעה',
  'billing-provisioning-gap': 'כל שעה',
  'collection-attempt-reconciliation': 'כל שעה',
  'billing-monthly-cycle': 'פעם בחודש (ה-1 לחודש)',
};

export const DORMANT_JOB_NOTE: Record<string, string> = {
  'recurring-payment-reconciliation': 'לא מתוזמן אוטומטית — הרצה ידנית בלבד',
};

export const FINDING_TYPE_LABELS: Record<string, string> = {
  lost_webhook_recovered: 'תרומה שהושלמה אוטומטית אחרי איחור באירוע סליקה',
  lookup_failed: 'בדיקה מול חברת הסליקה נכשלה',
  pending_donation_missing_low_profile_id: 'תרומה ממתינה בלי מזהה לבדיקה מול חברת הסליקה',
  campaign_aggregate_mismatch: 'אי-התאמה בנתוני קמפיין',
  stuck_recurring_signup: 'הרשמה לחיוב קבוע שנתקעה',
  collection_attempt_stuck: 'ניסיון גבייה תקוע',
  statement_payments_exceed_total_due: 'תשלומים שחרגו מסכום החיוב החודשי',
  active_entity_missing_billing_account: 'עמותה פעילה ללא הגדרות חיוב',
  statement_components_not_fully_claimed: 'רכיבי חיוב שלא שויכו במלואם',
  donation_claimed_by_ineffective_statement: 'תרומה משויכת לחיוב חודשי לא תקף',
  claimed_donation_missing_from_components: 'תרומה משויכת חסרה ברכיבי החיוב',
  statement_gross_raised_mismatch: 'אי-התאמה בסכום שגויס בחיוב החודשי',
  history_lookup_failed: 'בדיקת היסטוריית חיובים מול חברת הסליקה נכשלה',
  recurring_charge_recovered_from_history: 'חיוב הוראת קבע שהושלם מהיסטוריית חברת הסליקה',
  masav_blocked_pending_authorization: 'גבייה חסומה — ממתינה לאישור מס"ב',
  collection_method_not_implemented: 'אמצעי גבייה שאינו נתמך עדיין',
  no_active_payment_instrument: 'אין אמצעי תשלום פעיל לגבייה',
  gate_v1_mismatch: 'תרומה עוכבה לבדיקה (אי-התאמה באימות תשלום)',
};

export const WEBHOOK_TYPE_LABELS: Record<string, string> = {
  LowProfile: 'תרומה חד-פעמית',
  Payment: 'בדיקת אירוע סליקה (חברת הסליקה)',
  MasterRecurring: 'הוראת קבע (סטטוס)',
  DetailRecurring: 'הוראת קבע (חיוב)',
  Document: 'מסמך',
};

// Which of the two operator "worlds" a job/finding-source belongs to --
// donations (donor -> חברת סליקה -> עמותה) vs. commission (עמותה -> חברת
// סליקה/מס"ב -> Hamonym). Purely presentational; not a job/schedule
// property. Jobs/sources not listed here default to 'donations' (see
// jobArea() below).
export const JOB_AREA: Record<string, 'donations' | 'commission'> = {
  'webhook-recovery': 'donations',
  'stale-pending-donations': 'donations',
  'aggregate-consistency': 'donations',
  'stuck-recurring-signups': 'donations',
  'recurring-payment-reconciliation': 'donations',
  'payment_verification_gate': 'donations',
  'billing-approval-consistency': 'commission',
  'billing-provisioning-gap': 'commission',
  'collection-attempt-reconciliation': 'commission',
  'billing-monthly-cycle': 'commission',
  'masav-collection': 'commission',
  'collection-router': 'commission',
};

// Finding types that mean "a call to the payment provider itself failed or
// couldn't be completed" -- these route to the provider-health signal
// regardless of which job produced them (e.g. lookup_failed can come from
// a nominally "donations" job but is really about the provider).
export const PROVIDER_FINDING_TYPES = new Set(['lookup_failed', 'history_lookup_failed']);

export function jobLabel(name: string): string {
  return JOB_LABELS[name] ?? name;
}

export function jobFrequency(name: string): string {
  return JOB_FREQUENCY_LABELS[name] ?? DORMANT_JOB_NOTE[name] ?? '';
}

export function findingTypeLabel(type: string): string {
  return FINDING_TYPE_LABELS[type] ?? type;
}

export function webhookTypeLabel(type: string): string {
  return WEBHOOK_TYPE_LABELS[type] ?? type;
}

export function jobArea(jobName: string): 'donations' | 'commission' {
  return JOB_AREA[jobName] ?? 'donations';
}
