import { ChangeDetectorRef, Injectable, OnDestroy, Renderer2, RendererFactory2, inject } from '@angular/core';
import type { InspectorView } from './inspector-model';
import { CampaignStateService } from '../core/campaign-state.service';
import { sliderUnit } from './inspector-model';
import { CARD_DESIGN_LIBRARY, CAROUSEL_MODULES, DB_STYLE_KEYS, PALETTES, applyTypographyPreset, applyUnifiedPreset, dbUpdateStyle, presentationMetrics, readAmount, unifiedPresetTarget } from './inspector-edits';
import { CARD_SIZE_DEFAULTS } from '../public-page/collections/collection-style';
import { CATEGORY_SOLID_ICONS } from '../core/category-catalog';

/**
 * What the Inspector's edits need from the editor (the core engine registers it once): the selection and device,
 * and the renders. The campaign, undo steps and saving are CampaignStateService's.
 */
export interface InspectorHost {
  selected(): string;
  device(): 'mobile' | 'desktop';
  renderPreview(): void;
  renderInspector(): void;
  renderSections(): void;
  select(id: string): void;
  /** The stage's device switch (device, card-size device, renders). */
  setDevice(device: string): void;
  toast(message: string): void;
  openStory(): void;
  addStoryBlock(type: string): void;
  chooseCategory(id: string, subtopic?: string): void;
  /** A nav placement changed: a block shown only from the menu is closed. */
  clearActiveNav(id: string): void;
  resetSlideKey(): void;
}
/* eslint-disable @typescript-eslint/no-explicit-any */

/** The attributes the core's handlers set on a control while it is being edited (`data-started` …). */
export type InspectorFlag = 'started' | 'dbStarted' | 'editing' | 'hsdStarted';

/**
 * The Inspector (`aside.inspector`) since v4.54: its view and the state between two renders.
 *
 * Until v4.53 `renderInspector` wrote `#fields.innerHTML` (three times per render), and the core's handlers wrote the
 * controls' DOM (outputs, `data-started`, the category list). Now the core builds an `InspectorView`
 * (`inspector-model.ts`) and calls `render`; `InspectorComponent` (on `#fields`), `InspectorHeadComponent` and
 * `InspectorTabsComponent` show it, in place. The handlers report what they wrote before through `flag` / `text` /
 * `filterCategories`, and the components show it (`refresh`).
 *
 * What a new `#fields` started without is reset on each render, as before (checked by parity, `s_inspector`):
 * the values and the checked state of every control (`hamValue`, `hamChecked`), the disclosures (`hamPanel`: the
 * markup's default, or what the memory of the panels holds for this component), the edit flags and outputs, and the
 * focus inside `#fields` (dropped). The scroll position of the inspector stays the same number (no scroll anchoring).
 */
@Injectable({ providedIn: 'root' })
export class InspectorService implements OnDestroy {
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(null, null);
  private views: ChangeDetectorRef[] = [];

  view: InspectorView | null = null;
  revision = 0;
  private flags = new Map<Element, Set<InspectorFlag>>();
  private texts = new Map<Element, string>();
  /** The category search typed since the last render (the list follows it; null: the view's). */
  categoryFilter: string | null = null;

  /** The memory of the disclosures, per `selected:unified` (UI only, not saved). */
  readonly panels = new Map<string, Map<string, boolean>>();
  previouslyRendered = '';

  // controls registered by the directives: what a render shows in them
  readonly values = new Map<HTMLElement, string>();
  readonly checks = new Map<HTMLInputElement, boolean>();
  readonly opens = new Map<HTMLDetailsElement, boolean>();

  /** The Inspector's components (in AppComponent's template) register their view: a render checks them. */
  register(view: ChangeDetectorRef): void { this.views.push(view); }

  /** v4.56: the Studio session ends. */
  ngOnDestroy(): void { this.views = []; this.values.clear(); this.checks.clear(); this.opens.clear(); }

  fields(): HTMLElement | null { return document.getElementById('fields'); }

  render(view: InspectorView): void {
    const fields = this.fields();
    const focused = document.activeElement;
    if (fields && focused instanceof HTMLElement && fields.contains(focused)) focused.blur();
    const scrollers = [document.querySelector<HTMLElement>('.workspace > .inspector'), document.querySelector<HTMLElement>('.ham-wide-body')]
      .filter((x): x is HTMLElement => !!x).map(el => [el, el.scrollTop] as const);
    this.view = view;
    this.revision++;
    this.flags.clear(); this.texts.clear(); this.categoryFilter = null;
    this.check();
    this.reset(view.panelKey);
    // Reading the position lays out the new content (a scroll anchor would move it there); write the number back.
    for (const [el, top] of scrollers) if (el.scrollTop !== top) el.scrollTop = top;
  }

