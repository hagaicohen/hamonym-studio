import { Component, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { LucideAngularModule, Zap } from 'lucide-angular';
import { CampaignStudioStateService, CampaignDraft, CampaignTheme } from '../../../../campaigns/services/campaign-studio-state.service';
import { CampaignApiService } from '../../../../campaigns/services/campaign-api.service';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { UploadService } from '../../../../../core/services/upload.service';
import { ColorPickerComponent } from '../../../../../shared/ui/color-picker/color-picker.component';
import { RichTextEditorComponent } from '../../../../../shared/ui/rich-text-editor/rich-text-editor.component';
import { environment } from '../../../../../../environments/environment';

// Step 1 for layout.pageFormat === 'minimal' — replaces campaign-basic-step
// entirely (not a stripped-down reuse of it) for this format. That step's
// hero upload/category/manager-name/story fields all describe a full
// Page-Builder page this format never renders — per the 2026-09-24 decision,
// a "quick donation page" is deliberately just: logo (auto, no picker),
// title, one short line, and (added here, not in the original ask, but
// required to publish with a real shareable link instead of the backend's
// `draft-<timestamp>-<random>` fallback) an auto-derived, still-editable
// slug. No hero, no category, no story, no advanced styling.
@Component({
  selector: 'app-campaign-minimal-details-step',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, ColorPickerComponent, RichTextEditorComponent],
  templateUrl: './campaign-minimal-details-step.component.html',
  styleUrl: './campaign-minimal-details-step.component.css',
})
export class CampaignMinimalDetailsStepComponent implements OnInit {
  protected state = inject(CampaignStudioStateService);
  private entityService = inject(CurrentEntityService);
  private entitiesService = inject(EntitiesService);
  private campaignApi = inject(CampaignApiService);
  private uploadService = inject(UploadService);

  readonly ZapIcon = Zap;

  @ViewChild('campaignLogoInput') campaignLogoInputRef?: ElementRef<HTMLInputElement>;

  entityLogoUrl: string | null = null;
  entityName = '';
  isUploadingLogo = false;

  get draft(): CampaignDraft { return this.state.draft; }

