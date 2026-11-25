// @ts-nocheck
/**
 * The Inspector's view (v4.54, milestone B): what `#fields` shows, as typed blocks instead of HTML strings.
 *
 * This is a port of the core's `renderInspector`, `hamRenderInspectorPane` and `fieldHtml` (and the markup helpers
 * they called): the same conditions in the same order, building `Block`s that `InspectorComponent` renders with the
 * shared field controls (`inspector/controls.ts`) and the bespoke panels (`inspector/panels.ts`). It reads the
 * campaign and the editor's state through `InspectorEnv`, and changes nothing.
 *
 * Known oddities kept as they were (the parity of the DOM is the contract):
 * - the visibility row is in both the content and the design tab;
 * - the regex the core ran on the rewards / ambassadors design markup (removing a "סוג תצוגה" / "תצוגת תשורות"
 *   select) never matched (those fields are choice buttons), so it is not ported;
 * - the simple campaign's Hero branch at the end of the pane was unreachable (the simple pane returns first).
 */
import { INSPECTOR_SCHEMA as schema } from './inspector-schema';

export interface InspectorEnv {
  state: any;
  selected: string;
  device: 'mobile' | 'desktop';
  cardSizeDevice: 'mobile' | 'desktop';
  dbEditScope: string;
  advancedOpen: boolean;
  categorySearch: string;
  categoryIconPickerOpen: boolean;
  palettes: Record<string, any>;
  navTargets: [string, string][];
  carouselModules: { scope: string; label: string; ordinary: string }[];
  cardSizeDefaults: any;
  cardSizeFor(scope: string, dev: string): any;
  presentationFor(scope: string, dev: string): any;
  dbStyleForDevice(d: any): any;
  simpleVisual(): any;
  categoryByLabel(label: string): any;
  catalog: any[];
  categoryIconName(ci: any): string;
  mediaSrc(ref: string): string;
  /** The management screen's extras at the top (`hu-inspector-extra`). */
  extras(): Extra[];
}

export type Extra =
  | { k: 'heroName'; checked: boolean }
  | { k: 'nonprofit'; linked: boolean; site: string; visible: boolean };

export interface Option { value: string; label: string; selected: boolean }
export interface FieldVM {
  key: string; label: string; type: string; scope: string;
  control: 'anchor' | 'info' | 'alignment' | 'slider' | 'toggle' | 'choice' | 'select' | 'textarea' | 'input';
  value: any; checked?: boolean; text?: string;
  options?: Option[];
  // input
  inputType?: string; money?: boolean; numberMin?: boolean; placeholder?: string; maxlength?: boolean;
  // slider
  min?: number; max?: number; step?: number; display?: number; unit?: string;
}
export type Block =
  | { k: 'field'; f: FieldVM }
  | { k: 'friendly'; primary: FieldVM[]; extra: FieldVM[] }
  | { k: 'typo'; scope: string; chosen: string }
  | { k: 'group'; label: string; open: boolean; fields: FieldVM[] }
  | { k: 'donorLayouts'; current: string }
  | { k: 'donorColumns'; mobile: number; desktop: number }
  | { k: 'layoutPicker'; scope: string; current: string; choices: [string, string, string][] }
  | { k: 'rewardPlacement'; position: string }
  | { k: 'cardSize'; panel: any }
  | { k: 'themePalettes'; palettes: [string, any][] }
  | { k: 'deviceVisibility'; value: string }
  | { k: 'navPlacement'; rows: { id: string; label: string; menu: boolean }[] }
  | { k: 'emojiPicker'; current: string }
  | { k: 'donateUpload'; hasIcon: boolean }
  | { k: 'donation'; d: any; scope: string }
  | { k: 'category'; c: any }
  | { k: 'managerUpload' }
  | { k: 'heroUploads' }
  | { k: 'slider'; photos: { src: string }[] }
  | { k: 'posterUpload' }
  | { k: 'logoUpload'; hasLogo: boolean }
  | { k: 'noDesign' }
  | { k: 'storyBlocks'; blocks: any[] }
  | { k: 'visibility'; id: string; checked: boolean }
  | { k: 'easy'; cover: any; extras: any; open: boolean; inner: Block[] }
  | { k: 'heroStats'; card: any }
  | { k: 'statsDemo'; fields: FieldVM[] }
  | { k: 'simpleDesign'; v: any };

