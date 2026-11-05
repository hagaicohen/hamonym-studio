// An entity still in 'draft' is an incomplete registration, not an
// organization: it is not selectable as a context and cannot have campaigns
// until it is submitted (pending_review on). The backend enforces the same rule.

export function isRegistrationDraft(entity: { status?: string | null } | null | undefined): boolean {
  return entity?.status === 'draft';
}

export function registeredOrganizations<T extends { status?: string | null }>(entities: T[]): T[] {
  return entities.filter((entity) => !isRegistrationDraft(entity));
}

export function registrationDrafts<T extends { status?: string | null }>(entities: T[]): T[] {
  return entities.filter((entity) => isRegistrationDraft(entity));
}
