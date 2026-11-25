import { Injectable, inject } from '@angular/core';
import { PublicPartsService } from '../public-page/parts/public-parts.service';

/**
 * Data layer of the management screen: defaults and migrations of
 * `state.management`, the path-based field read/write used by every
 * management form (`get`/`put`), readiness (completion) rules, campaign
 * URL rules and the host-context contract (organizer, categories, user).
 *
 * The campaign state object is still owned by the core engine; this
 * service reads and writes it in place through the context bridge.
 */

export type ModuleType = 'rewards' | 'sponsors' | 'ambassadors' | 'updates' | 'donors' | 'comments';
export type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface ReadinessItem { name: string; detail: string; go: string; done: boolean; required: boolean; }
export interface Readiness {
  all: ReadinessItem[]; required: ReadinessItem[]; recommended: ReadinessItem[];
  done: number; total: number; pct: number; missing: ReadinessItem[]; completed: ReadinessItem[];
}
export interface ManagementCategory { id: string; label: string; icon: string; sub: string[]; }

/** The part of the core bridge used by the management layer. */
export interface ManagementContext {
  readState(): Json;
  defaults(): Json;
  campaignCategoryCatalog: ManagementCategory[];
  categoryByLabel(label: string): ManagementCategory | undefined;
  device(): string;
  renderPreview(...args: unknown[]): unknown;
  renderInspector(...args: unknown[]): unknown;
  persist(...args: unknown[]): unknown;
  render(...args: unknown[]): unknown;
  renderSections(...args: unknown[]): unknown;
  decoratePreview(wrap: (inner: (...args: unknown[]) => unknown) => (...args: unknown[]) => unknown): void;
  snapshot(): void;
  toast(message: string): void;
  huFormatAmount(value: unknown): string;
  huReadAmount(value: unknown): number;
}

export const MODULE_LABELS: Record<ModuleType, string> = {
  rewards: 'תשורות', sponsors: 'חסויות', ambassadors: 'שגרירים', updates: 'עדכונים', donors: 'תורמים', comments: 'תגובות'
};

export const MODULE_FIELDS: Record<string, Array<[string, string, string]>> = {
  rewards: [['שם התשורה', 'name', 'text'], ['סכום (₪)', 'amount', 'number'], ['תיאור', 'description', 'textarea'], ['כמות זמינה', 'quantity', 'number']],
  races: [['כותרת', 'title', 'text'], ['מחיר (₪)', 'price', 'number'], ['תיאור', 'desc', 'textarea'], ['תאריך', 'date', 'date'], ['מקומות', 'capacity', 'number']],
  sponsors: [['שם החסות', 'name', 'text'], ['לוגו (URL)', 'logo', 'url'], ['כתובת אתר', 'url', 'url']],
  ambassadors: [['שם השגריר', 'name', 'text'], ['יעד אישי (₪)', 'target', 'number'], ['סכום שגויס (₪)', 'raised', 'number'], ['קישור אישי', 'url', 'text']],
  updates: [['כותרת', 'title', 'text'], ['תוכן', 'text', 'textarea']],
  donors: [['שם התורם', 'name', 'text'], ['סכום (₪)', 'amount', 'number'], ['הקדשה', 'dedication', 'textarea']],
  comments: [['שם', 'name', 'text'], ['תגובה', 'text', 'textarea']]
};

const today = () => new Date().toISOString().slice(0, 10);
/** A fresh item per module type (dates are taken when the item is created). */
export function newModuleItem(type: string): Json {
  const items: Record<string, Json> = {
    rewards: { name: 'תשורה חדשה', amount: 180, description: '', image: '', recommended: false, stockEnabled: false, quantity: 0 },
    races: { title: 'מסלול חדש', price: 120, desc: '', date: '', capacity: 0, registered: 0, distance: '5 ק״מ', status: 'open', image: '', code: '', location: '', shirtRequired: false, maxPerOrder: 0, useRegistrationTypes: false, registrationTypes: [] },
    sponsors: { name: 'חסות חדשה', logo: '', url: '', description: '' },
    ambassadors: { name: 'שגריר חדש', target: 3000, raised: 0, url: '', photo: '' },
    updates: { title: 'עדכון חדש', text: '', date: today(), image: '', status: 'published', pinned: false },
    donors: { name: '', amount: 0, dedication: '' },
    comments: { name: '', text: '', date: today(), approved: true }
  };
  return items[type];
}

export const ORGANIZER_TYPES: Array<[string, string]> = [['', 'לא הוגדר'], ['nonprofit', 'עמותה'], ['association', 'ארגון'], ['institution', 'מוסד'], ['community', 'יוזמה קהילתית'], ['business', 'עסק'], ['individual', 'אדם פרטי'], ['other', 'אחר']];

