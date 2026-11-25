import { Injectable, computed, inject, signal } from '@angular/core';
import { CampaignStateService } from '../core/campaign-state.service';
import { CartCampaign, CartEntry, RaceCartInput, formatCurrency, lineQty, lineTotal } from './cart.types';

const EMPTY_CAMPAIGN: CartCampaign = { content: { donate: { boxAmounts: [] }, rewards: { items: [] } }, management: { modules: { races: { items: [] } } } };
const SEED_ELEMENT_ID = 'ham-cart-seed';


const newId = () => String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8);

/**
 * Local demonstration cart (donations, rewards, race registrations).
 * Nothing here charges cards or creates real registrations.
 */
@Injectable({ providedIn: 'root' })
export class CartStoreService {
  private readonly campaignState = inject(CampaignStateService);
  private seedCampaign?: CartCampaign;
  readonly entries = signal<CartEntry[]>([]);
  readonly toast = signal<{ text: string; id: number } | null>(null);

  readonly count = computed(() => this.entries().reduce((n, x) => n + lineQty(x), 0));
  readonly grandTotal = computed(() => this.entries().reduce((a, x) => a + lineTotal(x), 0));
  readonly dueNow = computed(() => this.entries().reduce((a, x) => a + (+x.price || 0) * lineQty(x), 0));
  readonly hasRecurring = computed(() => this.entries().some(x => x.recurring));
  readonly selectedRewards = computed(() => new Set(
    this.entries().filter(x => x.kind === 'reward' && Number(x.qty) > 0).map(x => Number(x.sourceIndex))));
  /**
   * v4.51: the page's reward tiles show the selection (RewardTileComponent `live`) once a sync has come after they
   * were rendered: after each render, a change of the selection and `hamUnifiedCart.refresh()`, as the old DOM sync
   * (`syncRewardTiles`) did. A tile rendered in between (a collection rendered again from its toolbar) waits for the next.
   */
  readonly tileSync = signal(0);
  private readonly tiles = new Set<{ refresh(): void }>();
  /** A live tile of the page (until it is destroyed). */
  addTile(tile: { refresh(): void }): void { this.tiles.add(tile); }
  removeTile(tile: { refresh(): void }): void { this.tiles.delete(tile); }
  /** The sync: every live tile renders its state now (the old DOM sync was synchronous, also after a render from outside Angular). */
  syncTiles(): void {
    this.tileSync.update(n => n + 1);
    this.tiles.forEach(tile => tile.refresh());
  }

  /** Reads a static seed when the page is a standalone export. */
  loadSeed(): void {
    try {
      const seed = JSON.parse(document.getElementById(SEED_ELEMENT_ID)?.textContent || 'null') as { campaign?: CartCampaign; cart?: CartEntry[] } | null;
      this.seedCampaign = seed?.campaign;
      if (Array.isArray(seed?.cart)) this.entries.set(seed!.cart.map(x => ({ ...x })));
    } catch { /* invalid seed */ }
  }

  campaign(): CartCampaign {
    const live = this.campaignState.peek() as CartCampaign | undefined;
    if (live?.content) return live;
    return this.seedCampaign || EMPTY_CAMPAIGN;
  }

  notify(text: string): void { this.toast.set({ text, id: Date.now() }); }

  private update(fn: (list: CartEntry[]) => CartEntry[]): void { this.entries.update(list => fn([...list])); }

  addReward(index: number): boolean {
    const reward = this.campaign().content?.rewards?.items?.[index];
    if (!reward) return false;
    const price = Number(reward.amount);
    if (!Number.isFinite(price) || price < 0) { this.notify('מחיר התשורה אינו תקין'); return false; }
    const match = this.entries().find(x => x.kind === 'reward' && x.sourceIndex === index);
    if (reward.stockEnabled && (match?.qty || 0) >= Number(reward.quantity || 0)) { this.notify('לא נותר מלאי לתשורה הזו'); return false; }
    this.update(list => match
      ? list.map(x => x === match ? { ...x, qty: x.qty + 1 } : x)
      : [...list, { uid: newId(), kind: 'reward', sourceIndex: index, title: String(reward.name || 'תשורה'), info: String(reward.description || ''), price, qty: 1 }]);
    this.notify('התשורה נוספה לסל');
    return true;
  }

