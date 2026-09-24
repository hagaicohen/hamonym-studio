import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import {
  LucideAngularModule,
  FileText, Heart, Settings, Gift, Info, CreditCard, Check, CircleAlert, Rocket, Loader, Users,
} from 'lucide-angular';
import { CampaignStudioStateService, FUNDING_TYPE_LABELS } from '../../../../campaigns/services/campaign-studio-state.service';
import { CampaignApiService }         from '../../../../campaigns/services/campaign-api.service';
import { CurrentEntityService }       from '../../../../../core/services/current-entity.service';

@Component({
  selector: 'app-campaign-publish-step',
  standalone: true,
  imports: [CommonModule, LucideAngularModule, RouterLink],
  templateUrl: './campaign-publish-step.component.html',
  styleUrl: './campaign-publish-step.component.css',
})
export class CampaignPublishStepComponent implements OnInit {

  protected campaignState = inject(CampaignStudioStateService);
  private campaignApi     = inject(CampaignApiService);
  private currentEntity   = inject(CurrentEntityService);
  private router          = inject(Router);

  isPublishing = false;
  errorMessage: string | null = null;

  // "מעבר לקמפיין" — found 2026-09-24 that this was a plain routerLink,
  // meaning a manager who reached this screen via the streamlined
  // isReady/!entityApproved path (no publish button reachable there at all)
  // could click it, land on a real-looking "✓ הקמפיין נשמר" success screen,
  // and leave — while nothing had ever actually been saved (the campaign is
  // only ever persisted by an explicit save, previously only reachable via
  // the topbar's separate "שמור טיוטה" button or by publishCampaign(), and
  // publishCampaign() returns early with an error before saving when
  // !entityApproved). This makes the confirmation itself DO the save (same
  // create/update call publishCampaign() uses, minus the publish step) before
  // navigating — an explicit "אישור" action, not a passive link that assumes
  // persistence already happened.
  isSaving = false;

  confirmAndGoToCampaign(): void {
    if (this.isSaving || this.isPublishing) return;
    this.errorMessage = null;

    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) {
      this.errorMessage = 'לא נמצאה עמותה מחוברת. נסה להתחבר מחדש.';
      return;
    }

    this.isSaving = true;
    const draft = this.draft;
    // Publication intent (2026-09-24) — captured at click time, before the
    // save resolves: this is exactly the "finished, ready, only entity
    // approval is blocking me" moment described in the lifecycle fix. Never
    // set outside this exact condition (e.g. the canPublish branch's own
    // "מעבר לקמפיין" call to this same method doesn't need it — the entity
    // is already approved there, so there's nothing to wait for).
    const shouldRequestPublish = this.isReady && !this.entityApproved;
    const save$ = draft.id
      ? this.campaignApi.update(draft.id, draft)
      : this.campaignApi.create(entityId, draft);

