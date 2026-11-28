import { Ambassador } from '../services/ambassador.service';
import { InjectionToken } from '@angular/core';

/** Platform actions supplied only to the public renderer; Studio retains its editing behavior. */
export interface StudioPublicActions {
  user(): { isLoggedIn: boolean; name: string; photo?: string } | null;
  account(action: string): void;
  donate(): void;
  join(): void;
  campaignAccent?(): string;
  donateThroughAmbassador?(id: string, url: string): void;
  ambassadorPanel?(): { ambassador: Ambassador; campaignUrl: string; accent: string; showAmounts: boolean; edit?: () => void } | null;
  ambassadorActionLabel?(): string | null;
  navigate(section: string): void;
  isAmbassadorPage?(): boolean;
  share(action: string): Promise<void>;
  registrationOptions(): Array<{id:string;title:string;price:number}>;
}
export const STUDIO_PUBLIC_ACTIONS = new InjectionToken<StudioPublicActions>('HAMONYM public campaign actions');