export interface UnifiedVM {
  title: string; story: boolean; rewards: boolean; device: string;
  placement: Block | null; design: Block[]; content: Block[] | null;
}
export interface InspectorView {
  title: string; desc: string;
  /** The legacy tabs: hidden (`display:none`) or shown (''); the active tab when the pane set it, else null. */
  tabsDisplay: string; activeTab: string | null;
  extras: Extra[];
  /** Either the unified editor (intro + appearance + content) or a pane's blocks (stats, simple). */
  unified: UnifiedVM | null;
  blocks: Block[];
  /** The key of the disclosure memory (`selected:unified` or `selected:tab`). */
  panelKey: string;
}

const INSPECTOR_HINTS: Record<string, string> = {
  'hero.title': 'כאן יופיע שם הקמפיין',
  'hero.subtitle': 'כאן יופיע משפט קצר על מטרת הקמפיין',
  'title.title': 'כאן תופיע כותרת התיאור הקצר',
  'title.subtitle': 'כאן אפשר להוסיף כותרת משנה',
  'title.description': 'כאן ייכתב תיאור קצר של הקמפיין',
  'updates.title': 'כאן תופיע כותרת העדכון',
  'updates.text': 'כאן ייכתב תוכן העדכון',
  'rewards.intro': 'כאן אפשר להסביר בקצרה על התשורות',
  'footer.title': 'כאן תופיע כותרת הסיום',
  'footer.subtitle': 'כאן יופיע טקסט קצר לסיום הקמפיין'
};
const SELECT_NAMES: Record<string, string> = { center: 'מרכז', top: 'למעלה', bottom: 'למטה', left: 'שמאל', right: 'ימין' };

export function sliderUnit(key: string): string {
  return /(?:Weight|Count|Columns|Rows|Opacity|Percent|Speed|Scale|Order|Index|Duration|Delay|Ratio)$/.test(key) ? '' : ' px';
}
export function formatAmount(value: any): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  let digits = String(value).replace(/[₪,\s ‎‏]/g, '').replace(/[^0-9.]/g, '');
  if (!digits) return '';
  const dot = digits.indexOf('.');
  if (dot >= 0) digits = digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, '');
  let [integer, decimal] = digits.split('.');
  integer = (integer || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return integer + (dot >= 0 ? '.' + String(decimal || '').slice(0, 2) : '');
}
/** What a template attribute of the old markup showed for a value (`${v}`). */
const str = (v: any) => String(v);

