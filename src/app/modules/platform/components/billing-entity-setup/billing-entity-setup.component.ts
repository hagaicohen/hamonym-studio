import { Component, EventEmitter, Input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingProvisioningService, BillingAccount } from '../../services/billing-provisioning.service';
import { BillingOpsService, MasavConfig } from '../../services/billing-ops.service';
import { BillingSettingsService } from '../../services/billing-settings.service';
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

const SUGGESTED_FEE_RATE = 0.03;

// Single-entity billing setup: fee/VAT terms, CARD readiness, MASAV setup/
// authorization -- the full content of what used to be the standalone
// /platform/billing-setup/:entityId PAGE, extracted into a component
// (2026-09-14h drawer redesign) so the exact same logic can be hosted
// either by that page (kept for deep-link compatibility) or by a drawer
// opened directly from "הגדרות עמותות"/"החודש"/"מס״ב" without navigating
// away and losing list context. No business logic duplicated between the
// two hosts -- this is the only place any of it lives.
//
// Progressive disclosure (per the 2026-09-14h request): the normal view
// shows only the three things that matter -- תנאי החיוב / כרטיס אשראי /
// מס״ב summary -- with the full bank-details form behind "עריכת פרטי
// מס״ב" and the long explanatory text behind "מידע נוסף על הרשאת מס״ב".
// Nothing about the underlying requirements (ack before upload, bank
// details before ack, etc.) changed -- only what's visible by default.
@Component({
  selector: 'app-billing-entity-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './billing-entity-setup.component.html',
  styleUrl: './billing-entity-setup.component.css',
})
export class BillingEntitySetupComponent implements OnInit {
  private provisioningService = inject(BillingProvisioningService);
  private opsService = inject(BillingOpsService);
  private settingsService = inject(BillingSettingsService);

  @Input({ required: true }) entityId!: string;
  @Input() displayNameHint: string | null = null;
  @Input() donationCountHint: number | null = null;
  @Input() grossAmountHint: string | null = null;

  // Lets the host (drawer or page) refresh its own list/summary once
  // something here actually changed -- never used to re-decide anything
  // itself, purely a "go re-fetch" signal.
  @Output() billingAccountCreated = new EventEmitter<void>();
  @Output() masavChanged = new EventEmitter<void>();

  displayName: string | null = null;
  donationCount: number | null = null;
  grossAmount: string | null = null;

  loading = true;
  error: string | null = null;

  billingAccount: BillingAccount | null = null;
  masavConfig: MasavConfig | null = null;

  feeRatePercent = SUGGESTED_FEE_RATE * 100;
  // Read-only, always the current platform-wide rate (2026-09-14i) -- shown
  // regardless of whether a billing_account exists yet, since VAT is no
  // longer something set per-association at all. null until loaded.
  systemVatRatePercent: number | null = null;

  // Required, unchecked-by-default confirmation gate (Billing-provisioning
  // readiness correction, 2026-09-02) -- clicking the primary action must
  // never itself count as confirming the commercial terms.
  confirmed = false;

  submitting = false;
  submitError: string | null = null;
  // Replaces the old full-screen "justCreated" takeover (which needed its
  // own "חזרה לתפעול החיוב" button to get back to anything) -- a small
  // dismissible banner instead, since the rest of the content updates in
  // place either way and there's nowhere separate to "return" to anymore.
  justCreatedBanner = false;

  // ---- MASAV setup ------------------------------------------------------
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

  showMasavInfo = false;

  // Independent progressive-disclosure toggles for the two independent
  // MASAV setup pieces (2026-09-16 drawer redesign -- replaces the single
  // "עריכת פרטי מס״ב" toggle that used to wrap both together, which made
  // the document upload flow read as nested inside/dependent on the bank
  // form even after the backend ordering dependency was removed). Each
  // defaults to collapsed once its own piece already exists (compact
  // summary + "עריכת פרטים"/"החלפת מסמך"), and auto-expands to the direct
  // form/picker the first time there's genuinely nothing to summarize yet
  // (see loadMasav()) -- same progressive-disclosure principle as before,
  // just decoupled per-piece instead of one flag for both.
  showMasavBankEdit = false;
  showMasavDocReplace = false;

  // Real bank details filled in -- NOT "a masavConfig row exists". A row
  // can now exist with bank_code/branch_code/account_number still '' (the
  // document was uploaded before bank details were ever saved -- see
  // masav-config.service.js#uploadAuthorizationDocument's 2026-09-16
  // upsert). Treating row-existence as "configured" would misreport a
  // document-only entity as having bank details on file.
  get masavBankConfigured(): boolean {
    return !!this.masavConfig?.bank_code;
  }

  get masavDocumentUploaded(): boolean {
    return !!this.masavConfig?.has_authorization_document;
  }

  // Overall state line at the top of the מס״ב section -- derived entirely
  // from the same two booleans the checklist rows below already show, never
  // a new/separate readiness concept. null (nothing rendered) once both
  // pieces are done, since the checklist rows + the אישור מס״ב row already
  // say that with no need to repeat it in a summary line too.
  get masavMissingPieces(): string[] {
    const missing: string[] = [];
    if (!this.masavBankConfigured) missing.push('פרטי חשבון');
    if (!this.masavDocumentUploaded) missing.push('מסמך הרשאה');
    return missing;
  }

