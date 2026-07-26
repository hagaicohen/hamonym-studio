import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TextStyle, CtaConfig } from '../../../shared/models/text-style.model';
export { TextStyle, CtaConfig, TextAlign, TextFontSize, TextPosition } from '../../../shared/models/text-style.model';

export type CampaignFundingType =
  | 'all-or-nothing'
  | 'flexible'
  | 'recurring'
  | 'matching';

// See CAMPAIGN_PRESETS_VISION.md §5 — a fixed, deliberately short list.
// A new value is added only for a recurring workflow that configuring
// 'general' can't already deliver, not per customer request.
export type PresetId = 'general' | 'donation' | 'race';

export type HeroType = 'image' | 'video';
export type HeroLayout = 'title-subtitle' | 'title-only' | 'title-cta' | 'custom';


export type BlockType =
  | 'rich-text'
  | 'image'
  | 'video'
  | 'gallery'
  | 'split'
  | 'cta'
  | 'divider'
  | 'container'
  | 'stats'
  | 'donation-widget'
  // Positional marker only — Hero's actual content (title/subtitle/cover
  // image/CTA/logo/...) still lives on CampaignDraft, edited in the "פרטי
  // בסיס" step. A 'hero' block just says "render Hero at this tree
  // position," giving it full access to ordinary block ordering/containers.
  // Nothing adds one automatically — its absence means Hero keeps rendering
  // via the older fixed-slot outlets. See DECISIONS.md (2026-07-17).
  | 'hero'
  // Each tab IS a regular 'container' block — TabsBlockData.childBlockIds
  // points at N container blocks (same shape ContainerBlockData already
  // uses), rendered as a clickable header bar + only-the-active-one's
  // content instead of a container's "show everything." This reuses the
  // entire existing child-management surface (add/remove/reorder/edit-any-
  // block-type-inside) — see TabsBlockData below and DECISIONS.md
  // (2026-07-17).
  | 'tabs'
  // Same architecture as 'tabs' — each panel IS a regular 'container' block
  // (AccordionBlockData shares TabsBlockData's exact shape on purpose), just
  // rendered as a vertically-stacked, independently expand/collapse list
  // instead of a header-bar-plus-one-active-child. Because the shapes are
  // identical, converting a block between 'tabs' and 'accordion' is just
  // swapping its `type` — no data migration. See DECISIONS.md (2026-07-19).
  | 'accordion'
  // 'rewards' = the Page Builder block that renders the Offerings section.
  // Legacy persisted value — do NOT rename to 'offerings' without a data
  // migration. It's already stored literally as JSON in every existing
  // campaign's `blocks` column; renaming here alone would silently stop
  // that section rendering on every already-published campaign.
  // See DECISIONS.md (2026-07-15).
  | 'rewards'
  | 'sponsors'
  | 'ambassadors'
  | 'donors'
  | 'updates'
  // Social-share buttons (copy link/email/X/Facebook/WhatsApp) — content is
  // always derived from the campaign's own title/slug, nothing to store per
  // instance. Opt-in only: nothing adds one automatically, the manager adds
  // it (and positions it) like any other block. See DECISIONS.md (2026-07-19).
  | 'share'
  // Public comment thread — any site visitor can post (name + email, no
  // login required) and read chronologically, with a simple content search.
  // Comments themselves live in the backend `campaign_comments` table, keyed
  // by campaign slug, not in this block's own `data` — same reasoning as
  // Sponsors/Ambassadors ("view config only").
  | 'comments';

export type StatKey =
  | 'target' | 'raised' | 'percent' | 'supporters'
  | 'start_date' | 'end_date' | 'days_remaining' | 'ambassadors';

export interface StatItem {
  key:     StatKey;
  visible: boolean;
  order:   number;
}

export interface StatsBlockData {
  items:           StatItem[];
  style:           'cards' | 'inline';
  size:            'sm' | 'md' | 'lg';
  iconColor:       string;
  backgroundColor: string;
  borderColor:     string;
  borderRadius:    number;
}

export interface DonorFieldsConfig {
  showAddress:    boolean;
  showPostalCode: boolean;
  showIdNumber:   boolean;
}

export const DEFAULT_DONOR_FIELDS: DonorFieldsConfig = {
  showAddress:    true,
  showPostalCode: false,
  showIdNumber:   false,
};

export interface DonationWidgetBlockData {
  title:            string;
  subtitle:         string;
  ctaLabel:         string;
  ctaIcon:          string;
  ctaColor:         string;
  showSecurityBadge: boolean;
  showPaymentLogos: boolean;
  paymentLogos:     string[];
}

export interface RichTextBlockData {
  content:     string;
  lineHeight?: number; // default 1.6
}

export interface DividerBlockData {
  height:    number;  // spacer height in px, default 24
  showLine:  boolean; // show visible divider line
  lineColor: string;  // line color, default '#e2e8f0'
}

export interface DonorsBlockData {
  viewMode: 'grid' | 'list';
}

export interface ShareBlockData {
  platforms: {
    link:     boolean;
    email:    boolean;
    x:        boolean;
    facebook: boolean;
    whatsapp: boolean;
  };
}

// Block-level view configs — content lives at draft root level
export interface SponsorsBlockData    { /* view config only */ }
export interface AmbassadorsBlockData { /* view config only */ }
export interface CommentsBlockData    { /* view config only — comments live in campaign_comments table */ }
export interface UpdatesBlockData {
  viewMode: 'slider' | 'list';
}

export interface ImageBlockData {
  url: string;
  caption?: string;
}

