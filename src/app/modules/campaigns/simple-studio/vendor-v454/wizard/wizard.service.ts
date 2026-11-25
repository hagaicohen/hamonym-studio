import { Injectable, inject, signal } from '@angular/core';
import { MediaStoreService } from '../media/media-store.service';
import { ImageProcessorService } from '../media/image-processor.service';
import { MediaDomPatchService } from '../media/media-dom-patch.service';
import { MediaKind } from '../media/media.types';
import {
  CampaignKind, Category, Device, EntryWizardState, Reward, STEP_PARTS, StoryNode, UploadTarget,
  WizardCampaign, WizardCheck, WizardContext, WizardReward, WizardStoryImage
} from './wizard.types';

const NEW_REWARD = (): Reward => ({ name: '', amount: 180, description: '', image: '', recommended: false, stockEnabled: false, quantity: 0 });
const SLUG_VALID = /^[\p{L}\p{N}][\p{L}\p{N}-]{1,68}[\p{L}\p{N}]$/u;

export const htmlToText = (s: string | undefined): string => {
  const d = document.createElement('div');
  d.innerHTML = s || '';
  return (d.textContent || '').trim();
};

/**
 * First-run campaign wizard: steps, validation and every write to the
 * campaign state. The UI is WizardComponent and its step components.
 *
 * `display()` bumps `renderToken`, which re-creates the current step's
 * view from state (the same "redraw the step" semantics as the original).
 * Ordinary typing does not re-create the view.
 */
@Injectable({ providedIn: 'root' })
export class WizardService {
  private readonly store = inject(MediaStoreService);
  private readonly processor = inject(ImageProcessorService);
  private readonly mediaPatch = inject(MediaDomPatchService);

  private ctx!: WizardContext;
  private wiz!: EntryWizardState;
  private busy = false;
  private expanded = new Set<number>();

  readonly step = signal(-1);
  readonly renderToken = signal(0);
  readonly warning = signal('');
  readonly device = signal<Device>('mobile');
  /** Bumped after state changes that the preview-pane controls depend on. */
  readonly previewToken = signal(0);
  readonly uploading = signal<string | null>(null);

  attach(context: WizardContext): void { this.ctx = context; }
  get context(): WizardContext { return this.ctx; }
  state(): WizardCampaign { return this.ctx.readState(); }

  // ---------------------------------------------------------------- lifecycle

  /**
   * Runs the one-time draft migrations and tells whether the wizard should
   * open (false once the campaign wizard was completed).
   */
  prepare(): boolean {
    const s = this.state();
    s.management ||= {} as WizardCampaign['management'];
    const wiz = s.management.entryWizard || (s.management.entryWizard = { step: -1, status: 'draft', version: 1 });
    this.wiz = wiz;
    if (wiz.status !== 'complete' && !wiz.mobileCoreNavMigrationV0193) {
      const core = ['donors', 'ambassadors', 'updates'];
      if (core.every(id => s.visible[id] === false) && core.every(id => !(s.management.modules?.[id]?.items || []).length)) {
        core.forEach(id => s.visible[id] = true);
      }
      wiz.mobileCoreNavMigrationV0193 = true;
    }
    if (wiz.status === 'complete') return false;
    if ((wiz.version || 1) < 2) this.clearFactoryDemo();
    // Only switch the factory default on an unfinished wizard.
    if (!this.ctx.templates[s.template]) s.template = 'panorama';
    if (wiz.step === -1 && wiz.version === 2 && s.template === 'classic' && !s.content.hero.title && !s.content.title.description) s.template = 'panorama';
    if (wiz.noEndDate === undefined) wiz.noEndDate = !s.content.campaignInfo.endAt;
    if (!s.content.campaignInfo.endAt) this.setManagement('funding.duration', 'ongoing');
    this.step.set(Number.isInteger(wiz.step) ? Math.max(-1, Math.min(5, wiz.step)) : -1);
    this.expanded = new Set();
    this.warning.set('');
    this.ctx.setDevice('mobile');
    this.device.set('mobile');
    return true;
  }