  // ── Custom logo — overrides the automatic entity logo for this page only
  // (draft.campaignLogoUrl, the exact field MinimalDonationPageComponent
  // already prefers before falling back to the entity's own — see its
  // logoUrl()). Explicitly requested (2026-09-24) after the "auto only, no
  // picker" decision from earlier the same day — reuses campaign-basic-
  // step's exact upload path (UploadService → 'campaigns/logos'), minus its
  // auto-contrast-background logic, which is about the full page's "logo
  // strip" background and doesn't apply to this page's plain white one.
  onCampaignLogoChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.isUploadingLogo = true;
    this.uploadService.upload(file, 'campaigns/logos').subscribe({
      next: url => {
        this.state.patch({ campaignLogoUrl: url });
        this.isUploadingLogo = false;
      },
      error: () => { this.isUploadingLogo = false; },
    });
  }

  removeCampaignLogo(): void {
    this.state.patch({ campaignLogoUrl: null });
    if (this.campaignLogoInputRef) this.campaignLogoInputRef.nativeElement.value = '';
  }

  // ── Logo shape/size/background — layout.minimalLogoShape/Size (new,
  // minimal-only) + the existing theme.logoBg (empty string = no
  // background, same "none" semantics as elsewhere). Three fixed size
  // presets rather than a raw px input — "פשוט להבנה" per the request.
  get logoShape(): 'circle' | 'square' | 'none' { return this.draft.layout.minimalLogoShape ?? 'circle'; }
  get logoSize(): 'sm' | 'md' | 'lg' { return this.draft.layout.minimalLogoSize ?? 'md'; }

  setLogoShape(shape: 'circle' | 'square' | 'none'): void {
    this.state.patch({ layout: { ...this.draft.layout, minimalLogoShape: shape } });
  }
  setLogoSize(size: 'sm' | 'md' | 'lg'): void {
    this.state.patch({ layout: { ...this.draft.layout, minimalLogoSize: size } });
  }

  patchLayout(partial: Partial<CampaignDraft['layout']>): void {
    this.state.patch({ layout: { ...this.draft.layout, ...partial } });
  }

  // ── Colors — layout.theme.primaryColor already drives --mdp-primary in
  // MinimalDonationPageComponent (the title's own color, the amount-picker's
  // selected state, the donate button) and accentColor drives --mdp-accent
  // (hover state) — controlling them here needs no new field or template
  // change on the actual donation page, just exposing the existing theme
  // values. Same patchTheme() shape as campaign-basic-step. 2026-09-24.
  patchTheme(partial: Partial<CampaignTheme>): void {
    const draft = this.state.draft;
    this.state.patch({ layout: { ...draft.layout, theme: { ...draft.layout.theme, ...partial } } });
  }

  ngOnInit(): void {
    const entity = this.entityService.currentEntity();
    if (!entity?.id) return;
    this.entityName = entity.display_name || entity.legal_name || entity.name || '';
    this.entitiesService.getEntityById(entity.id).subscribe({
      next: (res: any) => {
        const raw = res?.logo_url ?? null;
        if (raw) {
          this.entityLogoUrl = (raw.startsWith('http') || raw.startsWith('data:image'))
            ? raw : `${environment.apiUrl}${raw}`;
        }
        if (!this.entityName) this.entityName = res?.display_name || res?.legal_name || res?.name || '';
        // MinimalDonationPageComponent reads draft.entityLogo/entityName
        // directly (same fields the public fetch populates) — but for a
        // brand-new, not-yet-saved campaign nothing has ever set them (the
        // backend only joins them on load/publish fetches), so its own live
        // preview showed nothing regardless of the getCampaignById fix.
        // Patching them here, from the same entity lookup this step already
        // does for its own preview, closes that gap for the new-campaign
        // case too. Found 2026-09-24.
        if (this.entityLogoUrl && !this.state.draft.entityLogo) {
          this.state.patch({ entityLogo: this.entityLogoUrl, entityName: this.entityName });
        }
      },
    });
  }

  sync(): void { this.state.sync(); }

  // ── Slug — auto-derived from the title until the visitor edits it
  // directly, same async availability check as campaign-basic-step (reuses
  // the same endpoint, not a parallel implementation). isSlugLocked mirrors
  // that step's own rule (frozen once published — shared links must not
  // break).
  slugManuallyEdited = false;
  slugTimeout: any;
  isCheckingSlug = false;
  slugAvailable: boolean | null = null;

  get isSlugLocked(): boolean { return !!this.state.draft.publishedAt; }

  private slugify(title: string): string {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9א-ת\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  onTitleChange(value: string): void {
    this.state.patch({ title: value });
    if (!this.isSlugLocked && !this.slugManuallyEdited) {
      this.applySlug(this.slugify(value));
    }
    this.sync();
  }

  // ── Advanced text mode — opt-in (off by default), lets the manager use
  // the existing rich-text editor (compact: font size/color/align/bold)
  // instead of the plain title input + the simple color pickers above. See
  // the CampaignLayout field's own doc comment for why title/rich-title are
  // kept as two separate fields.
  get advancedText(): boolean { return !!this.draft.layout.minimalAdvancedText; }
  toggleAdvancedText(): void { this.patchLayout({ minimalAdvancedText: !this.advancedText }); }

  private stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return (div.textContent || div.innerText || '').trim();
  }

  onTitleRichChange(html: string): void {
    this.patchLayout({ minimalTitleRichHtml: html });
    this.onTitleChange(this.stripHtml(html));
  }

  // Description side reuses projectDescription (an existing, already-rich
  // field — CampaignStudioStateService.setProjectDescription) one-for-one,
  // plus keeping shortDescription in sync as a plain-text mirror so campaign
  // list cards / SEO meta (which read shortDescription directly, not
  // projectDescription) don't go blank once a manager switches to advanced
  // mode.
  onDescriptionRichChange(html: string): void {
    this.state.setProjectDescription(html);
    this.state.patch({ shortDescription: this.stripHtml(html).slice(0, 160) });
  }

  onSlugChange(value: string): void {
    this.slugManuallyEdited = true;
    const normalized = value.toLowerCase().replace(/[^a-z0-9א-ת-]/g, '');
    this.applySlug(normalized);
  }

  private applySlug(normalized: string): void {
    this.state.patch({ slug: normalized });
    clearTimeout(this.slugTimeout);
    if (!normalized || normalized.trim().length < 3) {
      this.slugAvailable = null;
      this.isCheckingSlug = false;
      return;
    }
    this.isCheckingSlug = true;
    this.slugAvailable = null;
    this.slugTimeout = setTimeout(() => {
      const excludeId = this.state.draft.id;
      this.campaignApi.checkSlugAvailable(normalized.trim(), excludeId).subscribe({
        next: (available) => { this.slugAvailable = available; this.isCheckingSlug = false; },
        error: () => { this.slugAvailable = null; this.isCheckingSlug = false; },
      });
    }, 800);
  }
}
