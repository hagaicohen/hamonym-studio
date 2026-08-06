import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignDraft } from '../../services/campaign-studio-state.service';
import { CampaignManagementSidebarComponent } from '../../shared/components/campaign-management-sidebar/campaign-management-sidebar.component';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Dedicated page (2026-08-06 architecture reset) — CONTENT/setup fields
// only, no Design (no colors/layout/placement — those stay in the Builder).
// Saves per field on (change), same full-draft round trip
// (campaignApi.update) the Builder's own topbar uses — no partial-update
// mechanism, no shared CampaignStudioStateService (this page is
// self-sufficient: fetch → mutate → save, same pattern as Updates).
// Slug/status are deliberately not editable here — see the "why" notes
// inline below.
@Component({
  selector: 'app-campaign-settings-page',
  standalone: true,
  imports: [CommonModule, FormsModule, CampaignManagementSidebarComponent],
  templateUrl: './campaign-settings-page.component.html',
  styleUrl: './campaign-settings-page.component.css',
})
export class CampaignSettingsPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private loader = inject(AppLoaderService);

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;

  get isOngoing(): boolean { return this.draft?.campaignLifecycle === 'ongoing'; }

  // app.component.ts's router-events listener treats every '/campaigns'-
  // prefixed route as "self-hiding" — it shows the global loader on
  // navigation and does NOT auto-hide it, trusting the destination page to
  // call hide() itself once ready (see campaign-dashboard-page.component.ts
  // for the same fix, applied there first).
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

  patchText(field: 'title' | 'category' | 'managerName', value: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, [field]: value };
    this.persist();
  }

  patchTarget(value: string): void {
    if (!this.draft) return;
    const n = Number(value.replace(/[^0-9]/g, '')) || 0;
    this.draft = { ...this.draft, targetAmount: n };
    this.persist();
  }

  patchDate(field: 'startDate' | 'endDate', value: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, [field]: value };
    this.persist();
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