export interface VideoBlockData {
  url: string;
  caption?: string;
}

export interface GalleryBlockData {
  items:       { url: string; caption?: string }[];
  style:       'slider' | 'grid';
  aspectRatio: '16:9' | '4:3' | '1:1' | '3:2';
  showCaptions: boolean;
  showDots:    boolean;
  showArrows:  boolean;
  autoPlay:    boolean;
}

export interface SplitBlockData {
  leftBlockId:  string | null;
  rightBlockId: string | null;
  leftPercent:  number; // 20–80, default 50
}

export interface ContainerBlockData {
  childBlockIds:       string[];
  backgroundColor:     string;
  borderColor:         string;
  backgroundImageUrl:  string;
  padding:             number;
  gap:                 number;
  direction?:          'row' | 'column';
  splitPercent?:       number; // 20–80, only used when direction='row'
  // Only meaningful for a TOP-LEVEL container when layoutMode is
  // 'sidebar-right'/'sidebar-left' — designates this container's children as
  // the sticky full-height rail ('sidebar') or as the entire main column,
  // Hero included via a 'hero' block among its children ('main'), instead of
  // rendering inline in the normal block flow. See
  // campaign-preview.component.ts sidebarBlocks()/mainColumnBlocks() and
  // DECISIONS.md (2026-07-17).
  railZone?:           'sidebar' | 'main';
  // Only meaningful when this container is a child of an 'accordion' block
  // (i.e. IS a panel) — whether the panel starts expanded, and an optional
  // icon shown in its header. The panel's header TEXT is just the block's
  // own `label`, same as a tab's title — no separate field needed for that.
  panelDefaultOpen?:   boolean;
  panelIcon?:          string;
}

export interface CtaBlockData {
  title: string;
  text: string;
  backgroundColor: string;
  textStyle: TextStyle;
  ctaConfig: CtaConfig;
  // Only relevant when the campaign has Registration Options (a race/event
  // campaign) — lets the button open the registration flow instead of the
  // default donation flow. Defaults to 'donate' so existing campaigns and
  // pure-donation campaigns are unaffected.
  ctaAction: 'donate' | 'register';
  // Vertical padding (px) — controls how much height the whole block takes.
  // Gap between title/text/button scales proportionally with it in the
  // renderer, so there's one simple control instead of two technical ones.
  // Undefined on older blocks falls back to 32 (the original fixed value).
  blockHeight?: number;
}

// childBlockIds — same shape as ContainerBlockData on purpose: each entry is
// a real 'container' block (one per tab), so the entire existing child-
// management surface (add/remove/reorder/edit-any-block-type-inside) works
// unchanged. accentColor: '' = fall back to the campaign's theme color at
// render time. See DECISIONS.md (2026-07-17).
export interface TabsBlockData {
  childBlockIds: string[];
  styleVariant:  'underline' | 'pills' | 'boxed';
  accentColor:   string;
  // 'same' (or undefined) = render as this block's own `type` on every
  // device. 'tabs'/'accordion' overrides the layout on mobile only — e.g. a
  // block whose type is 'tabs' can still show as panels on small screens.
  // Desktop always renders as `type`, regardless of this field.
  mobileLayout?: 'same' | 'tabs' | 'accordion';
}

// Deliberately the exact same shape as TabsBlockData (see BlockType's
// 'accordion' doc comment) — converting a block between the two types is
// just swapping `type`, no data transformation needed.
export interface AccordionBlockData {
  childBlockIds: string[];
  styleVariant:  'underline' | 'pills' | 'boxed';
  accentColor:   string;
  mobileLayout?: 'same' | 'tabs' | 'accordion';
}

export type BlockData =
  | RichTextBlockData
  | ImageBlockData
  | VideoBlockData
  | GalleryBlockData
  | SplitBlockData
  | ContainerBlockData
  | TabsBlockData
  | AccordionBlockData
  | StatsBlockData
  | DonationWidgetBlockData
  | CtaBlockData
  | DividerBlockData
  | DonorsBlockData
  | SponsorsBlockData
  | AmbassadorsBlockData
  | UpdatesBlockData
  | ShareBlockData
  | CommentsBlockData
  | Record<string, never>;

export interface CampaignBlock {
  id: string;
  type: BlockType;
  order: number;
  visible: boolean;
  label: string;
  spacingTop:    number;
  spacingBottom: number;
  data: BlockData;
}

// Offering = a donation perk/gift (formerly "Reward"). Race/event participant
// categories used to live here too (`type: 'registration'`) but were pulled
// out into their own first-class model — see RegistrationOption below and
// DECISIONS.md (2026-07-16). Offering is a pure gift concept again.
export interface Offering {
  id: string;
  title: string;
  description: string;
  minimumAmount: number;
  stock: number | null;
  imageUrl: string | null;
  featured?: boolean;
}

// Registration Option = an admin-defined participant category/price tier for
// a race/event campaign (e.g. "10 ק"מ VIP", "תורם כבוד - מבוגר"). Not an
// Offering — a race category is not a gift a donor receives, it's who's
// participating and what they're paying. What the concept is CALLED is
// itself configurable per campaign (see CampaignDraft.registrationFieldLabel)
// since "route"/"tier"/"ticket" all fit different customers. Lives in its
// own `registration_options` table server-side, not an opaque JSON blob —
// see DECISIONS.md (2026-07-16).
export interface RegistrationOption {
  id: string;
  key: string;
  title: string;
  description: string;
  price: number;
}

export interface CampaignSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  link: string | null;
}

