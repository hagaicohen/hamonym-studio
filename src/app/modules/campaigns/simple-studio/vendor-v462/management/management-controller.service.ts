import { ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, OnDestroy, Type, createComponent, inject  } from '@angular/core';
import { ManagementModelService } from './management-model.service';
import { ManagementMode, ManagementViewService } from './management-view.service';
import { ManagementCommandsService } from './management-commands.service';
import { ManagementShellComponent } from './shell/management-shell.component';
import { ReadinessDrawerComponent } from './shell/readiness-drawer.component';
import { RewardPreviewService } from './content/reward-preview.component';
import { CalendarService } from './calendar/calendar.service';
import { ManagementInputService } from './management-input.service';
import { InspectorService } from '../inspector/inspector.service';
import { StudioToolbarService } from '../layout/studio-toolbar.service';
import { PreviewSelectionService } from '../preview/preview-selection.service';
import { EditorService } from '../core/editor.service';
import { studioAdopt } from '../core/studio-session';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** The Inspector edits that count as the manager's own input (readiness evidence). */
const INSPECTOR_EVIDENCE: Record<string, string> = {
  'title.description': 'content.shortText', 'campaignInfo.category': 'meta.category', 'campaignInfo.manager': 'meta.manager',
  'campaignInfo.endAt': 'funding.end', 'stats.goal': 'funding.target', 'hero.title': 'meta.name', 'hero.image': 'content.heroUrl',
  'share.url': 'meta.slug', 'donate.boxAllowOther': 'donations.option'
};

/**
 * The management screen's controller (v4.61; formerly `initializeLegacyManagement`): the host context contract
 * (`window.HAMONYM_STUDIO_BRIDGE`, `window.HAMONYM_CONTEXT`), the inspector extras (`window.hamInspectorExtras`), the work
 * mode (management / design / publish), the frame and pages, and the hooks around the editor's saves and renders.
 */
