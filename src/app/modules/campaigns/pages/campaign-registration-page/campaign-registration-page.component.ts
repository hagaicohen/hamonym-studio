import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignDraft, RegistrationOption } from '../../services/campaign-studio-state.service';
import { CampaignManagementSidebarComponent } from '../../shared/components/campaign-management-sidebar/campaign-management-sidebar.component';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Dedicated page (2026-08-06 architecture reset). The Builder's own
// campaign-registration-step was already content-only (no design controls
// to strip) — this is a direct port to the self-sufficient
// fetch→mutate→save pattern, off CampaignStudioStateService.
@Component({
  selector: 'app-campaign-registration-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CampaignManagementSidebarComponent],
  templateUrl: './campaign-registration-page.component.html',
  styleUrl: './campaign-registration-page.component.css',
})
export class CampaignRegistrationPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;

  editingId: string | null = null;
  priceInput = '';
  option: RegistrationOption = this.empty();

  get isEditing(): boolean { return this.editingId !== null; }
  get isFormValid(): boolean { return !!this.option.title.trim() && this.option.price > 0; }

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

  save(): void {
    if (!this.draft || !this.isFormValid) return;
    if (this.editingId) {
      const registrationOptions = this.draft.registrationOptions.map(o =>
        o.id === this.editingId ? { ...this.option, id: this.editingId! } : o
      );
      this.draft = { ...this.draft, registrationOptions };
    } else {
      const item = { ...this.option, id: Date.now().toString() };
      this.draft = { ...this.draft, registrationOptions: [...this.draft.registrationOptions, item] };
    }
    this.persist();
    this.reset();
  }

  clearForm(): void { this.reset(); }

  editOption(o: RegistrationOption): void {
    this.editingId = o.id;
    this.option = { ...o };
    this.priceInput = o.price ? o.price.toLocaleString('he-IL') : '';
  }

  deleteOption(id: string): void {
    if (!this.draft) return;
    if (id === this.editingId) this.reset();
    this.draft = { ...this.draft, registrationOptions: this.draft.registrationOptions.filter(o => o.id !== id) };
    this.persist();
  }

  onPriceInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^0-9]/g, '');
    const n = Number(raw || 0);
    this.option.price = n;
    this.priceInput = n ? n.toLocaleString('he-IL') : '';
  }

  private empty(): RegistrationOption {
    return { id: '', key: '', title: '', description: '', price: 0 };
  }

  private reset(): void {
    this.editingId = null;
    this.priceInput = '';
    this.option = this.empty();
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
