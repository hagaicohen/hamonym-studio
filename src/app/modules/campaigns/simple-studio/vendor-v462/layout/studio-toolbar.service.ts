import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { CampaignStateService } from '../core/campaign-state.service';
import { blankCampaign, ensureComponentDefaults } from '../core/campaign-defaults';
import { StoryBuilderService } from '../story-builder/story-builder.service';
import { CampaignExportService } from '../persistence/campaign-export.service';
import { MediaMigrationService } from '../media/media-migration.service';
import { CampaignWizardEngineService } from '../wizard/campaign-wizard-engine.service';
import { EditorService } from '../core/editor.service';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Device = 'mobile' | 'desktop';
export type SaveState = 'idle' | 'saving' | 'saved' | 'failed';
export type LayoutChoice = 'panorama' | 'heroCard';

const SAVE_ICONS: Record<SaveState, string[]> = {
  idle: ['M5 3h12l4 4v14H3V3h2Z', 'M7 3v7h10V3M7 21v-8h10v8'],
  saving: ['M12 3a9 9 0 1 0 9 9'],
  saved: ['M5 12.5 10 17l9-10'],
  failed: ['M12 8v5m0 4h.01']
};
const SAVE_INFO: Record<SaveState, string> = { idle: 'שמור שינויים', saving: 'שומר שינויים…', saved: 'נשמר בדפדפן', failed: 'השמירה נכשלה' };

/**
 * The Studio toolbar's commands and state (v4.60): device, save button feedback, undo / redo, save, import / export,
 * reset, demos, the layout menu and the template modal. The toolbar components and AppComponent's template bind to it;
 * the logic is the core's former `.onclick` handlers and `SaveToolbarService`, moved.
 */
@Injectable({ providedIn: 'root' })
export class StudioToolbarService implements OnDestroy {
  private readonly state = inject(CampaignStateService);
  private readonly builder = inject(StoryBuilderService);
  private readonly exporter = inject(CampaignExportService);
  private readonly migration = inject(MediaMigrationService);
  private readonly wizard = inject(CampaignWizardEngineService);
  private readonly editor = inject(EditorService);
  /** The editor's device. */
  readonly device = this.editor.device;
  /** The `#saveBtn` feedback (formerly SaveToolbarService). */
  readonly saveState = signal<SaveState>('idle');
  /** The layout dropdown (v209) and the template modal. */
  readonly layoutOpen = signal(false);
  readonly modalOpen = signal(false);
  readonly saveIcons = SAVE_ICONS;
  readonly saveInfo = SAVE_INFO;
  /** Called after undo, redo, import, reset and save (the management screen's meters and page). */
  private readonly after: (() => void)[] = [];
  importInput: HTMLInputElement | null = null;
  private timer?: ReturnType<typeof setTimeout>;
  private epoch = 0;

  /** Save feedback starts with the UI controllers (where SaveToolbarService started): earlier saves show nothing. */
  start(): void { this.state.saveShown.push(message => this.onSaveShown(message)); this.started.set(true); }
  readonly started = signal(false);
  afterCommand(fn: () => void): void { this.after.push(fn); }
  private get h() { return this.editor; }
  private done(): void { for (const fn of this.after) fn(); }
  ngOnDestroy(): void { if (this.timer) clearTimeout(this.timer); }

  // ---- device, highlight, story block ----
  setDevice(device: Device): void { this.h.setDevice(device); }
  setHighlight(on: boolean): void { this.h.setHighlight(on); }
  addStoryBlock(): void { this.h.addBlock('text'); this.h.toast('בלוק חדש נוסף לסיפור'); }

  // ---- save button feedback (each save shown in #saveStatus: saving, then saved / failed, then idle) ----
  onSaveShown(message: string): void {
    // A platform-managed local recovery write is not a confirmed server save.
    if (window.hamAngularDraftStorage?.shouldSaveRemote && message.includes('בדפדפן')) return;
    const failed = /נכשלה|שגיא|מלא|זמני|לא נשמר/.test(message.trim());
    const current = ++this.epoch;
    if (this.timer) clearTimeout(this.timer);
    this.saveState.set('saving');
    this.timer = setTimeout(() => {
      if (current !== this.epoch) return;
      this.saveState.set(failed ? 'failed' : 'saved');
      if (!failed) this.timer = setTimeout(() => { if (this.epoch === current) this.saveState.set('idle'); }, 1100);
    }, 330);
  }