export interface CampaignAmbassador {
  id:              string;
  fullName:        string;
  phone:           string | null;
  email:           string | null;
  goalAmount:      number | null;
  personalMessage: string;
  slug:            string;
}

export interface CampaignUpdate {
  id:          string;
  title:       string;
  date:        string;  // ISO yyyy-mm-dd
  description: string;
  mediaType:   'image' | 'video' | 'none';
  mediaUrl:    string;
  linkUrl:     string;
  linkLabel:   string;
}

// rewardsBg/rewardCardBorder/rewardCardBorderActive: legacy persisted keys
// (stored as-is inside every campaign's `layout` JSON) — do NOT rename
// without a data migration. See DECISIONS.md (2026-07-15).
export interface CampaignTheme {
  primaryColor:          string;  // --hm-primary
  secondaryColor:        string;  // --hm-secondary
  accentColor:           string;  // --hm-accent
  bodyTextColor:         string;  // --hm-body
  logoBg:                string;  // --hm-logo-bg
  topStripBg:            string;  // --hm-top-strip-bg
  rewardsBg:             string;  // --hm-rewards-bg
  rewardCardBorder:      string;  // --hm-reward-border
  rewardCardBorderActive:string;  // --hm-reward-border-active
  lineColor:             string;  // --line
}

export type LayoutMode =
  | 'standard'
  | 'sidebar-right'
  | 'sidebar-left'
  | 'magazine';

export interface CampaignLayout {
  layoutMode:         LayoutMode;
  templateId?:        string;
  // Which Campaign Preset (§ CAMPAIGN_PRESETS_VISION.md) was chosen at creation.
  // Lives here (not on CampaignDraft directly) so it's just another key inside
  // the already-passthrough `layout` JSON blob — no backend column/migration
  // needed, same reasoning as templateId above. Preset only ever changes
  // *defaults*/copy, never locks capability — see DECISIONS.md.
  preset?:            PresetId;
  // Where the Hero renders — independent of layoutMode on purpose (a second,
  // orthogonal axis: layoutMode says where the sidebar rail is, heroPlacement
  // says where the Hero sits). Only meaningful when layoutMode is a sidebar
  // variant; 'main-column' places the Hero as the first item in the main
  // column instead of full-page-width above everything, so the sidebar rail
  // (position: sticky within the same flex row) visually runs the full page
  // height alongside it. Absent/'full-width' = today's behavior for every
  // existing campaign — no migration needed. See DECISIONS.md (2026-07-16).
  heroPlacement?:     'full-width' | 'main-column';
  // Independent per-field position for the campaign title/short-description
  // text — NOT the same axis as heroPlacement (which says where the whole
  // Hero *section* sits). 'hero' = today's default (overlaid inside the Hero,
  // styled via heroTextStyle). 'above'/'below' render as plain page text
  // immediately before/after the Hero section instead. 'hidden' renders
  // nowhere. Lives here for the same no-migration reason as preset/
  // templateId above — backward-compat source is the legacy flat
  // showHeroTitle/showHeroSubtitle DB columns, converted once on load (see
  // campaign-api.service.ts fromSnake()). See DECISIONS.md (2026-07-17).
  heroTitlePosition?:    'above' | 'hero' | 'below' | 'hidden';
  heroSubtitlePosition?: 'above' | 'hero' | 'below' | 'hidden';
  // A short RICH-TEXT project description — a third, distinct tier from
  // title and shortDescription/subtitle, per the manager's own mental model
  // of a campaign page: title → subtitle (one short line) → this (a short
  // formatted paragraph) → the main story (the existing 'rich-text' block,
  // e.g. "על המיזם"). Same above/hero/below/hidden axis as title/subtitle —
  // 'hero' overlays it on the Hero photo (styled for legibility there, not
  // via heroTextStyle since it's not plain text-align/color/size). Lives
  // under `layout` for the same no-migration reason as the fields above; a
  // brand-new field, no legacy source to convert from. See DECISIONS.md
  // (2026-07-17).
  projectDescription?:   string;
  projectDescriptionPosition?: 'above' | 'hero' | 'below' | 'hidden';
  rewardsLayout:      'standard' | 'image';  // legacy persisted key — see CampaignTheme note above
  // How the 'stats' + 'donation-widget' blocks present together (the
  // "Conversion Widget"). Pure visual choice — same data/functions/events for
  // all three, only markup/CSS differs. Absent/'classic' = today's stacked
  // look for every existing campaign — no migration needed, same pattern as
  // heroPlacement above. See DECISIONS.md (2026-07-26).
  conversionWidgetLayout?: 'classic' | 'unified' | 'compact' | 'hero' | 'split-horizontal';
  theme:              CampaignTheme;
  backgroundType:     'none' | 'color' | 'image';
  backgroundColor:    string;
  backgroundImageUrl: string;
  sectionBgOdd:        string;
  sectionBgEven:       string;
  sectionDividerColor: string;
  // Bottom banner (פרטי קמפיין)
  showBottomBanner:    boolean;
  // Footer
  showFooter:          boolean;
  showFooterContact:   boolean;
  footerBg:            string;
  footerTextColor:     string;
  footerEmail:         string;
  footerPhone:         string;
  footerHours:         string;
}

export type CampaignStatus = 'draft' | 'published' | 'paused' | 'ended';

