import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../services/campaign-api.service';

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

@Component({
  selector: 'app-ai-campaign-creation-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-campaign-creation-page.component.html',
  styleUrl: './ai-campaign-creation-page.component.css',
})
export class AiCampaignCreationPageComponent implements OnInit {
  private http          = inject(HttpClient);
  private loader        = inject(AppLoaderService);
  private router        = inject(Router);
  private currentEntity = inject(CurrentEntityService);
  private campaignState = inject(CampaignStudioStateService);
  private campaignApi   = inject(CampaignApiService);

  fileTypeOptions = FILE_TYPE_OPTIONS;

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

  // Approve the Brief -> create a real CampaignDraft under the user's
  // current entity -> hand off to Campaign Studio for full editing. Scope
  // decision (2026-07-22): only attaches to the entity the user is already
  // managing (CurrentEntityService) — creating a *new* entity from AI
  // Brief data is deliberately deferred, not built here. Reaching this page
  // at all already requires the entity-manager role (campaignEditorGuard),
  // so the common case — an existing entity — is what this covers.
  approveAndCreate(): void {
    const brief = this.brief();
    if (!brief || this.creatingCampaign()) return;

    const entityId = this.currentEntity.currentEntity()?.id;
    if (!entityId) {
      this.createError.set('לא נמצאה עמותה פעילה — יש לבחור עמותה לפני יצירת קמפיין.');
      return;
    }

    this.createError.set(null);
    this.creatingCampaign.set(true);
    this.loader.show('יוצרים את הקמפיין...');

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
        },
        error: () => {
          this.creatingCampaign.set(false);
          this.loader.hide();
          this.createError.set('משהו השתבש בהכנת הקמפיין, נסו שוב');
        },
      });
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
    const text = (brief.organizationDescription || brief.shortDescription || '').trim();
    if (!text) return;

    const html = `<p>${escapeHtml(text)}</p>`;
    const blocks = this.campaignState.draft.blocks.map((b: any) =>
      b.type === 'rich-text' ? { ...b, data: { ...b.data, content: html } } : b
    );
    this.campaignState.patch({ blocks });
  }

  reset(): void {
    this.brief.set(null);
    this.error.set(null);
    this.freeText.set('');
    this.websiteUrl.set('');
    this.files.set([]);
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