  /** Static sample values are not campaign data: clear unchanged ones once. */
  private clearFactoryDemo(): void {
    const s = this.state(), c = s.content, demo = this.ctx.defaults().content, wiz = this.wiz;
    const reset = <T extends object, K extends keyof T>(obj: T, key: K, example: T[K], empty: T[K]) => { if (obj?.[key] === example) obj[key] = empty; };
    reset(c.hero, 'title', demo.hero.title, '');
    reset(c.hero, 'subtitle', demo.hero.subtitle, '');
    reset(c.title, 'title', demo.title.title, '');
    reset(c.title, 'subtitle', demo.title.subtitle, '');
    reset(c.title, 'description', demo.title.description, '');
    reset(c.campaignInfo, 'manager', demo.campaignInfo.manager, '');
    reset(c.campaignInfo, 'location', demo.campaignInfo.location, '');
    reset(c.campaignInfo, 'role', demo.campaignInfo.role, '');
    reset(c.stats, 'raised', demo.stats.raised, 0);
    reset(c.stats, 'donors', demo.stats.donors, 0);
    reset(c.stats, 'goal', demo.stats.goal, 0);
    const demoRewards = demo.rewards.items || [];
    if (c.rewards?.items?.length === demoRewards.length && c.rewards.items.every((r, i) => r.name === demoRewards[i].name && r.amount === demoRewards[i].amount)) {
      c.rewards.items = [];
      s.visible['rewards'] = false;
    }
    // Registration routes are an opt-in module for a new campaign.
    if (!s.management?.entryWizard?.version || wiz.version === 1) {
      if (!(s.management?.modules?.['races']?.items || []).length) s.visible['races'] = false;
    }
    if (!c.campaignInfo.location) c.campaignInfo.showLocation = false;
    if (!c.campaignInfo.manager) c.campaignInfo.showManager = false;
    if (!c.campaignInfo.category || (c.campaignInfo.category === 'קהילה וחברה' && !c.hero.title)) c.campaignInfo.category = '';
    if (!c.campaignInfo.category) c.campaignInfo.showCategory = false;
    if (!c.campaignInfo.endAt || (c.stats.raised === 0 && !c.hero.title && c.campaignInfo.endAt === demo.campaignInfo.endAt)) c.campaignInfo.endAt = '';
    if (!c.campaignInfo.endAt) c.campaignInfo.showCountdown = false;
    // Comments stay hidden on a blank campaign until the manager enables them.
    if (!c.hero.title && !c.title.description && !(s.management?.modules?.['comments']?.items || []).length) s.visible['comments'] = false;
    wiz.version = 2;
  }

  private setManagement(path: string, value: unknown): void {
    const keys = path.split('.');
    let obj = this.state().management as Record<string, unknown>;
    for (const key of keys.slice(0, -1)) obj = (obj[key] ??= {}) as Record<string, unknown>;
    obj[keys[keys.length - 1]] = value;
  }

  // ------------------------------------------------------------------ queries

  isSimple(): boolean { return this.state().management?.campaignKind === 'simple'; }
  kind(): CampaignKind { return this.state().management?.campaignKind || 'donation'; }
  wizardState(): EntryWizardState { return this.wiz; }