export interface CampaignDraft {
  // Server-managed (populated after save/load — undefined for new campaigns)
  id?:          string;
  entityId?:    string;
  status:       CampaignStatus;
  currentAmount?:   number;
  supportersCount?: number;
  isHidden?:        boolean;
  createdAt?:   string;  // ISO timestamp
  updatedAt?:   string;  // ISO timestamp
  publishedAt?: string;  // ISO timestamp
  entityGaMeasurementId?: string | null;  // owning entity's optional GA4 property (public campaign page only)

  // Step 1 — Basic Info
  title: string;
  slug: string;
  shortDescription: string;
  fundingType: CampaignFundingType;
  category:    string;   // category id or free text
  managerName: string;   // shown on hero chip, editable
  targetAmount: number;
  startDate: string;
  endDate: string;

  // Logo placement
  logoPlacement:  'strip' | 'overlay';
  logoStripAlign: 'right' | 'center' | 'left';
  logoStripBg:    string;
  showEntityName: boolean;
  showLogo:           boolean;
  campaignLogoUrl:    string | null;
  heroLogoPosition:   'left' | 'center' | 'above';
  showHeroTitle:    boolean;
  showHeroSubtitle: boolean;

  // Hero
  heroType:      HeroType;
  heroLayout:    HeroLayout;
  heroTextStyle: TextStyle;
  heroCtaConfig: CtaConfig;
  heroCustomHtml: string;
  coverImageUrl: string | null;
  videoUrl: string;

  // Donation config (used by donation-panel system block)
  enableSuggestedAmounts: boolean;
  allowCustomAmount: boolean;
  allowMonthlyDonation: boolean;
  suggestedAmounts: number[];
  monthlyAmounts: number[];

  // Step 2 — Offerings (Page Builder block type/theme keys below stay
  // literally 'rewards' — they're persisted as-is in existing campaigns'
  // JSON and renaming them would silently break already-saved campaigns)
  offeringsEnabled: boolean;
  offerings: Offering[];

  // Step 3 — Registration Options. "Is registration on for this campaign?"
  // is simply registrationOptions.length > 0 — no separate enabled flag to
  // keep in sync with the array it describes. See DECISIONS.md (2026-07-16).
  registrationFieldLabel: string;
  registrationFieldIcon: string;
  registrationOptions: RegistrationOption[];

  // Step 3b — Sponsors
  sponsors: CampaignSponsor[];

  // Step 3 — Donation settings
  donorFields: DonorFieldsConfig;

  // Step 4 — Ambassadors
  ambassadors: CampaignAmbassador[];

  // Step 5 — Updates
  updates: CampaignUpdate[];

  // Step 6 — Page Builder
  blocks: CampaignBlock[];

  // Layout & Theme
  layout: CampaignLayout;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function createInitialDraft(): CampaignDraft {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysLater = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  })();

  return {
    status:       'draft',
    title: '',
    slug: '',
    shortDescription: '',
    fundingType: 'flexible',
    category:    '',
    managerName: '',
    targetAmount: 0,
    logoPlacement:  'overlay',
    logoStripAlign: 'center',
    logoStripBg:    '#ffffff',
    showEntityName:   true,
    showLogo:         true,
    campaignLogoUrl:  null,
    heroLogoPosition: 'left',
    showHeroTitle:    true,
    showHeroSubtitle: true,
    startDate: today,
    endDate: thirtyDaysLater,
    heroType: 'image',
    heroLayout: 'title-subtitle',
    heroTextStyle: { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'center' },
    heroCtaConfig: { visible: false, label: 'תמכו עכשיו', color: '#06b6d4', align: 'center', icon: '' },
    heroCustomHtml: '',
    coverImageUrl: null,
    videoUrl: '',
    enableSuggestedAmounts: true,
    allowCustomAmount: true,
    allowMonthlyDonation: true,
    suggestedAmounts: [50, 100, 180, 360, 500, 1000],
    monthlyAmounts: [18, 36, 54, 100],
    donorFields: { showAddress: true, showPostalCode: false, showIdNumber: false },
    offeringsEnabled: true,
    offerings: [],
    registrationFieldLabel: 'סוג משתתף',
    registrationFieldIcon: '👤',
    registrationOptions: [],
    sponsors:     [],
    ambassadors:  [],
    updates:      [],
    blocks: (() => {
      const statsId    = generateId();
      const donationId = generateId();
      const containerId = generateId();
      return [
        {
          id: containerId,
          type: 'container' as BlockType,
          order: 1,
          visible: true,
          spacingTop: 0,
          spacingBottom: 0,
          label: 'מסגרת ראשית',
          data: {
            childBlockIds: [statsId, donationId],
            backgroundColor: '',
            borderColor: '',
            backgroundImageUrl: '',
            padding: 0,
            gap: 0,
            direction: 'row',
          } as ContainerBlockData,
        },
        {
          id: statsId,
          type: 'stats' as BlockType,
          order: 1,
          visible: true,
          label: 'פס נתונים',
          spacingTop: 0,
          spacingBottom: 0,
          data: defaultBlockData('stats'),
        },
        {
          id: donationId,
          type: 'donation-widget' as BlockType,
          order: 2,
          visible: true,
          label: 'תיבת תרומה',
          spacingTop: 0,
          spacingBottom: 0,
          data: defaultBlockData('donation-widget'),
        },
        {
          id: generateId(),
          type: 'rich-text' as BlockType,
          order: 2,
          visible: true,
          spacingTop: 0,
          spacingBottom: 0,
          label: 'על המיזם',
          data: { content: '', lineHeight: 1.6 } as RichTextBlockData,
        },
        {
          id: generateId(),
          type: 'rewards' as BlockType,
          order: 3,
          visible: true,
          spacingTop: 0,
          spacingBottom: 0,
          label: 'תשורות',
          data: {},
        },
        {
          id: generateId(),
          type: 'ambassadors' as BlockType,
          order: 4, visible: true, spacingTop: 0, spacingBottom: 0, label: 'שגרירים',
          data: defaultBlockData('ambassadors'),
        },
        {
          id: generateId(),
          type: 'donors' as BlockType,
          order: 5, visible: true, spacingTop: 0, spacingBottom: 0, label: 'תורמים',
          data: defaultBlockData('donors'),
        },
        {
          id: generateId(),
          type: 'updates' as BlockType,
          order: 6, visible: true, spacingTop: 0, spacingBottom: 0, label: 'עדכונים',
          data: defaultBlockData('updates'),
        },
      ];
    })(),
    layout: {
      layoutMode:          'standard' as LayoutMode,
      preset:              'general' as PresetId,
      heroTitlePosition:    'hero',
      heroSubtitlePosition: 'hero',
      projectDescription:   '',
      projectDescriptionPosition: 'below',
      rewardsLayout:       'standard',
      backgroundType:      'none',
      backgroundColor:     '#f8fafc',
      backgroundImageUrl:  '',
      sectionBgOdd:        '#ffffff',
      sectionBgEven:       '#f8fafc',
      sectionDividerColor: '#e2e8f0',
      showBottomBanner:    true,
      showFooter:          true,
      showFooterContact:   true,
      footerBg:            '#030712',
      footerTextColor:     'rgba(255,255,255,0.85)',
      footerEmail:         '',
      footerPhone:         '',
      footerHours:         '',
      theme: {
        primaryColor:   '#333333',
        secondaryColor: '#6fc9eb',
        accentColor:    '#cc350f',
        bodyTextColor:  '#334155',
        logoBg:         '#ffffff',
        topStripBg:     '#061b3a',
        rewardsBg:              '#014737',
        rewardCardBorder:       'rgba(255,255,255,.12)',
        rewardCardBorderActive: '#7DD3FC',
        lineColor:      '#e2e8f0',
      },
    },
  };
}