  toggleReward(index: number): boolean {
    const isReward = (x: CartEntry) => x.kind === 'reward' && Number(x.sourceIndex) === index;
    if (!this.entries().some(isReward)) return this.addReward(index);
    this.update(list => list.filter(x => !isReward(x)));
    this.notify('בחירת התשורה בוטלה');
    return true;
  }

  /** Adds (or replaces) the donation chosen in a rendered donation box. */
  addDonation(box: Element | null): boolean {
    if (!box) return false;
    const chosen = box.querySelector<HTMLElement>('[data-donation-choice].donation-selected,[data-donation-choice].is-chosen,[data-donation-other].donation-selected,[data-donation-other].is-chosen');
    const customInput = box.querySelector<HTMLInputElement>('.donation-custom-entry input');
    let amount: number, recurring = false, months = 1;
    if (chosen?.hasAttribute('data-donation-other')) {
      amount = Number(String(customInput?.value || '').replace(/[₪,\s]/g, ''));
    } else {
      const preset = this.campaign().content?.donate?.boxAmounts?.[Number(chosen?.dataset['donationChoice'] ?? 0)];
      if (!preset) { this.notify('בחרו תחילה סכום לתרומה'); return false; }
      amount = Number(preset.amount);
      recurring = preset.kind === 'recurring';
      months = recurring ? Math.max(1, Math.floor(Number(preset.months) || 1)) : 1;
    }
    if (!Number.isFinite(amount) || amount <= 0) { this.notify('יש להזין סכום תרומה תקין'); customInput?.focus(); return false; }
    const line = {
      kind: 'donation' as const, price: amount, qty: 1, recurring, months,
      title: recurring ? 'תרומה חודשית' : 'תרומה חד־פעמית',
      info: recurring ? `${months} חודשים · ${formatCurrency(amount)} לחודש` : 'למען הקמפיין'
    };
    this.update(list => {
      const i = list.findIndex(x => x.kind === 'donation' && x.selectionBased === true);
      if (i >= 0) list[i] = { ...list[i], ...line };
      else list.push({ uid: newId(), selectionBased: true, ...line });
      return list;
    });
    this.notify('התרומה נכללה בסל');
    return true;
  }

  addRace(data: RaceCartInput): boolean {
    if (!data || !Number.isFinite(+data.unitPrice) || +data.unitPrice < 0) return false;
    const participants = Array.isArray(data.participants) ? data.participants : [];
    const qty = participants.length || Math.max(1, Math.floor(Number(data.qty) || 1));
    this.update(list => [...list, {
      uid: newId(), kind: 'race', sourceIndex: data.raceIndex, title: String(data.title || 'הרשמה למירוץ'),
      info: String(data.type || 'הרשמה רגילה'), price: Number(data.unitPrice), qty,
      participants: participants.map(p => ({ ...p })), contact: data.contact ? { ...data.contact } : null
    }]);
    this.notify('ההרשמה נוספה לסל');
    return true;
  }

  remove(index: number): void { this.update(list => { list.splice(index, 1); return list; }); }

  changeQty(index: number, delta: number): void {
    const item = this.entries()[index];
    if (!item) return;
    const qty = Math.max(0, (item.qty || 1) + delta);
    if (qty === 0) { this.remove(index); return; }
    const original = item.kind === 'reward' ? this.campaign().content?.rewards?.items?.[item.sourceIndex ?? -1] : undefined;
    if (original?.stockEnabled && qty > Number(original.quantity || 0)) { this.notify('לא ניתן לעבור את המלאי הזמין'); return; }
    this.update(list => list.map((x, i) => i === index ? { ...x, qty } : x));
  }

  reset(): void { this.entries.set([]); }
  removeSelectedDonation(): void { this.update(list => list.filter(x => !(x.kind === 'donation' && x.selectionBased === true))); }

  exportCart(): CartEntry[] {
    return this.entries().map(x => ({ ...x, participants: x.participants?.map(p => ({ ...p })), contact: x.contact ? { ...x.contact } : null }));
  }
}
