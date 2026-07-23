import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { timeout, map, tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { UploadService } from '../../../../core/services/upload.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { buildPayload as buildOrgPayload, initialState as initialOrgState, OrganizationRegistrationState } from '../../../organization-registration/services/organization-registration-state.service';
import { ENTITY_CATEGORIES } from '../../../../shared/config/entity-categories';

// Website extraction alone can take ~12s (real-world test); LLM calls add
// more on top. 45s is generous slack, not a "should normally take this
// long" figure — this exists purely so a stuck/slow backend call can never
// spin the loader forever, regardless of the cause.
const REQUEST_TIMEOUT_MS = 45000;

// Mirrors campaign-creation.types.js's SuggestedValue / Brief / ExtractedFacts
// shape (backend, plain JSDoc — no shared TS types across the repo boundary).
interface SuggestedValue { value: unknown; reason: string; }
interface Brief {
  organizationName: string | null;
  organizationNumber: string | null;
  organizationDescription: string | null;
  entityType: string | null;
  title: string | null;
  shortDescription: string | null;
  heroVideoUrl: string | null;
  category: SuggestedValue;
  suggestedTargetAmount: SuggestedValue;
  suggestedTone: SuggestedValue;
  suggestedCtaLabel: SuggestedValue;
  suggestedHero: SuggestedValue;
  story: SuggestedValue;
  researchSources: Array<{ title: string; url: string }>;
  clarifyingQuestions: string[];
  designIntent: { emotion: string | null; urgency: string | null; focus: string | null; energy: string | null } | null;
  contentStrategy: { primaryAudience: string | null; storyPattern: string | null; ctaApproach: string | null } | null;
  galleryCuration: { hero: string | null; gallery: string[]; hidden: string[]; reason: string } | null;
}

// Opaque to the frontend — passed back verbatim to /refine-brief, never
// read/displayed directly (see campaign-creation.types.js's ExtractedFacts
// on the backend for the real shape).
type ExtractedFacts = Record<string, unknown>;

interface UploadedFile {
  file: File;
  typeLabel: string;
  note: string;
}

// Mirrors draft.builder.js's return shape (Sprint 3, now exposed over HTTP
// via POST /api/campaign-creation/map-to-draft). campaignDraftPatch's field
// names were hand-verified against the real CampaignDraft interface back
// in Sprint 3 — safe to merge directly via CampaignStudioStateService.patch().
interface DraftPatches {
  campaignDraftPatch: Record<string, unknown>;
  organizationDraftPatch: Record<string, unknown>;
  unmapped: Record<string, unknown>;
}

// Mirrors document-collection.extractor.js's own labels — kept as a fixed,
// deliberately short list (ADR decision-4 spirit: don't build a generic
// taxonomy nobody asked for) rather than a free-for-all.
const FILE_TYPE_OPTIONS = ['לוגו', 'תעודת התאגדות', 'דוח שנתי', 'עלון / ברושור', 'תמונות מהפעילות', 'אחר'];

// Same fixed enum step-entity.component.html's dropdown offers — entity_type
// is one of the 3 fields required just to save an entity at all
// (canSaveDraft), so an AI-created org needs a real value from this exact
// list, not free text. Brief.entityType is an LLM guess in Hebrew prose
// (entityTypeGuess) and is only ever used to best-effort match one of these
// codes (guessEntityTypeCode below) — if it doesn't match confidently, the
// field is left blank and the user must pick manually, same interactive
// pattern as a missing organizationNumber (2026-07-23 decision).
const ENTITY_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'association', label: 'עמותה' },
  { value: 'chalatz', label: 'חל״צ' },
  { value: 'political_party_new', label: 'מפלגה פוליטית חדשה' },
  { value: 'political_party_registered', label: 'מפלגה פוליטית רשומה' },
  { value: 'sole_exempt', label: 'עוסק פטור (יוצרי תוכן בלבד)' },
  { value: 'sole_registered', label: 'עוסק מורשה (יוצרי תוכן בלבד)' },
];

