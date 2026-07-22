import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Router } from '@angular/router';
import { timeout } from 'rxjs/operators';
import { environment } from '../../../../../environments/environment';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

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

type SourceMode = 'free_text' | 'website' | 'documents';

interface UploadedFile {
  file: File;
  typeLabel: string;
  note: string;
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
  private http   = inject(HttpClient);
  private loader = inject(AppLoaderService);
  private router = inject(Router);

  fileTypeOptions = FILE_TYPE_OPTIONS;

  mode   = signal<SourceMode>('free_text');
  input  = signal('');
  files  = signal<UploadedFile[]>([]);
  brief  = signal<Brief | null>(null);
  error  = signal<string | null>(null);
  submitting = signal(false);

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

  setMode(mode: SourceMode): void {
    this.mode.set(mode);
    this.error.set(null);
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

  canSubmit(): boolean {
    if (this.submitting()) return false;
    if (this.mode() === 'documents') return this.files().length > 0;
    return !!this.input().trim();
  }

  submit(): void {
    if (!this.canSubmit()) return;

    this.error.set(null);
    this.brief.set(null);
    this.submitting.set(true);

    const headers = new HttpHeaders({ Authorization: `Bearer ${localStorage.getItem('token')}` });

    const request$ = this.mode() === 'documents'
      ? this.submitDocuments(headers)
      : this.submitTextOrUrl(headers);

    request$.pipe(timeout(REQUEST_TIMEOUT_MS)).subscribe({
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

  private submitTextOrUrl(headers: HttpHeaders) {
    this.loader.show(this.mode() === 'website' ? 'קוראים את האתר שלכם...' : 'מנתחים את המידע...');
    return this.http.post<{ brief: Brief }>(`${environment.apiUrl}/api/campaign-creation/extract`, {
      source: this.mode(),
      input: this.input().trim(),
    }, { headers });
  }

  private submitDocuments(headers: HttpHeaders) {
    this.loader.show('קוראים את הקבצים שהעלית...');
    const formData = new FormData();
    for (const f of this.files()) formData.append('files', f.file, f.file.name);
    formData.append('filesMeta', JSON.stringify(this.files().map((f) => ({ typeLabel: f.typeLabel, note: f.note }))));
    if (this.input().trim()) formData.append('freeText', this.input().trim());

    return this.http.post<{ brief: Brief }>(`${environment.apiUrl}/api/campaign-creation/extract-documents`, formData, { headers });
  }

  reset(): void {
    this.brief.set(null);
    this.error.set(null);
    this.input.set('');
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
