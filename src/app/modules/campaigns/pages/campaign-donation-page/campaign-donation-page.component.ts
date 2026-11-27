import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MoneyInputDirective } from '../../../../shared/directives/money-input.directive';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft } from '../../services/campaign-studio-state.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';


import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
// Dedicated page (2026-08-06 architecture reset). Was briefly embedded in
// the old accordion "Management" section (now removed) — re-homed here as
// its own page, same self-sufficient fetch→mutate→save pattern as the rest
// of the workspace. Already content-only in the Builder's own step, so
// this is close to a direct port.
@Component({
  selector: 'app-campaign-donation-page',
  standalone: true,
  imports: [MoneyInputDirective, FormsModule, HmIconComponent, CommonModule],
  templateUrl: './campaign-donation-page.component.html',
  styleUrl: './campaign-donation-page.component.css',
})
export class CampaignDonationPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private ctx = inject(CampaignWorkspaceContextService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;
  saved = false;
  previewMode: 'once' | 'monthly' = 'once';
  previewAmount: number | null = null;
  private pending: Parameters<CampaignApiService['updateWorkspaceFields']>[1] = {};

  get dirty(): boolean { return Object.keys(this.pending).length > 0; }

  get previewAmounts(): number[] {
    if (!this.draft) return [];
    if (this.previewMode === 'monthly') return this.draft.allowMonthlyDonation ? this.draft.monthlyAmounts : [];
    return this.draft.enableSuggestedAmounts ? this.draft.suggestedAmounts : [];
  }

  selectPreviewMode(mode: 'once' | 'monthly'): void {
    this.previewMode = mode;
    this.previewAmount = null;
  }

  cancel(): void {
    this.pending = {};
    this.draft = this.ctx.draft();
    this.saved = false;
    this.saveError = null;
    this.selectPreviewMode('once');
  }
  saveError: string | null = null;

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.ctx.ensureLoaded(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  patchDraft(partial: Partial<Pick<CampaignDraft,
    'enableSuggestedAmounts' | 'allowCustomAmount' | 'allowMonthlyDonation' | 'suggestedAmounts'
    | 'monthlyAmounts' | 'recurringBillingMode' | 'recurringInstallmentsCount'
  >>): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, ...partial };
    this.saved = false;
    this.saveError = null;
    this.previewAmount = null;
    if (!this.draft.allowMonthlyDonation) this.previewMode = 'once';
    this.pending = {
      ...this.pending,
      ...(partial.enableSuggestedAmounts !== undefined ? { enable_suggested_amounts: partial.enableSuggestedAmounts } : {}),
      ...(partial.allowCustomAmount !== undefined ? { allow_custom_amount: partial.allowCustomAmount } : {}),
      ...(partial.allowMonthlyDonation !== undefined ? { allow_monthly_donation: partial.allowMonthlyDonation } : {}),
      ...(partial.suggestedAmounts !== undefined ? { suggested_amounts: partial.suggestedAmounts } : {}),
      ...(partial.monthlyAmounts !== undefined ? { monthly_amounts: partial.monthlyAmounts } : {}),
      ...(partial.recurringBillingMode !== undefined ? { recurring_billing_mode: partial.recurringBillingMode } : {}),
      ...(partial.recurringInstallmentsCount !== undefined ? { recurring_installments_count: partial.recurringInstallmentsCount } : {}),
    };
  }

  updateAmount(index: number, value: number): void {
    if (!this.draft) return;
    const amounts = [...this.draft.suggestedAmounts];
    amounts[index] = value > 0 ? value : 1;
    this.patchDraft({ suggestedAmounts: amounts });
  }

  removeAmount(index: number): void {
    if (!this.draft) return;
    this.patchDraft({ suggestedAmounts: this.draft.suggestedAmounts.filter((_, i) => i !== index) });
  }

  addAmount(): void {
    if (!this.draft || this.draft.suggestedAmounts.length >= 6) return;
    const last = this.draft.suggestedAmounts.at(-1) ?? 100;
    this.patchDraft({ suggestedAmounts: [...this.draft.suggestedAmounts, last * 2] });
  }

  updateMonthlyAmount(index: number, value: number): void {
    if (!this.draft) return;
    const amounts = [...this.draft.monthlyAmounts];
    amounts[index] = value > 0 ? value : 1;
    this.patchDraft({ monthlyAmounts: amounts });
  }

  removeMonthlyAmount(index: number): void {
    if (!this.draft) return;
    this.patchDraft({ monthlyAmounts: this.draft.monthlyAmounts.filter((_, i) => i !== index) });
  }

  addMonthlyAmount(): void {
    if (!this.draft || this.draft.monthlyAmounts.length >= 6) return;
    const last = this.draft.monthlyAmounts.at(-1) ?? 50;
    this.patchDraft({ monthlyAmounts: [...this.draft.monthlyAmounts, last * 2] });
  }

  save(): void {
    if (!this.draft || !this.dirty || this.saving) return;
    this.saving = true;
    this.saveError = null;
    this.campaignApi.updateWorkspaceFields(this.campaignId, this.pending).subscribe({
      next: updated => {
        this.saving = false;
        this.saved = true;
        this.pending = {};
        this.draft = updated;
        this.ctx.setDraft(updated);
      },
      error: err => { this.saving = false; this.saveError = err?.error?.error || 'שמירת הגדרות התרומה נכשלה, נסו שוב'; },
    });
  }
}
