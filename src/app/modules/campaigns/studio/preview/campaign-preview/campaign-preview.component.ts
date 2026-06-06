import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { environment } from '../../../../../../environments/environment';
import { StudioUiService } from '../../services/studio-ui.service';
import { ENTITY_CATEGORIES } from '../../../../../shared/config/entity-categories';
import {
  CampaignStudioStateService,
  CampaignDraft,
  CampaignBlock,
  RichTextBlockData,
  ImageBlockData,
  VideoBlockData,
  GalleryBlockData,
  SplitBlockData,
  ContainerBlockData,
  StatsBlockData,
  DonationWidgetBlockData,
  CtaBlockData,
  DividerBlockData,
} from '../../../services/campaign-studio-state.service';

const FUNDING_LABELS: Record<string, string> = {
  'all-or-nothing': 'הכל או כלום',
  'flexible':       'גיוס גמיש',
  'recurring':      'מנוי חוזר',
  'matching':       'תרומה מוכפלת',
};

@Component({
  selector: 'app-campaign-preview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-preview.component.html',
  styleUrl: './campaign-preview.component.css',
})
export class CampaignPreviewComponent {
  private state          = inject(CampaignStudioStateService);
  private sanitizer      = inject(DomSanitizer);
  private entityService  = inject(CurrentEntityService);
  private entitiesService = inject(EntitiesService);
  private ui             = inject(StudioUiService);

  entityLogoUrl: string | null = null;
  entityName = '';
  navOpen = false;
  private expandedRewards = new Set<string>();

  isExpanded(id: string): boolean { return this.expandedRewards.has(id); }
  toggleExpand(id: string): void {
    this.expandedRewards.has(id) ? this.expandedRewards.delete(id) : this.expandedRewards.add(id);
  }

  draft$ = this.state.draft$;
  isMobile$ = this.ui.device$;

  constructor() {
    const entity = this.entityService.currentEntity();
    if (entity?.id) {
      this.entityName = entity.display_name || entity.legal_name || entity.name || '';
      this.entitiesService.getEntityById(entity.id).subscribe({
        next: (res: any) => {
          const raw = res?.logo_url ?? null;
          if (raw) {
            this.entityLogoUrl = (raw.startsWith('http') || raw.startsWith('data:image'))
              ? raw : `${environment.apiUrl}${raw}`;
          }
          if (!this.entityName)
            this.entityName = res?.display_name || res?.legal_name || res?.name || '';
        },
      });
    }
  }

  isEmpty(draft: CampaignDraft): boolean {
    return !draft.title && !draft.coverImageUrl && !draft.videoUrl;
  }

  // ── Hero ──
  heroBg(draft: CampaignDraft): string {
    if (draft.heroType === 'image' && draft.coverImageUrl)
      return `url('${draft.coverImageUrl}')`;
    if (draft.heroType === 'video') {
      const thumb = this.getYoutubeThumbnail(draft.videoUrl);
      if (thumb) return `url('${thumb}')`;
    }
    return '';
  }

  heroBgStyle(draft: CampaignDraft): string {
    if (draft.heroType === 'image' && draft.coverImageUrl)
      return `background: url(${draft.coverImageUrl}) center/cover no-repeat`;
    if (draft.heroType === 'video') {
      const thumb = this.getYoutubeThumbnail(draft.videoUrl);
      if (thumb) return `background: url(${thumb}) center/cover no-repeat`;
    }
    return 'background: linear-gradient(155deg,#1e293b,#334155)';
  }

  heroTitleSize(draft: CampaignDraft): string {
    const sizes: Record<string, string> = {
      sm: '24px', md: '32px', lg: '40px', xl: '48px',
    };
    return sizes[draft.heroTextStyle?.fontSize] || '40px';
  }

  fundingTypeLabel(type: string): string {
    return FUNDING_LABELS[type] || type;
  }

  categoryLabel(categoryId: string): string {
    if (!categoryId || categoryId === '__custom__') return '';
    const found = ENTITY_CATEGORIES.find(c => c.id === categoryId);
    return found ? found.label : categoryId;
  }

