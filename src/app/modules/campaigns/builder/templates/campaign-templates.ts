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

// ─────────────────────────────────────
// COLOR PALETTES
// A palette is a single base color. Every other color a template needs
// (dark strip, pale background, active border, etc.) is derived from it
// at selection time — this is what lets the Template Picker offer ready
// palette swatches without a full 9-field color picker (see DECISIONS.md,
// "Template Picker palette swatches").
// ─────────────────────────────────────
export interface TemplatePalette {
  id: string;
  name: string;
  base: string;
}

export const TEMPLATE_PALETTES: TemplatePalette[] = [
  { id: 'purple', name: 'סגול',     base: '#7c3aed' },
  { id: 'blue',   name: 'כחול',     base: '#0ea5e9' },
  { id: 'green',  name: 'ירוק',     base: '#22c55e' },
  { id: 'teal',   name: 'טורקיז',   base: '#10b981' },
  { id: 'orange', name: 'כתום',     base: '#f59e0b' },
  { id: 'red',    name: 'אדום',     base: '#ef4444' },
  { id: 'pink',   name: 'ורוד',     base: '#ec4899' },
  { id: 'slate',  name: 'אפור כהה', base: '#475569' },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const num = parseInt(v, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mix(hex: string, target: [number, number, number], t: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (target[0] - r) * t, g + (target[1] - g) * t, b + (target[2] - b) * t);
}

const WHITE: [number, number, number] = [255, 255, 255];
const BLACK: [number, number, number] = [0, 0, 0];

interface Shades {
  accent: string;
  light: string;
  pale: string;
  paleBg: string;
  dark: string;
}

function shadesOf(base: string): Shades {
  return {
    accent: base,
    light: mix(base, WHITE, 0.35),
    pale: mix(base, WHITE, 0.72),
    paleBg: mix(base, WHITE, 0.93),
    dark: mix(base, BLACK, 0.5),
  };
}

function buildTheme(palette: TemplatePalette): Record<string, any> {
  const s = shadesOf(palette.base);
  return {
    primaryColor: s.dark, secondaryColor: s.accent, accentColor: s.light, bodyTextColor: '#1e293b',
    logoBg: '#ffffff', topStripBg: s.dark, rewardsBg: s.dark,
    rewardCardBorder: 'rgba(255,255,255,.12)', rewardCardBorderActive: s.light, lineColor: s.paleBg,
  };
}

export interface CampaignTemplate {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  defaultPaletteId: string;
  // Independent of layoutMode on purpose — layoutMode says where the sidebar
  // rail is, heroPlacement says where the Hero sits. Only meaningful for the
  // two sidebar layoutModes; absent = today's full-page-width Hero.
  // See DECISIONS.md (2026-07-16).
  heroPlacement?: 'full-width' | 'main-column';
  buildPreview(palette: TemplatePalette): TemplatePreviewRow[];
  createBlocks(palette: TemplatePalette): CampaignBlock[];
  buildTheme(palette: TemplatePalette): Record<string, any>;
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

function previewRows(rows: { cols: { flex: number; tone: keyof Shades; height: number }[] }[], s: Shades): TemplatePreviewRow[] {
  return rows.map((row) => ({
    cols: row.cols.map((col) => ({ flex: col.flex, height: col.height, color: s[col.tone] })),
  }));
}

// ─────────────────────────────────────
// 1. קלאסית — Classic
// ─────────────────────────────────────
function classicBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: ctId, type: 'container', order: 1, visible: true, label: 'מסגרת ראשית',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [statsId, donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 16, direction: 'row', splitPercent: 55 } as ContainerBlockData },
    statsBlock(statsId, 1, 'cards', 'md', s.accent),
    donationBlock(donationId, 2, { ctaColor: s.accent }),
    { id: gid(), type: 'rich-text', order: 2, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'rewards',   order: 3, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 4, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',    order: 5, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',   order: 6, visible: true, label: 'עדכונים',  spacingTop: 0, spacingBottom: 0, data: { viewMode: 'slider' } },
  ];
}

function classicPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'paleBg', height: 48 }] },
    { cols: [{ flex: 55, tone: 'pale', height: 80 }, { flex: 45, tone: 'light', height: 80 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 36 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 2. תמונה גדולה — Large Hero
// ─────────────────────────────────────
function largeHeroBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid();
  return [
    statsBlock(statsId, 1, 'inline', 'lg', s.accent, s.paleBg, s.pale),
    donationBlock(donationId, 2, { ctaColor: s.accent }),
    { id: gid(), type: 'rich-text', order: 3, visible: true, label: 'על המיזם', spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'gallery',   order: 4, visible: true, label: 'גלריה',    spacingTop: 0, spacingBottom: 0, data: { items: [], style: 'slider', aspectRatio: '16:9', showCaptions: false, showDots: true, showArrows: true, autoPlay: false } },
    { id: gid(), type: 'rewards',   order: 5, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',    order: 6, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

function largeHeroPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'pale', height: 96 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 40 }] },
    { cols: [{ flex: 1, tone: 'light', height: 60 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 3. סיידבר ימין — Sidebar Right
// Nested containers: outer row → sidebar-col (right, 36%) + content-col (left, 64%)
// In RTL flex-row: first child appears on the RIGHT side
// ─────────────────────────────────────
function sidebarRightBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
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
    statsBlock(statsId, 1, 'cards', 'sm', s.accent),
    donationBlock(donationId, 2, { ctaColor: s.accent }),
    { id: richTextId, type: 'rich-text', order: 1, visible: true, label: 'על המיזם',
      spacingTop: 0, spacingBottom: 0, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'rewards',     order: 2, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 3, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 4, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 5, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

function sidebarRightPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'paleBg', height: 48 }] },
    { cols: [{ flex: 35, tone: 'light', height: 100 }, { flex: 65, tone: 'pale', height: 100 }] },
    { cols: [{ flex: 35, tone: 'light', height: 28 }, { flex: 65, tone: 'paleBg', height: 28 }] },
    { cols: [{ flex: 35, tone: 'light', height: 28 }, { flex: 65, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 4. סיידבר שמאל — Sidebar Left
// Nested containers: outer row → content-col (right, 64%) + sidebar-col (left, 36%)
// In RTL flex-row: first child appears on the RIGHT side
// ─────────────────────────────────────
function sidebarLeftBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
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
    statsBlock(statsId, 1, 'cards', 'sm', s.accent),
    donationBlock(donationId, 2, { ctaColor: s.accent }),
    { id: richTextId, type: 'rich-text', order: 1, visible: true, label: 'על המיזם',
      spacingTop: 0, spacingBottom: 0, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'rewards',     order: 2, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 3, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 4, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 5, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

function sidebarLeftPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'paleBg', height: 48 }] },
    { cols: [{ flex: 65, tone: 'paleBg', height: 100 }, { flex: 35, tone: 'light', height: 100 }] },
    { cols: [{ flex: 65, tone: 'paleBg', height: 28 }, { flex: 35, tone: 'light', height: 28 }] },
    { cols: [{ flex: 65, tone: 'paleBg', height: 28 }, { flex: 35, tone: 'light', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 3b/4b. סיידבר לאורך כל העמוד (ימין/שמאל) — Hero בעמודה הראשית
// layoutMode stays the dedicated 'sidebar-right'/'sidebar-left' value (Left
// vs right is entirely CSS-driven — .page-layout-sidebar--right/--left — so
// one block set serves both). Both halves are real top-level containers —
// the rail (railZone:'sidebar') and the main column (railZone:'main',
// holding a 'hero' block plus the "about" text) — so both are normal,
// editable containers in the Page Builder: the user can add/reorder any
// block type into either via the existing container UI. See
// DECISIONS.md (2026-07-16, 2026-07-17).
// ─────────────────────────────────────
function sidebarFullHeightBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const railCtId = gid();
  const mainCtId = gid();
  const statsId = gid(), donationId = gid();
  const heroId = gid(), richTextId = gid();
  return [
    { id: railCtId, type: 'container', order: 1, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [statsId, donationId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 0, gap: 16, direction: 'column',
              railZone: 'sidebar' } as ContainerBlockData },
    statsBlock(statsId, 1, 'cards', 'sm', s.accent),
    donationBlock(donationId, 2, { ctaColor: s.accent }),
    { id: mainCtId, type: 'container', order: 2, visible: true, label: 'תוכן ראשי',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [heroId, richTextId], backgroundColor: '', borderColor: '',
              backgroundImageUrl: '', padding: 0, gap: 24, direction: 'column',
              railZone: 'main' } as ContainerBlockData },
    { id: heroId, type: 'hero', order: 1, visible: true, label: 'Hero', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: richTextId, type: 'rich-text', order: 2, visible: true, label: 'על המיזם', spacingTop: 0, spacingBottom: 0, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'rewards',     order: 3, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 4, visible: true, label: 'שגרירים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 5, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 6, visible: true, label: 'עדכונים',  spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

function sidebarFullHeightRightPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  // Left column (35%) stays the SAME 'light' tone across every row, reading
  // as one continuous full-height bar; the right column (65%, main) starts
  // 'accent' on row 1 (Hero) then transitions to lighter content tones.
  return previewRows([
    { cols: [{ flex: 35, tone: 'light', height: 48 },  { flex: 65, tone: 'accent', height: 48 } ] },
    { cols: [{ flex: 35, tone: 'light', height: 100 }, { flex: 65, tone: 'pale', height: 100 }] },
    { cols: [{ flex: 35, tone: 'light', height: 28 },  { flex: 65, tone: 'paleBg', height: 28 }] },
    { cols: [{ flex: 35, tone: 'light', height: 28 },  { flex: 65, tone: 'paleBg', height: 28 }] },
  ], s);
}

function sidebarFullHeightLeftPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 65, tone: 'accent', height: 48 }, { flex: 35, tone: 'light', height: 48 } ] },
    { cols: [{ flex: 65, tone: 'pale', height: 100 },  { flex: 35, tone: 'light', height: 100 }] },
    { cols: [{ flex: 65, tone: 'paleBg', height: 28 }, { flex: 35, tone: 'light', height: 28 }] },
    { cols: [{ flex: 65, tone: 'paleBg', height: 28 }, { flex: 35, tone: 'light', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 5. תרומה במרכז — Donation First
// ─────────────────────────────────────
function donationFirstBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: ctId, type: 'container', order: 1, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId, statsId], backgroundColor: s.paleBg, borderColor: '', backgroundImageUrl: '', padding: 24, gap: 16, direction: 'row', splitPercent: 60 } as ContainerBlockData },
    donationBlock(donationId, 1, { ctaColor: s.accent, ctaLabel: 'תרמו עכשיו', title: 'תמכו במיזם' }),
    statsBlock(statsId, 2, 'cards', 'sm', s.accent),
    { id: gid(), type: 'rich-text',   order: 2, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 16, data: { content: '', lineHeight: 1.7 } },
    { id: gid(), type: 'cta',         order: 3, visible: true, label: 'קריאה לפעולה', spacingTop: 0, spacingBottom: 0,
      data: { title: 'כל תרומה עושה את ההבדל', text: '', backgroundColor: s.accent, textStyle: { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'center' }, ctaConfig: { visible: true, label: 'תרמו עכשיו', color: '#ffffff', align: 'center', icon: '' } } },
    { id: gid(), type: 'rewards',     order: 4, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 5, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 6, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

function donationFirstPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'paleBg', height: 48 }] },
    { cols: [{ flex: 60, tone: 'light', height: 90 }, { flex: 40, tone: 'pale', height: 90 }] },
    { cols: [{ flex: 1, tone: 'dark', height: 36 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 6. סיפור קודם — Story First
// ─────────────────────────────────────
function storyFirstBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: gid(), type: 'rich-text', order: 1, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 24, data: { content: '', lineHeight: 1.8 } },
    { id: gid(), type: 'image',     order: 2, visible: true, label: 'תמונה',    spacingTop: 0,  spacingBottom: 0,  data: { url: '', caption: '' } },
    statsBlock(statsId, 3, 'inline', 'lg', s.accent, s.paleBg, s.pale),
    { id: ctId, type: 'container', order: 4, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData },
    donationBlock(donationId, 1, { ctaColor: s.accent }),
    { id: gid(), type: 'rewards',     order: 5, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 6, visible: true, label: 'עדכונים',  spacingTop: 0, spacingBottom: 0, data: { viewMode: 'slider' } },
    { id: gid(), type: 'donors',      order: 7, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'ambassadors', order: 8, visible: true, label: 'שגרירים',  spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

function storyFirstPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'paleBg', height: 48 }] },
    { cols: [{ flex: 1, tone: 'pale', height: 60 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 36 }] },
    { cols: [{ flex: 1, tone: 'light', height: 80 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 7. שגרירים במרכז — Ambassadors First
// ─────────────────────────────────────
function ambassadorsFirstBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid();
  return [
    statsBlock(statsId, 1, 'inline', 'lg', s.accent, s.paleBg, s.pale, true),
    { id: gid(), type: 'ambassadors', order: 2, visible: true, label: 'שגרירים', spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'rich-text',   order: 3, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    donationBlock(donationId, 4, { ctaColor: s.accent, ctaLabel: 'הצטרפו לקהילה' }),
    { id: gid(), type: 'rewards',     order: 5, visible: true, label: 'תשורות',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',      order: 6, visible: true, label: 'תורמים',  spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'updates',     order: 7, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
  ];
}

function ambassadorsFirstPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'pale', height: 40 }] },
    { cols: [{ flex: 1, tone: 'light', height: 60 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 36 }] },
    { cols: [{ flex: 1, tone: 'accent', height: 72 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 8. מגזין/כתבה — Magazine
// ─────────────────────────────────────
function magazineBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    { id: gid(), type: 'rich-text', order: 1, visible: true, label: 'כותרת ראשית', spacingTop: 24, spacingBottom: 8,  data: { content: '', lineHeight: 1.5 } },
    { id: gid(), type: 'image',     order: 2, visible: true, label: 'תמונה',        spacingTop: 0,  spacingBottom: 0,  data: { url: '', caption: '' } },
    { id: gid(), type: 'rich-text', order: 3, visible: true, label: 'גוף הכתבה',   spacingTop: 16, spacingBottom: 16, data: { content: '', lineHeight: 1.9 } },
    statsBlock(statsId, 4, 'cards', 'sm', s.accent, s.paleBg, s.pale),
    donationBlock(donationId, 5, { ctaColor: s.accent, title: 'תמכו בכתבה' }),
    { id: gid(), type: 'gallery',   order: 6, visible: true, label: 'גלריה', spacingTop: 0, spacingBottom: 0, data: { items: [], style: 'grid', aspectRatio: '4:3', showCaptions: true, showDots: false, showArrows: false, autoPlay: false } },
    { id: gid(), type: 'updates',   order: 7, visible: true, label: 'עדכונים', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'list' } },
    { id: gid(), type: 'rewards',   order: 8, visible: true, label: 'תשורות',   spacingTop: 0, spacingBottom: 0, data: {} },
    { id: gid(), type: 'donors',    order: 9, visible: true, label: 'תורמים',   spacingTop: 0, spacingBottom: 0, data: {} },
  ];
}

function magazinePreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'paleBg', height: 48 }] },
    { cols: [{ flex: 60, tone: 'pale', height: 90 }, { flex: 40, tone: 'light', height: 90 }] },
    { cols: [{ flex: 60, tone: 'paleBg', height: 40 }, { flex: 40, tone: 'light', height: 40 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
}

// ─────────────────────────────────────
// 9. וידאו ראשון — Video Hero
// ─────────────────────────────────────
function videoHeroBlocks(palette: TemplatePalette): CampaignBlock[] {
  const s = shadesOf(palette.base);
  const statsId = gid(), donationId = gid(), ctId = gid();
  return [
    statsBlock(statsId, 1, 'inline', 'lg', s.accent, s.paleBg, s.pale),
    { id: ctId, type: 'container', order: 2, visible: true, label: 'אזור תרומה',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: [donationId], backgroundColor: '', borderColor: '', backgroundImageUrl: '', padding: 0, gap: 0, direction: 'column' } as ContainerBlockData },
    donationBlock(donationId, 1, { ctaColor: s.accent, ctaLabel: 'תמכו עכשיו' }),
    { id: gid(), type: 'rich-text',   order: 3, visible: true, label: 'על המיזם', spacingTop: 24, spacingBottom: 16, data: { content: '', lineHeight: 1.6 } },
    { id: gid(), type: 'gallery',     order: 4, visible: true, label: 'גלריה',    spacingTop: 0,  spacingBottom: 0,  data: { items: [], style: 'slider', aspectRatio: '16:9', showCaptions: false, showDots: true, showArrows: true, autoPlay: false } },
    { id: gid(), type: 'rewards',     order: 5, visible: true, label: 'תשורות',   spacingTop: 0,  spacingBottom: 0,  data: {} },
    { id: gid(), type: 'ambassadors', order: 6, visible: true, label: 'שגרירים',  spacingTop: 0,  spacingBottom: 0,  data: {} },
    { id: gid(), type: 'donors',      order: 7, visible: true, label: 'תורמים',   spacingTop: 0,  spacingBottom: 0,  data: {} },
    { id: gid(), type: 'updates',     order: 8, visible: true, label: 'עדכונים',  spacingTop: 0,  spacingBottom: 0,  data: { viewMode: 'slider' } },
  ];
}

function videoHeroPreview(palette: TemplatePalette): TemplatePreviewRow[] {
  const s = shadesOf(palette.base);
  return previewRows([
    { cols: [{ flex: 1, tone: 'pale', height: 80 }] },
    { cols: [{ flex: 1, tone: 'light', height: 40 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 60 }] },
    { cols: [{ flex: 1, tone: 'accent', height: 36 }] },
    { cols: [{ flex: 1, tone: 'paleBg', height: 28 }] },
  ], s);
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
    layoutMode: 'standard',
    defaultPaletteId: 'green',
    buildPreview: classicPreview,
    createBlocks: classicBlocks,
    buildTheme,
  },

  // 2 — Large Hero
  {
    id: 'large-hero',
    name: 'תמונה גדולה',
    description: 'תמונת רקע מרשימה תופסת את כל המסך. מושלם לקמפיינים ויזואליים.',
    layoutMode: 'standard',
    defaultPaletteId: 'blue',
    buildPreview: largeHeroPreview,
    createBlocks: largeHeroBlocks,
    buildTheme,
  },

  // 3 — Sidebar Right (in RTL the sidebar block is first child → appears on physical RIGHT)
  {
    id: 'sidebar-right',
    name: 'סיידבר ימין',
    description: 'תיבת התרומה והנתונים בצד ימין. תוכן הסיפור בצד שמאל. ניתן להוסיף עוד תוכן לכל עמודה.',
    layoutMode: 'standard',
    defaultPaletteId: 'purple',
    buildPreview: sidebarRightPreview,
    createBlocks: sidebarRightBlocks,
    buildTheme,
  },

  // 4 — Sidebar Left (in RTL the sidebar block is second child → appears on physical LEFT)
  {
    id: 'sidebar-left',
    name: 'סיידבר שמאל',
    description: 'תיבת התרומה והנתונים בצד שמאל. תוכן הסיפור בצד ימין. ניתן להוסיף עוד תוכן לכל עמודה.',
    layoutMode: 'standard',
    defaultPaletteId: 'orange',
    buildPreview: sidebarLeftPreview,
    createBlocks: sidebarLeftBlocks,
    buildTheme,
  },

  // 3b — Sidebar Right, full height (Hero beside the sidebar, not above it).
  // layoutMode stays the dedicated 'sidebar-right' value on purpose — see the
  // comment above sidebarFullHeightBlocks. heroPlacement is the new,
  // independent axis that actually produces the visual effect.
  {
    id: 'sidebar-right-hero-column',
    name: 'סיידבר ימין (לאורך כל העמוד)',
    description: 'תיבת התרומה והנתונים לאורך כל גובה העמוד בצד ימין. התמונה הראשית מוצגת בעמודה הראשית, לצד הסיידבר — לא מעליו.',
    layoutMode: 'sidebar-right',
    heroPlacement: 'main-column',
    defaultPaletteId: 'purple',
    buildPreview: sidebarFullHeightRightPreview,
    createBlocks: sidebarFullHeightBlocks,
    buildTheme,
  },

  // 4b — Sidebar Left, full height.
  {
    id: 'sidebar-left-hero-column',
    name: 'סיידבר שמאל (לאורך כל העמוד)',
    description: 'תיבת התרומה והנתונים לאורך כל גובה העמוד בצד שמאל. התמונה הראשית מוצגת בעמודה הראשית, לצד הסיידבר — לא מעליו.',
    layoutMode: 'sidebar-left',
    heroPlacement: 'main-column',
    defaultPaletteId: 'orange',
    buildPreview: sidebarFullHeightLeftPreview,
    createBlocks: sidebarFullHeightBlocks,
    buildTheme,
  },

  // 5 — Donation First
  {
    id: 'donation-first',
    name: 'תרומה במרכז',
    description: 'תיבת התרומה בולטת בחלק העליון ממש. לגיוסים עם מוטיבציה חזקה לתרומה מיידית.',
    layoutMode: 'standard',
    defaultPaletteId: 'orange',
    buildPreview: donationFirstPreview,
    createBlocks: donationFirstBlocks,
    buildTheme,
  },

  // 6 — Story First
  {
    id: 'story-first',
    name: 'סיפור קודם',
    description: 'הסיפור והתמונות מובילים. התרומה מגיעה אחרי שהמבקר השתכנע.',
    layoutMode: 'standard',
    defaultPaletteId: 'teal',
    buildPreview: storyFirstPreview,
    createBlocks: storyFirstBlocks,
    buildTheme,
  },

  // 7 — Ambassadors First
  {
    id: 'ambassadors-first',
    name: 'שגרירים במרכז',
    description: 'שגרירי הקמפיין בולטים מיד אחרי הנתונים. מושלם לגיוסים מבוססי קהילה.',
    layoutMode: 'standard',
    defaultPaletteId: 'blue',
    buildPreview: ambassadorsFirstPreview,
    createBlocks: ambassadorsFirstBlocks,
    buildTheme,
  },

  // 8 — Magazine
  {
    id: 'magazine',
    name: 'מגזין / כתבה',
    description: 'פריסת מגזין עם שני עמודות. מתאים לקמפיינים עם תוכן ארוך ועשיר.',
    layoutMode: 'magazine',
    defaultPaletteId: 'pink',
    buildPreview: magazinePreview,
    createBlocks: magazineBlocks,
    buildTheme,
  },

  // 9 — Video Hero
  {
    id: 'video-hero',
    name: 'וידאו ראשון',
    description: 'הוידאו שלכם תופס את הבמה הראשית. נתוני הגיוס ותרומה ממש מתחת.',
    layoutMode: 'standard',
    defaultPaletteId: 'red',
    buildPreview: videoHeroPreview,
    createBlocks: videoHeroBlocks,
    buildTheme,
  },
];
