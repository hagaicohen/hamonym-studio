import type { BlockType } from '../services/campaign-studio-state.service';
import {
  LucideIconData, Type, Image as ImageIcon, Video, Images, Columns2, MousePointerClick, Minus, LayoutGrid,
  ChartColumn, HandCoins, Gift, Handshake, Star, Heart, Megaphone, PanelTop, Rows3, ListCollapse, Share2,
  MessageCircle, Ticket, MapPin, Clock, Box,
} from 'lucide-angular';

// Interface icons per block type (design system: Lucide, no decorative emoji).
export const BLOCK_LUCIDE_ICONS: Record<BlockType, LucideIconData> = {
  'rich-text': Type, image: ImageIcon, video: Video, gallery: Images, split: Columns2, cta: MousePointerClick,
  divider: Minus, container: LayoutGrid, stats: ChartColumn, 'donation-widget': HandCoins, rewards: Gift,
  sponsors: Handshake, ambassadors: Star, donors: Heart, updates: Megaphone, hero: PanelTop, tabs: Rows3,
  accordion: ListCollapse, share: Share2, comments: MessageCircle, coupons: Ticket, map: MapPin, 'opening-hours': Clock,
};
export const blockLucideIcon = (type: BlockType): LucideIconData => BLOCK_LUCIDE_ICONS[type] ?? Box;

// Block catalog shared by Step 9 and the Studio: Hebrew names, icons,
// single-instance types and the "add block" groups.
export const BLOCK_LABELS: Record<BlockType, string> = {
  'rich-text':   'טקסט',
  'image':       'תמונה',
  'video':       'וידאו',
  'gallery':     'גלריה',
  'split':       'עמודות',
  'cta':         'קריאה לפעולה',
  'divider':     'מרווח / קו',
  'container':       'טבלת פריסה',
  'stats':           'פס נתונים',
  'donation-widget': 'תיבת תרומה',
  'rewards':         'תשורות',
  'sponsors':    'חסויות',
  'ambassadors': 'שגרירים',
  'donors':      'תורמים',
  'updates':     'עדכונים',
  'hero':        'Hero (תמונה ראשית)',
  'tabs':        'טאבים',
  'accordion':   'פאנלים',
  'share':       'שיתוף',
  'comments':    'תגובות',
  'coupons':       'קופון',
  'map':           'מפה / מיקום',
  'opening-hours': 'שעות פתיחה',
};


// 'stats' / 'donation-widget' (2026-11): a page has one donation box and one
// stats bar; a second copy has no meaning (and the merged donation layouts
// read the single stats block).
export const SINGLE_INSTANCE: BlockType[] = ['rewards', 'sponsors', 'ambassadors', 'donors', 'updates', 'hero', 'share', 'comments', 'map', 'opening-hours', 'stats', 'donation-widget'];

// Block groups for the picker UI. Groups/types are filtered per Owner Type
// (see blockGroups() below) — a group whose types are all unavailable for
// the current owner simply disappears, it's never listed empty. Every
// existing type here already includes 'campaign' in SECTION_REGISTRY, so
// this filtering is a no-op for ownerType 'campaign' (today's only owner).
export const BLOCK_GROUPS: { label: string; types: BlockType[] }[] = [
  { label: 'תוכן',    types: ['rich-text', 'image', 'video', 'gallery'] },
  { label: 'פריסה',   types: ['container', 'hero', 'tabs', 'accordion'] },
  { label: 'גיוס',    types: ['donation-widget', 'cta', 'rewards', 'share'] },
  { label: 'נתונים',  types: ['stats', 'donors'] },
  { label: 'קהילה',   types: ['sponsors', 'ambassadors', 'updates', 'comments'] },
  { label: 'עסק',     types: ['map', 'opening-hours', 'coupons'] },
  { label: 'עיצוב',   types: ['divider'] },
];
