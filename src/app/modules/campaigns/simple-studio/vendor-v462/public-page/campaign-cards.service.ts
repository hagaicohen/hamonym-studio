import { ComponentRef, EnvironmentInjector, Injectable, OnDestroy, Type, createComponent, inject, reflectComponentType } from '@angular/core';
import { CardMediaService } from './cards/card-media.service';
import { AmbassadorCardComponent } from './cards/ambassador-card.component';
import { CommentCardComponent } from './cards/comment-card.component';
import { DonorCardComponent } from './cards/donor-card.component';
import { RewardTileComponent } from './cards/reward-tile.component';
import { SponsorsComponent } from './cards/sponsors.component';
import { UpdateCardComponent } from './cards/update-card.component';
import { UpdatePreviewComponent } from './cards/update-preview.component';
import { CampaignShareComponent } from './cards/campaign-share.component';
import { DonationBoxComponent } from './cards/donation-box.component';
import { RaceCardComponent } from './cards/race-card.component';
import { ContentCollectionComponent } from './collections/content-collection.component';
import { DonorsCollectionComponent } from './collections/donors-collection.component';
import { PublicPageComponent } from './parts/public-page.component';
import { PublicPartsService } from './parts/public-parts.service';

/**
 * The components this service renders: the public cards, two blocks (share, donation box), since
 * v4.45 the collection blocks and the race block, and since v4.46 the whole public page
 * (PublicPageComponent, with the page parts and the blocks as its child components). A function, read when a component is created: the
 * collection blocks import this service's users, so a table built at module load could meet them
 * before they are defined.
 */
function kindTable() {
  return {
    reward: RewardTileComponent,
    sponsors: SponsorsComponent,
    donor: DonorCardComponent,
    update: UpdateCardComponent,
    comment: CommentCardComponent,
    ambassador: AmbassadorCardComponent,
    updatePreview: UpdatePreviewComponent,
    share: CampaignShareComponent,
    donationBox: DonationBoxComponent,
    raceCard: RaceCardComponent,
    contentCollection: ContentCollectionComponent,
    donorsCollection: DonorsCollectionComponent,
    publicPage: PublicPageComponent
  } satisfies Record<string, Type<unknown>>;
}
let kinds: ReturnType<typeof kindTable> | null = null;
const component = (kind: CardKind): Type<unknown> => (kinds ??= kindTable())[kind];
export type CardKind = 'reward' | 'sponsors' | 'donor' | 'update' | 'comment' | 'ambassador' | 'updatePreview' | 'share' | 'donationBox' | 'raceCard' | 'contentCollection' | 'donorsCollection' | 'publicPage';
export type CardInputs = Record<string, unknown>;

/**
 * The public cards are Angular components (v4.44), and so are the collection blocks (v4.45) and,
 * since v4.46, the whole public page (`renderPage`: PublicPageComponent, whose blocks and cards are
 * its template's own child components). Since v4.47 no markup string places a card any more (the
 * panorama sidebar's reward list is in the page's template), so there are no slots.
 *
 * - `html()` renders a card to markup, for the globals that other code calls and that return a
 *   string (`HamonymContentCards`, `HamonymCollection.donorCard`, `hamAngularMediaContext.
 *   rewardTileMarkup`/`sponsorMarkup`, `hamonymUpdatePreviewCard`).
 * - `mount()` renders a component into a container that its code rewrites (the manager's scaled
 *   down previews, rewritten while an item is typed).
 * - `render()` renders a component for the caller to insert (a collection block rendered again
 *   from its toolbar). The cards inside a block are its template's own child components.
 *
 * Cards are not attached to the application: they are rendered once from their inputs (the core
 * re-renders the page on every change). A card whose element has left the document is destroyed
 * after the current task.
 */
@Injectable({ providedIn: 'root' })
export class CampaignCardsService implements OnDestroy {
  private readonly injector = inject(EnvironmentInjector);
  private readonly media = inject(CardMediaService);
  private readonly parts = inject(PublicPartsService);
  private readonly live = new Set<ComponentRef<unknown>>();
  private readonly mounted = new WeakMap<Element, ComponentRef<unknown>>();
  private page?: ComponentRef<unknown>;
  private sweepQueued = false;

  /** The core's shared photo store (`huRacePhotoSrc`), for the reward photos. */
  attach(hooks: { photoSrc(source: unknown): string }): void { this.media.attach(source => hooks.photoSrc(source)); }

  /** The card's markup (rendered by the component, then released). */
  html(kind: CardKind, inputs: CardInputs = {}): string {
    const ref = this.create<unknown>(component(kind), inputs);
    const markup = ref.location.nativeElement.outerHTML as string;
    ref.destroy();
    return markup;
  }

