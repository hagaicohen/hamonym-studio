import { Injectable, inject } from '@angular/core';
import { ManagementModelService, publicFriendlyUrl } from './management-model.service';
import { ManagementViewService } from './management-view.service';

export interface CommitOptions { rebuild?: boolean; }

/**
 * Writing a management field (old engine `commit`): readiness evidence, the value itself,
 * then the same refresh sequence as before (save, preview, section list, meters, title,
 * share link). Used by the Angular fields and, through the engine, by the remaining
 * legacy handlers, so both paths stay identical.
 */
@Injectable({ providedIn: 'root' })
export class ManagementEditService {
  private readonly model = inject(ManagementModelService);
  private readonly view = inject(ManagementViewService);

  /** Undo point (the engine takes one before the first keystroke of an edit). */
  snapshot(): void { this.model.context.snapshot(); }

  commit(path: string, value: unknown, { rebuild = false }: CommitOptions = {}): void {
    const ctx = this.model.context;
    if (path === 'content.shortText' && String(value).length > 120) value = String(value).slice(0, 120);
    this.model.confirmField(path);
    this.model.put(path, value);
    ctx.persist();
    ctx.renderPreview();
    ctx.renderSections();
    this.view.updateMeters();
    this.writeProjectTitle();
    this.writeSharePreview();
    if (rebuild) this.view.redraw();
  }

  /** Title in the studio header (outside Angular). */
  writeProjectTitle(): void {
    const title = document.getElementById('projectTitle');
    if (title) title.textContent = this.model.get('meta.name') || 'קמפיין חדש';
  }

  /** The share link updates while the slug is typed, without a redraw. Its content is never template-owned. */
  writeSharePreview(): void {
    const live = document.querySelector<HTMLAnchorElement>('[data-hu-share-preview]');
    if (!live) return;
    const url = String(this.model.context.readState()['content'].share.url);
    live.textContent = publicFriendlyUrl(url);
    live.href = url;
  }
}
