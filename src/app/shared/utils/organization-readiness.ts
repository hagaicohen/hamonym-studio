export type ReadinessSeverity = 'legal' | 'operational' | 'recommendation';

export interface ReadinessItem {
  key: string;
  severity: ReadinessSeverity;
  title: string;
  detail: string;
}

const SEVERITY_ORDER: Record<ReadinessSeverity, number> = { legal: 0, operational: 1, recommendation: 2 };

/** The entity_masav_details fields readiness needs (see MasavConfig). */
export interface MasavReadiness {
  has_authorization_document: boolean;
  authorized: boolean;
}

// UI importance categories for the approval decision; none of them is an approval gate.
// `masav`: the real entity_masav_details row (null = none). When it could not be
// loaded (undefined), falls back to the legacy billing_masav_file_name column.
export function organizationMissingItems(entity: any, masav?: MasavReadiness | null): ReadinessItem[] {
  if (!entity) return [];
  const items: ReadinessItem[] = [];
  if (!entity.association_certificate_name) {
    items.push({ key: 'registration_document', severity: 'legal', title: 'תעודת רישום', detail: 'מסמך משפטי שלא הועלה' });
  }
  if (entity.entity_type === 'association' && !entity.tax_document_name) {
    items.push({ key: 'tax_document', severity: 'legal', title: 'אישור מס (סעיף 46)', detail: 'מסמך משפטי שלא הועלה' });
  }
  if (entity.cardcom_connection_status !== 'success') {
    items.push({ key: 'cardcom', severity: 'operational', title: 'חיבור CardCom', detail: 'ללא חיבור מאומת, התרומות לא ייסלקו לחשבון העמותה' });
  }
  if (!entity.billing_method) {
    items.push({ key: 'billing_method', severity: 'operational', title: 'אמצעי חיוב', detail: 'נדרש לצורך גביית דמי הפלטפורמה' });
  } else if (entity.billing_method === 'masav') {
    const uploaded = masav === undefined ? !!entity.billing_masav_file_name : !!masav?.has_authorization_document;
    if (!uploaded) {
      items.push({ key: 'masav_authorization', severity: 'operational', title: 'הרשאה לחיוב מס״ב', detail: 'נבחר חיוב במס״ב אך טופס ההרשאה לא הועלה' });
    } else if (masav && !masav.authorized) {
      items.push({ key: 'masav_authorization', severity: 'operational', title: 'הרשאה לחיוב מס״ב', detail: 'האישור הועלה וממתין לבדיקה ולאישור בניהול הגבייה' });
    }
  }
  if (!entity.logo_url) {
    items.push({ key: 'logo', severity: 'recommendation', title: 'לוגו', detail: 'מומלץ להשלמה, אינו חוסם אישור' });
  }
  if (!entity.contact_full_name) {
    items.push({ key: 'contact', severity: 'recommendation', title: 'איש קשר', detail: 'מומלץ להשלמה, אינו חוסם אישור' });
  }
  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