function guessEntityTypeCode(text: string | null): string {
  if (!text) return '';
  if (text.includes('עמות')) return 'association';
  if (text.includes('חל״צ') || text.includes('חל"ץ') || text.includes('לתועלת הציבור')) return 'chalatz';
  if (text.includes('עוסק פטור')) return 'sole_exempt';
  if (text.includes('עוסק מורשה')) return 'sole_registered';
  if (text.includes('מפלגה') && text.includes('חדשה')) return 'political_party_new';
  if (text.includes('מפלגה')) return 'political_party_registered';
  return '';
}

@Component({
  selector: 'app-ai-campaign-creation-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-campaign-creation-page.component.html',
  styleUrl: './ai-campaign-creation-page.component.css',
})
export class AiCampaignCreationPageComponent implements OnInit {
  private http           = inject(HttpClient);
  private loader         = inject(AppLoaderService);
  private router         = inject(Router);
  private currentEntity  = inject(CurrentEntityService);
  private currentContext = inject(CurrentContextService);
  private entitiesApi    = inject(EntitiesService);
  private uploadService  = inject(UploadService);
  private campaignState  = inject(CampaignStudioStateService);
  private campaignApi    = inject(CampaignApiService);

  fileTypeOptions = FILE_TYPE_OPTIONS;
  entityTypeOptions = ENTITY_TYPE_OPTIONS;

  // A single explicit 3-way choice (2026-07-23, replacing an earlier
  // 2-level "create new org" checkbox + nested "org only" checkbox — the
  // user found that unclear and asked for a straightforward pick between
  // the 3 real outcomes instead). Deliberately NOT inferred from free-text
  // wording: creating a real owned entity is consequential enough that the
  // user picks this up front, before the Brief is even generated.
  creationMode = signal<'campaign' | 'org-only' | 'org-and-campaign'>('campaign');
  createNewOrg = computed(() => this.creationMode() !== 'campaign');
  orgOnly = computed(() => this.creationMode() === 'org-only');

  pageTitle = computed(() => {
    switch (this.creationMode()) {
      case 'org-only': return '✨ יצירת עמותה עם AI';
      case 'org-and-campaign': return '✨ יצירת עמותה וקמפיין עם AI';
      default: return '✨ יצירת קמפיין עם AI';
    }
  });

  // Editable "new organization" review fields — prefilled from the Brief
  // once it arrives (see submit()), but always user-editable/confirmable
  // before creation, same "AI proposes, human confirms" principle as the
  // rest of the Brief. organizationNumber and entityType specifically often
  // arrive empty (Facts never guesses a registration number; entityType is
  // free-text prose that may not map to a real code) and BLOCK submission
  // until filled — same DB-level requirement a human hits in canSaveDraft().
  newOrgEntityType    = signal('');
  newOrgName          = signal('');
  newOrgNumber        = signal('');
  newOrgDescription   = signal('');

  canCreateNewOrg = computed(() =>
    !!this.newOrgEntityType().trim() && !!this.newOrgName().trim() && !!this.newOrgNumber().trim()
  );

  // Combined intake (per explicit request): free text + website + files are
  // NOT mutually exclusive tabs — a user can fill in any combination of the
  // three. This doesn't reopen the rejected "Facts Merger" problem: there's
  // no per-source Facts to reconcile, everything is aggregated into one
  // prompt server-side before a single extraction call (see
  // document-collection.extractor.js).
  freeText   = signal('');
  websiteUrl = signal('');
  files      = signal<UploadedFile[]>([]);

  // Explicit opt-in (2026-07-23) — a real web_search call costs money and
  // adds latency, so this is never on by default. See
  // organization-research.tool.js on the backend.
  enableWebResearch = signal(false);

  // Local preview only (createObjectURL, never uploaded) — lets the user
  // visually confirm it's the right image in the Brief-review screen
  // before approving, rather than only seeing a filename.
  logoPreviewUrl = computed(() => {
    const logoFile = this.files().find((f) => f.typeLabel === 'לוגו' && f.file.type.startsWith('image/'));
    return logoFile ? URL.createObjectURL(logoFile.file) : null;
  });