  // ── Content blocks (exclude donation-widget / stats — shown in widgets zone) ──
  contentBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = new Set(
      draft.blocks
        .filter(b => b.type === 'container')
        .flatMap(b => (b.data as ContainerBlockData).childBlockIds)
    );
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id))
      .sort((a, b) => a.order - b.order);
  }

  blockById(id: string, draft: CampaignDraft): CampaignBlock | undefined {
    return draft.blocks.find(b => b.id === id);
  }

  childBlocks(block: CampaignBlock, draft: CampaignDraft): CampaignBlock[] {
    const ids = (block.data as ContainerBlockData).childBlockIds;
    return ids
      .map(id => draft.blocks.find(b => b.id === id))
      .filter((b): b is CampaignBlock => !!b && b.visible)
      .sort((a, b) => a.order - b.order);
  }

  // ── Stats ──
  readonly statIcons: Record<string, string> = {
    target: '🎯', raised: '💰', percent: '📈', supporters: '👥',
    start_date: '📅', end_date: '📅', days_remaining: '⏰', ambassadors: '⭐',
  };
  readonly statLabels: Record<string, string> = {
    target: 'יעד הגיוס', raised: 'גויס עד כה', percent: 'מדד הגיוס',
    supporters: 'תומכים', start_date: 'תחילת הקמפיין',
    end_date: 'תאריך סיום', days_remaining: 'ימים נותרו', ambassadors: 'שגרירים',
  };

  formatAmount(n: number): string {
    if (!n) return '₪0';
    return '₪' + n.toLocaleString('he-IL');
  }

  daysRemaining(draft: CampaignDraft): string {
    if (!draft.endDate) return '—';
    const diff = new Date(draft.endDate).getTime() - Date.now();
    return String(Math.max(0, Math.ceil(diff / 86400000)));
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return `${d}.${m}`;          // dd.mm only — full year omitted
  }

  formatDateFull(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  }

  // ── Utilities ──
  safeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(html || '');
  }

  getYoutubeThumbnail(url: string): string | null {
    if (!url) return null;
    const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
    }
    return null;
  }

  getYoutubeEmbedUrl(url: string): SafeResourceUrl | null {
    if (!url) return null;
    const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${m[1]}?rel=0`);
    }
    return null;
  }

  ctaAlignStyle(align: string): string {
    return align === 'right' ? 'flex-start' : align === 'left' ? 'flex-end' : 'center';
  }

  middleAmountIndex(amounts: number[]): number {
    const shown = Math.min(amounts.length, 5);
    return Math.floor((shown - 1) / 2);
  }

  middleIndex(len: number): number {
    return Math.floor((len - 1) / 2);
  }

  scrollSlider(el: HTMLElement, dir: 'prev' | 'next'): void {
    const firstCard = el.firstElementChild?.firstElementChild as HTMLElement;
    const cardWidth = firstCard?.getBoundingClientRect().width || el.clientWidth;
    el.scrollBy({ left: dir === 'prev' ? cardWidth : -cardWidth, behavior: 'smooth' });
  }

  primaryColor(draft: CampaignDraft): string {
    return draft.layout?.theme?.secondaryColor || '#6fc9eb';
  }

  blockSectionId(block: CampaignBlock): string {
    if (block.type === 'rich-text') return 'section-story';
    if (block.type === 'rewards')   return 'section-rewards';
    if (block.type === 'updates')   return 'section-updates';
    if (block.type === 'donors')    return 'section-donors';
    return '';
  }

  scrollTo(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Page background
  pageBackground(draft: CampaignDraft): string {
    const l = draft.layout;
    if (l.backgroundType === 'color') return l.backgroundColor;
    if (l.backgroundType === 'image' && l.backgroundImageUrl)
      return `url(${l.backgroundImageUrl}) center/cover no-repeat fixed`;
    return '#ffffff';
  }

  // Type casts
  asRichText(data: unknown)         { return data as RichTextBlockData; }
  asImage(data: unknown)            { return data as ImageBlockData; }
  asVideo(data: unknown)            { return data as VideoBlockData; }
  asGallery(data: unknown)          { return data as GalleryBlockData; }
  asSplit(data: unknown)            { return data as SplitBlockData; }
  asContainer(data: unknown)        { return data as ContainerBlockData; }
  asStats(data: unknown)            { return data as StatsBlockData; }
  asDonationWidget(data: unknown)   { return data as DonationWidgetBlockData; }
  asCta(data: unknown)              { return data as CtaBlockData; }
  asDivider(data: unknown)          { return data as DividerBlockData; }

  visibleStats(block: CampaignBlock): StatsBlockData['items'] {
    return (block.data as StatsBlockData).items
      .filter(i => i.visible)
      .sort((a, b) => a.order - b.order);
  }

  statValue(key: string, draft: CampaignDraft): string {
    switch (key) {
      case 'target':         return draft.targetAmount ? this.formatAmount(draft.targetAmount) : '—';
      case 'raised':         return '₪0';
      case 'percent':        return '0%';
      case 'supporters':     return '0';
      case 'start_date':     return draft.startDate ? this.formatDate(draft.startDate) : '—';
      case 'end_date':       return draft.endDate ? this.formatDate(draft.endDate) : '—';
      case 'days_remaining': return this.daysRemaining(draft);
      case 'ambassadors':    return '0';
      default:               return '—';
    }
  }
}
