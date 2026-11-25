import { CardData, money, asText } from '../cards/card-format';
import { hexColor6, luminance } from '../../core/campaign-style';

/**
 * The public page's structure (v4.47): which section goes where, in what order, and how the panorama,
 * slider and "donation" templates arrange them on a desktop. Until v4.46 the core wrote the page
 * flat and then rearranged its DOM (`hamApplyCampaignLayout`, `hamApplyHeroStatsCard`, the race card
 * move, the sidebar rewards list). Those steps are kept here as the same operations, in the same
 * order, on a small node tree; PublicPageComponent renders the result, so the page is written once,
 * already in place.
 *
 * Pure: reads the campaign and the editor state it is given.
 */

/** The blocks of `.campaign-body`, in the markup's order. */
export const BODY_PARTS = ['title', 'stats', 'donationBox', 'donate', 'share', 'nav', 'story', 'ambassadors', 'races', 'donors', 'updates', 'rewards', 'comments'] as const;

export type NodeType = 'part' | 'box' | 'panel' | 'mount' | 'mtabs' | 'mpanel' | 'shortcut'
  /** v4.49: a race's participants list, its panorama panel and its section when the page has no tabs; the mobile action bar. */
  | 'participants' | 'ppanel' | 'psection' | 'actionbar'
  /** v4.51: the simple donation page's form, before the action bar, and after it once a step moved it there. */
  | 'simple' | 'simpleEnd';

/** A node of the page: a part (its component), a plain element around parts, a panorama tab panel, the stats card's mount. */
export class PageNode {
  parent: PageNode | null = null;
  readonly children: PageNode[] = [];
  readonly classes: string[] = [];
  /** Inline style, in the order it was set: property → [value, important]. */
  readonly styles = new Map<string, [string, boolean]>();
  hidden = false;
  /** `aria-label` of a box. */
  label: string | null = null;
  /** A panel's empty-state text (the block is not on the page). */
  empty: string | null = null;
  /** A panel's view switcher (`.ham-view-switcher`). */
  view = false;
  /** data-* attributes of the stats card's mount. */
  data: Record<string, string> = {};

  constructor(readonly t: NodeType, readonly id: string, readonly tag: 'div' | 'aside' | 'section' = 'div', classes: string[] = []) { this.classes.push(...classes); }

  /** The class attribute of a box, a panel or a mount; a part's extra classes. */
  get cls(): string { return this.classes.join(' '); }
  /** The inline style attribute (`null` when none). */
  get style(): string | null {
    if (!this.styles.size) return null;
    return [...this.styles].map(([p, [v, imp]]) => `${p}: ${v}${imp ? ' !important' : ''};`).join(' ');
  }
  setStyle(prop: string, value: string, important = false): void { this.styles.set(prop, [value, important]); }
  addClass(c: string): void { if (!this.classes.includes(c)) this.classes.push(c); }

  /** A direct child part (`:scope > [data-part="id"]`). */
  child(id: string): PageNode | null { return this.children.find(n => n.t === 'part' && n.id === id) || null; }
  /** A child box with this class (`:scope > .cls`). */
  box(cls: string): PageNode | null { return this.children.find(n => n.t === 'box' && n.classes.includes(cls)) || null; }
  /** A part anywhere below (`[data-part="id"]`, document order). */
  find(id: string): PageNode | null {
    for (const n of this.children) {
      if (n.t === 'part' && n.id === id) return n;
      const deep = n.find(id);
      if (deep) return deep;
    }
    return null;
  }

  append(...nodes: PageNode[]): void { for (const n of nodes) { n.detach(); n.parent = this; this.children.push(n); } }
  prepend(...nodes: PageNode[]): void { nodes.forEach(n => n.detach()); nodes.forEach(n => n.parent = this); this.children.unshift(...nodes); }
  /** `parent.insertBefore(node, ref)`; a null ref appends. */
  insertBefore(node: PageNode, ref: PageNode | null): void {
    if (!ref) { this.append(node); return; }
    node.detach();
    node.parent = this;
    this.children.splice(this.children.indexOf(ref), 0, node);
  }
  before(node: PageNode): void { this.parent?.insertBefore(node, this); }
  after(node: PageNode): void { const p = this.parent; if (p) p.insertBefore(node, p.children[p.children.indexOf(this) + 1] || null); }
  get nextSibling(): PageNode | null { const p = this.parent; return p ? p.children[p.children.indexOf(this) + 1] || null : null; }
  private detach(): void {
    const p = this.parent;
    if (!p) return;
    p.children.splice(p.children.indexOf(this), 1);
    this.parent = null;
  }
}