  brief  = signal<Brief | null>(null);
  facts  = signal<ExtractedFacts | null>(null);
  error  = signal<string | null>(null);
  submitting = signal(false);

  // Clarifying-questions round (2026-07-23) — a bounded, ONE-shot follow-up,
  // not a multi-turn conversation: the backend has no session memory of any
  // of this, the frontend just carries `facts` forward and sends a second
  // ordinary request. See campaign-creation.controller.js's refineBrief.
  clarifyingAnswers = signal<Array<{ question: string; answer: string }>>([]);
  refiningStory = signal(false);
  refineError = signal<string | null>(null);

  creatingCampaign = signal(false);
  createError = signal<string | null>(null);

  canSubmit = computed(() =>
    !this.submitting() && (!!this.freeText().trim() || !!this.websiteUrl().trim() || this.files().length > 0)
  );

  ngOnInit(): void {
    // AppComponent's router-level loader deliberately stays up after
    // navigating to any /campaigns/* route (SELF_HIDING_PREFIXES in
    // app.component.ts) — it expects the destination page to dismiss it once
    // its own initial data load finishes. This page has no initial data
    // fetch of its own, so without this the overlay never gets dismissed at
    // all — it silently blocks every click on the page forever, which is
    // exactly the "spinner never stops" bug found via live testing.
    this.loader.hide();
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = Array.from(input.files ?? []);
    if (!picked.length) return;

    const additions: UploadedFile[] = picked.map((file) => ({
      file,
      typeLabel: guessTypeLabel(file.name),
      note: '',
    }));
    this.files.update((current) => [...current, ...additions]);
    input.value = ''; // allow re-selecting the same file name later
  }

  removeFile(index: number): void {
    this.files.update((current) => current.filter((_, i) => i !== index));
  }

  updateFileType(index: number, typeLabel: string): void {
    this.files.update((current) => current.map((f, i) => (i === index ? { ...f, typeLabel } : f)));
  }

  updateFileNote(index: number, note: string): void {
    this.files.update((current) => current.map((f, i) => (i === index ? { ...f, note } : f)));
  }

  submit(): void {
    if (!this.canSubmit()) return;

    this.error.set(null);
    this.brief.set(null);
    this.submitting.set(true);
    this.loader.show(this.websiteUrl().trim() ? 'קוראים את המידע שלכם...' : 'מנתחים את המידע...');

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    const formData = new FormData();
    for (const f of this.files()) formData.append('files', f.file, f.file.name);
    formData.append('filesMeta', JSON.stringify(this.files().map((f) => ({ typeLabel: f.typeLabel, note: f.note }))));
    if (this.freeText().trim()) formData.append('freeText', this.freeText().trim());
    if (this.websiteUrl().trim()) formData.append('websiteUrl', this.websiteUrl().trim());
    if (this.enableWebResearch()) formData.append('enableWebResearch', 'true');

    this.http
      .post<{ brief: Brief; facts: ExtractedFacts }>(`${environment.apiUrl}/api/campaign-creation/extract-documents`, formData, { headers })
      .pipe(timeout(REQUEST_TIMEOUT_MS))
      .subscribe({
        next: (res) => {
          this.brief.set(res.brief);
          this.facts.set(res.facts);
          this.clarifyingAnswers.set(res.brief.clarifyingQuestions.map((question) => ({ question, answer: '' })));
          if (this.createNewOrg()) {
            this.newOrgEntityType.set(guessEntityTypeCode(res.brief.entityType));
            this.newOrgName.set(res.brief.organizationName || '');
            this.newOrgNumber.set(res.brief.organizationNumber || '');
            this.newOrgDescription.set(res.brief.organizationDescription || '');
          }
          this.submitting.set(false);
          this.loader.hide();
        },
        error: (err) => {
          this.error.set(err?.error?.error || 'הבקשה נכשלה או נמשכה יותר מדי זמן — נסו שוב');
          this.submitting.set(false);
          this.loader.hide();
        },
      });
  }

