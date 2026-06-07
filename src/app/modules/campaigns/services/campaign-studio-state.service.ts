import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { TextStyle, CtaConfig } from '../../../shared/models/text-style.model';
export { TextStyle, CtaConfig, TextAlign, TextFontSize, TextPosition } from '../../../shared/models/text-style.model';

export type CampaignFundingType =
  | 'all-or-nothing'
  | 'flexible'
  | 'recurring'
  | 'matching';

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
  | 'rewards'
  | 'sponsors'
  | 'ambassadors'
  | 'donors'
  | 'updates';

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

// Block-level view configs — content lives at draft root level
export interface SponsorsBlockData    { /* view config only */ }
export interface AmbassadorsBlockData { /* view config only */ }
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
  items: { url: string; caption?: string }[];
}

export interface SplitBlockData {
  leftBlockId:  string | null;
  rightBlockId: string | null;
  leftPercent:  number; // 20–80, default 50
}

export interface ContainerBlockData {
  childBlockIds:       string[];
  backgroundColor:     string;   // '' = transparent
  borderColor:         string;   // '' = no border
  backgroundImageUrl:  string;   // '' = none
  padding:             number;   // px
  gap:                 number;   // px between children
  direction?:          'row' | 'column';  // default 'column'
}

export interface CtaBlockData {
  title: string;
  text: string;
  backgroundColor: string;
  textStyle: TextStyle;
  ctaConfig: CtaConfig;
}

export type BlockData =
  | RichTextBlockData
  | ImageBlockData
  | VideoBlockData
  | GalleryBlockData
  | SplitBlockData
  | ContainerBlockData
  | StatsBlockData
  | DonationWidgetBlockData
  | CtaBlockData
  | DividerBlockData
  | DonorsBlockData
  | SponsorsBlockData
  | AmbassadorsBlockData
  | UpdatesBlockData
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

export interface CampaignReward {
  id: string;
  title: string;
  description: string;
  minimumAmount: number;
  stock: number | null;
  imageUrl: string | null;
  featured?: boolean;
}

export interface CampaignSponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  link: string | null;
}

export interface CampaignAmbassador {
  id:       string;
  name:     string;
  imageUrl: string | null;
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

export interface CampaignLayout {
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
  footerBg:            string;   // default #030712
  footerTextColor:     string;   // default rgba(255,255,255,0.85)
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
  createdAt?:   string;  // ISO timestamp
  updatedAt?:   string;  // ISO timestamp
  publishedAt?: string;  // ISO timestamp

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

  // Step 2 — Rewards
  rewardsEnabled: boolean;
  rewards: CampaignReward[];

  // Step 3 — Sponsors
  sponsors: CampaignSponsor[];

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
    showEntityName: true,
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
    rewardsEnabled: true,
    rewards: [],
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
          label: '',
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
          label: '',
          spacingTop: 0,
          spacingBottom: 0,
          data: defaultBlockData('stats'),
        },
        {
          id: donationId,
          type: 'donation-widget' as BlockType,
          order: 2,
          visible: true,
          label: '',
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
          label: '',
          data: {},
        },
        {
          id: generateId(),
          type: 'ambassadors' as BlockType,
          order: 4, visible: true, spacingTop: 0, spacingBottom: 0, label: '',
          data: defaultBlockData('ambassadors'),
        },
        {
          id: generateId(),
          type: 'donors' as BlockType,
          order: 5, visible: true, spacingTop: 0, spacingBottom: 0, label: '',
          data: defaultBlockData('donors'),
        },
        {
          id: generateId(),
          type: 'updates' as BlockType,
          order: 6, visible: true, spacingTop: 0, spacingBottom: 0, label: '',
          data: defaultBlockData('updates'),
        },
      ];
    })(),
    layout: {
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

  draft$ = this.draftSubject.asObservable();

  get draft(): CampaignDraft {
    return this.draftSubject.value;
  }

  patch(partial: Partial<CampaignDraft>): void {
    this.draftSubject.next({ ...this.draft, ...partial });
  }

  sync(): void {
    this.draftSubject.next({ ...this.draft });
  }

  reset(): void {
    this.draftSubject.next(createInitialDraft());
  }

  // Block operations
  addBlock(type: BlockType): void {
    const blocks = [...this.draft.blocks];
    const maxOrder = blocks.reduce((max, b) => Math.max(max, b.order), 0);
    blocks.push({
      id: generateId(),
      type,
      order: maxOrder + 1,
      visible: true,
      label: '',
      spacingTop: 0,
      spacingBottom: 0,
      data: defaultBlockData(type),
    });
    this.patch({ blocks });
  }

  removeBlock(id: string): void {
    this.patch({ blocks: this.draft.blocks.filter(b => b.id !== id) });
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
}

function defaultBlockData(type: BlockType): BlockData {
  switch (type) {
    case 'rich-text':   return { content: '', lineHeight: 1.6 };
    case 'image':       return { url: '' };
    case 'video':       return { url: '' };
    case 'gallery':     return { items: [] };
    case 'split':       return { leftBlockId: null, rightBlockId: null, leftPercent: 50 } as SplitBlockData;
    case 'container':   return { childBlockIds: [], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData;
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
    case 'cta':         return {
      title: '', text: '', backgroundColor: '#14532d',
      textStyle: { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'bottom' },
      ctaConfig: { visible: true, label: 'תרמו עכשיו', color: '#7c3aed', align: 'center', icon: '' },
    } as CtaBlockData;
    default:            return {};
  }
}
