import { InjectionToken } from '@angular/core';

export interface StudioSlugCheck { available: boolean; message: string; suggestion?: string; }
export interface StudioSlug {
  check(value: string): Promise<StudioSlugCheck>;
  locked(): boolean;
  current(): string;
  change(value: string): void;
}
export const STUDIO_SLUG = new InjectionToken<StudioSlug>('HAMONYM campaign URL');
export function validCampaignSlug(value: string): boolean {
  return /^[\p{L}\p{N}][\p{L}\p{N}-]{1,68}[\p{L}\p{N}]$/u.test(value) && !value.includes('--');
}
