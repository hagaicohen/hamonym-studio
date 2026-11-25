import { ManagementViewService } from '../management/management-view.service';
import { DestroyRef, Injectable, Injector, inject } from '@angular/core';
import { MediaKind, MediaOwner, UploadSlot, errorMessage } from './media.types';
import { MediaContextService } from './media-context.service';
import { MediaStoreService } from './media-store.service';
import { ImageProcessorService } from './image-processor.service';
import { MediaMigrationService } from './media-migration.service';
import { MediaDiagnosticsService } from './media-diagnostics.service';
import { CampaignCardsService } from '../public-page/campaign-cards.service';
import { UpdatePreviewComponent } from '../public-page/cards/update-preview.component';

import { studioListen } from '../core/studio-session';
/** Every file input (rendered by the legacy editor) that uploads an image. */
const UPLOAD_SELECTOR = [
  '#heroImageUpload', '#heroPosterUpload', '#orgLogoUpload', '#managerPhotoUpload', '#donateIconUpload',
  '#huManagerPhotoUpload', '[data-hu-race-image]', '[data-hu-reward-image]',
  '[data-hu-ambassador-image]', '[data-hu-sponsor-image]', '[data-hu-update-image]',
  '[data-db-upload]', '[data-db-label-icon-upload]', '[data-sb-upload]', '[data-sb-gallery-upload]'
].join(',');

const BUSY_HOLDER = '.hu-reward-editor,.hu-race-editor,.hu-rich-editor,.hu-sponsor-editor,.hu-item,.field,.sb-field';
const SCROLL_CONTAINERS = ['.sidebar', '.stage', '.canvas', '#preview', '.inspector', '.fields', '#huPage',
  '#storyBuilder', '#sbCanvas', '#sbProps', '.sb-panel', '.sb-canvas-wrap'];


/**
 * Handles every image upload in the Studio: resolves where the image belongs
 * in the campaign, compresses, stores and persists it, then updates only the
 * affected part of the preview.
 *
 * The listener is registered in the capture phase so it runs before any
 * legacy upload handler and one event is never processed twice.
 */
@Injectable({ providedIn: 'root' })
export class MediaUploadService {
  private readonly injector = inject(Injector);
  private readonly context = inject(MediaContextService);
  private readonly store = inject(MediaStoreService);
  private readonly processor = inject(ImageProcessorService);
  private readonly migration = inject(MediaMigrationService);
  private readonly diagnostics = inject(MediaDiagnosticsService);
  private readonly cards = inject(CampaignCardsService);
  private readonly destroyRef = inject(DestroyRef);

  start(): void {
    const listener = (event: Event) => this.onChange(event);
    studioListen(document, 'change', listener, true);
    this.destroyRef.onDestroy(() => document.removeEventListener('change', listener, true));
  }

