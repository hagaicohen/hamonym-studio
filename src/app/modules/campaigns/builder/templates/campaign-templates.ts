import {
  CampaignBlock,
  ContainerBlockData,
  StatsBlockData,
  DonationWidgetBlockData,
  LayoutMode,
} from '../../services/campaign-studio-state.service';

function gid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  layoutMode: LayoutMode;
  preview: TemplatePreviewRow[];
  createBlocks(): CampaignBlock[];
  themeOverride: Record<string, any>;
}

export interface TemplatePreviewRow {
  cols: { flex: number; color: string; height: number }[];
}

// ─────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────
function statItems(ambassadorsVisible = false) {
  return [
    { key: 'raised',         order: 1, visible: true },
    { key: 'target',         order: 2, visible: true },
    { key: 'percent',        order: 3, visible: true },
    { key: 'supporters',     order: 4, visible: true },
    { key: 'days_remaining', order: 5, visible: true },
    { key: 'ambassadors',    order: 6, visible: ambassadorsVisible },
    { key: 'start_date',     order: 7, visible: false },
    { key: 'end_date',       order: 8, visible: false },
  ];
}

function donationData(overrides: Partial<DonationWidgetBlockData> = {}): DonationWidgetBlockData {
  return {
    title: 'תמכו עכשיו',
    subtitle: 'כל תרומה מקרבת אותנו ליעד',
    ctaLabel: 'תרמו עכשיו',
    ctaColor: '#22c55e',
    ctaIcon: '',
    showSecurityBadge: true,
    showPaymentLogos: true,
    paymentLogos: ['visa', 'mastercard'],
    ...overrides,
  } as DonationWidgetBlockData;
}

function statsBlock(
  id: string,
  order: number,
  style: 'cards' | 'inline',
  size: 'sm' | 'md' | 'lg',
  iconColor: string,
  bg: string = '',
  border: string = '',
  ambassadors = false,
): CampaignBlock {
  return {
    id, type: 'stats', order, visible: true, label: 'פס נתונים',
    spacingTop: 0, spacingBottom: 0,
    data: { style, size, iconColor, backgroundColor: bg, borderColor: border, borderRadius: 12, items: statItems(ambassadors) } as StatsBlockData,
  };
}

function donationBlock(id: string, order: number, overrides: Partial<DonationWidgetBlockData> = {}): CampaignBlock {
  return {
    id, type: 'donation-widget', order, visible: true, label: 'תיבת תרומה',
    spacingTop: 0, spacingBottom: 0,
    data: donationData(overrides),
  };
}

// ─────────────────────────────────────
// 1. קלאסית — Classic
// ─────────────────────────────────────
function classicBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: ctId, type: 'container', order: 1, visible: true, label: 'מסגרת ראשית',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [statsId, donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 16, direction: 'row', splitPercent: 55 } as ContainerBlockData },
    statsBlock(statsId, 1, 'cards', 'md', '#22c55e'),
    donationBlock(donationId, 2),
    { id: gid(), type: 'rich-text', order: 2, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'rewards',   order: 3, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 4, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',    order: 5, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',   order: 6, visible: true, label: 'עדכונים',  spacingTop: 0, spacingBottom: 0, data: { viewMode: 'slider' } },
  ];
}