  /** After a handler's change of a flag or an output: the same view, checked again. */
  refresh(): void { this.check(); }

  private check(): void { for (const view of this.views) view.detectChanges(); }

  /** What a new element showed: the bound value, the checked state and the disclosure (or its memory). */
  private reset(key: string): void {
    for (const [el, value] of this.values) {
      if ((el as HTMLInputElement).value !== value) this.renderer.setProperty(el, 'value', value);
    }
    for (const [el, checked] of this.checks) if (el.checked !== checked) this.renderer.setProperty(el, 'checked', checked);
    const states = this.panels.get(key);
    const all = Array.from(this.fields()?.querySelectorAll('details') || []);
    all.forEach((node, index) => {
      if (!this.opens.has(node)) return;
      const id = this.panelIdentity(node, index);
      const open = states?.has(id) ? !!states.get(id) : !!this.opens.get(node);
      if (node.open !== open) this.renderer.setProperty(node, 'open', open);
    });
    this.previouslyRendered = key;
  }

  /** `hamInspectorPanelIdentity`: the summary's text and its index among same-named siblings. */
  panelIdentity(node: HTMLDetailsElement, index: number): string {
    const name = (n: Element) => (n.querySelector(':scope > summary')?.textContent || '').replace(/\s+/g, ' ').trim();
    const label = name(node);
    return label ? label + '#' + Array.from(node.parentElement?.querySelectorAll(':scope > details') || []).filter(n => name(n) === label).indexOf(node) : 'index:' + index;
  }
  /** `hamRememberInspectorPanels`: the open state of every disclosure, for the component rendered last. */
  remember(): void {
    const root = this.fields();
    if (!root || !this.previouslyRendered) return;
    const previous = this.panels.get(this.previouslyRendered) || new Map<string, boolean>();
    Array.from(root.querySelectorAll('details')).forEach((node, index) => previous.set(this.panelIdentity(node, index), node.open));
    this.panels.set(this.previouslyRendered, previous);
  }
  /** The user opened or closed a disclosure (the core's `toggle` listener). */
  recordToggle(node: HTMLDetailsElement, key: string): void {
    const nodes = Array.from(document.querySelectorAll('#fields details')), index = nodes.indexOf(node);
    const states = this.panels.get(key) || new Map<string, boolean>();
    states.set(this.panelIdentity(node, index), node.open);
    this.panels.set(key, states);
  }

  // ---- what the handlers wrote before ------------------------------------------------------------------------
  flag(el: Element, name: InspectorFlag, on = true): void {
    const set = this.flags.get(el) || new Set<InspectorFlag>();
    if (on) set.add(name); else set.delete(name);
    this.flags.set(el, set);
    this.refresh();
  }
  has(el: Element, name: InspectorFlag): boolean { return !!this.flags.get(el)?.has(name); }
  /** A flag as its attribute's value ('1' or absent). */
  f(el: Element, name: InspectorFlag): string | null { return this.has(el, name) ? '1' : null; }
  text(el: Element | null | undefined, value: string): void {
    if (!el) return;
    this.texts.set(el, value);
    this.refresh();
  }
  /** An element's text: what a handler wrote since the render, else the view's. */
  t(el: Element, fallback: unknown): string { return this.texts.has(el) ? this.texts.get(el)! : String(fallback ?? ''); }
  filterCategories(value: string): void { this.categoryFilter = value; this.refresh(); }

  // ---- editing (formerly the core engine's `#fields` / document listeners) ------------------------------------
  private readonly state = inject(CampaignStateService);
  host: InspectorHost | null = null;
  /** Editor state of the Inspector (UI only, not saved). */
  dbEditScope = 'both';
  cardSizeDevice: 'mobile' | 'desktop' = 'mobile';
  categorySearch = '';
  categoryIconPickerOpen = false;
  advancedOpen = false;
  /** Observers of every Inspector edit, before it is applied (the management screen's field evidence). */
  private readonly watchers: ((event: Event) => void)[] = [];
  attachHost(host: InspectorHost): void { this.host = host; }
  watch(fn: (event: Event) => void): void { this.watchers.push(fn); }

  private get h(): InspectorHost { if (!this.host) throw new Error('The Inspector has no editor host'); return this.host; }
  private get doc(): any { return this.state.current; }
  private change(fn: () => void, rerender = true): void { this.state.change(fn, rerender); }
  private persist(): void { this.state.persist(); }
  private snapshot(): void { this.state.snapshot(); }
  private scopeObject(scope: string): any { return scope === 'theme' ? this.doc.theme : this.doc.content[scope]; }

