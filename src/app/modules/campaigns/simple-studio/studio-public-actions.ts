import { InjectionToken } from '@angular/core';

/** Platform actions supplied only to the public renderer; Studio retains its editing behavior. */
export interface StudioPublicActions {
  user(): { isLoggedIn: boolean; name: string; photo?: string } | null;
  account(action: string): void;
  donate(): void;
  join(): void;
  navigate(section: string): void;
  share(action: string): Promise<void>;
  registrationOptions(): Array<{id:string;title:string;price:number}>;
}
export const STUDIO_PUBLIC_ACTIONS = new InjectionToken<StudioPublicActions>('HAMONYM public campaign actions');
