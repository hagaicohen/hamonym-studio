import { InjectionToken } from '@angular/core';
import type { DonationPayload } from '../services/donation.service';
import type { CartEntry } from './vendor-v462/cart/cart.types';
import type { DonationResult } from '../services/donation.service';

export type StudioPaymentSession = DonationResult;

/** Supplied only by the public campaign host. Editor/exports never receive payment access. */
export interface StudioCheckout {
  currency?: DonationPayload['currency'];
  preview?: boolean;
  enabled?(): boolean;
  submit(entries: CartEntry[], donor: DonationPayload['donor'], note?: string): Promise<void | StudioPaymentSession>;
}
export const STUDIO_CHECKOUT = new InjectionToken<StudioCheckout>('HAMONYM public checkout');