  /** `#fields` (input): InspectorComponent's host binding. */
  onInput(e: Event): void {
    if (this.statsCardSetting(e)) return;
    for (const w of this.watchers) w(e);
    this.donationInput(e); this.cardSliderInput(e); this.fieldInput(e); this.simpleDesignInput(e);
  }
  /** `#fields` (change). */
  onChange(e: Event): void {
    if (this.statsCardSetting(e)) return;
    for (const w of this.watchers) w(e);
    const el = e.target as any;
    if (el.matches('[data-db-setting],[data-db-key]')) { this.flag(el, 'dbStarted', false); if (el.type !== 'range' && el.type !== 'color' && el.type !== 'text' && el.type !== 'number') this.h.renderInspector(); }
    if (el.matches('[data-ham-card-slider]')) this.flag(el, 'editing', false);
    this.videoUpload(el);
    if (el.matches('[data-field],[data-block-edit]')) this.flag(el, 'started', false);
    this.simpleDesignChange(el);
    void this.sliderUpload(el);
  }
  /** `#fields` (click). */
  onClick(e: MouseEvent): void {
    if (this.statsCardClick(e)) return;
    for (const w of this.watchers) w(e);
    const t = e.target as Element;
    this.choiceClick(t); this.donationClick(t); this.presentationClick(t); this.cardSizeClick(t); this.buttonClick(t);
    if (t.closest('#openStoryBuilder')) this.h.openStory();
    this.sliderRemove(t); this.simpleDesignClick(e); this.unifiedClick(e);
  }
  /** A disclosure in `#fields` opened or closed (the `hamPanel` directive). */
  onToggle(node: HTMLDetailsElement): void {
    if (node.matches('.ham-easy-advanced')) this.advancedOpen = node.open;
    this.recordToggle(node, this.h.selected() + ':unified');
  }
  /** The legacy content / design tabs: a render (the unified editor always shows design). */
  onTab(): void { this.h.renderInspector(); }

  /** The generic `data-field` / `data-scope` binding, story block text and visibility (the core's `editInput`). */
  private fieldInput(e: Event): void {
    const el = e.target as any;
    if (el.matches('[data-category-search]')) { this.categorySearch = el.value; this.filterCategories(this.categorySearch); return; }
    if (el.matches('[data-nav-placement]')) { this.change(() => { this.doc.content.nav.placement[el.dataset.navPlacement] = el.value; this.h.clearActiveNav(el.dataset.navPlacement); }); return; }
    if (el.matches('[data-field]')) {
      const obj = this.scopeObject(el.dataset.scope); const key = el.dataset.field;
      if (el.dataset.scope === 'title' && key === 'description' && el.value.length > 120) el.value = el.value.slice(0, 120);
      const val = el.type === 'checkbox' ? el.checked : el.dataset.money !== undefined ? readAmount(el.value) : (el.type === 'number' || el.type === 'range') ? Number(el.value) : el.value;
      if (el.type === 'range' && !Number.isFinite(val)) return;
      if (!this.has(el, 'started')) { this.snapshot(); this.flag(el, 'started'); }
      obj[key] = key === 'count' ? Math.min(30, Math.max(1, val)) : val;
      if (el.dataset.scope === 'hero' || el.dataset.scope === 'title' || ['donors', 'ambassadors', 'rewards', 'updates'].includes(el.dataset.scope)) obj.typographyPreset = '';
      if (el.dataset.scope === 'hero' && key === 'video' && String(val).trim()) obj.mediaType = 'video';
      if (el.dataset.scope === 'hero' && key === 'image' && String(val).trim()) obj.mediaType = 'image';
      if (el.type === 'range') this.text(document.querySelector(`[data-slider-output="${el.dataset.scope}-${key}"]`), val + sliderUnit(key));
      this.persist(); this.h.renderPreview(); this.h.renderSections();
      if (key === 'logoResponsive' || key === 'iconMode' || (el.dataset.scope === 'donors' && key === 'showSubtitle') || (el.dataset.scope === 'rewards' && key === 'showIntro')) this.h.renderInspector();
    } else if (el.matches('[data-block-edit]')) {
      if (!this.has(el, 'started')) { this.snapshot(); this.flag(el, 'started'); }
      this.doc.content.story.blocks[Number(el.dataset.blockEdit)].value = el.value; this.persist(); this.h.renderPreview();
    } else if (el.matches('[data-visible]')) { this.change(() => this.doc.visible[el.dataset.visible] = el.checked); }
  }