@Injectable({ providedIn: 'root' })
export class ManagementControllerService implements OnDestroy {
  private readonly model = inject(ManagementModelService);
  private readonly view = inject(ManagementViewService);
  private readonly commands = inject(ManagementCommandsService);
  private readonly rewardPreview = inject(RewardPreviewService);
  private readonly calendar = inject(CalendarService);
  private readonly input = inject(ManagementInputService);
  private readonly inspector = inject(InspectorService);
  private readonly toolbar = inject(StudioToolbarService);
  private readonly previewSel = inject(PreviewSelectionService);
  private readonly editor = inject(EditorService);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);
  private readonly refs: ComponentRef<unknown>[] = [];
  private started = false;

  ngOnDestroy(): void { this.refs.splice(0).forEach(ref => ref.destroy()); }
  private get context(): any { return this.editor.context; }
  private updateMeters(): void { this.view.updateMeters(); }
  /** The old `drawManager`: every page is an Angular component (ManagementViewService.draw renders it). */
  private drawManager(): void { if (this.view.draw() === null) return; this.updateMeters(); }

  start(): void {
    if (this.started) return;
    this.started = true;
    const model = this.model, context = this.context, w = window as any;
    model.attach(context);
    // Host contract: data handled by the model, then the visible screens are redrawn.
    w.HAMONYM_STUDIO_BRIDGE = { setContext: (ctx: any = {}) => this.setHostContext(ctx) };
    if (w.HAMONYM_CONTEXT) this.setHostContext(w.HAMONYM_CONTEXT);
    model.installPreviewGuidance(() => this.updateMeters());
    // The management screen's extras at the top of the inspector (integration contract).
    w.hamInspectorExtras = () => {
      const out: any[] = [];
      if (context.selected() === 'hero') out.push({ k: 'heroName', checked: !!model.get('content.showHeroName') });
      if (context.selected() === 'footer' && model.nget('organizerType') === 'nonprofit') out.push({ k: 'nonprofit', linked: !!model.linkedOrganizerWebsite, site: String(model.nget('organizerWebsite') || ''), visible: model.nget('showNonprofitFooterLink') !== false });
      return out;
    };
    const { campaignSlug, campaignUrl } = model.lib as any;
    this.editor.persistHooks.before.push(() => { const s = context.readState(); s.content.share.url = campaignUrl(campaignSlug(s.content.share.url)); });
    this.editor.persistHooks.after.push(() => this.updateMeters());
    this.editor.renderHooks.before.push(() => model.ensureManagement());
    this.editor.renderHooks.after.push(() => { if (this.view.mode() === 'management') this.drawManager(); this.updateMeters(); });
    this.calendar.start(); // CalendarService + CalendarPortalComponent (#huCalendarPortal); the wizard reuses it
    this.mountShell();
    this.view.registerHost({ redraw: () => this.drawManager(), setMode: mode => this.setMode(mode), goEdit: id => this.goEdit(id), openStory: () => this.openStory() });
    this.input.start(); // data-hu-path / item / seg, amounts, installments, items, simple page, campaign kind
    this.editor.confirmField = (path, source) => model.confirmField(path, source);
    this.inspector.watch(e => this.inspectorEdit(e));
    // Clicking a rendered block in management mode brings back the inspector with the chosen block.
    this.previewSel.watch(e => { if (this.view.mode() === 'design') return; const t = e.target as Element; if (t.closest('[data-part]') && !t.closest('button,a,input,textarea,[contenteditable="true"]')) this.setMode('design'); });
    // Keep the title and readiness live after undo / redo, import, reset and save.
    this.toolbar.afterCommand(() => queueMicrotask(() => { model.ensureManagement(); this.updateMeters(); if (this.view.mode() === 'management') this.drawManager(); }));
    this.setMode('management');
    this.editor.persist();
    this.editor.renderPreview();
  }

  private setHostContext(ctx: any): void {
    this.model.applyHostContext(ctx);
    if (document.getElementById('huPage')) { this.editor.persist(); this.editor.renderPreview(); this.editor.renderInspector(); this.drawManager(); }
  }

  /** The work mode. The workspace's `hu-management-mode` class and the tab highlight are template bindings (v4.62). */
  setMode(next: ManagementMode): void {
    const view = this.view;
    view.mode.set(next);
    if (next === 'design') { this.editor.renderSections(); this.editor.renderInspector(); }
    view.activeTab.set(next === 'management' && view.page() === 'publish' ? 'publish' : next);
    if (next === 'management') this.drawManager();
    if (next === 'publish') {
      view.mode.set('management'); view.page.set('publish'); this.drawManager();
      view.activeTab.set('publish');
    }
    this.editor.crumbLabel.set(next === 'design' ? 'עורך חזותי ' : 'תצוגה חיה ');
    this.updateMeters();
  }
  private goEdit(component: string): void { this.view.closeDrawer(); this.setMode('design'); this.editor.select(component); }
  private openStory(): void { this.goEdit('story'); this.editor.openStory(); }
  /** "Edit the funding display" (fundraising page): design mode on the stats block. */
  openDesignExposure(event: Event): void { event.preventDefault(); event.stopPropagation(); this.setMode('design'); this.editor.select('stats'); }

  /** `hamonym:open-component-editor` (integration event): design mode before the editor selects the block. */
  onOpenComponentEditor(event: Event): void {
    if (!(event instanceof CustomEvent) || !event.detail) return;
    const id = String(event.detail.id || ''); if (!id) return;
    try { this.setMode('design'); event.detail.handled = this.view.mode() === 'design'; }
    catch (error) { event.detail.handled = false; event.detail.error = String(error); console.error('[HAMONYM] Contextual component initialization failed', id, error); }
  }
  /** `hamonym:request-design-mode`: the editor asks for design mode. */
  onRequestDesignMode(event: Event): void {
    if (this.view.mode() !== 'design') this.setMode('design');
    if (event instanceof CustomEvent && event.detail) event.detail.handled = this.view.mode() === 'design';
  }

  /** An Inspector edit (before it is applied): readiness evidence, and a manager typed in the inspector becomes custom. */
  private inspectorEdit(e: Event): void {
    const el = e.target as any, model = this.model, path = el.dataset?.scope + '.' + el.dataset?.field;
    if (el.dataset?.field) { const target = INSPECTOR_EVIDENCE[path]; if (target) model.confirmField(target); }
    if (el.dataset?.dbKey === 'amount' || el.dataset?.dbSetting === 'boxAllowOther') model.confirmField('donations.option');
    if (el.matches?.('[data-db-add],[data-db-remove],[data-db-kind]')) model.confirmField('donations.option');
    if (el.matches?.('[data-category-pick]')) model.confirmField('meta.category');
    if (el.id === 'heroImageUpload') model.confirmField('content.heroUrl');
    if (e.type === 'input' && el.matches?.('[data-scope="campaignInfo"][data-field="manager"]')) {
      const s = this.context.readState();
      if (s.management.managerSource !== 'custom' && model.linkedSessionManager && el.value !== model.linkedSessionManager.name) s.content.campaignInfo.photo = '';
      s.management.managerSource = 'custom';
    }
  }

  private mountShell(): void {
    const workspace = document.querySelector('.workspace');
    if (!workspace) throw new Error('Management requires the studio workspace');
    const aside = document.createElement('aside');
    workspace.prepend(aside);
    this.mount(ManagementShellComponent, aside);
    const overlay = document.createElement('div');
    document.body.append(studioAdopt(overlay));
    this.mount(ReadinessDrawerComponent, overlay);
    this.commands.start();
    this.rewardPreview.start();
  }
  private mount<T>(component: Type<T>, host: Element): void {
    const ref = createComponent(component, { environmentInjector: this.injector, hostElement: host });
    this.appRef.attachView(ref.hostView);
    ref.changeDetectorRef.detectChanges();
    this.refs.push(ref);
  }
}
