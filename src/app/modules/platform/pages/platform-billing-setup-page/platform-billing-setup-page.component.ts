import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BillingProvisioningService, BillingAccount } from '../../services/billing-provisioning.service';
import { BillingOpsService, MasavConfig } from '../../services/billing-ops.service';

// Pre-filled only -- same as platform-billing-accounts-page: the backend never
// substitutes these itself (billing_accounts.fee_rate/vat_rate are NOT NULL
// with no DEFAULT on purpose).
const SUGGESTED_FEE_RATE = 0.03;
const SUGGESTED_VAT_RATE = 0.18;

// Focused, single-entity Billing setup screen (UX consolidation, 2026-09-02).
// Reuses the exact same provisioning API/business logic as
// platform-billing-accounts-page -- this is not a parallel implementation,
// just a workflow-focused presentation of it, entered from a specific
// blocked entity in Billing Ops instead of a generic list.
@Component({
  selector: 'app-platform-billing-setup-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './platform-billing-setup-page.component.html',
  styleUrl: './platform-billing-setup-page.component.css',
})
export class PlatformBillingSetupPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private provisioningService = inject(BillingProvisioningService);
  private opsService = inject(BillingOpsService);

  entityId = '';
  displayName: string | null = null;
  donationCount: number | null = null;
  grossAmount: string | null = null;

  loading = true;
  error: string | null = null;

  billingAccount: BillingAccount | null = null;
  masavConfig: MasavConfig | null = null;

  feeRatePercent = SUGGESTED_FEE_RATE * 100;
  vatRatePercent = SUGGESTED_VAT_RATE * 100;

  // Required, unchecked-by-default confirmation gate (Billing-provisioning
  // readiness correction, 2026-09-02) -- clicking the primary action must
  // never itself count as confirming the commercial terms. See the incident
  // this closes: two real billing_accounts rows created off pre-filled
  // suggested values with zero explicit confirmation step.
  confirmed = false;

  submitting = false;
  submitError: string | null = null;
  justCreated = false;

  ngOnInit(): void {
    this.entityId = this.route.snapshot.paramMap.get('entityId') || '';

    const qp = this.route.snapshot.queryParamMap;
    this.displayName = qp.get('displayName');
    const dc = qp.get('donationCount');
    const ga = qp.get('grossAmount');
    this.donationCount = dc ? Number(dc) : null;
    this.grossAmount = ga;

    if (!this.entityId) {
      this.error = 'לא צוינה עמותה להגדרת חיוב';
      this.loading = false;
      return;
    }

    this.load();
  }

  private load(): void {
    this.loading = true;
    this.error = null;
    this.provisioningService.getByEntityId(this.entityId).subscribe({
      next: (res) => {
        this.billingAccount = res.account;
        this.loadMasav();
        if (this.displayName) {
          this.loading = false;
        } else {
          this.loadDisplayNameFallback();
        }
      },
      error: () => {
        this.error = 'שגיאה בטעינת מצב החיוב של העמותה';
        this.loading = false;
      },
    });
  }

  private loadMasav(): void {
    this.opsService.getMasavConfig(this.entityId).subscribe({
      next: (res) => { this.masavConfig = res.config; },
      error: () => { /* non-critical for this screen */ },
    });
  }

  // Deep-links from Billing Ops always pass displayName/donationCount/
  // grossAmount as query params -- this fallback only matters for a direct
  // reload of this URL without them. Reuses the exact same unprovisioned-
  // entities read the generic billing-accounts list uses; never a new query.
  private loadDisplayNameFallback(): void {
    this.provisioningService.getUnprovisioned().subscribe({
      next: (res) => {
        const match = res.entities.find((e) => e.id === this.entityId);
        if (match) {
          this.displayName = match.display_name;
          this.donationCount = match.paid_donation_count;
          this.grossAmount = match.paid_gross_total;
        }
        this.loading = false;
      },
      error: () => { this.loading = false; },
    });
  }

  get isBillable(): boolean {
    return !!this.billingAccount && this.billingAccount.enforcement_status === 'active';
  }

  get isSuspended(): boolean {
    return !!this.billingAccount && this.billingAccount.enforcement_status === 'suspended';
  }

  feePercentOf(account: BillingAccount): number {
    return Number(account.fee_rate) * 100;
  }

  vatPercentOf(account: BillingAccount): number {
    return Number(account.vat_rate) * 100;
  }

  // CARD needs no admin-side setup at all -- the donor/entity enters card
  // details directly on their own payment screen, so it is always ready
  // from the platform operator's point of view. Card token status itself is
  // deliberately not shown on this screen (see Part 2's copy rules).
  readonly cardReady = { icon: '✓', label: 'זמין' };

  get masavReady(): { icon: string; label: string } {
    if (!this.masavConfig) return { icon: '⚠', label: 'טרם הוגדר' };
    if (!this.masavConfig.authorized) return { icon: '⚠', label: 'ממתין לאישור' };
    return { icon: '✓', label: 'מאושר' };
  }

  submit(): void {
    if (this.submitting || this.billingAccount || !this.confirmed) return;
    this.submitting = true;
    this.submitError = null;
    this.provisioningService
      .create({
        entityId: this.entityId,
        feeRate: this.feeRatePercent / 100,
        vatRate: this.vatRatePercent / 100,
        // Not exposed as an operator choice -- v1 routing is automatic per
        // Statement total_due (routing.js), preferred_collection_method is
        // never read by it. Sending the DB's own default value.
        preferredCollectionMethod: 'card',
      })
      .subscribe({
        next: (res) => {
          this.submitting = false;
          this.billingAccount = res.account;
          this.justCreated = true;
        },
        error: (err) => {
          this.submitting = false;
          this.submitError = err?.error?.error || 'יצירת חשבון החיוב נכשלה';
        },
      });
  }

  // "Return to the workflow" -- always Billing Ops, since that's the only
  // entry point into this screen. Carries the entity back so Billing Ops can
  // show a confirmation without the operator searching for it again.
  returnToBillingOps(): void {
    const queryParams = this.justCreated
      ? { justSetupEntity: this.entityId, justSetupName: this.displayName || undefined }
      : {};
    this.router.navigate(['/platform/billing-ops'], { queryParams });
  }

  goToMasavTab(): void {
    this.router.navigate(['/platform/billing-ops'], { queryParams: { tab: 'masav' } });
  }
}