  /** Category, device visibility, nav placement, typography presets and choice buttons (Hero anchors per device). */
  private choiceClick(t: Element): void {
    const doc = this.doc, h = this.h;
    const subCategoryPick = t.closest<HTMLElement>('[data-category-sub-pick]'); if (subCategoryPick) { this.categorySearch = ''; this.change(() => h.chooseCategory(subCategoryPick.dataset['categorySubPick']!, subCategoryPick.dataset['categorySubValue'])); return; }
    const categoryPick = t.closest<HTMLElement>('[data-category-pick]'); if (categoryPick) { this.categorySearch = ''; this.change(() => h.chooseCategory(categoryPick.dataset['categoryPick']!)); return; }
    if (t.closest('[data-category-icon-toggle]')) { this.categoryIconPickerOpen = !this.categoryIconPickerOpen; h.renderInspector(); return; }
    const iconPick = t.closest<HTMLElement>('[data-category-icon]'); if (iconPick) { const name = iconPick.dataset['categoryIcon']!; if ((CATEGORY_SOLID_ICONS as any)[name]) this.change(() => doc.content.campaignInfo.categoryIcon = name); return; }
    if (t.closest('[data-category-icon-reset]')) { this.change(() => doc.content.campaignInfo.categoryIcon = ''); return; }
    const visibilityButton = t.closest<HTMLElement>('[data-device-visibility]'); if (visibilityButton) { this.change(() => { doc.deviceVisibility[h.selected()] = visibilityButton.dataset['deviceVisibility']; }); return; }
    const placementButton = t.closest<HTMLElement>('[data-placement-id]'); if (placementButton) { this.change(() => { doc.content.nav.placement[placementButton.dataset['placementId']!] = placementButton.dataset['placementValue']; h.clearActiveNav(placementButton.dataset['placementId']!); }); return; }
    const typography = t.closest<HTMLElement>('[data-typo-preset]'); if (typography) { this.change(() => applyTypographyPreset(doc, typography.dataset['typoScope']!, typography.dataset['typoPreset']!)); return; }
    const b = t.closest<HTMLElement>('[data-choice-field]'); if (!b) return;
    const scope = b.dataset['choiceScope']!, field = b.dataset['choiceField']!, value = b.dataset['choiceValue']!;
    const obj = this.scopeObject(scope);
    this.change(() => {
      obj.typographyPreset = '';
      obj[scope === 'hero' && field === 'textAnchor' && h.device() === 'mobile' ? 'mobileTextAnchor' : field] = scope === 'donors' && ['columnsMobile', 'columnsDesktop'].includes(field) ? Number(value) : value;
      if (scope === 'hero' && field === 'logoAnchor') obj.logoBelowText = false;
      if (scope === 'hero' && field === 'textAnchor') { const alignment = value.endsWith('-right') ? 'right' : value.endsWith('-left') ? 'left' : 'center'; if (h.device() === 'desktop') { obj.textAlign = alignment; obj.titleAlign = alignment; } }
    });
  }

