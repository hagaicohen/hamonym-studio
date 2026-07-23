import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, forkJoin, of } from 'rxjs';
import { timeout, map, tap, catchError } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { UploadService } from '../../../../core/services/upload.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../services/campaign-api.service';
import { buildPayload as buildOrgPayload, initialState as initialOrgState, OrganizationRegistrationState } from '../../../organization-registration/services/organization-registration-state.service';

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
}

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

  // Explicit toggle (2026-07-23 decision) — NOT inferred from free-text
  // wording. Creating a real entity + owning it is consequential enough that
  // guessing intent from prose felt too risky; the user picks this
  // deliberately before submitting.
  createNewOrg = signal(false);

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

  brief  = signal<Brief | null>(null);
  error  = signal<string | null>(null);
  submitting = signal(false);

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

    this.http
      .post<{ brief: Brief }>(`${environment.apiUrl}/api/campaign-creation/extract-documents`, formData, { headers })
      .pipe(timeout(REQUEST_TIMEOUT_MS))
      .subscribe({
        next: (res) => {
          this.brief.set(res.brief);
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
          // "Login" into the new entity, per explicit request: make it the
          // active context immediately, not just after the next full login.
          // CurrentEntityService follows CurrentContextService.active() via
          // its own effect() — no need to also call setEntity()/setRole()
          // directly here, that would just race the effect.
          this.currentContext.addEntityContext(entity);
          this.currentContext.switchContext('entity-manager', entity.id);
          this.createCampaignUnder(entity.id, brief);
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

          this.uploadCampaignImages().subscribe(() => {
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
  private uploadCampaignImages(): Observable<unknown> {
    const images = this.files().filter((f) => f.file.type.startsWith('image/'));
    const logoFile = images.find((f) => f.typeLabel === 'לוגו');
    // First non-logo image becomes the hero background — heroVideoUrl (an
    // explicit link the user gave) takes priority over an uploaded photo
    // when both are present, since a video is a more deliberate choice.
    const heroFile = this.campaignState.draft.heroType !== 'video'
      ? images.find((f) => f.typeLabel !== 'לוגו')
      : undefined;

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

    if (!uploads.length) return of(null);
    return forkJoin(uploads).pipe(catchError(() => of(null)));
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
    // When creating a new org, newOrgDescription is prefilled from
    // brief.organizationDescription but the user can edit it (e.g. fill it
    // in when the AI found none at all) — that edit has to win here too, or
    // it silently never reaches the campaign even though it's what created
    // the entity's own description. Found via live testing: a user filled
    // in a description manually because the AI didn't extract one, and the
    // campaign still came out with zero body text.
    const text = (
      (this.createNewOrg() ? this.newOrgDescription() : '') ||
      brief.organizationDescription ||
      brief.shortDescription ||
      ''
    ).trim();
    if (!text) return;

    const html = `<p>${escapeHtml(text)}</p>`;
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
    this.error.set(null);
    this.createError.set(null);
  }

  reset(): void {
    this.brief.set(null);
    this.error.set(null);
    this.createError.set(null);
    this.freeText.set('');
    this.websiteUrl.set('');
    this.files.set([]);
    this.createNewOrg.set(false);
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
