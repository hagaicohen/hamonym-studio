import { Component, OnDestroy, OnInit, inject, input, output, signal, viewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { DonationService } from '../services/donation.service';
import { PaymentConfirmation, paymentConfirmation } from '../shared/components/checkout-v2/payment-confirmation';
import { StudioPaymentSession } from './studio-checkout';
import { OpenfieldsFormComponent } from '../../billing/components/openfields-form/openfields-form.component';
import { DonationPayload } from '../services/donation.service';

/** Reuses the platform's OpenFields and backend confirmation inside the Studio drawer. */
@Component({
  selector: 'app-studio-embedded-payment',
  standalone: true,
  imports: [OpenfieldsFormComponent],
  template: `
    @if (state() === 'paid') {
      <section class="payment-result" role="status"><strong>התשלום התקבל בהצלחה</strong><p>תודה על התמיכה בקמפיין.</p></section>
    } @else if (state() === 'failed') {
      <section class="payment-result" role="alert"><strong>התשלום לא הושלם</strong><p>אפשר לחזור לפרטים ולנסות שוב.</p></section>
    } @else {
      @if (!hideFields()) {
        <app-openfields-form [lowProfileId]="session().lowProfileId || ''"
          [cardOwnerName]="donor().name" [cardOwnerEmail]="donor().email" [cardOwnerPhone]="donor().phone" />
        <button type="button" class="pay" [disabled]="busy() || submitted() || !fields()?.isReady" (click)="pay()">{{ busy() ? 'התשלום מתבצע…' : submitted() ? 'ממתינים לאישור התשלום' : 'בצע תשלום מאובטח' }}</button>
        @if (error()) { <p role="alert">{{ error() }}</p> }
        @if (!recurring() && !submitted()) {
          <details><summary>אמצעי תשלום נוספים הזמינים במסוף</summary><p>רק אמצעי התשלום שהופעלו במסוף יוצגו. חלקם מחייבים מעבר לאפליקציה או חלון נפרד.</p><a [href]="session().url" target="_blank" rel="noopener noreferrer">פתיחת אותו תשלום בחלון Cardcom מאובטח</a></details>
        }
      } @else { <p role="status">בודקים את אישור התשלום מול השרת… אין לשלם שוב עד לקבלת התוצאה.</p> }
      @if (state() === 'uncertain') { <p role="status">לאחר השלמת התשלום בטופס אפשר לבדוק את האישור כאן. אין לשלם שוב אם התוצאה אינה ברורה.</p><button type="button" (click)="recheck()">בדוק אישור תשלום</button> }
    }
  `,
  styles: [`
    :host{display:block;min-width:0}.pay{width:100%;min-height:44px;border:0;border-radius:10px;background:#216e57;color:#fff;font:inherit;font-weight:700;margin-top:16px}.pay:disabled{opacity:.45}
    p,details{font-size:12px;line-height:1.7} summary,a{color:#216e57}details{margin-top:12px}
    .payment-result{padding:24px 0;text-align:center}.payment-result strong{font-size:18px;color:#216e57}
  `]
})
export class StudioEmbeddedPaymentComponent implements OnInit, OnDestroy {
  readonly session = input.required<StudioPaymentSession>();
  readonly donor = input.required<DonationPayload['donor']>();
  readonly recurring = input(false);
  readonly changed = output<PaymentConfirmation['state']>();
  readonly locked = output<boolean>();
  readonly state = signal<PaymentConfirmation['state']>('confirming');
  readonly submitted = signal(false);
  readonly hideFields = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fields = viewChild(OpenfieldsFormComponent);
  private readonly api = inject(DonationService);
  private subscription?: Subscription;

  ngOnInit(): void {
    const url = new URL(this.session().url);
    if (url.protocol !== 'https:' || !['secure.cardcom.solutions', 'secure.cardcom.co.il'].includes(url.hostname)) throw new Error('כתובת סליקה לא תקינה');
  }

  async pay(): Promise<void> {
    if (this.busy() || this.submitted() || !this.fields()?.isReady) return;
    this.busy.set(true); this.locked.emit(true); this.error.set('');
    const accepted = await this.fields()!.tokenize();
    this.busy.set(false);
    // A timeout is uncertain, not permission to create another charge.
    if (!accepted) { this.error.set(this.fields()?.lastError || 'לא התקבל אישור מ־Cardcom. יש לבדוק את תוצאת התשלום לפני ניסיון נוסף.'); }
    if (!accepted && this.fields()?.lastOutcome !== 'uncertain') {this.locked.emit(false);return;}
    this.hideFields.set(accepted);
    this.submitted.set(true);
    this.watch();
  }

  private watch(): void {
    this.subscription?.unsubscribe();
    this.subscription = paymentConfirmation(this.api, this.session().donationId).subscribe(result => {
      this.state.set(result.state);
      this.locked.emit(result.state==='confirming');
      this.changed.emit(result.state);
    });
  }

  recheck(): void { this.watch(); }

  ngOnDestroy(): void { this.subscription?.unsubscribe(); }
}
