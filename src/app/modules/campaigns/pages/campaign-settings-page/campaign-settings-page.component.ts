import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft, CampaignLocation, CampaignLocationType } from '../../services/campaign-studio-state.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { ENTITY_CATEGORIES } from '../../../../shared/config/entity-categories';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './campaign-settings-page.component.html',
  styleUrl: './campaign-settings-page.component.css',
})
export class CampaignSettingsPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private campaignApi = inject(CampaignApiService);
  private ctx = inject(CampaignWorkspaceContextService);
  private loader = inject(AppLoaderService);

  // Category persistence = ENTITY_CATEGORIES id (canonical), presentation =
  // label -- same shared source the Builder's picker uses, native <select>
  // here to match this page's own "simple, rarely-changed metadata"
  // pattern rather than replicating the Builder's custom autocomplete
  // widget (2026-09-23).
  readonly categories = ENTITY_CATEGORIES;

  // Campaign Location (2026-09-29) — Step 1 in the Builder (where this field
  // was first added) is one of PUBLISHED_GATED_STEPS (campaign-editor
  // .component.ts), so a manager editing an already-published campaign can
  // never reach it there. This page is exactly the "Workspace equivalent"
  // gated Builder steps are meant to hand off to (see that file's own
  // comment) — same duplication pattern already used here for category/
  // managerName/title. Mutates this.draft.layout directly, same
  // fetch->mutate->save round trip as every other field on this page (no
  // shared CampaignStudioStateService — this page is deliberately self-
  // sufficient).
  readonly LOCATION_TYPES: { type: CampaignLocationType; label: string }[] = [
    { type: 'nationwide',     label: 'כל הארץ' },
    { type: 'region',         label: 'עיר / אזור בישראל' },
    { type: 'online',         label: 'אונליין' },
    { type: 'international',  label: 'פעילות בינלאומית' },
    { type: 'custom',         label: 'מיקום מותאם אישית' },
  ];

  private static readonly LOCATION_CANNED_LABEL: Partial<Record<CampaignLocationType, string>> = {
    nationwide: 'כל הארץ',
    online: 'אונליין',
    international: 'פעילות בינלאומית',
  };

  campaignId = '';
  draft: CampaignDraft | null = null;
  loading = true;
  saving = false;
  saveError: string | null = null;
  saved = false;

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
    this.ctx.ensureLoaded(this.campaignId).subscribe({
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

  // Display only — patchTarget above already strips non-digit characters
  // when parsing the input back, so commas round-trip safely.
  formatMoney(n: number): string {
    return (n || 0).toLocaleString('he-IL');
  }

  patchDate(field: 'startDate' | 'endDate', value: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, [field]: value };
    this.persist();
  }

  setLocationType(type: CampaignLocationType): void {
    if (!this.draft) return;
    const canned = CampaignSettingsPageComponent.LOCATION_CANNED_LABEL[type];
    const existing = this.draft.layout.campaignLocation;
    const location: CampaignLocation = canned
      ? { type, label: canned }
      : { type, label: existing?.label ?? '', city: existing?.city };
    this.draft = { ...this.draft, layout: { ...this.draft.layout, campaignLocation: location } };
    this.persist();
  }

  setLocationLabel(value: string): void {
    const current = this.draft?.layout.campaignLocation;
    if (!this.draft || !current) return;
    const location: CampaignLocation = {
      ...current,
      label: value,
      ...(current.type === 'region' ? { city: value } : {}),
    };
    this.draft = { ...this.draft, layout: { ...this.draft.layout, campaignLocation: location } };
    this.persist();
  }

  clearLocation(): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, layout: { ...this.draft.layout, campaignLocation: undefined } };
    this.persist();
  }

  // Explicit save action (2026-09-29) — every field on this page already
  // auto-saves on (change), but a visible, clickable "שמור" the manager can
  // press and watch confirm gives a much stronger sense that an update
  // actually happened than passively noticing small status text. Same
  // persist() round trip, not a second save mechanism.
  saveNow(): void {
    this.persist();
  }

  private persist(): void {
    if (!this.draft) return;
    this.saving = true;
    this.saved = false;
    this.saveError = null;
    this.campaignApi.update(this.campaignId, this.draft).subscribe({
      next: (updated) => { this.saving = false; this.saved = true; this.ctx.setDraft(updated); },
      error: (err) => { this.saving = false; this.saveError = err?.error?.error || 'שמירת ההגדרות נכשלה, נסו שוב'; },
    });
  }
}