  updateClarifyingAnswer(index: number, answer: string): void {
    this.clarifyingAnswers.update((current) => current.map((a, i) => (i === index ? { ...a, answer } : a)));
  }

  // One-shot refine: sends facts (already extracted, no re-parsing) +
  // whatever answers were filled in (blanks are fine — the model still
  // knows what wasn't answered) back to the SAME kind of stateless request
  // as submit(), asking for a better-grounded Brief. Replaces the whole
  // Brief, including a fresh (always empty, per backend) clarifyingQuestions
  // — capped at one round so this can't turn into an endless Q&A loop.
  refineStory(): void {
    const facts = this.facts();
    if (!facts || this.refiningStory()) return;

    const answered = this.clarifyingAnswers().filter((a) => a.answer.trim());
    if (!answered.length) return;

    this.refineError.set(null);
    this.refiningStory.set(true);

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    this.http
      .post<{ brief: Brief }>(`${environment.apiUrl}/api/campaign-creation/refine-brief`, {
        facts,
        userAnswers: answered,
        enableWebResearch: this.enableWebResearch(),
        websiteUrl: this.websiteUrl().trim() || undefined,
      }, { headers })
      .pipe(timeout(REQUEST_TIMEOUT_MS))
      .subscribe({
        next: (res) => {
          this.brief.set(res.brief);
          this.clarifyingAnswers.set([]);
          this.refiningStory.set(false);
        },
        error: (err) => {
          this.refineError.set(err?.error?.error || 'עדכון הטקסט נכשל, נסו שוב');
          this.refiningStory.set(false);
        },
      });
  }

