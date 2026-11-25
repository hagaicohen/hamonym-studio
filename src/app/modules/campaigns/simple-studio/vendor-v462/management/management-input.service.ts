import { DestroyRef, Injectable, inject } from '@angular/core';
import { Json, ManagementModelService, cleanSlug, clone, newModuleItem, validSlug } from './management-model.service';
import { ManagementViewService } from './management-view.service';
import { ManagementEditService } from './management-edit.service';
import { escapeHtml as safe } from './fields/markup';
import { contentContext } from './content/content-context';
import { RewardMiniComponent } from './content/reward-mini.component';
import { CampaignCardsService } from '../public-page/campaign-cards.service';
import { UpdatePreviewComponent } from '../public-page/cards/update-preview.component';
import { ContentStateService } from './content/content-state.service';

import { studioAdopt, studioListen } from '../core/studio-session';
type AmountKind = 'oneTime' | 'monthly';
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const FIELD = '[data-hu-path],[data-hu-item]';
const DEFAULT_INSTALLMENTS = [1, 2, 3, 4, 5, 6];

/**
 * Edits made in the management screen, addressed by data attributes on the controls (old engine
 * document handlers, moved verbatim): `data-hu-path` (a campaign field), `data-hu-item` (a field
 * of a module item), `data-hu-seg` (a choice card), suggested amounts, installments, adding,
 * removing and moving items, clearing images, the simple page's pictures and the campaign kind.
 *
 * The attributes are a contract shared with markup outside the management templates (the core
 * inspector renders `data-hu-path` switches, the wizard renders a `data-hu-date-path` trigger),
 * which is why these stay delegated document listeners rather than template bindings.
 * Every write goes through the campaign state, then the same refresh sequence as before.
 */
@Injectable({ providedIn: 'root' })
export class ManagementInputService {
  private readonly model = inject(ManagementModelService);
  private readonly view = inject(ManagementViewService);
  private readonly edit = inject(ManagementEditService);
  private readonly content = inject(ContentStateService);
  private readonly cards = inject(CampaignCardsService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  private get ctx() { return contentContext(this.model.context); }
  private state(): Json { return this.ctx.readState(); }
  private redraw(): void { this.view.redraw(); }
  /** Undo point, save, preview, redraw: the sequence of every structural edit. */
  private change(mutate: () => void): void { const ctx = this.ctx; ctx.snapshot(); mutate(); ctx.persist(); ctx.renderPreview(); this.redraw(); }

  start(): void {
    if (this.started) return;
    this.started = true;
    const listeners: Array<[string, EventListener]> = [
      ['click', e => this.click(e as MouseEvent)],
      ['input', e => this.input(e)],
      ['change', e => this.simpleUpload(e)],
      ['click', e => this.simpleRemove(e)],
      ['change', e => this.kindChange(e)],
      ['change', e => this.fieldChange(e)],
      ['keydown', e => this.key(e as KeyboardEvent)]
    ];
    for (const [type, fn] of listeners) studioListen(document, type, fn);
    this.destroyRef.onDestroy(() => { for (const [type, fn] of listeners) document.removeEventListener(type, fn); });
  }

  // ------------------------------------------------------------------ buttons

  private click(e: MouseEvent): void {
    const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
    if (!b) return;
    const d = b.dataset, ctx = this.ctx;
    if (b.hasAttribute('data-hu-copy-url')) { this.copyUrl(); return; }
    if (b.hasAttribute('data-hu-remove-photo')) { this.change(() => this.model.put('meta.managerPhoto', '')); return; }
    if (b.hasAttribute('data-hu-session-manager')) { this.useSessionManager(); return; }
    if (d['huSeg']) { this.edit.snapshot(); this.edit.commit(d['huSeg'], d['huSeg'] === 'funding.matching' ? d['value'] === 'true' : d['value'], { rebuild: true }); return; }
    if (d['huModule']) { this.view.activeModule.set(d['huModule'] as never); this.redraw(); return; }
    if (b.hasAttribute('data-hu-add-installment')) { this.addInstallment(); return; }
    if (b.hasAttribute('data-hu-remove-installment')) {
      const n = Number(d['huRemoveInstallment']), options = this.installmentOptions();
      if (options.length === 1) { ctx.toast('יש להשאיר לפחות אפשרות אחת לתשלום'); return; }
      this.saveInstallments(options.filter(x => x !== n));
      return;
    }
    if (b.hasAttribute('data-hu-reset-installments')) { this.saveInstallments(DEFAULT_INSTALLMENTS); return; }
    if (d['huAddAmount']) {
      this.model.confirmField('donations.oneTime');
      const input = document.querySelector<HTMLInputElement>('#hu-add-' + d['huAddAmount']);
      this.change(() => this.addAmount(d['huAddAmount'] as AmountKind, input?.value));
      return;
    }
    if (d['huRemoveAmount']) { this.model.confirmField('donations.oneTime'); this.change(() => this.removeAmount(d['huRemoveAmount'] as AmountKind, Number(d['i']))); return; }
    if (b.hasAttribute('data-hu-sponsor-move')) {
      const i = Number(d['i']), items = this.model.partsFor('sponsors'), j = i + (d['huSponsorMove'] === 'up' ? -1 : 1);
      if (j >= 0 && j < items.length) this.change(() => { [items[i], items[j]] = [items[j], items[i]]; });
      return;
    }
    const clear: Array<[string, string, string]> = [['huUpdateImageClear', 'updates', 'image'], ['huSponsorRemoveImage', 'sponsors', 'logo'], ['huAmbassadorImageClear', 'ambassadors', 'photo'], ['huClearRewardImage', 'rewards', 'image']];
    for (const [attr, type, key] of clear) {
      if (d[attr] === undefined) continue;
      const item = this.model.partsFor(type)[Number(d[attr])];
      if (item) this.change(() => { item[key] = ''; });
      return;
    }
    if (d['huAddItem']) { const type = d['huAddItem']; this.change(() => this.itemList(type).push(clone(newModuleItem(type)))); return; }
    if (d['huRemoveItem']) { this.change(() => this.removeItem(d['huRemoveItem']!, Number(d['i']))); }
  }

  private copyUrl(): void {
    const copy = String(this.state()['content'].share.url), field = document.createElement('textarea');
    field.value = copy;
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(studioAdopt(field));
    field.select();
    try { document.execCommand('copy'); this.ctx.toast('הקישור הועתק'); } catch { this.ctx.toast(copy); }
    field.remove();
  }

  /** The manager is the signed-in user again (the host supplied one). */
  private useSessionManager(): void {
    const person = this.model.linkedSessionManager;
    if (!person) return;
    this.change(() => {
      const s = this.state();
      s['management'].managerSource = 'account';
      s['content'].campaignInfo.manager = person.name;
      s['content'].campaignInfo.photo = person.photo;
      this.model.confirmField('meta.manager', 'account');
    });
  }

  // ------------------------------------------------------------- installments

  private installmentOptions(): number[] { return this.model.nget('donations.installmentOptions') || []; }

  private addInstallment(): void {
    const raw = String(document.querySelector<HTMLInputElement>('#hu-add-installment')?.value || '').trim(), n = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(n) || n < 1 || n > 99) { this.ctx.toast('יש להזין מספר תשלומים שלם בין 1 ל־99'); return; }
    const options = this.installmentOptions();
    if (options.includes(n)) { this.ctx.toast('מספר התשלומים הזה כבר קיים'); return; }
    this.saveInstallments([...options, n]);
  }