/** A panorama tab (desktop): the core's `hamPanoramaActiveTab` decides the current one. */
export interface PanoramaTab { id: string; name: string; current: boolean; /** A tab without its icon (rewards in the main column but hidden on a desktop: old finalizer). */ plain?: boolean;
  /** v4.49: a race's participants tab, as RaceFlowService added it (no icon, role, state or inline style). */ bare?: boolean; }
/** A mobile tab (old finalizer `buildMobile`). */
export interface MobileTab { id: string; name: string; current: boolean; }

/** The Hero stats card's content (old `hamApplyHeroStatsCard`, from the stats values). */
export interface StatsCard {
  /** `text` (also the "icons" preset), `classic` or `dashboard`. */
  textOnly: boolean;
  textIcons: boolean;
  caption: string;
  raised: string;
  goal: string;
  /** The meter's label (`63%`), or '' when the stats have no progress bar. */
  meter: string;
  /** The bar's width (`63%`) and the label after it. */
  barWidth: string;
  barLabel: string;
  donors: string | null;
  days: string | null;
  /** The text preset's metrics: value, label, icon. */
  text: { value: string; label: string; icon: string }[];
}

export interface LayoutInput {
  campaign: CardData;
  device: string;
  /** The block is shown on this device (core `deviceAllowed`). */
  allowed(id: string): boolean;
  /** The blocks' order on this device (core `orderFor`). */
  order: string[];
  /** The panorama's current tab (core `hamPanoramaActiveTab`); `setTab` resets it. */
  tab(): string;
  setTab(id: string): void;
  /** The mobile tab (PublicPartsService.mobileTab); `setMobileTab` resets it. */
  mobileTab(): string;
  setMobileTab(id: string): void;
  /** The rewards block shows at least one reward tile (its toolbar's search leaves some). */
  rewardTiles: boolean;
  /** The Hero stats card's shapes and meters (core `hamCardDesignLibrary`, read only for the card). */
  design(): { shapes: string[]; meters: string[] };
  /** The sponsors block and the sticky donate button are on the page. */
  sponsors: boolean;
  sticky: boolean;
}

const TAB_NAMES: Record<string, string> = { story: 'סיפור', rewards: 'תשורות', donors: 'תורמים', ambassadors: 'שגרירים', comments: 'תגובות', updates: 'עדכונים', sponsors: 'נותני חסות' };
const EMPTY: Record<string, string> = { rewards: 'אין תשורות להצגה', donors: 'עדיין אין תורמים להצגה', ambassadors: 'עדיין אין שגרירים להצגה', comments: 'עדיין אין תגובות להצגה', updates: 'עדיין אין עדכונים להצגה', sponsors: 'עדיין אין נותני חסות להצגה' };
/** Header menu labels → the block they open (desktop panorama and slider). */
export const HEADER_TARGETS: Record<string, string> = { 'הסיפור': 'story', 'תורמים': 'donors', 'שגרירים': 'ambassadors', 'עדכונים': 'updates', 'תגובות': 'comments', 'תשורות': 'rewards' };
/** Header links the desktop panorama and slider always offer. */
export const HEADER_LINKS: [string, string][] = [['הסיפור', 'story'], ['תורמים', 'donors'], ['שגרירים', 'ambassadors'], ['עדכונים', 'updates']];