  // ---- commands ----
  restore(direction: 'undo' | 'redo'): void {
    if (this.state.restore(direction)) { this.state.persist(); this.h.render(); if (this.builder.isOpen) this.builder.redraw(); this.state.syncUndo(); }
    this.done();
  }
  save(): void { window.hamAngularDraftStorage?.requestRemoteSave?.(); this.saveState.set('saving'); this.state.persist(); this.h.toast('הגרסה נשמרה בדפדפן זה'); this.done(); }
  async exportJson(): Promise<void> {
    let portable: unknown;
    try { portable = await this.migration.portableCopy(); } catch (error: any) { this.h.toast('גיבוי נכשל: ' + error.message); return; }
    try { this.exporter.download(portable); this.h.toast('קובץ JSON יוצא בהצלחה'); } catch (error: any) { this.h.toast('גיבוי נכשל: ' + error.message); }
  }
  /** Opens the file picker (the hidden `#importFile`). */
  pickImport(): void { this.importInput?.click(); this.done(); }
  async importFile(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0]; if (!file) return;
    try { const parsed = JSON.parse(await file.text()); this.state.importDocument(parsed); this.h.toast('הקמפיין נטען בהצלחה'); }
    catch (err: any) { this.h.toast('שגיאה בטעינת JSON: ' + err.message); }
    input.value = '';
  }
  loadDemo(kind: 'donation' | 'race'): void {
    this.state.change(() => this.h.seedDemo(kind));
    this.h.select('hero'); this.h.toast(kind === 'race' ? 'קמפיין דמה מירוץ נטען. הגדרות המקצים בניהול ותוכן.' : 'קמפיין דמה רגיל נטען.');
  }
  openPublic(download = false): void { this.exporter.openStandalone(download); }

  /** Full reset in place (no reload): a blank campaign, a new history, then the wizard from its welcome step. */
  reset(): void {
    const oldWizard = document.getElementById('hwWizard');
    const oldCanvas = document.getElementById('canvas');
    const originalStage = document.querySelector('main.stage');
    if (oldCanvas && originalStage && oldCanvas.parentElement !== originalStage) originalStage.insertBefore(oldCanvas, originalStage.querySelector('.stage-foot') || null);
    if (oldWizard) oldWizard.remove();
    document.body.classList.remove('hw-wizard-active');
    this.resetToBlank();
    const m = this.state.current['management'] as any;
    m.entryWizard = { step: -1, status: 'draft', version: 2 };
    m.funding = { start: '', duration: 'ongoing', model: 'flexible', matching: false, matchingFactor: 2, matchingCap: 50000 };
    m.donations = { suggestedAmounts: true, monthlyEnabled: true, monthlyPeriod: 'until-cancel', monthlyCount: 12, installments: true, maxInstallments: 6, installmentOptions: [1, 2, 3, 4, 5, 6] };
    m.mobileHero = { enabled: false, title: '', subtitle: '' };
    m.access = { editors: '', allowEditorPublish: false };
    m.readinessTrackingV0111 = true; m.readinessEvidence = {};
    for (const key of ['rewards', 'races', 'sponsors', 'ambassadors', 'updates', 'donors', 'comments']) { m.modules[key] ||= {}; if (!Array.isArray(m.modules[key].items)) m.modules[key].items = []; }
    this.state.clearHistory();
    { const result = this.state.saveDraft(); if (!result.ok) console.warn('Reset draft could not be saved', result.message); result.pending?.then(r => { if (!r.ok) console.warn('Reset draft could not be saved', r.message); }); }
    this.wizard.open();
    this.done();
  }
  /** Clears the campaign's content, keeping the editor's component definitions. */
  private resetToBlank(): void {
    this.state.replace(blankCampaign());
    const doc = this.state.current as any;
    ensureComponentDefaults(doc);
    const c = doc.content;
    c.hero.title = ''; c.hero.subtitle = ''; c.hero.tag = ''; c.hero.image = ''; c.hero.video = ''; c.hero.videoPoster = ''; c.hero.orgLogo = ''; c.hero.slides = [];
    c.title.title = ''; c.title.subtitle = ''; c.title.description = '';
    c.campaignInfo.manager = ''; c.campaignInfo.role = ''; c.campaignInfo.photo = ''; c.campaignInfo.location = ''; c.campaignInfo.category = ''; c.campaignInfo.subcategory = ''; c.campaignInfo.endAt = '';
    c.story.blocks = []; c.story.heading = '';
    c.stats.goal = 0; c.stats.raised = 0; c.stats.donors = 0; c.stats.days = 0;
    c.updates.title = ''; c.updates.text = ''; c.share.url = ''; c.share.message = ''; c.footer.title = ''; c.footer.subtitle = '';
    c.rewards.items = [];
    c.donate.boxAmounts = [];
    doc.management ||= {}; doc.management.modules ||= {};
    for (const key of ['donors', 'ambassadors', 'updates', 'comments', 'sponsors', 'races']) { doc.management.modules[key] ||= {}; doc.management.modules[key].items = []; }
    c.hero.showOrgLogo = false; c.hero.logoBelowText = false;
    for (const key of ['donors', 'ambassadors', 'updates', 'comments', 'sponsors', 'races']) { doc.visible[key] = true; doc.management.modules[key].items = []; }
    delete doc.management.demoFixtureSeedV0190;
    doc.management.entryWizard = { step: -1, status: 'draft', version: 2 };
    doc.management.readinessTrackingV0111 = true;
    doc.management.readinessEvidence = {};
    doc.management.suppressPreviewGuidanceAfterReset = true;
    doc.management.name = '';
    doc.management.mobileHero = { enabled: false, title: '', subtitle: '' };
  }

  // ---- layout: the toolbar's dropdown, or the template modal when the dropdown is hidden (simple donation layout) ----
  /** A simple donation page (the template button is hidden). */
  simple(): boolean { return (this.state.peek() as any)?.management?.campaignKind === 'simple'; }
  isDonation(): boolean { return !!document.querySelector('#preview.layout-donation'); }
  layoutSelected(): LayoutChoice { return (this.state.current as any).management?.heroStatsCard?.enabled ? 'heroCard' : 'panorama'; }
  applyLayout(choice: LayoutChoice): void {
    const doc = this.state.current as any;
    this.state.change(() => { doc.template = 'panorama'; doc.management ||= {}; doc.management.fullCampaignTemplate = 'panorama'; doc.management.heroStatsCard ||= {}; doc.management.heroStatsCard.enabled = choice === 'heroCard'; doc.management.heroStatsCard.sidebarStyled = false; });
    this.h.toast(choice === 'heroCard' ? 'כרטיס נתוני הגיוס הועבר ל־Hero' : 'נתוני הגיוס הוחזרו לסיידבר');
  }
  openTemplates(layoutMenuVisible: boolean): void {
    if (layoutMenuVisible) { this.layoutOpen.set(true); return; }
    if ((this.state.current as any).management?.campaignKind === 'simple') return;
    this.modalOpen.set(true);
  }
  /** The modal's three choices and which one the campaign uses. */
  readonly modalChoices: ['panorama' | 'sidebarCard' | 'heroCard', string, string][] = [['panorama', '▤', 'פריסה רגילה'], ['sidebarCard', '▥', 'כרטיס בסיידבר'], ['heroCard', '▣', 'כרטיס על ה־Hero']];
  chosen(id: string): boolean {
    const cfg = (this.state.current as any).management?.heroStatsCard || {};
    return id === 'heroCard' ? !!cfg.enabled : id === 'sidebarCard' ? !cfg.enabled && !!cfg.sidebarStyled : !cfg.enabled && !cfg.sidebarStyled;
  }
  chooseTemplate(id: string): void {
    const doc = this.state.current as any;
    this.state.change(() => { doc.template = 'panorama'; doc.management ||= {}; doc.management.fullCampaignTemplate = 'panorama'; doc.management.heroStatsCard ||= {}; doc.management.heroStatsCard.enabled = id === 'heroCard'; doc.management.heroStatsCard.sidebarStyled = id === 'sidebarCard'; });
    this.modalOpen.set(false);
    this.h.toast('מיקום נתוני הגיוס עודכן — התוכן נשמר');
  }
}
