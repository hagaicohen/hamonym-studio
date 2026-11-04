export interface OrganizationCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

// Existing Super Admin completion indicators; informational, not approval gates.
export function organizationHealthChecks(entity: any, campaignCount: number): OrganizationCheck[] {
  if (!entity) return [];
  const checks: OrganizationCheck[] = [
    { label: 'מסמכי רישום', ok: !!entity.association_certificate_name },
  ];
  if (entity.entity_type === 'association') {
    checks.push({ label: 'אישור מס', ok: !!entity.tax_document_name });
  }
  checks.push(
    { label: 'סליקה מחוברת', ok: entity.cardcom_connection_status === 'success' },
    { label: 'איש קשר מוגדר', ok: !!entity.contact_full_name },
    { label: 'קמפיין קיים', ok: campaignCount > 0 },
  );
  return checks;
}
