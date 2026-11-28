import { ApplicationRef, EnvironmentInjector, Injectable, NgZone, createComponent, createEnvironmentInjector, inject } from '@angular/core';
import { Subject, firstValueFrom, takeUntil } from 'rxjs';
import { Router } from '@angular/router';
import { AmbassadorService } from '../services/ambassador.service';
import { CampaignApiService } from '../services/campaign-api.service';
import { CampaignDraft } from '../services/campaign-studio-state.service';
import { DONATION_DEDICATION_MAX_LENGTH, DonationPayload, DonationService } from '../services/donation.service';
import { StudioPaymentSession, STUDIO_CHECKOUT } from './studio-checkout';
import { CartDialogComponent } from './vendor-v462/cart/cart-dialog.component';
import { CartStoreService } from './vendor-v462/cart/cart-store.service';
import { CartCampaign, CartEntry } from './vendor-v462/cart/cart.types';

export interface PublicStudioCheckout {
  draft: CampaignDraft;
  amount: number;
  currency?: DonationPayload['currency'];
  recurring?: boolean;
  months?: number;
  ambassadorId?: string;
  rewards?: Array<{ id?: string; title: string; minimumAmount?: number }>;
  entries?: CartEntry[];
  donor?: DonationPayload['donor'];
}

/** Adapts the existing Studio cart UI to the existing platform donation API. */
@Injectable({ providedIn: 'root' })
export class SimpleStudioCheckoutService {
  private readonly app = inject(ApplicationRef);
  private readonly zone = inject(NgZone);
  private readonly environment = inject(EnvironmentInjector);
  private readonly api = inject(CampaignApiService);
  private readonly ambassadors = inject(AmbassadorService);
  private readonly donations = inject(DonationService);
  private readonly router = inject(Router);
  private handoff?: { id: string; entries: CartEntry[]; donor: DonationPayload['donor'] };
  private active?: { close(): void };

  open(options: PublicStudioCheckout): () => void {
    return this.zone.run(() => this.mount(options));
  }

  async continueOnPublicPage(draft: CampaignDraft, entries: CartEntry[], donor: DonationPayload['donor']): Promise<void> {
    if (!draft.id || draft.status !== 'published') throw new Error('יש לפרסם את הקמפיין לפני שניתן לתרום לו.');
    const campaign = await firstValueFrom(this.api.getBySlugPublic(draft.slug));
    if (campaign.id !== draft.id || campaign.status !== 'published') throw new Error('הקמפיין אינו זמין כעת לתרומות.');
    if (entries.some(entry => entry.kind !== 'donation' && !entry.businessId)) throw new Error('יש לבחור את התשורה או ההרשמה מחדש בדף הקמפיין.');
    // Contact information stays in memory, never in a URL or browser storage.
    this.handoff = { id: draft.id, entries: structuredClone(entries), donor: { ...donor } };
    try {
      if (!await this.router.navigate(['/campaigns', campaign.slug])) throw new Error('המעבר לדף הקמפיין בוטל. ניתן להמשיך לערוך.');
    } catch (error) { this.handoff = undefined; throw error; }
  }

  resumeOnPublicPage(draft: CampaignDraft): void {
    const pending = this.handoff;
    this.handoff = undefined;
    if (!pending || pending.id !== draft.id || draft.status !== 'published') return;
    this.open({ draft, amount: 0, entries: pending.entries, donor: pending.donor });
  }

  /** Shared by the public page's native cart and the legacy public checkout entry point. */
  paymentAdapter(options: PublicStudioCheckout): { submit: (entries: CartEntry[], donor: DonationPayload['donor'], note?: string) => Promise<StudioPaymentSession>; destroy(): void } {
    let disposed = false;
    const cancelled = new Subject<void>();
    const submit = this.paymentSubmit(options, cancelled, () => disposed);
    return { submit, destroy: () => { disposed = true; cancelled.next(); cancelled.complete(); } };
  }