@Injectable({
  providedIn: 'root',
})
export class CampaignStudioStateService {
  private draftSubject = new BehaviorSubject<CampaignDraft>(createInitialDraft());
  private editModeSubject = new BehaviorSubject<boolean>(false);

  draft$ = this.draftSubject.asObservable();
  isEditMode$ = this.editModeSubject.asObservable();

  private _hoveredBlock = new BehaviorSubject<{ id: string | null; source: 'builder' | 'preview' | null }>({ id: null, source: null });
  readonly hoveredBlock$ = this._hoveredBlock.asObservable();

  private _pageBuilderActive = new BehaviorSubject<boolean>(false);
  readonly pageBuilderActive$ = this._pageBuilderActive.asObservable();

  setPageBuilderActive(active: boolean): void {
    this._pageBuilderActive.next(active);
    if (!active) this._hoveredBlock.next({ id: null, source: null });
  }

  setHoveredBlock(id: string | null, source: 'builder' | 'preview'): void {
    if (!this._pageBuilderActive.value) return;
    this._hoveredBlock.next({ id, source: id ? source : null });
  }

  get draft(): CampaignDraft {
    return this.draftSubject.value;
  }

  get isEditMode(): boolean {
    return this.editModeSubject.value;
  }

  patch(partial: Partial<CampaignDraft>): void {
    this.draftSubject.next({ ...this.draft, ...partial });
  }

  sync(): void {
    this.draftSubject.next({ ...this.draft });
  }

  reset(): void {
    this.editModeSubject.next(false);
    this.draftSubject.next(createInitialDraft());
  }

  applyTemplate(
    blocks: CampaignBlock[],
    themeOverride: Record<string, any>,
    layoutMode?: LayoutMode,
    templateId?: string,
    heroPlacement?: 'full-width' | 'main-column',
  ): void {
    // Preserve whatever Preset was chosen in the (earlier) preset picker step —
    // this resets to a fresh createInitialDraft() otherwise, which would wipe it.
    const currentPreset = this.draft.layout.preset;
    const base = createInitialDraft();
    const layout: CampaignLayout = {
      ...base.layout,
      layoutMode: layoutMode ?? 'standard',
      templateId,
      preset: currentPreset,
      heroPlacement,
      theme: { ...base.layout.theme, ...themeOverride },
    };
    this.draftSubject.next({ ...base, blocks, layout });
  }

  // Sets the chosen Campaign Preset (§ CAMPAIGN_PRESETS_VISION.md §0 — this
  // never creates a different engine, only a default). Called once, from the
  // preset picker shown before the Builder for a brand-new campaign.
  applyPreset(presetId: PresetId): void {
    this.patch({ layout: { ...this.draft.layout, preset: presetId } });
  }

  loadDraft(data: CampaignDraft): void {
    this.editModeSubject.next(true);
    this.draftSubject.next(data);
  }

  // Applies newly-polled live donations to the displayed totals without a
  // full page reload, so the progress bar/raised-amount move while a
  // visitor has the public campaign page open.
  bumpRaisedAmount(amountDelta: number, supportersDelta: number): void {
    const current = this.draft;
    this.draftSubject.next({
      ...current,
      currentAmount:   (current.currentAmount ?? 0) + amountDelta,
      supportersCount: (current.supportersCount ?? 0) + supportersDelta,
    });
  }

