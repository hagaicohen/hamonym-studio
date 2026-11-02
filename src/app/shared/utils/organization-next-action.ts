/** Uses stored onboarding completion, not the informational admin health score.
 * Documents/logo and an entity-owned terminal are not universal creation gates:
 * donation processing also supports the existing platform CardCom fallback.
 */
export function organizationNextAction(entity: any, campaignCount: number) {
  const needsCompletion = entity?.is_profile_complete !== true || entity?.requires_completion === true;
  const ready = entity?.status === 'active' && !needsCompletion;
  const titles: Record<string, string> = {
    rejected: 'הבקשה נדחתה — יש לעיין בהערות המנהל',
    changes_requested: 'נדרשים תיקונים לפני אישור העמותה',
    pending_review: 'הבקשה בבדיקה אצל מנהל הפלטפורמה',
    suspended: 'פעילות העמותה הושעתה — יש לעיין בהערות המנהל',
    draft: 'נשאר להשלים את פרטי העמותה',
  };
  return {
    ready,
    createFirstCampaign: ready && campaignCount === 0,
    needsCompletion,
    missingRequirements: organizationMissingRequirements(entity),
    title: titles[entity?.status] ?? (ready
      ? (campaignCount === 0 ? 'העמותה מאושרת — אפשר ליצור את הקמפיין הראשון' : 'העמותה מאושרת ומוכנה לפעילות')
      : 'העמותה מאושרת — נשארו פרטים להשלמה'),
  };
}

// Same profile fields as onboarding's isProfileComplete; labels only, no new gate.
function organizationMissingRequirements(entity: any): string[] {
  const fields: Record<string, string> = {
    entity_type: 'סוג הגוף', legal_name: 'שם הגוף הרשמי', registration_number: 'מספר רישום',
    display_name: 'שם לתצוגה', email: 'דואר אלקטרוני', phone: 'טלפון', description: 'תיאור העמותה',
    logo: 'לוגו', logo_url: 'לוגו', association_certificate: 'תעודת התאגדות',
    tax_document: 'אישור סעיף 46', contact_full_name: 'שם איש הקשר',
  };
  const missing = entity?.is_profile_complete === false
    ? Object.keys(fields).slice(0, 7).filter(field => !entity?.[field]).map(field => fields[field]) : [];
  if (entity?.requires_completion && Array.isArray(entity.missing_fields)) {
    for (const field of entity.missing_fields) {
      if (typeof field === 'string') missing.push(fields[field] || field);
    }
  }
  return [...new Set(missing)];
}
