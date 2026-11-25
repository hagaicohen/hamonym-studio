import { ManagementViewService } from '../management/management-view.service';
import { Injectable, Injector, OnDestroy, inject, signal } from '@angular/core';
import { CampaignStateService } from './campaign-state.service';
import { CAMPAIGN_SECTIONS, blankCampaign } from './campaign-defaults';
import { CAMPAIGN_CATEGORY_CATALOG } from './category-catalog';
import { CAMPAIGN_TEMPLATES, DEFAULT_HERO_IMAGE, applyRenderMigrations, categoryByLabel, categoryIconName, chooseCampaignCategory, footerDefaults, solidCategoryIcon } from './campaign-catalog';
import { ambassadorSafeLink, donationRelativeTime, esc, formatAmount, simpleVisualSettings } from './campaign-format';
import { seedDemoCampaign } from './demo-campaign';
import { CampaignCardsService } from '../public-page/campaign-cards.service';
import { CollectionBlocksService } from '../public-page/collections/collection-blocks.service';
import { PublicPartsService } from '../public-page/parts/public-parts.service';
import { StorySlidesService } from '../public-page/parts/story-slides.service';
import { CARD_SIZE_DEFAULTS, cardSizeFor, cardSizeVars, presentationFor, rewardStyleVars } from '../public-page/collections/collection-style';
import { sponsorsShown } from '../public-page/cards/sponsors.component';
import { InspectorService } from '../inspector/inspector.service';
import { WideEditorService } from '../inspector/wide-editor';
import { buildInspector } from '../inspector/inspector-model';
import { CARD_DESIGN_LIBRARY, CAROUSEL_MODULES, PALETTES, readAmount } from '../inspector/inspector-edits';
import { StoryBuilderService } from '../story-builder/story-builder.service';
import { sbFind, sbId, sbInline, sbNew, sbRenderNode, setStoryMediaResolver, storyRenderPublic } from '../story-builder/story-render';
import { SectionTreeService, TREE_MOVABLE } from '../tree/section-tree.service';
import { PreviewSelectionService } from '../preview/preview-selection.service';
import { MediaStoreService } from '../media/media-store.service';
import { studioInterval } from './studio-session';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Device = 'mobile' | 'desktop';
const NAV_TARGETS = [['story', 'סיפור'], ['rewards', 'תשורות'], ['donors', 'תורמים'], ['ambassadors', 'שגרירים'], ['comments', 'תגובות'], ['updates', 'עדכונים'], ['sponsors', 'חסויות']];
/** A simple donation page designs only these blocks; the others stay visible but locked. */
const SIMPLE_DESIGN_ENABLED = new Set(['theme', 'hero', 'donationBox']);
const MOBILE_PINNED = ['title', 'stats', 'donationBox'];
const RACE_PHOTO_PREFIX = 'hamonym-race-photo-v1-', RACE_PHOTO_MARKER = 'hamracephoto:';

/**
 * The Studio editor (v4.61): the editor state (selected block, device, highlight, the mobile menu-only block, the
 * panorama tab, the simple page's flow) and the render orchestration (tree, preview, inspector, story builder). The
 * campaign document, undo / redo and saving stay CampaignStateService's. Replaces `campaign-core-engine.ts`.
 *
 * The wizard, the management screen and the media services receive `context` (the same members as the former
 * `window.hamAngularMediaContext`) through dependency injection.
 */
@Injectable({ providedIn: 'root' })
export class EditorService implements OnDestroy {
  private readonly state = inject(CampaignStateService);
  private readonly cards = inject(CampaignCardsService);
  private readonly collections = inject(CollectionBlocksService);
  private readonly parts = inject(PublicPartsService);
  private readonly slides = inject(StorySlidesService);
  private readonly inspector = inject(InspectorService);
  private readonly wide = inject(WideEditorService);
  private readonly builder = inject(StoryBuilderService);
  private readonly tree = inject(SectionTreeService);
  private readonly previewSel = inject(PreviewSelectionService);
  private readonly media = inject(MediaStoreService);
  private readonly injector = inject(Injector);