  get masavSetupSummary(): string | null {
    const missing = this.masavMissingPieces;
    if (missing.length === 0) return null;
    return `הגדרת מס״ב לא הושלמה — חסרים: ${missing.join(' · ')}`;
  }

  // What to tell the operator when אישור מס״ב is disabled -- names only the
  // pieces actually missing (never the generic "יש להשלים הכל" when only
  // one of the two is missing).
  get masavAuthorizationBlockedReason(): string | null {
    const missing = this.masavMissingPieces;
    if (missing.length === 0) return null;
    return `כדי לאשר מס״ב יש ${missing.length === 2 ? 'להשלים פרטי חשבון ולהעלות מסמך הרשאה' : missing[0] === 'פרטי חשבון' ? 'להשלים פרטי חשבון' : 'להעלות מסמך הרשאה'}.`;
  }

  ngOnInit(): void {
    this.displayName = this.displayNameHint;
    this.donationCount = this.donationCountHint;
    this.grossAmount = this.grossAmountHint;

    if (!this.entityId) {
      this.error = 'לא צוינה עמותה להגדרת חיוב';
      this.loading = false;
      return;
    }

    this.load();
    this.loadSystemVatRate();
  }

  private loadSystemVatRate(): void {
    this.settingsService.get().subscribe({
      next: (res) => {
        if (res.setting) this.systemVatRatePercent = Number(res.setting.vat_rate) * 100;
      },
      error: () => { /* non-critical for this screen -- fee/MASAV still work without it */ },
    });
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
        // Nothing to summarize yet for a given piece -- go straight to its
        // form/picker instead of making the operator open a toggle to find
        // it. Independent per piece: a document-only entity (bank details
        // still '') auto-expands the bank form but keeps the document
        // section collapsed on its own already-uploaded summary, and vice
        // versa.
        this.showMasavBankEdit = !this.masavBankConfigured;
        this.showMasavDocReplace = !this.masavDocumentUploaded;
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

  // Deep-links (drawer or direct page load) may arrive without a display
  // name hint -- this fallback only matters then. Reuses the exact same
  // unprovisioned-entities read the old generic list used; never a new
  // query. Only ever finds a match for an entity that has NO
  // billing_account yet (that's what this endpoint lists) -- harmless
  // no-op otherwise, the name just stays whatever the caller already knew.
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

  // CARD needs no admin-side setup at all -- the donor/entity enters card
  // details directly on their own payment screen, so it is always ready
  // from the platform operator's point of view.
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
        // vatRate is not sent -- the backend auto-populates it from the
        // current platform-wide setting (2026-09-14i).
        // Not exposed as an operator choice -- v1 routing is automatic per
        // Statement total_due (routing.js), preferred_collection_method is
        // never read by it. Sending the DB's own default value.
        preferredCollectionMethod: 'card',
      })
      .subscribe({
        next: (res) => {
          this.submitting = false;
          this.billingAccount = res.account;
          this.justCreatedBanner = true;
          this.billingAccountCreated.emit();
        },
        error: (err) => {
          this.submitting = false;
          this.submitError = err?.error?.error || 'יצירת חשבון החיוב נכשלה';
        },
      });
  }

  dismissJustCreatedBanner(): void {
    this.justCreatedBanner = false;
  }

  toggleMasavBankEdit(): void {
    this.showMasavBankEdit = !this.showMasavBankEdit;
  }

  toggleMasavDocReplace(): void {
    this.showMasavDocReplace = !this.showMasavDocReplace;
  }

  bankNameOf(code: string): string {
    return this.israeliBanks.find((b) => b.code === code)?.name || code;
  }

  toggleMasavInfo(): void {
    this.showMasavInfo = !this.showMasavInfo;
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
          this.showMasavBankEdit = false; // collapse back to the compact summary now that it's saved
          this.masavChanged.emit();
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
        this.showMasavDocReplace = false; // collapse back to the ✓ summary now that it's uploaded
        this.masavChanged.emit();
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

  // Never offered when already false, or when either prerequisite is
  // genuinely missing -- see the template's [disabled] guard (mirrors this
  // exactly). Both reuse the exact same BillingOpsService calls the old
  // billing-ops MASAV-tab drawer used; the backend (authorize(), see
  // masav-config.service.js) independently enforces the same completeness
  // check regardless of what the UI allows clicking.
  authorizeMasav(): void {
    if (this.masavActionBusy || this.masavConfig?.authorized || !this.masavBankConfigured || !this.masavDocumentUploaded) return;
    this.masavActionBusy = true;
    this.masavActionError = null;
    this.opsService.authorizeMasav(this.entityId).subscribe({
      next: () => { this.masavActionBusy = false; this.reloadMasav(); this.masavChanged.emit(); },
      error: (err) => { this.masavActionBusy = false; this.masavActionError = err?.error?.error || 'אישור ההרשאה נכשל'; },
    });
  }

  revokeMasav(): void {
    if (this.masavActionBusy || !this.masavConfig?.authorized) return;
    this.masavActionBusy = true;
    this.masavActionError = null;
    this.opsService.revokeMasav(this.entityId).subscribe({
      next: () => { this.masavActionBusy = false; this.reloadMasav(); this.masavChanged.emit(); },
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
