import { DonationBoxComponent } from '../public-page/cards/donation-box.component';
import { CardData, safeLink } from '../public-page/cards/card-format';
import { StudioEmbeddedPaymentComponent } from '../../studio-embedded-payment.component';
import { StudioPaymentSession } from '../../studio-checkout';
import { RewardResponsibilityNoticeComponent } from '../../../shared/components/reward-responsibility-notice/reward-responsibility-notice.component';
import { AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, inject, input, output, signal, viewChild } from '@angular/core';
import { CartStoreService } from './cart-store.service';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { CartIconComponent } from './cart-icon.component';
import { CART_KIND_LABEL, CartEntry, DonationAmbassador, lineTotal } from './cart.types';
import { STUDIO_CHECKOUT } from '../../studio-checkout';
import { ToastService } from '../../../../../core/services/toast.service';
import { DONATION_DEDICATION_MAX_LENGTH, type DonationPayload } from '../../../services/donation.service';

/** Shared checkout UI. Only the public host supplies the real payment command. */
@Component({
  selector: 'ham-cart-dialog',
  standalone: true,
  imports: [DonationBoxComponent, RewardResponsibilityNoticeComponent, CartIconComponent, StudioEmbeddedPaymentComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./cart-dialog.component.css'],
  styles: [':host{display:contents}.ham-payment-spinner{display:inline-block;width:14px;height:14px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:hamPaymentSpin .7s linear infinite}@keyframes hamPaymentSpin{to{transform:rotate(360deg)}}'],
  template: `
<dialog #dialog id="hamUnifiedCartDialog" class="ham-cart-panel" [class.ham-cart-donation]="mode() === 'amount'" [attr.aria-label]="mode() === 'amount' ? 'בחרו סכום לתרומה' : 'סל הקניות של הקמפיין'"
  (click)="onBackdrop($event)" (cancel)="submitting() ? $event.preventDefault() : forgetPageFocus()" (close)="closed.emit()">
  <div class="ham-cart-shell" dir="rtl">
    <header class="ham-cart-top">
      @if (mode() === 'amount') { <h2 class="ham-donate-title">בחרו סכום לתרומה</h2> } @else {
      <div class="ham-cart-heading">
        <span class="ham-cart-mark"><ham-cart-icon /></span>
        <div><small>HAMONYM · סל משותף</small><h2>{{ mode() === 'cart' ? 'סל הקניות שלי' : 'סיכום ומעבר לתשלום' }}</h2></div>
      </div>
      }
      <button type="button" class="ham-cart-close" data-ham-cart-close [disabled]="submitting()" aria-label="סגירת הסל" (click)="close()">×</button>
    </header>

    <div class="ham-cart-body">
      @if (mode() === 'amount') {
        @if (donationAmbassador(); as ambassador) {
        <div class="ham-donation-body" data-ambassador-donation-drawer>
          <div class="ham-donation-attribution">
            <span class="ham-donation-avatar">
              @if (photo(ambassador.photo); as source) { <img [src]="source" alt=""> }
              @else { {{ initials(ambassador.name) }} }
            </span>
            <div><strong>התרומה שלכם באמצעות {{ ambassador.name }}</strong>
              <small>שגריר בקמפיין ״{{ ambassador.campaignTitle }}״</small></div>
          </div>
          <h3 class="ham-donation-label">סכום התרומה</h3>
          <div ham-donation-box #donationAmounts [inDrawer]="true" [donate]="amountSettings"
            (click)="chooseAmount($event)" (input)="updateAmount()"></div>
          @if (feedback()) { <p role="alert">{{ feedback() }}</p> }
        </div>
        }
      } @else if (mode() === 'cart') {
        <div class="ham-cart-lines">
          @for (x of cart.entries(); track x.uid; let i = $index) {
            <article class="ham-cart-row">
              <div class="ham-cart-row-kind">{{ kindLabel[x.kind] || 'פריט' }}</div>
              <div class="ham-cart-row-main">
                <div class="ham-cart-row-head">
                  <strong>{{ x.title }}</strong>
                  <button type="button" [attr.data-ham-cart-remove]="i" [attr.aria-label]="'הסר ' + x.title" title="הסר" (click)="cart.remove(i); render()">×</button>
                </div>
                @if (x.ambassadorName) { <small class="ham-cart-attribution">דרך {{ x.ambassadorName }}</small> }
                <small>{{ x.info || '' }}{{ x.kind === 'race' ? ' · ' + x.qty + ' משתתפים' : '' }}</small>
                <div class="ham-cart-row-bottom">
                  @if (x.kind === 'reward') {
                    <div class="ham-cart-qty" aria-label="כמות">
                      <button type="button" aria-label="הפחת כמות" (click)="cart.changeQty(i, -1); render()">−</button>
                      <b>{{ x.qty }}</b>
                      <button type="button" aria-label="הגדל כמות" (click)="cart.changeQty(i, 1); render()">+</button>
                    </div>
                  } @else {
                    <span class="ham-cart-unit">{{ unitLabel(x) }}</span>
                  }
                  <b>{{ money(total(x)) }}</b>
                </div>
              </div>
            </article>
          } @empty {
            <div class="ham-cart-empty">
              <span><ham-cart-icon /></span>
              <h3>הסל שלכם ריק</h3>
              <p>בחרו תרומה, תשורה או הרשמה למירוץ והפריטים יופיעו כאן.</p>
            </div>
          }
        </div>
        <div class="ham-cart-summary">
          <div><span>תשלום חד־פעמי</span><strong>{{ money(oneTimeAmount()) }}</strong></div>
          @for (group of paymentGroups(); track group.id) { @if(!group.id.startsWith('once:')){<div><span>{{ group.title }}</span><strong>{{ money(group.amount) }} לחודש</strong></div>} }
          @if (cart.hasRecurring()) {
            <small>החיובים החודשיים הבאים יתבצעו בהתאם לתקופה שנבחרה.</small>
          }
        </div>
      } @else if (mode() === 'payment') {
        <div class="ham-cart-checkout ham-cart-secure-payment">
          <div class="ham-cart-checkout-breakdown"><span>לתשלום כעת</span><strong>{{ money(paymentAmount()) }}</strong></div>
          @if (session(); as current) { <app-studio-embedded-payment [session]="current" [donor]="donorValue()!" [recurring]="paymentRecurring()" (changed)="paymentChanged($event)" (locked)="submitting.set($event)" /> }
        </div>
      } @else {
        <div class="ham-cart-checkout">
          <button type="button" class="ham-cart-back" data-ham-cart-back (click)="setMode('cart')">→ חזרה לסל</button>
          @if(paymentGroups().length>1){<p>הסל כולל חיובים נפרדים. משלימים כל חיוב בנפרד:</p><div class="ham-payment-groups">@for(group of paymentGroups();track group.id){<button type="button" [attr.aria-pressed]="selectedGroup()===group.id" (click)="chooseGroup(group.id)">{{group.title}} · {{money(group.amount)}}</button>}</div>}
          @for (entry of selectedEntries(); track entry.uid) {
            @if (entry.ambassadorName) { <p class="ham-cart-attribution">{{ entry.title }} · דרך {{ entry.ambassadorName }}</p> }
          }
          <p>פרטי הקשר להזמנה</p>
          <form #checkoutForm id="hamCartCheckoutForm" class="ham-cart-form" (submit)="$event.preventDefault(); finish()">
            <label>שם מלא<input autocomplete="name" name="fullName" required minlength="2" [value]="donorValue()?.name || ''" placeholder="שם פרטי ומשפחה"></label>
            <label>טלפון<input type="tel" autocomplete="tel" name="phone" required minlength="7" [value]="donorValue()?.phone || ''" placeholder="050-0000000"></label>
            <label>דוא״ל לקבלת סיכום<input type="email" autocomplete="email" name="email" required [value]="donorValue()?.email || ''" placeholder="name@example.com"></label>
            @if (selectedEntries().some(isMonthly)) { <label>מספר חיובים חודשיים (לא חובה)<input #months name="months" type="number" min="1" max="60" [value]="monthlyMonths()" placeholder="עד לביטול" (input)="setMonths(months.value)"><small>השאירו ריק לתרומה חודשית עד לביטול.</small></label> }
            @if (hasDonation()) {
              <label>ברכה לתרומה (אופציונלי)
                <textarea name="dedication" rows="3" [attr.maxlength]="dedicationLimit"
                  [value]="dedications()[selectedGroup()] ?? ''"
                  (input)="updateDedication($event)" placeholder="כתבו ברכה לתרומה"></textarea>
              </label>
            }
          </form>
          <div class="ham-cart-checkout-breakdown"><span>לתשלום כעת · {{ selectedCount() }} פריטים</span><strong>{{ money(selectedAmount()) }}</strong></div>

        </div>
      }
    </div>

    @if (cart.entries().some(isReward)) { <div class="ham-reward-responsibility"><app-reward-responsibility-notice /></div> }
    @if (feedback()) {
      <div #feedbackBox class="ham-cart-feedback" role="status">{{ feedback() }}</div>
    }

    @if (mode() !== 'cart' && mode() !== 'amount' && payment && !payment.preview) { <p class="ham-cart-security">תשלום מאובטח באמצעות Cardcom. מספר הכרטיס ו־CVV מוזנים בשדות המאובטחים של Cardcom בלבד.</p> }
    <footer class="ham-cart-footer">
      @if (mode() === 'amount') {
        <div class="ham-donation-submit">
          <button class="ham-cart-primary" type="button" [disabled]="!amountValid" (click)="continueDonation()">ממשיכים לתרומה</button>
          <small>התרומה תשויך לשגריר הנבחר</small>
        </div>
      } @else if (mode() === 'cart') {
        <button class="ham-cart-secondary" type="button" data-ham-cart-close (click)="close()">המשך בקמפיין</button>
        <button class="ham-cart-primary" type="button" data-ham-cart-checkout [disabled]="cart.entries().length === 0" (click)="setMode('checkout')">מעבר לתשלום <span>←</span></button>
      } @else if (mode() === 'payment') {
        @if(paymentState()==='paid' && cart.entries().length){<button class="ham-cart-primary" type="button" (click)="backAfterFailure()">המשך ליתר החיובים בסל</button>}
        @if (paymentState() === 'failed') { <button class="ham-cart-secondary" type="button" (click)="backAfterFailure()">חזרה לפרטי התרומה</button> }
        @else { <button class="ham-cart-secondary" type="button" (click)="close()">{{ paymentState() === 'paid' ? 'חזרה לקמפיין' : 'סגירה וחזרה לקמפיין' }}</button> }
      } @else {
        <button class="ham-cart-primary" type="button" data-ham-cart-finish [disabled]="!payment || payment.enabled?.() === false || submitting() || !cart.entries().length" [attr.title]="payment?.enabled?.() === false ? 'יש לפרסם את הקמפיין לפני שניתן לתרום לו' : null" [attr.aria-busy]="submitting()" (click)="finish()">@if (submitting()) { <span class="ham-payment-spinner" aria-hidden="true"></span> מכין תשלום מאובטח… } @else { המשך לתשלום <span>←</span> }</button>
      }
    </footer>
  </div>
</dialog>`
})
export class CartDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly cd = inject(ChangeDetectorRef);
  private destroyed = false;
  ngOnDestroy(): void { this.destroyed = true; }
  render(): void { if (!this.destroyed) this.cd.detectChanges(); }
  readonly payment = inject(STUDIO_CHECKOUT, { optional: true });
  private readonly toasts = inject(ToastService);
  readonly submitting = signal(false);
  readonly dedicationLimit = DONATION_DEDICATION_MAX_LENGTH;
  readonly dedications = signal<Record<string, string>>({});

  updateDedication(event: Event): void {
    const text = (event.target as HTMLTextAreaElement).value;
    const group = this.selectedGroup();
    this.dedications.update(notes => ({ ...notes, [group]: text }));
  }
  readonly cart = inject(CartStoreService);
  readonly checkout = input(false);
  readonly initialDedication = input<string>();
  readonly initialDonor = input<DonationPayload['donor'] | null>(null);
  donorValue(): DonationPayload['donor'] | null {
    const contact=this.cart.entries().find(entry=>entry.kind==='race')?.contact;
    return this.donor || this.initialDonor() || (contact?{name:String(contact.name||''),email:String(contact['email']||''),phone:String(contact['phone']||'')}:null);
  }
  readonly closed = output<void>();
  readonly mode = signal<'cart' | 'checkout' | 'payment' | 'amount'>('cart');
  readonly session = signal<StudioPaymentSession | null>(null);
  readonly paymentState = signal<'confirming' | 'uncertain' | 'paid' | 'failed'>('confirming');
  readonly paymentAmount = signal(0);
  private donor: DonationPayload['donor'] | null = null;
  paymentChanged(state: 'confirming' | 'uncertain' | 'paid' | 'failed'): void {
    this.paymentState.set(state);
    if (state === 'paid') {this.cart.entries.update(entries=>entries.filter(entry=>!this.paidEntries.includes(entry.uid)));this.group.set('');}
  }
  backAfterFailure(): void { this.session.set(null); this.setMode('checkout'); }
  readonly feedback = signal('');
  readonly kindLabel = CART_KIND_LABEL;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly checkoutForm = viewChild<ElementRef<HTMLFormElement>>('checkoutForm');

  readonly money = (value: unknown) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: this.payment?.currency || 'ILS', maximumFractionDigits: 2 }).format(Number(value) || 0);
  readonly total = (entry:CartEntry) => entry.price*entry.qty;
  readonly group = signal('');
  readonly paymentRecurring=signal(false);
  private paidEntries:string[]=[];
  readonly isMonthly=(entry:CartEntry)=>!!entry.recurring;
  readonly isReward=(entry:CartEntry)=>entry.kind==='reward';
  oneTimeAmount(): number {
    return this.cart.entries().filter(entry => !entry.recurring).reduce((sum, entry) => sum + entry.price * entry.qty, 0);
  }
  paymentGroups():Array<{id:string;title:string;amount:number}>{
    const groups = new Map<string, { id: string; title: string; amount: number }>();
    for (const entry of this.cart.entries()) {
      const id = this.entryPaymentGroup(entry);
      const amount = entry.price * entry.qty;
      const previous = groups.get(id);
      if (previous) previous.amount += amount;
      else groups.set(id, { id, title: entry.recurring ? entry.title + ' · חודשי' : 'תשלום חד־פעמי', amount });
    }
    const once = [...groups.values()].filter(group => group.id.startsWith('once:'));
    if (once.length > 1) once.forEach((group, index) => {
      group.title += group.id === 'once:' ? ' · ללא שיוך לשגריר' : ' · שיוך לשגריר ' + (index + 1);
    });
    return [...once, ...[...groups.values()].filter(group => !group.id.startsWith('once:'))];
  }
  selectedGroup(): string {
    const groups = this.paymentGroups();
    const selected = this.group();
    return groups.some(group => group.id === selected) ? selected : groups[0]?.id ?? '';
  }
  private entryPaymentGroup(entry: CartEntry): string {
    return entry.recurring ? entry.uid : 'once:' + (entry.ambassadorId ?? '');
  }
  selectedEntries(): CartEntry[] {
    const id = this.selectedGroup();
    return this.cart.entries().filter(entry => this.entryPaymentGroup(entry) === id);
  }
  selectedAmount():number{return this.selectedEntries().reduce((s,e)=>s+e.price*e.qty,0);}
  hasDonation(): boolean { return this.selectedEntries().some(entry => entry.kind === 'donation'); }
  selectedCount():number{return this.selectedEntries().reduce((s,e)=>s+e.qty,0);}
  chooseGroup(id:string):void{this.group.set(id);this.render();}
  monthlyMonths(): number | '' { return this.selectedEntries().find(entry => entry.recurring)?.months ?? ''; }
  setMonths(value: string): void {
    const months = value === '' ? undefined : Number(value);
    this.cart.entries.update(entries => entries.map(entry => entry.uid===this.selectedGroup() && entry.recurring ? { ...entry, months } : entry));
  }

  readonly donationAmbassador = input<DonationAmbassador>();
  readonly donationBox = viewChild<DonationBoxComponent>('donationAmounts');
  readonly donationElement = viewChild('donationAmounts', { read: ElementRef });
  amountSettings: CardData = {};
  amountValid = false;
  readonly photo = safeLink;

  ngOnInit(): void {
    if (this.donationAmbassador()) {
      this.amountSettings = {
        ...(this.parts.donationBox() ?? this.cart.campaign().content?.donate),
        boxLayout: 'grid', boxColumns: 3,
      };
      this.mode.set('amount');
    } else {
      this.mode.set(this.checkout() && this.cart.entries().length ? 'checkout' : 'cart');
      const note = this.initialDedication();
      if (note && this.mode() === 'checkout') this.dedications.set({ [this.selectedGroup()]: note });
    }
  }

  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(word => word.charAt(0)).join('');
  }

  chooseAmount(event: MouseEvent): void {
    const button = (event.target as Element).closest<HTMLButtonElement>('[data-donation-choice],[data-donation-other]');
    const box = this.donationBox();
    if (!button || !box) return;
    const key = button.hasAttribute('data-donation-other') ? 'other' : button.dataset['donationChoice'];
    if (!key) return;
    if (box.selected === key) {
      box.clear();
    } else {
      box.choose(key);
      box.showEntry(key === 'other');
    }
    this.updateAmount();
  }

  updateAmount(): void {
    const key = this.donationBox()?.selected;
    const element: HTMLElement | undefined = this.donationElement()?.nativeElement;
    const input = element?.querySelector<HTMLInputElement>('[data-donation-custom-input]');
    const value = key === 'other' ? Number((input?.value ?? '').replace(/[₪,\s]/g, ''))
      : key == null ? 0 : Number(this.amountSettings['boxAmounts']?.[Number(key)]?.amount);
    this.amountValid = Number.isFinite(value) && value > 0;
  }

  continueDonation(): void {
    const ambassador = this.donationAmbassador();
    if (!this.amountValid || !ambassador || !this.cart.addDonation(
      this.donationElement()?.nativeElement ?? null, ambassador, this.amountSettings['boxAmounts']
    )) return;
    this.setMode('cart');
  }

  /**
   * v4.53: the focus before the dialog opened, and the page's render then. The page is updated in place since
   * v4.53; until then a render while the dialog was open replaced the focused element of the page, and closing the
   * dialog could not return to it (the focus went to the document). So it still does not.
   */
  private readonly parts = inject(PublicPartsService);
  private openedAt = -1;
  private previous: Element | null = null;
  /** A render while open: the dialog does not return the focus into the page (the element it would return to was gone). */
  private pageRendered(): boolean {
    const preview = document.getElementById('preview');
    return this.parts.revision !== this.openedAt && !!preview && !!this.previous && preview.contains(this.previous);
  }
  /** Escape (the dialog closes itself): the page is inert while the dialog would return the focus there. */
  forgetPageFocus(): void {
    if (!this.pageRendered()) return;
    const preview = document.getElementById('preview')!;
    preview.inert = true;
    setTimeout(() => { preview.inert = false; });
  }

  ngAfterViewInit(): void {
    const dialog = this.dialog().nativeElement;
    this.previous = document.activeElement;
    this.openedAt = this.parts.revision;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('.ham-cart-close')?.focus({ preventScroll: true });
  }

  unitLabel(x: CartEntry): string {
    if (x.kind === 'donation' && x.recurring) return x.months ? `${x.months} חיובים חודשיים` : 'תרומה חודשית עד לביטול';
    if (x.kind === 'race') return x.qty + ' משתתפים';
    return 'פריט אחד';
  }

  setMode(mode: 'cart' | 'checkout'): void { if (!this.submitting()) { this.mode.set(mode); this.feedback.set(''); this.render(); } }
  close(): void {
    if (this.submitting()) return;
    const preview = this.pageRendered() ? document.getElementById('preview') : null;
    if (preview) preview.inert = true;
    try { this.dialog().nativeElement.close(); } finally { if (preview) preview.inert = false; }
  }
  onBackdrop(event: MouseEvent): void { if (event.target === this.dialog().nativeElement) this.close(); }

  async finish(): Promise<void> {
    if (!this.payment || this.payment.enabled?.() === false || this.submitting()) return;
    const form = this.checkoutForm()?.nativeElement;
    if (!form || !form.reportValidity()) return;
    const fields = new FormData(form);
    const donor = { ...this.donorValue(), name: String(fields.get('fullName') || '').trim(), phone: String(fields.get('phone') || '').trim(), email: String(fields.get('email') || '').trim() };
    if (donor.name.length < 2 || donor.phone.replace(/\D/g, '').length < 7) { this.toasts.show('warning', 'יש להשלים שם מלא ומספר טלפון תקין'); return; }
    this.submitting.set(true);
    this.render();
    try {
      this.donor = donor;
      this.paymentAmount.set(this.selectedAmount());
      this.paidEntries=this.selectedEntries().map(entry=>entry.uid);
      this.paymentRecurring.set(this.selectedEntries().some(this.isMonthly));
      const note = this.hasDonation()
        ? String(fields.get('dedication') || '').trim() || undefined : undefined;
      const session = await this.payment.submit(structuredClone(this.selectedEntries()), donor, note);
      if (this.destroyed) return;
      this.submitting.set(false);
      if (session) { this.session.set(session); this.paymentState.set('confirming'); this.mode.set('payment'); }
      this.render();
    }
    catch (error) {
      if (this.destroyed) return;
      this.submitting.set(false);
      const response = error as { error?: { error?: string }; message?: string };
      const message = response.error?.error || response.message || 'לא ניתן לפתוח תשלום כרגע. נסו שוב.';
      this.feedback.set(message);
      this.toasts.show('error', 'לא ניתן להמשיך לתשלום', message);
      this.render();
    }
  }
}