  /** The donation box's settings and amounts (input). */
  private donationInput(e: Event): void {
    const el = e.target as any; if (!el.matches('[data-db-setting],[data-db-key]')) return;
    const d = this.doc.content.donate;
    if (!this.has(el, 'dbStarted')) { this.snapshot(); this.flag(el, 'dbStarted'); }
    const val = el.type === 'checkbox' ? el.checked : el.dataset.money !== undefined ? readAmount(el.value) : el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value;
    if (typeof val === 'number' && !Number.isFinite(val)) return;
    if (el.dataset.dbSetting) { if (DB_STYLE_KEYS.includes(el.dataset.dbSetting)) dbUpdateStyle(d, el.dataset.dbSetting, val, this.dbEditScope); else d[el.dataset.dbSetting] = val; }
    else { const a = d.boxAmounts?.[Number(el.dataset.dbIndex)]; if (a) a[el.dataset.dbKey] = val; }
    this.persist(); this.h.renderPreview();
    if (el.type === 'range') { const label = el.closest('label'); const readout = label?.querySelector('span') || el.nextElementSibling; this.text(readout, val + (el.dataset.dbSetting === 'boxColumns' ? '' : 'px')); }
  }
  /** The donation box's buttons, and the rewards' desktop position. */
  private donationClick(t: Element): void {
    const doc = this.doc; const d = () => doc.content.donate;
    const pick = (sel: string) => t.closest<HTMLElement>(sel);
    const rewardsPosition = pick('[data-rewards-desktop-position]'); if (rewardsPosition) { this.change(() => { doc.content.rewards.desktopPosition = rewardsPosition.dataset['rewardsDesktopPosition']; }); return; }
    const scope = pick('[data-db-scope]'); if (scope) { this.dbEditScope = scope.dataset['dbScope']!; this.h.renderInspector(); return; }
    const presentation = pick('[data-db-presentation]'); if (presentation) { this.change(() => dbUpdateStyle(d(), 'boxCardPresentation', presentation.dataset['dbPresentation'], this.dbEditScope)); return; }
    const otherStyle = pick('[data-db-other-style]'); if (otherStyle) { this.change(() => { d().boxOtherStyle = otherStyle.dataset['dbOtherStyle']; }); return; }
    const removeIcon = pick('[data-db-label-icon-remove]'); if (removeIcon) { this.change(() => { const a = d().boxAmounts[Number(removeIcon.dataset['dbLabelIconRemove'])]; if (a) a.labelIcon = ''; }); return; }
    const emojiButton = pick('[data-db-label-emoji]');
    if (emojiButton) {
      const index = Number(emojiButton.dataset['dbIndex']), emoji = emojiButton.dataset['dbLabelEmoji']!;
      const labels = () => Array.from(document.getElementById('fields')?.querySelectorAll<HTMLInputElement>('[data-db-key="label"]') || []).find(x => Number(x.dataset['dbIndex']) === index);
      const field = labels(); const old = field?.value ?? d().boxAmounts[index]?.label ?? ''; const pos = field?.selectionStart ?? old.length;
      const updated = old.slice(0, pos) + emoji + old.slice(pos);
      this.change(() => { if (d().boxAmounts[index]) d().boxAmounts[index].label = updated; });
      const next = labels(); if (next) { next.focus(); next.setSelectionRange(pos + emoji.length, pos + emoji.length); }
      return;
    }
    const kind = pick('[data-db-kind]');
    if (kind) { const index = Number(kind.dataset['dbIndex']), value = kind.dataset['dbKind']; if (d().boxAmounts[index]?.kind !== value) this.change(() => { d().boxAmounts[index].kind = value; }); return; }
    const add = pick('[data-db-add]'), remove = pick('[data-db-remove]');
    const distribution = pick('[data-db-distribution]'); if (distribution) { this.change(() => dbUpdateStyle(d(), 'boxDistribution', distribution.dataset['dbDistribution'], this.dbEditScope)); return; }
    const layout = pick('[data-db-layout]'); if (layout) { this.change(() => dbUpdateStyle(d(), 'boxLayout', layout.dataset['dbLayout'], this.dbEditScope)); return; }
    const shape = pick('[data-db-shape]'); if (shape) { this.change(() => { dbUpdateStyle(d(), 'boxShape', shape.dataset['dbShape'], this.dbEditScope); }); return; }
    if (add) { this.change(() => { d().boxAmounts.push({ id: 'a' + Date.now(), amount: 100, kind: 'once', months: 1, label: '' }); }); return; }
    if (remove) { this.change(() => d().boxAmounts.splice(Number(remove.dataset['dbRemove']), 1)); return; }
  }

