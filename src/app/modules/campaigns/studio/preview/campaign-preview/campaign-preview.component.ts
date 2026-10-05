import { Component, inject, OnInit, OnDestroy, AfterViewInit, Input, HostListener } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subject, takeUntil, debounceTime } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeResourceUrl, SafeHtml } from '@angular/platform-browser';
import { LucideAngularModule, GripVertical, Mail, Facebook } from 'lucide-angular';
import { TextStyle } from '../../../../../shared/models/text-style.model';
import { resolveRoleColor, resolveRoleFontWeight, resolveRoleBorderRadius, LEGACY_THEME_COLOR } from '../../../utils/text-role-resolver';
import { AMOUNT_BUTTON_PRESETS, AmountButtonPresetTokens } from '../../../utils/donation-amount-button-presets';
import { CurrentEntityService } from '../../../../../core/services/current-entity.service';
import { AccountNavService } from '../../../../../core/services/account-nav.service';
import { resolveCampaignLogo } from '../../../utils/campaign-branding.util';
import { EntitiesService } from '../../../../../core/services/entities.service';
import { environment } from '../../../../../../environments/environment';
import { StudioUiService } from '../../services/studio-ui.service';
import { resolveVisualTokens, CampaignStyleVisualTokens, resolveDonationComposition, ConversionWidgetLayout, resolveOpeningComposition, resolveSectionSurfaceColors, OpeningComposition, resolveSectionPresentation, SectionPresentation, PresentableSection } from '../../../builder/styles/campaign-styles';
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
import { CheckoutV2Component } from '../../../shared/components/checkout-v2/checkout-v2.component';
import { CHECKOUT_V2_ENABLED } from '../../../shared/config/checkout-v2.config';
import { DonationService, Donor, DonorPeriod } from '../../../services/donation.service';
import { Ambassador, AmbassadorPublicInfo, AmbassadorService } from '../../../services/ambassador.service';
import { CampaignAmbassador } from '../../../services/campaign-studio-state.service';
import { CommentsService, CampaignComment } from '../../../services/comments.service';
import { CampaignPartnersService } from '../../../services/campaign-partners.service';
import { sanitizeRichHtml } from '../../../../../shared/utils/sanitize-rich-html';
import { AmbassadorSlugFieldComponent } from '../../../shared/components/ambassador-slug-field/ambassador-slug-field.component';

@Component({
  selector: 'app-campaign-preview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, CheckoutModalComponent, CheckoutV2Component, LucideAngularModule, AmbassadorSlugFieldComponent],
  templateUrl: './campaign-preview.component.html',
  styleUrl: './campaign-preview.component.css',
})
export class CampaignPreviewComponent implements OnInit, AfterViewInit, OnDestroy {
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

  // ── Click-to-edit (2026-09-30) — connects the live preview to the
  // EXISTING Builder editor via requestFocusBlock(), the same method/Subject
  // already used right after a drag-and-drop insertion (see
  // insertBlockAt()'s caller below) — no new selection/focus state
  // introduced. Only active while pageBuilderActive (Builder editing mode);
  // zero behavior change on the real public/donor-facing page, which never
  // sets pageBuilderActive at all.
  onBlockClick(event: MouseEvent, block: CampaignBlock): void {
    if (!this.pageBuilderActive) return;
    if (this.isInteractiveClickTarget(event)) return;
    // Stops this same click from also bubbling to an ANCESTOR .block-wrap/
    // .container-child (a block nested inside a container) and requesting
    // focus for the wrong (outer) block too — same stopPropagation
    // convention already used for nested hover (.container-child's own
    // (mouseenter) in the template).
    event.stopPropagation();
    this.state.requestFocusBlock(block.id, block.type);
  }

  // Generic guard, not block-type-specific — a click that lands on (or
  // inside) a real interactive control must keep doing its own thing
  // (follow a link, submit a donation amount, open a video lightbox, etc.),
  // never get hijacked into "open this block's editor" just because that
  // control happens to live inside a Page Builder block.
  private isInteractiveClickTarget(event: Event): boolean {
    const el = event.target as HTMLElement | null;
    return !!el?.closest('a, button, input, textarea, select, video, audio, iframe, [role="button"], [contenteditable="true"]');
  }

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
  // Set by the real public-facing pages (campaign-public-page,
  // partner-public-page) only -- stays false everywhere this component is
  // used for editing (the Studio's own preview tab, the Page Builder's live
  // pane), which is what keeps every section visible with its Builder-facing
  // empty state there regardless of content. See shouldRenderBlock().
  @Input() isPublicPage = false;
  private autoOpenJoinTriggered = false;
  private ambassadorSvc = inject(AmbassadorService);
  private router        = inject(Router);
  private accountNav    = inject(AccountNavService);

  // ── Ambassador leaderboard state ──
  ambSearch   = '';
  ambSortBy: 'raised' | 'name' | 'pct' | 'donors' = 'raised';
  ambShowCount = 6;
  private liveAmbassadors: AmbassadorPublicInfo[] | null = null;
  private loadedAmbSlug = '';

