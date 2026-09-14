import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BillingProvisioningService, BillingAccount } from '../../services/billing-provisioning.service';
import { BillingOpsService, MasavConfig } from '../../services/billing-ops.service';
import {
  MASAV_INSTITUTION_CODE,
  MASAV_BENEFICIARY_NAME,
  MASAV_ACK_TEXT,
  MASAV_WHY_UNLIMITED_TITLE,
  MASAV_WHY_UNLIMITED_TEXT,
  MASAV_UPLOAD_HELPER_TEXT,
  MASAV_PENDING_STATUS_LABEL,
  MASAV_PENDING_STATUS_SUBLABEL,
} from '../../../../shared/constants/masav.constants';
import { ISRAELI_BANKS, IsraeliBank } from '../../../../shared/constants/israeli-banks.constants';

// Pre-filled only -- the backend never substitutes these itself
// (billing_accounts.fee_rate/vat_rate are NOT NULL with no DEFAULT on
// purpose).
const SUGGESTED_FEE_RATE = 0.03;
const SUGGESTED_VAT_RATE = 0.18;

// Focused, single-entity Billing setup screen (UX consolidation, 2026-09-02;
// entry points widened 2026-09-14 to include the "הגדרות עמותות" tab, which
// absorbed the old standalone /platform/billing-accounts list page). Reuses
// the exact same provisioning API/business logic either entry point would
// have used -- this is not a parallel implementation, just a
// workflow-focused presentation of it.
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

  // ---- MASAV setup (moved here from the old billing-ops MASAV-tab drawer,
  // 2026-09-14e UX separation) -- association-level MASAV configuration/
  // authorization belongs with the rest of this entity's billing setup, not
  // mixed into the monthly-collection "מס״ב" tab. Same fields, same
  // BillingOpsService calls -- no new authorization mechanism. -----------
  masavBankCode = '';
  masavBranchCode = '';
  masavAccountNumber = '';
  masavAccountHolderName = '';
  masavFormBusy = false;
  masavFormError: string | null = null;
  masavInstitutionCode = MASAV_INSTITUTION_CODE;
  masavCodeCopied = false;
  masavBeneficiaryName = MASAV_BENEFICIARY_NAME;
  masavAckText = MASAV_ACK_TEXT;
  masavWhyUnlimitedTitle = MASAV_WHY_UNLIMITED_TITLE;
  masavWhyUnlimitedText = MASAV_WHY_UNLIMITED_TEXT;
  masavUploadHelperText = MASAV_UPLOAD_HELPER_TEXT;
  masavPendingStatusLabel = MASAV_PENDING_STATUS_LABEL;
  masavPendingStatusSublabel = MASAV_PENDING_STATUS_SUBLABEL;
  readonly israeliBanks: IsraeliBank[] = ISRAELI_BANKS;
  masavAckChecked = false;
  masavShowHelp = false;
  masavDocFile: File | null = null;
  masavDocUploading = false;
  masavDocUploadError: string | null = null;
  masavDocDownloading = false;
  masavActionBusy = false;
  masavActionError: string | null = null;

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
      next: (res) => {
        this.masavConfig = res.config;
        if (res.config) {
          this.masavBankCode = res.config.bank_code;
          this.masavBranchCode = res.config.branch_code;
          this.masavAccountNumber = res.config.account_number;
          this.masavAccountHolderName = res.config.account_holder_name || '';
        }
      },
      error: () => { /* non-critical for this screen */ },
    });
  }

  private reloadMasav(): void {
    this.opsService.getMasavConfig(this.entityId).subscribe({
      next: (res) => { this.masavConfig = res.config; },
      error: () => {},
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

  toggleMasavHelp(): void {
    this.masavShowHelp = !this.masavShowHelp;
  }

  // Clipboard write is inherently best-effort (permissions, insecure
  // context, older browsers) -- falls back to silently doing nothing rather
  // than throwing, since the code is already displayed in plain text right
  // next to the button either way.
  copyMasavInstitutionCode(): void {
    navigator.clipboard?.writeText(this.masavInstitutionCode).then(() => {
      this.masavCodeCopied = true;
      setTimeout(() => { this.masavCodeCopied = false; }, 2000);
    }).catch(() => {});
  }

  // Saves bank details only -- deliberately does not touch `authorized`
  // (upsertBankDetails always clears it server-side on any change).
  submitMasavConfig(): void {
    if (this.masavFormBusy) return;
    if (!this.masavAccountHolderName || !this.masavBankCode || !this.masavBranchCode || !this.masavAccountNumber) {
      this.masavFormError = 'יש למלא שם בעל חשבון, בנק, סניף ומספר חשבון';
      return;
    }
    this.masavFormBusy = true;
    this.masavFormError = null;
    this.opsService
      .upsertMasavConfig(this.entityId, {
        bankCode: this.masavBankCode,
        branchCode: this.masavBranchCode,
        accountNumber: this.masavAccountNumber,
        accountHolderName: this.masavAccountHolderName || undefined,
      })
      .subscribe({
        next: (res) => {
          this.masavFormBusy = false;
          this.masavConfig = res.config;
        },
        error: (err) => {
          this.masavFormBusy = false;
          this.masavFormError = err?.error?.error || 'שמירת פרטי הבנק נכשלה';
        },
      });
  }

  onMasavDocSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.masavDocFile = input.files?.[0] || null;
    this.masavDocUploadError = null;
  }

  uploadMasavDoc(): void {
    if (!this.masavDocFile || this.masavDocUploading) return;
    this.masavDocUploading = true;
    this.masavDocUploadError = null;
    this.opsService.uploadMasavAuthorizationDocument(this.entityId, this.masavDocFile).subscribe({
      next: (res) => {
        this.masavDocUploading = false;
        this.masavConfig = res.config;
        this.masavDocFile = null;
      },
      error: (err) => {
        this.masavDocUploading = false;
        this.masavDocUploadError = err?.error?.error || 'העלאת האישור נכשלה — ודאו שפרטי הבנק נשמרו קודם';
      },
    });
  }

  downloadMasavDoc(): void {
    if (this.masavDocDownloading || !this.masavConfig?.has_authorization_document) return;
    this.masavDocDownloading = true;
    this.opsService.downloadMasavAuthorizationDocument(this.entityId).subscribe({
      next: (blob) => {
        this.masavDocDownloading = false;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.masavConfig?.authorization_document_name || 'masav-authorization';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => { this.masavDocDownloading = false; },
    });
  }

  // Never offered when already false -- see the template's [disabled]
  // guard. Both reuse the exact same BillingOpsService calls the old
  // billing-ops MASAV-tab drawer used.
  authorizeMasav(): void {
    if (this.masavActionBusy || this.masavConfig?.authorized) return;
    this.masavActionBusy = true;
    this.masavActionError = null;
    this.opsService.authorizeMasav(this.entityId).subscribe({
      next: () => { this.masavActionBusy = false; this.reloadMasav(); },
      error: (err) => { this.masavActionBusy = false; this.masavActionError = err?.error?.error || 'אישור ההרשאה נכשל'; },
    });
  }

  revokeMasav(): void {
    if (this.masavActionBusy || !this.masavConfig?.authorized) return;
    this.masavActionBusy = true;
    this.masavActionError = null;
    this.opsService.revokeMasav(this.entityId).subscribe({
      next: () => { this.masavActionBusy = false; this.reloadMasav(); },
      error: (err) => { this.masavActionBusy = false; this.masavActionError = err?.error?.error || 'ביטול ההרשאה נכשל'; },
    });
  }

  fmtDateTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hh}:${mm}`;
  }
}