  /** Carousel / card presentation of the component lists (one handler for every list). */
  private presentationClick(t: Element): void {
    const doc = this.doc;
    const deviceBtn = t.closest<HTMLElement>('[data-ham-device]'); if (deviceBtn) { this.h.setDevice(deviceBtn.dataset['hamDevice']!); return; }
    const layoutBtn = t.closest<HTMLElement>('[data-ham-layout]');
    if (layoutBtn) {
      const scope = layoutBtn.dataset['hamScope']!, conf = doc.content[scope], value = layoutBtn.dataset['hamLayout'];
      this.change(() => { if (value === 'carousel') { if (conf.layout !== 'carousel') conf.beforeCarouselLayout = conf.layout; conf.layout = 'carousel'; } else conf.layout = conf.beforeCarouselLayout || CAROUSEL_MODULES.find(m => m.scope === scope)!.ordinary; });
      return;
    }
    const perDevice = (scope: string, patch: Record<string, unknown>) => { const dev = this.cardSizeDevice; this.change(() => { const conf = doc.content[scope]; conf.presentation ??= {}; conf.presentation[dev] = { ...conf.presentation[dev], ...patch }; }); };
    const rewardImageBtn = t.closest<HTMLElement>('[data-ham-reward-image]');
    if (rewardImageBtn) { const pos = rewardImageBtn.dataset['hamRewardImage']; if (pos === 'top' || pos === 'side') perDevice('rewards', { imagePosition: pos }); return; }
    const navBtn = t.closest<HTMLElement>('[data-ham-nav]'); if (navBtn) { const scope = navBtn.dataset['hamScope']!; this.change(() => { doc.content[scope].carouselNavStyle = navBtn.dataset['hamNav']; }); return; }
    const countBtn = t.closest<HTMLElement>('[data-ham-count]'); if (countBtn) { perDevice(countBtn.dataset['hamScope']!, { count: countBtn.dataset['hamCount'] }); return; }
    const spreadBtn = t.closest<HTMLElement>('[data-ham-spread]'); if (spreadBtn) { perDevice(spreadBtn.dataset['hamScope']!, { spread: spreadBtn.dataset['hamSpread'] }); return; }
    const textBtn = t.closest<HTMLElement>('[data-ham-text]'); if (textBtn) { perDevice(textBtn.dataset['hamScope']!, { text: textBtn.dataset['hamText'] }); return; }
    const presetBtn = t.closest<HTMLElement>('[data-ham-presentation]');
    if (presetBtn) {
      const scope = presetBtn.dataset['hamScope']!, dev = this.cardSizeDevice, mode = presetBtn.dataset['hamPresentation']!;
      this.change(() => {
        const conf = doc.content[scope]; conf.presentation ??= {}; conf.presentation[dev] = { ...conf.presentation[dev], preset: mode, text: mode === 'two' ? 'hide' : mode === 'compact' ? 'one' : 'two' };
        if (['rewards', 'races'].includes(scope)) {
          const metrics = presentationMetrics(doc, scope, dev); const template = (CARD_SIZE_DEFAULTS as any)[scope][dev];
          conf.cardSizing ??= {}; conf.cardSizing[dev] = { width: metrics.width, image: mode === 'two' ? 62 : mode === 'compact' ? 77 : mode === 'wide' ? 117 : template.image, padding: mode === 'two' ? 7 : mode === 'compact' ? 9 : template.padding, button: mode === 'two' ? 30 : template.button };
        }
      });
    }
  }

  /** Card sizing of rewards and races: device, presets (click) and sliders (input). */
  private cardSizeClick(t: Element): void {
    const switcher = t.closest<HTMLElement>('[data-ham-card-device]');
    if (switcher) { this.h.setDevice(switcher.dataset['hamCardDevice']!); return; }
    const choice = t.closest<HTMLElement>('[data-ham-card-preset]'); if (!choice) return;
    const scope = choice.dataset['hamSizeScope']!, dev = this.cardSizeDevice, kind = choice.dataset['hamCardPreset']!;
    const presets: Record<string, any> = { compact: { width: dev === 'mobile' ? 195 : 228, image: 66, padding: 8, button: 30 }, balanced: { ...(CARD_SIZE_DEFAULTS as any)[scope][dev] }, spacious: { width: dev === 'mobile' ? 310 : 380, image: dev === 'mobile' ? 150 : 185, padding: 20, button: 46 } };
    this.change(() => { this.doc.content[scope].cardSizing ??= {}; this.doc.content[scope].cardSizing[dev] = { ...presets[kind] }; });
  }
  private cardSliderInput(e: Event): void {
    const input = (e.target as Element).closest<HTMLInputElement>('[data-ham-card-slider]'); if (!input) return;
    const scope = input.dataset['hamSizeScope']!, dev = this.cardSizeDevice, key = input.dataset['hamCardSlider']!;
    if (!this.has(input, 'editing')) { this.snapshot(); this.flag(input, 'editing'); }
    const conf = this.doc.content[scope]; conf.cardSizing ??= {}; conf.cardSizing[dev] ??= {};
    const safeNumber = Number(input.value); if (!Number.isFinite(safeNumber)) return; conf.cardSizing[dev][key] = safeNumber;
    this.text(input.closest('label')?.querySelector('output'), input.value + ' px');
    this.persist(); this.h.renderPreview();
  }

