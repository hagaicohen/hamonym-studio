import { Component, inject, OnInit, AfterViewInit, OnDestroy, Input, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import { CampaignStudioStateService, CampaignDraft } from '../../../services/campaign-studio-state.service';
import { CheckoutModalComponent } from '../checkout-modal/checkout-modal.component';
import { sanitizeRichHtml } from '../../../../../shared/utils/sanitize-rich-html';
import { Ambassador } from '../../../services/ambassador.service';

// layout.pageFormat === 'minimal' — a single-purpose donation page (logo,
// short text, amount picker, CTA) for campaigns that don't need the full
// Page Builder page. Deliberately a small, self-contained sibling of
// CampaignPreviewComponent rather than a mode extracted out of it: the
// amount-picker/checkout logic below is a duplicated, trimmed-down copy of
// campaign-preview.component.ts's donation-widget block (selectAmount/
// selectFrequency/onCustomAmountInput/openCheckout), not a shared unit —
// see the pilot-scope decision in the 2026-09-23 conversation (avoid a
// broad refactor of the 1600+ line preview monolith right before pilot).
// Reuses CheckoutModalComponent and the donation/CardCom flow unchanged.
@Component({
  selector: 'app-minimal-donation-page',
  standalone: true,
  imports: [CommonModule, CheckoutModalComponent],
  templateUrl: './minimal-donation-page.component.html',
  styleUrl: './minimal-donation-page.component.css',
})
export class MinimalDonationPageComponent implements OnInit, AfterViewInit, OnDestroy {
  private state = inject(CampaignStudioStateService);
  private sanitizer = inject(DomSanitizer);
  readonly draft$ = this.state.draft$;

  // Advanced text mode (layout.minimalAdvancedText) — same sanitize-then-
  // bypass pattern campaign-preview.component.ts already uses for every
  // other rich-text field in the app (see sanitizeRichHtml's own doc
  // comment on why the extra DOMPurify pass is needed on top of Angular's
  // own, which strips the style attribute the editor's color/font-size
  // marks depend on).
  richHtml(html: string | undefined): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(sanitizeRichHtml(html || ''));
  }

  // Set by the Builder's own live-preview pane (campaign-studio-page.html),
  // which renders this inside a fixed-height panel (.preview-inner), not a
  // real full page — min-height:100dvh there measures the BROWSER's actual
  // viewport, not that smaller panel, so the card rendered far shorter than
  // the panel with a lot of unfilled/scrollable space around it instead of
  // the background actually covering the whole panel. True on the real
  // public page (default) keeps the normal "at least one viewport tall"
  // full-page behavior. Found 2026-09-24.
  @Input() embedded = false;

  // :host itself also needs a real height for .mdp-page's height:100% (see
  // its own CSS comment) to have anything to resolve against — .preview-
  // inner is a plain overflow:auto block container, not flex, so a block
  // child doesn't stretch to fill it automatically the way campaign-preview
  // doesn't need to (its content just flows/scrolls instead of needing to
  // "fill" anything).
  @HostBinding('style.height') get hostHeight(): string | null {
    return this.embedded ? '100%' : null;
  }

  // Forwarded straight to CheckoutModalComponent's own [ambassador] input
  // (see its ambassadorId wiring) — pageFormat='minimal' is a page format
  // only, never a reason to lose ambassador attribution. Set by
  // campaign-public-page.component.ts the same way it's set on
  // CampaignPreviewComponent for the full format. 2026-09-24.
  @Input() ambassador: Ambassador | null = null;

  selectedAmount: number | null = null;
  customAmount: number | null = null;
  amountDisplay = '';
  donationFrequency: 'one-time' | 'monthly' = 'one-time';
  checkoutOpen = false;

  // Installment count (2026-09-24) — a DONATION-level choice, not a
  // campaign-level one: the donor picks how many separate monthly charges
  // they want, right here on the donation page (not inside
  // CheckoutModalComponent, and not gated on the campaign's own
  // recurringBillingMode/recurringInstallmentsCount, which stay campaign-
  // level defaults used only for the full-format widget). No "ללא הגבלה"
  // option here by design — every monthly donation through this page has a
  // defined, donor-chosen number of charges. Deliberately no default
  // pre-selection either, same financial-consent principle as
  // selectedAmount above — an unclicked quick-pick must never count as the
  // donor's actual choice.
  readonly INSTALLMENT_OPTIONS = [3, 6, 12, 24];
  selectedInstallments: number | null = null;
  customInstallmentsInput = '';

  // Same sticky-CTA behavior as CampaignPreviewComponent (see its own
  // setupStickyObserver doc comment) — required for both pageFormat values
  // per the 2026-09-23 donation-UX decision. On most viewports this card
  // fits on one screen and the observer never has anything to do; it only
  // matters on short/small screens where the CTA scrolls out of view.
  showStickyBar = false;
  private stickyObserver: IntersectionObserver | null = null;
  private draftSub: Subscription | null = null;

  // Found 2026-09-24: the amount grid highlighted the middle preset as
  // "selected" purely in the template (a presentation-only fallback when
  // selectedAmount was still null) while selectedAmount itself stayed null
  // until a preset was actually clicked. explicitAmount (below) — which is
  // what openCheckout()/the CTA actually reads — has no such fallback by
  // design (a highlighted-but-unclicked amount must never count as
  // consent), so a donor who saw ₪180 "selected" and pressed the CTA
  // immediately got nothing: explicitAmount was still 0. The fix is to make
  // the real state match what's shown, not to patch the CTA — as soon as
  // amounts are known, selectedAmount is genuinely set to that same default,
  // so isAmountSelected() alone (no template fallback) is both what's shown
  // and what the CTA reads. Only applies while nothing has been explicitly
  // chosen yet — never overrides a real click or typed custom amount.
  ngOnInit(): void {
    this.draftSub = this.draft$.subscribe(draft => this.syncDefaultAmount(draft));
  }

  private defaultAmountFor(amounts: number[]): number | null {
    if (!amounts.length) return null;
    return amounts[this.middleAmountIndex(amounts)] ?? null;
  }

  private syncDefaultAmount(draft: CampaignDraft): void {
    if (this.selectedAmount !== null || this.customAmount !== null) return;
    const def = this.defaultAmountFor(this.amountsFor(draft));
    if (def !== null) this.selectedAmount = def;
  }

  ngAfterViewInit(): void {
    this.setupStickyObserver();
  }

  private setupStickyObserver(attempt = 0): void {
    const target = document.querySelector('.mdp-donate-btn');
    if (!target) {
      if (attempt < 20) setTimeout(() => this.setupStickyObserver(attempt + 1), 200);
      return;
    }
    this.stickyObserver = new IntersectionObserver(
      ([entry]) => { this.showStickyBar = !entry.isIntersecting; },
      { threshold: 0 },
    );
    this.stickyObserver.observe(target);
  }

  ngOnDestroy(): void {
    this.stickyObserver?.disconnect();
    this.draftSub?.unsubscribe();
  }

  logoUrl(draft: CampaignDraft): string | null {
    return draft.campaignLogoUrl || draft.entityLogo || null;
  }

  amountsFor(draft: CampaignDraft): number[] {
    return this.donationFrequency === 'monthly' ? draft.monthlyAmounts : draft.suggestedAmounts;
  }

  middleAmountIndex(amounts: number[]): number {
    const shown = Math.min(amounts.length, 5);
    return Math.floor((shown - 1) / 2);
  }

  selectAmount(amount: number): void {
    this.selectedAmount = amount;
    this.customAmount = null;
    this.amountDisplay = '';
  }

  selectFrequency(freq: 'one-time' | 'monthly'): void {
    if (this.donationFrequency === freq) return;
    this.donationFrequency = freq;
    this.customAmount = null;
    this.amountDisplay = '';
    // Presets differ between the two lists — re-derive the default for the
    // newly-chosen frequency's own list instead of going back to null (which
    // would recreate the same shown-but-not-selected gap this component just
    // fixed, just triggered by the frequency toggle instead of first load).
    this.selectedAmount = this.defaultAmountFor(this.amountsFor(this.state.draft));
    // Installment count is a monthly-only concept — reset on every
    // frequency switch (never carried over, never sent for a one-time
    // donation, and never pre-filled going into monthly — see the field's
    // own doc comment).
    this.selectedInstallments = null;
    this.customInstallmentsInput = '';
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

  // Same 1–60 bound the backend enforces (donations.service.js) — kept in
  // sync deliberately so the CTA never lets through a value the server
  // would reject anyway.
  get hasValidInstallments(): boolean {
    return this.selectedInstallments !== null && this.selectedInstallments >= 1 && this.selectedInstallments <= 60;
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

  // Same financial-consent rule as campaign-preview.component.ts
  // (openCheckout, 2026-09-21): a highlighted-but-unclicked suggested amount
  // is never treated as consent — only an amount the donor actually clicked
  // or typed may reach checkout.
  get explicitAmount(): number {
    if (this.customAmount) return this.customAmount;
    if (this.selectedAmount !== null) return this.selectedAmount;
    return 0;
  }

  openCheckout(): void {
    if (this.explicitAmount === 0) return;
    if (this.donationFrequency === 'monthly' && !this.hasValidInstallments) return;
    this.checkoutOpen = true;
  }

  closeCheckout(): void {
    this.checkoutOpen = false;
  }
}
