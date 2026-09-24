import { Component, Input, Output, EventEmitter, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

// Embedded CardCom OpenFields checkout for a DONATION — isolated spike
// component (2026-09-24). NOT wired into CheckoutModalComponent, NOT
// referenced from any real checkout path yet. submitPayment() below is
// never invoked anywhere in this codebase — actual card entry / doTransaction
// / 3DS behavior has NOT been exercised. See the spike's own manual-test
// checklist for what still needs verifying by hand, in a real browser.
//
// Adapted from the proven, production-verified entity-billing tokenization
// flow (hamonym-app/.../billing/components/openfields-form/
// openfields-form.component.ts) — same postMessage protocol, same
// CardCom-hosted card/CVV iframes (secure.cardcom.solutions/api/openfields/*),
// so the donor's raw card number and CVV are typed directly into CardCom's
// own iframes and never touch this page's DOM/JS/network, identical to
// today's full-page-redirect flow's security posture.
//
// Deliberately narrower than that billing component in one specific way:
// this only needs `lowProfileId` as input. Verified directly against
// openfields-form.component.ts's own tokenize() — terminalNumber/apiName
// are stored there but never actually referenced inside the doTransaction
// postMessage payload, only `lowProfileCode` (i.e. this same LowProfileId)
// is. donations.service.js#createDonation's `embedded` response mirrors
// that — no terminal number, no API name, no credentials returned to the
// browser at all.
//
// Also deliberately does NOT make its own HTTP call to create a LowProfile
// (unlike openfields-form.component.ts's ngOnInit, which calls
// /api/billing/init-openfields itself) — for a donation, the LowProfile
// already exists by the time this component would be shown: created by
// donations.service.js#createDonation() itself (the same call that creates
// the pending donation row, sets up the recurring_instructions row for a
// monthly donation, and registers WebHookUrl) — this component is purely a
// presentation layer for a session that already exists.
const CARD_FIELD_CSS = `
  body{margin:0;padding:0;background:transparent;overflow:hidden;}
  .cardNumber{
    width:100%;height:54px;
    border:1px solid #dbe2ea;border-radius:16px;background:#ffffff;
    padding:0 16px;margin:0;box-sizing:border-box;
    font-size:17px;font-family:Arial,sans-serif;font-weight:500;color:#0f172a;
    direction:rtl;text-align:right;outline:none;line-height:54px;
    background-position:left 14px center !important;
  }
  .cardNumber:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.08);}
  .cardNumber.invalid{border-color:#dc2626;}
`;

const CVV_FIELD_CSS = `
  body{margin:0;padding:0;background:transparent;overflow:hidden;}
  .cvvField{
    width:100%;height:54px;
    border:1px solid #dbe2ea;border-radius:16px;background:#ffffff;
    padding:0 16px;margin:0;box-sizing:border-box;
    font-size:17px;font-family:Arial,sans-serif;font-weight:500;color:#0f172a;
    direction:rtl;text-align:right;outline:none;line-height:54px;
  }
  .cvvField:focus{border-color:#2563eb;box-shadow:0 0 0 4px rgba(37,99,235,.08);}
  .cvvField.invalid{border-color:#dc2626;}
`;

export interface EmbeddedCheckoutResult {
  success: boolean;
  internalDealNumber: string | null;
}

@Component({
  selector: 'app-embedded-openfields-checkout',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './embedded-openfields-checkout.component.html',
  styleUrl: './embedded-openfields-checkout.component.css',
})
export class EmbeddedOpenfieldsCheckoutComponent implements AfterViewInit, OnDestroy {
  // The only thing this component actually needs — see the file-level
  // comment above for why terminalNumber/apiName aren't inputs here.
  @Input({ required: true }) lowProfileId!: string;

  // Donor identity fields the doTransaction message needs — same data
  // CheckoutModalComponent already collects today (name/email/phone), just
  // not wired to this component yet.
  @Input() donorName = '';
  @Input() donorEmail = '';
  @Input() donorPhone = '';

  // Emitted from submitPayment() on a HandleSubmit/HandleEror response.
  // Never actually fired in this codebase yet — nothing calls
  // submitPayment().
  @Output() result = new EventEmitter<EmbeddedCheckoutResult>();

  cardIframeReady = false;
  cvvIframeReady = false;
  loading = false;
  errorMsg = '';

  private ready = false;
  private transactionStarted = false;

  ngAfterViewInit(): void {
    setTimeout(() => this.initMasterFrame(), 500);
  }

  private initMasterFrame(attempt = 0): void {
    const masterFrame = document.getElementById('DonationCardComMasterFrame') as HTMLIFrameElement | null;
    if (!masterFrame?.contentWindow) {
      if (attempt < 20) { setTimeout(() => this.initMasterFrame(attempt + 1), 200); return; }
      console.error('EMBEDDED OPENFIELDS SPIKE: master frame never became ready');
      return;
    }

    masterFrame.contentWindow.postMessage({
      action: 'init',
      cardFieldCSS: CARD_FIELD_CSS,
      cvvFieldCSS: CVV_FIELD_CSS,
      placeholder: '0000 0000 0000 0000',
      cvvPlaceholder: '123',
      lowProfileCode: this.lowProfileId,
    }, '*');

    this.ready = true;
    setTimeout(() => {
      this.cardIframeReady = true;
      this.cvvIframeReady = true;
    }, 350);
  }

  // NEVER CALLED anywhere in this codebase (2026-09-24 spike) — exists so
  // this component is structurally complete and buildable, mirroring
  // openfields-form.component.ts#tokenize() exactly, adapted for a
  // donation's expected result shape. Actual execution requires a real
  // browser with a donor typing a real card into CardCom's own iframe —
  // this environment cannot do that. See the spike's manual-test checklist.
  async submitPayment(): Promise<void> {
    if (!this.ready || !this.lowProfileId) {
      this.errorMsg = 'הטופס עדיין לא מוכן';
      return;
    }
    if (this.transactionStarted) return;

    const expirationMonth = (document.getElementById('donationExpirationMonth') as HTMLInputElement)?.value;
    const expirationYear  = (document.getElementById('donationExpirationYear')  as HTMLInputElement)?.value;

    const masterFrame = document.getElementById('DonationCardComMasterFrame') as HTMLIFrameElement | null;
    if (!masterFrame?.contentWindow) {
      this.errorMsg = 'שגיאה בטעינת טופס התשלום';
      return;
    }

    this.loading = true;
    this.errorMsg = '';

    const timeout = setTimeout(() => {
      this.transactionStarted = false;
      this.loading = false;
      this.errorMsg = 'תם הזמן הקצוב לתשלום, נסו שוב';
      window.removeEventListener('message', listener);
    }, 15000);

    const listener = (event: MessageEvent) => {
      if (!event?.data) return;
      const msg = event.data;

      if (msg?.action === 'HandleSubmit') {
        clearTimeout(timeout);
        this.transactionStarted = false;
        this.loading = false;
        window.removeEventListener('message', listener);

        const data = msg.data;
        const internalDealNumber = data?.InternalDealNumber || data?.TranzactionId || null;
        this.result.emit({ success: data?.IsSuccess === true, internalDealNumber });
        return;
      }

      if (msg?.action === 'HandleEror') {
        clearTimeout(timeout);
        this.transactionStarted = false;
        this.loading = false;
        this.errorMsg = 'אירעה שגיאה בעיבוד התשלום';
        window.removeEventListener('message', listener);
        this.result.emit({ success: false, internalDealNumber: null });
        return;
      }
    };

    window.addEventListener('message', listener);
    this.transactionStarted = true;

    masterFrame.contentWindow.postMessage({
      action: 'doTransaction',
      lowProfileCode: this.lowProfileId,
      cardOwnerId: '000000000',
      cardOwnerName: this.donorName,
      cardOwnerEmail: this.donorEmail,
      cardOwnerPhone: this.donorPhone,
      expirationMonth,
      expirationYear,
      // Never split into CC installments — same "no credit-limit capture"
      // principle already enforced for recurring donations (TotalNumOfBills
      // as a separate charge-count instruction, not this field).
      numberOfPayments: '1',
    }, '*');
  }

  ngOnDestroy(): void {
    // No persistent listener to remove — the one in submitPayment() is
    // self-removing (timeout or response), and since submitPayment() has
    // never been called in this spike, there's nothing to clean up here.
  }
}