/** The page's structure and the flags its parts read. */
export class PageLayout {
  /** The page's top-level nodes (header … sticky button), `.campaign-body` among them. */
  readonly top: PageNode[] = [];
  /** Desktop panorama: the Hero's logo follows the text (`.ham-logo-following-text`). */
  logoBelowText = false;
  /** Desktop panorama: the campaign manager, as the first fact of the details strip. */
  managerFact: string | null = null;
  /** Desktop panorama: the share block is a strip of actions under the details. */
  shareStrip = false;
  /** Desktop panorama: the navigation is the tab bar (story links dropped, panels inside). */
  tabs: PanoramaTab[] | null = null;
  /** Desktop panorama: the story is the article card under the tabs. */
  storyArticle = false;
  /** Desktop panorama: the rewards are the sidebar's list. */
  sidebarRewards = false;
  /** Desktop panorama: the header's links open blocks, and its call-to-action buttons. */
  headerActions = false;
  /** The Hero stats card (stats moved into it). */
  statsCard: StatsCard | null = null;
  /** The mobile tab bar (`.ham-mobile-tabs`), when the page has its tabs. */
  mobileTabs: MobileTab[] | null = null;
  /** v4.49: the panorama tab bar's columns, once a race's participants tab is in it (old RaceFlowService). */
  barColumns: number | null = null;
}

/** The mobile tabs, in their order (old finalizer). */
const MOBILE_TABS: [string, string][] = [['story', 'סיפור'], ['rewards', 'תשורות'], ['donors', 'תורמים'], ['ambassadors', 'שגרירים'], ['comments', 'תגובות'], ['updates', 'עדכונים']];
/** The panorama tab bar's inline style (old finalizer `buildPanorama`). */
export const PANORAMA_BAR_STYLE = 'display: flex !important; flex-direction: row !important; flex-wrap: nowrap !important; white-space: nowrap !important; overflow-x: auto !important; overflow-y: hidden !important; scrollbar-width: thin !important; direction: rtl !important; visibility: visible !important; opacity: 1 !important; width: 100% !important; max-width: 100% !important; min-width: 0px !important; box-sizing: border-box !important; height: auto !important; min-height: 50px !important; max-height: none !important; pointer-events: auto !important; transform: none !important; transition: none !important; position: relative !important;';
export const PANORAMA_TAB_STYLE = 'flex: 0 0 auto !important; white-space: nowrap !important;';

/** The page for this campaign and device. */
export function pageLayout(input: LayoutInput): PageLayout {
  const layout = new PageLayout();
  const c = input.campaign, kind = c['management']?.campaignKind || 'donation';
  const part = (id: string) => new PageNode('part', id);
  const page = new PageNode('box', 'page');
  if (input.allowed('header')) page.append(part('header'));
  if (input.allowed('hero')) page.append(part('hero'));
  if (input.allowed('campaignInfo')) page.append(part('campaignInfo'));
  const body = new PageNode('box', 'body', 'div', ['campaign-body']);
  page.append(body);
  // The blocks, in the device's order (old core: the order loop of renderPreview, then reorderMainPreview).
  const present = BODY_PARTS.filter(id => input.allowed(id) && (id !== 'races' || kind === 'race'));
  const seq: string[] = [];
  for (const id of input.order) if ((present as readonly string[]).includes(id) && !seq.includes(id)) seq.push(id);
  for (const id of present) if (!seq.includes(id)) seq.push(id);
  seq.forEach((id, i) => { const n = part(id); n.setStyle('order', String(i), true); body.append(n); });
  if (input.sponsors && input.allowed('sponsors')) page.append(part('sponsors'));
  if (input.allowed('footer')) page.append(part('footer'));
  if (input.sticky) page.append(part('sticky'));

  if (kind !== 'simple') {
    campaignLayout(input, layout, page, body);
    heroStatsCard(input, layout, page);
    raceCard(input, page);
  }
  // v4.48: what the render finalizer did to the written page (CampaignRenderFinalizerService and the core's
  // `hamSyncRewardsShortcut`), in its order: the panorama's tabs, the mobile tabs, the rewards shortcut.
  panoramaTabs(input, layout, page);
  mobileTabs(input, layout, body);
  rewardsShortcut(input, page);
  // v4.49: what the render hook (`hamFinishCampaignRender`) did next, in its order: the race's participants
  // (RaceFlowService), then the header's controls (CampaignHeaderService: the header part, and the mobile
  // action bar, last in #preview).
  raceParticipants(input, layout, page);
  // The simple donation page's form (old `hamRenderSimpleDonation`: appended to #preview by the core's layout,
  // before the header hook added the action bar; a step wrote it again at the end, after the action bar).
  const simple = kind === 'simple';
  if (simple) page.append(new PageNode('simple', 'simple'));
  if (input.device === 'mobile' && page.child('header')) {
    page.append(new PageNode('actionbar', 'actionbar'));
    if (simple) page.append(new PageNode('simpleEnd', 'simple'));
  }
  layout.top.push(...page.children);
  return layout;
}

