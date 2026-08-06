import { Component, inject, OnInit, OnDestroy, Input, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { LucideAngularModule, GripVertical, Mail, Facebook } from 'lucide-angular';
import { TextStyle } from '../../../../../shared/models/text-style.model';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { environment } from '../../../../../../environments/environment';
import { StudioUiService } from '../../services/studio-ui.service';
import { ENTITY_CATEGORIES } from '../../../../../shared/config/entity-categories';
import {
  CampaignStudioStateService,
  CampaignDraft,
  CampaignBlock,
  BlockType,
  Offering,
  RichTextBlockData,
  ImageBlockData,
  VideoBlockData,
  GalleryBlockData,
  SplitBlockData,
  ContainerBlockData,
  TabsBlockData,
  AccordionBlockData,
  StatsBlockData,
  StatKey,
  DonationWidgetBlockData,
  CtaBlockData,
  DividerBlockData,
  DonorsBlockData,
  SponsorsBlockData,
  AmbassadorsBlockData,
  UpdatesBlockData,
  CampaignUpdate,
  ShareBlockData,
  CommentsBlockData,
  CouponsBlockData,
  MapBlockData,
  OpeningHoursBlockData,
  FUNDING_TYPE_LABELS,
} from '../../../services/campaign-studio-state.service';
import { CheckoutModalComponent, PendingRegistration } from '../../../shared/components/checkout-modal/checkout-modal.component';
import { DonationService, Donor, TopDonor, DonorPeriod } from '../../../services/donation.service';
import { Ambassador, AmbassadorPublicInfo, AmbassadorService } from '../../../services/ambassador.service';
import { CampaignAmbassador } from '../../../services/campaign-studio-state.service';
import { CommentsService, CampaignComment } from '../../../services/comments.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';

@Component({
  selector: 'app-campaign-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CheckoutModalComponent, LucideAngularModule],
  templateUrl: './campaign-preview.component.html',
  styleUrl: './campaign-preview.component.css',
})
export class CampaignPreviewComponent implements OnInit, OnDestroy {
  private state           = inject(CampaignStudioStateService);
  readonly GripVertical = GripVertical;
  readonly Mail = Mail;
  readonly Facebook = Facebook;

  hoveredBlockId: string | null = null;
  pageBuilderActive = false;
  private _destroy$ = new Subject<void>();
  // Hovering the preview no longer highlights the builder panel — only the
  // other direction (builder → preview) stays active. Left as a no-op
  // rather than removing every (mouseenter)/(mouseleave) binding in the
  // template, so this is a one-line revert if that's ever wanted back.
  setHovered(id: string | null): void {}

  // ── Drag-to-reorder FROM the preview itself — a small "⠿" handle shown
  // on hover over each block (see .preview-drag-handle in the template, all
  // 6 wrap sites) lets a manager pick up a block right where they see it,
  // instead of having to go find its row in the Builder's own block list.
  // Same shared drag state as the Builder's own grip handle (onBlockDragStart
  // in campaign-page-builder-step.component.ts) — the dragover/drop
  // handlers below don't care which UI the drag started from, only that
  // draggedExistingBlockId is set. See DECISIONS.md (2026-07-31).
  onExistingBlockDragStart(event: DragEvent, blockId: string): void {
    event.stopPropagation();
    event.dataTransfer?.setData('text/plain', blockId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    this.state.setDraggedExistingBlockId(blockId);
  }

  onExistingBlockDragEnd(): void {
    this.state.setDraggedExistingBlockId(null);
  }

  // ── Drag-and-drop (block picker → live preview, and existing-block
  // drag-to-reorder) ────────────────────────────────────────────────────
  // draggingType/draggingExistingId mirror state.draggedBlockType$/
  // draggedExistingBlockId$ (kept local so the template doesn't need an
  // async pipe just for this) — mutually exclusive, never both set at
  // once. dropTarget is recomputed on every dragover tick via
  // resolveDropTarget() — it's the ONLY thing 'drop' actually acts on, so
  // hit-testing and committing the move/insertion never disagree with each
  // other or with what's drawn on screen. See DECISIONS.md (2026-07-31).
  draggingType: BlockType | null = null;
  draggingExistingId: string | null = null;
  dropTarget: {
    parentId: string | null;
    index: number;
    indicatorRect: { top: number; left: number; width: number; height: number };
    mode: 'line-h' | 'line-v' | 'box';
  } | null = null;
  private sanitizer       = inject(DomSanitizer);
  private entityService   = inject(CurrentEntityService);
  private entitiesService = inject(EntitiesService);
  private ui              = inject(StudioUiService);
  private donationService = inject(DonationService);
  private commentsService = inject(CommentsService);
  private campaignPartnersService = inject(CampaignPartnersService);

  @Input() ambassador:      Ambassador | null = null;
  @Input() ambassadorsList: AmbassadorPublicInfo[] | null = null;
  @Input() autoOpenJoin = false;
  private autoOpenJoinTriggered = false;
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

  // Gates the nav/sticky "לתמיכה מאובטחת" donate CTAs — these were
  // previously unconditional (every campaign always had a donation-widget
  // block, so it went unnoticed), which leaked a broken "donate" button
  // onto Partner pages that have no donation flow at all. See
  // docs/PARTNER_DOMAIN_MODEL_ADR.md Phase 5, Sprint 5.1.
  hasDonationWidget(draft: CampaignDraft): boolean {
    return (draft.blocks ?? []).some(b => b.type === 'donation-widget');
  }

  // Generic "does this draft have a block of this type" check — used to gate
  // nav/footer links that would otherwise scroll to a non-existent section
  // (e.g. "תשורות"/"עדכונים" on a Partner page, which never has those block
  // types — see SECTION_REGISTRY in owner-registry.ts).
  hasBlockType(draft: CampaignDraft, type: BlockType): boolean {
    return (draft.blocks ?? []).some(b => b.type === type);
  }

  // True only for a real campaign draft — false for both Partner Profile
  // ('partner') and Campaign Participation ('campaign-partner') drafts.
  // Gates logo/meta-chips/donation-stats/footer-tax-text — concepts that
  // only make sense for an actual fundraising campaign, not a business
  // profile or a campaign-specific promo layer. See docs/PARTNER_DOMAIN_MODEL_ADR.md
  // Phase 5 (Sprint 5.1 donation-CTA fix, then the 2026-07-30 model refinement).
  isCampaign(draft: CampaignDraft): boolean {
    return (draft.ownerType ?? 'campaign') === 'campaign';
  }

  // An ongoing campaign has no meaningful end date (Doc §1) — draft.endDate
  // still holds whatever createInitialDraft() seeded (never surfaced to the
  // manager once campaignLifecycle is 'ongoing'), so every date/countdown
  // display must check this before rendering it as if it were real.
  isOngoing(draft: CampaignDraft): boolean {
    return draft.campaignLifecycle === 'ongoing';
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

  // ── Share ──────────────────────────────────────────────────
  linkCopied = false;

  campaignShareUrl(draft: CampaignDraft): string {
    return `${window.location.origin}/campaigns/${draft.slug}/view`;
  }

  copyShareLink(draft: CampaignDraft): void {
    navigator.clipboard.writeText(this.campaignShareUrl(draft)).then(() => {
      this.linkCopied = true;
      setTimeout(() => this.linkCopied = false, 2000);
    });
  }

  shareEmail(draft: CampaignDraft): void {
    const subject = encodeURIComponent(draft.title || 'קמפיין גיוס');
    const body = encodeURIComponent(`${draft.title}\n${this.campaignShareUrl(draft)}`);
    window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
  }

  shareX(draft: CampaignDraft): void {
    const text = encodeURIComponent(draft.title || '');
    const url = encodeURIComponent(this.campaignShareUrl(draft));
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank');
  }

  shareFacebook(draft: CampaignDraft): void {
    const url = encodeURIComponent(this.campaignShareUrl(draft));
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank');
  }

  shareWhatsApp(draft: CampaignDraft): void {
    const text = encodeURIComponent(`${draft.title}\n${this.campaignShareUrl(draft)}`);
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }

  entityLogoUrl: string | null = null;
  entityName = '';
  navOpen = false;
  showStickyBar = true;
  readonly currentYear = new Date().getFullYear();
  private expandedOfferings = new Set<string>();
  private gallerySlides     = new Map<string, number>();

  // ── Checkout state ──
  checkoutOpen = false;
  // 'registration' bypasses the cart/donation-widget entirely — the widget's
  // primary action becomes "Register" whenever the campaign has Registration
  // Options (see startRegistration below). See DECISIONS.md (2026-07-15,
  // 2.4 Multi-Participant Registration; 2026-07-16, Registration Options).
  checkoutMode: 'donation' | 'registration' = 'donation';
  selectedAmount: number | null = null;
  cartOfferingIds = new Set<string>();   // perk offerings in cart (donation flow only)
  customAmount: number | null = null;
  amountDisplay = '';  // formatted display value for custom amount input

  // A registration filled in and closed without paying — remembered here
  // (outside the modal, which gets destroyed on close) so opening the
  // donation checkout later already shows it and folds it into that one
  // payment. See PendingRegistration / DECISIONS.md (2026-07-17).
  pendingRegistration: PendingRegistration | null = null;

  onParticipantsSaved(data: PendingRegistration): void {
    this.pendingRegistration = data;
  }

  isExpanded(id: string): boolean { return this.expandedOfferings.has(id); }
  toggleExpand(id: string): void {
    this.expandedOfferings.has(id) ? this.expandedOfferings.delete(id) : this.expandedOfferings.add(id);
  }

  // ── Sidebar reward card: image position + "more details" modal ──
  // A modal (not inline expand) specifically for the sidebar card — the
  // rail is height-capped with internal scroll (see DECISIONS.md
  // 2026-07-27), so expanding a long description in place would push every
  // other sidebar section further into that scroll instead of just
  // overlaying on top, unaffected by the rail's own height budget.
  rewardsImagePosition(draft: CampaignDraft): 'inline' | 'full' {
    return draft.layout.rewardsImagePosition ?? 'inline';
  }

  // Height (px) of the full-width image row in 'full' mode — user-controlled
  // so it's never forced to a large fixed size.
  rewardsImageSize(draft: CampaignDraft): number {
    return draft.layout.rewardsImageSize ?? 120;
  }

  rewardDetailsOffering: Offering | null = null;
  openRewardDetails(offering: Offering): void { this.rewardDetailsOffering = offering; }
  closeRewardDetails(): void { this.rewardDetailsOffering = null; }

  // Splits a description into non-empty lines — a plain single-line
  // description renders as one paragraph; a manager who wrote multiple
  // lines (e.g. numbered terms, one per line) gets a real list instead of
  // one run-on paragraph, without requiring a separate rich-text field.
  descriptionLines(text: string): string[] {
    return (text || '').split('\n').map(l => l.trim()).filter(Boolean);
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
        this.loadDonors(draft.slug);
      }
      if (draft?.slug && draft.slug !== this.loadedAmbSlug) {
        this.loadedAmbSlug = draft.slug;
        this.ambassadorSvc.listPublic(draft.slug).subscribe({
          next: list => { this.liveAmbassadors = list; },
        });
      }
      if (draft?.slug && draft.slug !== this.loadedCommentsSlug) {
        this.loadedCommentsSlug = draft.slug;
        this.loadComments(draft.slug);
      }
      if (draft?.slug && this.autoOpenJoin && !this.autoOpenJoinTriggered) {
        this.autoOpenJoinTriggered = true;
        this.openJoinModal();
      }
      // Sprint 5.2 — "בשיתוף עם X" badge on reward cards linking to the
      // partner's own public page. Campaign-only (a Partner draft has no
      // rewards of its own — 'rewards' isn't even in its SECTION_REGISTRY).
      if (draft?.slug && this.isCampaign(draft) && draft.slug !== this.loadedPartnersSlug) {
        this.loadedPartnersSlug = draft.slug;
        this.campaignPartnersService.listPublicForCampaign(draft.slug).subscribe({
          next: links => {
            this.partnerByRewardId = {};
            for (const link of links) {
              if (link.rewardId) this.partnerByRewardId[link.rewardId] = link.partner;
            }
          },
        });
      }
      // "X רכשו מתוך Y" badge on reward cards with a quantity limit
      // (offering.stock) — live count of paid donations selecting this
      // reward, so a manager doesn't need to track it manually.
      if (draft?.slug && this.isCampaign(draft) && draft.slug !== this.loadedRewardCountsSlug) {
        this.loadedRewardCountsSlug = draft.slug;
        this.donationService.getRewardCounts(draft.slug).subscribe({
          next: counts => { this.rewardCounts = counts; },
        });
      }
    });
    this.commentSearch$.pipe(debounceTime(300), takeUntil(this._destroy$)).subscribe(term => {
      if (this.loadedCommentsSlug) this.loadComments(this.loadedCommentsSlug, term);
    });
    this.state.hoveredBlock$.pipe(takeUntil(this._destroy$)).subscribe(({ id }) => {
      this.hoveredBlockId = id;
      // Scroll the preview to whatever the manager is hovering in the
      // builder panel — the two panes scroll independently, so without this
      // the highlighted element can be way off-screen with nothing to show
      // for it. Queried by the highlight classes themselves (only one
      // element has any of them at a time) rather than a dedicated id,
      // since not every block wrapper carries one.
      //
      // Deliberately NOT using target.scrollIntoView() — it walks every
      // scrollable ancestor (including the page/window, which has its own
      // extra height beyond the viewport here), so it was also scrolling
      // the builder panel's own scroll position. Computing the offset by
      // hand and scrolling only .preview-inner's own scrollTop keeps this
      // fully contained to the preview pane.
      if (id) {
        setTimeout(() => {
          const scrollEl = document.querySelector('.preview-inner');
          const target = document.querySelector(
            '.block-wrap--hovered, .block-wrap--hovered-container, .container-child--hovered, .container-child--hovered-container'
          );
          if (!scrollEl || !target) return;
          const containerRect = scrollEl.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const delta = (targetRect.top + targetRect.height / 2) - (containerRect.top + containerRect.height / 2);
          scrollEl.scrollBy({ top: delta, behavior: 'smooth' });
        }, 30);
      }
    });
    this.state.pageBuilderActive$.pipe(takeUntil(this._destroy$)).subscribe(active => {
      this.pageBuilderActive = active;
      if (!active) this.hoveredBlockId = null;
    });
    this.state.draggedBlockType$.pipe(takeUntil(this._destroy$)).subscribe(type => {
      this.draggingType = type;
      if (!type && !this.draggingExistingId) this.dropTarget = null;
    });
    this.state.draggedExistingBlockId$.pipe(takeUntil(this._destroy$)).subscribe(id => {
      this.draggingExistingId = id;
      if (!id && !this.draggingType) this.dropTarget = null;
    });
  }

  ngOnDestroy(): void {
    this._destroy$.next();
    this._destroy$.complete();
  }

  // Campaign: unchanged (title/cover/video all falsy — the pre-existing
  // rule). Partner/CampaignPartner: title is ALWAYS set (business name /
  // "partner × campaign" label — see createInitialPartnerDraft), and since
  // §13 removed the forced Hero for these owners, a fresh draft with zero
  // blocks would otherwise render literally nothing with no indication the
  // preview pane is even working — looks identical to "there's no preview
  // here at all." Judge emptiness by block count instead for these owners.
  isEmpty(draft: CampaignDraft): boolean {
    if (!this.isCampaign(draft)) return (draft.blocks ?? []).length === 0;
    return !draft.title && !draft.coverImageUrl && !draft.videoUrl;
  }

  // ── Hero video lightbox — the play button over the Hero thumbnail had no
  // click handler at all (pure decoration), so clicking it did nothing. See
  // DECISIONS.md (2026-07-17).
  heroVideoOpen = false;
  openHeroVideo(): void { this.heroVideoOpen = true; }
  closeHeroVideo(): void { this.heroVideoOpen = false; }

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
    return FUNDING_TYPE_LABELS[type as keyof typeof FUNDING_TYPE_LABELS] || type;
  }

  categoryLabel(categoryId: string): string {
    if (!categoryId || categoryId === '__custom__') return '';
    const found = ENTITY_CATEGORIES.find(c => c.id === categoryId);
    return found ? found.label : categoryId;
  }

  layoutMode(draft: CampaignDraft): string {
    return draft.layout?.layoutMode ?? 'standard';
  }

  // Whether the user has explicitly pulled Hero into the block tree (via a
  // 'hero' block, addable in the Page Builder) — if so, the two fixed-slot
  // Hero outlets below suppress themselves and blockTpl's own 'hero' branch
  // renders it at its actual tree position instead. See DECISIONS.md
  // (2026-07-17).
  hasHeroBlock(draft: CampaignDraft): boolean {
    return draft.blocks.some(b => b.type === 'hero');
  }

  // Whether the owner chose to render this FULL_WIDTH_TYPES section inside
  // the sidebar rail instead of full-width below it. See sidebarSections
  // doc comment on CampaignLayout.
  inSidebarSection(draft: CampaignDraft, type: 'rewards' | 'donors' | 'ambassadors' | 'updates' | 'sponsors'): boolean {
    return !!draft.layout.sidebarSections?.includes(type);
  }

  // ── Content blocks for standard/magazine layouts ──
  contentBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id))
      .sort((a, b) => a.order - b.order);
  }

  // Sidebar rail — prefers a real top-level container tagged
  // railZone:'sidebar' (so the user can add/reorder any block type into it
  // via the existing Page Builder container UI), falling back to the older
  // type-based stats/donation-widget filter for campaigns saved before this
  // existed (flat blocks, no container). See DECISIONS.md (2026-07-17).
  sidebarBlocks(draft: CampaignDraft): CampaignBlock[] {
    const railId = this.railZoneContainerId(draft, 'sidebar');
    let blocks: CampaignBlock[];
    if (railId) {
      const container = draft.blocks.find(b => b.id === railId);
      blocks = container ? this.childBlocks(container, draft) : [];
    } else {
      const childIds = this.topLevelChildIds(draft);
      blocks = draft.blocks
        .filter(b => b.visible && !childIds.has(b.id) && (b.type === 'stats' || b.type === 'donation-widget'))
        .sort((a, b) => a.order - b.order);
    }
    // sidebarSections appends any (top-level, not-already-claimed) blocks of
    // the chosen FULL_WIDTH_TYPES after whatever the container/fallback above
    // produced, in their own `order` — works the same whether this campaign
    // uses an explicit railZone container or the older flat-blocks fallback.
    const sections = draft.layout.sidebarSections;
    if (sections && sections.length > 0) {
      const childIds = this.topLevelChildIds(draft);
      const claimed = new Set(blocks.map(b => b.type));
      const extra = draft.blocks
        .filter(b => b.visible && !childIds.has(b.id) && sections.includes(b.type as any) && !claimed.has(b.type))
        .sort((a, b) => a.order - b.order);
      blocks = [...blocks, ...extra];
    }
    return blocks;
  }

  // Main column — prefers a real top-level container tagged railZone:'main'
  // (so the user can add/reorder any block type into it, including a 'hero'
  // block wherever they want Hero to sit), falling back to mainBlocks()'s
  // implicit assembly for campaigns saved before this existed. See
  // DECISIONS.md (2026-07-17).
  mainColumnBlocks(draft: CampaignDraft): CampaignBlock[] {
    const railId = this.railZoneContainerId(draft, 'main');
    if (!railId) return [];
    const container = draft.blocks.find(b => b.id === railId);
    return container ? this.childBlocks(container, draft) : [];
  }

  hasMainContainer(draft: CampaignDraft): boolean {
    return !!this.railZoneContainerId(draft, 'main');
  }

  // A container claimed by a rail zone ('sidebar'/'main') never gets its own
  // .block-wrap — sidebarBlocks()/mainColumnBlocks() return its CHILDREN
  // directly, not the container itself, so nothing in the DOM has the
  // container's own id to match hoveredBlockId against. Hovering that
  // container's row in the builder would silently do nothing in preview.
  // Bound onto the rail's own wrapper element instead.
  isRailZoneContainerHovered(draft: CampaignDraft, zone: 'sidebar' | 'main'): boolean {
    const id = this.railZoneContainerId(draft, zone);
    return this.pageBuilderActive && !!id && this.hoveredBlockId === id;
  }

  // Public — also read by the template to tag each rail's block-wrap divs
  // with the real container id they belong to (data-parent-id), so
  // drag-and-drop hit-testing resolves the correct insertion scope. See
  // resolveDropTarget() below.
  railZoneContainerId(draft: CampaignDraft, zone: 'sidebar' | 'main'): string | null {
    const childIds = this.topLevelChildIds(draft);
    const container = draft.blocks.find(b =>
      b.type === 'container' && !childIds.has(b.id) && (b.data as ContainerBlockData).railZone === zone
    );
    return container?.id ?? null;
  }

  // Main column fallback (no railZone:'main' container): content blocks that
  // are NOT sidebar blocks, NOT full-width blocks, and NOT a container
  // claimed by a rail zone (only its children render, elsewhere — not the
  // container itself, inline).
  mainBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    const railContainerIds = new Set(
      (['sidebar', 'main'] as const)
        .map(zone => this.railZoneContainerId(draft, zone))
        .filter((id): id is string => !!id)
    );
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id) && !railContainerIds.has(b.id)
        && !this.SIDEBAR_TYPES.includes(b.type)
        && !this.FULL_WIDTH_TYPES.includes(b.type))
      .sort((a, b) => a.order - b.order);
  }

  // Full-width blocks rendered below the sidebar two-column area. Any type
  // listed in sidebarSections is excluded here whenever sidebarBlocks()
  // already claimed it — otherwise it would render twice.
  belowSidebarBlocks(draft: CampaignDraft): CampaignBlock[] {
    const childIds = this.topLevelChildIds(draft);
    const sections = draft.layout.sidebarSections ?? [];
    return draft.blocks
      .filter(b => b.visible && !childIds.has(b.id) && this.FULL_WIDTH_TYPES.includes(b.type)
        && !sections.includes(b.type as any))
      .sort((a, b) => a.order - b.order);
  }

  private readonly SIDEBAR_TYPES = ['stats', 'donation-widget'];
  // 'rewards' here is the legacy persisted BlockType value (Offerings section)
  // — see the BlockType comment in campaign-studio-state.service.ts.
  private readonly FULL_WIDTH_TYPES = ['rewards', 'donors', 'ambassadors', 'sponsors', 'updates'];

  private topLevelChildIds(draft: CampaignDraft): Set<string> {
    return new Set(
      draft.blocks
        .filter(b => b.type === 'container' || b.type === 'tabs' || b.type === 'accordion')
        .flatMap(b => (b.data as ContainerBlockData).childBlockIds)
    );
  }

  // ══ Drag-and-drop (block picker → live preview) ═══════════════════════
  // Attached via HostListener rather than template bindings on a specific
  // wrapper element — this component is embedded inside a different scroll
  // wrapper (.preview-inner) on every host page (campaign-studio-page,
  // partner-builder-page, campaign-partner-builder-page), and drag events
  // bubble up to the host element regardless of that page's own markup, so
  // this works unmodified on all three. See DECISIONS.md (2026-07-31).

  // Same scope logic as CampaignStudioStateService#insertBlockAt (NOT
  // filtered to visible-only, unlike childBlocks()/topLevelChildIds() above,
  // which exist purely for rendering) — the index computed here must match
  // exactly what insertBlockAt expects, including any hidden siblings.
  private scopeBlocksAll(parentId: string | null, draft: CampaignDraft): CampaignBlock[] {
    if (parentId) {
      const parent = draft.blocks.find(b => b.id === parentId);
      if (!parent) return [];
      const ids = (parent.data as ContainerBlockData).childBlockIds;
      return ids.map(id => draft.blocks.find(b => b.id === id))
        .filter((b): b is CampaignBlock => !!b)
        .sort((a, b) => a.order - b.order);
    }
    const childIds = this.topLevelChildIds(draft);
    return draft.blocks.filter(b => !childIds.has(b.id)).sort((a, b) => a.order - b.order);
  }

  // Hit-tests the real point under the cursor against every rendered block
  // wrapper (tagged data-block-id/data-parent-id in the template) and
  // resolves it to an exact {parentId, index} insertion point — null means
  // "not over anything recognizable" (background/header/whitespace), which
  // the caller (onPreviewDragOver) falls back to "append at the very end."
  private resolveDropTarget(clientX: number, clientY: number, draft: CampaignDraft):
    { parentId: string | null; index: number; indicatorRect: { top: number; left: number; width: number; height: number }; mode: 'line-h' | 'line-v' | 'box' } | null {

    const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!el) return null;

    // Empty-container placeholder ("+ הוסף לכאן"-equivalent drop hint) —
    // the container has zero rendered children, so there's nothing to
    // compute before/after against. data-empty-container carries the
    // container's own id directly.
    const emptyEl = el.closest('[data-empty-container]') as HTMLElement | null;
    if (emptyEl) {
      const rect = emptyEl.getBoundingClientRect();
      return {
        parentId: emptyEl.getAttribute('data-empty-container'),
        index: 0,
        indicatorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        mode: 'box',
      };
    }

    const hitEl = el.closest('[data-block-id]') as HTMLElement | null;
    if (!hitEl) return null;

    const blockId = hitEl.getAttribute('data-block-id')!;
    const block = draft.blocks.find(b => b.id === blockId);
    if (!block) return null;

    // Landed on a container's OWN wrapper — its padding/gap area, not on
    // any specific child (data-container-body marks that div). Insert
    // INTO it: as the first child near its top/start edge, last otherwise.
    if (hitEl.hasAttribute('data-container-body')) {
      const children = this.scopeBlocksAll(block.id, draft);
      const rect = hitEl.getBoundingClientRect();
      const nearStart = (clientY - rect.top) < rect.height * 0.25;
      const index = children.length === 0 ? 0 : (nearStart ? 0 : children.length);
      return {
        parentId: block.id,
        index,
        indicatorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
        mode: 'box',
      };
    }

    // Ordinary block wrapper (top-level, or a specific container's child) —
    // insert before/after IT within its own scope, based on cursor position
    // relative to its own box. Absent data-parent-id means flat top-level.
    const parentId = hitEl.getAttribute('data-parent-id') || null;
    const scope = this.scopeBlocksAll(parentId, draft);
    const idx = scope.findIndex(b => b.id === blockId);
    if (idx < 0) return null;

    const rect = hitEl.getBoundingClientRect();
    const parentBlock = parentId ? draft.blocks.find(b => b.id === parentId) : null;
    const isRow = parentBlock?.type === 'container' && (parentBlock.data as ContainerBlockData).direction === 'row';

    if (isRow) {
      // RTL: index 0 of a row-direction container renders RIGHTMOST — so
      // "insert before index N" visually means "place it to the RIGHT of
      // element N," i.e. the right half of its box, not the left.
      const midX = rect.left + rect.width / 2;
      const before = clientX > midX;
      const lineX = before ? rect.right : rect.left;
      return {
        parentId, index: before ? idx : idx + 1,
        indicatorRect: { top: rect.top, left: lineX - 1, width: 2, height: rect.height },
        mode: 'line-v',
      };
    }
    const midY = rect.top + rect.height / 2;
    const before = clientY < midY;
    const lineY = before ? rect.top : rect.bottom;
    return {
      parentId, index: before ? idx : idx + 1,
      indicatorRect: { top: lineY - 1, left: rect.left, width: rect.width, height: 2 },
      mode: 'line-h',
    };
  }

  // The scroll wrapper is named differently per host page — .preview-inner
  // (campaign-studio-page), .pb-preview-card (partner-builder-page),
  // .cpb-preview-card (campaign-partner-builder-page) — try all three
  // rather than assuming one specific name.
  private autoScrollPreview(clientY: number): void {
    const scrollEl = document.querySelector('.preview-inner, .pb-preview-card, .cpb-preview-card') as HTMLElement | null;
    if (!scrollEl) return;
    const rect = scrollEl.getBoundingClientRect();
    const EDGE = 56;
    if (clientY < rect.top + EDGE) scrollEl.scrollTop -= 14;
    else if (clientY > rect.bottom - EDGE) scrollEl.scrollTop += 14;
  }

  // True if `candidateId` IS `rootId` or lives anywhere in its descendant
  // tree — mirrors the same-named guard in campaign-studio-state.service.ts
  // (moveBlockTo), used here to SUPPRESS a misleading drop indicator while
  // hovering a spot that the service would reject anyway (dropping a
  // container into itself or one of its own children).
  private isSameOrDescendant(candidateId: string, rootId: string, draft: CampaignDraft): boolean {
    if (candidateId === rootId) return true;
    const root = draft.blocks.find(b => b.id === rootId);
    if (!root || (root.type !== 'container' && root.type !== 'tabs' && root.type !== 'accordion')) return false;
    return (root.data as ContainerBlockData).childBlockIds.some(cid => this.isSameOrDescendant(candidateId, cid, draft));
  }

  // Listening on `document` (not the component's own host element) is
  // deliberate: below/around the actual rendered .campaign-page content
  // there's blank space that belongs to the HOST PAGE's own scroll wrapper
  // (.preview-inner, in partner-builder-page/campaign-studio-page/
  // campaign-partner-builder-page — outside this component's own DOM
  // subtree entirely), so a dragover there would never bubble to a
  // HostListener bound to <app-campaign-preview> itself. A document-level
  // listener plus elementFromPoint-based hit-testing (already how
  // resolveDropTarget works) catches it regardless. Harmless when nothing
  // is being dragged — every handler bails out on `!this.draggingType &&
  // !this.draggingExistingId` immediately. See DECISIONS.md (2026-07-31,
  // "לגרור אלמנט מתחת לאלמנט הראשון" fix).
  @HostListener('document:dragover', ['$event'])
  onPreviewDragOver(event: DragEvent): void {
    if (!this.draggingType && !this.draggingExistingId) return;
    event.preventDefault();
    // Must match the dragstart's effectAllowed ('copy' for a new block from
    // the picker, 'move' for an existing block's grip handle — see
    // onPickerDragStart/onBlockDragStart/onExistingBlockDragStart) — some
    // browsers silently refuse to fire 'drop' at all when dropEffect isn't
    // one of the allowed effects, even though dragover itself fires fine
    // and preventDefault() is called. Reported 2026-07-31 ("הגרירה לא
    // עובדת", existing-block reorder from the preview).
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.draggingExistingId ? 'move' : 'copy';

    const draft = this.state.draft;
    let target = this.resolveDropTarget(event.clientX, event.clientY, draft);

    // Nothing recognizable under the cursor (background/header/whitespace,
    // or the empty-state hint on a brand-new page) — append at the very
    // end of the flat top-level scope instead of showing no feedback at all.
    if (!target) {
      const scope = this.scopeBlocksAll(null, draft);
      const lastEl = scope.length
        ? document.querySelector(`[data-block-id="${scope[scope.length - 1].id}"]`)
        : document.querySelector('.empty-state, .campaign-page');
      const rect = lastEl?.getBoundingClientRect();
      if (rect) {
        target = scope.length
          ? { parentId: null, index: scope.length, indicatorRect: { top: rect.bottom - 1, left: rect.left, width: rect.width, height: 2 }, mode: 'line-h' }
          : { parentId: null, index: 0, indicatorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }, mode: 'box' };
      }
    }

    // Dragging an EXISTING block: never allow dropping it into itself or
    // one of its own children (the service would just no-op it anyway —
    // this only avoids showing a misleading indicator there). Fall back to
    // "nothing valid here" rather than silently keeping the previous
    // target, which would look like a stale/stuck indicator.
    if (target && target.parentId && this.draggingExistingId && this.isSameOrDescendant(target.parentId, this.draggingExistingId, draft)) {
      target = null;
    }

    // Hero is a single top-of-page marker — never nestable inside a
    // container/tabs/accordion. Force it back to the flat top-level scope
    // regardless of what was actually hovered. Applies whether it's a new
    // Hero from the picker OR an existing Hero block being repositioned.
    // See BlockType's 'hero' doc comment in campaign-studio-state.service.ts.
    const draggingType = this.draggingType ?? (this.draggingExistingId ? draft.blocks.find(b => b.id === this.draggingExistingId)?.type : null);
    if (target && target.parentId && draggingType === 'hero') {
      const scope = this.scopeBlocksAll(null, draft);
      const lastEl = scope.length ? document.querySelector(`[data-block-id="${scope[scope.length - 1].id}"]`) : null;
      const rect = lastEl?.getBoundingClientRect();
      target = rect
        ? { parentId: null, index: scope.length, indicatorRect: { top: rect.bottom - 1, left: rect.left, width: rect.width, height: 2 }, mode: 'line-h' }
        : null;
    }

    this.dropTarget = target;
    this.autoScrollPreview(event.clientY);
  }

  // document-scoped for the same reason as onPreviewDragOver above — a drop
  // can land on blank space that belongs to the host page's own scroll
  // wrapper, outside this component's own DOM subtree.
  @HostListener('document:drop', ['$event'])
  onPreviewDrop(event: DragEvent): void {
    if ((!this.draggingType && !this.draggingExistingId) || !this.dropTarget) return;
    event.preventDefault();
    const { parentId, index } = this.dropTarget;
    this.dropTarget = null;

    if (this.draggingExistingId) {
      const id = this.draggingExistingId;
      this.state.setDraggedExistingBlockId(null);
      this.state.moveBlockTo(id, parentId, index);
      return;
    }

    const type = this.draggingType!;
    this.state.setDraggedBlockType(null);
    const id = this.state.insertBlockAt(type, parentId, index);
    if (id) this.state.requestFocusBlock(id, type);
  }

  // Clears the (purely visual) indicator whenever ANY drag ends anywhere —
  // dragend always fires on the source regardless of whether the drop
  // landed inside the preview, was cancelled (Escape), or was dropped
  // outside the browser window entirely (where dragover simply stops
  // firing, which would otherwise leave a stale indicator on screen). The
  // shared drag state itself (draggedBlockType/draggedExistingBlockId) is
  // cleared by the SOURCE's own dragend handler — see
  // campaign-page-builder-step.component.ts's onPickerDragEnd/
  // onBlockDragEnd.
  @HostListener('document:dragend')
  onAnyDragEnd(): void {
    this.dropTarget = null;
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

  // ── Tabs — which tab is active per Tabs block instance. Presentational
  // only (not persisted): a visitor's click shouldn't change what the next
  // visitor sees, and the Builder's own live preview shouldn't carry state
  // across drafts. See DECISIONS.md (2026-07-17).
  private activeTabByBlock = new Map<string, string>();
  activeTab(block: CampaignBlock, draft: CampaignDraft): CampaignBlock | null {
    const tabs = this.childBlocks(block, draft);
    if (tabs.length === 0) return null;
    const activeId = this.activeTabByBlock.get(block.id);
    return tabs.find(t => t.id === activeId) ?? tabs[0];
  }
  setActiveTab(blockId: string, tabId: string): void {
    this.activeTabByBlock.set(blockId, tabId);
  }

  // Lets a single tabs/accordion block render differently on mobile than on
  // desktop (e.g. tabs on desktop, panels on mobile) — desktop always uses
  // the block's own `type`; mobile uses it too unless mobileLayout overrides
  // it. TabsBlockData/AccordionBlockData share the exact same shape, so this
  // cast is safe regardless of which of the two `block.type` actually is.
  effectiveBlockType(block: CampaignBlock, mobile: boolean): BlockType {
    if (block.type !== 'tabs' && block.type !== 'accordion') return block.type;
    const layout = (block.data as TabsBlockData).mobileLayout;
    if (mobile && layout && layout !== 'same') return layout;
    return block.type;
  }

  // ── Accordion (panels) — independent, multi-open by design: each panel
  // toggles on its own, unlike tabs' single-active-child. Seeded lazily from
  // each panel's own panelDefaultOpen the first time an accordion is touched.
  private openPanelsByAccordion = new Map<string, Set<string>>();
  private ensureAccordionInit(accordionId: string, panels: CampaignBlock[]): Set<string> {
    if (!this.openPanelsByAccordion.has(accordionId)) {
      const openIds = panels.filter(p => (p.data as ContainerBlockData).panelDefaultOpen).map(p => p.id);
      this.openPanelsByAccordion.set(accordionId, new Set(openIds));
    }
    return this.openPanelsByAccordion.get(accordionId)!;
  }
  isPanelOpen(accordionId: string, panelId: string, panels: CampaignBlock[]): boolean {
    return this.ensureAccordionInit(accordionId, panels).has(panelId);
  }
  togglePanel(accordionId: string, panelId: string, panels: CampaignBlock[]): void {
    const open = this.ensureAccordionInit(accordionId, panels);
    if (open.has(panelId)) open.delete(panelId); else open.add(panelId);
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
    return `${d}/${m}/${y}`;
  }

  formatDateShort(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = this.parseDate(iso);
    return `${d}/${m}/${y}`;
  }

  formatDateFull(iso: string): string {
    if (!iso) return '';
    const [y, m, d] = this.parseDate(iso);
    return `${d}/${m}/${y}`;
  }

  // ── Utilities ──
  safeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.forceLinksNewTab(html || ''));
  }

  // Forces target="_blank" on every link inside rich-text content,
  // regardless of whether the editor itself set it — covers rich-text
  // blocks saved BEFORE the rich-text-editor's Link extension started
  // setting this itself (see rich-text-editor.component.ts). A donor
  // clicking a link inside campaign body text shouldn't get navigated away
  // from the donation page. See DECISIONS.md (2026-07-31).
  private forceLinksNewTab(html: string): string {
    if (!html.includes('<a ')) return html;
    const div = document.createElement('div');
    div.innerHTML = html;
    div.querySelectorAll('a[href]').forEach(a => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    return div.innerHTML;
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

  getYoutubeEmbedUrl(url: string, autoplay = false): SafeResourceUrl | null {
    if (!url) return null;
    const patterns = [/youtube\.com\/watch\?v=([^&]+)/, /youtu\.be\/([^?]+)/, /youtube\.com\/embed\/([^?]+)/];
    for (const p of patterns) {
      const m = url.match(p);
      if (m) return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.youtube.com/embed/${m[1]}?rel=0${autoplay ? '&autoplay=1' : ''}`);
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

  isOfferingInCart(id: string): boolean { return this.cartOfferingIds.has(id); }

  // Offering is a pure gift/perk concept again — always goes to the cart.
  // Registration lives entirely outside this grid now (see startRegistration
  // below). See DECISIONS.md (2026-07-16).
  selectOffering(offering: Offering, draft: CampaignDraft): void {
    this.cartOfferingIds.add(offering.id);
    this.cartOfferingIds = new Set(this.cartOfferingIds);
  }

  removeOffering(id: string): void {
    this.cartOfferingIds.delete(id);
    this.cartOfferingIds = new Set(this.cartOfferingIds);
  }

  toggleOffering(id: string): void {
    if (this.cartOfferingIds.has(id)) {
      this.cartOfferingIds.delete(id);
    } else {
      this.cartOfferingIds.add(id);
    }
    this.cartOfferingIds = new Set(this.cartOfferingIds);
  }

  get cartCount(): number { return this.cartOfferingIds.size; }

  get explicitAmount(): number {
    if (this.customAmount) return this.customAmount;
    if (this.selectedAmount !== null) return this.selectedAmount;
    return 0;
  }

  cartOfferingsTotal(draft: CampaignDraft): number {
    return draft.offerings
      .filter(o => this.cartOfferingIds.has(o.id))
      .reduce((sum, o) => sum + (o.minimumAmount || 0), 0);
  }

  totalAmount(draft: CampaignDraft): number {
    return this.explicitAmount + this.cartOfferingsTotal(draft);
  }

  // Opens checkout directly in Registration mode — the checkout modal itself
  // is where participants get added, each picking their own Registration
  // Option (defaults to the first one for participant #1).
  startRegistration(): void {
    this.checkoutMode = 'registration';
    this.checkoutOpen = true;
  }

  scrollToDonation(): void {
    const el = document.querySelector('.hm-donate');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  onCtaClick(cta: CtaBlockData): void {
    if (cta.ctaAction === 'link') {
      if (cta.linkUrl) window.open(cta.linkUrl, '_blank', 'noopener');
      return;
    }
    if (cta.ctaAction === 'register') { this.startRegistration(); return; }
    this.scrollToDonation();
  }

  goToAccount(): void {
    // A logged-in visitor here is always a donor viewing a public campaign
    // page (entity managers/admins don't browse it while authenticated as
    // themselves) — send them straight to their donation history.
    this.router.navigate([localStorage.getItem('token') ? '/my-donations' : '/login']);
  }

  openCheckout(draft: CampaignDraft): void {
    if (this.selectedAmount === null && !this.customAmount) {
      const effective = this.getEffectiveAmount(draft);
      if (effective > 0) this.selectedAmount = effective;
    }
    // A pending registration alone is enough reason to open — the visitor
    // may just want to pay for it with zero extra donation.
    if (this.totalAmount(draft) === 0 && !this.pendingRegistration) return;
    this.checkoutMode = 'donation';
    this.checkoutOpen = true;
  }

  closeCheckout(): void {
    this.checkoutOpen = false;
    this.checkoutMode = 'donation';
  }

  cartOfferingList(draft: CampaignDraft) {
    return draft.offerings.filter(o => this.cartOfferingIds.has(o.id));
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

  // Heading style for .section-heading (rich-text/video/gallery's own
  // `label`, rendered as a real page heading) — only rich-text carries a
  // headingStyle field (see RichTextBlockData); video/gallery keep the
  // exact fixed look they always had. Undefined color/fontSize/align fall
  // back to the SAME defaults .section-heading's CSS already used (22px,
  // center, primaryColor) — no visual change for any existing block that
  // never touched this. See DECISIONS.md (2026-07-31).
  private readonly HEADING_FONT_SIZES: Record<string, string> = { sm: '16px', md: '19px', lg: '22px', xl: '28px' };

  private richTextHeadingStyle(block: CampaignBlock): TextStyle | undefined {
    return block.type === 'rich-text' ? (block.data as RichTextBlockData).headingStyle : undefined;
  }

  sectionHeadingColor(block: CampaignBlock, draft: CampaignDraft): string {
    return this.richTextHeadingStyle(block)?.color || this.primaryColor(draft);
  }

  sectionHeadingFontSize(block: CampaignBlock): string {
    return this.HEADING_FONT_SIZES[this.richTextHeadingStyle(block)?.fontSize || 'lg'];
  }

  sectionHeadingAlign(block: CampaignBlock): string {
    return this.richTextHeadingStyle(block)?.align || 'center';
  }

  blockSectionId(block: CampaignBlock, draft?: CampaignDraft): string {
    if (block.type === 'rich-text')        return 'section-story';
    if (block.type === 'donation-widget') return 'section-donate';
    if (block.type === 'rewards')          return 'section-rewards';
    if (block.type === 'updates')      return 'section-updates';
    if (block.type === 'donors')       return 'section-donors';
    if (block.type === 'ambassadors')  return 'section-ambassadors';
    if (block.type === 'sponsors')     return 'section-sponsors';
    if (block.type === 'comments')     return 'section-comments';
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
      'comments':     'תגובות',
    };
    const seen = new Set<string>();
    const items: { label: string; sectionId: string; count?: number }[] = [];
    for (const block of (draft.blocks ?? [])) {
      const sectionId = this.blockSectionId(block, draft);
      if (!sectionId || seen.has(sectionId)) continue;
      seen.add(sectionId);
      const label = block.type === 'rich-text'
        ? (this.isCampaign(draft) ? 'אודות הקמפיין' : 'אודות')
        : LABELS[block.type];
      if (!label) continue;
      const count =
        block.type === 'ambassadors' ? (this.ambEffective.length || undefined) :
        block.type === 'donors'      ? (this.activeDonors.length  || undefined) :
        block.type === 'comments'    ? (this.comments.length      || undefined) :
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
  asTabs(data: unknown)             { return data as TabsBlockData; }
  asAccordion(data: unknown)        { return data as AccordionBlockData; }
  asStats(data: unknown)            { return data as StatsBlockData; }
  asDonationWidget(data: unknown)   { return data as DonationWidgetBlockData; }
  asCta(data: unknown)              { return data as CtaBlockData; }
  ctaGap(blockHeight?: number): number { return Math.max(6, Math.round((blockHeight || 32) * 0.35)); }
  asShare(data: unknown)            { return data as ShareBlockData; }
  asDivider(data: unknown)          { return data as DividerBlockData; }
  asCoupons(data: unknown)          { return data as CouponsBlockData; }
  asMap(data: unknown)              { return data as MapBlockData; }
  asOpeningHours(data: unknown)     { return data as OpeningHoursBlockData; }

  // No Google Maps API key configured anywhere in this project (checked
  // environment.ts) — uses the key-less Google Maps embed query form
  // instead of the JS Maps Embed API.
  mapEmbedUrl(data: MapBlockData): SafeResourceUrl {
    const q = data.lat != null && data.lng != null ? `${data.lat},${data.lng}` : (data.address || '');
    const url = `https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }
  asDonors(data: unknown)           { return data as DonorsBlockData; }
  asSponsorsBlock(data: unknown)    { return data as SponsorsBlockData; }
  asAmbassadorsBlock(data: unknown) { return data as AmbassadorsBlockData; }
  asUpdates(data: unknown)          { return data as UpdatesBlockData; }
  asComments(data: unknown)         { return data as CommentsBlockData; }

  donors: Donor[] = [];
  topDonors: TopDonor[] = [];
  donorPeriod: DonorPeriod = 'all';
  private loadedSlug = '';
  private loadedPartnersSlug = '';
  partnerByRewardId: Record<string, { id: string; displayName: string; logoUrl: string | null; website: string | null }> = {};

  partnerForOffering(offeringId: string): { id: string; displayName: string } | null {
    return this.partnerByRewardId[offeringId] ?? null;
  }

  private loadedRewardCountsSlug = '';
  rewardCounts: Record<string, number> = {};

  purchasedCount(offeringId: string): number {
    return this.rewardCounts[offeringId] ?? 0;
  }

  // Query params carried onto the Partner public page so it can show a
  // "← חזרה לקמפיין" bar and prev/next navigation among this campaign's
  // other partners, without a separate lookup (Sprint 5.2/5.3).
  partnerLinkQueryParams(draft: CampaignDraft): { campaignSlug: string; campaignTitle: string } {
    return { campaignSlug: draft.slug, campaignTitle: draft.title };
  }
  private shownCount = 6;
  readonly PAGE_SIZE = 6;

  get activeDonors(): Donor[] {
    return this.donors;
  }
  get activeTopDonors(): TopDonor[] {
    return this.topDonors;
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

  // Public page — never show a manager's draft update to a visitor. Status
  // is optional (absent = 'published', the Builder's own updates step has
  // no draft concept) — see CampaignUpdate.status doc comment.
  publishedUpdates(draft: CampaignDraft): CampaignUpdate[] {
    return (draft.updates ?? []).filter(u => (u.status ?? 'published') === 'published');
  }

  // Sidebar placement only — the below-sidebar slider/list variants render
  // publishedUpdates(draft) in full (no pagination needed at full section width).
  private updatesShownCount = this.PAGE_SIZE;
  visibleUpdates(draft: CampaignDraft): CampaignUpdate[] {
    return this.publishedUpdates(draft).slice(0, this.updatesShownCount);
  }
  canShowMoreUpdates(draft: CampaignDraft): boolean {
    return this.updatesShownCount < this.publishedUpdates(draft).length;
  }
  showMoreUpdates(draft: CampaignDraft): void {
    this.updatesShownCount = Math.min(this.updatesShownCount + this.PAGE_SIZE, this.publishedUpdates(draft).length);
  }

  // Cards are uniform height (title/description both line-clamped in CSS) —
  // "קראו עוד" only appears when the text would actually be cut off, and
  // opens the full update in a popup instead of growing the card.
  private readonly READ_MORE_THRESHOLD = 130;
  viewingUpdate: CampaignUpdate | null = null;
  needsReadMore(u: CampaignUpdate): boolean {
    const plain = (u.description || '').replace(/<[^>]*>/g, '').trim();
    return plain.length > this.READ_MORE_THRESHOLD;
  }
  openUpdate(u: CampaignUpdate): void { this.viewingUpdate = u; }
  closeUpdate(): void { this.viewingUpdate = null; }

  loadDonors(slug: string): void {
    this.donationService.getDonors(slug, this.donorPeriod).subscribe({
      next: ({ donors, topDonors }) => {
        this.donors     = donors;
        this.topDonors  = topDonors;
      },
    });
  }

  setDonorPeriod(period: DonorPeriod): void {
    if (this.donorPeriod === period) return;
    this.donorPeriod  = period;
    this.shownCount   = this.PAGE_SIZE;
    if (this.loadedSlug) this.loadDonors(this.loadedSlug);
  }

  // ── Comments — public, anonymous (name + email, no login) ──
  comments: CampaignComment[] = [];
  private loadedCommentsSlug = '';
  commentSearchTerm = '';
  private commentSearch$ = new Subject<string>();
  commentForm = { authorName: '', authorEmail: '', content: '' };
  commentSubmitting = false;
  commentSubmitError: string | null = null;
  commentSubmitted = false;

  loadComments(slug: string, search?: string): void {
    this.commentsService.getComments(slug, search).subscribe({
      next: list => { this.comments = list; },
    });
  }

  onCommentSearchChange(term: string): void {
    this.commentSearchTerm = term;
    this.commentSearch$.next(term);
  }

  submitComment(draft: CampaignDraft): void {
    const { authorName, authorEmail, content } = this.commentForm;
    if (!authorName.trim() || !authorEmail.trim() || !content.trim()) {
      this.commentSubmitError = 'נא למלא שם, אימייל ותוכן התגובה';
      return;
    }
    this.commentSubmitting = true;
    this.commentSubmitError = null;
    this.commentsService.postComment(draft.slug!, { authorName, authorEmail, content }).subscribe({
      next: comment => {
        this.comments = [...this.comments, comment];
        this.commentForm = { authorName: '', authorEmail: '', content: '' };
        this.commentSubmitting = false;
        this.commentSubmitted = true;
        setTimeout(() => { this.commentSubmitted = false; }, 3000);
      },
      error: () => {
        this.commentSubmitting = false;
        this.commentSubmitError = 'משהו השתבש, נסו שוב';
      },
    });
  }

  formatCommentDate(date: Date): string {
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const y = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${d}/${m}/${y} ${hh}:${mm}`;
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

  // 'raised'/'target'/'percent' render fixed above (ring + raised-info) and
  // aren't part of the reorderable KPI grid — same for the always-on
  // "נותר ליעד" figure, which isn't a StatKey at all. Only these five are
  // the actual configurable KPI list (Builder's "סדר וחשיפה" editor).
  private readonly GRID_STAT_KEYS: StatKey[] =
    ['supporters', 'ambassadors', 'days_remaining', 'start_date', 'end_date'];

  visibleGridStats(block: CampaignBlock): StatsBlockData['items'] {
    return this.visibleStats(block).filter(i => this.GRID_STAT_KEYS.includes(i.key));
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
