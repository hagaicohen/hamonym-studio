import { Component, Input, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../../../../../../environments/environment';
import { CampaignDraft } from '../../../../services/campaign-studio-state.service';

type ManualSource = 'bank_transfer' | 'check' | 'cash' | 'other';

// Real (2026-08-07) — replaces the old two-mock-card layout. Donations/
// Donors/Reports already exist as real entity-wide pages (linked from the
// Workspace sidebar, pre-filtered to this campaign) — duplicating them here
// as mock numbers was confusing, not useful. The one capability that had no
// home anywhere else — logging an offline donation (bank transfer/check/
// cash) directly against this campaign — is the actual gap, per the closed
// spec in [[project_campaign_dashboard_split]] (manual entry: amount,
// source, supporter count, required declaration).
@Component({
  selector: 'app-campaign-dashboard-finance',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-dashboard-finance.component.html',
  styleUrl: './campaign-dashboard-finance.component.css',
})
export class CampaignDashboardFinanceComponent {
  @Input() draft!: CampaignDraft;
  @Input() campaignId = '';

  private http = inject(HttpClient);

  readonly sourceOptions: { value: ManualSource; label: string }[] = [
    { value: 'bank_transfer', label: 'העברה בנקאית' },
    { value: 'check',         label: 'צ\'ק' },
    { value: 'cash',          label: 'מזומן' },
    { value: 'other',         label: 'אחר' },
  ];

  modalOpen = false;
  saving = false;
  error: string | null = null;

  form = {
    amount: null as number | null,
    source: 'bank_transfer' as ManualSource,
    supportersCount: 1,
    donorName: '',
    donorEmail: '',
    donorPhone: '',
    note: '',
    declared: false,
  };
  amountInput = '';

  // One UUID per submission *intent* (F4.1, 2026-08-23) — generated once
  // when the modal opens, reused as-is across retries of that same intent
  // (timeout, network error, clicking save again) so the backend can tell
  // "still the same donation" from "a genuinely new one". Only regenerated
  // by opening the modal again — a fresh intent. Lives in memory only: a
  // full page refresh loses it, same as it loses `saving`/`form` — that
  // gap is known and explicitly not solved by this change (F4.1 audit).
  private clientSubmissionKey = '';

  get canSubmit(): boolean {
    return !!this.form.amount && this.form.amount > 0 && this.form.supportersCount >= 1 && this.form.declared && !this.saving;
  }

  openModal(): void {
    this.form = { amount: null, source: 'bank_transfer', supportersCount: 1, donorName: '', donorEmail: '', donorPhone: '', note: '', declared: false };
    this.amountInput = '';
    this.error = null;
    this.clientSubmissionKey = crypto.randomUUID();
    this.modalOpen = true;
  }

  // Same pattern as campaign-rewards-page's minimumAmountInput — blocks
  // non-digit keys outright, then re-formats with thousands separators
  // (e.g. 1,000) as the user types, since a native type="number" input
  // can't render comma formatting at all.
  allowDigitsOnly(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^[0-9]$/.test(event.key)) event.preventDefault();
  }

  onAmountInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    const n = raw ? Number(raw) : null;
    this.form.amount = n;
    this.amountInput = n ? n.toLocaleString('he-IL') : '';
  }

  closeModal(): void {
    if (this.saving) return;
    this.modalOpen = false;
  }

  submit(): void {
    if (!this.canSubmit || !this.draft.entityId) return;
    this.saving = true;
    this.error = null;

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const body = {
      campaignId:          this.campaignId,
      amount:              this.form.amount,
      source:              this.form.source,
      supportersCount:     this.form.supportersCount,
      donorName:           this.form.donorName.trim() || null,
      donorEmail:          this.form.donorEmail.trim() || null,
      donorPhone:          this.form.donorPhone.trim() || null,
      note:                this.form.note.trim() || null,
      clientSubmissionKey: this.clientSubmissionKey,
    };

    this.http.post<{ donationId: string }>(
      `${environment.apiUrl}/api/donations/entity/${this.draft.entityId}/manual`, body, { headers },
    ).subscribe({
      next: () => {
        this.draft.currentAmount   = (this.draft.currentAmount ?? 0) + (this.form.amount ?? 0);
        this.draft.supportersCount = (this.draft.supportersCount ?? 0) + this.form.supportersCount;
        this.saving = false;
        this.modalOpen = false;
      },
      error: (err) => {
        this.error = err.error?.code === 'IDEMPOTENCY_KEY_MISMATCH'
          ? 'אירעה שגיאה פנימית — נא לסגור את החלון ולפתוח אותו מחדש כדי לנסות שוב'
          : (err.error?.error || 'שגיאה בשמירת התרומה');
        this.saving = false;
      },
    });
  }
}
