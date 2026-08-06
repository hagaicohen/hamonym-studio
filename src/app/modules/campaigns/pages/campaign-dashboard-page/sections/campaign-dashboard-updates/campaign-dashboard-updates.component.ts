import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { CampaignApiService } from '../../../../services/campaign-api.service';
import { CampaignDraft, CampaignUpdate } from '../../../../services/campaign-studio-state.service';
import { UploadService } from '../../../../../../core/services/upload.service';
import { RichTextEditorComponent } from '../../../../../../shared/ui/rich-text-editor/rich-text-editor.component';

// Sprint 2.2 (2026-08-05) — wired to real data, see docs/CAMPAIGN_UPDATES_UX_SPEC.md
// and the Migration Plan in docs/CAMPAIGN_MANAGEMENT_DASHBOARD_SPEC.md.
//
// Deliberately NOT a new/parallel data model — reuses the exact same
// `CampaignUpdate` shape and `CampaignApiService` the Builder's own
// campaign-updates-step already writes through (`draft.updates`), so there
// is exactly one source of truth for a campaign's updates regardless of
// which surface (Builder or Dashboard) is used. Real image upload reuses
// the same `UploadService` + folder ('campaigns/updates') the Builder step
// already uses — no second upload path. `CampaignUpdate.status` (optional)
// is the one genuinely new field — absent (→ treated as 'published') on
// anything created via the Builder's own step, which has no draft concept.
//
// 2026-08-06 — composer now uses BOTH real fields the model already has:
// `title` (short headline) and `description` (the story body) — both rich
// text now, both editable via the existing shared `RichTextEditorComponent`
// (Tiptap-based), the same one campaign-basic-step uses for the campaign
// story. Not a new capability: same field, same editor, just a second
// surface using them. `title` staying a plain `string` in the model is
// fine — it's just an HTML string now instead of plain text, same as
// `description` already was. Rendering either as HTML (here and on the
// public page, campaign-preview.component) uses the same
// safeHtml()/bypassSecurityTrustHtml() pattern established there.
//
// Persistence model: fetches the full campaign once via getById(), keeps it
// in memory, and every save/delete/publish-toggle sends the WHOLE draft
// back via update() — the same defensive "load full record → mutate → save
// full record back" pattern already used by campaign-studio-topbar's own
// saveDraft() and by entity-settings/partner-details for the same reason
// (update() is not a partial PATCH at the frontend layer; toSnake() would
// coerce missing fields to null/[] and silently wipe them).
@Component({
  selector: 'app-campaign-dashboard-updates',
  standalone: true,
  imports: [CommonModule, FormsModule, RichTextEditorComponent],
  templateUrl: './campaign-dashboard-updates.component.html',
  styleUrl: './campaign-dashboard-updates.component.css',
})
export class CampaignDashboardUpdatesComponent implements OnInit {
  @Input() campaignId = '';

  private campaignApi = inject(CampaignApiService);
  private uploadService = inject(UploadService);
  private sanitizer = inject(DomSanitizer);

  private fullDraft: CampaignDraft | null = null;
  updates: CampaignUpdate[] = [];

  loading = true;
  loadError = '';
  saving = false;

  composerTitle = '';
  composerBody = '';
  composerImageUrl: string | null = null;
  isUploadingImage = false;
  editingId: string | null = null;

  // Composer moved into a modal (2026-08-07) — it used to sit permanently
  // at the top of the panel; now it opens on demand ("+ הוסף עדכון חדש" or
  // editing an existing item), so the panel's default state is just the
  // (collapsed, paged) feed.
  showComposer = false;

  openComposer(): void {
    this.resetComposer();
    this.showComposer = true;
  }
  closeComposer(): void {
    this.showComposer = false;
    this.resetComposer();
  }

  // Collapsed-by-default feed (2026-08-07) — showing every update fully
  // expanded (title+description+image all at once) got heavy fast. Each
  // real item starts collapsed (badge/date/title only, no image/desc/
  // actions) and opens on click; the composer's own live preview is always
  // expanded (it's the one thing you're actively looking at). Paged the
  // same way the public page already paginates (visibleUpdates/
  // canShowMore/showMore), so a campaign with many updates doesn't turn
  // this panel into an endless scroll either.
  private readonly PAGE_SIZE = 5;
  private shownCount = this.PAGE_SIZE;
  private expandedIds = new Set<string>();

  get isEditing(): boolean { return this.editingId !== null; }

  get visibleUpdates(): CampaignUpdate[] { return this.updates.slice(0, this.shownCount); }
  get canShowMore(): boolean { return this.shownCount < this.updates.length; }
  showMore(): void { this.shownCount = Math.min(this.shownCount + this.PAGE_SIZE, this.updates.length); }

