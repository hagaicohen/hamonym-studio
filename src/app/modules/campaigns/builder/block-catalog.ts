import type { BlockType } from '../services/campaign-studio-state.service';
import {
  LucideIconData, Type, Image as ImageIcon, Video, Images, Columns2, MousePointerClick, Minus, LayoutGrid,
  ChartColumn, HandCoins, Gift, Handshake, Star, Heart, Megaphone, PanelTop, Rows3, ListCollapse, Share2,
  MessageCircle, Ticket, MapPin, Clock, Box, Timer, BadgePercent,
} from 'lucide-angular';

// Interface icons per block type (design system: Lucide, no decorative emoji).
export const BLOCK_LUCIDE_ICONS: Record<BlockType, LucideIconData> = {
  'rich-text': Type, image: ImageIcon, video: Video, gallery: Images, split: Columns2, cta: MousePointerClick,
  divider: Minus, container: LayoutGrid, stats: ChartColumn, 'donation-widget': HandCoins, rewards: Gift,
  sponsors: Handshake, ambassadors: Star, donors: Heart, updates: Megaphone, hero: PanelTop, tabs: Rows3,
  accordion: ListCollapse, share: Share2, comments: MessageCircle, coupons: Ticket, map: MapPin, 'opening-hours': Clock,
  countdown: Timer, badge: BadgePercent, progress: ChartColumn, contact: MessageCircle,navigation:Rows3,
};
export const blockLucideIcon = (type: BlockType): LucideIconData => BLOCK_LUCIDE_ICONS[type] ?? Box;

// Block catalog shared by Step 9 and the Studio: names (translation keys), icons,
// single-instance types and the "add block" groups.
export const BLOCK_LABELS: Record<BlockType, string> = {
  progress: 'studio.blocks.progress', contact: 'studio.blocks.contact',navigation:'studio.blocks.navigation',
  'rich-text':   'studio.blocks.richText',
  'image':       'studio.blocks.image',
  'video':       'studio.blocks.video',
  'gallery':     'studio.blocks.gallery',
  'split':       'studio.blocks.split',
  'cta':         'studio.blocks.cta',
  'divider':     'studio.blocks.divider',
  'container':       'studio.blocks.container',
  'stats':           'studio.blocks.stats',
  'donation-widget': 'studio.blocks.donationWidget',
  'rewards':         'studio.blocks.rewards',
  'sponsors':    'studio.blocks.sponsors',
  'ambassadors': 'studio.blocks.ambassadors',
  'donors':      'studio.blocks.donors',
  'updates':     'studio.blocks.updates',
  'hero':        'studio.blocks.hero',
  'tabs':        'studio.blocks.tabs',
  'accordion':   'studio.blocks.accordion',
  'share':       'studio.blocks.share',
  'comments':    'studio.blocks.comments',
  'coupons':       'studio.blocks.coupons',
  'map':           'studio.blocks.map',
  'opening-hours': 'studio.blocks.openingHours',
  'countdown':     'studio.blocks.countdown',
  'badge':         'studio.blocks.badge',
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
  { label: 'studio.blockGroups.content',    types: ['rich-text', 'image', 'video', 'gallery'] },
  { label: 'studio.blockGroups.layout',   types: ['container', 'hero', 'navigation', 'tabs', 'accordion'] },
  { label: 'studio.blockGroups.fundraising',    types: ['donation-widget', 'cta', 'rewards', 'share', 'countdown', 'badge'] },
  { label: 'studio.blockGroups.data',  types: ['stats', 'progress', 'donors'] },
  { label: 'studio.blockGroups.community',   types: ['sponsors', 'ambassadors', 'updates', 'comments', 'contact'] },
  { label: 'studio.blockGroups.business',     types: ['map', 'opening-hours', 'coupons'] },
  { label: 'studio.blockGroups.design',   types: ['divider'] },
];