  // Block operations
  addBlock(type: BlockType): string {
    const blocks = [...this.draft.blocks];
    const maxOrder = blocks.reduce((max, b) => Math.max(max, b.order), 0);
    const sameType = blocks.filter(b => b.type === type).length;
    const defaultLabels: Partial<Record<BlockType, string>> = {
      'rich-text':       'טקסט',
      'image':           'תמונה',
      'video':           'וידאו',
      'gallery':         'גלריה',
      'cta':             'קריאה לפעולה',
      'divider':         'מרווח',
      'container':       'מסגרת',
      'stats':           'פס נתונים',
      'donation-widget': 'תיבת תרומה',
      'rewards':         'תשורות',
      'sponsors':        'חסויות',
      'ambassadors':     'שגרירים',
      'donors':          'תורמים',
      'updates':         'עדכונים',
      'tabs':            'טאבים',
      'accordion':       'פאנלים',
      'share':           'שיתוף',
      'comments':        'תגובות',
    };
    const baseName = defaultLabels[type] ?? type;
    const label = sameType > 0 ? `${baseName} ${sameType + 1}` : baseName;
    const id = generateId();
    blocks.push({
      id,
      type,
      order: maxOrder + 1,
      visible: true,
      label,
      spacingTop: 0,
      spacingBottom: 0,
      data: defaultBlockData(type),
    });
    this.patch({ blocks });
    // An empty tab bar looks broken (unlike an empty container, which is
    // still a meaningful state) — start with 2 tabs. Each tab is a real
    // 'container' block, so this just reuses addBlockToContainer. See
    // DECISIONS.md (2026-07-17).
    if (type === 'tabs') {
      const tab1Id = this.addBlockToContainer(id, 'container');
      const tab2Id = this.addBlockToContainer(id, 'container');
      this.patch({
        blocks: this.draft.blocks.map(b => {
          if (b.id === tab1Id) return { ...b, label: 'טאב 1' };
          if (b.id === tab2Id) return { ...b, label: 'טאב 2' };
          return b;
        }),
      });
    }
    // Same reasoning as tabs above — an empty panel list looks broken.
    // First panel starts open so the accordion isn't fully collapsed/empty-
    // looking on first add.
    if (type === 'accordion') {
      const panel1Id = this.addBlockToContainer(id, 'container');
      const panel2Id = this.addBlockToContainer(id, 'container');
      this.patch({
        blocks: this.draft.blocks.map(b => {
          if (b.id === panel1Id) return { ...b, label: 'פאנל 1', data: { ...(b.data as ContainerBlockData), panelDefaultOpen: true } };
          if (b.id === panel2Id) return { ...b, label: 'פאנל 2', data: { ...(b.data as ContainerBlockData), panelDefaultOpen: false } };
          return b;
        }),
      });
    }
    return id;
  }

  // Tabs and accordion share the exact same data shape (childBlockIds +
  // styleVariant + accentColor) — converting between them is just swapping
  // `type`, no data transformation. See BlockType's 'accordion' doc comment.
  convertTabsAccordionType(id: string): void {
    const block = this.draft.blocks.find(b => b.id === id);
    if (!block || (block.type !== 'tabs' && block.type !== 'accordion')) return;
    const newType: BlockType = block.type === 'tabs' ? 'accordion' : 'tabs';
    this.patch({ blocks: this.draft.blocks.map(b => b.id === id ? { ...b, type: newType } : b) });
  }

  // Deleting a container/tabs block with children used to leave those
  // children orphaned in draft.blocks — nothing referenced their id anymore,
  // so topLevelBlocks()/topLevelChildIds() picked them back up as stray
  // top-level page content. Fixed-point loop so it also handles a container
  // nested inside another container/tabs. Also strips the removed id(s) out
  // of any surviving parent's own childBlockIds — otherwise that parent is
  // left pointing at a block that no longer exists (harmless today since
  // every reader already filters dangling ids defensively, but not worth
  // leaving as latent stale data). See DECISIONS.md (2026-07-17).
  removeBlock(id: string): void {
    const toRemove = new Set<string>([id]);
    let added = true;
    while (added) {
      added = false;
      for (const b of this.draft.blocks) {
        if (!toRemove.has(b.id)) continue;
        if (b.type !== 'container' && b.type !== 'tabs' && b.type !== 'accordion') continue;
        for (const childId of (b.data as ContainerBlockData).childBlockIds) {
          if (!toRemove.has(childId)) { toRemove.add(childId); added = true; }
        }
      }
    }
    const blocks = this.draft.blocks
      .filter(b => !toRemove.has(b.id))
      .map(b => {
        if (b.type !== 'container' && b.type !== 'tabs' && b.type !== 'accordion') return b;
        const data = b.data as ContainerBlockData;
        if (!data.childBlockIds.some(cid => toRemove.has(cid))) return b;
        return { ...b, data: { ...data, childBlockIds: data.childBlockIds.filter(cid => !toRemove.has(cid)) } };
      });
    this.patch({ blocks });
  }

  moveBlockUp(id: string): void {
    const blocks = [...this.draft.blocks].sort((a, b) => a.order - b.order);
    const idx = blocks.findIndex(b => b.id === id);
    if (idx <= 0) return;
    [blocks[idx].order, blocks[idx - 1].order] = [blocks[idx - 1].order, blocks[idx].order];
    this.patch({ blocks });
  }

  moveBlockDown(id: string): void {
    const blocks = [...this.draft.blocks].sort((a, b) => a.order - b.order);
    const idx = blocks.findIndex(b => b.id === id);
    if (idx < 0 || idx >= blocks.length - 1) return;
    [blocks[idx].order, blocks[idx + 1].order] = [blocks[idx + 1].order, blocks[idx].order];
    this.patch({ blocks });
  }