/** Old core `hamApplyCampaignLayout` (not the simple donation page, still rendered by the core). */
function campaignLayout(input: LayoutInput, layout: PageLayout, page: PageNode, body: PageNode): void {
  const c = input.campaign, template = c['template'];
  if (input.device !== 'desktop') return; // The split layout stacks naturally on mobile.
  if (template === 'donation') {
    const focus = new PageNode('box', 'focus', 'div', ['ham-simple-donation-focus']);
    for (const id of ['title', 'stats', 'donationBox', 'donate']) { const s = body.child(id); if (s) focus.append(s); }
    body.prepend(focus); // Story and optional components follow below.
    return;
  }
  if (!['panorama', 'slider'].includes(template)) return;
  // A shared two-column structure.
  const donation = body.child('donationBox'), story = body.child('story');
  if (donation && story) {
    const columns = new PageNode('box', 'columns', 'div', ['ham-desktop-content-columns']);
    const side = new PageNode('box', 'side', 'aside', ['ham-desktop-donation-column']);
    const narrative = new PageNode('box', 'narrative', 'div', ['ham-desktop-story-column']);
    story.before(columns); side.append(donation); narrative.append(story); columns.append(side, narrative);
  }
  if (template === 'panorama') {
    // (The panorama's CSS variables on #preview are still set by the core.)
    const hero = c['content'].hero;
    const heroPart = page.child('hero');
    const heroText = !!heroPart && hero.showText !== false;
    const logo = !!heroPart && !!hero.showOrgLogo && !!hero.orgLogo;
    if (heroText && logo && hero.logoBelowText === true) layout.logoBelowText = true;
    const info = page.child('campaignInfo');
    const ci = c['content'].campaignInfo;
    if (info && ci.showManager !== false && String(ci.manager || '').trim()) layout.managerFact = 'מנהל הקמפיין: ' + asText(ci.manager);
    const share = body.child('share');
    if (share) {
      share.addClass('ham-panorama-share-strip');
      layout.shareStrip = true;
      if (info) info.after(share); else heroPart?.after(share);
    }
    const columns = body.box('ham-desktop-content-columns');
    const side = columns?.box('ham-desktop-donation-column');
    const narrative = columns?.box('ham-desktop-story-column');
    if (side && narrative) {
      const stats = body.child('stats');
      if (stats) side.prepend(stats);
      // Title, story, navigation and optional blocks all belong to the right-hand column.
      const title = body.child('title');
      if (title) narrative.prepend(title);
      for (const id of ['nav', 'donors', 'ambassadors', 'updates', 'comments', 'sponsors']) { const el = body.child(id); if (el) narrative.append(el); }
      // Rewards and race registration form one choice group under the donation box.
      const offers = ['rewards', 'races'].map(id => body.child(id)).filter((n): n is PageNode => !!n);
      if (offers.length) {
        const group = new PageNode('box', 'offers', 'section', ['ham-sidebar-offers']);
        group.label = 'תשורות והרשמה למירוצים';
        for (const el of offers) {
          if (el.id === 'rewards' && c['content'].rewards.desktopPosition === 'main') { narrative.append(el); continue; }
          group.append(el);
          // The desktop sidebar is a fixed, vertical reward list (no search, sort, views or carousel).
          if (el.id === 'rewards') layout.sidebarRewards = true;
        }
        // The sidebar's order: data card, donation box, then rewards (including races).
        if (group.children.length) side.insertBefore(group, donation!.nextSibling);
      }
      // The navigation is the panorama's tab bar (always on the page: `deviceAllowed('nav')` on a desktop panorama).
      const nav = narrative.child('nav');
      const storySection = narrative.child('story');
      if (storySection) {
        storySection.addClass('ham-story-article');
        layout.storyArticle = true;
        narrative.prepend(storySection);
        storySection.setStyle('order', '0', true);
      }
      if (nav) {
        nav.addClass('ham-panorama-tabs');
        const rw = c['content'].rewards;
        const rewardsInMain = rw?.desktopPosition === 'main' && c['visible']?.rewards !== false && input.allowed('rewards') && (rw?.items || []).length > 0;
        // A single-content tab interface: rewards are the tab right after the story.
        const order = ['story', ...(rewardsInMain ? ['rewards'] : []), 'ambassadors', 'donors', 'comments', 'updates'];
        if (!order.includes(input.tab())) input.setTab('story');
        const active = order.includes(input.tab()) ? input.tab() : 'story';
        layout.tabs = order.map(id => ({ id, name: TAB_NAMES[id], current: active === id }));
        for (const id of [...(rewardsInMain ? ['rewards'] : []), 'donors', 'ambassadors', 'comments', 'updates', 'sponsors']) {
          const panel = new PageNode('panel', id);
          panel.hidden = active !== id;
          const existing = narrative.child(id);
          if (existing) panel.append(existing); else panel.empty = EMPTY[id];
          // Rewards and the collections render their own header and view controls.
          panel.view = !['donors', 'ambassadors', 'comments', 'updates', 'rewards'].includes(id);
          nav.append(panel);
        }
        nav.styles.delete('order');
        narrative.prepend(nav);
        if (storySection) storySection.hidden = active !== 'story';
        const campaignTitle = narrative.child('title');
        if (campaignTitle) campaignTitle.hidden = active !== 'story';
      }
      // The header and the donation box already offer the donation: the bottom button is secondary.
      body.child('donate')?.addClass('ham-panorama-secondary-cta');
    }
    // The header's links open the blocks, and its call-to-action buttons.
    if (page.child('header')) layout.headerActions = true;
  }
}