  private saveInstallments(options: number[]): boolean {
    const normalized = [...new Set(options.map(Number).filter(n => Number.isInteger(n) && n >= 1 && n <= 99))].sort((a, b) => a - b);
    if (!normalized.length) { this.ctx.toast('יש להשאיר לפחות אפשרות אחת לתשלום'); return false; }
    const ctx = this.ctx;
    ctx.snapshot();
    this.model.nset('donations.installmentOptions', normalized);
    this.model.nset('donations.maxInstallments', Math.max(...normalized));
    ctx.persist();
    this.redraw();
    return true;
  }

  // ------------------------------------------------------------------ amounts

  /** Suggested amounts of the donation box, by kind. */
  private boxAmounts(): Json[] { return this.state()['content'].donate.boxAmounts; }
  private static recurring(type: AmountKind): boolean { return type === 'monthly'; }

  private addAmount(type: AmountKind, value: unknown): void {
    const n = this.ctx.huReadAmount(value);
    if (!Number.isFinite(n) || n <= 0) { this.ctx.toast('יש להקליד סכום חיובי'); return; }
    const arr = this.boxAmounts(), kind = ManagementInputService.recurring(type) ? 'recurring' : 'once';
    if (arr.some(x => x['amount'] === n && (x['kind'] === 'recurring') === (kind === 'recurring'))) { this.ctx.toast('סכום זה כבר קיים'); return; }
    arr.push({ id: 'ua' + Date.now(), amount: n, kind, months: kind === 'recurring' ? 12 : 1, label: '' });
  }

  private removeAmount(type: AmountKind, index: number): void {
    const arr = this.boxAmounts(), found = arr.filter(x => (x['kind'] === 'recurring') === ManagementInputService.recurring(type))[index], i = arr.indexOf(found);
    if (i >= 0) arr.splice(i, 1);
  }