  // Swap block with its predecessor in a given ordered id-list (scope-aware move)
  moveBlockUpInScope(id: string, orderedScopeIds: string[]): void {
    const idx = orderedScopeIds.indexOf(id);
    if (idx <= 0) return;
    const prevId = orderedScopeIds[idx - 1];
    const blocks = this.draft.blocks.map(b => ({ ...b }));
    const a = blocks.find(b => b.id === id)!;
    const prev = blocks.find(b => b.id === prevId)!;
    [a.order, prev.order] = [prev.order, a.order];
    this.patch({ blocks });
  }

  moveBlockDownInScope(id: string, orderedScopeIds: string[]): void {
    const idx = orderedScopeIds.indexOf(id);
    if (idx < 0 || idx >= orderedScopeIds.length - 1) return;
    const nextId = orderedScopeIds[idx + 1];
    const blocks = this.draft.blocks.map(b => ({ ...b }));
    const a = blocks.find(b => b.id === id)!;
    const next = blocks.find(b => b.id === nextId)!;
    [a.order, next.order] = [next.order, a.order];
    this.patch({ blocks });
  }

  // ── CSS-sidebar → nested-containers migration ──────────────────
  // Old campaigns used layoutMode:'sidebar-right/left' with flat blocks.
  // This wraps those flat blocks in proper container blocks and sets layoutMode:'standard'.
  migrateSidebarToContainers(): void {
    const draft = this.draft;
    const mode = draft.layout?.layoutMode;
    if (mode !== 'sidebar-right' && mode !== 'sidebar-left') return;
    if (draft.blocks.some(b => b.type === 'container')) return; // already has containers
    // heroPlacement === 'main-column' is only ever set by the deliberate
    // "full-height sidebar, Hero beside it" templates — they use flat
    // sidebar-right/left blocks on purpose (that's the real, live rendering
    // path for them, not a legacy leftover) and must never be auto-converted
    // to the container-block/standard-mode structure, which has no concept
    // of heroPlacement. See DECISIONS.md (2026-07-16).
    if (draft.layout?.heroPlacement === 'main-column') return;

    const SIDEBAR_TYPES = ['stats', 'donation-widget'];
    const FULL_WIDTH_TYPES = ['rewards', 'donors', 'ambassadors', 'sponsors', 'updates'];
    const sorted = [...draft.blocks].sort((a, b) => a.order - b.order);

    const sidebarBlocks  = sorted.filter(b => SIDEBAR_TYPES.includes(b.type));
    const fullWidthBlocks = sorted.filter(b => FULL_WIDTH_TYPES.includes(b.type));
    const contentBlocks  = sorted.filter(b => !SIDEBAR_TYPES.includes(b.type) && !FULL_WIDTH_TYPES.includes(b.type));

    const newId = () => Math.random().toString(36).slice(2, 10);
    const outerCtId   = newId();
    const sidebarCtId = newId();
    const contentCtId = newId();

    // RTL: first child in flex-row appears on the RIGHT side visually
    // sidebar-right → sidebar is RIGHT (first child), content is LEFT (second child)
    // sidebar-left  → content is RIGHT (first child), sidebar is LEFT (second child)
    const isLeft = mode === 'sidebar-left';
    const outerChildren = isLeft ? [contentCtId, sidebarCtId] : [sidebarCtId, contentCtId];

    const outerContainer: CampaignBlock = {
      id: outerCtId, type: 'container', order: 1, visible: true, label: 'פריסת דף',
      spacingTop: 0, spacingBottom: 0,
      data: {
        childBlockIds: outerChildren, direction: 'row',
        splitPercent: isLeft ? 64 : 36,
        backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 24, gap: 32,
      } as ContainerBlockData,
    };
    const sidebarContainer: CampaignBlock = {
      id: sidebarCtId, type: 'container', order: isLeft ? 2 : 1, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: {
        childBlockIds: sidebarBlocks.map(b => b.id), direction: 'column',
        backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 16,
      } as ContainerBlockData,
    };
    const contentContainer: CampaignBlock = {
      id: contentCtId, type: 'container', order: isLeft ? 1 : 2, visible: true, label: 'אזור תוכן',
      spacingTop: 0, spacingBottom: 0,
      data: {
        childBlockIds: contentBlocks.map(b => b.id), direction: 'column',
        backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 24,
      } as ContainerBlockData,
    };

    const updatedFullWidth = fullWidthBlocks.map((b, i) => ({ ...b, order: i + 2 }));

    this.patch({
      blocks: [outerContainer, sidebarContainer, contentContainer, ...sidebarBlocks, ...contentBlocks, ...updatedFullWidth],
      layout: { ...draft.layout, layoutMode: 'standard' as any },
    });
  }

