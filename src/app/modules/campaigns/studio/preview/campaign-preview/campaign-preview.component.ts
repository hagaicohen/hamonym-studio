import { Component, inject, OnInit, OnDestroy, Input } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
  DonorsBlockData,
  SponsorsBlockData,
  AmbassadorsBlockData,
  UpdatesBlockData,
} from '../../../services/campaign-studio-state.service';
import { CheckoutModalComponent } from '../../../shared/components/checkout-modal/checkout-modal.component';
import { DonationService, Donor } from '../../../services/donation.service';
import { Ambassador, AmbassadorPublicInfo, AmbassadorService } from '../../../services/ambassador.service';
import { CampaignAmbassador } from '../../../services/campaign-studio-state.service';

const now = Date.now();
const MOCK_DONORS: Donor[] = [
  { name: 'ישראל ישראלי',     amount: 500,  completedAt: new Date(now - 15 * 60000) },
  { name: 'תורמ/ה אנונימי',   amount: 1000, completedAt: new Date(now - 45 * 60000) },
  { name: 'רחל כהן',           amount: 250,  completedAt: new Date(now - 90 * 60000) },
  { name: 'תורמ/ה אנונימי',   amount: 750,  completedAt: new Date(now - 3 * 3600000) },
  { name: 'אברהם לוי',         amount: 180,  completedAt: new Date(now - 5 * 3600000) },
  { name: 'מרים ברק',          amount: 360,  completedAt: new Date(now - 8 * 3600000) },
  { name: 'תורמ/ה אנונימי',   amount: 100,  completedAt: new Date(now - 24 * 3600000) },
  { name: 'דוד מזרחי',         amount: 2000, completedAt: new Date(now - 48 * 3600000) },
  { name: 'שרה גולדברג',       amount: 450,  completedAt: new Date(now - 72 * 3600000) },
  { name: 'תורמ/ה אנונימי',   amount: 300,  completedAt: new Date(now - 96 * 3600000) },
];

const FUNDING_LABELS: Record<string, string> = {
  'all-or-nothing': 'הכל או כלום',
  'flexible':       'גיוס גמיש',
  'recurring':      'מנוי חוזר',
  'matching':       'תרומה מוכפלת',
};

@Component({
  selector: 'app-campaign-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, CheckoutModalComponent],
  templateUrl: './campaign-preview.component.html',
  styleUrl: './campaign-preview.component.css',
})
export class CampaignPreviewComponent implements OnInit, OnDestroy {
  private state           = inject(CampaignStudioStateService);

  hoveredBlockId: string | null = null;
  pageBuilderActive = false;
  private _destroy$ = new Subject<void>();
  setHovered(id: string | null): void { this.state.setHoveredBlock(id, 'preview'); }
  private sanitizer       = inject(DomSanitizer);
  private entityService   = inject(CurrentEntityService);
  private entitiesService = inject(EntitiesService);
  private ui              = inject(StudioUiService);
  private donationService = inject(DonationService);

  @Input() ambassador:      Ambassador | null = null;
  @Input() ambassadorsList: AmbassadorPublicInfo[] | null = null;
  private ambassadorSvc = inject(AmbassadorService);
  private router        = inject(Router);

  // ── Ambassador leaderboard state ──
  ambSearch   = '';
  ambSortBy: 'raised' | 'name' | 'pct' | 'donors' = 'raised';
  ambShowCount = 6;
  private liveAmbassadors: AmbassadorPublicInfo[] | null = null;
  private loadedAmbSlug = '';

  // ── Ambassador self-join modal ──
  showJoinModal = false;
  joinStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  joinForm     = { fullName: '', phone: '', email: '', goalAmount: null as number | null };
  joinGoalDisplay = '';
  joinShareUrl = '';
  joinCopied   = false;
  joinError    = '';

  get ambTotalRaised(): number {
    return this.ambEffective.reduce((s, a) => s + a.raisedTotal, 0);
  }

  hasAmbassadorsSection(draft: CampaignDraft): boolean {
    return (draft.blocks ?? []).some(b => b.type === 'ambassadors');
  }