  /** The remaining buttons of the unified editor. */
  private buttonClick(t: Element): void {
    const btn = t.closest<HTMLElement>('button'); if (!btn) return;
    const doc = this.doc, ds = btn.dataset;
    if (ds['donorLayout']) { this.change(() => doc.content.donors.layout = ds['donorLayout']); return; }
    if (ds['pickEmoji']) { this.change(() => { doc.content.donate.emoji = ds['pickEmoji']; doc.content.donate.iconMode = 'emoji'; }); return; }
    if (ds['clearDonateIcon']) { this.change(() => doc.content.donate.customIcon = ''); return; }
    if (ds['palette']) { const t = PALETTES[ds['palette']]; this.change(() => { doc.theme = { ...doc.theme, ...Object.fromEntries(['primary', 'secondary', 'surface', 'ink'].map(k => [k, (t as any)[k]])) }; }); return; }
    if (ds['removeOrgLogo']) { this.change(() => doc.content.hero.orgLogo = ''); return; }
    if (ds['openTheme']) { this.h.select('theme'); return; }
    if (ds['addBlock']) { this.h.addStoryBlock(ds['addBlock']); return; }
    const ops: [string, number | null][] = [['blockUp', -1], ['blockDown', 1], ['blockDelete', null]];
    for (const [name, delta] of ops) if (ds[name] !== undefined) {
      const i = Number(ds[name]);
      this.change(() => { const arr = doc.content.story.blocks; if (delta === null) arr.splice(i, 1); else { const [b] = arr.splice(i, 1); arr.splice(i + delta, 0, b); } });
      break;
    }
  }

  /** The Hero video upload (images are MediaUploadService's, which handles them first). */
  private videoUpload(el: any): void {
    if (el.id !== 'heroVideoUpload') return;
    const f = el.files?.[0]; if (!f) return;
    if (f.size > 20000000) { this.h.toast('התמונה גדולה מדי'); return; }
    if (!['video/mp4', 'video/webm'].includes(f.type)) { this.h.toast('יש לבחור תמונת PNG, JPG, WEBP או SVG'); return; }
    const reader = new FileReader();
    reader.onload = () => { this.change(() => { this.doc.content.hero.video = String(reader.result); this.doc.content.hero.mediaType = 'video'; }); this.h.toast('סרטון ה־Hero עודכן'); };
    reader.readAsDataURL(f);
  }

  /** The Hero slider's images: remove (click) and add (change). */
  private sliderRemove(t: Element): void {
    const remove = t.closest<HTMLElement>('[data-ham-slider-remove]'); if (!remove) return;
    this.doc.content.hero.slides?.splice(Number(remove.dataset['hamSliderRemove']), 1);
    this.h.resetSlideKey(); this.persist(); this.h.renderPreview(); this.h.renderInspector();
  }
  private async sliderUpload(field: any): Promise<void> {
    if (!field.matches('[data-ham-slider-upload]')) return;
    const file = field.files?.[0]; if (!file) return;
    try {
      // The Studio's media facade (MediaStoreService / ImageProcessorService).
      const media = (window as any).hamonymMediaFix; if (!media) throw Error('מנגנון העלאת התמונות עדיין אינו מוכן');
      this.doc.content.hero.slides ||= [];
      if (this.doc.content.hero.slides.length >= 5) throw Error('אפשר להוסיף עד חמש תמונות לסליידר');
      const blob = await media.process(file, 'hero'), ref = await media.save(blob);
      this.doc.content.hero.slides.push(ref); this.h.resetSlideKey(); this.persist(); this.h.renderPreview(); this.h.renderInspector(); media.patchMedia?.();
    } catch (err: any) { console.error('Slider image upload failed', err); this.h.toast(err.message || 'שגיאה בהעלאת תמונה'); }
    finally { field.value = ''; }
  }

