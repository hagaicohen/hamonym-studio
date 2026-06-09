import { CampaignBlock, ContainerBlockData, StatsBlockData, DonationWidgetBlockData } from '../../services/campaign-studio-state.service';

function gid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  accent: string;
  preview: TemplatePreviewRow[];
  createBlocks(): CampaignBlock[];
  layout: Record<string, any>;
}

export interface TemplatePreviewRow {
  cols: { flex: number; color: string; height: number }[];
}

// ─────────────────────────────────────
// CLASSIC — balanced, green-teal
// ─────────────────────────────────────
function classicBlocks(): CampaignBlock[] {
  const statsId    = gid();
  const donationId = gid();
  const ctId       = gid();
  return [
    { id: ctId, type: 'container', order: 1, visible: true, label: 'מסגרת ראשית', spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [statsId, donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'row', splitPercent: 55 } as ContainerBlockData },
    { id: statsId, type: 'stats', order: 1, visible: true, label: 'פס נתונים', spacingTop: 0, spacingBottom: 0, data: { style: 'cards', size: 'md', iconColor: '#22c55e', backgroundColor: '', borderColor: '', borderRadius: 12, items: defaultStatItems() } as StatsBlockData },
    { id: donationId, type: 'donation-widget', order: 2, visible: true, label: 'תיבת תרומה', spacingTop: 0, spacingBottom: 0, data: defaultDonationData() },
    { id: gid(), type: 'rich-text', order: 2, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'rewards', order: 3, visible: true, label: 'תשורות', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 4, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors', order: 5, visible: true, label: 'תורמים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates', order: 6, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'slider' } },
  ];
}

// ─────────────────────────────────────
// GENEROUS — donation-first, purple
// ─────────────────────────────────────
function generousBlocks(): CampaignBlock[] {
  const statsId    = gid();
  const donationId = gid();
  const ctId       = gid();
  return [
    { id: ctId, type: 'container', order: 1, visible: true, label: 'מסגרת ראשית', spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId, statsId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'row', splitPercent: 60 } as ContainerBlockData },
    { id: donationId, type: 'donation-widget', order: 1, visible: true, label: 'תיבת תרומה', spacingTop: 0, spacingBottom: 0,
      data: { ...defaultDonationData(), ctaColor: '#7c3aed', ctaLabel: 'תרמו עכשיו', ctaIcon: '❤️' } },
    { id: statsId, type: 'stats', order: 2, visible: true, label: 'פס נתונים', spacingTop: 0, spacingBottom: 0,
      data: { style: 'inline', size: 'sm', iconColor: '#7c3aed', backgroundColor: '', borderColor: '', borderRadius: 8, items: defaultStatItems() } as StatsBlockData },
    { id: gid(), type: 'rich-text', order: 2, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'cta', order: 3, visible: true, label: 'קריאה לפעולה', spacingTop: 0, spacingBottom: 0,
      data: { title: 'הצטרפו אלינו', text: 'כל תרומה מקרבת אותנו ליעד', backgroundColor: '#7c3aed', textStyle: { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'center' }, ctaConfig: { visible: true, label: 'תרמו עכשיו', color: '#ffffff', align: 'center', icon: '❤️' } } },
    { id: gid(), type: 'rewards', order: 4, visible: true, label: 'תשורות', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors', order: 5, visible: true, label: 'תורמים', spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

// ─────────────────────────────────────
// COMMUNITY — ambassadors-first, blue
// ─────────────────────────────────────
function communityBlocks(): CampaignBlock[] {
  const statsId    = gid();
  const donationId = gid();
  const ctId       = gid();
  return [
    { id: statsId, type: 'stats', order: 1, visible: true, label: 'פס נתונים', spacingTop: 0, spacingBottom: 0,
      data: { style: 'inline', size: 'lg', iconColor: '#3b82f6', backgroundColor: '#eff6ff', borderColor: '#bfdbfe', borderRadius: 0, items: defaultStatItems() } as StatsBlockData },
    { id: ctId, type: 'container', order: 2, visible: true, label: 'מסגרת ראשית', spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData },
    { id: donationId, type: 'donation-widget', order: 1, visible: true, label: 'תיבת תרומה', spacingTop: 0, spacingBottom: 0,
      data: { ...defaultDonationData(), ctaColor: '#3b82f6', ctaLabel: 'הצטרפו לקהילה' } },
    { id: gid(), type: 'ambassadors', order: 3, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'rich-text', order: 4, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'donors', order: 5, visible: true, label: 'תורמים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates', order: 6, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
    { id: gid(), type: 'rewards', order: 7, visible: true, label: 'תשורות', spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

// ─────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────
function defaultStatItems() {
  return [
    { key: 'raised',          order: 1, visible: true },
    { key: 'target',          order: 2, visible: true },
    { key: 'percent',         order: 3, visible: true },
    { key: 'supporters',      order: 4, visible: true },
    { key: 'days_remaining',  order: 5, visible: true },
    { key: 'ambassadors',     order: 6, visible: false },
    { key: 'start_date',      order: 7, visible: false },
    { key: 'end_date',        order: 8, visible: false },
  ];
}

function defaultDonationData(): DonationWidgetBlockData {
  return {
    title: 'תמכו עכשיו',
    subtitle: 'כל תרומה מקרבת אותנו ליעד',
    ctaLabel: 'תרמו עכשיו',
    ctaColor: '#22c55e',
    ctaIcon: '',
    paymentLogos: ['visa', 'mastercard'],
  } as DonationWidgetBlockData;
}

// ─────────────────────────────────────
// TEMPLATE REGISTRY
// ─────────────────────────────────────
export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: 'classic',
    name: 'קלאסי',
    description: 'פריסה מאוזנת. נתוני קמפיין ותרומה זה לצד זה, ואחריהם הסיפור, תשורות ושגרירים.',
    accent: '#22c55e',
    preview: [
      { cols: [{ flex: 1, color: '#d1fae5', height: 48 }] },
      { cols: [{ flex: 55, color: '#a7f3d0', height: 80 }, { flex: 45, color: '#bbf7d0', height: 80 }] },
      { cols: [{ flex: 1, color: '#e0f2fe', height: 36 }] },
      { cols: [{ flex: 1, color: '#f0fdf4', height: 28 }] },
      { cols: [{ flex: 1, color: '#dcfce7', height: 28 }] },
    ],
    createBlocks: classicBlocks,
    layout: {
      theme: { primaryColor: '#333333', secondaryColor: '#22c55e', accentColor: '#10b981', bodyTextColor: '#334155', logoBg: '#ffffff', topStripBg: '#052e16', rewardsBg: '#014737', rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#86efac', lineColor: '#d1fae5' },
    },
  },
  {
    id: 'generous',
    name: 'נדיב',
    description: 'תרומה בחזית. תיבת התרומה בולטת, עם קריאה לפעולה חזקה וצבעים חמים.',
    accent: '#7c3aed',
    preview: [
      { cols: [{ flex: 1, color: '#ede9fe', height: 48 }] },
      { cols: [{ flex: 60, color: '#c4b5fd', height: 90 }, { flex: 40, color: '#ddd6fe', height: 90 }] },
      { cols: [{ flex: 1, color: '#7c3aed', height: 36 }] },
      { cols: [{ flex: 1, color: '#f5f3ff', height: 28 }] },
      { cols: [{ flex: 1, color: '#ede9fe', height: 28 }] },
    ],
    createBlocks: generousBlocks,
    layout: {
      theme: { primaryColor: '#4c1d95', secondaryColor: '#7c3aed', accentColor: '#a78bfa', bodyTextColor: '#1e1b4b', logoBg: '#ffffff', topStripBg: '#2e1065', rewardsBg: '#2e1065', rewardCardBorder: 'rgba(255,255,255,.15)', rewardCardBorderActive: '#c4b5fd', lineColor: '#e9d5ff' },
    },
  },
  {
    id: 'community',
    name: 'קהילה',
    description: 'מתמקד בקהילה. שגרירים ותורמים בחזית, נתוני הגיוס בסרגל עליון.',
    accent: '#3b82f6',
    preview: [
      { cols: [{ flex: 1, color: '#bfdbfe', height: 32 }] },
      { cols: [{ flex: 1, color: '#dbeafe', height: 48 }] },
      { cols: [{ flex: 1, color: '#93c5fd', height: 60 }] },
      { cols: [{ flex: 1, color: '#e0f2fe', height: 36 }] },
      { cols: [{ flex: 1, color: '#eff6ff', height: 28 }] },
    ],
    createBlocks: communityBlocks,
    layout: {
      theme: { primaryColor: '#1e3a5f', secondaryColor: '#3b82f6', accentColor: '#60a5fa', bodyTextColor: '#1e293b', logoBg: '#ffffff', topStripBg: '#1e3a5f', rewardsBg: '#1e3a5f', rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: '#93c5fd', lineColor: '#bfdbfe' },
    },
  },
];
