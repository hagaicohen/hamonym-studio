import type { CampaignBlock, CampaignDraft, ContainerBlockData } from '../services/campaign-studio-state.service';

// Bilingual campaign content (docs/BILINGUAL-I18N-ROADMAP.md, D-38 … D-45).
//
// One campaign, two language versions. Hebrew stays exactly where it always was
// (the campaign columns, `blocks`, `layout`, `rewards`…), so every existing
// campaign is unchanged. The English version is an overlay: a map from a stable
// *content path* to the English text, stored in its own `content_i18n` column.
// Structure, order, styling and business configuration are never part of it,
// so they stay shared by construction.
//
// Paths address one authored text field:
//   title · layout.projectDescription · heroCtaConfig.label
//   blocks#<blockId>.data.content · blocks#<blockId>.label
//   offerings#<id>.title · updates#<id>.description · sponsors#<id>.name
//   blocks#<blockId>.data.items.2.caption · registrationOptions#<uid>.title
// `#<id>` selects an array item by its id (blocks keep their id across languages
// and saves; registration options by their stable `uid`, since the server
// re-creates them on every save); a number selects by position (gallery items,
// opening hours).

export type ContentLang = 'he' | 'en';
export const CONTENT_LANGS: readonly ContentLang[] = ['he', 'en'];
export const TRANSLATED_LANG = 'en' as const;

export interface ContentLangVersion {
  // Shown publicly only when published *and* complete (D-42).
  published: boolean;
  values: Record<string, string>;
}

export interface CampaignContentI18n {
  v: 1;
  en?: ContentLangVersion;
}

// The Studio edits English "in place": while the English version is open, the
// draft's text fields hold the English text (Hebrew where English is missing), and
// this transient record remembers what was shown and the Hebrew underneath. It
// lives inside the draft so undo/redo snapshots stay self-consistent, and it is
// never sent to the server (D-40).
export interface ContentView {
  lang: 'en';
  base: Record<string, string>;
  shown: Record<string, string>;
}

export type ContentOwner = 'campaign' | 'block' | 'offering' | 'update' | 'sponsor' | 'registration';

export interface TranslatableField {
  path: string;
  owner: ContentOwner;
  ownerId?: string;
  // Interface key naming the field in the Studio's missing-translation list.
  fieldKey: string;
  // Counted by the missing-translation check (visible on the page).
  counted: boolean;
}

const LABEL_SHOWN = new Set(['rich-text', 'video', 'gallery']);

const BLOCK_DATA_FIELDS: Record<string, string[]> = {
  'rich-text': ['content'],
  'image': ['caption'],
  'video': ['caption'],
  'donation-widget': ['title', 'subtitle', 'ctaLabel'],
  'cta': ['title', 'text', 'ctaConfig.label'],
  'coupons': ['discountLabel', 'description'],
  'map': ['address'],
  'comments': ['title', 'description'],
  'countdown': ['title', 'expiredText'],
  'badge': ['text', 'subtext'],
  'progress': ['label','summary.heading','summary.targetLabel'],
  'contact': ['title', 'text'],
  'ambassadors': ['joinCta.label'],
};

const CUSTOM_LOCATION_TYPES = new Set(['region', 'custom']);

// Which field identifies an item of each list.
const idField = (list: string) => (list === 'registrationOptions' ? 'uid' : 'id');

export function newOptionUid(): string {
  return 'ro' + Math.random().toString(36).slice(2, 10);
}

function isParent(b: CampaignBlock): boolean {
  return b.type === 'container' || b.type === 'tabs' || b.type === 'accordion';
}

const enc = (id: string) => encodeURIComponent(id).replace(/\./g, '%2E');
const dec = (s: string) => decodeURIComponent(s);

