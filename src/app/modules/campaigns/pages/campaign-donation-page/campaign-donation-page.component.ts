import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignDraft, DonorFieldsConfig, DEFAULT_DONOR_FIELDS } from '../../services/campaign-studio-state.service';
import { CampaignManagementSidebarComponent } from '../../shared/components/campaign-management-sidebar/campaign-management-sidebar.component';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Dedicated page (2026-08-06 architecture reset). Was briefly embedded in
// the old accordion "Management" section (now removed) — re-homed here as
// its own page, same self-sufficient fetch→mutate→save pattern as the rest
// of the workspace. Already content-only in the Builder's own step, so
// this is close to a direct port.
@Component({
  selector: 'app-campaign-donation-page',
  standalone: true,
  imports: [CommonModule, CampaignManagementSidebarComponent],
  templateUrl: './campaign-donation-page.component.html',
  styleUrl: './campaign-donation-page.component.css',
})
export class CampaignDonationPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;

  get donorFields(): DonorFieldsConfig {
    return { ...DEFAULT_DONOR_FIELDS, ...(this.draft?.donorFields ?? {}) };
  }

  ngOnInit(): void {
    this.loader.hide();
    this.campaignId = this.route.snapshot.paramMap.get('id') ?? '';
    if (!this.campaignId) { this.loading = false; return; }
    this.campaignApi.getById(this.campaignId).subscribe({
      next: draft => { this.draft = draft; this.loading = false; },
      error: () => { this.loading = false; },
    });
  }

  back(): void { this.router.navigate(['/campaigns', this.campaignId, 'dashboard']); }

  patchDraft(partial: Partial<CampaignDraft>): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, ...partial };
    this.persist();
  }

  toggleDonorField(field: keyof DonorFieldsConfig): void {
    if (!this.draft) return;
    const current = this.donorFields;
    this.draft = { ...this.draft, donorFields: { ...current, [field]: !current[field] } };
    this.persist();
  }

  // Same pattern as campaign-rewards-page's amount field — blocks non-digit
  // keys, and reformats with a thousands separator (so 4-digit amounts read
  // as "1,500" instead of "1500") purely in the DOM on (input); the model
  // only updates on (change)/blur, same as before, so autosave still fires
  // once per edit rather than on every keystroke.
  allowDigitsOnly(event: KeyboardEvent): void {
    const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
    if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
    if (!/^[0-9]$/.test(event.key)) event.preventDefault();
  }

  reformatAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9]/g, '');
    input.value = raw ? Number(raw).toLocaleString('he-IL') : '';
  }

  parsedAmount(input: HTMLInputElement): number {
    return Number(input.value.replace(/[^0-9]/g, '')) || 0;
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

  private persist(): void {
    if (!this.draft) return;
    this.saving = true;
    this.campaignApi.update(this.campaignId, this.draft).subscribe({
      next: () => { this.saving = false; },
      error: () => { this.saving = false; },
    });
  }
}
