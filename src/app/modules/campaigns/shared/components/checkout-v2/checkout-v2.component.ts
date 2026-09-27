import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, HostBinding, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import {
  CampaignDraft, Offering,
  DonorFieldsConfig, DEFAULT_DONOR_FIELDS,
} from '../../../services/campaign-studio-state.service';
import { DonationService } from '../../../services/donation.service';
import { AnalyticsService } from '../../../../../core/services/analytics.service';
import { Ambassador } from '../../../services/ambassador.service';
import { sanitizeRichHtml } from '../../../../../shared/utils/sanitize-rich-html';
import { CHECKOUT_V2_OPENFIELDS_ENABLED } from '../../config/checkout-v2.config';
import { OpenfieldsFormComponent } from '../../../../billing/components/openfields-form/openfields-form.component';

// Checkout V2 (2026-09-24) — the real, continuous 3-step donation checkout
// (סכום → פרטים אישיים → תשלום) behind CHECKOUT_V2_ENABLED. Deliberately a
// brand-new, self-contained component that never imports or modifies
// CheckoutModalComponent — that's the whole reversibility mechanism: turning
// the flag off means this file is simply never rendered, the old modal is
// untouched. Donation-only (registration/pendingRegistration are explicitly
// out of scope — see the parent templates' own guards on checkoutMode).
//
// Reuses, rather than re-implements:
//  - DonationService.create() for the actual financial call (same backend
//    contract as the old modal, just with embedded:true).
//  - Step 3's payment surface (2026-09-26) — CardCom's own hosted
//    LowProfile checkout page (res.url, the exact same field the proven
//    redirect flow already uses), framed inline via <iframe> instead of a
//    full-page navigation. No X-Frame-Options/CSP frame-ancestors on
//    that page (confirmed). Styled to read as part of Hamonym's own UI via
//    UIDefinition.CSSUrl on the LowProfile/Create call itself (confirmed
//    already enabled on this entity's CardCom account — see
//    donations.service.js#createDonation and hamonym-app/public/
//    cardcom-embed.css). An earlier OpenFields-based Step 3 attempt was
//    abandoned as apparently CardCom-account-specific; that conclusion was
//    later found to actually be a race condition in
//    OpenfieldsFormComponent's own init lifecycle (fixed 2026-09-26, see its
//    header comment) — not a CardCom-side limitation. OpenFields is
//    reintroduced here behind CHECKOUT_V2_OPENFIELDS_ENABLED — active by
//    default (2026-09-27) after a real controlled TEST donation verified
//    the full chain end-to-end (see checkout-v2.config.ts's own doc
//    comment); the hosted iframe above remains in the code, untouched, as
//    the instant-rollback path if the flag is set back to false.
//  - donor-field validation logic (name/email/phone/idNumber/address/
//    postalCode), ported from CheckoutModalComponent's own getters — small
//    enough that duplicating it here is cheaper than extracting a shared
//    base class for a single call site each.
//  - the amount/frequency/installments picker logic, ported from
//    MinimalDonationPageComponent (the only place a donor-chosen
//    installments picker already existed) — now owned by the checkout
//    itself (Step 1) instead of the donation page, since it must be
//    editable from inside a shared drawer for both minimal and full
//    campaigns (full campaigns never had this picker before this).
//  - the existing DonationSuccessComponent route/page for the hosted flow's
//    true "thank you" moment (campaigns/:slug/success?ref=&amount=),
//    reached via CardCom's own SuccessRedirectUrl → onHostedCheckoutMessage
//    below — unchanged. The OpenFields flow (2026-09-27, final revision)
//    does NOT navigate there at all: it shows an inline success state
//    inside this same Drawer instead (see paymentState's own doc comment
//    and Step 3's #cv2PaidBlock in the template), only once the backend
//    itself confirms donations.status='paid' — HandleSubmit's own
//    IsSuccess is CardCom's word on the CHARGE, never treated as
//    authoritative for that status.
@Component({
  selector: 'app-checkout-v2',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, OpenfieldsFormComponent],
  templateUrl: './checkout-v2.component.html',
  styleUrl: './checkout-v2.component.css',
})
export class CheckoutV2Component implements OnInit, OnDestroy {
  // 'drawer' (default) — the original overlay-on-top-of-a-page presentation,
  // used by CampaignPreviewComponent (full campaigns) exactly as before.
  // 'page' (2026-09-24) — IS the donation page itself: no backdrop, no
  // fixed/locked viewport, no close button, normal in-page scroll with a
  // sticky header/footer instead of an internally-scrolled fixed drawer.
  // Used by MinimalDonationPageComponent, which used to show its own
  // amount-picker+CTA and THEN open this component as a second, redundant
  // interface in a drawer — the actual bug this input fixes.
  @Input() presentation: 'drawer' | 'page' = 'drawer';
  // Builder live-preview only, same meaning/pattern as
  // MinimalDonationPageComponent's own [embedded] — the ancestor chain down
  // to the preview panel is a real, definite-height layout, not the actual
  // browser viewport, so height:100% is used there instead of 100dvh.
  @Input() embedded = false;

