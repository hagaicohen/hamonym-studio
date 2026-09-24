import { Component, inject, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DonationService } from '../../../campaigns/services/donation.service';
import { EmbeddedOpenfieldsCheckoutComponent, EmbeddedCheckoutResult } from '../../../campaigns/shared/components/embedded-openfields-checkout/embedded-openfields-checkout.component';

// Dev-only manual test harness (2026-09-24) — Phase 1 of the Embedded
// OpenFields spike. Exists ONLY to let a human exercise
// `createDonation({embedded:true})` → EmbeddedOpenfieldsCheckoutComponent
// in a real browser, since neither step is something this environment can
// automate (no browser automation tool, and card entry happens inside
// CardCom's own cross-origin iframes). See devOnlyGuard's own comment for
// why hostname (not environment.production) gates the route, and
// donations.service.js#createDonation for the matching backend-side
// ALLOW_EMBEDDED_DONATION_SPIKE gate — two independent layers, neither
// trusting the other.
//
// Deliberately does NOT hardcode any campaign/entity — the tester supplies
// a real campaignId for a campaign whose entity already has verified
// CardCom credentials (e.g. via Settings → "בדוק חיבור"). This page never
// calls doTransaction itself; that only happens if the human clicks the
// button inside EmbeddedOpenfieldsCheckoutComponent and types a real card.
@Component({
  selector: 'app-embedded-donation-test-page',
  standalone: true,
  imports: [CommonModule, FormsModule, EmbeddedOpenfieldsCheckoutComponent],
  templateUrl: './embedded-donation-test-page.component.html',
  styleUrl: './embedded-donation-test-page.component.css',
})
export class EmbeddedDonationTestPageComponent {
  private donationService = inject(DonationService);

  // ViewChild, not a template reference variable — the diagnostics section
  // and the CardCom section are separate *ngIf-gated embedded views, so a
  // plain `#ref` declared in one wouldn't be visible from the other.
  @ViewChild(EmbeddedOpenfieldsCheckoutComponent) embeddedCheckout?: EmbeddedOpenfieldsCheckoutComponent;

  campaignId = '';
  donorName = 'ZZZ Test Donor';
  donorEmail = 'zzz-test-embedded-spike@example.test';
  donorPhone = '0500000000';

  frequency: 'one-time' | 'monthly' = 'one-time';
  amount: number | null = 50;
  months: number | null = 12;

  loading = false;
  errorMsg = '';

  donationId: string | null = null;
  lowProfileId: string | null = null;

  paymentResult: EmbeddedCheckoutResult | null = null;

  get canCreate(): boolean {
    if (this.loading) return false;
    if (!this.campaignId.trim()) return false;
    if (!this.amount || this.amount <= 0) return false;
    if (this.frequency === 'monthly' && (!this.months || this.months < 1 || this.months > 60)) return false;
    return true;
  }

  createEmbeddedDonation(): void {
    if (!this.canCreate) return;
    this.loading = true;
    this.errorMsg = '';
    this.donationId = null;
    this.lowProfileId = null;
    this.paymentResult = null;

    this.donationService.create({
      campaignId: this.campaignId.trim(),
      donor: { name: this.donorName, email: this.donorEmail, phone: this.donorPhone },
      amount: this.amount!,
      rewards: [],
      recurring: this.frequency === 'monthly',
      installments: this.frequency === 'monthly' ? this.months! : undefined,
      embedded: true,
    }).subscribe({
      next: (res) => {
        this.loading = false;
        this.donationId = res.donationId;
        this.lowProfileId = res.lowProfileId ?? null;
        if (!this.lowProfileId) {
          this.errorMsg = 'השרת לא החזיר lowProfileId — בדוק שALLOW_EMBEDDED_DONATION_SPIKE מוגדר ב-.env';
        }
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err?.error?.error ?? err?.error?.message ?? 'שגיאה ביצירת ההתרומה';
      },
    });
  }

  onPaymentResult(result: EmbeddedCheckoutResult): void {
    this.paymentResult = result;
  }
}
