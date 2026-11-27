import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MoneyInputDirective } from '../../../../shared/directives/money-input.directive';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CampaignApiService } from '../../services/campaign-api.service';
import { CampaignWorkspaceContextService } from '../../services/campaign-workspace-context.service';
import { CampaignDraft, CampaignLocation, CampaignLocationType } from '../../services/campaign-studio-state.service';
import { campaignEditPath } from '../../campaign-editor-route';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { ENTITY_CATEGORIES } from '../../../../shared/config/entity-categories';
import { CategorySelectorComponent } from '../../../../shared/ui/category-picker/category-selector.component';


import { HmIconComponent } from '../../../../shared/ui/design-system/icon.component';
@Component({
  selector: 'app-campaign-settings-page',
  standalone: true,
  imports: [MoneyInputDirective, CategorySelectorComponent, RouterLink, HmIconComponent, CommonModule, FormsModule],
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
  categoryOpen = false;
  candidateCategory: string[] = [];
  private pending: Parameters<CampaignApiService['updateWorkspaceFields']>[1] = {};

  get selectedCategoryLabel(): string {
    return ENTITY_CATEGORIES.find(category => category.id === this.draft?.category)?.label || 'בחירת קטגוריה';
  }

  get dirty(): boolean { return Object.keys(this.pending).length > 0; }

  openCategory(): void {
    this.candidateCategory = this.draft?.category ? [this.draft.category] : [];
    this.categoryOpen = true;
  }

  applyCategory(): void {
    this.patchText('category', this.candidateCategory[0] || '');
    this.categoryOpen = false;
  }

  cancel(): void {
    this.pending = {};
    this.draft = this.ctx.draft();
    this.saveError = null;
    this.saved = false;
  }

  setLifecycle(ongoing: boolean): void {
    if (!this.draft) return;
    const campaignLifecycle = ongoing ? 'ongoing' : 'one-time';
    this.draft = { ...this.draft, campaignLifecycle };
    this.stage({ campaign_lifecycle: campaignLifecycle });
  }

  get builderLink(): string[] { return campaignEditPath(this.campaignId); }

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

  patchText(field: 'title' | 'category' | 'managerName' | 'shortDescription', value: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, [field]: value };
    const key = field === 'managerName' ? 'manager_name' : field === 'shortDescription' ? 'short_description' : field;
    this.stage({ [key]: value });
  }

  patchTarget(value: number | null): void {
    if (!this.draft || value === null || value < 0) return;
    this.draft = { ...this.draft, targetAmount: value };
    this.stage({ target_amount: value });
  }

  patchDate(field: 'startDate' | 'endDate', value: string): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, [field]: value };
    const key = field === 'startDate' ? 'start_date' : 'end_date';
    this.stage({ [key]: value || null });
  }

  setLocationType(type: CampaignLocationType): void {
    if (!this.draft) return;
    const canned = CampaignSettingsPageComponent.LOCATION_CANNED_LABEL[type];
    const existing = this.draft.layout.campaignLocation;
    const location: CampaignLocation = canned
      ? { type, label: canned }
      : { type, label: existing?.label ?? '', city: existing?.city };
    this.draft = { ...this.draft, layout: { ...this.draft.layout, campaignLocation: location } };
    this.stage({ campaign_location: location });
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
    this.stage({ campaign_location: location });
  }

  clearLocation(): void {
    if (!this.draft) return;
    this.draft = { ...this.draft, layout: { ...this.draft.layout, campaignLocation: undefined } };
    this.stage({ campaign_location: null });
  }

  private stage(fields: Parameters<CampaignApiService['updateWorkspaceFields']>[1]): void {
    this.pending = { ...this.pending, ...fields };
    this.saved = false;
    this.saveError = null;
  }

  save(): void {
    if (!this.draft || this.saving || !this.dirty) return;
    if (!this.draft.title.trim()) { this.saveError = 'יש להזין שם קמפיין'; return; }
    if (!this.isOngoing && this.draft.startDate && this.draft.endDate && this.draft.startDate > this.draft.endDate) {
      this.saveError = 'תאריך הסיום חייב להיות אחרי תאריך ההתחלה';
      return;
    }
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
      error: err => { this.saving = false; this.saveError = err?.error?.error || 'שמירת ההגדרות נכשלה, נסו שוב'; },
    });
  }
}
