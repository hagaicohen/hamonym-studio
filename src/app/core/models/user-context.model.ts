export type RoleType =
  | 'entity-manager'
  | 'campaign-manager'
  | 'ambassador'
  | 'company'
  | 'donor';

export interface UserContext {
  id: string;
  name: string;
  // entities.entity_type (association/chalatz/political_party_*/sole_exempt/
  // sole_registered) — only meaningful for 'entity-manager' contexts. Lets
  // the topbar show "בעל עסק" for a business instead of assuming every
  // entity-manager context is a nonprofit.
  entityType?: string;
}

export interface UserRoleGroup {
  role: RoleType;
  label: string;
  icon: string;
  contexts: UserContext[];
}

export interface ActiveContext {
  role: RoleType;
  roleLabel: string;
  roleIcon: string;
  context: UserContext | null;
}