  slugFromUrl(): string {
    const value = String(this.state().content.share?.url || '');
    const last = value.split(/[?#]/)[0].split('/').filter(Boolean).pop() || '';
    try { return decodeURIComponent(last); } catch { return last; }
  }
  displaySlug(): string { const slug = this.slugFromUrl(); return slug === 'demo' ? '' : slug; }
  cleanSlug(value: string): string { return String(value || '').trim().replace(/\s+/g, '-'); }
  private slugValid(value: string): boolean { return SLUG_VALID.test(value) && !value.includes('--') && value !== 'demo'; }

  /** Keeps the explicit category id so a valid choice survives a reload. */
  chosenCategory(): Category | null {
    const ci = this.state().content.campaignInfo;
    const byLabel = this.ctx.categoryByLabel(String(ci.category || '').trim());
    if (byLabel) return byLabel;
    const byId = this.ctx.campaignCategoryCatalog.find(x => x.id === this.wiz.categoryId);
    if (byId) { ci.category = byId.label; return byId; }
    return null;
  }

  isRealHero(): boolean {
    const h = this.state().content.hero;
    if (h.mediaType === 'video') return /^(https?:\/\/)/i.test(h.video || '');
    return !!(h.image && h.image !== this.ctx.img && h.image !== this.ctx.defaults().content.hero.image);
  }

  private storyHasText(items: StoryNode[] = this.state().content.story.blocks || []): boolean {
    return items.some(n => (n.type === 'text' && htmlToText(n.value).length >= 15) || this.storyHasText(n.children || []));
  }

  checks(): WizardCheck[] {
    const c = this.state().content;
    const hasAmount = c.donate.boxAmounts.some(a => a.kind !== 'recurring' && Number(a.amount) > 0);
    if (this.isSimple()) return [
      { label: 'כותרת לדף התרומה (לפחות 3 תווים)', ok: String(c.hero.title || '').trim().length >= 3, step: 0 },
      { label: 'כתובת הדף (לפחות 3 תווים)', ok: this.slugValid(this.slugFromUrl()), step: 0 },
      { label: 'לפחות סכום תרומה אחד', ok: hasAmount, step: 3 }
    ];
    return [
      { label: 'שם קמפיין ותיאור קצר', ok: c.hero.title.trim().length >= 3 && c.title.description.trim().length >= 12, step: 0 },
      { label: 'כתובת הקמפיין (לפחות 3 תווים, אותיות, מספרים ומקפים)', ok: this.slugValid(this.slugFromUrl()), step: 0 },
      { label: 'קטגוריה ראשית', ok: !!this.chosenCategory(), step: 0 },
      { label: 'תמונת Hero או קישור וידאו', ok: this.isRealHero(), step: 1 },
      { label: 'סיפור הפרויקט', ok: this.storyHasText(), step: 2 },
      { label: 'יעד גיוס וסכומי תרומה', ok: Number(c.stats.goal) > 0 && hasAmount, step: 3 },
      { label: 'שם מנהל הקמפיין', ok: c.campaignInfo.manager.trim().length >= 2, step: 4 }
    ];
  }

  stepOK(n: number): boolean { return !this.checks().some(x => x.step === n && !x.ok); }

  mediaSrc(ref: string | undefined): string {
    const value = String(ref || '');
    return this.store.src(value) || (value.startsWith('hamonymmedia:') ? '' : value);
  }

  suggestedAmounts(): number[] {
    return (this.state().content.donate.boxAmounts || []).filter(x => x.kind !== 'recurring').map(x => Number(x.amount)).filter(x => x > 0).slice(0, 6);
  }

  rewards(): WizardReward[] {
    return (this.state().content.rewards.items || []).map((r, i) => ({
      name: String(r.name || ''), amount: Number(r.amount) || 0, description: String(r.description || ''),
      image: String(r.image || ''), imageSrc: this.store.src(String(r.image || '')) || '',
      recommended: !!r.recommended, stockEnabled: !!r.stockEnabled, quantity: Number(r.quantity) || 0, expanded: this.expanded.has(i)
    }));
  }

  organizationLogo(): string {
    const m = this.state().management;
    return m?.organizer?.logoUrl || m?.organization?.logoUrl || m?.organizerLogo || '';
  }

  // -------------------------------------------------------------------- story

  storyTextNode(): StoryNode {
    const story = this.state().content.story;
    const blocks = story.blocks || (story.blocks = []);
    const find = (items: StoryNode[]): StoryNode | null => {
      for (const item of items) { if (item.type === 'text') return item; const nested = find(item.children || []); if (nested) return nested; }
      return null;
    };
    let node = find(blocks);
    if (!node) { node = this.ctx.sbNew('text'); node.value = ''; blocks.unshift(node); }
    return node;
  }

  storyHtml(): string { return String(this.storyTextNode().value || '').replace(/&(?:amp;)?nbsp;/gi, ' '); }

  private storyImageEntries(items: StoryNode[] = this.state().content.story.blocks || [], path: number[] = []): Array<{ node: StoryNode; path: number[] }> {
    const found: Array<{ node: StoryNode; path: number[] }> = [];
    items.forEach((node, index) => {
      const location = [...path, index];
      if (node.type === 'image') found.push({ node, path: location });
      if (Array.isArray(node.children)) found.push(...this.storyImageEntries(node.children, location));
    });
    return found;
  }

  storyImages(): WizardStoryImage[] {
    return this.storyImageEntries().map(({ node, path }, i) => ({ src: this.mediaSrc(node.value), path: path.join('.'), alt: 'תמונה ' + (i + 1) + ' מתוך הסיפור' }));
  }

  setStoryHtml(html: string): void {
    this.storyTextNode().value = html.replace(/&(?:amp;)?nbsp;/gi, ' ');
    this.saveDraft();
    this.refreshPreview();
  }

  /** Removes an image from the story only (the stored media stays). */
  removeStoryImage(location: string): void {
    const indices = String(location || '').split('.').map(Number);
    if (!indices.length || indices.some(i => !Number.isInteger(i) || i < 0)) return;
    let items = this.state().content.story.blocks;
    for (const index of indices.slice(0, -1)) {
      const parent = items?.[index];
      if (!parent || !Array.isArray(parent.children)) return;
      items = parent.children;
    }
    const last = indices[indices.length - 1];
    if (!Array.isArray(items) || items[last]?.type !== 'image') return;
    items.splice(last, 1);
    this.saveDraft();
    this.display();
  }

  private addStoryImage(ref: string): void {
    const story = this.state().content.story;
    const blocks = story.blocks || (story.blocks = []);
    const photo = this.ctx.sbNew('image');
    photo.value = ref;
    let lead = blocks.find(n => n.type === 'container' && n.storyWizardLeadV0170);
    if (lead) { lead.children ||= []; if (!lead.children.some(n => n.type === 'image')) { lead.children.push(photo); return; } }
    // Only the wizard creates the two-column starter (text + photo).
    const text = this.storyTextNode();
    const index = blocks.indexOf(text);
    if (index >= 0 && !blocks.some(n => n.type === 'container' && n.storyWizardLeadV0170)) {
      lead = this.ctx.sbNew('container');
      lead.layout = '2';
      lead.mobileLayout = 'stack';
      lead.storyWizardLeadV0170 = true;
      blocks.splice(index, 1, lead);
      lead.children = [text, photo];
    } else blocks.push(photo);
    this.state().management.storyLeadMigrationV0170 = true;
  }

  /** Opens the full Story Builder on the same story blocks. */
  openStoryBuilder(): void {
    this.saveDraft();
    document.body.classList.add('hw-story-builder-open');
    const back = document.getElementById('sbBack');
    if (back) { back.setAttribute('aria-label', 'חזרה לאשף'); const text = back.querySelector('span:last-child'); if (text) text.textContent = 'חזרה לאשף'; }
    this.ctx.sbOpen();
  }

  /** Story Builder closed: restore its back label and redraw from the same blocks. */
  storyBuilderClosed(): void {
    if (!document.body.classList.contains('hw-story-builder-open')) return;
    document.body.classList.remove('hw-story-builder-open');
    const back = document.getElementById('sbBack');
    if (back) { back.setAttribute('aria-label', 'חזרה לעורך הקמפיין'); const text = back.querySelector('span:last-child'); if (text) text.textContent = 'חזרה לעורך הקמפיין'; }
    queueMicrotask(() => { this.saveDraft(); this.display(); });
  }

  // --------------------------------------------------------------- rendering

  saveDraft(): void {
    this.wiz.step = this.step();
    this.state().management.entryWizard = this.wiz;
    this.ctx.persist();
  }

  /** Re-creates the current step view from state. */
  display(): void {
    this.saveDraft();
    this.renderToken.update(t => t + 1);
    this.refreshPreview();
  }

  refreshPreview(): void {
    const mount = document.getElementById('hwPreviewMount');
    const before = mount?.querySelector('#preview');
    const mountY = mount?.scrollTop || 0, pageY = before?.scrollTop || 0;
    try { this.ctx.renderPreview(); this.mediaPatch.patch(); } catch (e) { console.error('Wizard preview error', e); }
    if (mount) mount.scrollTop = mountY;
    const after = mount?.querySelector('#preview');
    if (after) after.scrollTop = pageY;
    this.device.set(this.ctx.device());
    this.previewToken.update(t => t + 1);
  }

  setWarning(message: string): void { this.warning.set(message); }

  /** A warning reflects the current form status, not a previous attempt. */
  clearResolvedWarning(): void { if (this.warning() && this.stepOK(this.step())) this.warning.set(''); }

  // --------------------------------------------------------------- navigation

  /** @returns true when the wizard finished. */
  next(): boolean {
    const step = this.step();
    if (step === -1) { this.step.set(0); this.display(); return false; }
    if (step < 5 && !this.stepOK(step)) {
      const item = this.checks().find(x => x.step === step && !x.ok);
      this.setWarning(`כדי להמשיך צריך להשלים: ${item?.label || 'שדות חובה'}`);
      return false;
    }
    if (step === 5) {
      if (this.checks().some(x => !x.ok)) { this.setWarning('עדיין יש פרטים חיוניים שלא הושלמו. בחרו ״עריכה״ לצידם.'); return false; }
      this.finish();
      return true;
    }
    this.step.set(this.isSimple() ? (step === 0 ? 3 : 5) : step + 1);
    this.display();
    return false;
  }

  back(): void {
    const step = this.step();
    if (step < 0) return;
    this.step.set(this.isSimple() ? (step === 5 ? 3 : step === 3 ? 0 : -1) : Math.max(-1, step - 1));
    this.display();
  }

  goTo(step: number): void { this.step.set(step); this.display(); }

  resetToWelcome(): void { this.step.set(-1); this.wiz.step = -1; this.wiz.status = 'draft'; this.display(); }

  /** Marks the wizard complete; the component then leaves the wizard UI. */
  finish(asExistingDemo = false): void {
    this.ctx.sbMigrateLegacyWizardLead?.();
    const wiz = this.wiz;
    wiz.status = 'complete';
    wiz.step = 5;
    this.step.set(5);
    wiz.completedAt = new Date().toISOString();
    if (asExistingDemo) { wiz.editExistingDemo = true; wiz.demoCompleteAt = wiz.completedAt; }
    this.saveDraft();
  }

  afterFinish(asExistingDemo: boolean): void {
    try { document.querySelector<HTMLElement>('[data-hu-mode="management"]')?.click(); this.ctx.renderPreview(); }
    catch (e) { console.warn('Studio transition', e); this.ctx.render(); }
    this.ctx.toast(asExistingDemo ? 'קמפיין הדמה נפתח לעריכה כקמפיין קיים — השלמת נתונים 100%' : 'הקמפיין נוצר כטיוטה. אפשר להמשיך לעצב ב־Simple Studio.');
  }

  /** "Edit as existing campaign" after loading demo data. @returns true when finished. */
  openDemoAsExisting(): boolean {
    const m = this.state().management;
    if (m?.demoFixtureSeedV0190 !== true) { this.setWarning('טען תחילה נתוני דמה.'); return false; }
    m.funding ||= {};
    m.funding.duration = 'ongoing';
    const missing = this.checks().find(x => !x.ok);
    if (missing) { this.setWarning('לא ניתן לפתוח קמפיין מלא: יש להשלים ' + missing.label); return false; }
    this.finish(true);
    return true;
  }

  demoLoaded(): boolean { return this.state().management?.demoFixtureSeedV0190 === true; }

  // ------------------------------------------------------------------ writes

  writeField(key: string, val: string): void {
    const s = this.state(), c = s.content;
    switch (key) {
      case 'hwCampaignSlug': c.share.url = 'https://hamonym.com/campaign/' + encodeURIComponent(this.cleanSlug(val) || 'demo'); break;
      case 'campaignName': c.hero.title = val; break;
      case 'campaignDescription': c.title.description = val; break;
      case 'hwStoryHeading': c.title.title = val; break;
      case 'hwStorySubtitle': c.title.subtitle = val; c.title.showSubtitleMobile = !!val.trim(); break;
      case 'hwSubcategory':
        c.campaignInfo.subcategory = val;
        c.campaignInfo.showCategory = !!(c.campaignInfo.category && c.campaignInfo.category !== 'אחר');
        if (c.campaignInfo.showCategory) s.visible['campaignInfo'] = true;
        this.ctx.confirmField('meta.category', 'wizard');
        break;
      case 'hwLocation': c.campaignInfo.location = val; c.campaignInfo.showLocation = !!val.trim(); break;
      case 'hwHeroSubtitle': c.hero.subtitle = val; break;
      case 'hwVideo': c.hero.video = val; break;
      case 'hwGoal': c.stats.goal = Math.max(0, this.ctx.huReadAmount(val)); break;
      case 'hwEnd': c.campaignInfo.endAt = val ? val + 'T23:59' : ''; c.campaignInfo.showCountdown = !!val; break;
      case 'hwManager': c.campaignInfo.manager = val; c.campaignInfo.showManager = !!val.trim(); s.management.managerSource = 'custom'; break;
      case 'hwManagerRole': c.campaignInfo.role = val; break;
      case 'hwAmounts': {
        const amounts = val.split(/[,，;\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0).slice(0, 6);
        const recurring = c.donate.boxAmounts.filter(x => x.kind === 'recurring');
        c.donate.boxAmounts = [...amounts.map((amount, i) => ({ id: 'w' + i, amount, kind: 'once', months: 1, label: '' })), ...recurring];
        break;
      }
    }
    this.saveDraft();
    this.refreshPreview();
  }

  changeKind(kind: CampaignKind): void {
    const s = this.state(), m = s.management;
    const previous = m.campaignKind || 'donation';
    if (previous === kind) return;
    if (kind === 'simple') {
      if (previous !== 'simple') m.fullCampaignTemplate = s.template;
      s.template = 'donation';
    } else if (previous === 'simple' && m.fullCampaignTemplate) {
      s.template = ['heroOverlay', 'split'].includes(m.fullCampaignTemplate) ? 'panorama' : m.fullCampaignTemplate;
    }
    m.campaignKind = kind;
    const step = this.step();
    if (kind === 'simple' && ![0, 3, 5].includes(step)) this.step.set(0);
    if (previous === 'simple' && kind !== 'simple' && step === 3) this.step.set(0);
    if (kind === 'race') {
      s.visible['races'] = true;
      const races = m.modules?.['races'];
      if (races) { races.enabled = true; races.visible = true; }
    } else {
      // Race configuration and participants are kept; only public registration hides.
      s.visible['races'] = false;
    }
    this.display();
  }

  setHeroMedia(type: 'image' | 'video'): void { this.state().content.hero.mediaType = type; this.display(); }
  setHeroText(show: boolean): void { const h = this.state().content.hero; h.showText = show; h.showTextMobile = show; this.saveDraft(); this.refreshPreview(); }

  setSimpleIdentity(mode: 'avatar' | 'logo'): void {
    if (!this.isSimple()) return;
    const m = this.state().management;
    m.simpleDonation ||= {};
    m.simpleDonation.identityMode = mode;
    this.display();
  }

  setSimpleHero(show: boolean): void {
    const s = this.state(), sd = (s.management.simpleDonation ||= {});
    sd.showHeroImage = show;
    if (sd.identityMode === 'hero') sd.identityMode = s.content.hero?.orgLogo ? 'logo' : 'avatar';
    this.display();
  }

  setAllowOther(allow: boolean): void { this.state().content.donate.boxAllowOther = allow; this.saveDraft(); this.refreshPreview(); }

  setMonthly(enabled: boolean): void {
    const m = this.state().management;
    (m.donations ||= {}).monthlyEnabled = enabled;
    (m.simpleDonation ||= {}).showFrequency = enabled;
    if (!enabled) this.ctx.hamSimpleFlowState.frequency = 'once';
    this.display();
  }

  setMonthlyCount(value: string): void {
    const d = (this.state().management.donations ||= {});
    const count = Math.max(0, Number(value) || 0);
    d.monthlyPeriod = count ? 'fixed' : 'until-cancel';
    d.monthlyCount = count || 12;
    this.saveDraft();
  }

  setNoEndDate(none: boolean): void {
    const c = this.state().content;
    this.wiz.noEndDate = none;
    if (none) { c.campaignInfo.endAt = ''; c.campaignInfo.showCountdown = false; c.stats.showDays = false; }
    this.setManagement('funding.duration', c.campaignInfo.endAt ? 'one-time' : 'ongoing');
    this.display();
  }

  /** Starts with an end date one month from today. */
  addEndDate(): void {
    const c = this.state().content;
    this.wiz.noEndDate = false;
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    c.campaignInfo.endAt = iso + 'T23:59';
    c.campaignInfo.showCountdown = true;
    c.stats.showDays = true;
    this.setManagement('funding.duration', 'one-time');
    this.display();
  }

  /** The shared calendar (management engine) wrote funding.end; sync the wizard flags. */
  endDatePicked(): void {
    const c = this.state().content;
    const hasDate = !!c.campaignInfo.endAt;
    this.wiz.noEndDate = !hasDate;
    c.campaignInfo.showCountdown = hasDate;
    c.stats.showDays = hasDate;
    this.setManagement('funding.duration', hasDate ? 'one-time' : 'ongoing');
    this.display();
  }

  hasEndDate(): boolean { return this.wiz.noEndDate === false || !!this.state().content.campaignInfo.endAt; }

  formatAmount(value: unknown): string { return this.ctx.huFormatAmount(value); }

  setLayout(layout: 'panorama' | 'heroCard'): void {
    const s = this.state();
    if (s.management?.campaignKind === 'simple') return;
    s.template = 'panorama';
    s.management.fullCampaignTemplate = 'panorama';
    (s.management.heroStatsCard ||= {}).enabled = layout === 'heroCard';
    this.display();
  }

  setDevice(device: Device): void { this.ctx.setDevice(device); this.refreshPreview(); }

  removeLogo(): void { const h = this.state().content.hero; h.orgLogo = ''; h.showOrgLogo = false; this.display(); }
  restoreLogo(): void {
    const source = this.organizationLogo();
    if (!source) return;
    const h = this.state().content.hero;
    h.orgLogo = source;
    h.showOrgLogo = true;
    this.display();
  }

  removeSlide(index: number): void {
    this.state().content.hero.slides?.splice(index, 1);
    this.ctx.resetHeroSlideKey();
    this.display();
  }

  // ------------------------------------------------------------------ rewards

  private rewardList(): Reward[] { return (this.state().content.rewards.items ||= []); }

  addReward(): void {
    this.rewardList().push(NEW_REWARD());
    this.state().visible['rewards'] = true;
    this.expanded.add(this.rewardList().length - 1);
    this.display();
  }

  removeReward(i: number): void {
    const list = this.rewardList();
    if (!Number.isInteger(i) || i < 0 || i >= list.length) return;
    list.splice(i, 1);
    this.expanded = new Set([...this.expanded].filter(n => n !== i).map(n => n > i ? n - 1 : n));
    if (!list.length) this.state().visible['rewards'] = false;
    this.display();
  }

  toggleReward(i: number): void {
    if (!Number.isInteger(i) || i < 0 || i >= this.rewardList().length) return;
    if (this.expanded.has(i)) this.expanded.delete(i); else this.expanded.add(i);
    this.display();
  }

  editReward(i: number, key: keyof Reward, value: unknown): void {
    const item = this.rewardList()[i];
    if (!item) return;
    item[key] = key === 'quantity' ? Math.max(0, Math.floor(Number(value) || 0)) : value;
    this.saveDraft();
    this.refreshPreview();
  }

  // ------------------------------------------------------------------- upload

  async upload(input: HTMLInputElement, target: UploadTarget): Promise<void> {
    const file = input.files?.[0];
    if (this.busy || !file) return;
    this.busy = true;
    this.uploading.set(typeof target === 'object' ? 'reward' + target.reward : target);
    try {
      const kind: MediaKind = target === 'story' ? 'story' : target === 'manager' ? 'avatar' : typeof target === 'object' ? 'card' : 'hero';
      const ref = await this.store.save(await this.processor.process(file, kind));
      const s = this.state(), c = s.content;
      if (target === 'slide') {
        c.hero.slides ||= [];
        if (c.hero.slides.length >= 5) throw Error('מותרות עד חמש תמונות נוספות');
        c.hero.slides.push(ref);
        this.ctx.resetHeroSlideKey();
      } else if (target === 'story') this.addStoryImage(ref);
      else if (typeof target === 'object') {
        if (!this.rewardList()[target.reward]) throw Error('התשורה כבר אינה קיימת');
        this.rewardList()[target.reward].image = ref;
      } else if (target === 'manager') { c.campaignInfo.photo = ref; s.management.managerSource = 'custom'; }
      else if (target === 'logo') { c.hero.orgLogo = ref; c.hero.showOrgLogo = true; }
      else { c.hero.image = ref; c.hero.mediaType = 'image'; }
      this.display();
      this.mediaPatch.patch();
    } catch (err) {
      console.error('Wizard photo upload', err);
      this.setWarning(String((err as Error)?.message || 'לא ניתן להעלות תמונה'));
    } finally {
      this.busy = false;
      this.uploading.set(null);
      input.value = '';
    }
  }

  // --------------------------------------------------------------- categories

  categoryCatalog(): Category[] { return this.ctx.campaignCategoryCatalog; }
  categoryIcon(icon: string): string { return this.ctx.solidCategoryIcon(icon, 17); }

  chooseCategory(id: string, sub?: string): void {
    if (this.ctx.chooseCampaignCategory(id, sub)) { this.saveDraft(); this.refreshPreview(); }
  }

  /** Valid subcategories of the chosen category; clears a stale subcategory. */
  subcategories(): string[] {
    const ci = this.state().content.campaignInfo;
    const values = this.ctx.categoryByLabel(ci.category || '')?.sub || [];
    if (ci.subcategory && !values.includes(ci.subcategory)) ci.subcategory = '';
    return values;
  }

  stepParts = STEP_PARTS;
}