  /** A suggested amount edited in place (`data-hu-amount-edit`, on change). */
  private editAmount(el: HTMLInputElement): void {
    const type = el.dataset['huAmountEdit'] as AmountKind, index = Number(el.dataset['i']), ctx = this.ctx;
    const arr = this.boxAmounts(), item = arr.filter(x => (x['kind'] === 'recurring') === ManagementInputService.recurring(type))[index], val = ctx.huReadAmount(el.value);
    if (!item) return;
    if (!Number.isFinite(val) || val <= 0) { ctx.toast('יש להזין סכום חיובי'); this.redraw(); return; }
    if (arr.some(x => x !== item && x['kind'] === item['kind'] && Number(x['amount']) === val)) { ctx.toast('סכום זה כבר קיים'); this.redraw(); return; }
    this.change(() => { item['amount'] = val; this.model.confirmField(type === 'monthly' ? 'donations.monthly' : 'donations.oneTime'); });
  }

  // -------------------------------------------------------------------- items

  /** The array an item of `type` lives in (updates: item 0 is the campaign's main update). */
  private itemList(type: string): Json[] { return type === 'updates' ? this.model.nget('modules.updates.items') : this.model.partsFor(type); }

  private editItem(type: string, index: number, key: string, value: unknown): void {
    if (type === 'updates' && index === 0) { this.state()['content'].updates[key] = value; return; }
    const item = this.itemList(type)[type === 'updates' ? index - 1 : index];
    if (item) item[key] = ['quantity', 'maxPerOrder'].includes(key) ? Math.max(0, Math.floor(Number(value) || 0)) : value;
  }

  private removeItem(type: string, index: number): void {
    if (type === 'updates') { if (index === 0) return; this.model.nget('modules.updates.items').splice(index - 1, 1); }
    else this.model.partsFor(type).splice(index, 1);
  }

  /** While an item is typed, its scaled-down card is mounted again (the editor is not redrawn). */
  private patchItemPreview(el: Field, type: string, index: number): void {
    if (type === 'rewards') {
      const target = document.querySelector(`[data-hu-reward-preview="${index}"]`);
      if (target) this.cards.mount(target, RewardMiniComponent, { item: this.model.partsFor('rewards')[index] || {}, index });
    }
    if (type === 'sponsors') {
      const box = el.closest('.hu-sponsor-editor')?.querySelector('.hu-sponsor-manager-preview'), r = this.model.partsFor('sponsors')[index];
      if (box && r) box.innerHTML = (r['logo'] ? '<img src="' + safe(r['logo']) + '" alt="">' : '<span aria-hidden="true">♧</span>') + '<strong>' + safe(r['name'] || 'שם החסות') + '</strong>'
        + (r['description'] ? '<small>' + safe(r['description']) + '</small>' : '') + (this.safeLink(r['url']) ? '<span>קישור לאתר החסות ↗</span>' : '');
    }
    if (type === 'updates') {
      const target = document.querySelector(`[data-hu-update-preview="${index}"]`), r = this.model.partsFor('updates')[index];
      if (target && r) this.cards.mount(target, UpdatePreviewComponent, { item: r, cfg: this.state()['content'].updates });
    }
  }
  private safeLink(url: unknown): boolean { return !!(this.ctx as unknown as { ambassadorSafeLink(u: unknown): unknown }).ambassadorSafeLink(url); }

  // ------------------------------------------------------------------- fields

  /**
   * Writes a field (old `modifyText`). The first keystroke of an edit takes the undo snapshot and
   * marks the control (`data-hu-edited`); `change` ends the edit.
   */
  private write(el: Field): void {
    const input = el as HTMLInputElement;
    const val = input.type === 'checkbox' ? input.checked : el.dataset['money'] !== undefined ? this.ctx.huReadAmount(el.value) : input.type === 'number' ? Number(el.value) : el.value;
    const d = el.dataset;
    if (!d['huPath'] && !d['huItem']) return;
    if (!d['huEdited']) { this.ctx.snapshot(); d['huEdited'] = '1'; }
    if (d['huPath']) { this.edit.commit(d['huPath'], val, { rebuild: false }); return; }
    const type = d['huItem']!, index = Number(d['i']);
    this.editItem(type, index, d['key'] || '', val);
    this.ctx.persist();
    this.ctx.renderPreview();
    this.patchItemPreview(el, type, index);
  }

  private field(e: Event): Field | null {
    const t = e.target;
    return (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) && t.matches(FIELD) ? t : null;
  }