/** `fieldHtml`: one schema row as a control. */
export function fieldVM([key, label, type, opts]: any[], obj: any, scope: string, env: InspectorEnv): FieldVM {
  const v = scope === 'hero' && key === 'textAnchor' && env.device === 'mobile' ? (obj.mobileTextAnchor || obj.textAnchor) : obj[key];
  const f: FieldVM = { key, label, type, scope, control: 'input', value: v };
  if (type === 'anchor') { f.control = 'anchor'; return f; }
  if (type === 'infoAlignment') { f.control = 'info'; return f; }
  if (type === 'alignment') { f.control = 'alignment'; return f; }
  if (type === 'slider') {
    const [rawMin, rawMax, rawStep] = Array.isArray(opts) ? opts : [];
    const min = Number.isFinite(Number(rawMin)) ? Number(rawMin) : 0;
    const max = Math.max(min + 1, Number.isFinite(Number(rawMax)) ? Number(rawMax) : 100);
    const step = Number(rawStep) > 0 ? Number(rawStep) : 1;
    const raw = (v === undefined || v === null || v === '') ? NaN : Number(v);
    const safe = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min;
    return { ...f, control: 'slider', min, max, step, display: Number(safe.toFixed(2)), unit: sliderUnit(key) };
  }
  if (type === 'boolean') return { ...f, control: 'toggle', checked: !!v };
  if (type === 'select' && ['layout', 'style', 'shape', 'mobileStyle', 'logoFit', 'font', 'textAlign'].includes(key) && Array.isArray(opts) && opts.length <= 5) {
    return { ...f, control: 'choice', options: opts.map(item => {
      const value = String(Array.isArray(item) ? item[0] : item), title = String(Array.isArray(item) ? item[1] : item);
      return { value, label: title, selected: value === v };
    }) };
  }
  if (type === 'select') {
    return { ...f, control: 'select', options: opts.map(x => {
      const value = Array.isArray(x) ? x[0] : x;
      return { value: str(value), label: Array.isArray(x) ? str(x[1]) : (SELECT_NAMES[x] || str(x)), selected: value === v };
    }) };
  }
  const hint = INSPECTOR_HINTS[scope + '.' + key];
  const money = type === 'number' && ((scope === 'stats' && ['raised', 'goal'].includes(key)) || (scope === 'donors' && ['badgeThreshold1', 'badgeThreshold2'].includes(key)));
  const maxlength = scope === 'title' && key === 'description';
  if (type === 'textarea') return { ...f, control: 'textarea', placeholder: hint, maxlength, text: v === undefined || v === null ? '' : str(v) };
  return { ...f, control: 'input', placeholder: hint, maxlength, money, numberMin: type === 'number' && !money,
    inputType: money ? 'text' : type, text: money ? formatAmount(v) : (v === undefined || v === null ? '' : str(v)) };
}

/** `hamFriendlyDesignFields`: four quick fields, the rest in "התאמה מתקדמת". */
function friendly(items: any[], obj: any, scope: string, env: InspectorEnv): Block[] {
  if (items.length <= 5) return items.map(f => ({ k: 'field', f: fieldVM(f, obj, scope, env) }));
  const preferred = ['layout', 'style', 'shape', 'bg', 'cardBg', 'primary', 'color', 'accentColor', 'textColor', 'headingColor', 'borderColor', 'radius', 'font', 'fontSize', 'titleSize'];
  const chosen: number[] = [];
  for (const key of preferred) { const index = items.findIndex((item, i) => !chosen.includes(i) && item[0] === key); if (index >= 0 && chosen.length < 4) chosen.push(index); }
  for (let i = 0; i < items.length && chosen.length < 4; i++) if (!chosen.includes(i)) chosen.push(i);
  return [{ k: 'friendly', primary: items.filter((_, i) => chosen.includes(i)).map(f => fieldVM(f, obj, scope, env)),
    extra: items.filter((_, i) => !chosen.includes(i)).map(f => fieldVM(f, obj, scope, env)) }];
}

/** `hamCardSizePanel`. */
function cardSizePanel(scope: string, env: InspectorEnv) {
  const d = env.cardSizeDevice, c = env.cardSizeFor(scope, d);
  const presets = {
    compact: { width: d === 'mobile' ? 208 : 228, image: 66, padding: 8, button: 30 },
    balanced: env.cardSizeDefaults[scope][d],
    spacious: { width: d === 'mobile' ? 310 : 380, image: d === 'mobile' ? 150 : 185, padding: 20, button: 46 }
  };
  const active = Object.entries(presets).find(([, values]) => Object.keys(values).every(k => Math.abs(c[k] - values[k]) <= 1))?.[0] || '';
  const fields = [['width', 'רוחב הכרטיס', 170, 440, 5], ['image', 'גובה תמונה', 50, 230, 5], ['padding', 'ריווח בתוך הכרטיס', 6, 30, 1], ['button', 'גובה כפתור', 28, 54, 1]];
  return { scope, device: d, active,
    sliders: fields.map(([key, label, min, max, step]) => ({ key, label, min, max, step, value: str(c[key]), out: Math.round(c[key]) + ' px',
      aria: label + ' (' + (d === 'mobile' ? 'מובייל' : 'דסקטופ') + ')' })) };
}