const EXTRA_CATEGORIES: ManagementCategory[] = [
  { id: 'torah', label: 'יהדות ותורה', icon: 'star-of-david', sub: ['תלמוד תורה', 'לימוד תורה', 'מוסדות תורה', 'קהילה יהודית'] },
  { id: 'synagogues', label: 'בתי כנסת ומוסדות דת', icon: 'landmark', sub: ['בית כנסת', 'מקווה', 'מוסדות דת'] },
  { id: 'land', label: 'התיישבות ופיתוח הארץ', icon: 'house', sub: ['חיזוק יישובים', 'התיישבות', 'פיתוח הארץ', 'פרויקטים קהילתיים'] },
  { id: 'creators', label: 'יוצרים ותוכן', icon: 'book-open', sub: ['סרטים', 'כתיבה', 'פודקאסטים', 'יצירה דיגיטלית'] }
];

/** Readiness evidence keys that are tracked (others are ignored by confirmField). */
const TRACKED_EVIDENCE = ['meta.name', 'meta.category', 'meta.manager', 'meta.slug', 'funding.target', 'funding.start', 'funding.end', 'content.shortText', 'content.heroUrl', 'donations.option', 'donations.monthlyEnabled'];
const EVIDENCE_ALIAS: Record<string, string> = {
  'content.heroTitle': 'meta.name', 'content.belowSubtitle': 'content.shortSubtitle',
  'donations.freeAmount': 'donations.option', 'donations.oneTime': 'donations.option', 'donations.monthly': 'donations.option'
};

/** Guidance shown in the preview instead of empty fields; never saved. */
const GUIDANCE = {
  heroTitle: 'כאן יופיע שם הקמפיין', heroSubtitle: 'כאן יופיע משפט קצר על מטרת הקמפיין',
  belowTitle: 'כאן תופיע כותרת התיאור הקצר', belowSubtitle: 'כאן אפשר להוסיף כותרת משנה', shortText: 'כאן ייכתב תיאור קצר של הקמפיין',
  donorsHeading: 'התורמים לקמפיין', donorsSubtitle: 'כאן אפשר להוסיף משפט תודה לתורמים',
  updatesHeading: 'עדכוני הקמפיין', updateTitle: 'כאן תופיע כותרת העדכון', updateText: 'כאן ייכתב תוכן העדכון',
  rewardsIntro: 'כאן אפשר להסביר בקצרה על התשורות', commentsIntro: 'כאן יופיע משפט פתיחה לאזור התגובות',
  footerTitle: 'כאן תופיע כותרת הסיום', footerSubtitle: 'כאן יופיע טקסט קצר לסיום הקמפיין'
};

export const CALENDAR_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));
export const money = (n: unknown): string => '₪' + Number(n || 0).toLocaleString('he-IL');
export const isoDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Parses YYYY-MM-DD (rejects impossible dates such as 2026-02-31). */
export function parseIsoDate(v: unknown): Date | null {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}
export const displayDate = (v: unknown): string => { const d = parseIsoDate(v); return d ? `${d.getDate()} ב${CALENDAR_MONTHS[d.getMonth()]} ${d.getFullYear()}` : ''; };