// Every authored text field the draft currently has, in page order.
export function translatableFields(draft: CampaignDraft): TranslatableField[] {
  const out: TranslatableField[] = [];
  const add = (path: string, owner: ContentOwner, fieldKey: string, counted: boolean, ownerId?: string) =>
    out.push({ path, owner, ownerId, fieldKey, counted });

  const layout = draft.layout ?? ({} as CampaignDraft['layout']);
  const minimal = layout.pageFormat === 'minimal';
  add('title', 'campaign', 'studio.content.field.campaignTitle', true);
  add('shortDescription', 'campaign', 'studio.content.field.campaignSubtitle', true);
  add('managerName', 'campaign', 'studio.content.field.managerName', !minimal);
  add('heroCtaConfig.label', 'campaign', 'studio.content.field.heroCta', !!draft.heroCtaConfig?.visible && !minimal);
  add('heroCustomHtml', 'campaign', 'studio.content.field.heroCustom', draft.heroLayout === 'custom' && !minimal);
  add('layout.projectDescription', 'campaign', 'studio.content.field.projectDescription',
    !minimal && (layout.projectDescriptionPosition ?? 'below') !== 'hidden');
  add('layout.minimalTitleRichHtml', 'campaign', 'studio.content.field.minimalTitle', minimal && !!layout.minimalAdvancedText);
  if (layout.stickyCta?.label) add('layout.stickyCta.label', 'campaign', 'studio.content.field.stickyCtaLabel', !minimal && layout.stickyCta.mode !== 'hidden');
  add('layout.footerHours', 'campaign', 'studio.content.field.footerHours', !!layout.showFooter && !!layout.showFooterContact);
  if (layout.campaignLocation && CUSTOM_LOCATION_TYPES.has(layout.campaignLocation.type)) {
    add('layout.campaignLocation.label', 'campaign', 'studio.content.field.location', true);
  }

  for(const key of Object.keys(layout.amountButtons?.cards??{})){for(const field of ['title','description','accessibleDescription'])add('layout.amountButtons.cards.'+key+'.'+field,'campaign','studio.content.field.'+field,true);}
  const blocks = draft.blocks ?? [];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const panelIds = new Set<string>();
  for (const b of blocks) {
    if (b.type === 'tabs' || b.type === 'accordion') for (const id of (b.data as ContainerBlockData).childBlockIds ?? []) panelIds.add(id);
  }
  const hidden = new Set<string>();
  const hide = (b: CampaignBlock) => {
    if (hidden.has(b.id)) return;
    hidden.add(b.id);
    if (isParent(b)) for (const id of (b.data as ContainerBlockData).childBlockIds ?? []) { const c = byId.get(id); if (c) hide(c); }
  };
  for (const b of blocks) if (b.visible === false) hide(b);
  const pageFull = !minimal;

  const ordered = [...blocks].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  for (const b of ordered) {
    const pre = `blocks#${enc(b.id)}`;
    const counted = pageFull && !hidden.has(b.id);
    if (LABEL_SHOWN.has(b.type) || panelIds.has(b.id)) add(`${pre}.label`, 'block', 'studio.content.field.blockTitle', counted, b.id);
    for (const f of BLOCK_DATA_FIELDS[b.type] ?? []) {
      const ctaHidden = b.type === 'cta' && f === 'ctaConfig.label' && (b.data as any)?.ctaConfig?.visible === false;
      add(`${pre}.data.${f}`, 'block', `studio.content.field.${f.replace('.', '_')}`, counted && !ctaHidden, b.id);
    }
    if (b.type === 'gallery') {
      ((b.data as any)?.items ?? []).forEach((_: unknown, i: number) =>
        add(`${pre}.data.items.${i}.caption`, 'block', 'studio.content.field.caption', counted && !!(b.data as any).showCaptions, b.id));
    }
    if (b.type === 'stats') {
      ((b.data as any)?.items ?? []).forEach((item: { label?: string; visible?: boolean }, i: number) => {
        if (item?.label) add(`${pre}.data.items.${i}.label`, 'block', 'studio.content.field.statLabel', counted && item.visible !== false, b.id);
      });
    }
    if (b.type === 'opening-hours') {
      ((b.data as any)?.days ?? []).forEach((_: unknown, i: number) => {
        add(`${pre}.data.days.${i}.label`, 'block', 'studio.content.field.dayLabel', counted, b.id);
        add(`${pre}.data.days.${i}.hours`, 'block', 'studio.content.field.hours', counted, b.id);
      });
    }
  }

  const shown = (type: string) => pageFull && blocks.some((b) => b.type === type && !hidden.has(b.id));
  const offeringsShown = draft.offeringsEnabled !== false && shown('rewards');
  for (const o of draft.offerings ?? []) {
    add(`offerings#${enc(o.id)}.title`, 'offering', 'studio.content.field.offeringTitle', offeringsShown, o.id);
    add(`offerings#${enc(o.id)}.description`, 'offering', 'studio.content.field.offeringDescription', offeringsShown, o.id);
  }
  const updatesShown = shown('updates');
  for (const u of draft.updates ?? []) {
    const live = updatesShown && (u.status ?? 'published') === 'published';
    add(`updates#${enc(u.id)}.title`, 'update', 'studio.content.field.updateTitle', live, u.id);
    add(`updates#${enc(u.id)}.description`, 'update', 'studio.content.field.updateDescription', live, u.id);
    add(`updates#${enc(u.id)}.linkLabel`, 'update', 'studio.content.field.updateLink', live && !!u.linkUrl, u.id);
  }
  const sponsorsShown = shown('sponsors');
  for (const s of draft.sponsors ?? []) add(`sponsors#${enc(s.id)}.name`, 'sponsor', 'studio.content.field.sponsorName', sponsorsShown, s.id);
  const regs = draft.registrationOptions ?? [];
  if (regs.length) add('registrationFieldLabel', 'registration', 'studio.content.field.registrationLabel', true);
  for (const o of regs) {
    if (!o.uid) continue;
    add(`registrationOptions#${enc(o.uid)}.title`, 'registration', 'studio.content.field.registrationTitle', true, o.uid);
    add(`registrationOptions#${enc(o.uid)}.description`, 'registration', 'studio.content.field.registrationDescription', true, o.uid);
  }
  return out;
}