/** `hamPresentationPanel` + `hamPresentationAdvanced`. */
function presentation(scope: string, env: InspectorEnv) {
  const cfg = env.state.content[scope], dev = env.cardSizeDevice, settings = env.presentationFor(scope, dev);
  const module = env.carouselModules.find(item => item.scope === scope);
  const current = cfg.layout === 'carousel' ? 'carousel' : 'ordinary';
  const counts = [['auto', 'אוטומטי'], ...Array.from({ length: dev === 'desktop' ? 4 : 2 }, (_, i) => [String(i + 1), String(i + 1)])];
  return {
    cover: { scope, label: module.label, current, dev, settings, rewards: scope === 'rewards', counts },
    extras: { scope, nav: settings.nav, text: settings.text }
  };
}

/** `hamRenderInspectorPane` for one tab of the unified editor, or the stats / simple panes. */
function pane(env: InspectorEnv, tab: string, out: { title?: string; desc?: string; tabsDisplay?: string; activeTab?: string | null }): Block[] {
  const st = env.state, selected = env.selected;
  const isFundingStats = selected === 'stats';
  out.tabsDisplay = isFundingStats ? 'none' : '';
  if (isFundingStats) {
    out.title = 'נתוני הגיוס';
    out.desc = 'בחרו סגנון, מיקום וצבעים במקום אחד. המספרים מתעדכנים מנתוני הקמפיין.';
    return [...heroStats(env), { k: 'statsDemo', fields: (schema.stats.content || []).map(f => fieldVM(f, st.content.stats, 'stats', env)) }];
  }
  if (st.management?.campaignKind === 'simple') {
    out.title = 'עיצוב דף תרומה פשוט';
    out.desc = 'צבעים, גופנים ומיקום התוכן. אפשרויות נוספות רק כשרוצים.';
    return [{ k: 'simpleDesign', v: simpleDesign(env) }];
  }
  const s = schema[selected] || schema.theme;
  out.title = s.title; out.desc = s.desc; out.activeTab = tab;
  const obj = selected === 'theme' ? st.theme : st.content[selected === 'donationBox' ? 'donate' : selected];
  const base = (s[tab] || [])
    .filter(f => !(selected === 'rewards' && tab === 'design' && ['mobileViewMode', 'mobileTextMode', 'carouselNavStyle'].includes(f[0])))
    .filter(f => !(selected === 'donors' && f[0] === 'subtitle' && !obj.showSubtitle))
    .filter(f => !(selected === 'rewards' && f[0] === 'intro' && obj.showIntro !== true))
    .filter(f => !(selected === 'ambassadors' && f[0] === 'subtitle' && obj.showIntro !== true))
    .filter(f => !(selected === 'sponsors' && f[0] === 'subtitle' && obj.showIntro !== true))
    .filter(f => !(selected === 'hero' && tab === 'design' && f[0] === 'logoWidthMobile' && obj.logoResponsive === false))
    .filter(f => !(selected === 'donors' && f[0] === 'layout'));
  const field = (f, o = obj, scope = selected): Block => ({ k: 'field', f: fieldVM(f, o, scope, env) });
  let fields: Block[] = tab === 'design' ? friendly(base, obj, selected, env) : base.map(f => field(f));
  const typo = (): Block => ({ k: 'typo', scope: selected, chosen: st.content[selected]?.typographyPreset || '' });
  if (tab === 'design' && ['hero', 'title', 'donors', 'ambassadors', 'updates', 'rewards', 'races', 'sponsors', 'comments'].includes(selected)) fields = [typo(), ...fields];
  if (tab === 'design' && ['races', 'sponsors', 'updates', 'comments'].includes(selected)) {
    const all = s.design || [];
    const layoutKeys = ['layout', 'columnsDesktop', 'columnsMobile', 'showPhoto', 'showImages', 'showDates', 'showSpots', 'showDescription', 'showDescriptions', 'showPrice', 'showNames', 'showLinks', 'showSearch', 'showExcerpts', 'showPinned', 'showLevels', 'showAvatars', 'showLikes', 'showIntro'];
    const looksKeys = ['bg', 'cardBg', 'borderColor', 'accentColor', 'logoBg', 'logoFit', 'logoHeight', 'logoRadius', 'logoPadding', 'radius', 'gap', 'imageHeight', 'buttonRadius'];
    const layout = all.filter(x => layoutKeys.includes(x[0])), looks = all.filter(x => looksKeys.includes(x[0])), typography = all.filter(x => !layoutKeys.includes(x[0]) && !looksKeys.includes(x[0]));
    const wrap = (label, arr, open): Block[] => arr.length ? [{ k: 'group', label, open, fields: arr.map(x => fieldVM(x, obj, selected, env)) }] : [];
    fields = [typo(), ...wrap('פריסה ופרטים להצגה', layout, true), ...wrap('צבעים, תמונות ומסגרות', looks, true), ...wrap('טיפוגרפיה, סכומים וכפתורים', typography, false)];
  }
  if (selected === 'donors' && tab === 'content') fields = [{ k: 'donorLayouts', current: obj.layout }, ...fields];
  if (selected === 'donors' && tab === 'design') {
    const d = st.content.donors;
    fields = [{ k: 'donorColumns', mobile: Number(d.columnsMobile || 1), desktop: Number(d.columnsDesktop || 2) }, ...fields];
  }
  if (['rewards', 'ambassadors'].includes(selected) && tab === 'design') {
    const choices = selected === 'rewards' ? [['carousel', 'קרוסלה', '❮❯'], ['cards', 'כרטיסים', '▦'], ['list', 'רשימה', '☷'], ['compact', 'קומפקטי', '▤']] : [['carousel', 'קרוסלה', '❮❯'], ['cards', 'כרטיסים', '▦'], ['list', 'רשימה', '☷'], ['leaders', 'מובילים', '▥']];
    fields = [{ k: 'layoutPicker', scope: selected, current: obj.layout || 'cards', choices }, ...fields];
  }
  if (tab === 'design' && selected === 'rewards') fields = [{ k: 'rewardPlacement', position: st.content.rewards.desktopPosition || 'sidebar' }, ...fields];
  if (tab === 'design' && ['rewards', 'races'].includes(selected)) fields = [...fields, { k: 'cardSize', panel: cardSizePanel(selected, env) }];
  if (selected === 'theme') fields = [{ k: 'themePalettes', palettes: Object.entries(env.palettes) }, ...s.content.map(f => field(f, obj, 'theme'))];
  if (selected !== 'theme' && selected !== 'donationBox' && tab === 'content') fields = [{ k: 'deviceVisibility', value: st.deviceVisibility?.[selected] || 'both' }, ...fields];
  if (selected === 'nav' && tab === 'content') {
    const placement = st.content.nav.placement || {};
    fields = [...fields, { k: 'navPlacement', rows: env.navTargets.map(([id, label]) => ({ id, label, menu: placement[id] === 'menu' })) }];
  }
  if (selected === 'donate' && tab === 'content') {
    const d = st.content.donate, mode = d.iconMode || 'emoji';
    if (mode === 'emoji') fields = [...fields, { k: 'emojiPicker', current: d.emoji }];
    if (mode === 'custom') fields = [...fields, { k: 'donateUpload', hasIcon: !!d.customIcon }];
  }
  if (selected === 'donationBox' && (tab === 'content' || tab === 'design')) fields = [{ k: 'donation', d: env.dbStyleForDevice(st.content.donate), scope: env.dbEditScope }];
  if (selected === 'campaignInfo' && tab === 'content') fields = [{ k: 'category', c: category(env) }, ...fields, { k: 'managerUpload' }];
  if (selected === 'hero' && tab === 'content') {
    const photos = Array.isArray(st.content.hero.slides) ? st.content.hero.slides : [];
    fields = [...fields, { k: 'heroUploads' }, { k: 'slider', photos: photos.map(ref => ({ src: env.mediaSrc(ref) || '' })) }, { k: 'posterUpload' }, { k: 'logoUpload', hasLogo: !!st.content.hero.orgLogo }];
  }
  if (tab === 'design' && selected !== 'theme' && !s.design) fields = [{ k: 'noDesign' }];
  if (selected === 'story' && tab === 'content') fields = [...fields, { k: 'storyBlocks', blocks: st.content.story.blocks }];
  if (selected !== 'theme') fields = [...fields, { k: 'visibility', id: selected, checked: selected === 'donationBox' ? st.content.donate.boxEnabled !== false : st.visible[selected] !== false }];
  if (tab === 'design' && env.carouselModules.some(m => m.scope === selected)) {
    const p = presentation(selected, env);
    fields = [{ k: 'easy', cover: p.cover, extras: p.extras, open: env.advancedOpen, inner: fields }];
  }
  const withCard = selected === 'theme' || selected === 'stats' || (selected === 'hero' && tab === 'design');
  return [...(withCard ? heroStats(env) : []), ...fields];
}