/** Old core `hamApplyHeroStatsCard`: the stats section moves into a card on the Hero or above the donation box. */
function heroStatsCard(input: LayoutInput, layout: PageLayout, page: PageNode): void {
  const c = input.campaign, settings = c['management']?.heroStatsCard;
  const allowed = input.device === 'desktop' && c['template'] === 'panorama';
  const sidebar = allowed && !settings?.enabled && settings?.sidebarStyled === true;
  const enabled = allowed && (!!settings?.enabled || sidebar);
  if (!enabled) return;
  const wrap = page.child('hero');
  const side = findBox(page, 'ham-desktop-donation-column');
  const original = side?.child('stats');
  if (!side || !original || (!sidebar && !wrap)) return;
  const race = c['management']?.campaignKind === 'race';
  // In a race, the race registration card is first in the sidebar.
  const registration = side.find('races');
  if (registration && race) side.prepend(registration);
  const preset = ['classic', 'dashboard', 'text', 'icons'].includes(settings.preset) ? (settings.preset === 'icons' ? 'text' : settings.preset) : 'classic';
  const mount = new PageNode('mount', 'statsCard', 'div', ['ham-hero-stats-mount', ...(sidebar ? ['ham-sidebar-stats-mount'] : [])]);
  if (settings.preset === 'icons') mount.addClass('ham-cdl-icons-variant');
  const textIcons = settings.preset === 'icons' || settings.textIcons === true;
  const design = input.design();
  mount.data = {
    shape: design.shapes.includes(settings.shape) ? settings.shape : 'square',
    preset,
    textTiles: settings.textTiles === 'unified' ? 'unified' : 'separate',
    textIcons: String(textIcons),
    bold: String(settings.bold === true),
    glass: String(settings.glass === true),
    meter: design.meters.includes(settings.meter) ? settings.meter : (preset === 'dashboard' ? 'circular' : 'horizontal')
  };
  const bg = hexColor6(settings.bg, '#ffffff'), text = hexColor6(settings.text, '#223e35');
  mount.setStyle('--hsc-bg', bg);
  mount.setStyle('--hsc-text', luminance(bg) < 105 && luminance(text) < 135 ? '#f4fff9' : text);
  mount.setStyle('--hsc-border', hexColor6(settings.border, '#ffffff'));
  mount.setStyle('--hsc-accent', hexColor6(settings.accent, c['theme'].primary || '#246f65'));
  mount.setStyle('--hsc-tile-bg', hexColor6(settings.tileBg, '#eaf4f0'));
  mount.setStyle('--hsc-tile-text', hexColor6(settings.tileText, '#223e35'));
  mount.setStyle('--hsc-opacity', String(Math.max(20, Math.min(100, Number(settings.opacity) || 94)) / 100));
  mount.setStyle('--hsc-radius', Math.max(0, Math.min(38, settings.radius == null ? 22 : (Number(settings.radius) || 0))) + 'px');
  mount.setStyle('--hsc-shadow', settings.shadow === false ? 'none' : '0 12px 35px rgba(12,37,30,.22)');
  mount.setStyle('--hsc-glass', settings.glass ? 'blur(12px) saturate(1.2)' : 'none');
  mount.setStyle('--hsc-border-width', settings.borderEnabled === true ? Math.max(0, Math.min(5, Number(settings.borderWidth ?? 1))) + 'px' : '0px');
  mount.append(original);
  const card = statsCard(c, preset === 'text', textIcons);
  if (card.meter) mount.setStyle('--ham-meter-percent', card.barWidth);
  original.addClass('ham-cdl-card');
  layout.statsCard = card;
  if (sidebar) {
    // Right before the donation box.
    const donationBox = side.child('donationBox');
    if (donationBox) side.insertBefore(mount, donationBox); else side.prepend(mount);
    mount.setStyle('order', '-20', true);
    for (const property of ['top', 'bottom', 'left', 'right']) mount.setStyle(property, 'auto', true);
    mount.setStyle('position', 'relative', true);
    mount.setStyle('transform', 'none', true);
    mount.setStyle('margin', '0', true);
  } else wrap!.append(mount);
  if (race) {
    const card = side.find('races');
    if (card) side.prepend(card);
  }
}