  // Add a new block and register it as a child of a container
  addBlockToContainer(containerId: string, type: BlockType): string | null {
    const blocks = [...this.draft.blocks];
    const container = blocks.find(b => b.id === containerId);
    if (!container) return null;
    const ctData = { ...(container.data as ContainerBlockData) };
    const siblingOrders = ctData.childBlockIds
      .map(cid => blocks.find(b => b.id === cid)?.order ?? 0);
    const maxOrder = siblingOrders.length ? Math.max(...siblingOrders) : 0;
    const newId = Math.random().toString(36).slice(2, 10);
    const sameType = blocks.filter(b => b.type === type).length;
    const defaultLabels: Partial<Record<BlockType, string>> = {
      'rich-text': 'טקסט', 'image': 'תמונה', 'video': 'וידאו', 'gallery': 'גלריה',
      'cta': 'קריאה לפעולה', 'divider': 'מרווח', 'container': 'מסגרת',
      'stats': 'פס נתונים', 'donation-widget': 'תיבת תרומה',
      'rewards': 'תשורות', 'sponsors': 'חסויות', 'ambassadors': 'שגרירים',
      'donors': 'תורמים', 'updates': 'עדכונים', 'tabs': 'טאבים', 'share': 'שיתוף',
      'comments': 'תגובות',
    };
    const baseName = defaultLabels[type] ?? type;
    const label = sameType > 0 ? `${baseName} ${sameType + 1}` : baseName;
    blocks.push({ id: newId, type, order: maxOrder + 1, visible: true, label, spacingTop: 0, spacingBottom: 0, data: defaultBlockData(type) });
    ctData.childBlockIds = [...ctData.childBlockIds, newId];
    const updatedBlocks = blocks.map(b => b.id === containerId ? { ...b, data: ctData } : b);
    this.patch({ blocks: updatedBlocks });
    return newId;
  }

  toggleBlockVisibility(id: string): void {
    const blocks = this.draft.blocks.map(b =>
      b.id === id ? { ...b, visible: !b.visible } : b
    );
    this.patch({ blocks });
  }

  updateBlockData(id: string, data: BlockData): void {
    const blocks = this.draft.blocks.map(b =>
      b.id === id ? { ...b, data } : b
    );
    this.patch({ blocks });
  }

  // Hero title/subtitle position — shared by campaign-basic-step (step 1)
  // and campaign-page-builder-step (step 9), so both call the same logic
  // instead of duplicating it. See CampaignLayout's doc comment.
  setHeroTitlePosition(pos: 'above' | 'hero' | 'below' | 'hidden'): void {
    this.patch({ layout: { ...this.draft.layout, heroTitlePosition: pos } });
  }
  setHeroSubtitlePosition(pos: 'above' | 'hero' | 'below' | 'hidden'): void {
    this.patch({ layout: { ...this.draft.layout, heroSubtitlePosition: pos } });
  }
  setProjectDescription(html: string): void {
    this.patch({ layout: { ...this.draft.layout, projectDescription: html } });
  }
  setProjectDescriptionPosition(pos: 'above' | 'hero' | 'below' | 'hidden'): void {
    this.patch({ layout: { ...this.draft.layout, projectDescriptionPosition: pos } });
  }
}

function defaultBlockData(type: BlockType): BlockData {
  switch (type) {
    case 'rich-text':   return { content: '', lineHeight: 1.6 };
    case 'image':       return { url: '' };
    case 'video':       return { url: '' };
    case 'gallery':     return { items: [], style: 'slider', aspectRatio: '16:9', showCaptions: true, showDots: true, showArrows: true, autoPlay: false } as GalleryBlockData;
    case 'split':       return { leftBlockId: null, rightBlockId: null, leftPercent: 50 } as SplitBlockData;
    case 'container':   return { childBlockIds: [], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData;
    case 'tabs':        return { childBlockIds: [], styleVariant: 'underline', accentColor: '' } as TabsBlockData;
    case 'accordion':   return { childBlockIds: [], styleVariant: 'underline', accentColor: '' } as AccordionBlockData;
    case 'stats':       return {
      style:           'cards',
      size:            'md',
      iconColor:       '#7c3aed',
      backgroundColor: '#ffffff',
      borderColor:     '#e2e8f0',
      borderRadius:    12,
      items: [
        { key: 'target',         visible: true,  order: 1 },
        { key: 'raised',         visible: true,  order: 2 },
        { key: 'percent',        visible: true,  order: 3 },
        { key: 'supporters',     visible: true,  order: 4 },
        { key: 'start_date',     visible: true,  order: 5 },
        { key: 'end_date',       visible: true,  order: 6 },
        { key: 'days_remaining', visible: true,  order: 7 },
        { key: 'ambassadors',    visible: false, order: 8 },
      ],
    } as StatsBlockData;
    case 'donation-widget': return {
      title:             'תמכו עכשיו',
      subtitle:          'כל תרומה מקרבת אותנו ליעד',
      ctaLabel:          'תמכו עכשיו',
      ctaIcon:           '❤️',
      ctaColor:          '#16a34a',
      showSecurityBadge: true,
      showPaymentLogos:  true,
      paymentLogos:      ['visa', 'mastercard', 'apple-pay', 'google-pay', 'bit'],
    } as DonationWidgetBlockData;
    case 'divider':     return { height: 24, showLine: false, lineColor: '#e2e8f0' } as DividerBlockData;
    case 'donors':      return { viewMode: 'grid' } as DonorsBlockData;
    case 'sponsors':    return {} as SponsorsBlockData;
    case 'ambassadors': return {} as AmbassadorsBlockData;
    case 'updates':     return { viewMode: 'slider' } as UpdatesBlockData;
    case 'share':       return { platforms: { link: true, email: true, x: true, facebook: true, whatsapp: true } } as ShareBlockData;
    case 'cta':         return {
      title: '', text: '', backgroundColor: '#14532d',
      textStyle: { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'bottom' },
      ctaConfig: { visible: true, label: 'תרמו עכשיו', color: '#7c3aed', align: 'center', icon: '' },
      ctaAction: 'donate',
      blockHeight: 32,
    } as CtaBlockData;
    default:            return {};
  }
}
