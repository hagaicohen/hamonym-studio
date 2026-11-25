import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, Injector, OnInit, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { CartStoreService } from './cart-store.service';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { CartIconComponent } from './cart-icon.component';
import { CART_KIND_LABEL, CartEntry, formatCurrency, lineTotal } from './cart.types';

/** The shared cart and its demo checkout step. */
@Component({
  selector: 'ham-cart-dialog',
  standalone: true,
  imports: [CartIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [':host{display:contents}'],
  template: `
<dialog #dialog id="hamUnifiedCartDialog" class="ham-cart-panel" aria-label="סל הקניות של הקמפיין"
  (click)="onBackdrop($event)" (cancel)="forgetPageFocus()" (close)="closed.emit()">
  <div class="ham-cart-shell" dir="rtl">
    <header class="ham-cart-top">
      <div class="ham-cart-heading">
        <span class="ham-cart-mark"><ham-cart-icon /></span>
        <div><small>HAMONYM · סל משותף</small><h2>{{ mode() === 'cart' ? 'סל הקניות שלי' : 'סיכום ומעבר לתשלום' }}</h2></div>
      </div>
      <button type="button" class="ham-cart-close" data-ham-cart-close aria-label="סגירת הסל" (click)="close()">×</button>
    </header>

    <div class="ham-cart-body">
      @if (mode() === 'cart') {
        <div class="ham-cart-lines">
          @for (x of cart.entries(); track x.uid; let i = $index) {
            <article class="ham-cart-row">
              <div class="ham-cart-row-kind">{{ kindLabel[x.kind] || 'פריט' }}</div>
              <div class="ham-cart-row-main">
                <div class="ham-cart-row-head">
                  <strong>{{ x.title }}</strong>
                  <button type="button" [attr.data-ham-cart-remove]="i" [attr.aria-label]="'הסר ' + x.title" title="הסר" (click)="cart.remove(i)">×</button>
                </div>
                <small>{{ x.info || '' }}{{ x.kind === 'race' ? ' · ' + x.qty + ' משתתפים' : '' }}</small>
                <div class="ham-cart-row-bottom">
                  @if (x.kind === 'reward') {
                    <div class="ham-cart-qty" aria-label="כמות">
                      <button type="button" aria-label="הפחת כמות" (click)="cart.changeQty(i, -1)">−</button>
                      <b>{{ x.qty }}</b>
                      <button type="button" aria-label="הגדל כמות" (click)="cart.changeQty(i, 1)">+</button>
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
          <div><span>סך ההזמנה{{ cart.hasRecurring() ? ' (כולל תשלומים עתידיים)' : '' }}</span><strong>{{ money(cart.grandTotal()) }}</strong></div>
          @if (cart.hasRecurring()) {
            <small>לתשלום כעת (הערכה): {{ money(cart.dueNow()) }} · יתרת התרומות החודשיות תחויב בעתיד, בכפוף למנגנון החיוב.</small>
          }
        </div>
      } @else {
        <div class="ham-cart-checkout">
          <button type="button" class="ham-cart-back" data-ham-cart-back (click)="setMode('cart')">→ חזרה לסל</button>
          <p>פרטי הקשר להזמנה</p>
          <form #checkoutForm id="hamCartCheckoutForm" class="ham-cart-form">
            <label>שם מלא<input autocomplete="name" name="fullName" required minlength="2" placeholder="שם פרטי ומשפחה"></label>
            <label>טלפון<input type="tel" autocomplete="tel" name="phone" required minlength="7" placeholder="050-0000000"></label>
            <label>דוא״ל לקבלת סיכום<input type="email" autocomplete="email" name="email" required placeholder="name@example.com"></label>
          </form>
          <div class="ham-cart-checkout-breakdown"><span>{{ cart.count() }} פריטים בסל</span><strong>{{ money(cart.grandTotal()) }}</strong></div>
          <p class="ham-cart-note">זוהי הדמיית תשלום בלבד. אין חיבור לסליקה, לא מתבצע חיוב ולא נרשמים משתתפים בשרת.</p>
        </div>
      }
    </div>

    @if (feedback()) {
      <div #feedbackBox class="ham-cart-feedback" role="status">{{ feedback() }}</div>
    }

    <footer class="ham-cart-footer">
      @if (mode() === 'cart') {
        <button class="ham-cart-secondary" type="button" data-ham-cart-close (click)="close()">המשך בקמפיין</button>
        <button class="ham-cart-primary" type="button" data-ham-cart-checkout [disabled]="cart.entries().length === 0" (click)="setMode('checkout')">מעבר לתשלום <span>←</span></button>
      } @else {
        <button class="ham-cart-primary" type="button" data-ham-cart-finish (click)="finish()">המשך לסליקה · הדגמה בלבד <span>←</span></button>
      }
    </footer>
  </div>
</dialog>`
})
export class CartDialogComponent implements OnInit, AfterViewInit {
  private readonly injector = inject(Injector);
  readonly cart = inject(CartStoreService);
  readonly checkout = input(false);
  readonly closed = output<void>();
  readonly mode = signal<'cart' | 'checkout'>('cart');
  readonly feedback = signal('');
  readonly kindLabel = CART_KIND_LABEL;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly checkoutForm = viewChild<ElementRef<HTMLFormElement>>('checkoutForm');
  private readonly feedbackBox = viewChild<ElementRef<HTMLElement>>('feedbackBox');

  readonly money = formatCurrency;
  readonly total = lineTotal;

  ngOnInit(): void { this.mode.set(this.checkout() && this.cart.entries().length ? 'checkout' : 'cart'); }

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
    if (x.kind === 'donation' && x.recurring) return `${x.months} תשלומים`;
    if (x.kind === 'race') return x.qty + ' משתתפים';
    return 'פריט אחד';
  }

  setMode(mode: 'cart' | 'checkout'): void { this.mode.set(mode); this.feedback.set(''); }
  close(): void {
    const preview = this.pageRendered() ? document.getElementById('preview') : null;
    if (preview) preview.inert = true;
    try { this.dialog().nativeElement.close(); } finally { if (preview) preview.inert = false; }
  }
  onBackdrop(event: MouseEvent): void { if (event.target === this.dialog().nativeElement) this.close(); }

  finish(): void {
    if (!this.checkoutForm()?.nativeElement.reportValidity()) return;
    this.feedback.set('הפרטים הוזנו בהצלחה להדגמה. בשלב זה אין סליקה פעילה, לא בוצע חיוב ולא נוצרה הזמנה.');
    afterNextRender(() => this.feedbackBox()?.nativeElement.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), { injector: this.injector });
  }
}