/** Old core (renderPreview): the race registration card is the first action of the panorama's sidebar. */
function raceCard(input: LayoutInput, page: PageNode): void {
  const c = input.campaign;
  if (c['management']?.campaignKind !== 'race' || input.device !== 'desktop' || c['template'] !== 'panorama') return;
  const side = findBox(page, 'ham-desktop-donation-column');
  const card = page.find('races');
  if (!side || !card) return;
  // Right after the stats (or their sidebar card), or first when the stats moved to the Hero.
  const stats = side.child('stats') || side.children.find(n => n.t === 'mount' && n.classes.includes('ham-sidebar-stats-mount')) || null;
  if (stats) { stats.after(card); stats.setStyle('order', '-1', true); }
  else side.prepend(card);
  card.setStyle('order', '0', true);
  // (The Hero card's vertical position is measured by the core after the page is written.)
}

/**
 * Old finalizer `buildPanorama` (desktop panorama, after the page was written): the desktop bar leaves
 * `.nav-component` (the wrapper and the mobile menu are dropped) and is the tab bar; the tabs are the
 * canonical list (rewards also when the saved placement is the main column, even if the block is hidden
 * on a desktop: a tab without icon or panel); the story article moves into the navigation, after the panels.
 */
function panoramaTabs(input: LayoutInput, layout: PageLayout, page: PageNode): void {
  const c = input.campaign;
  if (input.device !== 'desktop' || c['template'] !== 'panorama') return;
  const column = findBox(page, 'ham-desktop-story-column');
  const nav = column?.child('nav');
  if (!column || !nav || !layout.tabs) return;
  const rw = c['content'].rewards;
  const placed = rw?.desktopPosition === 'main' && c['visible']?.rewards !== false && (rw?.items || []).length > 0;
  const inMain = placed || layout.tabs.some(t => t.id === 'rewards');
  const ids = ['story', ...(inMain ? ['rewards'] : []), 'ambassadors', 'donors', 'comments', 'updates'];
  const selected = input.tab() || 'story';
  const active = ids.includes(selected) ? selected : 'story';
  const rendered = new Set(layout.tabs.map(t => t.id));
  layout.tabs = ids.map(id => ({ id, name: TAB_NAMES[id], current: id === active, ...(rendered.has(id) ? {} : { plain: true }) }));
  for (const [p, v] of [['display', 'block'], ['visibility', 'visible'], ['opacity', '1'], ['height', 'auto'], ['max-height', 'none'], ['overflow', 'visible'], ['order', '-10']]) nav.setStyle(p, v, true);
  const title = column.child('title');
  if (title) title.hidden = active !== 'story';
  const article = column.child('story') || nav.child('story');
  if (article) { nav.append(article); article.hidden = active !== 'story'; }
  for (const panel of nav.children) if (panel.t === 'panel') panel.hidden = panel.id !== active;
}