  private paymentSubmit(options: PublicStudioCheckout, cancelled: Subject<void>, disposed: () => boolean): (entries: CartEntry[], donor: DonationPayload['donor'], note?: string) => Promise<StudioPaymentSession> {
    let pending = false;
    let existing: { session: StudioPaymentSession; terms: string; note?: string } | undefined;
    return async (entries: CartEntry[], donor: DonationPayload['donor'], note?: string): Promise<StudioPaymentSession> => {
      if (disposed()) throw new Error('חלון התשלום נסגר. יש לפתוח אותו מחדש.');
      if (pending) throw new Error('פתיחת התשלום כבר מתבצעת.');
      pending = true;
      try {
        // Public GET rechecks visibility and organization approval; never use an editor draft as eligibility proof.
        const campaign = await firstValueFrom(this.api.getBySlugPublic(options.draft.slug).pipe(takeUntil(cancelled)));
        if (disposed()) throw new Error('חלון התשלום נסגר.');
        if (campaign.id !== options.draft.id || campaign.status !== 'published') throw new Error('הקמפיין אינו זמין לתרומות כרגע.');
        if (!entries.length || entries.some(entry => !Number.isFinite(entry.price) || entry.price < 0 || (entry.kind === 'donation' && entry.price === 0) || !Number.isInteger(entry.qty) || entry.qty < 1 || entry.qty > 100)) throw new Error('יש לבחור סכום תרומה ופריטים תקינים.');

        const ambassadorIds = new Set(entries.map(entry => entry.ambassadorId ?? options.ambassadorId));
        if (ambassadorIds.size > 1) {
          throw new Error('יש לשלם בנפרד על פריטים המשויכים לשגרירים שונים או על תרומה ללא שיוך.');
        }
        const ambassadorId = ambassadorIds.values().next().value;
        if (ambassadorId) {
          const activeAmbassadors = await firstValueFrom(this.ambassadors.listPublic(campaign.slug, true).pipe(takeUntil(cancelled)))
            .catch(() => { throw new Error('לא ניתן לאמת כעת את שיוך השגריר. נסו שוב.'); });
          if (!activeAmbassadors.some(row => row.id === ambassadorId)) {
            throw new Error('השגריר שנבחר אינו פעיל בקמפיין. בחרו שגריר פעיל לפני התשלום.');
          }
        }
        const monthly = entries.filter(entry => entry.recurring);
        if (monthly.length && (entries.length !== 1 || monthly[0].kind !== 'donation' || monthly[0].qty !== 1)) throw new Error('יש להשלים תרומה חודשית בנפרד מתשורות ופריטים חד־פעמיים.');
        if (monthly.length && monthly[0].months !== undefined && (!Number.isInteger(monthly[0].months) || monthly[0].months! < 1 || monthly[0].months! > 60)) throw new Error('יש לבחור בין 1 ל־60 חיובים חודשיים, או להשאיר ללא הגבלה.');
        const participants: NonNullable<DonationPayload['participants']> = [];
        for(const entry of entries.filter(entry=>entry.kind==='race')){
          if(entry.participants?.length!==entry.qty)throw new Error('יש להשלים את פרטי כל המשתתפים במירוץ.');
          for(const person of entry.participants){
            const ref=String(person['registrationOptionId'] || entry.businessId || '');
            const option=campaign.registrationOptions.find(item=>item.id===ref || item.uid===ref);
            if(!option)throw new Error('מסלול ההרשמה אינו מקושר למסלול פעיל בקמפיין. יש לעדכן את הגדרות המירוץ.');
            const name=String(person.fullName || person['name'] || '').trim();
            if(!name || Number(entry.price)!==Number(option.price))throw new Error('פרטי ההרשמה או המחיר השתנו. יש לבחור את המסלול מחדש.');
            participants.push({name,registrationOptionId:option.id,shirtSize:typeof person['shirtSize']==='string'?person['shirtSize']:undefined});
          }
        }
        const rewards: DonationPayload['rewards'] = [];
        for (const entry of entries.filter(entry => entry.kind === 'reward')) {
          const reward = campaign.offerings.find(item => item.id === entry.businessId);
          if (!entry.businessId || !reward) throw new Error('התשורה אינה זמינה יותר. יש לרענן את הקמפיין ולבחור מחדש.');
          for (let i = 0; i < entry.qty; i++) rewards.push({ id: reward.id, title: reward.title, minimumAmount: reward.minimumAmount || 0 });
        }
        const amount = Math.round(entries.reduce((sum, entry) => sum + entry.price * entry.qty, 0) * 100) / 100;
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('יש לבחור סכום חיוב גדול מאפס.');
        const utmParams: Record<string, string> = {};
        new URLSearchParams(location.search).forEach((value, key) => { if (key.startsWith('utm_')) utmParams[key] = value; });
        const dedication = note?.trim() || undefined;
        if (dedication && dedication.length > DONATION_DEDICATION_MAX_LENGTH) throw new Error('הברכה ארוכה מדי.');
        const terms = JSON.stringify({ entries, donor, ambassadorId });
        if (existing) {
          const status = await firstValueFrom(this.donations.getStatus(existing.session.donationId).pipe(takeUntil(cancelled)));
          if (status.status === 'paid' && existing.terms === terms) throw new Error('התשלום כבר הושלם. אין לבצע אותו שוב.');
          if (status.status !== 'failed' && status.status !== 'paid') {
            if (existing.terms !== terms || existing.note !== dedication) throw new Error('קיים תשלום שטרם הושלם. יש להשלים או לברר אותו לפני שינוי פרטי התרומה.');
            return existing.session;
          }
          existing = undefined;
        }
        if (disposed()) throw new Error('חלון התשלום נסגר.');
        const result = await firstValueFrom(this.donations.create({ campaignId: campaign.id!, donor, amount, rewards, participants,
          currency: options.currency || 'ILS', recurring: monthly.length ? true : undefined,
          installments: monthly[0]?.months, ambassadorId, utmParams, embedded: true, note: dedication }).pipe(takeUntil(cancelled)));
        const url = new URL(result.url);
        if (!result.donationId || !result.lowProfileId || url.protocol !== 'https:' || !['secure.cardcom.solutions', 'secure.cardcom.co.il'].includes(url.hostname)) throw new Error('לא התקבלה כתובת תשלום מאובטחת ותקינה. לא התקבל אישור לתשלום.');
        // Keep the hosted LowProfile form inside the current drawer. The backend alone confirms payment.
        existing = { session: { ...result, url: url.href }, terms, note: dedication };
        return existing.session;
      } finally { pending = false; }
    };
  }