  // ── Ambassador self-join modal ──
  showJoinModal = false;
  joinStatus: 'idle' | 'loading' | 'success' | 'error' = 'idle';
  joinForm     = { fullName: '', phone: '', email: '', goalAmount: null as number | null, slug: '' };
  // Gates submit alongside fullName -- mirrors how the existing campaign-slug
  // field gates the publish flow on its own availability flag.
  joinSlugAvailable = false;
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
    this.joinForm          = { fullName: '', phone: '', email: '', goalAmount: null, slug: '' };
    this.joinSlugAvailable = false;
    this.joinGoalDisplay   = '';
    this.joinStatus        = 'idle';
    this.joinShareUrl      = '';
    this.joinCopied        = false;
    this.joinError         = '';
    this.showJoinModal     = true;
  }

  // Non-blocking (Product Requirement 2): a personal goal above the
  // campaign's target is allowed, just flagged -- never disables submit.
  joinGoalAboveCampaignGoal(draft: CampaignDraft): boolean {
    const target = draft.targetAmount ?? 0;
    return !!this.joinForm.goalAmount && target > 0 && this.joinForm.goalAmount > target;
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
    if (!this.joinForm.fullName.trim() || this.joinStatus === 'loading' || !this.joinSlugAvailable) return;
    this.joinStatus = 'loading';
    this.ambassadorSvc.selfRegister(draft.slug!, {
      fullName: this.joinForm.fullName,
      phone: this.joinForm.phone,
      email: this.joinForm.email,
      goalAmount: this.joinForm.goalAmount,
      slug: this.joinForm.slug,
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

  // Fallback ONLY — the entity currently ACTIVE in the topbar switcher, for
  // a brand-new/not-yet-saved draft that has no campaign row yet to join an
  // entity against. For any real (already-persisted) campaign, prefer
  // draft.entityLogo/draft.entityName instead (see resolvedEntityLogo()/
  // resolvedEntityName() below) — using these fields directly used to leak
  // whatever entity happens to be globally "current" for the logged-in
  // manager into a DIFFERENT campaign's Checkout/Hero/footer (2026-09-28).
  private fallbackEntityLogoUrl: string | null = null;
  private fallbackEntityName = '';
  navOpen = false;
  // Reactive now (was a static `true`, i.e. always shown from page load
  // regardless of scroll — the in-page donate CTA and this bar could both
  // be visible on screen at once, and this never actually behaved like a
  // "scrolled past the CTA" bar in the first place since it sits right
  // before the closing tag, near the very end of the page in normal flow).
  // Toggled by an IntersectionObserver on the in-page CTA — see
  // setupStickyObserver()/ngAfterViewInit. Found + fixed 2026-09-23.
  showStickyBar = false;
  private stickyObserver: IntersectionObserver | null = null;
  readonly currentYear = new Date().getFullYear();
  private expandedOfferings = new Set<string>();
  private gallerySlides     = new Map<string, number>();

  // ── Checkout state ──
  readonly CHECKOUT_V2_ENABLED = CHECKOUT_V2_ENABLED;
  checkoutOpen = false;
  // 'registration' bypasses the cart/donation-widget entirely — the widget's
  // primary action becomes "Register" whenever the campaign has Registration
  // Options (see startRegistration below). See DECISIONS.md (2026-07-15,
  // 2.4 Multi-Participant Registration; 2026-07-16, Registration Options).
  checkoutMode: 'donation' | 'registration' = 'donation';
  // Opt-in per campaign — the toggle only ever shows when the manager has
  // configured draft.monthlyAmounts (see campaign-donation-step). Purely a
  // donation-flow choice, deliberately independent of campaignLifecycle
  // ('ongoing' campaigns do not default to this — kept as two separate
  // axes, see docs/CARDCOM_RECURRING_IMPLEMENTATION_PLAN.md UI notes).
  donationFrequency: 'one-time' | 'monthly' = 'one-time';
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
      this.fallbackEntityName = entity.display_name || entity.legal_name || entity.name || '';
      this.entitiesService.getEntityById(entity.id).subscribe({
        next: (res: any) => {
          const raw = res?.logo_url ?? null;
          if (raw) {
            this.fallbackEntityLogoUrl = (raw.startsWith('http') || raw.startsWith('data:image'))
              ? raw : `${environment.apiUrl}${raw}`;
          }
          if (!this.fallbackEntityName)
            this.fallbackEntityName = res?.display_name || res?.legal_name || res?.name || '';
        },
      });
    }
  }

  // Campaign's own logo/entity, not whatever entity happens to be globally
  // "current" — see resolveCampaignLogo()'s own doc comment. The
  // fallbackEntityLogoUrl/fallbackEntityName fallback is gated on !draft.id
  // (2026-09-29, tightened after review) rather than on resolveCampaignLogo()
  // returning falsy — an existing/persisted campaign (real draft.id, always
  // true on the public page and owner preview, which only ever render an
  // already-loaded campaign) can legitimately have no logo at all when its
  // owning entity never uploaded one; that must render as no-logo, not
  // silently borrow whatever entity happens to be active in the manager's
  // topbar. draft.id is undefined ONLY for a brand-new Studio draft that
  // has never been saved (createInitialDraft() never sets it) — the one
  // case where there is no persisted campaign/entity to resolve against yet
  // and this fallback is the correct, editor-only convenience.
  resolvedEntityLogo(draft: CampaignDraft): string | null {
    const logo = resolveCampaignLogo(draft);
    if (logo) return logo;
    return draft.id ? null : this.fallbackEntityLogoUrl;
  }

  resolvedEntityName(draft: CampaignDraft): string {
    if (draft.entityName) return draft.entityName;
    return draft.id ? '' : this.fallbackEntityName;
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

  ngAfterViewInit(): void {
    this.setupStickyObserver();
  }

  // .hm-donate-btn only exists once the async draft$ has resolved and the
  // relevant block has rendered — not yet at ngAfterViewInit in the common
  // case, hence the short retry loop instead of a one-shot querySelector.
  // Gives up after ~4s (Partner pages / drafts with no donation-widget block
  // at all never find it, by design — hasDonationWidget already gates the
  // bar itself in the template either way).
  private setupStickyObserver(attempt = 0): void {
    const target = document.querySelector('.hm-primary-donate-cta');
    if (!target) {
      if (attempt < 20) setTimeout(() => this.setupStickyObserver(attempt + 1), 200);
      return;
    }
    this.stickyObserver = new IntersectionObserver(
      ([entry]) => { this.showStickyBar = !entry.isIntersecting; },
      { threshold: 0 },
    );
    this.stickyObserver.observe(target);
  }

  ngOnDestroy(): void {
    this.stickyObserver?.disconnect();
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

  // Section Presentation (2026-10-03, placement-aware 2026-10-06) — see
  // campaign-styles.ts#resolveSectionPresentation for the full precedence
  // chain (explicit -> placement's own recommendation [Sidebar always
  // 'list'; Main uses Campaign Style if set] -> 'cards').
  //
  // Rewards-only legacy escape hatch: layout.rewardsLayout predates this axis
  // and is a MANDATORY field (always 'standard' or 'image', never undefined —
  // see its own doc comment), so a campaign whose manager already explicitly
  // chose 'image' there keeps seeing image-emphasis cards by default, without
  // needing to re-pick it through the new field. Only applies when the new
  // field hasn't been touched for rewards AND the section is in the main
  // column — rewardsLayout='image' only ever affected the main-content
  // carousel historically (the sidebar always used its own separate list-card
  // regardless of rewardsLayout), so it must not override the sidebar's
  // compact recommendation now that rewards can actually BE placed there. An
  // explicit sectionPresentation choice always wins outright regardless of
  // placement, same as every other precedence chain here.
  sectionPresentation(draft: CampaignDraft, type: PresentableSection): SectionPresentation {
    const inSidebar = this.inSidebarSection(draft, type);
    if (type === 'rewards' && !inSidebar && !draft.layout.sectionPresentation?.rewards && draft.layout.rewardsLayout === 'image') {
      return 'image';
    }
    return resolveSectionPresentation(
      type,
      draft.layout.sectionPresentation,
      draft.layout.campaignStyleId,
      inSidebar,
    );
  }

  // Updates-only legacy escape hatch: viewMode lives on the BLOCK's own data
  // (not layout), predates this axis, and is OPTIONAL (undefined = today's
  // 'slider' default -- never an explicit past choice, so it must NOT force
  // 'cards' here the way rewardsLayout's always-concrete value does above).
  // Only an explicit past 'list' choice is honored as a legacy override;
  // anything else falls through to the normal precedence chain.
  updatesPresentation(draft: CampaignDraft, block: CampaignBlock): SectionPresentation {
    if (!draft.layout.sectionPresentation?.updates && this.asUpdates(block.data).viewMode === 'list') {
      return 'list';
    }
    return this.sectionPresentation(draft, 'updates');
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
    // sidebarSections appends any not-already-claimed block of the chosen
    // FULL_WIDTH_TYPES after whatever the container/fallback above produced,
    // in their own `order`. Searches ALL of draft.blocks regardless of
    // nesting (2026-10-04 fix, generalized) — childBlocks() below now
    // excludes a sidebarSections-flagged block from ANY container/tabs/
    // accordion's own rendering (wherever it actually lives in the block
    // tree), so this is the one place left responsible for actually
    // rendering it; restricting the search to top-level blocks only (the
    // original implementation) silently failed for any campaign where the
    // Page Builder had nested that block inside a container, which is the
    // common case for anything built via drag-and-drop, not the exception.
    const sections = draft.layout.sidebarSections;
    if (sections && sections.length > 0) {
      const claimed = new Set(blocks.map(b => b.type));
      const extra = draft.blocks
        .filter(b => b.visible && sections.includes(b.type as any) && !claimed.has(b.type))
        .sort((a, b) => a.order - b.order);
      blocks = [...blocks, ...extra];
    }
    return blocks;
  }

  // Main column — prefers a real top-level container tagged railZone:'main'
  // (so the user can add/reorder any block type into it, including a 'hero'
  // block wherever they want Hero to sit), falling back to mainBlocks()'s
  // implicit assembly for campaigns saved before this existed. See
  // DECISIONS.md (2026-07-17). The sidebarSections exclusion itself now
  // lives centrally in childBlocks() (2026-10-04), so this needs no filter
  // of its own — see that function's own doc comment for why.
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

  // A FULL_WIDTH_TYPES block flagged into the sidebar via sidebarSections
  // (2026-10-04 fix) never renders through its container's own normal child
  // list -- it moves to the sidebar rail instead (sidebarBlocks() picks it
  // up from anywhere in draft.blocks). This is the single shared function
  // behind EVERY container/tabs/accordion's child rendering, so excluding it
  // here is what makes the move work regardless of which container (or how
  // deeply nested) the manager's Page Builder actually placed that block in
  // -- the earlier, narrower fix only handled the one railZone:'main'
  // container specifically and still silently failed for any other
  // container. The ONE exception is the sidebar rail-zone container's own
  // children: a block actually placed there must still render through it,
  // and sidebarBlocks() reads exactly that container's children via this
  // same function.
  childBlocks(block: CampaignBlock, draft: CampaignDraft): CampaignBlock[] {
    const ids = (block.data as ContainerBlockData).childBlockIds;
    const sections = draft.layout.sidebarSections;
    const isSidebarZone = (block.data as ContainerBlockData).railZone === 'sidebar';
    return ids
      .map(id => draft.blocks.find(b => b.id === id))
      .filter((b): b is CampaignBlock => !!b && b.visible)
      .filter(b => isSidebarZone || !sections?.includes(b.type as any))
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = new Date(draft.endDate).getTime() - today.getTime();
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
  // Sanitize FIRST, then forceLinksNewTab (which itself briefly parses the
  // string into a detached <div> to rewrite <a> attributes) -- by the time
  // any HTML reaches that step, dangerous content is already stripped.
  safeHtml(html: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.forceLinksNewTab(sanitizeRichHtml(html || '')));
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

  // Presets shown for the currently-selected frequency — suggestedAmounts
  // for one-time, monthlyAmounts for monthly. Empty monthlyAmounts is what
  // hides the toggle in the template in the first place (see html), so this
  // is never called with an empty array in the monthly branch in practice.
  amountsFor(draft: CampaignDraft): number[] {
    return this.donationFrequency === 'monthly' ? draft.monthlyAmounts : draft.suggestedAmounts;
  }

  selectFrequency(freq: 'one-time' | 'monthly'): void {
    if (this.donationFrequency === freq) return;
    this.donationFrequency = freq;
    // Presets differ between the two lists — a carried-over selection could
    // silently point at the wrong amount for the newly-chosen frequency.
    this.selectedAmount = null;
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
    const amounts = this.amountsFor(draft).slice(0, 5);
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
    if (this.isSoldOut(offering)) return;
    this.cartOfferingIds.add(offering.id);
    this.cartOfferingIds = new Set(this.cartOfferingIds);
  }

  removeOffering(id: string): void {
    this.cartOfferingIds.delete(id);
    this.cartOfferingIds = new Set(this.cartOfferingIds);
  }

  // Rewards browsing/filtering (2026-10-04) -- Offering has no category/tag
  // field, so filtering is built purely from what the model already has:
  // minimumAmount (price sort) and stock vs. purchasedCount (availability).
  // 'featured' already has a user-facing meaning (the existing ⭐ מומלץ
  // badge), so surfacing it as the default sort is reusing an existing
  // concept, not inventing a new one. Plain component state, same as
  // ambSearch/donorSort -- never persisted to the draft.
  rewardsSortBy: 'featured' | 'price-asc' | 'price-desc' = 'featured';
  rewardsHideSoldOut = false;
  // Text search (2026-10-05) -- searches the Offering's existing textual
  // fields (title, description); not a new taxonomy, same reasoning as the
  // sort/availability filters above. Plain component state, never persisted.
  rewardsSearch = '';

  // Derived purely from existing fields (stock, purchasedCount()) -- no new
  // persisted data. stock === null means unlimited (never sold out).
  isSoldOut(offering: Offering): boolean {
    return offering.stock != null && this.purchasedCount(offering.id) >= offering.stock;
  }

  // The ONE filtered/sorted collection every presentation (cards/list/image)
  // reads from, in both placements -- filtering is a data/list concern,
  // independent of which card markup is currently rendering it.
  rewardsFiltered(draft: CampaignDraft): Offering[] {
    let list = draft.offerings ?? [];
    const q = this.rewardsSearch.trim().toLowerCase();
    if (q) list = list.filter(o => o.title.toLowerCase().includes(q) || o.description.toLowerCase().includes(q));
    if (this.rewardsHideSoldOut) list = list.filter(o => !this.isSoldOut(o));
    const sorted = [...list];
    switch (this.rewardsSortBy) {
      case 'featured':
        sorted.sort((a, b) => (b.featured === true ? 1 : 0) - (a.featured === true ? 1 : 0));
        break;
      case 'price-asc':
        sorted.sort((a, b) => a.minimumAmount - b.minimumAmount);
        break;
      case 'price-desc':
        sorted.sort((a, b) => b.minimumAmount - a.minimumAmount);
        break;
    }
    return sorted;
  }

  resetRewardsFilter(): void {
    this.rewardsSearch = '';
    this.rewardsHideSoldOut = false;
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

  // Shared with PlatformTopStripComponent's own desktop account link
  // (2026-09-28) via AccountNavService — kept here too since the mobile nav
  // drawer below still needs the identical behavior.
  goToAccount(): void {
    this.accountNav.goToAccount();
  }

  // A suggested/default amount is never financial consent (2026-09-21) — this
  // used to silently assign getEffectiveAmount()'s "middle suggested amount"
  // fallback into selectedAmount here, so a donor who picked ONLY a ₪100
  // reward and never touched the amount picker would reach checkout owing
  // ₪280 (the untouched ₪180 "suggestion" plus the reward), with nothing on
  // screen explaining where the extra ₪180 came from. Only an amount the
  // donor actually selected/typed (selectedAmount/customAmount) may ever
  // count toward the payable total — see explicitAmount/totalAmount above,
  // which the pre-checkout summary already correctly relies on; this was the
  // one place that corrupted that invariant right before checkout opened.
  openCheckout(draft: CampaignDraft): void {
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

  // Post-payment cart/stock staleness fix (2026-10-06) -- "I selected a
  // reward, paid, came back to the page, and it was still in the 'continue
  // to pay' state even though I already paid; it should also check whether
  // it's now sold out." Checkout-v2's own [cartOfferings] is never mutated
  // from inside checkout (see its own doc comment), so without this nothing
  // ever cleared the just-bought offering(s) out of cartOfferingIds, and
  // rewardCounts (loaded once per slug, see ngOnInit's own
  // loadedRewardCountsSlug guard) never got a reason to refresh after a
  // purchase actually changed it. Both are fixed by this single handler,
  // called exactly once per confirmed payment (see
  // CheckoutV2Component#paymentSucceeded's own doc comment on when it fires).
  onCheckoutPaymentSucceeded(event: { offeringIds: string[] }): void {
    for (const id of event.offeringIds) this.cartOfferingIds.delete(id);
    this.cartOfferingIds = new Set(this.cartOfferingIds);
    if (this.loadedSlug) {
      this.donationService.getRewardCounts(this.loadedSlug).subscribe({
        next: counts => { this.rewardCounts = counts; },
      });
    }
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

  // Misleadingly named (pre-existing) — actually reads theme.secondaryColor,
  // used ~60 places across the page as the general accent/heading color
  // (section titles, stat numbers, ambassador/donor UI, progress bars,
  // tab/accordion accents). Matches the Builder's own "משני / כותרות" label
  // for that field, so those usages are correct as-is — left unchanged
  // (2026-09-28 audit) since renaming/redirecting it would re-theme nearly
  // every existing campaign's page unexpectedly. See themePrimaryColor()
  // below for the actual theme.primaryColor ("ראשי" / primary CTA color).
  primaryColor(draft: CampaignDraft): string {
    return draft.layout?.theme?.secondaryColor || '#6fc9eb';
  }

  // The TRUE theme.primaryColor ("ראשי" in the Builder's color panel,
  // campaign-page-builder-step.component.html) — for primary-action CTAs
  // specifically (2026-09-28, campaign header consolidation). Always seeded
  // ('#333333') by createInitialDraft()/createInitialPartnerDraft(), so
  // every real campaign already has a value; the fallback here only matches
  // that same seed default, not a new invented color.
  themePrimaryColor(draft: CampaignDraft): string {
    return draft.layout?.theme?.primaryColor || '#333333';
  }

  // theme.accentColor ("הדגשה / קישורים" in the Builder's color panel) — the
  // Auto fallback for decorative/highlight block-local fields (stats icons,
  // etc.), as opposed to themePrimaryColor() above (primary actions like the
  // donation CTA) or primaryColor() (actually secondaryColor — see its own
  // comment). Design Evolution semantic-roles pass, 2026-09-29.
  accentColor(draft: CampaignDraft): string {
    return draft.layout?.theme?.accentColor || '#cc350f';
  }

  // Section text overrides (2026-10-06, "Style → Theme → Section override"
  // model, confirmed with the user) — Phase 1: Donate/Stats/Donors only.
  // theme.secondaryColor/bodyTextColor are MANDATORY fields (never
  // undefined, always seeded by createInitialDraft() — see CampaignTheme's
  // own doc comment), so a naive read would start applying to every
  // existing campaign the instant an element begins consuming it, even one
  // that never touched its theme at all. Same exact-equality "untouched"
  // detection already established for CampaignLayout.sectionBgOdd/
  // sectionBgEven/sectionDividerColor (see resolveSectionSurfaceColors's
  // own comment, campaign-styles.ts) — these two constants are the known
  // literal seed values (createInitialDraft()), not arbitrary guesses.
  private readonly LEGACY_SECONDARY_COLOR = '#6fc9eb';
  private readonly LEGACY_BODY_TEXT_COLOR = '#334155';

  // Donate's own <h2> already resolves through theme.secondaryColor via a
  // plain CSS rule (`color: var(--hm-secondary, #6fc9eb)`), not an Angular
  // binding — so titleColor only needs to be bound directly in the
  // template (`[style.color]="asDonationWidget(block.data).titleColor"`);
  // undefined removes the inline style and that CSS rule's own fallback
  // carries on exactly as before, with no TS-side helper needed. Donors'
  // own title, by contrast, already has an explicit Angular
  // `[style.color]="primaryColor(draft)"` binding — there `|| primaryColor
  // (draft)` is just inlined directly in the template too. Stats' own
  // title needs a different (gated) resolver instead — see
  // statsTitleColor() below.

  // Stats' own title ("גויס עד כה") was PURE hardcoded CSS before this
  // feature — zero theme connection, unlike Donate/Donors. Wiring it to
  // theme.secondaryColor for the first time must not fire unless the
  // campaign's secondaryColor has actually diverged from its own known
  // untouched default. Returns null to mean "apply no inline color — let
  // the existing hardcoded CSS literal show through exactly as before."
  statsTitleColor(draft: CampaignDraft, titleColor: string | undefined): string | null {
    if (titleColor) return titleColor;
    const secondary = draft.layout?.theme?.secondaryColor;
    return secondary && secondary !== this.LEGACY_SECONDARY_COLOR ? secondary : null;
  }

  // Secondary/caption text across Donate/Stats/Donors (2026-10-06) — every
  // one of these elements was previously a plain hardcoded CSS literal with
  // zero theme connection (several DIFFERENT grays across different
  // elements). This is the "Theme" layer of "Style → Theme → Section
  // override" actually reaching them for the first time: null (apply no
  // inline color, legacy literal shows through) until the manager's
  // bodyTextColor has genuinely diverged from its own known untouched
  // default — never on first render for any pre-existing campaign.
  sectionBodyTextColor(draft: CampaignDraft): string | null {
    const body = draft.layout?.theme?.bodyTextColor;
    return body && body !== this.LEGACY_BODY_TEXT_COLOR ? body : null;
  }

  // Typography Phase A (2026-10) -- Donors/Ambassadors/Stats Text Roles.
  // Every method below is a thin, role-specific call into the one shared
  // resolver (text-role-resolver.ts) -- every Cards/List/Main/Sidebar copy
  // of a given role calls the SAME method here, so no template can
  // independently decide a different answer for the same semantic role.
  // Legacy defaults are each role's own exact pre-existing CSS literal
  // (campaign-preview.component.css) -- an untouched campaign resolves to
  // the identical pixel value it rendered before this phase, EXCEPT where
  // noted (ambassadorName/raisedAmount — see the Ambassadors note below).

  // Donors — already fully consistent across all 4 presentation/placement
  // copies before this phase (pure refactor into the shared resolver, zero
  // visual change). sectionTitle keeps titleColor as a permanent read-side
  // alias ahead of the new per-role override.
  donorsSectionTitleColor(draft: CampaignDraft, data: DonorsBlockData): string {
    return resolveRoleColor(data.textStyles?.sectionTitle?.color ?? data.titleColor, LEGACY_THEME_COLOR.secondaryColor, draft.layout?.theme, 'secondaryColor');
  }
  donorNameColor(draft: CampaignDraft, data: DonorsBlockData): string {
    return resolveRoleColor(data.textStyles?.donorName?.color, LEGACY_THEME_COLOR.secondaryColor, draft.layout?.theme, 'secondaryColor');
  }
  donorAmountColor(draft: CampaignDraft, data: DonorsBlockData): string {
    return resolveRoleColor(data.textStyles?.donorAmount?.color, LEGACY_THEME_COLOR.accentColor, draft.layout?.theme, 'accentColor');
  }
  donorMetaColor(draft: CampaignDraft, data: DonorsBlockData): string {
    return resolveRoleColor(data.textStyles?.donorMeta?.color, '#94a3b8', draft.layout?.theme, 'bodyTextColor');
  }

  // Ambassadors — AMBASSADORS_ROLE_NOTES: this is the section with a REAL
  // Cards/List divergence (found in the typography audit), not just a
  // refactor. Two deliberate, approved rendering changes ship with this
  // phase for an untouched campaign:
  //  - ambassadorName: Cards (#0f172a/800) was already today's visual
  //    anchor; List (#0f2747/700, zero theme connection) now matches it
  //    exactly instead of silently differing. Gated onto secondaryColor
  //    like Stats' own title (2026-10-06) — invisible unless the manager
  //    has already diverged their theme's secondary color.
  //  - raisedAmount: List already resolved this unconditionally through
  //    primaryColor(draft)/secondaryColor; Cards (hardcoded #0f172a) now
  //    matches List's existing, already-shipped behavior instead of
  //    staying disconnected from theme.
  // Neither change touches content shown (List still omits personalMessage/
  // donorCount, unchanged) or button chrome (left as its own deferred,
  // documented inconsistency).
  ambassadorsSectionTitleColor(draft: CampaignDraft, data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.textStyles?.sectionTitle?.color, LEGACY_THEME_COLOR.secondaryColor, draft.layout?.theme, 'secondaryColor');
  }
  ambassadorNameColor(draft: CampaignDraft, data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.textStyles?.ambassadorName?.color, '#0f172a', draft.layout?.theme, 'secondaryColor');
  }
  ambassadorNameWeight(data: AmbassadorsBlockData): number {
    return resolveRoleFontWeight(data.textStyles?.ambassadorName?.fontWeight, 800);
  }
  ambassadorRaisedColor(draft: CampaignDraft, data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.textStyles?.raisedAmount?.color, LEGACY_THEME_COLOR.secondaryColor, draft.layout?.theme, 'secondaryColor');
  }
  ambassadorDonorCountColor(draft: CampaignDraft, data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.textStyles?.donorCount?.color, '#0f172a', draft.layout?.theme);
  }
  ambassadorSecondaryMetaColor(draft: CampaignDraft, data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.textStyles?.secondaryMeta?.color, '#94a3b8', draft.layout?.theme, 'bodyTextColor');
  }

  // Stats — sectionTitle keeps the exact statsTitleColor()/titleColor
  // Phase 1 behavior (titleColor alias, same gate), now also reachable via
  // the new per-role override. value/label expose the new override layer
  // IN FRONT of the existing CSS var cascade / sectionBodyTextColor() gate
  // instead of reimplementing it — .hm-raised-amount/.hm-stat-box strong
  // are already unconditionally theme-connected via var(--hm-secondary, …)
  // in pure CSS, so "no override" must keep deferring to that, not a new
  // TS-computed literal.
  statsSectionTitleColor(draft: CampaignDraft, data: StatsBlockData): string | null {
    return this.statsTitleColor(draft, data.textStyles?.sectionTitle?.color ?? data.titleColor);
  }
  statsValueColorOverride(data: StatsBlockData): string | null {
    return data.textStyles?.value?.color || null;
  }
  statsLabelColor(draft: CampaignDraft, data: StatsBlockData): string | null {
    return data.textStyles?.label?.color || this.sectionBodyTextColor(draft);
  }

  // Universal Local Styling — Phase B1 (2026-10). Stats' fundraising ring
  // (.hm-ring-bg/.hm-ring-fill) was pure hardcoded CSS before this, AND is
  // composition-sensitive (.hm-stats.conv-hero forces it white) — so, like
  // statsValueColorOverride() above, this is explicit-override-only (never
  // injects a legacy/theme value), so an untouched campaign's ring keeps
  // reacting to conv-hero exactly as before.
  statsRingTrackColor(data: StatsBlockData): string | null {
    return data.progressStyles?.ring?.trackColor || null;
  }
  statsRingFillColor(data: StatsBlockData): string | null {
    return data.progressStyles?.ring?.fillColor || null;
  }

  // Universal Local Styling — Phase B1 (2026-10) — Donation proof.
  // DONATION_ROLE_NOTES: every surface/button property below is deliberately
  // explicit-override-only (never injects a legacy/theme value even when
  // untouched) because .hm-donate's container/amount-buttons/CTA/total row
  // are all genuinely composition-sensitive — conv-hero in particular
  // replaces the container's background with a full gradient and recolors
  // the amount buttons/CTA/total text to white (campaign-preview.component
  // .css ~1033-1095). Injecting a concrete inline fallback for an untouched
  // campaign would silently defeat those composition rules. An explicit
  // Section override is still allowed to win outright — that's the correct
  // "local always beats everything" behavior — only the NO-OVERRIDE case
  // must stay null. Text roles (sectionTitle/subtitle) have no such
  // composition conflict and keep the normal gated/legacy resolution.
  donationSectionTitleColor(draft: CampaignDraft, data: DonationWidgetBlockData): string {
    return resolveRoleColor(data.textStyles?.sectionTitle?.color ?? data.titleColor, LEGACY_THEME_COLOR.secondaryColor, draft.layout?.theme, 'secondaryColor');
  }
  donationSubtitleColor(draft: CampaignDraft, data: DonationWidgetBlockData): string | null {
    return data.textStyles?.subtitle?.color || this.sectionBodyTextColor(draft);
  }
  donationSecondaryMetaColor(draft: CampaignDraft, data: DonationWidgetBlockData): string | null {
    return data.textStyles?.secondaryMeta?.color || this.sectionBodyTextColor(draft);
  }
  donationTotalSumColor(data: DonationWidgetBlockData): string | null {
    return data.textStyles?.totalSum?.color || null;
  }

  donationContainerBackground(data: DonationWidgetBlockData): string | null {
    return data.surfaceStyles?.container?.background || null;
  }
  donationContainerBorderColor(data: DonationWidgetBlockData): string | null {
    return data.surfaceStyles?.container?.borderColor || null;
  }
  donationContainerBorderRadius(data: DonationWidgetBlockData): number | null {
    return data.surfaceStyles?.container?.borderRadius ?? null;
  }

  // Donation Amount Button Presets (2026-10) — precedence is explicit B1
  // property override > explicit preset > nothing (composition CSS/legacy
  // literal cascades normally, same explicit-override-only rule as every
  // other Donation role — conv-hero/conv-compact both genuinely touch
  // .hm-amount-preset, confirmed, so an untouched campaign must inject
  // nothing at all). Selecting a preset NEVER overwrites an existing
  // buttonStyles.amountButton/amountButtonSelected override — each
  // property is resolved independently.
  private amountButtonPresetTokens(data: DonationWidgetBlockData): AmountButtonPresetTokens | null {
    return data.amountButtonPreset ? AMOUNT_BUTTON_PRESETS[data.amountButtonPreset] : null;
  }
  donationAmountButtonBackground(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.amountButton?.background || this.amountButtonPresetTokens(data)?.background || null;
  }
  donationAmountButtonTextColor(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.amountButton?.textColor || this.amountButtonPresetTokens(data)?.textColor || null;
  }
  donationAmountButtonBorderColor(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.amountButton?.borderColor || this.amountButtonPresetTokens(data)?.borderColor || null;
  }
  donationAmountButtonBorderRadius(data: DonationWidgetBlockData): number | null {
    return data.buttonStyles?.amountButton?.borderRadius ?? this.amountButtonPresetTokens(data)?.borderRadiusPx ?? null;
  }
  donationAmountButtonSelectedBackground(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.amountButtonSelected?.background || this.amountButtonPresetTokens(data)?.selectedBackground || null;
  }
  donationAmountButtonSelectedTextColor(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.amountButtonSelected?.textColor || this.amountButtonPresetTokens(data)?.selectedTextColor || null;
  }
  donationAmountButtonSelectedBorderColor(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.amountButtonSelected?.borderColor || this.amountButtonPresetTokens(data)?.selectedBorderColor || null;
  }
  // These properties only ever come from a preset — B1 never exposed a
  // manual control for them (they were pure legacy CSS literals before
  // this feature), so there is no property-level override to beat here.
  donationAmountButtonMinHeight(data: DonationWidgetBlockData): number | null {
    return this.amountButtonPresetTokens(data)?.minHeightPx ?? null;
  }
  donationAmountButtonPaddingBlock(data: DonationWidgetBlockData): number | null {
    return this.amountButtonPresetTokens(data)?.paddingBlockPx ?? null;
  }
  donationAmountButtonPaddingInline(data: DonationWidgetBlockData): number | null {
    return this.amountButtonPresetTokens(data)?.paddingInlinePx ?? null;
  }
  donationAmountButtonFontSize(data: DonationWidgetBlockData): number | null {
    return this.amountButtonPresetTokens(data)?.fontSizePx ?? null;
  }
  donationAmountButtonFontWeight(data: DonationWidgetBlockData): number | null {
    return this.amountButtonPresetTokens(data)?.fontWeight ?? null;
  }
  donationAmountButtonBorderWidth(data: DonationWidgetBlockData): number | null {
    return this.amountButtonPresetTokens(data)?.borderWidthPx ?? null;
  }
  donationAmountButtonShadow(data: DonationWidgetBlockData): string | null {
    return this.amountButtonPresetTokens(data)?.shadow ?? null;
  }
  donationAmountButtonSelectedShadow(data: DonationWidgetBlockData): string | null {
    return this.amountButtonPresetTokens(data)?.selectedShadow ?? null;
  }

  // CTA background aliases the existing ctaColor field (Design Evolution,
  // 2026-09-29) rather than duplicating it — a new buttonStyles.cta
  // override takes priority, then ctaColor/Auto exactly as before.
  donationCtaBackground(draft: CampaignDraft, data: DonationWidgetBlockData): string {
    return data.buttonStyles?.cta?.background || data.ctaColor || this.themePrimaryColor(draft);
  }
  donationCtaTextColor(data: DonationWidgetBlockData): string | null {
    return data.buttonStyles?.cta?.textColor || null;
  }
  // CTA radius has no composition conflict (unlike background/text above) —
  // already Style-token-driven today (var(--hm-btn-radius,12px)), so this
  // safely resolves through the normal 3-step chain instead of staying
  // explicit-only.
  donationCtaBorderRadius(draft: CampaignDraft, data: DonationWidgetBlockData): number {
    return resolveRoleBorderRadius(data.buttonStyles?.cta?.borderRadius, 12, this.visualTokens(draft), 'buttons');
  }

  // Ambassadors — AMBASSADORS_SURFACE_NOTES: fixes the real non-text Cards/
  // List divergence the Universal Styling audit found (card/row surface and
  // "view ambassador" button each independently hardcoded a different
  // literal). Both presentations now call these SAME methods. No
  // composition-sensitivity concern here (unlike Donation) — normal 3-step
  // resolution applies. Avatar SIZE stays presentation-local CSS, untouched
  // (a legitimate layout difference, not a style identity — see the Phase
  // B1 report).
  ambassadorCardBackground(data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.surfaceStyles?.card?.background, '#ffffff', undefined);
  }
  ambassadorCardBorderColor(data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.surfaceStyles?.card?.borderColor, 'var(--line, #e2e8f0)', undefined);
  }
  ambassadorCardBorderRadius(draft: CampaignDraft, data: AmbassadorsBlockData): number {
    return resolveRoleBorderRadius(data.surfaceStyles?.card?.borderRadius, 16, this.visualTokens(draft), 'cards');
  }
  // Canonical = Cards' own pre-existing behavior (themed background, white
  // text) — List's previously-hardcoded gray button now matches it exactly,
  // the same kind of deliberate, approved fix as ambassadorNameColor/
  // ambassadorRaisedColor in Typography Phase A.
  ambassadorViewButtonBackground(draft: CampaignDraft, data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.buttonStyles?.viewButton?.background, LEGACY_THEME_COLOR.secondaryColor, draft.layout?.theme, 'secondaryColor');
  }
  ambassadorViewButtonTextColor(data: AmbassadorsBlockData): string {
    return resolveRoleColor(data.buttonStyles?.viewButton?.textColor, '#ffffff', undefined);
  }

  // CTA — repeatable-block proof. No composition conflict for CTA (it's
  // independent of conversionWidgetLayout), so background/textColor can
  // safely resolve with a concrete legacy fallback too; background aliases
  // the existing ctaConfig.color field rather than duplicating it.
  ctaButtonBackground(data: CtaBlockData): string {
    return data.buttonStyles?.main?.background || data.ctaConfig.color;
  }
  ctaButtonTextColor(data: CtaBlockData): string {
    return resolveRoleColor(data.buttonStyles?.main?.textColor, '#ffffff', undefined);
  }
  ctaButtonBorderRadius(draft: CampaignDraft, data: CtaBlockData): number {
    return resolveRoleBorderRadius(data.buttonStyles?.main?.borderRadius, 10, this.visualTokens(draft), 'buttons');
  }

  // Phase 3A (2026-09-29) — visual tokens beyond color (typography/buttons/
  // cards). undefined for a legacy campaign (no campaignStyleId), in which
  // case every CSS custom property below is simply never set and each
  // consuming rule's own var(--hm-x, <legacy-literal>) fallback applies —
  // zero visual change, same principle already proven for theme colors.
  visualTokens(draft: CampaignDraft): CampaignStyleVisualTokens | undefined {
    return resolveVisualTokens(draft.layout?.campaignStyleId);
  }

  // Phase 3B (2026-09-29) — render-time only, never writes back into
  // draft.layout.conversionWidgetLayout. See resolveDonationComposition's
  // own doc comment for the verified precedence proof.
  effectiveDonationComposition(draft: CampaignDraft): ConversionWidgetLayout {
    return resolveDonationComposition(
      draft.layout?.conversionWidgetLayout as ConversionWidgetLayout | undefined,
      draft.layout?.campaignStyleId,
    );
  }

  // Opening Composition — Phase A, generic (2026-10-01) -- see
  // resolveOpeningComposition's own doc comment for the full explicit ->
  // Style default -> legacy precedence chain. Campaign-only (isCampaign
  // gate lives in the template, same pattern as the Hero outlet/meta chips)
  // -- a Partner page has no fundraising summary/story to build an opening
  // out of.
  openingComposition(draft: CampaignDraft): OpeningComposition {
    return resolveOpeningComposition(draft.layout?.openingComposition, draft.layout?.campaignStyleId);
  }

  isFundraisingSplitOpening(draft: CampaignDraft): boolean {
    return this.openingComposition(draft) === 'fundraising-split';
  }

  isStoryFirstOpening(draft: CampaignDraft): boolean {
    return this.openingComposition(draft) === 'story-first';
  }

  // True for either structured Opening -- the one check every legacy Hero
  // suppression site needs (both fundraising-split and story-first replace
  // .hm-hero entirely; only 'classic' still renders it).
  hasStructuredOpening(draft: CampaignDraft): boolean {
    return this.openingComposition(draft) !== 'classic';
  }


  // Refinement (2026-09-30) -- explicit user choice > Style default, same
  // principle as effectiveDonationComposition(). heroCtaConfig defaults to
  // visible:false on every new campaign (createInitialDraft) and `?.` alone
  // only guards campaigns saved before the field existed at all (undefined
  // there) -- so "!== false" reads as "show unless a real config object
  // explicitly says false," never inventing a third state that doesn't
  // exist in the persisted data.
  isOpeningCtaVisible(draft: CampaignDraft): boolean {
    return draft.heroCtaConfig?.visible !== false;
  }

  // Semantic -> concrete CSS value maps, kept here (not in campaign-styles.ts)
  // since these px/multiplier choices are a rendering decision, not part of
  // the Style's own design-intent data. undefined (no style, or unknown
  // semantic value) removes the inline style entirely, so each CSS
  // consumer's own var(--hm-x, <legacy-literal>) fallback applies.
  private static readonly CONTENT_WIDTH_PX: Record<string, string> = {
    narrow: '720px', standard: '900px', wide: '1040px',
  };
  private static readonly SECTION_RHYTHM_SCALE: Record<string, number> = {
    balanced: 1, airy: 1.6,
  };

  contentWidthPx(draft: CampaignDraft): string | undefined {
    const width = this.visualTokens(draft)?.content?.width;
    return width ? CampaignPreviewComponent.CONTENT_WIDTH_PX[width] : undefined;
  }

  sectionRhythmScale(draft: CampaignDraft): number | undefined {
    const rhythm = this.visualTokens(draft)?.section?.rhythm;
    return rhythm ? CampaignPreviewComponent.SECTION_RHYTHM_SCALE[rhythm] : undefined;
  }

  // Section-presentation audit (2026-09-30) -- see resolveSectionSurfaceColors'
  // own doc comment for why "explicit" is detected by equality against the
  // known legacy literal rather than undefined (sectionBgOdd/Even/Divider
  // are mandatory fields, always initialized to that exact literal today).
  sectionSurfaceColors(draft: CampaignDraft): { odd: string; even: string; divider: string } {
    return resolveSectionSurfaceColors(draft.layout?.campaignStyleId, {
      odd: draft.layout.sectionBgOdd,
      even: draft.layout.sectionBgEven,
      divider: draft.layout.sectionDividerColor,
    });
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

  navItems(draft: CampaignDraft): { label: string; sectionId: string; count?: number; faded?: boolean }[] {
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
    const items: { label: string; sectionId: string; count?: number; faded?: boolean }[] = [];
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
      // Toolbar link dims (not removed) for donors/תשורות/שגרירים/עדכונים
      // once the campaign has no content there yet — on the public page
      // only, so the Builder's own nav preview stays fully legible while
      // editing (2026-10-02).
      const faded = this.isPublicPage && !this.hasMeaningfulContent(block, draft);
      items.push({ label, sectionId, count, faded });
    }
    return items;
  }

  scrollTo(sectionId: string): void {
    const el = document.getElementById(sectionId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Mobile drawer's faded nav items (see navItems()) must not be clickable
  // either -- the desktop nav-link handles this inline with a simple `&&`
  // guard, but the drawer also closes itself on click, which needs a real
  // method rather than a template expression with two statements.
  onNavItemClick(item: { sectionId: string; faded?: boolean }): void {
    if (item.faded) return;
    this.scrollTo(item.sectionId);
    this.navOpen = false;
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
  donorPeriod: DonorPeriod = 'all';
  donorSort: 'recent' | 'amount' = 'recent';
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
  // "הגדולות ביותר" replaces the old separate Top-10 leaderboard box —
  // same list, just reordered client-side, instead of a second dataset in
  // a second box that mostly duplicated the main feed.
  get sortedDonors(): Donor[] {
    return this.donorSort === 'amount'
      ? [...this.activeDonors].sort((a, b) => b.amount - a.amount)
      : this.activeDonors;
  }
  get visibleDonors(): Donor[] {
    return this.sortedDonors.slice(0, this.shownCount);
  }
  get canShowMore(): boolean {
    return this.shownCount < this.activeDonors.length;
  }
  showMoreDonors(): void {
    this.shownCount = Math.min(this.shownCount + this.PAGE_SIZE, this.activeDonors.length);
  }
  setDonorSort(sort: 'recent' | 'amount'): void {
    this.donorSort = sort;
  }

  // Public page — never show a manager's draft update to a visitor. Status
  // is optional (absent = 'published', the Builder's own updates step has
  // no draft concept) — see CampaignUpdate.status doc comment.
  publishedUpdates(draft: CampaignDraft): CampaignUpdate[] {
    return (draft.updates ?? []).filter(u => (u.status ?? 'published') === 'published');
  }

  // Empty section = hidden on the public campaign page, rather than a
  // header over nothing or a Builder-facing "add this in the Page Builder"
  // placeholder shown to a real visitor (2026-10-02 product decision — an
  // empty-looking section makes a whole campaign read as inactive). Editing
  // contexts (isPublicPage stays false there — the Studio's own preview tab,
  // the Page Builder's live pane) keep every section visible so the editor
  // can find and populate it, which is why this is a no-op unless isPublicPage
  // is explicitly set. One map instead of a per-block-type `*ngIf` so adding
  // another block type here never means hunting down a fourth special case.
  //
  // 'ambassadors' is included here too, but ONLY so navItems() below can fade
  // its toolbar link when empty — shouldRenderBlock() explicitly excludes it
  // (see the guard inside), because its "empty" state isn't a placeholder,
  // it's a donor-facing invite ("be the first ambassador!"); the SECTION
  // itself always stays visible even when the toolbar link to it is faded.
  private readonly PUBLIC_EMPTY_CHECK: Partial<Record<BlockType, (draft: CampaignDraft) => boolean>> = {
    rewards: (draft) => (draft.offerings?.length ?? 0) > 0,
    // Based on the campaign's overall supporter count, not the currently
    // selected period filter (visibleDonors) -- otherwise switching to
    // "today" with zero donations today would make the whole section
    // vanish even though the campaign has donation history.
    donors:      (draft) => (draft.supportersCount ?? 0) > 0,
    updates:     (draft) => this.publishedUpdates(draft).length > 0,
    ambassadors: () => this.ambEffective.length > 0,
  };

  hasMeaningfulContent(block: { type: BlockType }, draft: CampaignDraft): boolean {
    const hasContent = this.PUBLIC_EMPTY_CHECK[block.type];
    return hasContent ? hasContent(draft) : true;
  }

  shouldRenderBlock(block: { type: BlockType }, draft: CampaignDraft): boolean {
    if (!this.isPublicPage || block.type === 'ambassadors') return true;
    return this.hasMeaningfulContent(block, draft);
  }

  // Text search (2026-10-05) -- searches the existing title/description
  // fields, same reasoning as Rewards' search: not a new taxonomy, the
  // content is already there. Deliberately NOT used by PUBLIC_EMPTY_CHECK
  // above (that must stay based on the RAW published collection) -- an
  // empty search result must never make the whole section disappear on the
  // public page, only show its own "no matches" state below.
  updatesSearch = '';

  // The ONE filtered collection every presentation (slider/list) and the
  // pager below read from, in both placements -- filtering is upstream of
  // both pagination and presentation.
  updatesFiltered(draft: CampaignDraft): CampaignUpdate[] {
    const q = this.updatesSearch.trim().toLowerCase();
    const list = this.publishedUpdates(draft);
    if (!q) return list;
    return list.filter(u => u.title.toLowerCase().includes(q) || u.description.toLowerCase().includes(q));
  }

  // Changing the search query can shrink the filtered collection below the
  // current page's start index, which would otherwise show an emptied-out
  // page instead of the first page of real results.
  onUpdatesSearchChange(): void {
    this.updatesPageIndex = 0;
  }

  resetUpdatesSearch(): void {
    this.updatesSearch = '';
    this.updatesPageIndex = 0;
  }

  // List/sidebar-list variants show a fixed window of updates at a time —
  // ▲/▼ paging instead of an unbounded "show more" so a campaign with many
  // updates never dumps them all on the page at once.
  readonly UPDATES_PAGE_SIZE = 3;
  private updatesPageIndex = 0;
  visibleUpdates(draft: CampaignDraft): CampaignUpdate[] {
    const start = this.updatesPageIndex * this.UPDATES_PAGE_SIZE;
    return this.updatesFiltered(draft).slice(start, start + this.UPDATES_PAGE_SIZE);
  }
  canGoPrevUpdates(): boolean {
    return this.updatesPageIndex > 0;
  }
  canGoNextUpdates(draft: CampaignDraft): boolean {
    return (this.updatesPageIndex + 1) * this.UPDATES_PAGE_SIZE < this.updatesFiltered(draft).length;
  }
  prevUpdatesPage(): void {
    if (this.canGoPrevUpdates()) this.updatesPageIndex--;
  }
  nextUpdatesPage(draft: CampaignDraft): void {
    if (this.canGoNextUpdates(draft)) this.updatesPageIndex++;
  }

  // Cards show only image + title — the title carries the hook, full
  // description opens in a popup. Keeps every card the same height with
  // no truncation heuristic to get wrong.
  viewingUpdate: CampaignUpdate | null = null;
  openUpdate(u: CampaignUpdate): void { this.viewingUpdate = u; }
  closeUpdate(): void { this.viewingUpdate = null; }

  loadDonors(slug: string): void {
    this.donationService.getDonors(slug, this.donorPeriod).subscribe({
      next: ({ donors }) => {
        this.donors = donors;
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