  @HostBinding('style.height') get hostHeight(): string | null {
    return this.embedded ? '100%' : null;
  }

  @Input() draft!: CampaignDraft;
  // Initial state only — the donor can freely change amount/frequency/
  // installments in Step 1 regardless of what the page had pre-selected.
  @Input() initialAmount = 0;
  @Input() initialFrequency: 'one-time' | 'monthly' = 'one-time';
  @Input() initialInstallments: number | null = null;
  // Offerings ("תשורות") already selected on the page itself, same as
  // CheckoutModalComponent's own [cartOfferings] — informational + added on
  // top of the donor-picked amount, never editable from inside checkout.
  @Input() cartOfferings: Offering[] = [];
  @Input() entityLogoUrl: string | null = null;
  @Input() entityName = '';
  @Input() ambassador: Ambassador | null = null;

  @Output() closed = new EventEmitter<void>();

  // Template-exposed so Step 3's *ngIf branches can read it directly.
  readonly CHECKOUT_V2_OPENFIELDS_ENABLED = CHECKOUT_V2_OPENFIELDS_ENABLED;

  @ViewChild(OpenfieldsFormComponent) openfieldsForm?: OpenfieldsFormComponent;

  private donationService = inject(DonationService);
  private analytics       = inject(AnalyticsService);
  private sanitizer       = inject(DomSanitizer);
  private router          = inject(Router);