    save$.subscribe({
      next: (res) => {
        const id = (draft.id ?? res?.id) as string;
        if (!draft.id && id) this.campaignState.patch({ id });
        this.isSaving = false;
        // Fire-and-forget — never blocks navigation, never surfaces its own
        // error. This just records intent for campaigns.service.js#
        // publishRequestedCampaigns to act on once the entity is approved;
        // the campaign itself already saved successfully regardless.
        if (shouldRequestPublish && id) {
          this.campaignApi.requestPublish(id).subscribe({ error: () => {} });
        }
        this.router.navigate(['/campaigns', id, 'dashboard']);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMessage = err?.error?.error ?? err?.error?.message ?? 'שמירת הקמפיין נכשלה. נסה שוב.';
      },
    });
  }

  // AI-generated title/short-description candidate (see DECISIONS.md) — only
  // triggered when the dedicated field is actually empty. Optional/best-effort:
  // a failure here must never surface an error or block publishing.
  metadataSuggestion: { suggestedTitle: string | null; suggestedShortDescription: string | null } | null = null;
  isLoadingSuggestion = false;
  dismissedTitle = false;
  dismissedShortDescription = false;

  get draft() { return this.campaignState.draft; }

  readonly FileText    = FileText;
  readonly Heart       = Heart;
  readonly Settings    = Settings;
  readonly Gift        = Gift;
  readonly Info        = Info;
  readonly CreditCard  = CreditCard;
  readonly Check       = Check;
  readonly CircleAlert = CircleAlert;
  readonly Rocket      = Rocket;
  readonly Loader      = Loader;
  readonly Users       = Users;

  get fundingTypeLabel(): string {
    return FUNDING_TYPE_LABELS[this.draft.fundingType] ?? '';
  }

  get isOngoing(): boolean { return this.draft.campaignLifecycle === 'ongoing'; }

  get campaignDays(): number {
    if (!this.draft.startDate || !this.draft.endDate) return 0;
    const diff = new Date(this.draft.endDate).getTime() - new Date(this.draft.startDate).getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  formatDate(iso: string): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-');
    if (!y || !m || !d) return '—';
    return `${d}/${m}/${y}`;
  }

  get hasHero(): boolean {
    return this.draft.heroType === 'image'
      ? !!this.draft.coverImageUrl
      : !!this.draft.videoUrl;
  }

  // MinimalDonationPageComponent never renders a hero image/video — requiring
  // one to publish would force a pointless upload on the one format whose
  // entire point is "logo, short text, amount, done." See
  // campaign-studio-state.service.ts CampaignLayout.pageFormat.
  get isMinimalFormat(): boolean {
    return this.draft.layout.pageFormat === 'minimal';
  }

  get hasStoryBlock(): boolean {
    return this.draft.blocks.some(b =>
      b.type === 'rich-text' && !!(b.data as { content?: string }).content?.replace(/<[^>]*>/g, '').trim()
    );
  }

  // title IS a hard block (2026-08-02) — a campaign can't be published
  // nameless. shortDescription stays a soft recommendation (the Campaign
  // Advisor's job), same reasoning as before: a manager may design the page
  // so it never renders as literal text (showHeroSubtitle can hide it) —
  // but the title is the campaign's identity, shown everywhere (lists,
  // admin, browser tab), not just optionally on the Hero.
  get missingFields(): string[] {
    const d = this.draft;
    const missing: string[] = [];
    if (!d.title?.trim())            missing.push('שם הקמפיין');
    if (!d.slug?.trim())             missing.push('כתובת הקמפיין');
    if (!this.hasHero && !this.isMinimalFormat) missing.push('תמונה / וידאו ראשי');
    // Step 2 ("סוג ויעד") is reachable for minimal-format campaigns too
    // (2026-09-24 decision) — target amount is a real, settable field there
    // again, so it's required the same as full format.
    if (!d.targetAmount) missing.push('יעד גיוס');
    // Dates are meaningless for an ongoing campaign (hidden entirely in
    // campaign-type-step) — only enforce the range for a one-time campaign,
    // where they're real user-entered values.
    if (!this.isOngoing && d.startDate && d.endDate && new Date(d.endDate) < new Date(d.startDate)) {
      missing.push('טווח תאריכים תקין');
    }
    return missing;
  }

  get isReady(): boolean {
    return this.missingFields.length === 0;
  }

  // Publishing takes the campaign public and lets it accept real donations —
  // an entity still pending Super Admin review may build/preview a campaign,
  // but may not fundraise yet (backend is the actual authority, see
  // campaigns.service.js#updateCampaign; this is UX only).
  get entityApproved(): boolean {
    return this.currentEntity.currentEntity()?.status === 'active';
  }

  get canPublish(): boolean {
    return this.isReady && this.entityApproved;
  }

  // AI Visibility Gate — hidden/greyed unless a Platform Admin has granted
  // this entity access (see entities.ai_features_enabled, migration 041).
  get aiEnabled(): boolean {
    return !!this.currentEntity.currentEntity()?.ai_features_enabled;
  }

  ngOnInit(): void {
    const d = this.draft;
    if (d.id && this.aiEnabled && (!d.title?.trim() || !d.shortDescription?.trim())) {
      this.generateSuggestion();
    }
  }

  generateSuggestion(): void {
    if (!this.draft.id || this.isLoadingSuggestion || !this.aiEnabled) return;
    this.isLoadingSuggestion = true;
    this.campaignApi.generateMetadata(this.draft.id).subscribe({
      next: (res) => {
        this.metadataSuggestion = res;
        this.isLoadingSuggestion = false;
      },
      error: (err) => {
        console.error('generateMetadata failed', err);
        this.isLoadingSuggestion = false;
      },
    });
  }

  regenerateSuggestion(): void {
    this.dismissedTitle = false;
    this.dismissedShortDescription = false;
    this.metadataSuggestion = null;
    this.generateSuggestion();
  }

  // showOnHero=false keeps the manager's own Hero copy untouched — the
  // adopted text still fills draft.title (used for social-share/SEO
  // metadata regardless of what's visually on the Hero) without forcing it
  // onto the page. See DECISIONS.md (2026-07-17).
  adoptTitle(showOnHero = true): void {
    const title = this.metadataSuggestion?.suggestedTitle;
    if (!title) return;
    this.campaignState.patch({
      title: title.slice(0, 80),
      ...(showOnHero ? {} : { showHeroTitle: false }),
    });
    this.dismissedTitle = true;
  }

  adoptShortDescription(showOnHero = true): void {
    const shortDescription = this.metadataSuggestion?.suggestedShortDescription;
    if (!shortDescription) return;
    this.campaignState.patch({
      shortDescription: shortDescription.slice(0, 160),
      ...(showOnHero ? {} : { showHeroSubtitle: false }),
    });
    this.dismissedShortDescription = true;
  }

  dismissTitleSuggestion(): void {
    this.dismissedTitle = true;
  }

  dismissShortDescriptionSuggestion(): void {
    this.dismissedShortDescription = true;
  }

  publishCampaign(): void {
    if (this.isPublishing) return;
    this.errorMessage = null;

    if (!this.isReady) {
      this.errorMessage = 'יש להשלים את כל השדות הנדרשים לפני פרסום';
      return;
    }

    if (!this.entityApproved) {
      this.errorMessage = 'העמותה ממתינה לאישור ועדיין לא ניתן לפרסם קמפיינים או לגייס כספים';
      return;
    }

    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) {
      this.errorMessage = 'לא נמצאה עמותה מחוברת. נסה להתחבר מחדש.';
      return;
    }

    this.isPublishing = true;

    const draft = this.draft;

    const save$ = draft.id
      ? this.campaignApi.update(draft.id, draft)
      : this.campaignApi.create(entityId, draft);

    save$.pipe(
      switchMap(res => {
        const id = (draft.id ?? res?.id) as string;
        if (!draft.id && id) {
          this.campaignState.patch({ id });
        }
        return this.campaignApi.publish(id);
      })
    ).subscribe({
      next: () => {
        this.campaignState.patch({ status: 'published' });
        this.isPublishing = false;
        this.router.navigate(['/campaigns']);
      },
      error: (err) => {
        this.isPublishing = false;
        this.errorMessage = err?.error?.error ?? err?.error?.message ?? 'אירעה שגיאה. נסה שוב.';
      },
    });
  }
}