  private mount(options: PublicStudioCheckout): () => void {
    if (!options.draft.id || options.draft.status !== 'published') throw new Error('ניתן לתרום רק לקמפיין מפורסם. תצוגה מקדימה אינה מאפשרת חיוב.');
    if (this.active) return () => {};
    const payment = this.paymentAdapter(options);
    const submit = payment.submit;
    let disposed = false;
    const environment = createEnvironmentInjector([CartStoreService, { provide: STUDIO_CHECKOUT, useValue: { submit, currency: options.currency || 'ILS' } }], this.environment);
    const cart = environment.get(CartStoreService);
    cart.usePublicCampaign(options.draft.layout.simpleStudio as CartCampaign);
    const entries: CartEntry[] = (options.rewards || []).map((reward, index) => ({ uid: `reward-${index}`, kind: 'reward', title: reward.title, info: '', price: reward.minimumAmount || 0, qty: 1, businessId: reward.id }));
    if (options.amount > 0) entries.unshift({ uid: 'donation', kind: 'donation', title: options.recurring ? 'תרומה חודשית' : 'תרומה חד־פעמית', info: '', price: options.amount, qty: 1, recurring: options.recurring, months: options.months });
    cart.entries.set(options.entries ? structuredClone(options.entries) : entries);
    const dialog = createComponent(CartDialogComponent, { environmentInjector: environment });
    if (options.donor) { dialog.setInput('initialDonor', options.donor); dialog.setInput('checkout', true); }
    this.app.attachView(dialog.hostView);
    const host = dialog.location.nativeElement as HTMLElement;
    const layout = options.draft.layout;
    const accent = (layout.simpleStudio as { theme?: { primary?: string } } | undefined)?.theme?.primary
      || layout.theme.primaryColor || '#246f65';
    host.classList.add('hm-public-campaign-controls');
    host.style.setProperty('--hm-public-campaign-accent', accent);
    document.body.appendChild(host);
    const close = () => {
      if (disposed) return;
      disposed = true;
      payment.destroy();
      this.active = undefined;
      this.app.detachView(dialog.hostView);
      dialog.destroy();
      dialog.location.nativeElement.remove();
      environment.destroy();
    };
    this.active = { close };
    dialog.instance.closed.subscribe(close);
    dialog.changeDetectorRef.detectChanges();
    return close;
  }
}
