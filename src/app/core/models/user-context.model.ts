export type RoleType =
  | 'entity-manager'
  | 'campaign-manager'
  | 'ambassador'
  | 'company'
  | 'donor';

export interface UserContext {
  id: string;
  name: string;
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
