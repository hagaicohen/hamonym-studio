import { STUDIO_PUBLIC_ACTIONS } from '../../studio-public-actions';
import { DonationPayload } from '../../../services/donation.service';
import { ApplicationRef, ComponentRef, DestroyRef, EnvironmentInjector, Injectable, Type, createComponent, effect, inject } from '@angular/core';
import { CartStoreService } from './cart-store.service';
import { CartBridge, DonationAmbassador } from './cart.types';
import { CartDialogComponent } from './cart-dialog.component';
import { CartToastComponent } from './cart-toast.component';
import { RaceQuickRegisterComponent } from './race-quick-register.component';
import { DonationBoxComponent } from '../public-page/cards/donation-box.component';

import { studioAdopt, studioListen } from '../core/studio-session';
type CartWindow = Window & {
  hamUnifiedCart?: CartBridge;
  /** Published by the core engine when the editor's full race wizard exists. */
  /** Published by the core engine: closes the reward details dialog. */
  hamCloseRewardDetails?: () => void;
};

/**
 * Wires the Angular cart into the campaign preview.
 *
 * The preview markup (reward tiles, donation box, race cards) is still
 * produced by the legacy renderer, so this service listens for clicks on
 * that markup in the capture phase and reflects cart state back onto it.
 */
@Injectable({ providedIn: 'root' })
export class CampaignCartService {
  private readonly store = inject(CartStoreService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platform=inject(STUDIO_PUBLIC_ACTIONS,{optional:true});
  private started = false;
  private dialog?: ComponentRef<CartDialogComponent>;

  constructor() {
    // Highlight exactly the reward tiles that are in the cart.
    effect(() => { this.store.selectedRewards(); this.syncRewardTiles(); }, { allowSignalWrites: true });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.store.loadSeed();
    this.attach(CartToastComponent, document.body);
    const onClick = (e: MouseEvent) => this.onClick(e);
    const onChange = (e: Event) => this.onChange(e);
    studioListen(document, 'click', onClick, true);
    studioListen(document, 'change', onChange);
    this.destroyRef.onDestroy(() => {
      this.destroyRef_(this.dialog);
      this.dialog = undefined;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('change', onChange);
    });
    this.publishBridge();
    this.mount();
  }

  /**
   * After each render (the core's `hamUnifiedCart.mount()`): the reward tiles' selected state (a sync, rendered by
   * the tiles since v4.51). Since v4.50 the cart button is the header's template's.
   */
  mount(): void {
    this.syncRewardTiles();
  }

  open(checkout = false, donor?: DonationPayload['donor'], ambassador?: DonationAmbassador, dedication?: string): void {
    this.destroyRef_(this.dialog);
    document.getElementById('hamUnifiedCartDialog')?.remove();
    const ref = this.attach(CartDialogComponent, document.body, false);
    ref.setInput('checkout', checkout);
    if (ambassador) ref.setInput('donationAmbassador', ambassador);
    if (dedication) ref.setInput('initialDedication', dedication);
    if(donor)ref.setInput('initialDonor',donor);
    ref.instance.closed.subscribe(() => { if (this.dialog === ref) this.dialog = undefined; this.destroyRef_(ref); });
    this.dialog = ref;
    ref.changeDetectorRef.detectChanges();
  }

  private openRaceQuickRegister(index: number): void {
    const race = this.store.campaign().management?.modules?.races?.items?.[index];
    if (!race) return;
    const ref = this.attach(RaceQuickRegisterComponent, document.body, false);
    ref.setInput('race', race);
    ref.setInput('raceIndex', index);
    ref.instance.done.subscribe(action => {
      this.destroyRef_(ref);
      if (action === 'checkout') this.open(true);
    });
    ref.changeDetectorRef.detectChanges();
  }

  private attach<T>(type: Type<T>, parent: Element, detect = true): ComponentRef<T> {
    const ref = createComponent(type, { environmentInjector: this.injector });
    this.appRef.attachView(ref.hostView);
    const host = ref.location.nativeElement as HTMLElement;
    const accent = this.platform?.campaignAccent?.();
    if (accent) {
      host.classList.add('hm-public-campaign-controls');
      host.style.setProperty('--hm-public-campaign-accent', accent);
    }
    parent.appendChild(studioAdopt(host));
    if (detect) ref.changeDetectorRef.detectChanges();
    return ref;
  }

  private destroyRef_(ref?: ComponentRef<unknown>): void {
    if (!ref || ref.hostView.destroyed) return;
    this.appRef.detachView(ref.hostView);
    ref.destroy();
  }

  /** The reward tiles' selected state, mark and button text: the tiles render it (v4.51; it was written into their DOM). */
  private syncRewardTiles(): void { this.store.syncTiles(); }

  private onChange(e: Event): void {
    const input = (e.target as Element | null)?.closest?.('.donation-box [data-donation-custom-input]');
    if (input?.closest('[data-ambassador-donation-drawer]')) return;
    const box = input?.closest('.donation-box');
    if (box?.querySelector('[data-donation-other].donation-selected,[data-donation-other].is-chosen')) this.store.addDonation(box);
  }

  private onClick(e: MouseEvent): void {
    const b = (e.target as Element | null)?.closest?.<HTMLButtonElement>('button');
    if (!b || b.closest('[data-ambassador-donation-drawer]')) return;
    const win = window as CartWindow;
    const stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };

    if(this.platform && b.closest('#preview')) {
      if(b.hasAttribute('data-ambassador')){stop();this.platform.join();return;}
      if(b.hasAttribute('data-donate') && !b.closest('.reward-tile')){stop();this.platform.donate();return;}
    }
    // A trigger rendered by the legacy header (the Angular button handles its own click).
    if (b.hasAttribute('data-ham-cart-trigger') && !b.closest('ham-cart-header-button')) { stop(); this.open(false); return; }
    if (b.hasAttribute('data-donation-choice')) {
      const box = b.closest('.donation-box');
      if (!box) return;
      // v4.53: the box renders the choice (it was written into its buttons).
      DonationBoxComponent.of(box)?.choose(b.dataset['donationChoice'] ?? '');
      this.store.addDonation(box);
      return;
    }
    if (b.hasAttribute('data-ham-detail-select')) {
      const index = Number(b.dataset['hamDetailIndex']);
      if (Number.isInteger(index) && this.store.addReward(index)) { try { win.hamCloseRewardDetails?.(); } catch { /* dialog already gone */ } }
      stop();
      return;
    }
    if (b.matches('.reward-tile button[data-donate]')) {
      const card = b.closest<HTMLElement>('[data-reward-index]');
      if (card) this.store.toggleReward(Number(card.dataset['rewardIndex']));
      stop();
      return;
    }
    if (b.hasAttribute('data-donation-continue')) {
      if (this.store.addDonation(b.closest('.donation-box'))) this.open(false);
      stop();
      return;
    }
    if (b.hasAttribute('data-race-register')) { this.openRaceQuickRegister(Number(b.dataset['raceRegister'])); stop(); return; }
    if (b.hasAttribute('data-ham-cart-quick-checkout')) { stop(); this.open(true); }
  }

  private publishBridge(): void {
    const s = this.store;
    (window as CartWindow).hamUnifiedCart = {
      mount: () => this.mount(),
      refresh: () => this.syncRewardTiles(),
      addReward: i => s.addReward(i),
      toggleReward: i => s.toggleReward(i),
      addDonation: box => s.addDonation(box),
      addRace: data => s.addRace(data),
      open: checkout => this.open(!!checkout),
      reset: () => s.reset(),
      removeSelectedDonation: () => s.removeSelectedDonation(),
      exportCart: () => s.exportCart()
    };
  }
}
