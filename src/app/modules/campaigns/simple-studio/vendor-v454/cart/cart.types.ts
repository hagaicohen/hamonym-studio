export type CartKind = 'donation' | 'reward' | 'race';

export interface CartParticipant { fullName?: string; [key: string]: unknown; }

export interface CartEntry {
  uid: string;
  kind: CartKind;
  title: string;
  info: string;
  price: number;
  qty: number;
  sourceIndex?: number;
  recurring?: boolean;
  months?: number;
  /** The single donation line driven by the donation box selection. */
  selectionBased?: boolean;
  participants?: CartParticipant[];
  contact?: { name?: string; [key: string]: unknown } | null;
}

export interface RaceCartInput {
  raceIndex?: number;
  title?: string;
  type?: string;
  unitPrice: number;
  qty?: number;
  participants?: CartParticipant[];
  contact?: CartEntry['contact'];
}

export interface CartReward { name?: string; description?: string; amount?: number | string; stockEnabled?: boolean; quantity?: number | string; }
export interface CartDonationPreset { amount?: number | string; kind?: string; months?: number | string; }
export interface CartRaceType { id?: string; title?: string; price?: number; }
export interface CartRace {
  title?: string; price?: number | string; maxPerOrder?: number | string;
  useRegistrationTypes?: boolean; registrationTypes?: CartRaceType[];
}

/** Campaign fields the cart reads. */
export interface CartCampaign {
  content?: { donate?: { boxAmounts?: CartDonationPreset[] }; rewards?: { items?: CartReward[] } };
  management?: { modules?: { races?: { items?: CartRace[] } } };
}

/** API kept on window.hamUnifiedCart for the legacy core and finalizer. */
export interface CartBridge {
  mount(): void;
  refresh(): void;
  addReward(index: number): boolean;
  toggleReward(index: number): boolean;
  addDonation(box: Element | null): boolean;
  addRace(data: RaceCartInput): boolean;
  open(checkout?: boolean): void;
  reset(): void;
  removeSelectedDonation(): void;
  exportCart(): CartEntry[];
}

export const CART_KIND_LABEL: Record<CartKind, string> = { donation: 'תרומה', reward: 'תשורה', race: 'הרשמה למירוץ' };

const ILS = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 });
export const formatCurrency = (n: unknown): string => ILS.format(Number(n) || 0);

export const lineQty = (x: CartEntry): number => Math.max(1, +x.qty || 1);
export const lineTotal = (x: CartEntry): number =>
  (+x.price || 0) * lineQty(x) * (x.kind === 'donation' && x.recurring ? Math.max(1, +(x.months ?? 1) || 1) : 1);