/** `hamHeroStatsInspector`: the shared card-style panel (desktop only, not in a simple campaign). */
function heroStats(env: InspectorEnv): Block[] {
  const st = env.state;
  if (st.management?.campaignKind === 'simple' || env.device !== 'desktop') return [];
  return [{ k: 'heroStats', card: { cfg: st.management?.heroStatsCard || {}, primary: st.theme.primary } }];
}

/** `categoryEditorMarkup` + `categoryChoiceMarkup`. */
export function category(env: InspectorEnv) {
  const c = env.state.content.campaignInfo;
  const chosen = env.categoryByLabel(c.category) || env.catalog[9];
  return { ci: c, chosen, icon: env.categoryIconName(c), search: env.categorySearch, open: env.categoryIconPickerOpen };
}
export function categoryChoices(catalog: any[], ci: any, filter: string) {
  const term = filter.trim().toLocaleLowerCase('he-IL');
  return catalog.filter(c => !term || [c.label, ...c.sub].some(n => n.toLocaleLowerCase('he-IL').includes(term))).map(c => {
    const isSelected = ci.category === c.label;
    return { c, isSelected, subs: term ? c.sub.filter(sub => sub.toLocaleLowerCase('he-IL').includes(term)).map(sub => ({ sub, active: isSelected && ci.subcategory === sub })) : [] };
  });
}