// ─────────────────────────────────────
// 2. תמונה גדולה — Large Hero
// ─────────────────────────────────────
function largeHeroBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid();
  return [
    statsBlock(statsId, 1, 'inline', 'lg', '#0ea5e9', '#f0f9ff', '#bae6fd'),
    donationBlock(donationId, 2, { ctaColor: '#0ea5e9' }),
    { id: gid(), type: 'rich-text', order: 3, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'gallery',   order: 4, visible: true, label: 'גלריה',    spacingTop: 0, spacingBottom: 0, data: { items: [], style: 'slider', aspectRatio: '16:9', showCaptions: false, showDots: true, showArrows: true, autoPlay: false } },
    { id: gid(), type: 'rewards',   order: 5, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',    order: 6, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

// ─────────────────────────────────────
// 3. סיידבר ימין — Sidebar Right
// Nested containers: outer row → sidebar-col (right, 36%) + content-col (left, 64%)
// In RTL flex-row: first child appears on the RIGHT side
// ─────────────────────────────────────
function sidebarRightBlocks(): CampaignBlock[] {
  const outerCtId  = gid();
  const sidebarCtId = gid();  // appears RIGHT (first child in RTL)
  const contentCtId = gid();  // appears LEFT  (second child in RTL)
  const statsId    = gid();
  const donationId = gid();
  const richTextId = gid();
  return [
    { id: outerCtId, type: 'container', order: 1, visible: true, label: 'פריסת דף',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [sidebarCtId, contentCtId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 24, gap: 32, direction: 'row', splitPercent: 36 } as ContainerBlockData },
    { id: sidebarCtId, type: 'container', order: 1, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [statsId, donationId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 0, gap: 16, direction: 'column' } as ContainerBlockData },
    { id: contentCtId, type: 'container', order: 2, visible: true, label: 'אזור תוכן',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [richTextId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 0, gap: 24, direction: 'column' } as ContainerBlockData },
    statsBlock(statsId, 1, 'cards', 'sm', '#7c3aed'),
    donationBlock(donationId, 2, { ctaColor: '#7c3aed' }),
    { id: richTextId, type: 'rich-text', order: 1, visible: true, label: 'על המיזם',
      spacingTop: 0, spacingBottom: 0, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'rewards',     order: 2, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 3, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 4, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 5, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

// ─────────────────────────────────────
// 4. סיידבר שמאל — Sidebar Left
// Nested containers: outer row → content-col (right, 64%) + sidebar-col (left, 36%)
// In RTL flex-row: first child appears on the RIGHT side
// ─────────────────────────────────────
function sidebarLeftBlocks(): CampaignBlock[] {
  const outerCtId  = gid();
  const contentCtId = gid();  // appears RIGHT (first child in RTL)
  const sidebarCtId = gid();  // appears LEFT  (second child in RTL)
  const statsId    = gid();
  const donationId = gid();
  const richTextId = gid();
  return [
    { id: outerCtId, type: 'container', order: 1, visible: true, label: 'פריסת דף',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [contentCtId, sidebarCtId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 24, gap: 32, direction: 'row', splitPercent: 64 } as ContainerBlockData },
    { id: contentCtId, type: 'container', order: 1, visible: true, label: 'אזור תוכן',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [richTextId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 0, gap: 24, direction: 'column' } as ContainerBlockData },
    { id: sidebarCtId, type: 'container', order: 2, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [statsId, donationId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 0, gap: 16, direction: 'column' } as ContainerBlockData },
    statsBlock(statsId, 1, 'cards', 'sm', '#f59e0b'),
    donationBlock(donationId, 2, { ctaColor: '#f59e0b' }),
    { id: richTextId, type: 'rich-text', order: 1, visible: true, label: 'על המיזם',
      spacingTop: 0, spacingBottom: 0, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'rewards',     order: 2, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 3, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 4, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 5, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

// ─────────────────────────────────────
// 5. תרומה במרכז — Donation First
// ─────────────────────────────────────
function donationFirstBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: ctId, type: 'container', order: 1, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId, statsId], backgroundColor: '#fefce8', borderColor: '', backgroundImageUrl: '', padding: 24, gap: 16, direction: 'row', splitPercent: 60 } as ContainerBlockData },
    donationBlock(donationId, 1, { ctaColor: '#d97706', ctaLabel: 'תרמו עכשיו', title: 'תמכו במיזם' }),
    statsBlock(statsId, 2, 'cards', 'sm', '#d97706'),
    { id: gid(), type: 'rich-text',   order: 2, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 16, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'cta',         order: 3, visible: true, label: 'קריאה לפעולה', spacingTop: 0, spacingBottom: 0,
      data: { title: 'כל תרומה עושה את ההבדל', text: '', backgroundColor: '#d97706', textStyle: { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'center' }, ctaConfig: { visible: true, label: 'תרמו עכשיו', color: '#ffffff', align: 'center', icon: '' } } },
    { id: gid(), type: 'rewards',     order: 4, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 5, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 6, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

// ─────────────────────────────────────
// 6. סיפור קודם — Story First
// ─────────────────────────────────────
function storyFirstBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: gid(), type: 'rich-text', order: 1, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 24, data: { content: '', lineHeight: 1.8 } },
    { id: gid(), type: 'image',     order: 2, visible: true, label: 'תמונה',    spacingTop: 0,  spacingBottom: 0,  data: { url: '', caption: '' } },
    statsBlock(statsId, 3, 'inline', 'lg', '#10b981', '#ecfdf5', '#a7f3d0'),
    { id: ctId, type: 'container', order: 4, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData },
    donationBlock(donationId, 1, { ctaColor: '#10b981' }),
    { id: gid(), type: 'rewards',     order: 5, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 6, visible: true, label: 'עדכונים',  spacingTop: 0, spacingBottom: 0, data: { viewMode: 'slider' } },
    { id: gid(), type: 'donors',      order: 7, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 8, visible: true, label: 'שגרירים',  spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

// ─────────────────────────────────────
// 7. שגרירים במרכז — Ambassadors First
// ─────────────────────────────────────
function ambassadorsFirstBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid();
  return [
    statsBlock(statsId, 1, 'inline', 'lg', '#3b82f6', '#eff6ff', '#bfdbfe', true),
    { id: gid(), type: 'ambassadors', order: 2, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'rich-text',   order: 3, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    donationBlock(donationId, 4, { ctaColor: '#3b82f6', ctaLabel: 'הצטרפו לקהילה' }),
    { id: gid(), type: 'rewards',     order: 5, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 6, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 7, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

// ─────────────────────────────────────
// 8. מגזין/כתבה — Magazine
// ─────────────────────────────────────
function magazineBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: gid(), type: 'rich-text', order: 1, visible: true, label: 'כותרת ראשית', spacingTop: 24, spacingBottom: 8,  data: { content: '', lineHeight: 1.5 } },
    { id: gid(), type: 'image',     order: 2, visible: true, label: 'תמונה',        spacingTop: 0,  spacingBottom: 0,  data: { url: '', caption: '' } },
    { id: gid(), type: 'rich-text', order: 3, visible: true, label: 'גוף הכתבה',   spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.9 } },
    statsBlock(statsId, 4, 'cards', 'sm', '#ec4899', '#fdf2f8', '#fbcfe8'),
    donationBlock(donationId, 5, { ctaColor: '#ec4899', title: 'תמכו בכתבה' }),
    { id: gid(), type: 'gallery',   order: 6, visible: true, label: 'גלריה', spacingTop: 0, spacingBottom: 0, data: { items: [], style: 'grid', aspectRatio: '4:3', showCaptions: true, showDots: false, showArrows: false, autoPlay: false } },
    { id: gid(), type: 'updates',   order: 7, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
    { id: gid(), type: 'rewards',   order: 8, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',    order: 9, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

// ─────────────────────────────────────
// 9. וידאו ראשון — Video Hero
// ─────────────────────────────────────
function videoHeroBlocks(): CampaignBlock[] {
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    statsBlock(statsId, 1, 'inline', 'lg', '#ef4444', '#fef2f2', '#fecaca'),
    { id: ctId, type: 'container', order: 2, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData },
    donationBlock(donationId, 1, { ctaColor: '#ef4444', ctaLabel: 'תמכו עכשיו' }),
    { id: gid(), type: 'rich-text',   order: 3, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'gallery',     order: 4, visible: true, label: 'גלריה',    spacingTop: 0,  spacingBottom: 0,  data: { items: [], style: 'slider', aspectRatio: '16:9', showCaptions: false, showDots: true, showArrows: true, autoPlay: false } },
    { id: gid(), type: 'rewards',     order: 5, visible: true, label: 'תשורות',   spacingTop: 0,  spacingBottom: 0,  data: {} },
    { id: gid(), type: 'ambassadors', order: 6, visible: true, label: 'שגרירים',  spacingTop: 0,  spacingBottom: 0,  data: {} },
    { id: gid(), type: 'donors',      order: 7, visible: true, label: 'תורמים',   spacingTop: 0,  spacingBottom: 0,  data: {} },
    { id: gid(), type: 'updates',     order: 8, visible: true, label: 'עדכונים',  spacingTop: 0,  spacingBottom: 0,  data: { viewMode: 'slider' } },
  ];
}

// ─────────────────────────────────────
// TEMPLATE REGISTRY
// ─────────────────────────────────────
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [

  // 1 — Classic
  {
    id: 'classic',
    name: 'קלאסי',
    description: 'פריסה מאוזנת. נתוני קמפיין ותרומה זה לצד זה, ואחריהם הסיפור, תשורות ושגרירים.',
    accent: '#22c55e',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#d1fae5', height: 48 }] },
      { cols: [{ flex: 55, color: '#a7f3d0', height: 80 }, { flex: 45, color: '#bbf7d0', height: 80 }] },
      { cols: [{ flex: 1, color: '#e0f2fe', height: 36 }] },
      { cols: [{ flex: 1, color: '#f0fdf4', height: 28 }] },
      { cols: [{ flex: 1, color: '#dcfce7', height: 28 }] },
    ],
    createBlocks: classicBlocks,
    themeOverride: {
      primaryColor: '#333333', secondaryColor: '#22c55e', accentColor: '#10b981', bodyTextColor: '#334155',
      logoBg: '#ffffff', topStripBg: '#052e16', rewardsBg: '#014737',
      rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#86efac', lineColor: '#d1fae5',
    },
  },

  // 2 — Large Hero
  {
    id: 'large-hero',
    name: 'תמונה גדולה',
    description: 'תמונת רקע מרשימה תופסת את כל המסך. מושלם לקמפיינים ויזואליים.',
    accent: '#0ea5e9',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#bae6fd', height: 96 }] },
      { cols: [{ flex: 1, color: '#e0f2fe', height: 40 }] },
      { cols: [{ flex: 1, color: '#7dd3fc', height: 60 }] },
      { cols: [{ flex: 1, color: '#f0f9ff', height: 28 }] },
      { cols: [{ flex: 1, color: '#e0f2fe', height: 28 }] },
    ],
    createBlocks: largeHeroBlocks,
    themeOverride: {
      primaryColor: '#0c4a6e', secondaryColor: '#0ea5e9', accentColor: '#38bdf8', bodyTextColor: '#0f172a',
      logoBg: '#ffffff', topStripBg: '#0c4a6e', rewardsBg: '#0c4a6e',
      rewardCardBorder: 'rgba(255,255,255,.15)', rewardCardBorderActive: '#7dd3fc', lineColor: '#bae6fd',
    },
  },

  // 3 — Sidebar Right
  {
    id: 'sidebar-right',
    name: 'סיידבר ימין',
    description: 'תיבת התרומה והנתונים בצד ימין. תוכן הסיפור בצד שמאל. ניתן להוסיף עוד תוכן לכל עמודה.',
    accent: '#7c3aed',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#ede9fe', height: 48 }] },
      { cols: [{ flex: 65, color: '#ddd6fe', height: 100 }, { flex: 35, color: '#c4b5fd', height: 100 }] },
      { cols: [{ flex: 65, color: '#f5f3ff', height: 28 }, { flex: 35, color: '#c4b5fd', height: 28 }] },
      { cols: [{ flex: 65, color: '#ede9fe', height: 28 }, { flex: 35, color: '#c4b5fd', height: 28 }] },
    ],
    createBlocks: sidebarRightBlocks,
    themeOverride: {
      primaryColor: '#4c1d95', secondaryColor: '#7c3aed', accentColor: '#a78bfa', bodyTextColor: '#1e1b4b',
      logoBg: '#ffffff', topStripBg: '#2e1065', rewardsBg: '#2e1065',
      rewardCardBorder: 'rgba(255,255,255,.15)', rewardCardBorderActive: '#c4b5fd', lineColor: '#e9d5ff',
    },
  },

  // 4 — Sidebar Left
  {
    id: 'sidebar-left',
    name: 'סיידבר שמאל',
    description: 'תיבת התרומה והנתונים בצד שמאל. תוכן הסיפור בצד ימין. ניתן להוסיף עוד תוכן לכל עמודה.',
    accent: '#f59e0b',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#fef3c7', height: 48 }] },
      { cols: [{ flex: 35, color: '#fcd34d', height: 100 }, { flex: 65, color: '#fef3c7', height: 100 }] },
      { cols: [{ flex: 35, color: '#fcd34d', height: 28 }, { flex: 65, color: '#fffbeb', height: 28 }] },
      { cols: [{ flex: 35, color: '#fcd34d', height: 28 }, { flex: 65, color: '#fef3c7', height: 28 }] },
    ],
    createBlocks: sidebarLeftBlocks,
    themeOverride: {
      primaryColor: '#78350f', secondaryColor: '#f59e0b', accentColor: '#fbbf24', bodyTextColor: '#292524',
      logoBg: '#ffffff', topStripBg: '#451a03', rewardsBg: '#451a03',
      rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#fcd34d', lineColor: '#fde68a',
    },
  },

  // 5 — Donation First
  {
    id: 'donation-first',
    name: 'תרומה במרכז',
    description: 'תיבת התרומה בולטת בחלק העליון ממש. לגיוסים עם מוטיבציה חזקה לתרומה מיידית.',
    accent: '#d97706',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#fef3c7', height: 48 }] },
      { cols: [{ flex: 60, color: '#fcd34d', height: 90 }, { flex: 40, color: '#fde68a', height: 90 }] },
      { cols: [{ flex: 1, color: '#d97706', height: 36 }] },
      { cols: [{ flex: 1, color: '#fffbeb', height: 28 }] },
      { cols: [{ flex: 1, color: '#fef3c7', height: 28 }] },
    ],
    createBlocks: donationFirstBlocks,
    themeOverride: {
      primaryColor: '#451a03', secondaryColor: '#d97706', accentColor: '#f59e0b', bodyTextColor: '#292524',
      logoBg: '#ffffff', topStripBg: '#451a03', rewardsBg: '#451a03',
      rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#fcd34d', lineColor: '#fde68a',
    },
  },

  // 6 — Story First
  {
    id: 'story-first',
    name: 'סיפור קודם',
    description: 'הסיפור והתמונות מובילים. התרומה מגיעה אחרי שהמבקר השתכנע.',
    accent: '#10b981',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#d1fae5', height: 48 }] },
      { cols: [{ flex: 1, color: '#a7f3d0', height: 60 }] },
      { cols: [{ flex: 1, color: '#ecfdf5', height: 36 }] },
      { cols: [{ flex: 1, color: '#6ee7b7', height: 80 }] },
      { cols: [{ flex: 1, color: '#d1fae5', height: 28 }] },
    ],
    createBlocks: storyFirstBlocks,
    themeOverride: {
      primaryColor: '#064e3b', secondaryColor: '#10b981', accentColor: '#34d399', bodyTextColor: '#1e293b',
      logoBg: '#ffffff', topStripBg: '#064e3b', rewardsBg: '#064e3b',
      rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#6ee7b7', lineColor: '#a7f3d0',
    },
  },

  // 7 — Ambassadors First
  {
    id: 'ambassadors-first',
    name: 'שגרירים במרכז',
    description: 'שגרירי הקמפיין בולטים מיד אחרי הנתונים. מושלם לגיוסים מבוססי קהילה.',
    accent: '#3b82f6',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#bfdbfe', height: 40 }] },
      { cols: [{ flex: 1, color: '#93c5fd', height: 60 }] },
      { cols: [{ flex: 1, color: '#dbeafe', height: 36 }] },
      { cols: [{ flex: 1, color: '#60a5fa', height: 72 }] },
      { cols: [{ flex: 1, color: '#eff6ff', height: 28 }] },
    ],
    createBlocks: ambassadorsFirstBlocks,
    themeOverride: {
      primaryColor: '#1e3a5f', secondaryColor: '#3b82f6', accentColor: '#60a5fa', bodyTextColor: '#1e293b',
      logoBg: '#ffffff', topStripBg: '#1e3a5f', rewardsBg: '#1e3a5f',
      rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#93c5fd', lineColor: '#bfdbfe',
    },
  },

  // 8 — Magazine
  {
    id: 'magazine',
    name: 'מגזין / כתבה',
    description: 'פריסת מגזין עם שני עמודות. מתאים לקמפיינים עם תוכן ארוך ועשיר.',
    accent: '#ec4899',
    layoutMode: 'magazine',
    preview: [
      { cols: [{ flex: 1, color: '#fce7f3', height: 48 }] },
      { cols: [{ flex: 60, color: '#fbcfe8', height: 90 }, { flex: 40, color: '#f9a8d4', height: 90 }] },
      { cols: [{ flex: 60, color: '#fdf2f8', height: 40 }, { flex: 40, color: '#f9a8d4', height: 40 }] },
      { cols: [{ flex: 1, color: '#fce7f3', height: 28 }] },
    ],
    createBlocks: magazineBlocks,
    themeOverride: {
      primaryColor: '#831843', secondaryColor: '#ec4899', accentColor: '#f472b6', bodyTextColor: '#1e1b4b',
      logoBg: '#ffffff', topStripBg: '#500724', rewardsBg: '#500724',
      rewardCardBorder: 'rgba(255,255,255,.15)', rewardCardBorderActive: '#f9a8d4', lineColor: '#fbcfe8',
    },
  },

  // 9 — Video Hero
  {
    id: 'video-hero',
    name: 'וידאו ראשון',
    description: 'הוידאו שלכם תופס את הבמה הראשית. נתוני הגיוס ותרומה ממש מתחת.',
    accent: '#ef4444',
    layoutMode: 'standard',
    preview: [
      { cols: [{ flex: 1, color: '#fee2e2', height: 80 }] },
      { cols: [{ flex: 1, color: '#fca5a5', height: 40 }] },
      { cols: [{ flex: 1, color: '#fef2f2', height: 60 }] },
      { cols: [{ flex: 1, color: '#f87171', height: 36 }] },
      { cols: [{ flex: 1, color: '#fee2e2', height: 28 }] },
    ],
    createBlocks: videoHeroBlocks,
    themeOverride: {
      primaryColor: '#450a0a', secondaryColor: '#ef4444', accentColor: '#f87171', bodyTextColor: '#1e293b',
      logoBg: '#ffffff', topStripBg: '#450a0a', rewardsBg: '#450a0a',
      rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#fca5a5', lineColor: '#fecaca',
    },
  },
];