  openJoinModal(): void {
    this.joinForm        = { fullName: '', phone: '', email: '', goalAmount: null };
    this.joinGoalDisplay = '';
    this.joinStatus      = 'idle';
    this.joinShareUrl    = '';
    this.joinCopied      = false;
    this.joinError       = '';
    this.showJoinModal   = true;
  }

  onJoinGoalInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.replace(/[^\d]/g, '');
    const num = raw ? parseInt(raw, 10) : null;
    this.joinForm.goalAmount = num && num > 0 ? num : null;
    const formatted = num ? num.toLocaleString('he-IL') : '';
    (event.target as HTMLInputElement).value = formatted;
    this.joinGoalDisplay = formatted;
  }

  closeJoinModal(): void { this.showJoinModal = false; }

  submitJoin(draft: CampaignDraft): void {
    if (!this.joinForm.fullName.trim() || this.joinStatus === 'loading') return;
    this.joinStatus = 'loading';
    this.ambassadorSvc.selfRegister(draft.slug!, {
      fullName: this.joinForm.fullName,
      phone: this.joinForm.phone,
      email: this.joinForm.email,
      goalAmount: this.joinForm.goalAmount,
    }).subscribe({
      next: (res: { slug: string; shareUrl: string }) => {
        this.joinShareUrl = res.shareUrl;
        this.joinStatus   = 'success';
        this.router.navigate(['/campaigns', draft.slug, res.slug]);
      },
      error: (err: { error?: { error?: string } }) => {
        this.joinStatus = 'error';
        this.joinError  = err?.error?.error || 'אירעה שגיאה. נסה שוב.';
      },
    });
  }

  copyJoinLink(): void {
    navigator.clipboard.writeText(this.joinShareUrl).then(() => {
      this.joinCopied = true;
      setTimeout(() => { this.joinCopied = false; }, 2500);
    });
  }

  get ambEffective(): AmbassadorPublicInfo[] {
    if (this.ambassadorsList)  return this.ambassadorsList;
    if (this.liveAmbassadors) return this.liveAmbassadors;
    return (this.state.draft?.ambassadors ?? []).map((a: CampaignAmbassador) => ({
      id: a.id, fullName: a.fullName, slug: a.slug,
      goalAmount: a.goalAmount, personalMessage: a.personalMessage,
      raisedTotal: 0, donorCount: 0,
    }));
  }

  get ambFiltered(): AmbassadorPublicInfo[] {
    let list = this.ambEffective;
    if (this.ambSearch.trim()) {
      const q = this.ambSearch.toLowerCase();
      list = list.filter(a => a.fullName.toLowerCase().includes(q));
    }
    const s = [...list];
    switch (this.ambSortBy) {
      case 'raised':  s.sort((a, b) => b.raisedTotal - a.raisedTotal); break;
      case 'name':    s.sort((a, b) => a.fullName.localeCompare(b.fullName, 'he')); break;
      case 'pct':     s.sort((a, b) => this.ambPct(b) - this.ambPct(a)); break;
      case 'donors':  s.sort((a, b) => b.donorCount - a.donorCount); break;
    }
    return s;
  }

  get ambVisible(): AmbassadorPublicInfo[] {
    return this.ambFiltered.slice(0, this.ambShowCount);
  }

  ambPct(a: AmbassadorPublicInfo): number {
    if (!a.goalAmount) return 0;
    return Math.min(100, Math.round((a.raisedTotal / a.goalAmount) * 100));
  }

  viewAmbassador(slug: string, draft: { slug: string }): void {
    window.location.href = `/campaigns/${draft.slug}/${slug}`;
  }

  copyAmbLink(slug: string, draft: { slug: string }): void {
    const url = `${window.location.origin}/campaigns/${draft.slug}/${slug}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  entityLogoUrl: string | null = null;
  entityName = '';
  navOpen = false;
  showStickyBar = true;
  readonly currentYear = new Date().getFullYear();
  private expandedRewards = new Set<string>();
  private gallerySlides   = new Map<string, number>();

  // ── Checkout state ──
  checkoutOpen = false;
  selectedAmount: number | null = null;
  cartRewardIds = new Set<string>();   // rewards in cart
  customAmount: number | null = null;
  amountDisplay = '';  // formatted display value for custom amount input

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

  ngOnInit(): void {
    this.draft$.subscribe(draft => {
      if (draft?.slug && draft.slug !== this.loadedSlug) {
        this.loadedSlug = draft.slug;
        this.donationService.getDonors(draft.slug).subscribe({
          next: donors => { this.donors = donors; },
        });
      }
      if (draft?.slug && draft.slug !== this.loadedAmbSlug) {
        this.loadedAmbSlug = draft.slug;
        this.ambassadorSvc.listPublic(draft.slug).subscribe({
          next: list => { this.liveAmbassadors = list; },
        });
      }
    });
    this.state.hoveredBlock$.pipe(takeUntil(this._destroy$)).subscribe(({ id }) => {
      this.hoveredBlockId = id;
    });
    this.state.pageBuilderActive$.pipe(takeUntil(this._destroy$)).subscribe(active => {
      this.pageBuilderActive = active;
      if (!active) this.hoveredBlockId = null;
    });
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
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

  layoutMode(draft: CampaignDraft): string {
    return draft.layout?.layoutMode ?? 'standard';
  }

  // ── Content blocks for standard/magazine layouts ──
  contentBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id))
      .sort((a, b) => a.order - b.order);
  }

  // Sidebar rail: top-level stats + donation-widget blocks
  sidebarBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id) && (b.type === 'stats' || b.type === 'donation-widget'))
      .sort((a, b) => a.order - b.order);
  }

  // Main column: content blocks that are NOT sidebar blocks and NOT full-width blocks
  mainBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id)
        && !this.SIDEBAR_TYPES.includes(b.type)
        && !this.FULL_WIDTH_TYPES.includes(b.type))
      .sort((a, b) => a.order - b.order);
  }

  // Full-width blocks rendered below the sidebar two-column area
  belowSidebarBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id) && this.FULL_WIDTH_TYPES.includes(b.type))
      .sort((a, b) => a.order - b.order);
  }

  private readonly SIDEBAR_TYPES = ['stats', 'donation-widget'];
  private readonly FULL_WIDTH_TYPES = ['rewards', 'donors', 'ambassadors', 'sponsors', 'updates'];

  private topLevelChildIds(draft: CampaignDraft): Set<string> {
    return new Set(
      draft.blocks
        .filter(b => b.type === 'container')
        .flatMap(b => (b.data as ContainerBlockData).childBlockIds)
    );
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

  ambassadorPct(): number {
    if (!this.ambassador?.goalAmount) return 0;
    return Math.min(100, Math.round((this.ambassador.raisedTotal / this.ambassador.goalAmount) * 100));
  }

  daysRemaining(draft: CampaignDraft): string {
    if (!draft.endDate) return '—';
    const diff = new Date(draft.endDate).getTime() - Date.now();
    return String(Math.max(0, Math.ceil(diff / 86400000)));
  }

  private parseDate(iso: string): [string, string, string] {
    const date = iso.slice(0, 10); // take only yyyy-mm-dd part
    const [y, m, d] = date.split('-');
    return [y, m, d];
  }

  formatDate(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = this.parseDate(iso);
    return `${d}.${m}.${y.slice(2)}`;
  }

  formatDateShort(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = this.parseDate(iso);
    return `${d}.${m}.${y.slice(2)}`;
  }

  formatDateFull(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = this.parseDate(iso);
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

  // ── Checkout ──
  selectAmount(amount: number): void {
    this.selectedAmount = amount;
    this.customAmount   = null;
    this.amountDisplay  = '';
  }

  onCustomAmountInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw   = input.value.replace(/[^\d]/g, '');
    const num   = raw ? parseInt(raw, 10) : null;
    this.customAmount  = num && num > 0 ? num : null;
    this.amountDisplay = num ? num.toLocaleString('he-IL') : '';
    // keep cursor position stable after re-render
    const formatted = this.amountDisplay;
    requestAnimationFrame(() => { input.value = formatted; });
    if (this.customAmount) this.selectedAmount = null;
  }

  getEffectiveAmount(draft: CampaignDraft): number {
    if (this.customAmount) return this.customAmount;
    if (this.selectedAmount !== null) return this.selectedAmount;
    const amounts = draft.suggestedAmounts.slice(0, 5);
    return amounts[this.middleAmountIndex(amounts)] ?? 0;
  }

  isAmountSelected(amount: number): boolean {
    return this.selectedAmount === amount && this.customAmount === null;
  }

  isRewardInCart(id: string): boolean { return this.cartRewardIds.has(id); }

  selectReward(id: string): void {
    if (!this.cartRewardIds.has(id)) {
      this.cartRewardIds.add(id);
      this.cartRewardIds = new Set(this.cartRewardIds);
    }
  }

  removeReward(id: string): void {
    this.cartRewardIds.delete(id);
    this.cartRewardIds = new Set(this.cartRewardIds);
  }

  toggleReward(id: string): void {
    if (this.cartRewardIds.has(id)) {
      this.cartRewardIds.delete(id);
    } else {
      this.cartRewardIds.add(id);
    }
    this.cartRewardIds = new Set(this.cartRewardIds);
  }

  get cartCount(): number { return this.cartRewardIds.size; }

  get explicitAmount(): number {
    if (this.customAmount) return this.customAmount;
    if (this.selectedAmount !== null) return this.selectedAmount;
    return 0;
  }

  cartRewardsTotal(draft: CampaignDraft): number {
    return draft.rewards
      .filter(r => this.cartRewardIds.has(r.id))
      .reduce((sum, r) => sum + (r.minimumAmount || 0), 0);
  }

  totalAmount(draft: CampaignDraft): number {
    return this.explicitAmount + this.cartRewardsTotal(draft);
  }

  scrollToDonation(): void {
    const el = document.querySelector('.hm-donate');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  openCheckout(draft: CampaignDraft): void {
    this.checkoutOpen = true;
  }

  closeCheckout(): void {
    this.checkoutOpen = false;
  }

  cartRewardList(draft: CampaignDraft) {
    return draft.rewards.filter(r => this.cartRewardIds.has(r.id));
  }

  middleIndex(len: number): number {
    return Math.floor((len - 1) / 2);
  }

  // ── Gallery slider ──
  gallerySlide(id: string): number { return this.gallerySlides.get(id) ?? 0; }
  setSlide(id: string, i: number): void { this.gallerySlides.set(id, i); }
  prevSlide(id: string, count: number): void {
    this.gallerySlides.set(id, Math.max(0, (this.gallerySlides.get(id) ?? 0) - 1));
  }
  nextSlide(id: string, count: number): void {
    this.gallerySlides.set(id, Math.min(count - 1, (this.gallerySlides.get(id) ?? 0) + 1));
  }

  galleryAspectStyle(ratio: string): string {
    const map: Record<string, string> = { '16:9': '16/9', '4:3': '4/3', '1:1': '1/1', '3:2': '3/2' };
    return map[ratio] ?? '16/9';
  }

  scrollSlider(el: HTMLElement, dir: 'prev' | 'next'): void {
    const firstCard = el.firstElementChild?.firstElementChild as HTMLElement;
    const cardWidth = firstCard?.getBoundingClientRect().width || el.clientWidth;
    el.scrollBy({ left: dir === 'prev' ? cardWidth : -cardWidth, behavior: 'smooth' });
  }

  primaryColor(draft: CampaignDraft): string {
    return draft.layout?.theme?.secondaryColor || '#6fc9eb';
  }

  blockSectionId(block: CampaignBlock, draft?: CampaignDraft): string {
    if (block.type === 'rich-text')        return 'section-story';
    if (block.type === 'donation-widget') return 'section-donate';
    if (block.type === 'rewards')          return 'section-rewards';
    if (block.type === 'updates')      return 'section-updates';
    if (block.type === 'donors')       return 'section-donors';
    if (block.type === 'ambassadors')  return 'section-ambassadors';
    if (block.type === 'sponsors')     return 'section-sponsors';
    if (block.type === 'container' && draft) {
      const ids = (block.data as ContainerBlockData).childBlockIds;
      if (ids.some(id => draft.blocks.find(b => b.id === id)?.type === 'donation-widget'))
        return 'section-donate';
    }
    return '';
  }

  navItems(draft: CampaignDraft): { label: string; sectionId: string; count?: number }[] {
    const LABELS: Partial<Record<string, string>> = {
      'rich-text':    'אודות הקמפיין',
      'rewards':      'תשורות',
      'updates':      'עדכונים',
      'donors':       'תורמים',
      'ambassadors':  'שגרירים',
      'sponsors':     'תומכים',
    };
    const seen = new Set<string>();
    const items: { label: string; sectionId: string; count?: number }[] = [];
    for (const block of (draft.blocks ?? [])) {
      const sectionId = this.blockSectionId(block, draft);
      if (!sectionId || seen.has(sectionId)) continue;
      seen.add(sectionId);
      const label = LABELS[block.type];
      if (!label) continue;
      const count =
        block.type === 'ambassadors' ? (this.ambEffective.length || undefined) :
        block.type === 'donors'      ? (this.activeDonors.length  || undefined) :
        undefined;
      items.push({ label, sectionId, count });
    }
    return items;
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
  asDonors(data: unknown)           { return data as DonorsBlockData; }
  asSponsorsBlock(data: unknown)    { return data as SponsorsBlockData; }
  asAmbassadorsBlock(data: unknown) { return data as AmbassadorsBlockData; }
  asUpdates(data: unknown)          { return data as UpdatesBlockData; }

  donors: Donor[] = [];
  private loadedSlug = '';
  private shownCount = 6;
  readonly PAGE_SIZE = 6;

  get activeDonors(): Donor[] {
    return this.state.isEditMode ? MOCK_DONORS : this.donors;
  }
  get visibleDonors(): Donor[] {
    return this.activeDonors.slice(0, this.shownCount);
  }
  get canShowMore(): boolean {
    return this.shownCount < this.activeDonors.length;
  }
  showMoreDonors(): void {
    this.shownCount = Math.min(this.shownCount + this.PAGE_SIZE, this.activeDonors.length);
  }

  timeAgo(date: Date): string {
    const diff = Date.now() - date.getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `לפני ${m} דקות`;
    const h = Math.floor(m / 60);
    if (h < 24) return `לפני ${h} שעות`;
    const d = Math.floor(h / 24);
    return `לפני ${d} ימים`;
  }

  donorInitials(name: string): string {
    if (name.includes('אנונימי')) return '?';
    const parts = name.trim().split(' ');
    return parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0][0];
  }

  visibleStats(block: CampaignBlock): StatsBlockData['items'] {
    return (block.data as StatsBlockData).items
      .filter(i => i.visible)
      .sort((a, b) => a.order - b.order);
  }

  readonly Math = Math;

  raisedPct(draft: CampaignDraft): number {
    const target = draft.targetAmount ?? 0;
    const raised = draft.currentAmount ?? 0;
    return target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;
  }

  ringDash(draft: CampaignDraft): string {
    const circumference = 94.25; // 2π×15
    const fill = (this.raisedPct(draft) / 100) * circumference;
    return `${fill.toFixed(2)} ${circumference}`;
  }

  statValue(key: string, draft: CampaignDraft): string {
    const raised     = draft.currentAmount   ?? 0;
    const supporters = draft.supportersCount ?? 0;
    const target     = draft.targetAmount    ?? 0;
    const pct        = target > 0 ? Math.min(100, Math.round((raised / target) * 100)) : 0;

    switch (key) {
      case 'target':         return target    ? this.formatAmount(target) : '—';
      case 'raised':         return this.formatAmount(raised);
      case 'percent':        return pct + '%';
      case 'supporters':     return supporters.toLocaleString('he-IL');
      case 'start_date':     return draft.startDate ? this.formatDate(draft.startDate) : '—';
      case 'end_date':       return draft.endDate ? this.formatDate(draft.endDate) : '—';
      case 'days_remaining': return this.daysRemaining(draft);
      case 'ambassadors':    return '0';
      default:               return '—';
    }
  }
}