/**
 * Old finalizer `buildMobile` (a phone, any campaign kind): the story and the collection blocks go into
 * tab panels (`.ham-mobile-content`, after the share block or before the story); the race block follows
 * the stats. Its rewards call-to-action was always removed again by the core's shortcut (not on a phone).
 */
function mobileTabs(input: LayoutInput, layout: PageLayout, body: PageNode): void {
  if (input.device !== 'mobile') return;
  const story = body.child('story');
  if (!story) return;
  const visible = MOBILE_TABS.filter(([id]) => id === 'rewards' ? !!body.child('rewards') && input.rewardTiles : !!body.child(id));
  // v4.55 (known bug 1): a race's participants tab (added by `raceParticipants`) stays the current tab across a render.
  const participants = input.campaign['management']?.campaignKind === 'race' && !!body.child('races') && input.mobileTab() === 'participants';
  if (!participants && !visible.some(([id]) => id === input.mobileTab())) input.setMobileTab('story');
  const current = input.mobileTab();
  const host = new PageNode('box', 'mobile', 'section', ['ham-mobile-content']);
  host.label = 'תוכן הקמפיין';
  layout.mobileTabs = visible.map(([id, name]) => ({ id, name, current: current === id }));
  host.append(new PageNode('mtabs', 'tabs'));
  const share = body.child('share');
  if (share) share.after(host); else story.before(host);
  for (const [id] of visible) {
    const panel = new PageNode('mpanel', id);
    panel.hidden = current !== id;
    panel.append(body.child(id)!);
    host.append(panel);
  }
  const races = body.child('races');
  if (races) {
    const stats = body.child('stats');
    if (stats) stats.after(races); else host.before(races);
  }
}

/**
 * The core's `hamSyncRewardsShortcut` (old, after the finalizer): on a desktop, when the rewards sit in the
 * main column, "לצפייה בתשורות" follows the donation box, in its container.
 */
function rewardsShortcut(input: LayoutInput, page: PageNode): void {
  const c = input.campaign, rw = c['content']?.rewards;
  const enabled = input.device === 'desktop' && rw?.desktopPosition === 'main' && c['visible']?.rewards !== false && input.allowed('rewards') && (rw?.items || []).length > 0;
  const donation = page.find('donationBox');
  if (enabled && donation) donation.after(new PageNode('shortcut', 'rewardsShortcut'));
}

/**
 * Old RaceFlowService (`installPublic`, after each render): a race campaign whose race block is on the page
 * lists its participants. On a phone, a tab and panel before the donors' (when the page has its tabs); on a
 * desktop panorama, a tab before the donors' and a panel (always hidden) at the end of the tab bar's section;
 * otherwise a section right after the race block. v4.55: on a phone the tabs' own check keeps the participants tab
 * (known bug 1); on a panorama a render still returns to the story, as for the old hook.
 */