  // Same sanitize-then-bypass pattern MinimalDonationPageComponent already
  // uses for this exact field (its own richHtml()) — reused verbatim.
  richHtml(html: string | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeRichHtml(html || ''));
  }

  step: 1 | 2 | 3 = 1;

  // ── Step 1 — amount ──────────────────────────────────────────────
  donationFrequency: 'one-time' | 'monthly' = 'one-time';
  selectedAmount: number | null = null;
  customAmount: number | null = null;
  amountDisplay = '';

  // Same 3/6/12/24 + custom, no-default-preselection picker already proven
  // on MinimalDonationPageComponent — ported verbatim (see its own doc
  // comment on why no default is ever auto-selected).
  readonly INSTALLMENT_OPTIONS = [3, 6, 12, 24];
  selectedInstallments: number | null = null;
  customInstallmentsInput = '';

  ngOnInit(): void {
    // Page mode IS the page — nothing behind it to lock scroll against.
    if (this.presentation === 'drawer') document.body.style.overflow = 'hidden';
    this.donationFrequency = this.initialFrequency;
    this.selectedAmount = this.initialAmount > 0 ? this.initialAmount : null;
    this.selectedInstallments = this.initialInstallments;
    window.addEventListener('message', this.boundHostedCheckoutMessage);
  }

  ngOnDestroy(): void {
    if (this.presentation === 'drawer') document.body.style.overflow = '';
    window.removeEventListener('message', this.boundHostedCheckoutMessage);
    if (this.confirmPollTimer) clearTimeout(this.confirmPollTimer);
    if (this.receiptPollTimer) clearTimeout(this.receiptPollTimer);
  }

  // Step 3's iframe/postMessage bridge (2026-09-26) — CardCom's hosted
  // checkout runs inside the iframe; once its Success/FailedRedirectUrl
  // chain lands back on our own origin (donation-success.component.ts /
  // campaign-public-page.component.ts's own doc comments), that page
  // posts a bare {source,status} signal here rather than us trying to read
  // the iframe's own location (impossible while it's still on CardCom's
  // cross-origin domain, and unnecessary once it's back on ours — this
  // component already knows its own donationId/chargeAmount). Strictly
  // validated to same-origin messages only; anything else (including
  // CardCom's own domain during the payment step itself) is ignored.
  private boundHostedCheckoutMessage = this.onHostedCheckoutMessage.bind(this);
  private onHostedCheckoutMessage(event: MessageEvent): void {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.source !== 'hamonym-donation-return') return;

    if (event.data.status === 'success') {
      if (!this.donationId) return;
      this.router.navigate(['/campaigns', this.draft.slug, 'success'], {
        queryParams: { ref: this.donationId, amount: this.chargeAmount },
      });
      return;
    }

    if (event.data.status === 'failed') {
      // Don't silently retry the same (now-spent) LowProfile — back to
      // Step 2 with a visible error; clicking "המשך לתשלום" again creates
      // a fresh donation/LowProfile through the existing, unmodified flow.
      // The old pending row is left abandoned, exactly as already
      // tolerated for the pre-Checkout-V2 redirect flow (see
      // canReuseExistingDonation's own doc comment).
      this.hostedCheckoutUrl = null;
      this.donationId = null;
      this.createdTermsSnapshot = null;
      this.createDonationError = 'התשלום נכשל, נסו שוב';
      this.step = 2;
    }
  }

  amountsFor(): number[] {
    return this.donationFrequency === 'monthly' ? this.draft.monthlyAmounts : this.draft.suggestedAmounts;
  }

  selectAmount(amount: number): void {
    this.selectedAmount = amount;
    this.customAmount = null;
    this.amountDisplay = '';
  }

  selectFrequency(freq: 'one-time' | 'monthly'): void {
    if (this.donationFrequency === freq) return;
    this.donationFrequency = freq;
    // Presets differ between the two lists — same reset campaign-preview's
    // own selectFrequency() already does, forcing an explicit re-pick
    // instead of silently carrying over a value from the other list.
    this.selectedAmount = null;
    this.customAmount = null;
    this.amountDisplay = '';
    this.selectedInstallments = null;
    this.customInstallmentsInput = '';
  }

  onCustomAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^\d]/g, '');
    const num = raw ? parseInt(raw, 10) : null;
    this.customAmount = num && num > 0 ? num : null;
    this.amountDisplay = num ? num.toLocaleString('he-IL') : '';
    const formatted = this.amountDisplay;
    requestAnimationFrame(() => { input.value = formatted; });
    if (this.customAmount) this.selectedAmount = null;
  }

  isAmountSelected(amount: number): boolean {
    return this.selectedAmount === amount && this.customAmount === null;
  }

  // A highlighted-but-unclicked amount is never consent — same invariant as
  // MinimalDonationPageComponent/CampaignPreviewComponent's own explicitAmount.
  get explicitAmount(): number {
    if (this.customAmount) return this.customAmount;
    if (this.selectedAmount !== null) return this.selectedAmount;
    return 0;
  }

  get cartOfferingsTotal(): number {
    return this.cartOfferings.reduce((sum, o) => sum + (o.minimumAmount || 0), 0);
  }

  // The actual payable/chargeable total — donor-picked amount plus whatever
  // offerings were already selected on the page before checkout opened.
  // Ownership of amount-selection moved into this component (Step 1 is
  // editable), so — unlike the old modal, which just displayed a
  // pre-combined number handed to it — this has to keep re-deriving the
  // combined total itself as the donor edits Step 1.
  get chargeAmount(): number {
    return this.explicitAmount + this.cartOfferingsTotal;
  }

  selectInstallments(n: number): void {
    this.selectedInstallments = n;
    this.customInstallmentsInput = '';
  }

  onCustomInstallmentsInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^\d]/g, '');
    const num = raw ? parseInt(raw, 10) : null;
    this.customInstallmentsInput = num ? String(num) : '';
    const formatted = this.customInstallmentsInput;
    requestAnimationFrame(() => { input.value = formatted; });
    this.selectedInstallments = num && num > 0 ? num : null;
  }

  isInstallmentsSelected(n: number): boolean {
    return this.selectedInstallments === n && !this.customInstallmentsInput;
  }

  // Same 1–60 bound the backend enforces — kept in sync deliberately.
  get hasValidInstallments(): boolean {
    return this.selectedInstallments !== null && this.selectedInstallments >= 1 && this.selectedInstallments <= 60;
  }

  // Header logo/title alignment (2026-09-24) — independently configurable,
  // each its own row; undefined defaults to center, same convention as the
  // rest of the minimal-page layout config.
  get logoAlign(): 'right' | 'center' | 'left' {
    return this.draft?.layout?.minimalHeaderLogoAlign ?? 'center';
  }
  get titleAlign(): 'right' | 'center' | 'left' {
    return this.draft?.layout?.minimalHeaderTitleAlign ?? 'center';
  }
  get subtitleAlign(): 'right' | 'center' | 'left' {
    return this.draft?.layout?.minimalHeaderSubtitleAlign ?? 'center';
  }

  get step1Valid(): boolean {
    return this.explicitAmount > 0 && (this.donationFrequency !== 'monthly' || this.hasValidInstallments);
  }

  // "X ₪ לחודש × N חודשים" — never a bare amount for a monthly commitment
  // (2026-09-24 requirement, carried through from the old modal's own
  // payButtonLabel). Shown in the sticky footer on every step once an
  // amount is chosen.
  get commitmentText(): string {
    const amt = this.chargeAmount;
    if (!amt) return '';
    if (this.donationFrequency === 'monthly') {
      return this.hasValidInstallments
        ? `₪${amt.toLocaleString('he-IL')} לחודש × ${this.selectedInstallments} חודשים`
        : `₪${amt.toLocaleString('he-IL')} לחודש`;
    }
    return `₪${amt.toLocaleString('he-IL')}`;
  }

  goToStep2(): void {
    if (!this.step1Valid) return;
    this.step = 2;
  }

  // ── Step 2 — donor details ───────────────────────────────────────
  name = '';
  email = '';
  phone = '';
  address = '';
  postalCode = '';
  idNumber = '';
  submitted = false;

  // Optional donor UX capabilities (2026-09-24) — both reuse existing,
  // already-supported backend fields (donations.is_anonymous, .note); see
  // donation.service.ts's own doc comments on each. Dedication starts
  // collapsed (dedicationEnabled=false) — an optional, secondary section,
  // never a required field.
  isAnonymous = false;
  dedicationEnabled = false;
  dedicationText = '';
  readonly DEDICATION_MAX_LENGTH = 300;

  get donorFields(): DonorFieldsConfig {
    return { ...DEFAULT_DONOR_FIELDS, ...(this.draft?.donorFields ?? {}) };
  }

  get idDigits(): string {
    return this.idNumber.replace(/\D/g, '');
  }

  get isValidId(): boolean {
    const raw = this.idDigits;
    if (raw.length < 5 || raw.length > 9) return false;
    const digits = raw.padStart(9, '0');
    let total = 0;
    for (let i = 0; i < 9; i++) {
      let n = parseInt(digits[i]) * ((i % 2) + 1);
      if (n > 9) n -= 9;
      total += n;
    }
    return total % 10 === 0;
  }

  get idLiveState(): 'idle' | 'valid' | 'invalid' {
    if (this.idDigits.length === 0) return 'idle';
    if (this.idDigits.length < 5) return 'idle';
    return this.isValidId ? 'valid' : 'invalid';
  }

  // ID number is optional in Checkout V2 (2026-09-27) — not gated behind
  // donorFields.showIdNumber (see the field's own template comment): empty
  // is always valid, a non-empty value must pass the checksum. Whether to
  // make it required is an explicit future business/product decision, not
  // inferred here.
  get idNumberValid(): boolean {
    return this.idDigits.length === 0 || this.isValidId;
  }

  get isValidEmail(): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim());
  }

  get step2Valid(): boolean {
    const df = this.donorFields;
    return this.name.trim().length > 1
      && this.isValidEmail
      && this.phone.trim().length >= 9
      && (!df.showAddress    || this.address.trim().length > 2)
      && (!df.showPostalCode || this.postalCode.trim().length >= 4)
      && this.idNumberValid;
  }

  private captureUtmParams(): Record<string, string> | undefined {
    const search = new URLSearchParams(window.location.search);
    const keys = ['utm_source', 'utm_medium', 'utm_campaign'] as const;
    const params: Record<string, string> = {};
    for (const key of keys) {
      const value = search.get(key);
      if (value) params[key.replace('utm_', '')] = value;
    }
    return Object.keys(params).length > 0 ? params : undefined;
  }

  // ── Step 3 — payment / Donation+LowProfile lifecycle ────────────
  // Created exactly once per distinct set of financial terms (amount,
  // frequency, installments) — see canReuseExistingDonation(). Step3→2→3
  // navigation and donor-detail-only edits reuse the same donation/
  // LowProfile; changing the amount/frequency/duration after a LowProfile
  // was already created creates a NEW donation instead of silently
  // reusing a now-incompatible session — the old one is simply left as an
  // abandoned pending row, exactly as already happens today whenever a
  // donor abandons the existing redirect flow before completing payment
  // (see test-stale-pending-donations.js — an already-tolerated, already-
  // reconciled state, not new behavior).
  donationId: string | null = null;
  // CardCom's own hosted LowProfile checkout page (res.url — the same field
  // the proven redirect flow already uses), framed instead of navigated to.
  // No X-Frame-Options/CSP frame-ancestors on that page (confirmed via
  // curl). Styled via UIDefinition.CSSUrl — see donations.service.js and
  // cardcom-embed.css.
  hostedCheckoutUrl: SafeResourceUrl | null = null;
  // OpenFields path only (CHECKOUT_V2_OPENFIELDS_ENABLED) — the same
  // LowProfile POST /api/donations already returns as res.lowProfileId,
  // handed straight to OpenfieldsFormComponent's own [lowProfileId] input.
  lowProfileId: string | null = null;
  private createdTermsSnapshot: { amount: number; frequency: 'one-time' | 'monthly'; installments: number | null } | null = null;
  creatingDonation = false;
  createDonationError = '';

  // OpenFields payment lifecycle (2026-09-27, final revision) — CardCom's
  // own HandleSubmit succeeding (tokenize()===true) is NOT authoritative for
  // donations.status; only the webhook/GetLpResult/Gate-v1/markDonationPaid
  // pipeline in payment.handler.js ever writes 'paid'. The donor must never
  // see a donation declared successful before the backend itself confirms
  // it, but also must never be told it failed while the outcome is merely
  // still unknown — either would risk a duplicate charge (retrying after a
  // false "failed") or a false promise (celebrating before 'paid' is real).
  //   'idle'       — Step 3, ready for (or after a declined) submit attempt.
  //   'processing' — tokenize() in flight (the CardCom round-trip itself).
  //   'confirming' — HandleSubmit succeeded; polling GET
  //                  /api/donations/public/:id for the real backend status.
  //   'uncertain'  — the short foreground confirmation window elapsed with
  //                  the donation still 'pending' at our own DB (NOT
  //                  declared failed) — background polling continues
  //                  quietly in case it resolves while the drawer stays
  //                  open; never re-enables payment while in this state.
  //   'paid'       — backend confirmed 'paid' — inline Thank You replaces
  //                  Step 3's content (see the template).
  paymentState: 'idle' | 'processing' | 'confirming' | 'uncertain' | 'paid' = 'idle';
  // Populated once available (either immediately with 'paid', or via the
  // quiet post-paid poll below) — drives the inline receipt link/action.
  receiptId: string | null = null;

  private confirmPollTimer: ReturnType<typeof setTimeout> | null = null;
  private confirmPollAttempts = 0;
  private readonly CONFIRM_POLL_INTERVAL_MS = 1000;
  // ~15s of visible "מאשרים את התרומה..." — long enough for ordinary
  // webhook delivery, short enough to still feel like one transaction.
  private readonly CONFIRM_FOREGROUND_ATTEMPTS = 15;
  // After the foreground window, keep trying quietly (slower) for a good
  // while longer, in case the donor just leaves the drawer open — total
  // background budget below is on top of the foreground attempts.
  private readonly CONFIRM_BACKGROUND_INTERVAL_MS = 5000;
  private readonly CONFIRM_BACKGROUND_ATTEMPTS = 48;

  private receiptPollTimer: ReturnType<typeof setTimeout> | null = null;
  private receiptPollAttempts = 0;
  private readonly RECEIPT_POLL_INTERVAL_MS = 3000;
  private readonly RECEIPT_POLL_MAX_ATTEMPTS = 20;

  get formattedChargeAmount(): string {
    return '₪' + this.chargeAmount.toLocaleString('he-IL');
  }

  // A genuine CardCom-side decline (HandleSubmit IsSuccess=false) — the
  // LowProfile session itself is still valid (OpenfieldsFormComponent's own
  // transactionStarted guard resets on every terminal outcome, confirmed
  // against its tokenize()), so this deliberately does NOT create a new
  // Donation/LowProfile: same donationId/lowProfileId, donor fixes their
  // card details and tries again on the exact same OpenFields session.
  private resetAfterCardComDecline(): void {
    this.paymentState = 'idle';
    this.createDonationError = 'התשלום לא הושלם. בדקו את פרטי הכרטיס ונסו שוב.';
  }

  // A definitive backend-side failure signal (donations.status='failed') —
  // unlike a CardCom decline, this means something is wrong with this
  // donation/LowProfile itself; same "don't retry the same spent
  // LowProfile" semantics as onHostedCheckoutMessage's own failure branch.
  private resetAfterBackendFailure(): void {
    this.clearConfirmPoll();
    this.paymentState = 'idle';
    this.lowProfileId = null;
    this.donationId = null;
    this.createdTermsSnapshot = null;
    this.createDonationError = 'התשלום נכשל, נסו שוב';
    this.step = 2;
  }

  private clearConfirmPoll(): void {
    if (this.confirmPollTimer) clearTimeout(this.confirmPollTimer);
    this.confirmPollTimer = null;
  }

  private startPaymentConfirmation(): void {
    this.paymentState = 'confirming';
    this.confirmPollAttempts = 0;
    this.pollConfirmation();
  }

  private pollConfirmation(): void {
    if (!this.donationId) return;
    const donationId = this.donationId;
    this.donationService.getStatus(donationId).subscribe({
      next: (res) => {
        // Stale response for a donation this component has already moved
        // on from — ignore rather than act on an outdated poll.
        if (this.donationId !== donationId) return;

        if (res.status === 'paid') {
          this.paymentState = 'paid';
          this.receiptId = res.receipt_id;
          if (!res.receipt_id) this.scheduleQuietReceiptPoll(donationId);
          return;
        }
        if (res.status === 'failed') {
          this.resetAfterBackendFailure();
          return;
        }
        this.scheduleNextConfirmPoll();
      },
      // A transient network error polling our own backend isn't a payment
      // failure — keep trying within the same bounded window.
      error: () => this.scheduleNextConfirmPoll(),
    });
  }

  private scheduleNextConfirmPoll(): void {
    this.confirmPollAttempts++;
    const totalBudget = this.CONFIRM_FOREGROUND_ATTEMPTS + this.CONFIRM_BACKGROUND_ATTEMPTS;
    if (this.confirmPollAttempts >= totalBudget) return; // quietly stop -- reconciliation covers the rest

    const stillForeground = this.confirmPollAttempts < this.CONFIRM_FOREGROUND_ATTEMPTS;
    this.paymentState = stillForeground ? 'confirming' : 'uncertain';
    const interval = stillForeground ? this.CONFIRM_POLL_INTERVAL_MS : this.CONFIRM_BACKGROUND_INTERVAL_MS;
    this.confirmPollTimer = setTimeout(() => this.pollConfirmation(), interval);
  }

  private scheduleQuietReceiptPoll(donationId: string): void {
    this.receiptPollTimer = setTimeout(() => this.pollQuietReceipt(donationId), this.RECEIPT_POLL_INTERVAL_MS);
  }

  private pollQuietReceipt(donationId: string): void {
    if (this.donationId !== donationId) return;
    this.donationService.getStatus(donationId).subscribe({
      next: (res) => {
        if (this.donationId !== donationId) return;
        if (res.receipt_id) { this.receiptId = res.receipt_id; return; }
        this.receiptPollAttempts++;
        if (this.receiptPollAttempts < this.RECEIPT_POLL_MAX_ATTEMPTS) this.scheduleQuietReceiptPoll(donationId);
      },
      error: () => {
        this.receiptPollAttempts++;
        if (this.receiptPollAttempts < this.RECEIPT_POLL_MAX_ATTEMPTS) this.scheduleQuietReceiptPoll(donationId);
      },
    });
  }

  private canReuseExistingDonation(): boolean {
    if (!this.donationId || !this.createdTermsSnapshot) return false;
    if (CHECKOUT_V2_OPENFIELDS_ENABLED ? !this.lowProfileId : !this.hostedCheckoutUrl) return false;
    const s = this.createdTermsSnapshot;
    return s.amount === this.chargeAmount
      && s.frequency === this.donationFrequency
      && s.installments === (this.donationFrequency === 'monthly' ? this.selectedInstallments : null);
  }

  goToStep3(): void {
    this.submitted = true;
    if (!this.step2Valid || this.creatingDonation) return;
    if (this.canReuseExistingDonation()) {
      this.step = 3;
      return;
    }
    this.createDonationAndAdvance();
  }

  private createDonationAndAdvance(): void {
    if (!this.draft?.id) {
      this.createDonationError = 'לא ניתן לעבד תשלום — הקמפיין אינו פעיל';
      return;
    }

    this.creatingDonation = true;
    this.createDonationError = '';
    const df = this.donorFields;

    this.donationService.create({
      campaignId: this.draft.id,
      donor: {
        name:       this.name.trim(),
        email:      this.email.trim(),
        phone:      this.phone.trim(),
        // Optional in Checkout V2 regardless of df.showIdNumber (see the
        // Step 2 field's own template comment) — this.idDigits is '' when
        // not entered, matching the existing empty-string convention below.
        idNumber:   this.idDigits,
        address:    df.showAddress    ? this.address.trim()               : '',
        postalCode: df.showPostalCode ? this.postalCode.trim()            : '',
        isAnonymous: this.isAnonymous,
      },
      amount: this.chargeAmount,
      rewards: this.cartOfferings.map(o => ({
        id:            o.id,
        title:         o.title,
        minimumAmount: o.minimumAmount ?? 0,
      })),
      utmParams: this.captureUtmParams(),
      recurring: this.donationFrequency === 'monthly' || undefined,
      installments: this.donationFrequency === 'monthly' ? (this.selectedInstallments ?? undefined) : undefined,
      ambassadorId: this.ambassador?.id || undefined,
      // embedded:true — signals the backend this is Checkout V2's own Step
      // 3 (not a plain redirect-flow donation), which also applies the
      // UIDefinition CSS/donor-field styling (see donations.service.js).
      // The response always includes both res.url and res.lowProfileId;
      // which one is actually used below depends on
      // CHECKOUT_V2_OPENFIELDS_ENABLED.
      embedded: true,
      note: this.dedicationEnabled ? (this.dedicationText.trim() || undefined) : undefined,
    }).subscribe({
      next: (res) => {
        this.creatingDonation = false;
        if (CHECKOUT_V2_OPENFIELDS_ENABLED) {
          if (!res.lowProfileId) {
            this.createDonationError = 'שגיאה בהכנת התשלום, נסו שוב';
            return;
          }
          this.lowProfileId = res.lowProfileId;
        } else {
          if (!res.url) {
            this.createDonationError = 'שגיאה בהכנת התשלום, נסו שוב';
            return;
          }
          this.hostedCheckoutUrl = this.sanitizer.bypassSecurityTrustResourceUrl(res.url);
        }
        this.donationId = res.donationId;
        this.createdTermsSnapshot = {
          amount: this.chargeAmount,
          frequency: this.donationFrequency,
          installments: this.donationFrequency === 'monthly' ? this.selectedInstallments : null,
        };
        // Parity with the old modal's onSubmit(): fired once, right at the
        // moment checkout hands off to payment — there it's immediately
        // before the CardCom redirect, here it's immediately before Step 3
        // (the embedded equivalent of that same handoff).
        this.analytics.trackEvent('donation_started', {
          value:         this.chargeAmount,
          currency:      'ILS',
          campaign_name: this.draft.title,
          campaign_id:   this.draft.id,
        });
        this.step = 3;
      },
      error: (err) => {
        this.creatingDonation = false;
        this.createDonationError = err?.error?.error || 'שגיאה בעיבוד הבקשה, נסו שנית';
      },
    });
  }

  // Hosted-iframe path (CHECKOUT_V2_OPENFIELDS_ENABLED=false): no
  // submitPayment()/external CTA for Step 3 — CardCom's own hosted page has
  // its own real submit button (styled via cardcom-embed.css to match
  // .cv2-cta, never hidden — see donations.service.js's own doc comment on
  // why). There is no supported way to trigger it from outside the iframe,
  // and there must never be a second, competing Hamonym button there.
  // Payment completion is entirely CardCom's own SuccessRedirectUrl/
  // FailedRedirectUrl → /api/donations/return, exactly as the pre-Checkout-
  // V2 redirect flow already worked — webhook remains the only thing that
  // ever writes donations.status='paid'.
  //
  // OpenFields path (CHECKOUT_V2_OPENFIELDS_ENABLED=true): unlike the hosted
  // page, OpenfieldsFormComponent has no button of its own — Hamonym owns
  // the surrounding UI, so this IS the one Hamonym-side payment button, same
  // as OpenfieldsFormComponent's other two consumers (Settings/org
  // registration) already do via their own tokenize()-calling buttons.
  //
  // 2026-09-27 (final revision) — a true HandleSubmit success no longer
  // navigates anywhere by itself; it starts startPaymentConfirmation(),
  // which polls the backend's own public status endpoint and only declares
  // success once donations.status is actually 'paid'. See paymentState's
  // own doc comment for the full state machine and why "declared failed"
  // and "outcome still unknown" are kept strictly separate (retrying after
  // a false "failed" is exactly how a duplicate charge would happen).
  async submitOpenFieldsPayment(): Promise<void> {
    if (this.paymentState !== 'idle' || !this.openfieldsForm) return;
    this.paymentState = 'processing';
    this.createDonationError = '';
    const success = await this.openfieldsForm.tokenize();

    if (!success) {
      this.resetAfterCardComDecline();
      return;
    }
    if (!this.donationId) return;
    this.startPaymentConfirmation();
  }

  finishSuccess(): void {
    this.close();
  }

  // ── Navigation / close ───────────────────────────────────────────
  goBack(): void {
    if (this.step > 1 && this.paymentState === 'idle') this.step = (this.step - 1) as 1 | 2;
  }

  close(): void {
    if (this.presentation === 'drawer') document.body.style.overflow = '';
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    // No backdrop to click in page mode — the "overlay" element there is
    // just the plain page background, not a dismissible scrim.
    if (this.presentation !== 'drawer') return;
    // A charge is either mid-flight or its result isn't known yet — closing
    // now wouldn't stop it, it would just make the donor think they can
    // safely try again elsewhere. See paymentState's own doc comment.
    if (this.paymentState === 'processing' || this.paymentState === 'confirming') return;
    if ((event.target as HTMLElement).classList.contains('cv2-overlay')) {
      this.close();
    }
  }
}
