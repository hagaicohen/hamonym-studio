// Single source of truth for MASAV setup constants shown to the operator/
// association during onboarding -- used by both the entity self-service
// MASAV setup (settings/components/edit/entity-billing-section-edit) and the
// Super Admin Billing Ops MASAV drawer (platform/pages/platform-billing-ops-page).
// Both surfaces configure the same entity_masav_details row; keeping these
// values in one place avoids the two screens drifting apart again.

// Display-only -- not wired into any backend business logic or validation
// (hamonym-backend never references this value; it never flows into the
// MASAV export file itself, see masav-collection.service.js's `company`
// column, which is the entity's own display name, not this code). Update
// this constant if Hamonym's actual מוסד code changes. Confirmed 2026-09-08
// against the bank-signed authorization form on file (institution code
// 25788).
export const MASAV_INSTITUTION_CODE = '25788';

// Legal beneficiary name on the bank-signed MASAV authorization -- Hamonym's
// registered company name, distinct from the entity's own display name.
export const MASAV_BENEFICIARY_NAME = 'פלנוויז בע"מ';

// Exact required wording for the acknowledgement checkbox gating the
// authorization-document upload step, on both MASAV setup surfaces.
export const MASAV_ACK_TEXT =
  'קראתי והבנתי כי החיוב באמצעות מס"ב מתבצע בהתאם להיקף הפעילות בפלטפורמה ולשיעור העמלה שנקבע בהתקשרות, ולכן ההרשאה הבנקאית נדרשת ללא הגבלת סכום וללא הגבלת משך זמן.';

// The "why unlimited" explanation, promoted to its own always-visible
// section (2026-09-09 copy refinement) instead of being buried inside a
// collapsed help toggle -- the association should see this before reaching
// the acknowledgement checkbox, not only if they click to expand it.
export const MASAV_WHY_UNLIMITED_TITLE = 'למה נדרשת הרשאה ללא הגבלת סכום וללא הגבלת זמן?';
export const MASAV_WHY_UNLIMITED_TEXT =
  'דמי השירות של Hamonym מחושבים כאחוז מהפעילות בפלטפורמה, ולכן סכום החיוב משתנה בהתאם להיקף הפעילות ואינו סכום חודשי קבוע. כדי לאפשר גבייה שוטפת, יש להקים הרשאה ללא הגבלת סכום וללא הגבלת זמן. החיוב בפועל יבוצע אך ורק בהתאם לתנאי ההתקשרות ולדמי השירות שסוכמו עם העמותה.';

// Upload-step helper text -- specific about needing the bank's own
// confirmation that the authorization was established, not merely a form
// the association itself signed.
export const MASAV_UPLOAD_HELPER_TEXT =
  'יש להעלות את אישור הקמת ההרשאה שהתקבל מהבנק (PDF או צילום/סריקה ברורים).';

// Pending-authorization status wording.
export const MASAV_PENDING_STATUS_LABEL = 'ממתינה לאישור Hamonym';
export const MASAV_PENDING_STATUS_SUBLABEL = 'לאחר העלאת האישור, צוות Hamonym יבדוק את פרטי ההרשאה ויאשר אותה.';