export function campaignSlug(url: unknown): string {
  let slug = String(url || '').split(/[?#]/)[0].split('/').filter(Boolean).pop() || 'demo';
  try { slug = decodeURIComponent(slug); } catch { /* keep raw */ }
  return slug;
}
export const cleanSlug = (value: unknown): string => String(value || '').trim().replace(/[\s_]+/gu, '-').replace(/-+/g, '-');
export const campaignUrl = (slug: unknown): string => 'https://hamonym.com/campaign/' + encodeURIComponent(cleanSlug(slug) || 'demo');
export const publicFriendlyUrl = (url: unknown): string => 'https://hamonym.com/campaign/' + campaignSlug(url);
export const validSlug = (slug: string): boolean => /^[\p{L}\p{N}][\p{L}\p{N}-]{1,68}[\p{L}\p{N}]$/u.test(slug) && !slug.includes('--');
/** Normalized http(s) URL with a real host, or '' when invalid. */
export function validExternalUrl(value: unknown): string {
  try {
    const raw = String(value || '').trim();
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    return ['https:', 'http:'].includes(url.protocol) && url.hostname.includes('.') ? url.href : '';
  } catch { return ''; }
}

const storageDefaults = (): Json => ({
  campaignKind: 'donation', name: '', organization: '', organizationWebsite: '', showOrganizationLink: false, organizerName: '', organizerType: '', organizerWebsite: '',
  showOrganizer: true, showOrganizerWebsite: false, showNonprofitFooterLink: true, managerSource: 'account',
  funding: { start: isoDate(new Date()), duration: 'one-time', model: 'flexible', matching: false, matchingFactor: 2, matchingCap: 50000 },
  donations: { suggestedAmounts: true, monthlyEnabled: true, monthlyPeriod: 'until-cancel', monthlyCount: 12, installments: true, maxInstallments: 6, installmentOptions: [1, 2, 3, 4, 5, 6] },
  mobileHero: { enabled: false, title: '', subtitle: '' }, access: { editors: '', allowEditorPublish: false },
  modules: {
    rewards: { enabled: true }, races: { enabled: false, visible: true, items: [] }, sponsors: { enabled: false, visible: true, items: [] },
    ambassadors: { enabled: true, visible: true, publicAmounts: false, items: [] }, updates: { enabled: true, items: [] },
    donors: { enabled: true, items: [] }, comments: { enabled: true, items: [] }
  }
});

@Injectable({ providedIn: 'root' })
export class ManagementModelService {
  private readonly parts = inject(PublicPartsService);
  private ctx!: ManagementContext;
  private fallbackCatalog: ManagementCategory[] = [];
  readonly collator = new Intl.Collator('he', { sensitivity: 'base', numeric: true });

  /** Set by the host context (logged-in user); null without a session. */
  linkedSessionManager: { name: string; photo: string } | null = null;
  linkedOrganizerName = false;
  linkedOrganizerWebsite = false;
  externalCategoryCatalog = false;

  /** Pure helpers, exposed for the remaining legacy management screens. */
  readonly lib = {
    clone, money, MODULE_LABELS, MODULE_FIELDS, ORGANIZER_TYPES, newModuleItem, campaignSlug, cleanSlug, campaignUrl, publicFriendlyUrl,
    validSlug, validExternalUrl, CALENDAR_MONTHS, isoDate, parseIsoDate, displayDate
  };

  attach(context: ManagementContext): void {
    this.ctx = context;
    for (const c of EXTRA_CATEGORIES) if (!context.campaignCategoryCatalog.some(x => x.label === c.label)) context.campaignCategoryCatalog.push(c);
    this.fallbackCatalog = clone(context.campaignCategoryCatalog);
    context.campaignCategoryCatalog.sort((a, b) => this.collator.compare(a.label, b.label));
    this.ensureManagement();
    // The core uses a placeholder domain: keep the slug, make links HAMONYM-only.
    this.normalizeShareUrl();
  }

  private state(): Json { return this.ctx.readState(); }
  /** The core bridge, for the management components. */
  get context(): ManagementContext { return this.ctx; }
  campaignKind(): string { return String(this.state()['management']?.campaignKind || 'donation'); }
  normalizeShareUrl(): void { const share = this.state()['content'].share; share.url = campaignUrl(campaignSlug(share.url)); }

  // -------------------------------------------------------------- migrations

  ensureManagement(): void {
    const s = this.state(), d = storageDefaults(), m: Json = s['management'] || {};
    const mg: Json = s['management'] = {
      ...d, ...m,
      funding: { ...d['funding'], ...m['funding'] }, donations: { ...d['donations'], ...m['donations'] },
      mobileHero: { ...d['mobileHero'], ...m['mobileHero'] }, access: { ...d['access'], ...m['access'] }, modules: { ...d['modules'], ...m['modules'] }
    };
    // Older drafts stored only maxInstallments; a fresh campaign offers 1..6.
    const legacyCount = Number(m['donations']?.maxInstallments);
    const oldMax = Number.isInteger(legacyCount) && legacyCount > 0 ? Math.min(legacyCount, 99) : 6;
    const stored: unknown[] = Array.isArray(m['donations']?.installmentOptions) ? m['donations'].installmentOptions : Array.from({ length: oldMax }, (_, i) => i + 1);
    let options = [...new Set(stored.map(Number).filter(x => Number.isInteger(x) && x >= 1 && x <= 99))].sort((a, b) => a - b);
    if (!options.length) options = [1];
    mg['donations'].installmentOptions = options;
    mg['donations'].maxInstallments = Math.max(...options);
    for (const key of Object.keys(MODULE_LABELS)) mg['modules'][key] = { ...d['modules'][key], ...(m['modules']?.[key] || {}) };
    for (const key of ['races', 'sponsors', 'ambassadors', 'updates', 'donors', 'comments']) {
      if (!Array.isArray(mg['modules'][key].items)) mg['modules'][key].items = [];
    }
    if (!m['readinessTrackingV0111']) this.initReadinessTracking(mg, m);
    mg['readinessEvidence'] ||= {};
    // v0.1.5: organization metadata became the generic organizer identity.
    if (!m['organizerMigratedV015']) {
      if (!m['organizerName'] && m['organization']) mg['organizerName'] = String(m['organization']);
      if (!m['organizerWebsite'] && m['organizationWebsite']) mg['organizerWebsite'] = String(m['organizationWebsite']);
      if (m['showOrganizerWebsite'] === undefined) mg['showOrganizerWebsite'] = !!m['showOrganizationLink'];
      mg['organizerMigratedV015'] = true;
    }
    const c = s['content'], defaults = this.ctx.defaults()['content'];
    if (c.campaignInfo.role === 'מוביל את הפרויקט מטעם העמותה') c.campaignInfo.role = 'מנהל הקמפיין';
    // v0.1.4: the old separate management name moves once to the real title.
    if (!mg['titleLinkedV014']) {
      const previous = String(mg['name'] ?? '').trim();
      if (previous && previous !== defaults.title.title && previous !== defaults.hero.title && previous !== String(c.title.title || '').trim()) c.title.title = previous;
      mg['titleLinkedV014'] = true;
    }
    // v0.1.12: the campaign's single canonical name is the Hero title.
    if (!mg['nameOnHeroV0112']) {
      const priorBelow = String(c.title.title || '').trim(), priorHero = String(c.hero.title || '').trim(), legacyName = String(mg['name'] || '').trim();
      const confirmed: Json = mg['readinessEvidence'] || {};
      const chosen = priorBelow && (confirmed['meta.name'] || priorBelow !== defaults.title.title) ? priorBelow
        : priorHero && (confirmed['content.heroTitle'] || confirmed['meta.name'] || priorHero !== defaults.hero.title) ? priorHero
        : legacyName && legacyName !== defaults.title.title ? legacyName : '';
      if (chosen) { c.hero.title = chosen; if (priorBelow === chosen) c.title.title = ''; }
      if (confirmed['content.heroTitle'] && !confirmed['meta.name']) confirmed['meta.name'] = confirmed['content.heroTitle'];
      delete confirmed['content.heroTitle'];
      mg['nameOnHeroV0112'] = true;
    }
  }

  /** Provenance tracking starts: a preview sample is not a saved campaign fact. */
  private initReadinessTracking(mg: Json, m: Json): void {
    const s = this.state(), c = s['content'], ref = this.ctx.defaults()['content'];
    const evidence: Json = {};
    if (m['titleLinkedV014'] || c.title.title !== ref.title.title || Number(c.stats.goal) !== ref.stats.goal || c.campaignInfo.category !== ref.campaignInfo.category) {
      // Legacy draft: credit only values that differ from the known demo content.
      if (c.title.title && c.title.title !== ref.title.title) evidence['meta.name'] = 'legacy-edit';
      if (c.hero.title && c.hero.title !== ref.hero.title) evidence['meta.name'] = 'legacy-edit';
      if (c.campaignInfo.category && c.campaignInfo.category !== ref.campaignInfo.category) evidence['meta.category'] = 'legacy-edit';
      if (c.campaignInfo.manager && c.campaignInfo.manager !== ref.campaignInfo.manager) evidence['meta.manager'] = 'legacy-edit';
      if (c.stats.goal > 0 && Number(c.stats.goal) !== ref.stats.goal) evidence['funding.target'] = 'legacy-edit';
      if (c.title.description && c.title.description !== ref.title.description) evidence['content.shortText'] = 'legacy-edit';
      if (c.hero.title && c.hero.title !== ref.hero.title) evidence['content.heroTitle'] = 'legacy-edit';
      if (c.hero.image && c.hero.image !== ref.hero.image) evidence['content.heroUrl'] = 'legacy-edit';
      if (c.donate.boxAmounts?.some((x: Json) => !ref.donate.boxAmounts.some((y: Json) => Number(x['amount']) === y['amount'] && x['kind'] === y['kind']))) evidence['donations.oneTime'] = 'legacy-edit';
      const slug = String(c.share?.url || '').split('/').filter(Boolean).pop() || '';
      if (slug && slug !== 'demo') evidence['meta.slug'] = 'legacy-edit';
    } else {
      // Fresh draft: keep layout/appearance, remove business sample data.
      c.title.title = ''; c.title.description = ''; c.title.subtitle = '';
      c.hero.title = ''; c.hero.subtitle = ''; c.hero.image = '';
      c.campaignInfo.manager = ''; c.campaignInfo.location = ''; c.campaignInfo.category = '';
      c.campaignInfo.subcategory = ''; c.campaignInfo.endAt = '';
      c.stats.goal = 0; c.stats.raised = 0; c.stats.donors = 0; c.stats.days = 0;
      c.rewards.items = [];
      s['visible'].rewards = false;
      // Donation presets are editable defaults, not confirmed campaign data.
      c.donate.boxAmounts = [
        ...[50, 100, 180, 360, 500, 1000].map((amount, i) => ({ id: 'default-once-' + (i + 1), amount, kind: 'once', months: 1, label: '' })),
        ...[18, 36, 72].map((amount, i) => ({ id: 'default-monthly-' + (i + 1), amount, kind: 'recurring', months: 12, label: '' }))
      ];
      c.donate.boxAllowOther = true;
      mg['donations'].monthlyEnabled = true;
      mg['donations'].installments = true;
      mg['name'] = '';
    }
    mg['readinessEvidence'] = evidence;
    mg['readinessTrackingV0111'] = true;
  }

  // ------------------------------------------------------------ host context

  /** Organizer, categories and current user supplied by the hosting application. */
  applyHostContext(ctx: Json = {}): void {
    const s = this.state(), mg = s['management'];
    if (ctx['categories']?.length) {
      const normalized = (ctx['categories'] as unknown[]).map((c: any, i: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const label = String(typeof c === 'string' ? c : (c.label || c.name || c.title || '')).trim();
        if (!label) return null;
        const match = this.fallbackCatalog.find(x => x.label === label || x.id === c?.id);
        const sub = (c?.subcategories || c?.sub || []).map((x: any) => String(typeof x === 'string' ? x : (x.label || x.name || ''))).filter(Boolean).sort(this.collator.compare); // eslint-disable-line @typescript-eslint/no-explicit-any
        return { id: String(c?.id || match?.id || ('external-' + i)), label, icon: c?.icon || match?.icon || 'tag', sub } as ManagementCategory;
      }).filter((x): x is ManagementCategory => !!x);
      if (normalized.length) {
        this.ctx.campaignCategoryCatalog.splice(0, this.ctx.campaignCategoryCatalog.length, ...normalized.sort((a, b) => this.collator.compare(a.label, b.label)));
        this.externalCategoryCatalog = true;
      }
    }
    // The host may supply a nonprofit, an institution, an individual or another organizer.
    const organizer: Json = ctx['organizer'] || ctx['organization'] || ctx['initiator'] || ctx['owner'] || {};
    const name = String(organizer['name'] || organizer['displayName'] || organizer['fullName'] || '').trim();
    const website = String(organizer['websiteUrl'] || organizer['website'] || organizer['siteUrl'] || '').trim();
    this.linkedOrganizerName = !!name;
    this.linkedOrganizerWebsite = !!website;
    if (name) mg['organizerName'] = name;
    if (website) mg['organizerWebsite'] = website;
    const type = String(organizer['type'] || organizer['kind'] || '').trim();
    if (['עמותה', 'amuta', 'ngo', 'nonprofit'].includes(type.toLocaleLowerCase())) mg['organizerType'] = 'nonprofit';
    else if (type && ORGANIZER_TYPES.some(([id]) => id === type)) mg['organizerType'] = type;
    if (organizer['logoUrl'] && !s['content'].hero.orgLogo) s['content'].hero.orgLogo = String(organizer['logoUrl']);
    const person: Json | null = ctx['currentUser'] || ctx['manager'] || null;
    if (person) {
      this.linkedSessionManager = { name: String(person['name'] || person['fullName'] || ''), photo: String(person['photoUrl'] || person['avatarUrl'] || '') };
      if (!s['content'].campaignInfo.manager) {
        if (this.linkedSessionManager.name) { s['content'].campaignInfo.manager = this.linkedSessionManager.name; mg['readinessEvidence']['meta.manager'] = 'account'; }
        if (this.linkedSessionManager.photo) s['content'].campaignInfo.photo = this.linkedSessionManager.photo;
      }
    }
    this.normalizeShareUrl();
  }

  organizerTypeLabel(): string { return ORGANIZER_TYPES.find(([id]) => id === this.nget('organizerType'))?.[1] || 'גורם מארגן'; }

  // ----------------------------------------------------------- field access

  nget(path: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    return path.split('.').reduce((o: Json | undefined, k) => o?.[k], this.state()['management']);
  }

  nset(path: string, value: unknown): void {
    const keys = path.split('.');
    let o: Json = this.state()['management'];
    for (const k of keys.slice(0, -1)) o = o[k] ?? (o[k] = {});
    o[keys[keys.length - 1]] = value;
  }

  /** Items of a content module (updates: the campaign's main update first). */
  partsFor(type: string): Json[] {
    const c = this.state()['content'];
    if (type === 'rewards') return c.rewards.items || [];
    if (type === 'updates') return [c.updates, ...(this.nget('modules.updates.items') || [])];
    return this.nget(`modules.${type}.items`) || [];
  }

  /** Reads a management form field by its path (`data-hu-path`). */
  get(path: string): any { // eslint-disable-line @typescript-eslint/no-explicit-any
    const s = this.state(), c = s['content'];
    const ci = c.campaignInfo, h = c.hero, t = c.title, d = c.donate, st = c.stats;
    if (path.startsWith('visibility.')) { const id = path.slice(11); return id === 'donationBox' ? d.boxEnabled !== false : s['visible'][id] !== false; }
    if (path.startsWith('stats.')) return st[path.slice(6)] !== false;
    if (path.startsWith('donors.')) return c.donors?.[path.slice(7)] !== false;
    if (path.startsWith('ambassadors.')) return c.ambassadors?.[path.slice(12)] !== false;
    if (path.startsWith('campaignInfo.')) return ci[path.slice(13)] !== false;
    const n = (p: string) => this.nget(p);
    const lookup: Json = {
      'meta.name': h.title, 'meta.organizer': n('organizerName'), 'meta.organizerType': n('organizerType'), 'meta.orgSite': n('organizerWebsite'),
      'meta.showOrganizer': n('showOrganizer'), 'meta.orgSiteVisible': n('showOrganizerWebsite'), 'meta.nonprofitFooterVisible': n('showNonprofitFooterLink') !== false,
      'meta.managerPhoto': ci.photo, 'meta.category': ci.category, 'meta.subcategory': ci.subcategory, 'meta.place': ci.location, 'meta.manager': ci.manager,
      'meta.slug': campaignSlug(c.share.url),
      'funding.target': st.goal, 'funding.end': String(ci.endAt || '').slice(0, 10),
      'content.heroTitle': h.title, 'content.heroSubtitle': h.subtitle, 'content.heroUrl': h.image, 'content.heroOverlay': h.showText, 'content.showHeroName': h.showName !== false,
      'content.showBelow': s['visible'].title !== false,
      'content.belowTitle': t.title, 'content.belowSubtitle': t.subtitle, 'content.shortText': t.description, 'content.shortTitle': t.title, 'content.shortSubtitle': t.subtitle,
      'content.showCategory': ci.showCategory, 'design.primary': s['theme'].primary, 'design.desktopNav': c.header.desktopNavStyle,
      'donations.suggestedAmounts': n('donations.suggestedAmounts') !== false, 'donations.freeAmount': d.boxAllowOther,
      'donations.oneTime': d.boxAmounts.filter((x: Json) => x['kind'] !== 'recurring').map((x: Json) => Number(x['amount'])),
      'donations.monthly': d.boxAmounts.filter((x: Json) => x['kind'] === 'recurring').map((x: Json) => Number(x['amount'])),
      'modules.rewards.visible': s['visible'].rewards !== false, 'modules.updates.visible': s['visible'].updates !== false,
      'modules.donors.visible': s['visible'].donors !== false, 'modules.comments.visible': s['visible'].comments !== false
    };
    return Object.prototype.hasOwnProperty.call(lookup, path) ? lookup[path] : this.nget(path);
  }

  /** Writes a management form field by its path. */
  put(path: string, value: any): void { // eslint-disable-line @typescript-eslint/no-explicit-any
    const s = this.state(), c = s['content'], mg = s['management'];
    const ci = c.campaignInfo, h = c.hero, t = c.title, d = c.donate, st = c.stats;
    if (path.startsWith('visibility.')) {
      const id = path.slice(11);
      if (id === 'donationBox') d.boxEnabled = !!value; else s['visible'][id] = !!value;
      const md = mg?.modules?.[id];
      if (md) { md.visible = !!value; md.enabled = !!value; }
      return;
    }
    if (path.startsWith('stats.')) { st[path.slice(6)] = !!value; return; }
    if (path.startsWith('donors.')) { c.donors[path.slice(7)] = !!value; return; }
    if (path.startsWith('ambassadors.')) { c.ambassadors[path.slice(12)] = !!value; return; }
    if (path.startsWith('campaignInfo.')) { ci[path.slice(13)] = !!value; return; }
    switch (path) {
      case 'meta.name': h.title = value; break;
      case 'meta.organizer': this.nset('organizerName', value); break;
      case 'meta.organizerType': this.nset('organizerType', value); break;
      case 'meta.orgSite': this.nset('organizerWebsite', value); break;
      case 'meta.showOrganizer': this.nset('showOrganizer', !!value); break;
      case 'meta.orgSiteVisible': this.nset('showOrganizerWebsite', !!value); break;
      case 'meta.nonprofitFooterVisible': this.nset('showNonprofitFooterLink', !!value); break;
      case 'meta.managerPhoto': ci.photo = value; mg.managerSource = 'custom'; break;
      case 'meta.category': ci.category = value; ci.subcategory = ''; ci.categoryIcon = ''; break;
      case 'meta.subcategory': ci.subcategory = value; break;
      case 'meta.place': ci.location = value; break;
      case 'meta.manager':
        if (this.linkedSessionManager && value !== this.linkedSessionManager.name && mg.managerSource === 'account') ci.photo = '';
        ci.manager = value;
        mg.managerSource = 'custom';
        break;
      case 'meta.slug': c.share.url = campaignUrl(value); break;
      case 'funding.target': st.goal = value; break;
      case 'funding.end':
        ci.endAt = value ? value + 'T23:59' : '';
        ci.showCountdown = !!value;
        st.showDays = !!value;
        this.nset('funding.duration', value ? 'one-time' : 'ongoing');
        break;
      case 'funding.duration':
        this.nset(path, value);
        if (value === 'ongoing') { ci.endAt = ''; ci.showCountdown = false; st.showDays = false; }
        break;
      case 'content.heroTitle': h.title = value; break;
      case 'content.heroSubtitle': h.subtitle = value; break;
      case 'content.heroUrl': h.image = value; h.mediaType = 'image'; break;
      case 'content.heroOverlay': h.showText = !!value; break;
      case 'content.showHeroName': h.showName = !!value; break;
      case 'content.showBelow': s['visible'].title = !!value; break;
      case 'content.belowTitle': case 'content.shortTitle': t.title = value; break;
      case 'content.belowSubtitle': case 'content.shortSubtitle': t.subtitle = value; break;
      case 'content.shortText': t.description = value; break;
      case 'content.showCategory': ci.showCategory = !!value; break;
      case 'design.primary': s['theme'].primary = value; break;
      case 'design.desktopNav': c.header.desktopNavStyle = value; break;
      case 'donations.freeAmount': d.boxAllowOther = !!value; break;
      case 'modules.rewards.visible': s['visible'].rewards = !!value; break;
      case 'modules.updates.visible': s['visible'].updates = !!value; break;
      case 'modules.donors.visible': s['visible'].donors = !!value; break;
      case 'modules.comments.visible': s['visible'].comments = !!value; break;
      default: this.nset(path, value);
    }
  }

  // --------------------------------------------------------------- readiness

  /** Records that a field was really set by the user (or the account/wizard). */
  confirmField(path: string, source = 'user'): void {
    const key = EVIDENCE_ALIAS[path] || path;
    if (!TRACKED_EVIDENCE.includes(key)) return;
    const mg = this.state()['management'];
    (mg.readinessEvidence ||= {})[key] = source;
  }

  isConfirmed(key: string): boolean { return !!this.state()['management'].readinessEvidence?.[key]; }

  readinessItems(): ReadinessItem[] {
    const s = this.state(), mg = s['management'], c = s['content'];
    const fromWizard = mg?.entryWizard?.status === 'complete' || mg?.demoFixtureSeedV0190 === true;
    const verified = (key: string) => this.isConfirmed(key) || fromWizard;
    const f = this.nget('funding'), don = this.nget('donations');
    const nonblank = (x: unknown) => String(x ?? '').trim().length > 0;
    const start = parseIsoDate(f.start), end = parseIsoDate(this.get('funding.end'));
    const slug = this.get('meta.slug');
    const donationOptions = !!this.get('donations.freeAmount') || this.get('donations.oneTime').some((x: number) => x > 0) || (don.monthlyEnabled && this.get('donations.monthly').some((x: number) => x > 0));
    if (mg?.campaignKind === 'simple') {
      const secondary = String(c.title?.subtitle || c.title?.description || c.hero?.subtitle || '').trim();
      return [
        { name: 'כותרת', detail: 'שם דף התרומה', go: 'identity', done: nonblank(c.hero?.title || this.get('meta.name')), required: true },
        { name: 'כותרת משנה או תיאור קצר', detail: 'מספיקה אחת משתי האפשרויות', go: 'identity', done: !!secondary, required: true },
        { name: 'סכומי תרומה', detail: 'הגדירו סכומים מוצעים או אפשרות סכום חופשי', go: 'donations', done: donationOptions, required: true },
        { name: 'תמונת Hero או לוגו', detail: 'אפשר לבחור לוגו, תמונה או אווטאר', go: 'identity', done: !!(c.hero?.image || c.hero?.orgLogo), required: false }
      ];
    }
    const items: ReadinessItem[] = [
      { name: 'שם קמפיין', detail: 'הזינו את כותרת הקמפיין', go: 'identity', done: verified('meta.name') && nonblank(this.get('meta.name')), required: true },
      { name: 'תחום ראשי', detail: 'בחרו קטגוריה המתאימה לקמפיין', go: 'identity', done: verified('meta.category') && !!this.ctx.categoryByLabel(this.get('meta.category')), required: true },
      { name: 'מנהל קמפיין', detail: 'ניתן לקבל את הפרטים מהמשתמש המחובר', go: 'identity', done: verified('meta.manager') && nonblank(this.get('meta.manager')), required: true },
      { name: 'כתובת קמפיין', detail: 'אפשר לקבוע כתובת אישית לפני הפרסום', go: 'identity', done: this.isConfirmed('meta.slug') && validSlug(slug) && slug !== 'demo', required: !fromWizard },
      { name: 'יעד גיוס', detail: 'הזינו יעד בשקלים', go: 'funding', done: verified('funding.target') && Number(this.get('funding.target')) > 0, required: true },
      {
        name: 'תאריכי הקמפיין', detail: 'לקמפיין מתמשך אין חובה בתאריך סיום', go: 'funding', required: true,
        done: fromWizard
          ? (mg?.demoFixtureSeedV0190 === true || f.duration === 'ongoing' || !!end)
          : (this.isConfirmed('funding.start') && !!start && (f.duration === 'ongoing' || (this.isConfirmed('funding.end') && !!end && end >= start)))
      },
      { name: 'אופן תרומה', detail: 'בחרו סכום חופשי או הגדירו סכומים מוצעים', go: 'donations', done: verified('donations.option') && donationOptions, required: true },
      { name: 'תיאור קצר', detail: 'כתבו כמה מילים על מטרת הקמפיין', go: 'identity', done: verified('content.shortText') && nonblank(this.get('content.shortText')), required: true }
    ];
    if (f.matching) items.push({ name: 'הגדרות מאצ׳ינג', detail: 'יחס ההכפלה ותקרת ההשתתפות', go: 'funding', done: Number(f.matchingFactor) > 1 && Number(f.matchingCap) > 0, required: true });
    if (don.monthlyEnabled && this.isConfirmed('donations.monthlyEnabled')) {
      items.push({ name: 'הגדרות תרומה חודשית', detail: 'סכום חודשי ומספר חיובים תקין אם נבחר מסלול מוגבל', go: 'donations', done: this.get('donations.monthly').some((x: number) => x > 0) && (don.monthlyPeriod !== 'fixed' || Number(don.monthlyCount) > 0), required: true });
    }
    items.push({ name: 'סיפור הקמפיין', detail: 'מומלץ להוסיף פירוט דרך Story Builder', go: 'identity', done: (c.story.blocks || []).some((x: Json) => String(x['value'] || '').trim() || x['children']?.length || x['images']?.length), required: false });
    items.push({ name: 'תמונת פתיחה', detail: 'מומלץ לבחור תמונת פתיחה ייחודית לקמפיין.', go: 'identity', done: (this.isConfirmed('content.heroUrl') && nonblank(this.get('content.heroUrl'))) || nonblank(c.hero.video), required: false });
    return items;
  }

  readiness(): Readiness {
    const all = this.readinessItems(), required = all.filter(x => x.required), recommended = all.filter(x => !x.required);
    const done = required.filter(x => x.done).length, total = required.length;
    return { all, required, recommended, done, total, pct: total ? Math.round(100 * done / total) : 0, missing: required.filter(x => !x.done), completed: required.filter(x => x.done) };
  }

  // ------------------------------------------------------- preview guidance

  /**
   * Wraps the preview renderer: empty fields show instructional copy and
   * demo samples during rendering only, then the real values are restored.
   * Also applies mobile hero texts, hidden donation kinds, the hero-name
   * toggle and the nonprofit footer link.
   */
  installPreviewGuidance(afterRender: () => void): void {
    const ctx = this.ctx;
    ctx.decoratePreview((render: (...args: unknown[]) => unknown) => (...args: unknown[]) => {
      const s = this.state(), m = s['management'], c = s['content'], hero = c.hero, boxes = c.donate.boxAmounts;
      const demo = ctx.defaults()['content'];
      const undo: Array<() => void> = [];
      const guide = (object: Json, key: string, hint: string, example: unknown, evidenceKey: string | null) => {
        const value = object?.[key];
        const empty = value === null || value === undefined || value === '';
        const untouchedExample = value === example && !(evidenceKey && m?.readinessEvidence?.[evidenceKey]);
        if (!empty && !untouchedExample) return;
        undo.push(() => object[key] = value);
        object[key] = hint;
      };
      const sample = (object: Json, key: string, value: unknown) => {
        const v = object[key];
        if (v === null || v === undefined || v === '' || v === 0 || (Array.isArray(v) && !v.length)) {
          undo.push(() => object[key] = v);
          object[key] = clone(value);
        }
      };
      if (m?.readinessTrackingV0111 && !m?.suppressPreviewGuidanceAfterReset) {
        guide(c.title, 'title', GUIDANCE.belowTitle, demo.title.title, 'content.belowTitle');
        guide(c.title, 'subtitle', GUIDANCE.belowSubtitle, demo.title.subtitle, 'content.belowSubtitle');
        guide(c.title, 'description', GUIDANCE.shortText, demo.title.description, 'content.shortText');
        guide(c.hero, 'title', GUIDANCE.heroTitle, demo.hero.title, 'meta.name');
        guide(c.hero, 'subtitle', GUIDANCE.heroSubtitle, demo.hero.subtitle, 'content.heroSubtitle');
        sample(c.hero, 'image', demo.hero.image);
        for (const key of ['manager', 'location', 'category', 'endAt']) sample(c.campaignInfo, key, demo.campaignInfo[key]);
        for (const key of ['goal', 'raised', 'donors', 'days']) sample(c.stats, key, demo.stats[key]);
        sample(c.donate, 'boxAmounts', demo.donate.boxAmounts);
        const sections: Array<[string, string, string]> = [
          ['donors', 'heading', GUIDANCE.donorsHeading], ['donors', 'subtitle', GUIDANCE.donorsSubtitle],
          ['updates', 'heading', GUIDANCE.updatesHeading], ['updates', 'title', GUIDANCE.updateTitle], ['updates', 'text', GUIDANCE.updateText],
          ['rewards', 'intro', GUIDANCE.rewardsIntro], ['comments', 'intro', GUIDANCE.commentsIntro],
          ['footer', 'title', GUIDANCE.footerTitle], ['footer', 'subtitle', GUIDANCE.footerSubtitle]
        ];
        for (const [section, key, hint] of sections) guide(c[section], key, hint, demo[section][key], null);
        // Untouched factory rewards are layout examples, not the user's rewards.
        const rewards: Json[] = c.rewards.items, demoRewards: Json[] = demo.rewards.items;
        if (Array.isArray(rewards) && rewards.length === demoRewards.length &&
          rewards.every((r, i) => r['name'] === demoRewards[i]['name'] && r['description'] === demoRewards[i]['description'] && Number(r['amount']) === Number(demoRewards[i]['amount']))) {
          undo.push(() => c.rewards.items = rewards);
          c.rewards.items = rewards.map((r, i) => ({ ...r, name: `תשורה לדוגמה ${i + 1}`, description: 'כאן ייכתב תיאור התשורה ומה מקבלים תמורת התרומה' }));
        }
      }
      const heroTitle = hero.title, heroSub = hero.subtitle;
      if (m?.mobileHero?.enabled && ctx.device() === 'mobile') {
        hero.title = m.mobileHero.title || heroTitle;
        hero.subtitle = m.mobileHero.subtitle || heroSub;
      }
      const don = m?.donations;
      if (don?.monthlyEnabled === false || don?.suggestedAmounts === false) {
        c.donate.boxAmounts = boxes.filter((x: Json) => (don.monthlyEnabled !== false || x['kind'] !== 'recurring') && (don.suggestedAmounts !== false || x['kind'] === 'recurring'));
      }
      try {
        // v4.53: the Hero renders the hidden name (it was a class toggled after the render). The nonprofit's footer
        // link was appended to `.footer-section`, which no part renders since v4.46: it is gone.
        this.parts.heroNameHidden = hero.showName === false;
        const result = render(...args);
        return result;
      } finally {
        this.parts.heroNameHidden = false;
        hero.title = heroTitle;
        hero.subtitle = heroSub;
        c.donate.boxAmounts = boxes;
        for (const restore of undo.reverse()) restore();
        afterRender();
      }
    });
  }
}