function raceParticipants(input: LayoutInput, layout: PageLayout, page: PageNode): void {
  if (input.campaign['management']?.campaignKind !== 'race') return;
  const races = page.find('races');
  if (!races) return;
  const list = () => new PageNode('participants', 'participants');
  if (input.device === 'mobile') {
    const host = findBox(page, 'ham-mobile-content');
    if (!host || !layout.mobileTabs) return;
    const current = input.mobileTab() === 'participants';
    const tab: MobileTab = { id: 'participants', name: 'משתתפים', current };
    const at = layout.mobileTabs.findIndex(t => t.id === 'donors');
    if (at >= 0) layout.mobileTabs.splice(at, 0, tab); else layout.mobileTabs.push(tab);
    const panel = new PageNode('mpanel', 'participants');
    panel.hidden = !current;
    panel.append(list());
    host.insertBefore(panel, host.children.find(n => n.t === 'mpanel' && n.id === 'donors') || null);
    return;
  }
  const column = findBox(page, 'ham-desktop-story-column');
  const nav = column?.child('nav');
  if (!nav || !nav.classes.includes('ham-panorama-tabs') || !layout.tabs) {
    const section = new PageNode('psection', 'participants', 'section');
    section.append(list());
    races.after(section);
    return;
  }
  const tab: PanoramaTab = { id: 'participants', name: 'משתתפים', current: false, bare: true };
  const at = layout.tabs.findIndex(t => t.id === 'donors');
  if (at >= 0) layout.tabs.splice(at, 0, tab); else layout.tabs.push(tab);
  layout.barColumns = layout.tabs.length;
  const panel = new PageNode('ppanel', 'participants');
  panel.hidden = true;
  panel.append(list());
  nav.append(panel);
}

function findBox(root: PageNode, cls: string): PageNode | null {
  for (const n of root.children) {
    if (n.t === 'box' && n.classes.includes(cls)) return n;
    const deep = findBox(n, cls);
    if (deep) return deep;
  }
  return null;
}

/** The stats card's values, as the old code read them back from the rendered stats section. */
function statsCard(c: CardData, textOnly: boolean, textIcons: boolean): StatsCard {
  const s = c['content'].stats;
  const percent = s.goal ? Math.round(100 * s.raised / s.goal) : 0;
  const progress = s.showGoal !== false && s.showRaised !== false && s.showProgress !== false;
  const fill = Math.min(100, Math.max(0, percent));
  const meter = progress ? Math.round(fill) + '%' : '';
  const percentText = progress ? `${percent}% מהיעד` : '';
  const secondary = ((s.showDonors ? `${asText(s.donors ?? 0)} תורמים` : '') + (s.showDonors && s.showDays ? ' · ' : '') + (s.showDays ? `${asText(s.days)} ימים נותרו` : '')).trim();
  const donors = secondary.match(/([\d,]+)\s*תורמים/)?.[1] ?? null;
  const days = secondary.match(/([\d,]+)\s*ימים\s*נותרו/)?.[1] ?? null;
  const raised = s.showRaised ? money(s.raised) : '';
  const card: StatsCard = {
    textOnly, textIcons,
    caption: s.showRaised ? 'גויסו עד כה' : '',
    raised,
    goal: s.showGoal ? ('מתוך יעד של ' + money(s.goal)).trim() : '',
    meter,
    barWidth: fill + '%',
    barLabel: percentText || meter,
    donors, days,
    text: []
  };
  const percentageOnly = (percentText || meter).match(/[\d.,]+\s*%/)?.[0] || (percentText || meter);
  const metrics: [string | null, string][] = [[raised, 'גויסו עד כה'], [donors, 'תורמים'], [progress ? percentageOnly : '', 'מהיעד']];
  const text = metrics.filter(([value]) => value) as [string, string][];
  // The text preset also shows the campaign's end date (or the days left).
  const endAt = c['content']?.campaignInfo?.endAt;
  const end = endAt ? new Date(endAt) : null;
  const endLabel = end && Number.isFinite(end.getTime()) ? `${String(end.getDate()).padStart(2, '0')}.${String(end.getMonth() + 1).padStart(2, '0')}.${String(end.getFullYear()).slice(-2)}` : '';
  if (textOnly) text.push(endLabel ? [endLabel, 'תאריך סיום'] : [String(c['content']?.stats?.days ?? 0), 'ימים נותרו']);
  const icon = (label: string) => label === 'גויסו עד כה' ? 'raised' : label === 'תורמים' ? 'donors' : label === 'תאריך סיום' ? 'days' : 'percent';
  card.text = text.map(([value, label]) => ({ value, label, icon: icon(label) }));
  return card;
}