/** `hamSimpleDedicatedDesignMarkup`'s values. */
function simpleDesign(env: InspectorEnv) {
  const v = env.simpleVisual();
  return { v, position: v.identityPosition || 'middle-center' };
}

/** `renderInspector`: the unified editor, or the stats / simple pane. */
export function buildInspector(env: InspectorEnv): InspectorView {
  const st = env.state, selected = env.selected;
  const out: any = { activeTab: null };
  const extras = env.extras();
  if (st.management?.campaignKind === 'simple' || selected === 'stats') {
    const blocks = pane(env, 'design', out);
    return { title: out.title, desc: out.desc, tabsDisplay: out.tabsDisplay, activeTab: out.activeTab, extras, unified: null, blocks, panelKey: selected + ':design' };
  }
  const content = pane(env, 'content', out);
  const design = pane(env, 'design', out);
  const story = selected === 'story';
  const shared = selected === 'donationBox' || selected === 'theme';
  const hasContent = !shared && content.length > 0;
  // The rewards' placement is moved to the top of the appearance section (it was first inside the advanced group).
  let placement: Block | null = null;
  if (selected === 'rewards') {
    const take = (list: Block[]): boolean => {
      const i = list.findIndex(b => b.k === 'rewardPlacement');
      if (i >= 0) { placement = list[i]; list.splice(i, 1); return true; }
      return list.some(b => b.k === 'easy' && take(b.inner));
    };
    take(design);
  }
  return {
    title: out.title, desc: out.desc, tabsDisplay: 'none', activeTab: out.activeTab, extras,
    unified: { title: out.title || 'הרכיב', story, rewards: selected === 'rewards', device: env.device, placement, design, content: hasContent ? content : null },
    blocks: [], panelKey: selected + ':unified'
  };
}