  // ---- editor state ----
  selected = 'header';
  readonly device = signal<Device>('mobile');
  highlight = false;
  /** On a phone, a block placed only in the navigation menu and opened from it. */
  activeNavSection: string | null = null;
  panoramaTab = 'story';
  /** The simple donation page's checkout flow (UI only). */
  readonly simpleFlowState: any = { step: 1, frequency: 'once', amount: 180, custom: '', fullName: '', email: '', phone: '', identityNumber: '', anonymous: false, dedication: '', done: false, error: '' };
  /** The breadcrumb (`#crumbName`) and its mode label. */
  readonly crumbName = signal('Hero');
  readonly crumbLabel = signal('עורך חזותי ');
  readonly toastText = signal('');
  readonly toastShown = signal(false);
  private toastTimer?: ReturnType<typeof setTimeout>;

  // ---- hooks of the management screen (formerly wrappers it installed over the core's functions) ----
  /** Around every save: before (the campaign URL's canonical slug) and after (readiness meters). */
  readonly persistHooks = { before: [] as (() => void)[], after: [] as (() => void)[] };
  /** Around a full render: before (management defaults) and after (the management page and meters). */
  readonly renderHooks = { before: [] as (() => void)[], after: [] as (() => void)[] };
  /** The management screen's field evidence, called by the wizard (`context.confirmField`). */
  confirmField: ((path: string, source?: string) => void) | null = null;
  private previewImpl: () => unknown = () => { const result = this.renderPreviewBase(); this.slides.init(); return result; };
  /** Wraps the preview render (the management screen's preview guidance renders around it). */
  decoratePreview(wrap: (inner: () => unknown) => () => unknown): void { this.previewImpl = wrap(this.previewImpl); }

  private get doc(): any { return this.state.current; }
  private storage(): any { return (window as any).hamAngularDraftStorage; }

  /** Loads the draft and renders the Studio (formerly the core's start-up sequence, same order). */
  start(): void {
    this.state.load(CAMPAIGN_TEMPLATES);
    this.state.attach({ persist: () => this.persist(), render: () => this.render(), renderPreview: () => this.renderPreview() });
    this.startPageRendering();
    this.tree.attachHost({ select: id => this.select(id), openEditor: id => this.openLargeEditor(id), order: () => this.orderFor(), move: (id, target) => this.moveMainSection(id, target), locked: id => this.locked(id) });
    this.wide.selected = () => this.selected;
    this.inspector.attachHost({
      selected: () => this.selected, device: () => this.device(), renderPreview: () => this.renderPreview(), renderInspector: () => this.renderInspector(),
      renderSections: () => this.renderSections(), select: id => this.select(id), setDevice: value => this.setDevice(value), toast: t => this.toast(t),
      openStory: () => this.openStory(), addStoryBlock: type => this.addBlock(type), chooseCategory: (id, sub) => chooseCampaignCategory(this.doc, id, sub),
      clearActiveNav: id => { if (this.activeNavSection === id) this.activeNavSection = null; }, resetSlideKey: () => this.parts.resetSlideKey()
    });
    this.builder.attachHost({
      create: type => sbNew(type), newId: () => sbId(), find: id => sbFind(id, this.doc.content.story.blocks), inline: (n, dev) => sbInline(n, dev),
      migrateLead: () => this.migrateWizardLead(), select: id => this.select(id), render: () => this.render(), renderPreview: () => this.renderPreview(),
      renderInspector: () => this.renderInspector(), toast: t => this.toast(t)
    });
    this.previewSel.attachHost({
      device: () => this.device(), select: id => this.select(id), openEditor: id => this.openLargeEditor(id), locked: id => this.locked(id),
      setActiveNav: id => { this.activeNavSection = id; }, panoramaSelectTab: (id, preview, scroll) => this.panoramaSelectTab(id, preview, scroll),
      renderPreview: () => this.renderPreview(), toast: t => this.toast(t)
    });
    this.render();
    this.slides.init();
  }
  /** Shared public rendering setup; does not load local drafts or start editing tools. */
  private startPageRendering(): void {
    this.cards.attach({ photoSrc: (s: string) => this.photoSrc(s) });
    setStoryMediaResolver(ref => this.media.src(ref) || '');
    studioInterval(() => this.parts.tick(this.state.peek()?.['content']?.campaignInfo?.endAt, this.device() === 'mobile'), 60000);
    this.collections.start({ device: () => this.device() });
    this.parts.start({
      device: () => this.device(), selected: () => this.selected, highlight: () => this.highlight, activeNavSection: () => this.activeNavSection,
      deviceAllowed: (id: string) => this.deviceAllowed(id), contentPartClass: (id: string) => this.contentPartClass(id),
      donationBox: () => { const d = this.doc.content.donate; return d.boxEnabled ? this.dbStyleForDevice(d) : null; },
      storyMarkup: (blocks: any[]) => storyRenderPublic(blocks, this.device()), simpleState: () => this.simpleFlowState,
      simpleVisual: () => simpleVisualSettings(this.doc), toast: (t: string) => this.toast(t), order: () => this.orderFor(this.device()),
      panoramaTab: () => this.panoramaTab, setPanoramaTab: (id: string) => { this.panoramaTab = id; },
      cardDesign: () => ({ shapes: CARD_DESIGN_LIBRARY.shapes.map(s => s[0]), meters: CARD_DESIGN_LIBRARY.meters.map(m => m[0]) })
    } as any);
    this.parts.listen();
  }

