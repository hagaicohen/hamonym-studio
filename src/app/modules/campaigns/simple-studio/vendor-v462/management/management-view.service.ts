import { Injectable, computed, signal } from '@angular/core';
import { ManagementModelService, ModuleType, Readiness } from './management-model.service';

export type ManagementMode = 'management' | 'design' | 'publish';
/** Every page key the management screen accepts (old keys are aliases of the grouped pages). */
export type ManagementPage = 'overview' | 'identity' | 'race' | 'fundraising' | 'modules'
  | 'funding' | 'donations' | 'visibility' | 'access' | 'publish';
export const MANAGEMENT_PAGES: readonly ManagementPage[] = ['overview', 'identity', 'race', 'fundraising', 'modules', 'funding', 'donations', 'visibility', 'access', 'publish'];
/** What the page area actually shows: a page, or the single-page editor of a simple donation page. */
export type ManagementView = ManagementPage | 'simple';
export type ActiveModule = ModuleType | 'races';

/**
 * Operations still implemented by the legacy management engine (work mode and the studio
 * around the management screen). The engine registers them at start-up.
 */
export interface ManagementHost {
  /** Full redraw with the engine's post-processing (old `drawManager`). */
  redraw(): void;
  /** Work-mode switch: owns the workspace class, the toolbar tabs and the core inspector. */
  setMode(mode: ManagementMode): void;
  goEdit(component: string): void;
  openStory(): void;
}

/**
 * UI state of the management screen (which page, which module, search, drawer),
 * shared by the Angular components and the not-yet-converted engine.
 * Campaign data is NOT stored here: it stays in the campaign state, read through
 * ManagementModelService. `revision` is bumped whenever the original engine would have
 * redrawn the screen, so templates refresh at exactly the same moments as before.
 */
@Injectable({ providedIn: 'root' })
export class ManagementViewService {
  readonly mode = signal<ManagementMode>('management');
  readonly page = signal<ManagementPage>('overview');
  /** The highlighted `[data-hu-mode]` button (toolbar tabs and page buttons), bound in templates; set only by `setMode`. */
  readonly activeTab = signal<ManagementMode>('management');
  readonly activeModule = signal<ActiveModule>('rewards');
  readonly navSearch = signal('');
  readonly drawerOpen = signal(false);
  /** Page currently rendered (null: not in management mode yet). */
  readonly angularView = signal<ManagementView | null>(null);
  /** Redraw counter (old `drawManager`). */
  readonly revision = signal(0);
  /** Readiness counter (old `updateMeters`): refreshes the meters without a full redraw. */
  private readonly meterRevision = signal(0);
  /**
   * Bumped by every page navigation (`goPage`). Converted pages are re-created when it changes,
   * so a page opens in its initial state (sections, inputs) exactly like the old full rewrite,
   * while ordinary redraws keep what the user opened (v4.41 fix: sections no longer collapse).
   */
  readonly visit = signal(0);
  /** The visit the rendered page belongs to; taken only in `draw()`, so a page is re-created at a redraw, never in between. */
  readonly pageInstance = signal(0);
  /** Imperative writers run synchronously after each draw (DOM values, legacy fragments). */
  private readonly drawWriters = new Set<() => void>();

  readonly readiness = computed<Readiness>(() => { this.meterRevision(); this.revision(); return this.model.readiness(); });

  private host: ManagementHost | null = null;
  private syncRender: (() => void) | null = null;

  constructor(private readonly model: ManagementModelService) {}

  registerHost(host: ManagementHost): void { this.host = host; }
  /** The shell registers a synchronous render, so the engine can post-process right after a draw. */
  registerRenderer(render: () => void): void { this.syncRender = render; }

  campaignKind(): string { return this.model.campaignKind(); }
  isSimple(): boolean { return this.campaignKind() === 'simple'; }
  isRace(): boolean { return this.campaignKind() === 'race'; }

  /** Old `drawManager` (without the engine's legacy post-processing). */
  draw(): ManagementView | null {
    if (this.mode() !== 'management') return null;
    if (this.isSimple() && this.page() !== 'publish') this.page.set('identity');
    if (this.page() === 'race') this.activeModule.set('races');
    const view: ManagementView = this.isSimple() && this.page() !== 'publish' ? 'simple' : this.page();
    this.angularView.set(view);
    this.pageInstance.set(this.visit());
    this.revision.update(n => n + 1);
    this.isDrawing = true;
    try {
      this.syncRender?.();
      for (const write of [...this.drawWriters]) write();
    } finally { this.isDrawing = false; }
    return view;
  }

  /** True while `draw()` renders and runs the writers. */
  drawing(): boolean { return this.isDrawing; }
  private isDrawing = false;

  refreshMeters(): void { this.meterRevision.update(n => n + 1); }

  /**
   * Old `updateMeters`: the Angular meters read `readiness()`; the meters outside Angular
   * (top toolbar) are written directly. Writing `textContent` into an Angular-owned node would
   * replace the text node Angular holds, hence the filter.
   */
  updateMeters(): void {
    this.refreshMeters();
    const r = this.model.readiness();
    const legacy = (el: Element) => !el.closest('#huManager,#huOverlay');
    document.querySelectorAll<HTMLElement>('[data-hu-meter]').forEach(el => { if (legacy(el)) el.style.width = r.pct + '%'; });
    document.querySelectorAll<HTMLElement>('[data-hu-percent]').forEach(el => { if (legacy(el)) el.textContent = r.pct + '%'; });
    const subtitle = document.getElementById('huMeterText');
    if (subtitle) subtitle.textContent = r.done + ' מתוך ' + r.total + ' תנאי תוכן הושלמו';
  }

  /** Registers a writer run after every draw; returns the unregister function. */
  onDraw(write: () => void): () => void { this.drawWriters.add(write); return () => this.drawWriters.delete(write); }

  /** Full redraw (old `drawManager`: the page, then the meters). */
  redraw(): void { if (this.host) this.host.redraw(); else this.draw(); }

  /** Old `goPage`. */
  goPage(target: string): void {
    if (target === 'content') target = 'identity';
    if (target === 'race' && !this.isRace()) target = 'identity';
    if (!(MANAGEMENT_PAGES as readonly string[]).includes(target)) return;
    this.closeDrawer();
    this.page.set(target as ManagementPage);
    this.visit.update(n => n + 1);
    this.host?.setMode('management');
    const scroller = document.getElementById('huPage');
    if (scroller) scroller.scrollTop = 0;
  }

  /** Toolbar tab / `[data-hu-mode]` button (old click branch). */
  chooseMode(mode: ManagementMode): void {
    if (mode === 'publish') { this.goPage('publish'); return; }
    if (mode === 'management' && this.page() === 'publish') this.page.set('overview');
    this.visit.update(n => n + 1);
    this.host?.setMode(mode);
  }

  /** Module shortcut in the menu (old `data-hu-nav-module`). */
  goModule(module: ActiveModule): void {
    this.activeModule.set(module);
    this.goPage(module === 'races' ? 'race' : module === 'donors' || module === 'ambassadors' ? 'fundraising' : 'modules');
  }

  goEdit(component: string): void { this.closeDrawer(); this.host?.goEdit(component); }
  openStory(): void { this.host?.openStory(); }

  openDrawer(): void {
    this.drawerOpen.set(true);
    this.syncRender?.();
    document.getElementById('huDrawerClose')?.focus();
  }
  closeDrawer(): void { this.drawerOpen.set(false); this.syncRender?.(); }
}