  /** Text is written while typing; switches and selects on change. */
  private input(e: Event): void {
    const el = this.field(e);
    if (!el || (el as HTMLInputElement).type === 'checkbox' || el.tagName === 'SELECT') return;
    this.write(el);
  }

  private fieldChange(e: Event): void {
    const t = e.target;
    if (t instanceof HTMLInputElement && t.matches('[data-hu-amount-edit]')) { this.editAmount(t); return; }
    // Image uploads (rewards, updates, sponsors, ambassadors, manager photo): MediaUploadService.
    const el = this.field(e);
    if (!el) return;
    if (el.dataset['huPath'] === 'meta.slug') {
      const clean = cleanSlug(el.value);
      el.value = clean;
      if (clean && !validSlug(clean)) this.ctx.toast('המזהה חייב לכלול 3–70 תווים: אותיות, מספרים ומקפים בלבד');
    }
    this.write(el);
    delete el.dataset['huEdited'];
    if ((el.dataset['huItem'] === 'rewards' && el.dataset['key'] === 'stockEnabled') || (el as HTMLInputElement).type === 'checkbox' || el.tagName === 'SELECT') {
      // A switch rendered by the core inspector (`#fields`) redraws the inspector instead.
      if (el.closest('#fields')) { this.ctx.renderInspector(); return; }
      const dialog = el.closest('.hu-collection-modal:not([hidden])'), editor = el.closest<HTMLElement>('[data-hu-collection-index]');
      const collection = dialog?.closest<HTMLElement>('[data-hu-collection]');
      if (collection && editor) this.content.reopen = { type: collection.dataset['huCollection'] || '', index: Number(editor.dataset['huCollectionIndex']) };
      this.redraw();
      this.content.reopen = null;
    }
  }

  // ----------------------------------------------------- simple page, campaign kind

  /** Logo / hero picture of a simple donation page (stored as a data URL, up to 3MB). */
  private simpleUpload(e: Event): void {
    const input = e.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-hu-simple-upload]')) return;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 3000000) { this.ctx.toast('יש לבחור תמונת PNG, JPG או WEBP עד 3MB'); return; }
    const hero = input.dataset['huSimpleUpload'] === 'hero', reader = new FileReader();
    reader.onload = () => {
      this.change(() => {
        const content = this.state()['content'];
        content.hero ||= {};
        content.hero[hero ? 'image' : 'orgLogo'] = String(reader.result);
        if (hero) content.hero.mediaType = 'image';
      });
      this.ctx.toast('התמונה עודכנה');
    };
    reader.readAsDataURL(file);
  }

  private simpleRemove(e: Event): void {
    const btn = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-hu-simple-remove]') : null;
    if (!btn) return;
    this.change(() => { this.state()['content'].hero[btn.dataset['huSimpleRemove'] === 'hero' ? 'image' : 'orgLogo'] = ''; });
  }

  /**
   * Campaign kind (donation, race, simple page). A simple page uses the donation template and
   * remembers the full campaign's template; race settings and participants are kept when leaving.
   */
  private kindChange(e: Event): void {
    const el = e.target;
    if (!(el instanceof HTMLSelectElement) || !el.matches('[data-ham-campaign-kind]')) return;
    const ctx = this.ctx, s = this.state(), mg = s['management'];
    ctx.snapshot();
    const previous = mg.campaignKind || 'donation';
    const kind = ['donation', 'race', 'simple'].includes(el.value) ? el.value : 'donation';
    if (kind === 'simple') {
      if (previous !== 'simple') mg.fullCampaignTemplate = s['template'];
      s['template'] = 'donation';
    } else if (previous === 'simple' && mg.fullCampaignTemplate) {
      s['template'] = ['heroOverlay', 'split'].includes(mg.fullCampaignTemplate) ? 'panorama' : mg.fullCampaignTemplate;
    }
    mg.campaignKind = kind;
    if (kind === 'race') { s['visible'].races = true; mg.modules.races.enabled = true; mg.modules.races.visible = true; }
    else s['visible'].races = false;
    ctx.persist();
    ctx.renderSections();
    ctx.renderPreview();
    this.redraw();
    ctx.renderInspector();
  }

  // ----------------------------------------------------------------- keyboard

  private key(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.view.drawerOpen()) this.view.closeDrawer();
    const id = (e.target as HTMLElement | null)?.id;
    if (e.key !== 'Enter' || !id) return;
    if (id === 'hu-add-installment') { e.preventDefault(); document.querySelector<HTMLElement>('[data-hu-add-installment]')?.click(); return; }
    if (id.startsWith('hu-add-')) { e.preventDefault(); document.querySelector<HTMLElement>(`[data-hu-add-amount="${id.replace('hu-add-', '')}"]`)?.click(); }
  }
}