  /** The platform public route uses the same page, layout and interactions as Preview. */
  startPublicPage(): void {
    this.selected = '';
    this.highlight = false;
    this.startPageRendering();
    this.previewImpl = () => this.renderPublicPage();
  }

  renderPublicPage(): void {
    const preview = document.getElementById('preview');
    if (!preview) return;
    this.cards.renderPage(preview);
    this.cards.fitHeroSubtitle(); this.cards.layoutHost(); this.cards.placeRaceCard();
    this.cards.attachPage(); this.cards.syncDonationCtas();
    this.slides.init();
  }

  ngOnDestroy(): void { if (this.toastTimer) clearTimeout(this.toastTimer); }

  // ---- saving, transactions, toast ----
  persist(): void { for (const fn of this.persistHooks.before) fn(); this.state.writeDraft(); for (const fn of this.persistHooks.after) fn(); }
  snapshot(): void { this.state.snapshot(); }
  change(fn: () => void, rerender = true): void { this.state.change(fn, rerender); }
  toast(text: string): void {
    this.toastText.set(text); this.toastShown.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastShown.set(false), 2300);
  }

  // ---- selection, device, order ----
  locked(id: string): boolean { return this.doc.management?.campaignKind === 'simple' && !SIMPLE_DESIGN_ENABLED.has(id); }
  select(id: string): void {
    if (this.locked(id)) return;
    const changed = this.selected !== id;
    this.selected = id;
    this.renderSections(); this.renderPreview(); this.renderInspector();
    // When changing components, begin at the component heading; not while editing a field or reselecting.
    if (changed && !this.wide.isOpen) { const inspector = document.querySelector<HTMLElement>('.workspace > .inspector'); if (inspector) inspector.scrollTop = 0; }
    this.crumbName.set(CAMPAIGN_SECTIONS.find((s: string[]) => s[0] === id)?.[1] || 'עיצוב כללי');
  }
  /** The device: the state only (the export and the wizard switch it around a render). */
  setDeviceOnly(value: Device): void { this.device.set(value); }
  setDevice(value: string): void {
    if (value !== 'desktop' && value !== 'mobile') return;
    this.device.set(value); this.inspector.cardSizeDevice = value;
    this.renderSections(); this.renderPreview(); this.renderInspector();
  }
  setHighlight(on: boolean): void { this.highlight = on; this.renderPreview(); }
  deviceAllowed(id: string): boolean {
    const doc = this.doc, device = this.device();
    if (id === 'nav' && device === 'desktop' && doc.template === 'panorama') return true;
    if (id === 'donationBox') return doc.content.donate.boxEnabled !== false;
    return doc.visible[id] !== false && (doc.deviceVisibility?.[id] || 'both') !== (device === 'mobile' ? 'desktop' : 'mobile');
  }
  orderFor(dev: Device = this.device()): string[] {
    const saved: string[] = this.doc.sectionOrder?.[dev] || [];
    const ordered = [...saved.filter(id => TREE_MOVABLE.includes(id)), ...TREE_MOVABLE.filter(id => !saved.includes(id))];
    // Mobile campaign essentials always follow the short campaign story, in every template.
    if (dev === 'mobile') return [...MOBILE_PINNED.filter(id => TREE_MOVABLE.includes(id)), ...ordered.filter(id => !MOBILE_PINNED.includes(id))];
    return ordered;
  }
  moveMainSection(id: string, target: string): void {
    const device = this.device();
    if (device === 'mobile' && MOBILE_PINNED.includes(id)) return;
    if (!TREE_MOVABLE.includes(id) || !TREE_MOVABLE.includes(target) || id === target) return;
    const order = this.orderFor(), old = order.indexOf(id), at = order.indexOf(target);
    if (old < 0 || at < 0) return;
    order.splice(old, 1); order.splice(at, 0, id);
    this.change(() => { this.doc.sectionOrder ??= {}; this.doc.sectionOrder[device] = order; });
  }
  /** A block's extra classes: on a phone, a block placed only in the navigation menu (`menu-only-*`). */
  contentPartClass(id: string): string {
    const placement = this.doc.content.nav.placement || {};
    const menuOnly = id !== 'rewards' && this.device() === 'mobile' && placement[id] === 'menu';
    const shown = !menuOnly || this.activeNavSection === id || this.selected === id;
    return menuOnly ? 'menu-only-section ' + (shown ? 'menu-only-active' : 'menu-only-inactive') : '';
  }
  dbStyleForDevice(d: any, dev: Device = this.device()): any { return { ...d, ...(d.boxResponsive?.[dev] || {}) }; }
  /** One shared optimized-photo store for races and rewards (the legacy `hamracephoto:` marker included). */
  private readonly photoCache = new Map<string, string>();
  photoSrc(source: unknown): string {
    if (typeof source !== 'string' || !source) return '';
    if (source.startsWith('hamonymmedia:')) return this.media.src(source) || '';
    if (!source.startsWith(RACE_PHOTO_MARKER)) return source;
    if (this.photoCache.has(source)) return this.photoCache.get(source)!;
    let data = ''; try { data = this.storage()?.getItem(RACE_PHOTO_PREFIX + source.slice(RACE_PHOTO_MARKER.length)) || ''; } catch { /* unavailable */ }
    if (data) this.photoCache.set(source, data);
    return data;
  }

  // ---- renders ----
  renderSections(): void {
    if (this.doc.management?.campaignKind === 'simple') this.selected = 'hero';
    else if (this.locked(this.selected)) this.selected = 'hero';
    this.tree.render(this.selected, this.device());
  }
  renderPreview(): unknown { return this.previewImpl(); }
  private renderPreviewBase(): void {
    for (let n = applyRenderMigrations(this.doc); n > 0; n--) this.persist();
    footerDefaults(this.doc);
    const preview = document.getElementById('preview');
    if (!preview) return;
    this.cards.renderPage(preview);
    this.previewSel.afterRender();
    // The Hero fits its subtitle, the container's layout classes, the race Hero card's position.
    this.cards.fitHeroSubtitle(); this.cards.layoutHost(); this.cards.placeRaceCard();
    (window as any).hamUnifiedCart?.mount();
    this.cards.attachPage();
    this.cards.syncDonationCtas();
  }
  syncDonationCtas(): void { this.cards.syncDonationCtas(); }
  renderInspector(): void {
    this.inspector.remember();
    const doc = this.doc, device = this.device(), inspector = this.inspector;
    const view = buildInspector({
      state: structuredClone(doc), selected: this.selected, device, cardSizeDevice: inspector.cardSizeDevice, dbEditScope: inspector.dbEditScope, advancedOpen: inspector.advancedOpen,
      categorySearch: inspector.categorySearch, categoryIconPickerOpen: inspector.categoryIconPickerOpen, palettes: PALETTES, navTargets: NAV_TARGETS, carouselModules: CAROUSEL_MODULES, cardSizeDefaults: CARD_SIZE_DEFAULTS,
      cardSizeFor: (scope: string, dev: string) => cardSizeFor(doc, scope, dev), presentationFor: (scope: string, dev: string) => presentationFor(doc, scope, dev), dbStyleForDevice: (d: any) => this.dbStyleForDevice(d),
      simpleVisual: () => simpleVisualSettings(doc), categoryByLabel: (label: string) => categoryByLabel(label), catalog: CAMPAIGN_CATEGORY_CATALOG, categoryIconName: (c: any) => categoryIconName(c),
      mediaSrc: (ref: string) => this.media.src(ref) || '', extras: () => (window as any).hamInspectorExtras?.() || []
    } as any);
    inspector.render(view);
    if (this.wide.isOpen) queueMicrotask(() => this.wide.refresh());
  }
  render(): void {
    for (const fn of this.renderHooks.before) fn();
    this.renderSections(); this.renderPreview(); this.renderInspector();
    this.state.syncUndo();
    for (const fn of this.renderHooks.after) fn();
  }

  // ---- panorama tabs ----
  panoramaSelectTab(id: string, preview: HTMLElement | null = document.getElementById('preview'), scroll = false): void {
    // A race's participants tab is a tab too.
    if (!preview || !['story', 'rewards', 'donors', 'ambassadors', 'comments', 'updates', 'sponsors', 'participants'].includes(id)) return;
    this.panoramaTab = id;
    const wrap = preview.querySelector('.ham-panorama-tabs');
    if (!wrap) return;
    this.parts.selectPanoramaTab(id);
    if (scroll) requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  // ---- story ----
  addBlock(type: string): void {
    this.change(() => this.doc.content.story.blocks.push({ id: 'b' + Date.now(), type, value: type === 'image' ? 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=1100&q=85' : 'פסקה חדשה — ערוך את הטקסט כאן.' }));
    this.select('story');
  }
  openStory(): void { this.builder.openEditor(); }
  /** Earlier wizards placed a text and an image side by side in the renderer only: materialize that pair once. */
  migrateWizardLead(): void {
    const doc = this.doc, wiz = doc.management?.entryWizard;
    if (!wiz || doc.management.storyLeadMigrationV0170) return;
    doc.management.storyLeadMigrationV0170 = true;
    const blocks = doc.content.story?.blocks;
    if (Array.isArray(blocks) && blocks.length >= 2 && blocks[0]?.type === 'text' && blocks[1]?.type === 'image') {
      const container = sbNew('container');
      container.layout = '2'; container.mobileLayout = 'stack';
      container.children = blocks.splice(0, 2);
      container.storyWizardLeadV0170 = true;
      blocks.unshift(container);
    }
    this.persist();
  }
  seedDemo(kind: 'donation' | 'race'): void { seedDemoCampaign(this.doc, kind); }

  // ---- the large editor ----
  /** Design mode first (the management screen owns the work mode: `hamonym:request-design-mode`). */
  private ensureDesignMode(): boolean {
    if (!document.querySelector('.workspace')) return false;
    const view = this.injector.get(ManagementViewService);
    if (view.mode() === 'design') return true;
    window.dispatchEvent(new CustomEvent('hamonym:request-design-mode', { detail: { handled: false } }));
    return view.mode() === 'design';
  }
  private wideOpen(): void {
    if (this.wide.isOpen) return;
    const fields = document.getElementById('fields'); if (!fields?.isConnected) return;
    this.previewSel.hide();
    this.wide.open();
  }
  /** Opens a block in the large editor: the management screen switches to design (`hamonym:open-component-editor`), then select and open. */
  openLargeEditor(id: string): void {
    if (!id || this.locked(id)) return;
    const request: { id: string; handled: boolean; error?: string } = { id, handled: false };
    try { window.dispatchEvent(new CustomEvent('hamonym:open-component-editor', { detail: request })); }
    catch (error) { console.error('[HAMONYM] Component editor controller failed', id, error); }
    if (!request.handled) this.ensureDesignMode();
    try { this.select(id); }
    catch (error) { console.error('[HAMONYM] Core inspector selection failed', id, error); this.toast('לא ניתן לפתוח כרגע את עריכת הרכיב'); return; }
    if (this.injector.get(ManagementViewService).mode() !== 'design') this.ensureDesignMode();
    if (this.wide.isOpen) {
      const active = document.getElementById('fields');
      if (active && this.wide.panel?.contains(active)) { this.wide.refresh(); return; }
      this.wide.close();
    }
    try { this.wideOpen(); } catch (error) { console.error('[HAMONYM] Dialog mount error', id, error); }
    if (!this.wide.isOpen) { console.error('[HAMONYM] Editor cannot open', { id, controllerHandled: request.handled }); this.toast('חלון העריכה לא נפתח. פרטים בקונסול.'); }
  }
  /** `hamonym:open-design-studio` (integration event): the large editor for the selected block. */
  openDesignStudio(): void { this.ensureDesignMode(); if (document.getElementById('fields')) this.wideOpen(); }

  // ---- the context of the wizard, the management screen and the media services ----
  readonly context: any = this.buildContext();
  private buildContext(): any {
    const self = this;
    return {
      get storage() { return self.storage(); },
      readState: () => this.doc,
      renderPreview: () => this.renderPreview(),
      renderInspector: () => this.renderInspector(),
      decoratePreview: (wrap: any) => this.decoratePreview(wrap),
      snapshot: () => this.snapshot(),
      toast: (message: string) => this.toast(message),
      sbFind: (id: string, items?: any[], parent?: any) => sbFind(id, items || this.doc.content.story.blocks, parent ?? null),
      sbRenderNode: (n: any, dev: string, editing: boolean) => sbRenderNode(n, dev, editing, this.builder.selectedId),
      sbRender: () => this.builder.redraw(),
      donateBoxMarkup: (d: any, force = false) => (!force && !d.boxEnabled) ? '' : this.cards.html('donationBox', { donate: this.dbStyleForDevice(d) }),
      device: () => this.device(),
      history: () => this.state.historyEntries().past,
      future: () => this.state.historyEntries().future,
      updateUndo: () => this.state.syncUndo(),
      sbSelected: () => this.builder.selectedId,
      defaults: () => blankCampaign(),
      templates: CAMPAIGN_TEMPLATES,
      esc: (text: unknown) => esc(text),
      setDevice: (value: Device) => this.setDeviceOnly(value),
      categoryByLabel: (label: string) => categoryByLabel(label),
      campaignCategoryCatalog: CAMPAIGN_CATEGORY_CATALOG,
      solidCategoryIcon: (name: string, px?: number) => solidCategoryIcon(name, px),
      chooseCampaignCategory: (id: string, sub?: string) => chooseCampaignCategory(this.doc, id, sub),
      hamSimpleVisualSettings: () => simpleVisualSettings(this.doc),
      get hamSimpleFlowState() { return self.simpleFlowState; },
      img: DEFAULT_HERO_IMAGE,
      resetHeroSlideKey: () => this.parts.resetSlideKey(),
      sbNew: (type: string) => sbNew(type),
      sbOpen: () => this.openStory(),
      sbMigrateLegacyWizardLead: () => this.migrateWizardLead(),
      persist: () => this.persist(),
      render: () => this.render(),
      confirmField: (path: string, source?: string) => this.confirmField?.(path, source),
      selected: () => this.selected,
      select: (id: string) => this.select(id),
      renderSections: () => this.renderSections(),
      ambassadorSafeLink: (url: unknown) => ambassadorSafeLink(url),
      hamCardSizeFor: (scope: string, dev: string = this.device()) => cardSizeFor(this.doc, scope, dev),
      hamCardSizeVars: (scope: string, dev: string = this.device()) => cardSizeVars(this.doc, scope, dev),
      hamDonationRelativeTime: (donor: any, now?: number) => donationRelativeTime(donor, now),
      huFormatAmount: (value: unknown) => formatAmount(value),
      huRacePhotoSrc: (source: unknown) => this.photoSrc(source),
      huReadAmount: (value: unknown) => readAmount(value),
      rewardStyleVars: (cfg: any) => rewardStyleVars(this.doc, cfg, this.device(), esc),
      rewardTileMarkup: (item: any, cfg: any, index = 0) => this.cards.html('reward', { item, cfg, index }),
      sponsorMarkup: () => sponsorsShown(this.doc) ? this.cards.html('sponsors') : ''
    };
  }
}