  /**
   * A rendered component's host element, for the caller to insert (a collection block rendered
   * again from its toolbar). It is destroyed once it has left the document.
   */
  render(kind: CardKind, inputs: CardInputs = {}): HTMLElement {
    const ref = this.create<unknown>(component(kind), inputs);
    this.track(ref);
    return ref.location.nativeElement as HTMLElement;
  }

  /**
   * The public page (v4.46, `renderPreview`). v4.53: the page is created once, with `preview` as its host (its
   * template is the container's content; the Studio's `#preview` keeps its own classes and variables), and each
   * later render computes it again in place: `PublicPartsService.beginRender`, the page's `render`, then one check of
   * the page, in which every part renders itself again (PagePart). A new container (or a destroyed page) creates it.
   */
  renderPage(preview: HTMLElement): void {
    this.parts.beginRender();
    try { this.renderPageNow(preview); } finally { this.parts.endRender(); }
  }

  private renderPageNow(preview: HTMLElement): void {
    const page = this.page;
    if (page && !page.hostView.destroyed && page.location.nativeElement === preview) {
      // What replacing the page's nodes did besides: the focus inside it was lost, and no scroll anchoring moved
      // the preview (its anchor node was gone): the scroll position is the same number, clamped to the new height.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== preview && preview.contains(focused)) focused.blur();
      const top = preview.scrollTop, left = preview.scrollLeft;
      (page.instance as PublicPageComponent).render();
      page.changeDetectorRef.detectChanges();
      if (preview.scrollTop !== top) preview.scrollTop = top;
      if (preview.scrollLeft !== left) preview.scrollLeft = left;
      return;
    }
    page?.destroy();
    const ref = createComponent(PublicPageComponent, { environmentInjector: this.injector, hostElement: preview });
    // Angular marks root hosts with its version; #preview never had it.
    preview.removeAttribute('ng-version');
    ref.changeDetectorRef.detectChanges();
    this.page = ref;
  }

  /** The page's nodes are in `#preview` (v4.48): the page's parts that measure themselves (the donation box's amounts). */
  attachPage(): void { (this.page?.instance as PublicPageComponent | undefined)?.attached(); }
  /** v4.52: what the page measures once it is in `#preview` (the core calls these at the points it measured before). */
  fitHeroSubtitle(): void { this.pageInstance()?.fitHeroSubtitle(); }
  placeRaceCard(): void { this.pageInstance()?.placeRaceCard(); }
  /** v4.53: the container's layout classes and variables (old `applyPreviewHost(…, 'layout')`). */
  layoutHost(): void {
    this.pageInstance()?.layoutHost();
    // The host's bindings are the root view's (the page's own check does not reach them).
    if (this.page && !this.page.hostView.destroyed) this.page.changeDetectorRef.detectChanges();
  }
  syncDonationCtas(): void { this.pageInstance()?.syncCtas(); }
  private pageInstance(): PublicPageComponent | undefined { return this.page?.instance as PublicPageComponent | undefined; }

  /** Renders `component` as the only child of `container`, replacing what it held. */
  mount<T>(container: Element, component: Type<T>, inputs: CardInputs = {}): ComponentRef<T> {
    const previous = this.mounted.get(container);
    if (previous) { previous.destroy(); this.live.delete(previous); }
    const ref = this.create(component, inputs);
    container.replaceChildren(ref.location.nativeElement);
    this.mounted.set(container, ref);
    this.track(ref);
    return ref;
  }

  ngOnDestroy(): void {
    this.live.forEach(ref => ref.destroy());
    this.page?.destroy();
    this.live.clear();
  }

  private create<T>(component: Type<T>, inputs: CardInputs): ComponentRef<T> {
    const host = document.createElement(hostTag(component));
    const ref = createComponent(component, { environmentInjector: this.injector, hostElement: host });
    for (const [name, value] of Object.entries(inputs)) ref.setInput(name, value);
    ref.changeDetectorRef.detectChanges();
    // Angular marks root hosts with its version; the card markup never had it.
    host.removeAttribute('ng-version');
    return ref;
  }

  private track(ref: ComponentRef<unknown>): void {
    this.live.add(ref);
    if (this.sweepQueued) return;
    this.sweepQueued = true;
    queueMicrotask(() => {
      this.sweepQueued = false;
      for (const r of this.live) if (!(r.location.nativeElement as Element).isConnected) { r.destroy(); this.live.delete(r); }
    });
  }
}

const tags = new Map<Type<unknown>, string>();
/** Element name of an attribute-selector component (`article[ham-reward-tile]` → `article`). */
function hostTag(component: Type<unknown>): string {
  let tag = tags.get(component);
  if (!tag) {
    tag = /^[a-z][a-z0-9-]*/.exec(reflectComponentType(component)?.selector || '')?.[0] || 'div';
    tags.set(component, tag);
  }
  return tag;
}