  // Approve the Brief -> (optionally create a new entity first) -> create a
  // real CampaignDraft under that entity -> hand off to Campaign Studio for
  // full editing. Two paths, chosen by the explicit createNewOrg toggle
  // (2026-07-23) — no longer only "attach to the entity the user already
  // manages" (that was the original 2026-07-22 scope-deferral; the user
  // explicitly asked for real org creation afterward).
  approveAndCreate(): void {
    const brief = this.brief();
    if (!brief || this.creatingCampaign()) return;

    if (this.createNewOrg() && !this.canCreateNewOrg()) {
      this.createError.set('יש להשלים סוג ישות, שם עמותה ומספר עמותה לפני יצירה.');
      return;
    }

    this.createError.set(null);
    this.creatingCampaign.set(true);

    if (this.createNewOrg()) {
      this.loader.show('יוצרים את העמותה...');
      this.createOrganization().subscribe({
        next: (entity) => {
          // Upload files, THEN explicitly re-fetch + cache the entity,
          // THEN switch context/navigate — in that order, all awaited.
          // Found live: switchContext() alone triggers CurrentEntityService's
          // own effect(), which fetches the entity asynchronously in the
          // background — navigating to /settings/entities/:id right after
          // (entity-settings.component.ts reads the cached signal ONCE in
          // ngOnInit, not reactively) could easily win that race and show a
          // pre-upload snapshot with no logo/certificate, even though both
          // were correctly saved to the DB moments later. Fetching and
          // calling setEntity() directly here, before navigating, removes
          // the race instead of just narrowing it.
          this.uploadOrganizationFiles(entity.id).pipe(
            switchMap(() => this.entitiesApi.getEntityById(entity.id)),
            catchError(() => of(entity)), // fall back to the pre-upload snapshot rather than block navigation entirely
          ).subscribe((freshEntity) => {
            this.currentEntity.setEntity(freshEntity);
            this.currentContext.addEntityContext(freshEntity);
            this.currentContext.switchContext('entity-manager', freshEntity.id);

            if (this.orgOnly()) {
              // Explicit request (2026-07-23): "create ONLY the org, don't
              // create a campaign" — stop here instead of always chaining
              // into createCampaignUnder().
              this.creatingCampaign.set(false);
              this.loader.hide();
              this.router.navigate(['/settings/entities', freshEntity.id]);
              return;
            }

            this.createCampaignUnder(freshEntity.id, brief);
          });
        },
        error: (err) => {
          this.creatingCampaign.set(false);
          this.loader.hide();
          this.createError.set(err?.error?.message || err?.error?.error || 'יצירת העמותה נכשלה, נסו שוב');
        },
      });
      return;
    }

    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) {
      this.creatingCampaign.set(false);
      this.createError.set('לא נמצאה עמותה פעילה — יש לבחור עמותה לפני יצירת קמפיין.');
      return;
    }
    this.loader.show('יוצרים את הקמפיין...');
    this.createCampaignUnder(entityId, brief);
  }

  // Reuses organization-registration's own buildPayload() — same field
  // mapping a human's wizard submission produces, so this new entity is
  // indistinguishable from a manually-created one (same draft/pending_review
  // rule via is_profile_complete, same DB constraints). email/phone/fullName
  // are always blank here (Brief never carries contact info) — that keeps
  // is_profile_complete false, so the entity lands in 'draft' status exactly
  // like a human who only filled step 1, completable later in Entity Settings.
  private createOrganization(): Observable<any> {
    const brief = this.brief();
    const category = (brief?.category.value as string) || '';
    const state: OrganizationRegistrationState = {
      ...initialOrgState,
      entityType: this.newOrgEntityType(),
      organizationName: this.newOrgName(),
      displayName: this.newOrgName(),
      organizationNumber: this.newOrgNumber(),
      organizationDescription: this.newOrgDescription(),
      primaryCategory: category,
      selectedCategories: category ? [category] : [],
    };
    return this.entitiesApi.createEntity(buildOrgPayload(state)).pipe(map((res) => res.entity));
  }

  // Uploaded files tagged "לוגו"/"תעודת התאגדות" belong to the ORG itself,
  // not a future campaign — reuses EntitiesService's own upload endpoints
  // (the same ones organization-registration's manual wizard uses after
  // creating an entity), rather than leaving them undelivered the way
  // uploadCampaignImages() already fixed for campaign-level images. Doesn't
  // block on failure, same partial-success philosophy used throughout.
  private uploadOrganizationFiles(entityId: string): Observable<unknown> {
    const logoFile = this.files().find((f) => f.typeLabel === 'לוגו');
    const certFile = this.files().find((f) => f.typeLabel === 'תעודת התאגדות');

    const uploads: Observable<unknown>[] = [];
    if (logoFile) uploads.push(this.entitiesApi.uploadLogo(entityId, logoFile.file));
    if (certFile) uploads.push(this.entitiesApi.uploadAssociationDocument(entityId, certFile.file));

    if (!uploads.length) return of(null);
    return forkJoin(uploads).pipe(catchError(() => of(null)));
  }

  private createCampaignUnder(entityId: string, brief: Brief): void {
    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });
    this.http
      .post<DraftPatches>(`${environment.apiUrl}/api/campaign-creation/map-to-draft`, { brief }, { headers })
      .pipe(timeout(REQUEST_TIMEOUT_MS))
      .subscribe({
        next: (patches) => {
          // Fresh draft, not whatever was left over from an unrelated
          // earlier Studio session in this same browser tab — the service
          // is an app-wide singleton, reset() guarantees a clean slate
          // before merging the AI-derived fields onto it.
          this.campaignState.reset();
          this.campaignState.patch(patches.campaignDraftPatch as any);
          this.applyStoryContent(brief);

          this.uploadCampaignImages(brief).subscribe(() => {
            this.campaignApi.create(entityId, this.campaignState.draft).subscribe({
              next: (created) => {
                this.creatingCampaign.set(false);
                this.loader.hide();
                this.router.navigate(['/campaigns', created.id, 'edit']);
              },
              error: (err) => {
                this.creatingCampaign.set(false);
                this.loader.hide();
                this.createError.set(err?.error?.error || 'יצירת הקמפיין נכשלה, נסו שוב');
              },
            });
          });
        },
        error: () => {
          this.creatingCampaign.set(false);
          this.loader.hide();
          this.createError.set('משהו השתבש בהכנת הקמפיין, נסו שוב');
        },
      });
  }

  // Uploaded files were only ever used as Vision-LLM input for extraction
  // and then discarded — real images (a logo, a hero photo) never actually
  // reached the created campaign. Reuses the same UploadService +
  // /api/media/upload endpoint Campaign Studio's own basic-info step uses,
  // rather than building separate storage plumbing. Doesn't block campaign
  // creation on failure (catchError swallows it) — same "partial success"
  // philosophy as a failed website fetch during combined intake: missing
  // images shouldn't prevent the campaign from being created at all.
  //
  // Found via live testing (2026-07-23): a user uploaded several photos and
  // explicitly asked for all of them to appear — only the first non-logo
  // image was ever used (as the hero cover), the rest were silently
  // dropped. createInitialDraft() has no default gallery block, so one is
  // now built here and inserted into blocks, holding EVERY non-logo image
  // (the same first one also still becomes the hero cover — some overlap
  // is fine, it's normal for a campaign's hero photo to also appear in its
  // own gallery).
  private uploadCampaignImages(brief: Brief): Observable<unknown> {
    const images = this.files().filter((f) => f.file.type.startsWith('image/'));
    const logoFile = images.find((f) => f.typeLabel === 'לוגו');
    // Same order/filter the backend used to build its "image1"/"image2"...
    // labels (see campaign-creation.controller.js) — indices have to line
    // up exactly for galleryCuration's codes to map back to real files.
    const contentImages = images.filter((f) => f.typeLabel !== 'לוגו');
    const byLabel = (label: string | null) => {
      const i = label ? Number(label.replace('image', '')) - 1 : -1;
      return i >= 0 ? contentImages[i] : undefined;
    };

    const curation = brief.galleryCuration;
    // Falls back to the old naive rule (first content image = hero, rest in
    // upload order = gallery, none hidden) when curation is missing/empty
    // — e.g. no images were sent to the Brief call, or the model returned
    // nothing usable. heroVideoUrl (an explicit link the user gave) takes
    // priority over any uploaded photo when both are present.
    const heroFile = this.campaignState.draft.heroType === 'video'
      ? undefined
      : (curation ? byLabel(curation.hero) : contentImages[0]);
    const galleryFiles = curation
      ? curation.gallery.map(byLabel).filter((f): f is UploadedFile => !!f)
      : contentImages.filter((f) => f !== heroFile);

    const uploads: Observable<unknown>[] = [];
    if (logoFile) {
      uploads.push(this.uploadService.upload(logoFile.file, 'campaigns/logos').pipe(
        tap((url) => this.campaignState.patch({ campaignLogoUrl: url })),
      ));
    }
    if (heroFile) {
      uploads.push(this.uploadService.upload(heroFile.file, 'campaigns/covers').pipe(
        tap((url) => this.campaignState.patch({ coverImageUrl: url })),
      ));
    }
    if (galleryFiles.length) {
      uploads.push(
        forkJoin(galleryFiles.map((f) =>
          this.uploadService.upload(f.file, 'campaigns/gallery').pipe(
            map((url) => ({ url, caption: f.note || undefined })),
          ),
        )).pipe(
          tap((items) => this.addGalleryBlock(items)),
        ),
      );
    }

    if (!uploads.length) return of(null);
    return forkJoin(uploads).pipe(catchError(() => of(null)));
  }

  // No default gallery block exists in createInitialDraft() — has to be
  // inserted, not patched. Placed right after the story block (order 2.5,
  // between rich-text's 2 and rewards' 3 — CampaignPreviewComponent sorts
  // blocks by `.order`, fractional values work fine) so the photos show up
  // near the story rather than buried at the bottom of the page.
  private addGalleryBlock(items: Array<{ url: string; caption?: string }>): void {
    if (!items.length) return;
    const block = {
      id: Math.random().toString(36).slice(2, 10),
      type: 'gallery',
      order: 2.5,
      visible: true,
      spacingTop: 0,
      spacingBottom: 0,
      label: 'גלריה',
      data: {
        items,
        style: 'slider',
        aspectRatio: '16:9',
        showCaptions: true,
        showDots: true,
        showArrows: true,
        autoPlay: false,
      },
    };
    this.campaignState.patch({ blocks: [...this.campaignState.draft.blocks, block as any] });
  }

  // draft.builder.js (backend) deliberately never touches `blocks` — that
  // array only exists in the frontend's default-draft structure
  // (CampaignStudioStateService's createInitialDraft()), so mapping into it
  // has to happen here, not server-side. Without this, the campaign's main
  // "story" rich-text block stays at its default empty content — title/
  // description/amount would all be set, but the actual body text visible
  // on the campaign page would be blank. Found via live testing: a user
  // created a campaign through this flow and reported "no text at all" —
  // traced to exactly this gap, not a mapping bug in the fields that *were*
  // wired.
  private applyStoryContent(brief: Brief): void {
    // brief.story is a purpose-written campaign-page narrative (Brief-level
    // creative expansion, not just a carried-over fact) — prefer it when
    // present. Falls back through progressively shorter/less-tailored text
    // when the AI didn't have enough source material for a real story.
    // When creating a new org, newOrgDescription is prefilled from
    // brief.organizationDescription but the user can edit it (e.g. fill it
    // in when the AI found none at all) — that edit has to win over the
    // stale brief value too, or it silently never reaches the campaign even
    // though it's what created the entity's own description. Found via live
    // testing: a user filled in a description manually because the AI
    // didn't extract one, and the campaign still came out with zero body
    // text.
    const text = (
      (brief.story?.value as string) ||
      (this.createNewOrg() ? this.newOrgDescription() : '') ||
      brief.organizationDescription ||
      brief.shortDescription ||
      ''
    ).trim();
    if (!text) return;

    const html = text
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('');
    const blocks = this.campaignState.draft.blocks.map((b: any) =>
      b.type === 'rich-text' ? { ...b, data: { ...b.data, content: html } } : b
    );
    this.campaignState.patch({ blocks });
  }

  // Goes back to the intake form WITHOUT discarding what the user already
  // typed/uploaded — the Brief was just a proposal, not a commitment, so a
  // user who wants to tweak their input and retry shouldn't have to retype
  // everything from scratch.
  backToEdit(): void {
    this.brief.set(null);
    this.clarifyingAnswers.set([]);
    this.refineError.set(null);
    this.error.set(null);
    this.createError.set(null);
  }

  // Brief.category.value is one of ENTITY_CATEGORIES' real ids (English,
  // per the extraction prompt) — shown to the user as the Hebrew label from
  // the same shared source of truth the manual category picker uses.
  categoryLabel(id: unknown): string {
    return ENTITY_CATEGORIES.find((c) => c.id === id)?.label || '';
  }

  reset(): void {
    this.brief.set(null);
    this.facts.set(null);
    this.clarifyingAnswers.set([]);
    this.refineError.set(null);
    this.error.set(null);
    this.createError.set(null);
    this.freeText.set('');
    this.websiteUrl.set('');
    this.files.set([]);
    this.enableWebResearch.set(false);
    this.creationMode.set('campaign');
    this.newOrgEntityType.set('');
    this.newOrgName.set('');
    this.newOrgNumber.set('');
    this.newOrgDescription.set('');
  }

  goToQuickStudio(): void {
    // Escape hatch — every AI entry point still leads back to the existing,
    // proven Studio flow (ADR decision 1: one Studio, multiple doors in).
    this.router.navigate(['/campaigns/create']);
  }
}

function guessTypeLabel(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.includes('logo') || lower.includes('לוגו')) return 'לוגו';
  return 'אחר';
}

// AI-derived text can originate from a website's content (via the "combined
// intake" path) — it must never be trusted as safe HTML before being
// embedded into the story block's Tiptap content, or a malicious/compromised
// site could inject arbitrary markup into a real user's campaign page.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