function step(node: any, seg: string): any {
  if (node == null) return undefined;
  const hash = seg.indexOf('#');
  if (hash >= 0) {
    const name = seg.slice(0, hash);
    const list = node[name];
    const id = dec(seg.slice(hash + 1));
    return Array.isArray(list) ? list.find((x: any) => x && x[idField(name)] === id) : undefined;
  }
  return node[seg];
}

export function getAt(draft: unknown, path: string): string | undefined {
  let node: any = draft;
  for (const seg of path.split('.')) node = step(node, seg);
  return typeof node === 'string' ? node : undefined;
}

// Writes into an existing structure only (never creates blocks or items).
export function setAt(draft: unknown, path: string, value: string): boolean {
  const segs = path.split('.');
  let node: any = draft;
  for (const seg of segs.slice(0, -1)) {
    node = step(node, seg);
    if (node == null || typeof node !== 'object') return false;
  }
  const last = segs[segs.length - 1];
  if (last.includes('#')) return false;
  node[last] = value;
  return true;
}

export function isBlankContent(value: string | null | undefined): boolean {
  if (!value) return true;
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;| /g, ' ').trim() === '';
}

function clone<T>(value: T): T {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

export function contentLanguageOf(draft: CampaignDraft): ContentLang {
  return draft.contentView?.lang ?? 'he';
}

// The draft as the given language renders it. English text replaces the Hebrew
// field by field; a field without English keeps its Hebrew (`fallback`) or is
// emptied. Hebrew is the draft itself.
export function localizeDraft(draft: CampaignDraft, lang: ContentLang, opts: { fallback?: boolean } = {}): CampaignDraft {
  const base = canonicalDraft(draft);
  if (lang === 'he') return base;
  const values = base.contentI18n?.en?.values ?? {};
  const out = clone(base);
  for (const f of translatableFields(out)) {
    const en = values[f.path];
    if (en !== undefined && en !== '') setAt(out, f.path, en);
    else if (opts.fallback === false) setAt(out, f.path, '');
  }
  return out;
}

// Opens the English version of a canonical draft for editing (see ContentView).
export function projectToLanguage(draft: CampaignDraft, lang: ContentLang): CampaignDraft {
  const canonical = canonicalDraft(draft);
  if (lang === 'he') return canonical;
  const values = canonical.contentI18n?.en?.values ?? {};
  const view = clone(canonical);
  const base: Record<string, string> = {};
  const shown: Record<string, string> = {};
  for (const f of translatableFields(canonical)) {
    const heRaw = getAt(canonical, f.path);
    const he = heRaw ?? '';
    const en = values[f.path];
    const show = en !== undefined && en !== '' ? en : he;
    base[f.path] = he;
    shown[f.path] = show;
    // A field the campaign never had stays absent, so opening English changes nothing.
    if (heRaw !== undefined || show !== '') setAt(view, f.path, show);
  }
  view.contentView = { lang: 'en', base, shown };
  return view;
}

// Fields that appeared while the English version was open (a block added, a
// template switched, an offering created) start with their text as the Hebrew
// base and no English yet. Returns the same object when nothing is new.
export function syncContentView(draft: CampaignDraft): CampaignDraft {
  const view = draft.contentView;
  if (!view) return draft;
  let added: Record<string, string> | null = null;
  for (const f of translatableFields(draft)) {
    if (f.path in view.base) continue;
    const cur = getAt(draft, f.path);
    if (cur === undefined) continue;
    (added ??= {})[f.path] = cur;
  }
  if (!added) return draft;
  return { ...draft, contentView: { lang: view.lang, base: { ...view.base, ...added }, shown: { ...view.shown, ...added } } };
}

// The draft as it is stored: Hebrew in the fields, English in contentI18n.
// Edits made while English is open become English values; untouched fields keep
// their stored English (or stay missing). Translations of content that no longer
// exists (a deleted block, offering, update…) are dropped.
export function canonicalDraft(draft: CampaignDraft): CampaignDraft {
  const view = draft.contentView;
  if (!view && !draft.contentI18n) return draft;
  const out = clone(draft);
  delete out.contentView;
  const stored = { ...(draft.contentI18n?.en?.values ?? {}) };
  if (view) {
    for (const f of translatableFields(out)) {
      const cur = getAt(out, f.path);
      if (cur === undefined) continue;
      if (f.path in view.base) {
        if (cur !== view.shown[f.path]) stored[f.path] = cur;
        setAt(out, f.path, view.base[f.path]);
      }
    }
  }
  const i18n = out.contentI18n ?? (Object.keys(stored).length ? { v: 1 as const } : undefined);
  if (!i18n) return out;
  // A field that exists but is not listed right now (a location switched to a
  // canned type…) keeps its English while its owner exists.
  const live = new Set(translatableFields(out).map((f) => f.path));
  const values: Record<string, string> = {};
  for (const [path, text] of Object.entries(stored)) {
    if (live.has(path) || ownerExists(out, path)) values[path] = text;
  }
  out.contentI18n = { v: 1, en: { published: i18n.en?.published ?? false, values } };
  return out;
}

function ownerExists(draft: CampaignDraft, path: string): boolean {
  const first = path.split('.')[0];
  const hash = first.indexOf('#');
  if (hash < 0) return true;
  const name = first.slice(0, hash);
  const list = (draft as any)[name];
  const id = dec(first.slice(hash + 1));
  return Array.isArray(list) && list.some((x: any) => x && x[idField(name)] === id);
}

// The English value of a field as the Studio currently sees it (open edits included).
export function englishValue(draft: CampaignDraft, path: string): string | undefined {
  const view = draft.contentView;
  if (view && path in view.base) {
    const cur = getAt(draft, path);
    if (cur !== undefined && cur !== view.shown[path]) return cur;
  }
  return draft.contentI18n?.en?.values?.[path];
}

export function hebrewValue(draft: CampaignDraft, path: string): string | undefined {
  const view = draft.contentView;
  if (view && path in view.base) return view.base[path];
  return getAt(draft, path);
}

export interface MissingTranslation extends TranslatableField {
  hebrew: string;
}

// Fields shown on the page whose Hebrew has text and whose English does not.
export function missingTranslations(draft: CampaignDraft): MissingTranslation[] {
  const out: MissingTranslation[] = [];
  for (const f of translatableFields(draft)) {
    if (!f.counted) continue;
    const he = hebrewValue(draft, f.path) ?? '';
    if (isBlankContent(he)) continue;
    if (isBlankContent(englishValue(draft, f.path))) out.push({ ...f, hebrew: he });
  }
  return out;
}

// The reverse: text written only in English (an item created while the English
// version was open). Hebrew stays publishable; this is a warning (D-42).
export function missingHebrew(draft: CampaignDraft): MissingTranslation[] {
  const out: MissingTranslation[] = [];
  for (const f of translatableFields(draft)) {
    if (!f.counted) continue;
    const en = englishValue(draft, f.path) ?? '';
    if (isBlankContent(en)) continue;
    const he = hebrewValue(draft, f.path) ?? '';
    if (isBlankContent(he)) out.push({ ...f, hebrew: en });
  }
  return out;
}

export function isEnglishPublished(draft: CampaignDraft): boolean {
  return draft.contentI18n?.en?.published === true;
}

// The languages a visitor may see: Hebrew always; English once published and
// complete, so an incomplete English version never reaches the public (D-42).
export function publicLanguages(draft: CampaignDraft): ContentLang[] {
  return isEnglishPublished(draft) && missingTranslations(draft).length === 0 ? ['he', 'en'] : ['he'];
}

export function withEnglishPublished(draft: CampaignDraft, published: boolean): CampaignDraft {
  const i18n = draft.contentI18n ?? { v: 1 as const };
  return { ...draft, contentI18n: { v: 1, en: { published, values: { ...(i18n.en?.values ?? {}) } } } };
}

// Marks a field's English as identical to its Hebrew (names, brands, numbers),
// so it stops counting as missing. Never invents text: the value is the
// manager's own Hebrew field.
export function keepHebrewAsEnglish(draft: CampaignDraft, path: string): CampaignDraft {
  const he = hebrewValue(draft, path);
  if (he === undefined) return draft;
  const i18n = draft.contentI18n ?? { v: 1 as const };
  return {
    ...draft,
    contentI18n: { v: 1, en: { published: i18n.en?.published ?? false, values: { ...(i18n.en?.values ?? {}), [path]: he } } },
  };
}

// A duplicated block carries its translations to the copy (and, while English is
// open, what the Studio showed for it), so the copy is not "missing" English its
// original has.
export function copyBlockTranslations(draft: CampaignDraft, idMap: Map<string, string>): CampaignDraft {
  const rename = (path: string): string | null => {
    const m = /^blocks#([^.]+)(\..*)$/.exec(path);
    if (!m) return null;
    const to = idMap.get(dec(m[1]));
    return to ? `blocks#${enc(to)}${m[2]}` : null;
  };
  const copyMap = (src: Record<string, string> | undefined): Record<string, string> | undefined => {
    if (!src) return src;
    const next = { ...src };
    for (const [path, text] of Object.entries(src)) { const to = rename(path); if (to) next[to] = text; }
    return next;
  };
  let out = draft;
  if (draft.contentI18n?.en) out = { ...out, contentI18n: { v: 1, en: { ...draft.contentI18n.en, values: copyMap(draft.contentI18n.en.values)! } } };
  if (draft.contentView) out = { ...out, contentView: { lang: 'en', base: copyMap(draft.contentView.base)!, shown: copyMap(draft.contentView.shown)! } };
  return out;
}

// Shape check for what the server sends back (also used before saving).
export function normalizeContentI18n(raw: unknown): CampaignContentI18n | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const en = (raw as any).en;
  if (!en || typeof en !== 'object') return { v: 1 };
  const values: Record<string, string> = {};
  for (const [k, v] of Object.entries(en.values ?? {})) if (typeof v === 'string') values[k] = v;
  return { v: 1, en: { published: en.published === true, values } };
}