  /** The simple donation page's design (`data-hsd-*`), only in a simple campaign. */
  private get simple(): boolean { return this.doc.management?.campaignKind === 'simple'; }
  private simpleDesignClick(e: MouseEvent): void {
    const el = (e.target as Element).closest<HTMLElement>('[data-hsd-layout],[data-hsd-palette],[data-hsd-position]');
    if (!el || !this.simple) return;
    e.preventDefault(); this.snapshot(); this.doc.management.simpleDonation ||= {};
    const v = this.doc.management.simpleDonation;
    if (el.dataset['hsdLayout']) { v.layoutMode = el.dataset['hsdLayout']; if (v.layoutMode !== 'center') v.showHeroImage = true; }
    if (el.dataset['hsdPosition']) v.identityPosition = el.dataset['hsdPosition'];
    if (el.dataset['hsdPalette']) {
      const p = ({ green: ['#ffffff', '#ffffff', '#f0faf4', '#17784f', '#11613f', '#17784f'], blue: ['#f4f8fc', '#ffffff', '#eaf3fc', '#2879bb', '#1c679e', '#236fa7'], warm: ['#fcf7f0', '#ffffff', '#fff0df', '#ad784c', '#95613b', '#a56b42'], purple: ['#f8f5fc', '#ffffff', '#f2eafd', '#7860ad', '#604a9c', '#7760ad'] } as Record<string, string[]>)[el.dataset['hsdPalette']];
      if (p) Object.assign(v, { pageColor: p[0], cardColor: p[1], amountSelectedColor: p[2], continueButtonColor: p[3], buttonHoverColor: p[4], stepsActiveColor: p[5], amountSelectedBorderColor: p[5], buttonBorderColor: p[3], avatarColor: p[5] });
    }
    this.persist(); this.h.renderPreview(); this.h.renderInspector();
  }
  private simpleDesignInput(e: Event): void {
    const el = e.target as any; if (!el.matches('[data-hsd-key]') || !this.simple) return;
    if (!this.has(el, 'hsdStarted')) { this.snapshot(); this.flag(el, 'hsdStarted'); }
    this.doc.management.simpleDonation ||= {};
    this.doc.management.simpleDonation[el.dataset.hsdKey] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    this.persist(); this.h.renderPreview();
    const note = el.parentElement?.querySelector('small'); if (note && el.type === 'range') this.text(note, el.value + ' px');
  }
  private simpleDesignChange(el: any): void {
    if (!el.matches('[data-hsd-key]') || !this.simple) return;
    if (!this.has(el, 'hsdStarted')) { this.snapshot(); this.doc.management.simpleDonation ||= {}; this.doc.management.simpleDonation[el.dataset.hsdKey] = el.type === 'checkbox' ? el.checked : el.value; this.persist(); this.h.renderPreview(); }
    this.h.renderInspector();
  }

  /** The unified editor's quick styles and device buttons. */
  private unifiedClick(e: MouseEvent): void {
    const t = e.target as Element;
    const preset = t.closest<HTMLElement>('[data-ham-unified-preset]');
    if (preset) { e.preventDefault(); const id = preset.dataset['hamUnifiedPreset'] || ''; const target = unifiedPresetTarget(this.doc, this.h.selected(), id); if (target) this.change(() => applyUnifiedPreset(target, id)); return; }
    const dev = t.closest<HTMLElement>('[data-ham-unified-device]');
    if (dev) { e.preventDefault(); const value = dev.dataset['hamUnifiedDevice']; if (value === 'desktop' || value === 'mobile') this.h.setDevice(value); }
  }

  /** The stats card's design (`data-hsc-*`). It is handled first and goes no further, as before. */
  private statsCardClick(event: MouseEvent): boolean {
    const t = event.target as Element;
    const preset = t.closest<HTMLElement>('[data-hsc-preset]'), meter = t.closest<HTMLElement>('[data-hsc-meter]'), reset = t.closest('[data-hsc-reset]');
    const palette = t.closest<HTMLElement>('[data-hsc-palette]'), location = t.closest<HTMLElement>('[data-hsc-location]');
    if (!preset && !meter && !reset && !palette && !location) return false;
    event.preventDefault(); event.stopPropagation();
    this.doc.management ||= {}; const cfg = this.doc.management.heroStatsCard ||= {};
    this.snapshot();
    if (location) { cfg.enabled = location.dataset['hscLocation'] === 'hero'; cfg.sidebarStyled = !cfg.enabled; }
    if (preset) { CARD_DESIGN_LIBRARY.applyPreset(cfg, preset.dataset['hscPreset']!, this.doc.theme.primary); if (!cfg.enabled) cfg.sidebarStyled = true; }
    if (meter) cfg.meter = meter.dataset['hscMeter'];
    if (palette) { cfg.bg = palette.dataset['bg']; cfg.accent = palette.dataset['accent']; cfg.tileBg = palette.dataset['tileBg']; cfg.tileText = palette.dataset['tileText']; cfg.text = palette.dataset['textColor'] || cfg.text; }
    if (reset) { const enabled = cfg.enabled, sidebarStyled = cfg.sidebarStyled, shapeBefore = cfg.shape; Object.assign(cfg, { ...CARD_DESIGN_LIBRARY.presets['classic'], preset: 'classic', enabled, sidebarStyled, shape: shapeBefore || 'square', bold: false, glass: false }); }
    this.persist(); this.h.renderPreview(); this.h.renderInspector();
    return true;
  }
  private statsCardSetting(event: Event): boolean {
    const el = (event.target as Element).closest<HTMLInputElement>('[data-hsc-setting]'); if (!el) return false;
    event.stopPropagation();
    this.doc.management ||= {}; const cfg = this.doc.management.heroStatsCard ||= {};
    cfg[el.dataset['hscSetting']!] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
    if (el.type === 'range') this.text(el.parentElement?.querySelector('output'), el.value);
    this.persist(); this.h.renderPreview();
    return true;
  }
}