  private onChange(event: Event): void {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches(UPLOAD_SELECTOR)) return;
    // The Story Builder also uploads video; leave that handler alone.
    if (input.matches('[data-sb-upload]') && input.accept.includes('video/')) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const files = Array.from(input.files || []);
    if (!files.length) return;
    input.value = '';
    const slot = this.resolveSlot(input);
    if (!slot || (!slot.story && !slot.owner)) { this.context.ctx.toast('לא נמצא רכיב לתמונה. נסו לפתוח אותו מחדש.'); return; }
    void this.upload(input, slot, files);
  }

  private async upload(input: HTMLInputElement, slot: UploadSlot, files: File[]): Promise<void> {
    const ctx = this.context.ctx;
    const holder = input.closest(BUSY_HOLDER);
    holder?.classList.add('hu-image-busy');
    try {
      if (slot.story) await this.uploadStory(input, slot, files);
      else await this.uploadSingle(input, slot, files[0]);
      const status = document.querySelector('#saveStatus');
      if (status) status.textContent = ctx.storage.persistent ? 'נשמר מקומית ✓' : 'שמירה זמנית בלבד';
      ctx.toast(ctx.storage.persistent
        ? 'התמונה הועלתה ונשמרה בהצלחה'
        : 'התמונה הועלתה לתצוגה זמנית בלבד. להמשך עבודה יש לפתוח את הקובץ ישירות ב-Chrome ולייצא גיבוי.');
    } catch (error) {
      this.diagnostics.record('error', files[0], { message: errorMessage(error) });
      console.error('HAMONYM unified upload failed', error);
      ctx.toast('שגיאת תמונה: ' + errorMessage(error));
    } finally {
      holder?.classList.remove('hu-image-busy');
    }
  }

  private async uploadStory(input: HTMLInputElement, slot: UploadSlot, files: File[]): Promise<void> {
    const ctx = this.context.ctx;
    const targetId = ctx.sbSelected();
    if (!targetId || !ctx.sbFind(targetId)) throw new Error('יש לבחור תחילה רכיב סיפור.');
    const refs: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) throw new Error('יש לבחור קובץ תמונה.');
      refs.push(await this.store.save(await this.processor.process(file, 'story')));
    }
    const node = ctx.sbFind(targetId)?.n;
    if (!node) throw new Error('רכיב הסיפור אינו קיים עוד');
    ctx.snapshot();
    const previous = slot.gallery ? [...(node.images || [])] : node.value;
    if (slot.gallery) node.images = [...(node.images || []), ...refs];
    else node.value = refs[0];
    try { this.context.persistDraft(); }
    catch {
      if (slot.gallery) node.images = previous as string[]; else node.value = previous as string | undefined;
      throw new Error('אין מספיק מקום לשמירת קישורי התמונות בטיוטה');
    }
    this.updatePreview(slot, refs[refs.length - 1], input, targetId);
    this.refreshViews();
  }

  private async uploadSingle(input: HTMLInputElement, slot: UploadSlot, file: File): Promise<void> {
    const ctx = this.context.ctx;
    const owner = slot.owner, key = slot.key;
    if (!owner || !key) throw new Error('הרכיב כבר אינו קיים.');
    const state = this.context.state();
    const before = owner[key];
    const side = {
      mediaType: state.content.hero?.mediaType, showOrgLogo: state.content.hero?.showOrgLogo,
      iconMode: state.content.donate?.iconMode, managerSource: state.management?.managerSource
    };
    const ref = await this.commit(file, slot.kind, newRef => {
      // Avoid duplicating old inline images into undo history.
      if (JSON.stringify(state).length < 1_000_000) ctx.snapshot();
      owner[key] = newRef;
      slot.after?.();
      return () => {
        owner[key] = before;
        if (state.content.hero) { state.content.hero.mediaType = side.mediaType; state.content.hero.showOrgLogo = side.showOrgLogo; }
        state.content.donate.iconMode = side.iconMode;
        if (state.management) state.management.managerSource = side.managerSource;
      };
    });
    try { this.updatePreview(slot, ref, input); this.refreshViews(); }
    catch (uiError) { console.warn('HAMONYM: photo saved; view sync delayed', uiError); ctx.toast('התמונה נשמרה; התצוגה תעודכן בפתיחה מחדש'); }
  }

  /** Process + store + persist; rolls the state back if the draft cannot be saved. */
  private async commit(file: File, kind: MediaKind, write: (ref: string) => () => void): Promise<string> {
    const data = await this.processor.process(file, kind);
    this.diagnostics.record('save', file);
    const ref = await this.store.save(data);
    const rollback = write(ref);
    try { this.context.persistDraft(); }
    catch {
      // Quota pressure from obsolete copies must not discard a new photo.
      try { await this.migration.freeLegacyStorage(); this.context.persistDraft(); }
      catch {
        rollback();
        await this.store.discard(ref);
        throw new Error('הטיוטה אינה נשמרת: נפח האחסון מלא. אפשר לייצא גיבוי JSON; הטיוטה הקודמת לא נמחקה.');
      }
    }
    this.diagnostics.record('complete', file, { ref });
    return ref;
  }

  private resolveSlot(input: HTMLInputElement): UploadSlot | null {
    const s = this.context.state();
    const d = input.dataset;
    const at = (k: string) => Number(d[k]);
    const modules = s.management?.modules;
    switch (input.id) {
      case 'heroImageUpload': return { kind: 'hero', owner: s.content.hero, key: 'image', after: () => { s.content.hero.mediaType = 'image'; } };
      case 'heroPosterUpload': return { kind: 'poster', owner: s.content.hero, key: 'videoPoster' };
      case 'orgLogoUpload': return { kind: 'logo', owner: s.content.hero, key: 'orgLogo', after: () => { s.content.hero.showOrgLogo = true; } };
      case 'managerPhotoUpload':
      case 'huManagerPhotoUpload': return { kind: 'avatar', owner: s.content.campaignInfo, key: 'photo', after: () => { if (s.management) s.management.managerSource = 'custom'; } };
      case 'donateIconUpload': return { kind: 'icon', owner: s.content.donate, key: 'customIcon', after: () => { s.content.donate.iconMode = 'custom'; } };
    }
    if ('huRaceImage' in d) return { kind: 'card', owner: modules?.['races']?.items?.[at('huRaceImage')], key: 'image' };
    if ('huRewardImage' in d) return { kind: 'card', owner: s.content.rewards.items?.[at('huRewardImage')], key: 'image' };
    if ('huAmbassadorImage' in d) return { kind: 'avatar', owner: modules?.['ambassadors']?.items?.[at('huAmbassadorImage')], key: 'photo' };
    if ('huSponsorImage' in d) return { kind: 'logo', owner: modules?.['sponsors']?.items?.[at('huSponsorImage')], key: 'logo' };
    if ('huUpdateImage' in d) return { kind: 'card', owner: [s.content.updates, ...(modules?.['updates']?.items || [])][at('huUpdateImage')], key: 'image' };
    if ('dbUpload' in d) return { kind: 'card', owner: s.content.donate.boxAmounts?.[at('dbUpload')], key: 'image' };
    if ('dbLabelIconUpload' in d) {
      const i = at('dbLabelIconUpload');
      return { kind: 'icon', owner: s.content.donate.boxAmounts?.[i], key: 'labelIcon', after: () => { const a = s.content.donate.boxAmounts?.[i]; if (a) a.labelIconSize ??= 22; } };
    }
    if ('sbUpload' in d || 'sbGalleryUpload' in d) return { kind: 'story', story: true, gallery: 'sbGalleryUpload' in d };
    return null;
  }

  // ---------------------------------------------------------------------------
  // Targeted preview updates. The preview/manager DOM is still produced by the
  // legacy renderer, so an upload updates only the affected elements instead
  // of re-rendering the whole campaign.
  // ---------------------------------------------------------------------------

  private setImage(host: Element | null | undefined, url: string, alt: string): void {
    if (!host) return;
    let img = host.querySelector('img');
    if (!img) { img = document.createElement('img'); host.replaceChildren(img); }
    img.src = url;
    img.alt = alt || '';
  }

  private ensureChild(parent: Element, className: string, before?: Element | null): HTMLElement {
    let el = parent.querySelector<HTMLElement>('.' + className);
    if (!el) {
      el = document.createElement('div');
      el.className = className;
      if (before) parent.insertBefore(el, before); else parent.append(el);
    }
    return el;
  }

  private addClearButton(editor: Element | null, container: string, dataKey: string, index: number): void {
    if (!editor || editor.querySelector(`[data-${dataKey.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}]`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'hu-action';
    button.dataset[dataKey] = String(index);
    button.textContent = 'הסר תמונה';
    editor.querySelector(container)?.append(button);
  }


  private updatePreview(slot: UploadSlot, ref: string, input: HTMLInputElement, storyId?: string): void {
    const url = this.store.src(ref);
    if (!url) throw new Error('התמונה נשמרה אך לא ניתן ליצור כתובת להצגתה.');
    const ctx = this.context.ctx;
    const state = this.context.state();
    // The public page is not patched here: the render that follows (`refreshViews`) shows the new image, and the page
    // is updated in place. Only the management screen's own views are patched (v4.55: the page's branches are removed).
    const d = input.dataset;
    const index = Number(d['huRewardImage'] ?? d['huRaceImage'] ?? d['huUpdateImage'] ?? d['huSponsorImage'] ?? d['huAmbassadorImage'] ?? d['dbUpload'] ?? d['dbLabelIconUpload'] ?? -1);

    if (slot.story) {
      const node = storyId ? ctx.sbFind(storyId)?.n : undefined;
      if (!node) return;
      if (document.querySelector('#storyBuilder')?.classList.contains('open')) ctx.sbRender();
      return;
    }

    switch (input.id) {
      case 'managerPhotoUpload':
      case 'huManagerPhotoUpload':
        for (const el of Array.from(document.querySelectorAll<HTMLElement>('#huPage .hu-manager-avatar'))) {
          if (el instanceof HTMLImageElement) el.src = url;
          else if (el.classList.contains('hu-manager-avatar')) this.setImage(el, url, 'תמונת מנהל הקמפיין');
          else {
            const img = document.createElement('img');
            img.className = el.className.replace(/info-placeholder/g, '');
            img.src = url;
            img.alt = 'תמונת מנהל הקמפיין';
            el.replaceWith(img);
          }
        }
        return;
    }

    if ('huRewardImage' in d) {
      const editor = input.closest('.hu-reward-editor');
      this.setImage(editor?.querySelector('.hu-reward-photo-thumb'), url, 'תמונת תשורה');
      const alt = String((slot.owner as MediaOwner | undefined)?.['name'] || 'תמונת תשורה');
      const updateTile = (tile: Element | null | undefined) => {
        if (tile) this.setImage(this.ensureChild(tile, 'reward-tile-photo', tile.querySelector('.reward-tile-copy')), url, alt);
      };
      updateTile(editor?.querySelector('[data-hu-reward-preview] .hu-reward-real-mini .reward-tile'));
      this.addClearButton(editor, '.hu-reward-photo-upload', 'huClearRewardImage', index);
    } else if ('huRaceImage' in d) {
      const editor = input.closest('.hu-race-editor');
      this.setImage(editor?.querySelector('.hu-race-photo-upload .hu-reward-photo-thumb'), url, 'תמונת מירוץ');
      this.setImage(editor?.querySelector('.hu-race-mini-thumbnail'), url, 'תמונת מירוץ');
      const label = editor?.querySelector('.hu-race-photo-upload .hu-upload-copy strong');
      if (label) label.textContent = 'תמונה נבחרה';
      this.addClearButton(editor, '.hu-race-photo-upload', 'huRaceImageClear', index);
    } else if ('huUpdateImage' in d) {
      const editor = input.closest('.hu-rich-editor');
      this.setImage(editor?.querySelector('.hu-rich-photo .hu-reward-photo-thumb'), url, 'תמונת עדכון');
      const mini = editor?.querySelector('[data-hu-update-preview]');
      if (mini) this.cards.mount(mini, UpdatePreviewComponent, { item: slot.owner, cfg: state.content.updates });
    } else if ('huSponsorImage' in d) {
      const editor = input.closest('.hu-sponsor-editor');
      this.setImage(editor?.querySelector('.hu-reward-photo-thumb'), url, 'לוגו חסות');
      const live = editor?.querySelector('.hu-sponsor-manager-preview');
      if (live) {
        let image = live.querySelector('img');
        if (!image) { image = document.createElement('img'); live.prepend(image); live.querySelector('span[aria-hidden]')?.remove(); }
        image.src = url;
      }
    } else if ('huAmbassadorImage' in d) {
      const photo = input.closest('.hu-item')?.querySelector('.hu-reward-photo-thumb,.hu-ambassador-avatar,img[data-ambassador-photo]');
      if (photo instanceof HTMLImageElement) photo.src = url; else this.setImage(photo, url, 'תמונת שגריר');
    }
  }

  /** Re-render preview + inspector while keeping every scroll position. */
  refreshViews(): void {
    const ctx = this.context.ctx;
    const positions = SCROLL_CONTAINERS
      .map(selector => { const el = document.querySelector(selector); return el ? { selector, top: el.scrollTop, left: el.scrollLeft } : null; })
      .filter((p): p is { selector: string; top: number; left: number } => !!p);
    const x = window.scrollX, y = window.scrollY;
    const restore = () => {
      for (const p of positions) { const el = document.querySelector(p.selector); if (el) { el.scrollTop = p.top; el.scrollLeft = p.left; } }
      window.scrollTo(x, y);
    };
    try {
      ctx.renderPreview();
      if (this.injector.get(ManagementViewService).mode() !== 'design') document.querySelector<HTMLElement>('[data-hu-mode="management"]')?.click();
      else ctx.renderInspector();
      if (document.querySelector('#storyBuilder')?.classList.contains('open')) ctx.sbRender();
    } finally {
      restore();
      requestAnimationFrame(restore);
    }
  }
}