  isExpanded(id: string): boolean { return this.expandedIds.has(id); }
  toggleExpand(id: string): void {
    if (this.expandedIds.has(id)) this.expandedIds.delete(id);
    else this.expandedIds.add(id);
  }

  // Title is now rich HTML (see 2026-08-06 note below) — .trim() alone
  // can't tell "<p></p>" from real content, so validation strips tags first.
  private plainText(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
  get canSave(): boolean { return !!this.plainText(this.composerTitle); }

  get hasPreviewContent(): boolean {
    return !!(this.plainText(this.composerTitle) || this.plainText(this.composerBody) || this.composerImageUrl);
  }

  // Live preview (2026-08-06) — the composer doubles as a WYSIWYG preview:
  // this is never saved on its own, just re-rendered through the exact same
  // card markup as the real feed so "what you see while typing" and "what
  // gets published" are pixel-identical, not two separate representations.
  get previewUpdate(): CampaignUpdate {
    return {
      id: '__preview__',
      title: this.plainText(this.composerTitle) ? this.composerTitle : 'כותרת התשורה תופיע כאן',
      date: new Date().toISOString(),
      description: this.composerBody,
      mediaType: this.composerImageUrl ? 'image' : 'none',
      mediaUrl: this.composerImageUrl ?? '',
      linkUrl: '', linkLabel: '',
      status: 'draft',
    };
  }

  ngOnInit(): void {
    if (!this.campaignId) { this.loading = false; this.loadError = 'לא נמצא קמפיין'; return; }
    this.campaignApi.getById(this.campaignId).subscribe({
      next: draft => {
        this.fullDraft = draft;
        this.updates = [...(draft.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date));
        this.loading = false;
      },
      error: () => { this.loadError = 'שגיאה בטעינת העדכונים'; this.loading = false; },
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.isUploadingImage = true;
    this.uploadService.upload(file, 'campaigns/updates').subscribe({
      next: url => { this.composerImageUrl = url; this.isUploadingImage = false; },
      error: () => { this.isUploadingImage = false; },
    });
  }

  removeComposerImage(): void {
    this.composerImageUrl = null;
  }

  saveDraft(): void { this.save('draft'); }
  publish(): void { this.save('published'); }

  private save(status: 'draft' | 'published'): void {
    if (!this.canSave || !this.fullDraft || this.saving) return;
    const title = this.composerTitle;
    const description = this.composerBody;

    if (this.isEditing) {
      this.updates = this.updates.map(u =>
        u.id === this.editingId
          ? { ...u, title, description, mediaType: this.composerImageUrl ? 'image' : 'none', mediaUrl: this.composerImageUrl ?? '', status }
          : u
      );
    } else {
      const item: CampaignUpdate = {
        id: Math.random().toString(36).slice(2, 10),
        title,
        date: new Date().toISOString().slice(0, 10),
        description,
        mediaType: this.composerImageUrl ? 'image' : 'none',
        mediaUrl: this.composerImageUrl ?? '',
        linkUrl: '',
        linkLabel: '',
        status,
      };
      this.updates = [item, ...this.updates];
    }
    this.persist(() => this.closeComposer());
  }

  edit(u: CampaignUpdate): void {
    this.editingId = u.id;
    this.composerTitle = u.title;
    this.composerBody = u.description ?? '';
    this.composerImageUrl = u.mediaUrl || null;
    this.showComposer = true;
  }

  cancelEdit(): void {
    this.closeComposer();
  }

  private resetComposer(): void {
    this.editingId = null;
    this.composerTitle = '';
    this.composerBody = '';
    this.composerImageUrl = null;
  }

  delete(id: string): void {
    if (!confirm('למחוק את השיתוף הזה?')) return;
    this.updates = this.updates.filter(u => u.id !== id);
    if (this.editingId === id) this.resetComposer();
    this.persist();
  }

  // Doc §5 — publish is a deliberate action, so is reversing it; no silent
  // auto-transition anywhere.
  togglePublish(u: CampaignUpdate): void {
    this.updates = this.updates.map(x =>
      x.id === u.id ? { ...x, status: (x.status ?? 'published') === 'published' ? 'draft' : 'published' } : x
    );
    this.persist();
  }

  isPublished(u: CampaignUpdate): boolean {
    return (u.status ?? 'published') === 'published';
  }

  safeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  private persist(onSuccess?: () => void): void {
    if (!this.fullDraft) return;
    this.saving = true;
    const payload: CampaignDraft = { ...this.fullDraft, updates: this.updates };
    this.campaignApi.update(this.campaignId, payload).subscribe({
      next: saved => {
        this.fullDraft = saved;
        this.saving = false;
        onSuccess?.();
      },
      error: () => { this.saving = false; },
    });
  }

  // DD/MM/YYYY per CLAUDE.md convention.
  formatDate(iso: string): string {
    const [y, m, d] = iso.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
}
