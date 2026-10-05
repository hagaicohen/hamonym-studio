import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService, Offering } from '../../../services/campaign-studio-state.service';
import { StudioUiService } from '../../services/studio-ui.service';
import { DonationService } from '../../../services/donation.service';

// Offering is a pure gift/perk concept again — always goes to the cart.
// Registration is a separate Action (startRegistration), not routed through
// the Offerings grid at all. See DECISIONS.md (2026-07-16).
describe('CampaignPreviewComponent — offerings cart / registration action', () => {
  let component: CampaignPreviewComponent;

  const perkA: Offering = {
    id: 'p1', title: 'תשורה א', description: '',
    minimumAmount: 100, stock: null, imageUrl: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
    // Deliberately not calling fixture.detectChanges() — these tests exercise
    // the cart/checkout methods directly, not the rendered template or ngOnInit.
  });

  function draftWith(offerings: Offering[]) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, offerings };
  }

  it('selecting an offering adds it to the cart', () => {
    const draft = draftWith([perkA]);
    component.selectOffering(perkA, draft);

    expect(component.cartOfferingIds.has(perkA.id)).toBe(true);
    expect(component.checkoutOpen).toBe(false);
  });

  it('offerings still multi-select normally', () => {
    const perkB: Offering = { ...perkA, id: 'p2', title: 'תשורה ב', minimumAmount: 40 };
    const draft = draftWith([perkA, perkB]);
    component.selectOffering(perkA, draft);
    component.selectOffering(perkB, draft);

    expect(component.cartOfferingIds.size).toBe(2);
    expect(component.totalAmount(draft)).toBe(140);
  });

  it('totalAmount is explicitAmount + cart total', () => {
    const draft = draftWith([perkA]);
    component.selectAmount(200);
    component.selectOffering(perkA, draft);

    expect(component.totalAmount(draft)).toBe(300);
  });

  it('startRegistration opens checkout directly in registration mode', () => {
    component.startRegistration();

    expect(component.checkoutOpen).toBe(true);
    expect(component.checkoutMode).toBe('registration');
  });

  it('closeCheckout resets registration mode back to donation', () => {
    component.startRegistration();
    component.closeCheckout();

    expect(component.checkoutOpen).toBe(false);
    expect(component.checkoutMode).toBe('donation');
  });
});

// A suggested/default amount is never financial consent (2026-09-21 product
// decision). Before this fix, openCheckout() silently assigned
// getEffectiveAmount()'s "middle suggested amount" fallback into
// selectedAmount -- a donor who picked ONLY a reward, never touching the
// amount picker, reached checkout owing reward price + an untouched
// suggestion they never selected. Only selectedAmount/customAmount (values
// the donor actually chose) may ever contribute to the payable total.
describe('CampaignPreviewComponent — amount-intent invariant (suggested amount is not consent)', () => {
  let component: CampaignPreviewComponent;

  const rewardA: Offering = {
    id: 'r1', title: 'תשורת E2E', description: '',
    minimumAmount: 100, stock: null, imageUrl: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWith(offerings: Offering[]) {
    const state = TestBed.inject(CampaignStudioStateService);
    // suggestedAmounts must be non-empty so getEffectiveAmount()'s fallback
    // would have returned a non-zero "middle suggestion" if it were still
    // being used -- proves these tests actually exercise the fixed path,
    // not merely a case where the old fallback happened to be 0 anyway.
    return { ...state.draft, offerings, suggestedAmounts: [50, 100, 180, 360, 500] };
  }

  it('A. reward selected alone, amount picker never touched -> total is exactly the reward price', () => {
    const draft = draftWith([rewardA]);
    component.selectOffering(rewardA, draft);

    expect(component.selectedAmount).toBeNull();
    expect(component.explicitAmount).toBe(0);
    expect(component.totalAmount(draft)).toBe(100);

    component.openCheckout(draft);
    expect(component.checkoutOpen).toBe(true);
    expect(component.selectedAmount).toBeNull('openCheckout must not invent a base amount');
    expect(component.totalAmount(draft)).toBe(100);
  });

  it('B. donor explicitly selects ₪180, then adds the ₪100 reward -> total is 280', () => {
    const draft = draftWith([rewardA]);
    component.selectAmount(180);
    component.selectOffering(rewardA, draft);

    expect(component.totalAmount(draft)).toBe(280);
    component.openCheckout(draft);
    expect(component.totalAmount(draft)).toBe(280);
  });

  it('C. donor selects the ₪100 reward, then explicitly adds ₪50 -> total is 150', () => {
    const draft = draftWith([rewardA]);
    component.selectOffering(rewardA, draft);
    component.selectAmount(50);

    expect(component.totalAmount(draft)).toBe(150);
    component.openCheckout(draft);
    expect(component.totalAmount(draft)).toBe(150);
  });

  it('D. normal donation flow with no reward is unaffected -- explicit amount still opens checkout for exactly that amount', () => {
    const draft = draftWith([]);
    component.selectAmount(100);

    expect(component.totalAmount(draft)).toBe(100);
    component.openCheckout(draft);
    expect(component.checkoutOpen).toBe(true);
    expect(component.totalAmount(draft)).toBe(100);
  });

  it('E. removing the selected reward drops it back out of the total', () => {
    const draft = draftWith([rewardA]);
    component.selectAmount(50);
    component.selectOffering(rewardA, draft);
    expect(component.totalAmount(draft)).toBe(150);

    component.removeOffering(rewardA.id);
    expect(component.totalAmount(draft)).toBe(50);
  });

  it('F. checkout displays exactly the same total the donor saw immediately before opening it', () => {
    const draft = draftWith([rewardA]);
    component.selectOffering(rewardA, draft);
    const beforeOpen = component.totalAmount(draft);

    component.openCheckout(draft);
    const afterOpen = component.totalAmount(draft);

    expect(afterOpen).toBe(beforeOpen);
    expect(afterOpen).toBe(100);
  });

  it('an untouched suggested amount alone (no reward, no explicit selection) never opens checkout with an invented amount', () => {
    const draft = draftWith([]);
    expect(component.totalAmount(draft)).toBe(0);

    component.openCheckout(draft);
    expect(component.checkoutOpen).toBe(false, 'a zero-intent click must not silently become a payable checkout');
    expect(component.selectedAmount).toBeNull();
  });
});

// Regression guard (2026-09-29) — every test above exercises component
// methods directly and deliberately never calls fixture.detectChanges()/
// ngOnInit() (see the first describe block's own comment), so none of them
// could have caught a regression that reintroduces auto-selection inside
// ngOnInit's draft$ subscription specifically. That is exactly what almost
// shipped in this session (fixing the amount grid's misleading default
// highlight by making selectedAmount genuinely equal the suggested amount
// on load) before being caught by manual review and reverted in df27067.
// This test calls the real ngOnInit() so a future reintroduction of that
// pattern fails here.
describe('CampaignPreviewComponent — amount-intent invariant survives ngOnInit', () => {
  let component: CampaignPreviewComponent;

  const rewardA: Offering = {
    id: 'r1', title: 'תשורת E2E', description: '',
    minimumAmount: 100, stock: null, imageUrl: null,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  it('loading a campaign with suggested amounts never auto-selects one, so a reward alone still costs exactly its own price', () => {
    const state = TestBed.inject(CampaignStudioStateService);
    // Non-empty and deliberately including the exact value (₪180) the
    // template used to fake-highlight -- a reintroduced auto-select would
    // have something real to wrongly pick here, unlike an empty list.
    state.patch({ suggestedAmounts: [50, 100, 180, 360, 500] });

    // The real lifecycle hook — not skipped, unlike the suite above. slug
    // stays '' (createInitialDraft()'s default), so none of ngOnInit's
    // slug-gated HTTP calls (donors/ambassadors/comments) fire.
    component.ngOnInit();

    expect(component.selectedAmount).toBeNull();
    expect(component.isAmountSelected(180))
      .toBe(false, 'the middle suggested amount must not appear selected just because it is the default suggestion');

    const draftWithReward = { ...state.draft, offerings: [rewardA] };
    component.selectOffering(rewardA, draftWithReward);
    expect(component.totalAmount(draftWithReward))
      .toBe(100, 'a reward alone, amount picker never touched, must cost exactly the reward price');

    component.selectAmount(180);
    expect(component.isAmountSelected(180)).toBe(true);
    expect(component.totalAmount(draftWithReward))
      .toBe(280, 'after an explicit click, the chosen amount must count toward the total');
  });
});

// Opening Composition — Phase A, generic (2026-10-01). openingComposition()/
// isFundraisingSplitOpening()/isStoryFirstOpening()/hasStructuredOpening()
// all just delegate to resolveOpeningComposition() (already covered in
// depth by campaign-styles.spec.ts's pure-function tests) -- these confirm
// the component-level wrappers agree, plus the CTA precedence fix that
// lives only in this component (it can't be a pure campaign-styles.ts
// function since it reads draft.heroCtaConfig, a component-owned field with
// no Style involvement at all).
describe('CampaignPreviewComponent — Opening Composition prototype', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithStyle(campaignStyleId: any) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, layout: { ...state.draft.layout, campaignStyleId } };
  }

  it('Vibrant activates Fundraising-Split', () => {
    expect(component.isFundraisingSplitOpening(draftWithStyle('vibrant'))).toBe(true);
  });

  it('Classic does not activate Fundraising-Split', () => {
    expect(component.isFundraisingSplitOpening(draftWithStyle('classic'))).toBe(false);
  });

  it('Editorial does not activate Fundraising-Split', () => {
    expect(component.isFundraisingSplitOpening(draftWithStyle('editorial'))).toBe(false);
  });

  it('legacy campaign (no campaignStyleId) does not activate Fundraising-Split', () => {
    expect(component.isFundraisingSplitOpening(draftWithStyle(undefined))).toBe(false);
  });

  function draftWithOpening(openingComposition: any, campaignStyleId: any = undefined) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, layout: { ...state.draft.layout, campaignStyleId, openingComposition } };
  }

  it('an explicit "classic" override wins over Vibrant\'s own fundraising-split default', () => {
    const draft = draftWithOpening('classic', 'vibrant');
    expect(component.isFundraisingSplitOpening(draft)).toBe(false);
    expect(component.openingComposition(draft)).toBe('classic');
  });

  it('an explicit "story-first" override wins over Vibrant\'s own fundraising-split default', () => {
    const draft = draftWithOpening('story-first', 'vibrant');
    expect(component.isStoryFirstOpening(draft)).toBe(true);
    expect(component.isFundraisingSplitOpening(draft)).toBe(false);
  });

  it('hasStructuredOpening is true for either structured composition and false for classic', () => {
    expect(component.hasStructuredOpening(draftWithOpening('fundraising-split'))).toBe(true);
    expect(component.hasStructuredOpening(draftWithOpening('story-first'))).toBe(true);
    expect(component.hasStructuredOpening(draftWithOpening('classic'))).toBe(false);
    expect(component.hasStructuredOpening(draftWithOpening(undefined))).toBe(false);
  });

  // CTA precedence — explicit user choice > Style default (2026-09-30 fix
  // for the prototype's known issue: the first version always showed the
  // Opening CTA regardless of heroCtaConfig.visible).
  function draftWithCta(heroCtaConfig: any) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, heroCtaConfig };
  }

  it('heroCtaConfig.visible === false hides the Opening CTA', () => {
    expect(component.isOpeningCtaVisible(draftWithCta({ visible: false, label: '', color: '', align: 'center', icon: '' }))).toBe(false);
  });

  it('heroCtaConfig.visible === true shows the Opening CTA', () => {
    expect(component.isOpeningCtaVisible(draftWithCta({ visible: true, label: '', color: '', align: 'center', icon: '' }))).toBe(true);
  });

  it('legacy campaign with no heroCtaConfig at all still shows the Opening CTA (not a "hidden" state)', () => {
    expect(component.isOpeningCtaVisible(draftWithCta(undefined))).toBe(true);
  });
});

// Section-presentation audit (2026-09-30) -- sectionSurfaceColors() is a
// thin wrapper over resolveSectionSurfaceColors() (already covered in depth
// by campaign-styles.spec.ts's pure-function tests); this just confirms the
// component reads the right draft fields and the wrapper agrees.
describe('CampaignPreviewComponent — section surface colors', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithStyle(campaignStyleId: any) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, layout: { ...state.draft.layout, campaignStyleId } };
  }

  it('undefined campaignStyleId (legacy) preserves the exact default draft values', () => {
    const draft = draftWithStyle(undefined);
    expect(component.sectionSurfaceColors(draft)).toEqual({
      odd: draft.layout.sectionBgOdd,
      even: draft.layout.sectionBgEven,
      divider: draft.layout.sectionDividerColor,
    });
  });

  it('Midnight resolves its own tonal surface colors', () => {
    const draft = draftWithStyle('midnight');
    expect(component.sectionSurfaceColors(draft)).toEqual({
      odd: '#ffffff', even: '#eef1f8', divider: '#dde4f0',
    });
  });
});

// Click-to-edit (2026-09-30) -- connects the live preview to the EXISTING
// Builder editor via CampaignStudioStateService.requestFocusBlock(), the
// same method already used after a drag-and-drop insertion. No new
// selection/focus state introduced -- these tests exercise onBlockClick()
// directly, mirroring the file's own established "call the method, assert
// on state" convention rather than a full fixture render.
describe('CampaignPreviewComponent — click-to-edit', () => {
  let component: CampaignPreviewComponent;
  let state: CampaignStudioStateService;

  const block = { id: 'b1', type: 'rich-text', order: 1, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
  });

  function clickEventOn(el: HTMLElement): MouseEvent {
    const event = new MouseEvent('click');
    Object.defineProperty(event, 'target', { value: el });
    spyOn(event, 'stopPropagation');
    return event;
  }

  it('1. clicking a plain block while pageBuilderActive calls requestFocusBlock with the correct id/type', () => {
    component.pageBuilderActive = true;
    spyOn(state, 'requestFocusBlock');
    const target = document.createElement('div');
    component.onBlockClick(clickEventOn(target), block);
    expect(state.requestFocusBlock).toHaveBeenCalledWith('b1', 'rich-text');
  });

  it('2. clicking while Page Builder is inactive does not request editing', () => {
    component.pageBuilderActive = false;
    spyOn(state, 'requestFocusBlock');
    const target = document.createElement('div');
    component.onBlockClick(clickEventOn(target), block);
    expect(state.requestFocusBlock).not.toHaveBeenCalled();
  });

  it('3. a click landing on a real interactive control (link/button/input/video) does not trigger block editing', () => {
    component.pageBuilderActive = true;
    spyOn(state, 'requestFocusBlock');
    for (const tag of ['a', 'button', 'input', 'video']) {
      const el = document.createElement(tag);
      component.onBlockClick(clickEventOn(el), block);
    }
    expect(state.requestFocusBlock).not.toHaveBeenCalled();
  });

  it('3b. a click on a plain element NESTED inside an interactive control (e.g. an icon inside a button) is still guarded, via closest()', () => {
    component.pageBuilderActive = true;
    spyOn(state, 'requestFocusBlock');
    const button = document.createElement('button');
    const icon = document.createElement('span');
    button.appendChild(icon);
    component.onBlockClick(clickEventOn(icon), block);
    expect(state.requestFocusBlock).not.toHaveBeenCalled();
  });

  it('4. existing hover behavior (setHovered) remains an intact no-op, untouched by this change', () => {
    expect(() => component.setHovered('b1')).not.toThrow();
    expect(() => component.setHovered(null)).not.toThrow();
  });
});

// Ambassador self-registration: personal link choice + goal-above-campaign
// -goal warning (2026-10-01). Non-blocking by design -- a high personal
// goal never disables the submit button, it only surfaces a notice.
describe('CampaignPreviewComponent — ambassador self-registration modal', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  it('openJoinModal resets the slug and availability so a fresh form cannot submit until checked', () => {
    component.joinSlugAvailable = true;
    component.openJoinModal();

    expect(component.joinForm.slug).toBe('');
    expect(component.joinSlugAvailable).toBe(false);
  });

  it('shows the goal warning only once the entered goal exceeds the campaign target', () => {
    const draft = { ...TestBed.inject(CampaignStudioStateService).draft, targetAmount: 10000 };
    component.joinForm.goalAmount = 5000;
    expect(component.joinGoalAboveCampaignGoal(draft)).toBe(false);

    component.joinForm.goalAmount = 15000;
    expect(component.joinGoalAboveCampaignGoal(draft)).toBe(true);

    component.joinForm.goalAmount = 10000;
    expect(component.joinGoalAboveCampaignGoal(draft)).toBe(false);
  });

  it('submitJoin is a no-op until the chosen personal link is confirmed available', () => {
    const draft = { ...TestBed.inject(CampaignStudioStateService).draft, slug: 'camp-1' };
    component.joinForm.fullName = 'ישראל ישראלי';
    component.joinForm.goalAmount = 999999;
    component.joinSlugAvailable = false;

    component.submitJoin(draft);

    expect(component.joinStatus).toBe('idle');
  });
});

// Empty section = hidden on the public campaign page (2026-10-02). The
// Builder/Studio preview (isPublicPage stays false, the default) keeps every
// section visible with its existing empty-state placeholder so the editor
// can always find and populate it; only the real public-facing pages pass
// isPublicPage=true.
describe('CampaignPreviewComponent — empty sections hidden on the public page only', () => {
  let component: CampaignPreviewComponent;

  function emptyBlock(type: 'rewards' | 'donors' | 'updates' | 'ambassadors') {
    return { id: 'b1', type, order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWith(partial: Partial<ReturnType<typeof baseDraft>>) {
    return { ...baseDraft(), ...partial };
  }
  function baseDraft() {
    return TestBed.inject(CampaignStudioStateService).draft;
  }

  it('renders every section in the Builder/Studio context regardless of content', () => {
    component.isPublicPage = false;
    const draft = draftWith({ offerings: [], supportersCount: 0, updates: [] });

    expect(component.shouldRenderBlock(emptyBlock('rewards'), draft)).toBe(true);
    expect(component.shouldRenderBlock(emptyBlock('donors'), draft)).toBe(true);
    expect(component.shouldRenderBlock(emptyBlock('updates'), draft)).toBe(true);
  });

  it('hides rewards/donors/updates on the public page when they have no content', () => {
    component.isPublicPage = true;
    const draft = draftWith({ offerings: [], supportersCount: 0, updates: [] });

    expect(component.shouldRenderBlock(emptyBlock('rewards'), draft)).toBe(false);
    expect(component.shouldRenderBlock(emptyBlock('donors'), draft)).toBe(false);
    expect(component.shouldRenderBlock(emptyBlock('updates'), draft)).toBe(false);
  });

  it('shows rewards/donors/updates on the public page once they have real content', () => {
    component.isPublicPage = true;
    const draft = draftWith({
      offerings: [{ id: 'p1', title: 'x', description: '', minimumAmount: 50, stock: null, imageUrl: null }],
      supportersCount: 3,
      updates: [{ id: 'u1', title: 't', description: '', date: '2026-01-01' } as any],
    });

    expect(component.shouldRenderBlock(emptyBlock('rewards'), draft)).toBe(true);
    expect(component.shouldRenderBlock(emptyBlock('donors'), draft)).toBe(true);
    expect(component.shouldRenderBlock(emptyBlock('updates'), draft)).toBe(true);
  });

  it('never hides the ambassadors section itself even when empty (its empty state is a donor-facing invite CTA, not a placeholder)', () => {
    component.isPublicPage = true;
    const draft = draftWith({});

    expect(component.shouldRenderBlock(emptyBlock('ambassadors'), draft)).toBe(true);
  });

  it('fades the toolbar nav link for an empty section on the public page only', () => {
    const emptyDraft = draftWith({
      offerings: [], supportersCount: 0, updates: [],
      blocks: [emptyBlock('rewards'), emptyBlock('donors'), emptyBlock('updates'), emptyBlock('ambassadors')],
    });

    component.isPublicPage = false;
    expect(component.navItems(emptyDraft).every(i => !i.faded)).toBe(true);

    component.isPublicPage = true;
    expect(component.navItems(emptyDraft).every(i => i.faded)).toBe(true);
  });

  it('does not fade the toolbar nav link once a section has content', () => {
    component.isPublicPage = true;
    const draft = draftWith({
      offerings: [{ id: 'p1', title: 'x', description: '', minimumAmount: 50, stock: null, imageUrl: null }],
      blocks: [emptyBlock('rewards')],
    });

    expect(component.navItems(draft).find(i => i.sectionId === 'section-rewards')?.faded).toBeFalsy();
  });

  it('a faded mobile-drawer nav item is a no-op click (not just dimmed)', () => {
    spyOn(component, 'scrollTo');
    component.navOpen = true;

    component.onNavItemClick({ sectionId: 'section-rewards', faded: true });

    expect(component.scrollTo).not.toHaveBeenCalled();
    expect(component.navOpen).toBe(true);
  });

  it('a non-faded mobile-drawer nav item scrolls and closes the drawer', () => {
    spyOn(component, 'scrollTo');
    component.navOpen = true;

    component.onNavItemClick({ sectionId: 'section-rewards', faded: false });

    expect(component.scrollTo).toHaveBeenCalledWith('section-rewards');
    expect(component.navOpen).toBe(false);
  });
});

// Section Presentation (2026-10-03) -- the two rewards/updates-only legacy
// escape hatches (rewardsLayout='image', block.data.viewMode='list') that
// let an already-published campaign keep its exact look without touching
// either axis' new field.
describe('CampaignPreviewComponent — Section Presentation legacy escape hatches', () => {
  let component: CampaignPreviewComponent;

  function block(type: 'updates', data: any = {}) {
    return { id: 'b1', type, order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data } as any;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWith(partial: any) {
    return { ...TestBed.inject(CampaignStudioStateService).draft, layout: { ...TestBed.inject(CampaignStudioStateService).draft.layout, ...partial } };
  }

  it('rewardsLayout="image" (a pre-existing explicit choice) is honored by default once the new field is untouched', () => {
    const draft = draftWith({ rewardsLayout: 'image' });
    expect(component.sectionPresentation(draft, 'rewards')).toBe('image');
  });

  it('an explicit sectionPresentation.rewards choice always wins over the legacy rewardsLayout escape hatch', () => {
    const draft = draftWith({ rewardsLayout: 'image', sectionPresentation: { rewards: 'list' } });
    expect(component.sectionPresentation(draft, 'rewards')).toBe('list');
  });

  it('rewardsLayout="standard" (never an explicit "image" choice) does not trigger the escape hatch', () => {
    const draft = draftWith({ rewardsLayout: 'standard' });
    expect(component.sectionPresentation(draft, 'rewards')).toBe('cards');
  });

  it('an updates block with viewMode="list" (a pre-existing explicit choice) is honored by default', () => {
    const draft = draftWith({});
    expect(component.updatesPresentation(draft, block('updates', { viewMode: 'list' }))).toBe('list');
  });

  it('an explicit sectionPresentation.updates choice always wins over the legacy viewMode escape hatch', () => {
    const draft = draftWith({ sectionPresentation: { updates: 'cards' } });
    expect(component.updatesPresentation(draft, block('updates', { viewMode: 'list' }))).toBe('cards');
  });

  it('an updates block with no viewMode set (never an explicit past choice) does not trigger the escape hatch', () => {
    const draft = draftWith({});
    expect(component.updatesPresentation(draft, block('updates', {}))).toBe('cards');
  });

  // Placement-aware recommendation (2026-10-06): rewardsLayout='image' only
  // ever affected the MAIN-content carousel historically, so it must not
  // override the Sidebar's forced 'list' recommendation now that Rewards can
  // actually be placed there -- a legacy campaign moved into the sidebar
  // must look like every other sidebar list, not an orphaned image layout.
  it('rewardsLayout="image" is NOT honored once the section is placed in the sidebar', () => {
    const draft = draftWith({ rewardsLayout: 'image', sidebarSections: ['rewards'] });
    expect(component.sectionPresentation(draft, 'rewards')).toBe('list');
  });

  it('rewardsLayout="image" is honored again once the section moves back to Main', () => {
    const draft = draftWith({ rewardsLayout: 'image', sidebarSections: [] });
    expect(component.sectionPresentation(draft, 'rewards')).toBe('image');
  });

  // Placement-aware recommendation (2026-10-06): Sidebar always recommends
  // 'list', even for a Style whose own lists.presentation is 'cards' -- no
  // Style may recommend Cards for the sidebar. Main still consults the Style.
  it('a Style that recommends cards does not leak into the sidebar recommendation', () => {
    const main = draftWith({ campaignStyleId: 'vibrant', sidebarSections: [] });
    const sidebar = draftWith({ campaignStyleId: 'vibrant', sidebarSections: ['donors'] });
    expect(component.sectionPresentation(main, 'donors')).toBe('cards');
    expect(component.sectionPresentation(sidebar, 'donors')).toBe('list');
  });

  it('an explicit per-campaign choice still wins outright over the sidebar\'s forced list, until the placement changes again', () => {
    const draft = draftWith({ sidebarSections: ['ambassadors'], sectionPresentation: { ambassadors: 'cards' } });
    expect(component.sectionPresentation(draft, 'ambassadors')).toBe('cards');
  });
});

// Sidebar placement vs. the railZone:'main' container structure
// (2026-10-04 bug fix). A campaign built via drag-and-drop in the Page
// Builder commonly has its rewards/donors/ambassadors/updates/sponsors block
// nested INSIDE a top-level container tagged railZone:'main', rather than
// floating top-level. Before this fix, mainColumnBlocks() rendered every
// child of that container unconditionally (never consulting
// sidebarSections), and sidebarBlocks()'s own "extra" pickup only ever
// matched a TRUE top-level block -- so toggling a section's sidebar
// placement silently had no visible effect for any such campaign. Reported
// by the user testing Donors specifically.
describe('CampaignPreviewComponent — sidebar placement moves a block out of the main railZone container', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithMainContainer(donorsInSidebar: boolean) {
    const base = TestBed.inject(CampaignStudioStateService).draft;
    const mainContainer = {
      id: 'main1', type: 'container', order: 0, visible: true, label: '',
      spacingTop: 0, spacingBottom: 0,
      data: { childBlockIds: ['donors1'], backgroundColor: '', borderColor: '', backgroundImageUrl: '', railZone: 'main' },
    } as any;
    const donorsBlock = {
      id: 'donors1', type: 'donors', order: 0, visible: true, label: '',
      spacingTop: 0, spacingBottom: 0, data: {},
    } as any;
    return {
      ...base,
      blocks: [mainContainer, donorsBlock],
      layout: { ...base.layout, sidebarSections: (donorsInSidebar ? ['donors'] : []) as ('rewards'|'donors'|'ambassadors'|'updates'|'sponsors')[] },
    };
  }

  it('without sidebarSections, the nested donors block renders in the main column (existing behavior preserved)', () => {
    const draft = draftWithMainContainer(false);
    expect(component.mainColumnBlocks(draft).map(b => b.id)).toContain('donors1');
    expect(component.sidebarBlocks(draft).map(b => b.id)).not.toContain('donors1');
  });

  it('with donors in sidebarSections, the nested donors block moves to the sidebar rail instead of vanishing', () => {
    const draft = draftWithMainContainer(true);
    expect(component.mainColumnBlocks(draft).map(b => b.id)).not.toContain('donors1');
    expect(component.sidebarBlocks(draft).map(b => b.id)).toContain('donors1');
  });
});

// Public section filtering/sorting controls (2026-10-04). Ambassadors and
// Donors reuse their EXISTING ambSearch/ambSortBy and donorPeriod/donorSort
// state for the new sidebar-compact controls (no parallel filter system);
// Rewards is a genuinely new filter built purely from existing Offering
// fields (minimumAmount, stock, featured) -- no invented taxonomy.
describe('CampaignPreviewComponent — public section filtering', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithOfferings(offerings: Offering[]) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, offerings };
  }

  const cheap: Offering = { id: 'o1', title: 'זול', description: '', minimumAmount: 50, stock: null, imageUrl: null };
  const pricey: Offering = { id: 'o2', title: 'יקר', description: '', minimumAmount: 500, stock: null, imageUrl: null };
  const featured: Offering = { id: 'o3', title: 'מומלץ', description: '', minimumAmount: 200, stock: null, imageUrl: null, featured: true };

  it('1/5/7. "featured" sort (the default) puts featured offerings first, reusing the existing featured flag', () => {
    const draft = draftWithOfferings([cheap, pricey, featured]);
    component.rewardsSortBy = 'featured';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o3', 'o1', 'o2']);
  });

  it('price-asc / price-desc sort by minimumAmount, an existing field -- no invented category', () => {
    const draft = draftWithOfferings([pricey, cheap, featured]);
    component.rewardsSortBy = 'price-asc';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o1', 'o3', 'o2']);
    component.rewardsSortBy = 'price-desc';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o2', 'o3', 'o1']);
  });

  it('6. isSoldOut is derived purely from stock vs. purchasedCount -- null stock never sells out', () => {
    const limited: Offering = { id: 'o4', title: 'מוגבל', description: '', minimumAmount: 100, stock: 2, imageUrl: null };
    (component as any).rewardCounts = { o4: 2 };
    expect(component.isSoldOut(limited)).toBe(true);
    expect(component.isSoldOut(cheap)).toBe(false); // stock: null

    (component as any).rewardCounts = { o4: 1 };
    expect(component.isSoldOut(limited)).toBe(false);
  });

  it('6. hideSoldOut excludes sold-out offerings from the filtered collection fed to every presentation', () => {
    const limited: Offering = { id: 'o4', title: 'מוגבל', description: '', minimumAmount: 100, stock: 1, imageUrl: null };
    (component as any).rewardCounts = { o4: 1 };
    const draft = draftWithOfferings([cheap, limited]);

    component.rewardsHideSoldOut = false;
    expect(component.rewardsFiltered(draft).map(o => o.id)).toContain('o4');

    component.rewardsHideSoldOut = true;
    expect(component.rewardsFiltered(draft).map(o => o.id)).not.toContain('o4');
  });

  it('7/11/12. hiding sold-out can reduce the filtered collection to zero even though the section has real offerings (filter-empty, not section-empty) -- resetRewardsFilter restores it', () => {
    const limited: Offering = { id: 'o4', title: 'מוגבל', description: '', minimumAmount: 100, stock: 1, imageUrl: null };
    (component as any).rewardCounts = { o4: 1 };
    const draft = draftWithOfferings([limited]);
    component.rewardsHideSoldOut = true;

    expect(draft.offerings!.length).toBeGreaterThan(0);
    expect(component.rewardsFiltered(draft).length).toBe(0);

    component.resetRewardsFilter();
    expect(component.rewardsHideSoldOut).toBe(false);
    expect(component.rewardsFiltered(draft).length).toBe(1);
  });

  it('7. rewardsFiltered is presentation-agnostic -- the same method/result feeds cards, list and image alike', () => {
    const draft = draftWithOfferings([pricey, cheap]);
    component.rewardsSortBy = 'price-asc';
    const result = component.rewardsFiltered(draft).map(o => o.id);
    // Called identically regardless of which sectionPresentation() value is
    // active -- the template passes no presentation-specific argument here.
    expect(result).toEqual(['o1', 'o2']);
  });

  // Rewards text search (2026-10-05) -- searches the existing title/
  // description fields through the SAME rewardsFiltered() pipeline already
  // used for sort/availability, so every assertion above about presentation-
  // agnosticism and placement-independence applies to search too.
  it('1. rewards: search matches by title', () => {
    const draft = draftWithOfferings([cheap, pricey, featured]);
    component.rewardsSearch = 'זול';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o1']);
  });

  it('2. rewards: search matches by description', () => {
    const withDesc: Offering = { id: 'o5', title: 'חולצה', description: 'כותנה אורגנית איכותית', minimumAmount: 80, stock: null, imageUrl: null };
    const draft = draftWithOfferings([cheap, withDesc]);
    component.rewardsSearch = 'אורגנית';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o5']);
  });

  it('3. rewards: Hebrew search works correctly', () => {
    const draft = draftWithOfferings([cheap, pricey]);
    component.rewardsSearch = 'יקר';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o2']);
  });

  it('4. rewards: English search is case-insensitive', () => {
    const mug: Offering = { id: 'o6', title: 'Coffee Mug', description: '', minimumAmount: 60, stock: null, imageUrl: null };
    const draft = draftWithOfferings([cheap, mug]);
    component.rewardsSearch = 'COFFEE';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o6']);
  });

  it('5. rewards: surrounding whitespace in the query is ignored', () => {
    const draft = draftWithOfferings([cheap, pricey]);
    component.rewardsSearch = '   יקר   ';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o2']);
  });

  it('6. rewards: a search with no matches produces an empty filtered collection (not an error, not the raw list)', () => {
    const draft = draftWithOfferings([cheap, pricey]);
    component.rewardsSearch = 'שזה-לא-קיים-בשום-מקום';
    expect(component.rewardsFiltered(draft).length).toBe(0);
  });

  it('7. rewards: resetRewardsFilter clears the search query too, not just availability/sort', () => {
    component.rewardsSearch = 'יקר';
    component.rewardsHideSoldOut = true;
    component.resetRewardsFilter();
    expect(component.rewardsSearch).toBe('');
    expect(component.rewardsHideSoldOut).toBe(false);
  });

  it('8. rewards: search combines correctly with the availability filter', () => {
    const soldOut: Offering = { id: 'o7', title: 'תשורה מוגבלת', description: '', minimumAmount: 100, stock: 1, imageUrl: null };
    (component as any).rewardCounts = { o7: 1 };
    const draft = draftWithOfferings([soldOut]);
    component.rewardsSearch = 'מוגבלת';

    component.rewardsHideSoldOut = false;
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o7']);

    component.rewardsHideSoldOut = true;
    expect(component.rewardsFiltered(draft).length).toBe(0);
  });

  it('9. rewards: search combines correctly with existing sort', () => {
    const matchA: Offering = { id: 'o8', title: 'מתנה זולה', description: '', minimumAmount: 30, stock: null, imageUrl: null };
    const matchB: Offering = { id: 'o9', title: 'מתנה יקרה', description: '', minimumAmount: 300, stock: null, imageUrl: null };
    const draft = draftWithOfferings([matchB, matchA, cheap]);
    component.rewardsSearch = 'מתנה';
    component.rewardsSortBy = 'price-asc';
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o8', 'o9']);
  });

  it('10. rewards: search flows through the one shared pipeline regardless of which presentation reads it', () => {
    const draft = draftWithOfferings([cheap, pricey]);
    component.rewardsSearch = 'יקר';
    // No presentation argument exists on rewardsFiltered() -- cards/list/image
    // in the template all call this exact same method.
    expect(component.rewardsFiltered(draft).map(o => o.id)).toEqual(['o2']);
  });

  it('8. Ambassadors: the sidebar-compact search control writes the SAME ambSearch property the main-content control already uses (no parallel filter state)', () => {
    const draft = { ...TestBed.inject(CampaignStudioStateService).draft };
    component.ambassadorsList = [
      { id: 'a1', fullName: 'דנה כהן', slug: 'dana', goalAmount: null, personalMessage: '', raisedTotal: 100, donorCount: 1 },
      { id: 'a2', fullName: 'משה לוי', slug: 'moshe', goalAmount: null, personalMessage: '', raisedTotal: 50, donorCount: 1 },
    ];

    component.ambSearch = 'דנה';
    expect(component.ambFiltered.map(a => a.id)).toEqual(['a1']);

    component.ambSearch = '';
    expect(component.ambFiltered.map(a => a.id).sort()).toEqual(['a1', 'a2']);
  });

  it('9. Donors: the sidebar-compact sort control writes the SAME donorSort property the main-content control already uses (no parallel filter state)', () => {
    (component as any).donors = [
      { name: 'א', amount: 50, completedAt: new Date(), isAnonymous: false, isFirst: false },
      { name: 'ב', amount: 500, completedAt: new Date(), isAnonymous: false, isFirst: false },
    ];

    component.donorSort = 'amount';
    expect((component as any).sortedDonors.map((d: any) => d.amount)).toEqual([500, 50]);
  });
});

// Updates text search (2026-10-05) -- searches the existing title/
// description fields (CampaignUpdate has no category/tag, that decision
// stays unchanged) through the SAME publishedUpdates()/visibleUpdates()
// pipeline the pre-existing pager already uses, so search and paging never
// disagree about which updates exist.
describe('CampaignPreviewComponent — Updates text search', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithUpdates(updates: any[]) {
    const state = TestBed.inject(CampaignStudioStateService);
    return { ...state.draft, updates };
  }

  const u1 = { id: 'u1', title: 'עדכון גיוס', date: '2026-01-01', description: 'הגענו ליעד הראשון!', mediaType: 'none', mediaUrl: '', linkUrl: '', linkLabel: '' };
  const u2 = { id: 'u2', title: 'Thank you', date: '2026-01-02', description: 'תודה לכל התורמים', mediaType: 'none', mediaUrl: '', linkUrl: '', linkLabel: '' };
  const u3 = { id: 'u3', title: 'עדכון שלישי', date: '2026-01-03', description: 'תוכן נוסף', mediaType: 'none', mediaUrl: '', linkUrl: '', linkLabel: '' };

  it('13. updates: search matches by title', () => {
    const draft = draftWithUpdates([u1, u2, u3]);
    component.updatesSearch = 'שלישי';
    expect(component.updatesFiltered(draft).map(u => u.id)).toEqual(['u3']);
  });

  it('13. updates: search matches by description', () => {
    const draft = draftWithUpdates([u1, u2, u3]);
    component.updatesSearch = 'תורמים';
    expect(component.updatesFiltered(draft).map(u => u.id)).toEqual(['u2']);
  });

  it('14. updates: Hebrew search works correctly', () => {
    const draft = draftWithUpdates([u1, u2]);
    component.updatesSearch = 'גיוס';
    expect(component.updatesFiltered(draft).map(u => u.id)).toEqual(['u1']);
  });

  it('15. updates: English search is case-insensitive', () => {
    const draft = draftWithUpdates([u1, u2]);
    component.updatesSearch = 'THANK';
    expect(component.updatesFiltered(draft).map(u => u.id)).toEqual(['u2']);
  });

  it('16. updates: a search with no matches produces an empty filtered collection, not an error', () => {
    const draft = draftWithUpdates([u1, u2]);
    component.updatesSearch = 'שזה-לא-קיים-בשום-מקום';
    expect(component.updatesFiltered(draft).length).toBe(0);
  });

  it('draft updates (status not "published") are excluded from search results, same as from publishedUpdates()', () => {
    const draftOnly = { ...u1, id: 'u4', status: 'draft' };
    const draft = draftWithUpdates([draftOnly, u2]);
    component.updatesSearch = 'עדכון';
    expect(component.updatesFiltered(draft).map(u => u.id)).not.toContain('u4');
  });

  it('17. clearing the search via resetUpdatesSearch restores the full published collection', () => {
    const draft = draftWithUpdates([u1, u2, u3]);
    component.updatesSearch = 'שלישי';
    expect(component.updatesFiltered(draft).length).toBe(1);

    component.resetUpdatesSearch();
    expect(component.updatesSearch).toBe('');
    expect(component.updatesFiltered(draft).length).toBe(3);
  });

  it('18/19. changing the search query resets paging back to the first page', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...u1, id: `m${i}`, title: `עדכון ${i}` }));
    const draft = draftWithUpdates(many);
    component.nextUpdatesPage(draft); // now on page 2 (UPDATES_PAGE_SIZE = 3)
    expect(component.canGoPrevUpdates()).toBe(true);

    component.updatesSearch = 'עדכון';
    component.onUpdatesSearchChange();
    expect(component.canGoPrevUpdates()).toBe(false); // back to page 1
  });

  it('a narrowed search collection never leaves the pager stuck on a now-empty page', () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ ...u1, id: `m${i}`, title: `עדכון ${i}` }));
    const draft = draftWithUpdates(many);
    component.nextUpdatesPage(draft); // page 2 of the unfiltered 5
    component.updatesSearch = 'עדכון 0'; // only 1 match after filtering
    component.onUpdatesSearchChange();
    expect(component.visibleUpdates(draft).map(u => u.id)).toEqual(['m0']);
  });

  it('20/21. search works identically for both cards (unpaged slider) and list (paged) presentation inputs', () => {
    const draft = draftWithUpdates([u1, u2, u3]);
    component.updatesSearch = 'עדכון';
    // Cards presentation reads updatesFiltered() directly; list presentation
    // reads visibleUpdates(), which paginates updatesFiltered() -- both must
    // agree on the same underlying matches.
    expect(component.updatesFiltered(draft).map(u => u.id).sort()).toEqual(['u1', 'u3']);
    expect(component.visibleUpdates(draft).map(u => u.id).sort()).toEqual(['u1', 'u3']);
  });
});

// Sidebar filter visibility debug (2026-10-04). A manual QA report said the
// sidebar-compact filter controls were "not visible" after the Public
// Section Filtering work. These tests exercise the REAL rendered DOM (not
// just component methods/state) across every placement x presentation
// combination the report asked about, in both Studio-editing and real
// public-page context (isPublicPage), to either catch a genuine template
// wiring bug or rule one out with evidence instead of guessing.
describe('CampaignPreviewComponent — sidebar filter controls actually render in the DOM', () => {
  function renderWithSidebarSection(
    section: 'ambassadors' | 'donors',
    presentation: 'cards' | 'list',
    isPublicPage: boolean,
  ) {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.componentInstance.isPublicPage = isPublicPage;
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      // isEmpty(draft) short-circuits the ENTIRE page to a "live preview"
      // placeholder unless title/coverImageUrl/videoUrl is set -- a bare
      // createInitialDraft() alone renders nothing past that guard, which
      // is not a real bug, just an unrealistic test fixture.
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '', // avoids ngOnInit's HTTP calls (donors/ambassadors/comments), gated on a truthy slug
      supportersCount: 3,
      layout: {
        ...base.layout,
        layoutMode: 'sidebar-right',
        sidebarSections: [section],
        sectionPresentation: { [section]: presentation } as any,
      },
      blocks: [
        { id: 'blk1', type: section, order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any,
      ],
    });
    fixture.componentInstance.ambassadorsList = [
      { id: 'a1', fullName: 'דנה כהן', slug: 'dana', goalAmount: null, personalMessage: '', raisedTotal: 100, donorCount: 1 },
    ];
    (fixture.componentInstance as any).donors = [
      { name: 'יוסי', amount: 100, completedAt: new Date(), isAnonymous: false, isFirst: false },
    ];
    fixture.detectChanges();
    return fixture;
  }

  it('ambassadors + sidebar + cards: the compact search/sort controls are actually in the rendered DOM', () => {
    const fixture = renderWithSidebarSection('ambassadors', 'cards', false);
    expect(fixture.nativeElement.querySelector('.hm-amb-compact-filters')).withContext('filters row').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-amb-compact-search')).withContext('search input').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-amb-compact-select')).withContext('sort select').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-lb-grid--sidebar')).withContext('cards grid').not.toBeNull();
  });

  it('ambassadors + sidebar + list: the compact search/sort controls are actually in the rendered DOM', () => {
    const fixture = renderWithSidebarSection('ambassadors', 'list', false);
    expect(fixture.nativeElement.querySelector('.hm-amb-compact-filters')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-amb-list-sidebar')).withContext('list rows').not.toBeNull();
  });

  it('donors + sidebar + cards: the compact period/sort controls are actually in the rendered DOM', () => {
    const fixture = renderWithSidebarSection('donors', 'cards', false);
    expect(fixture.nativeElement.querySelector('.hm-donor-compact-filters')).withContext('filters row').not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.hm-donor-compact-select').length).withContext('period + sort selects').toBe(2);
    expect(fixture.nativeElement.querySelector('.hm-donors-grid--sidebar')).withContext('cards grid').not.toBeNull();
  });

  it('donors + sidebar + list: the compact period/sort controls are actually in the rendered DOM', () => {
    const fixture = renderWithSidebarSection('donors', 'list', false);
    expect(fixture.nativeElement.querySelector('.hm-donor-compact-filters')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-donor-list-sidebar')).withContext('list rows').not.toBeNull();
  });

  it('the controls are positioned ABOVE the item list in the DOM, not after it', () => {
    const fixture = renderWithSidebarSection('ambassadors', 'list', false);
    const container = fixture.nativeElement.querySelector('.hm-lb-container');
    const html: string = container.innerHTML;
    expect(html.indexOf('hm-amb-compact-filters')).toBeGreaterThan(-1);
    expect(html.indexOf('hm-amb-compact-filters')).toBeLessThan(html.indexOf('hm-amb-list-sidebar'));
  });

  it('ambassadors: renders correctly on the real public page too (isPublicPage=true), not only the Studio/Builder preview', () => {
    const amb = renderWithSidebarSection('ambassadors', 'list', true);
    expect(amb.nativeElement.querySelector('.hm-amb-compact-filters')).not.toBeNull();
  });

  it('donors: renders correctly on the real public page too (isPublicPage=true), not only the Studio/Builder preview', () => {
    const donors = renderWithSidebarSection('donors', 'list', true);
    expect(donors.nativeElement.querySelector('.hm-donor-compact-filters')).not.toBeNull();
  });

  it('the rendered filter row is actually visible (non-zero size, not display:none)', () => {
    const fixture = renderWithSidebarSection('ambassadors', 'list', false);
    document.body.appendChild(fixture.nativeElement);
    const el = fixture.nativeElement.querySelector('.hm-amb-compact-filters') as HTMLElement;
    const style = getComputedStyle(el);
    expect(style.display).not.toBe('none');
    expect(el.getBoundingClientRect().height).toBeGreaterThan(0);
    document.body.removeChild(fixture.nativeElement);
  });
});

// Rewards + Updates search controls actually render in the DOM (2026-10-05) --
// same reasoning as the ambassadors/donors DOM-render suite above: method-
// level tests alone don't prove the template actually wires up the control.
describe('CampaignPreviewComponent — Rewards/Updates search controls render in the DOM', () => {
  function renderSection(type: 'rewards' | 'updates', inSidebar: boolean, presentation: 'cards' | 'list' | 'image') {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      offeringsEnabled: true,
      offerings: [
        { id: 'o1', title: 'תשורה א', description: '', minimumAmount: 50, stock: null, imageUrl: null },
        { id: 'o2', title: 'תשורה ב', description: '', minimumAmount: 100, stock: null, imageUrl: null },
      ],
      updates: [
        { id: 'u1', title: 'עדכון א', date: '2026-01-01', description: '', mediaType: 'none', mediaUrl: '', linkUrl: '', linkLabel: '' },
      ] as any,
      layout: {
        ...base.layout,
        layoutMode: 'sidebar-right',
        sidebarSections: inSidebar ? [type] : [],
        sectionPresentation: { [type]: presentation } as any,
      },
      blocks: [
        { id: 'blk1', type, order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any,
      ],
    });
    fixture.detectChanges();
    return fixture;
  }

  it('11. rewards: search control renders in main content', () => {
    const fixture = renderSection('rewards', false, 'cards');
    expect(fixture.nativeElement.querySelector('.hm-reward-filter-search')).not.toBeNull();
  });

  it('12. rewards: compact search control renders in sidebar', () => {
    const fixture = renderSection('rewards', true, 'list');
    const row = fixture.nativeElement.querySelector('.hm-reward-filters--compact');
    expect(row).not.toBeNull();
    expect(row.querySelector('.hm-reward-filter-search')).not.toBeNull();
  });

  it('rewards: search control renders identically for cards/list/image presentation', () => {
    for (const presentation of ['cards', 'list', 'image'] as const) {
      const fixture = renderSection('rewards', false, presentation);
      expect(fixture.nativeElement.querySelector('.hm-reward-filter-search')).withContext(presentation).not.toBeNull();
      TestBed.resetTestingModule();
    }
  });

  it('22. updates: search control renders in main content', () => {
    const fixture = renderSection('updates', false, 'list');
    const row = fixture.nativeElement.querySelector('.hm-updates-filters:not(.hm-updates-filters--compact)');
    expect(row).not.toBeNull();
    expect(row.querySelector('.hm-updates-filter-search')).not.toBeNull();
  });

  it('23. updates: compact search control renders in sidebar', () => {
    const fixture = renderSection('updates', true, 'list');
    const row = fixture.nativeElement.querySelector('.hm-updates-filters--compact');
    expect(row).not.toBeNull();
    expect(row.querySelector('.hm-updates-filter-search')).not.toBeNull();
  });

  it('20/21. updates: search control renders identically for cards/list presentation', () => {
    for (const presentation of ['cards', 'list'] as const) {
      const fixture = renderSection('updates', false, presentation);
      expect(fixture.nativeElement.querySelector('.hm-updates-filter-search')).withContext(presentation).not.toBeNull();
      TestBed.resetTestingModule();
    }
  });
});

// Sold-out reward visual treatment (2026-10-06) — a sold-out offering
// (stock reached) gets a dimmed card + a centered "הפריט אזל" pill instead
// of only a small text badge, and can no longer be selected. stock: 0 is
// used directly rather than seeding rewardCounts -- purchasedCount defaults
// to 0, so stock: 0 already satisfies isSoldOut() (0 >= 0) without needing
// to simulate any actual purchases.
describe('CampaignPreviewComponent — sold-out reward visual treatment', () => {
  function renderRewards(presentation: 'cards' | 'list' | 'image', soldOut: boolean) {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      offeringsEnabled: true,
      offerings: [
        { id: 'o1', title: 'תשורה', description: '', minimumAmount: 50, stock: soldOut ? 0 : 5, imageUrl: null },
      ],
      layout: {
        ...base.layout,
        sectionPresentation: { rewards: presentation } as any,
      },
      blocks: [
        { id: 'blk1', type: 'rewards', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any,
      ],
    });
    fixture.detectChanges();
    return fixture;
  }

  it('cards: a sold-out offering gets the dimmed-card class and the "הפריט אזל" pill', () => {
    const fixture = renderRewards('cards', true);
    const card = fixture.nativeElement.querySelector('.hm-reward-card');
    expect(card.classList).toContain('hm-reward-soldout');
    const pill = fixture.nativeElement.querySelector('.hm-reward-soldout-overlay .hm-reward-soldout-pill');
    expect(pill?.textContent?.trim()).toBe('הפריט אזל');
  });

  it('cards: an available offering gets neither the dimmed class nor the pill', () => {
    const fixture = renderRewards('cards', false);
    const card = fixture.nativeElement.querySelector('.hm-reward-card');
    expect(card.classList).not.toContain('hm-reward-soldout');
    expect(fixture.nativeElement.querySelector('.hm-reward-soldout-overlay')).toBeNull();
  });

  it('cards: "לחץ לבחירה" hint is hidden once sold out', () => {
    const fixture = renderRewards('cards', true);
    expect(fixture.nativeElement.textContent).not.toContain('לחץ לבחירה');
  });

  it('image presentation: same dimmed treatment applies', () => {
    const fixture = renderRewards('image', true);
    const card = fixture.nativeElement.querySelector('.hm-reward-card--img');
    expect(card.classList).toContain('hm-reward-soldout');
    expect(fixture.nativeElement.querySelector('.hm-reward-soldout-pill')).not.toBeNull();
  });

  it('list presentation: same dimmed treatment applies, and the "לבחירה" button is hidden', () => {
    const fixture = renderRewards('list', true);
    const card = fixture.nativeElement.querySelector('.hm-reward-list-card');
    expect(card.classList).toContain('hm-reward-soldout');
    expect(fixture.nativeElement.querySelector('.hm-reward-soldout-pill')).not.toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('לבחירה');
  });

  it('clicking a sold-out card does not add it to the cart (selectOffering no-ops)', () => {
    const fixture = renderRewards('cards', true);
    const card: HTMLElement = fixture.nativeElement.querySelector('.hm-reward-card');
    card.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hm-reward-overlay')).toBeNull();
    expect(fixture.componentInstance.isOfferingInCart('o1')).toBe(false);
  });
});

// Post-payment cart/stock staleness fix (2026-10-06) -- "I selected a
// reward, paid, came back to the page, and it was still in the 'continue to
// pay' state even though I already paid; it should also check whether it's
// now sold out." checkout-v2's own [cartOfferings] is never mutated from
// inside checkout, so without onCheckoutPaymentSucceeded() nothing ever
// cleared the just-bought offering out of cartOfferingIds, and rewardCounts
// (loaded once per slug, see ngOnInit's own loadedRewardCountsSlug guard)
// never got a reason to refresh after a purchase actually changed it.
describe('CampaignPreviewComponent — onCheckoutPaymentSucceeded (post-payment staleness fix)', () => {
  let component: CampaignPreviewComponent;
  let donationService: DonationService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
    donationService = TestBed.inject(DonationService);
    // Bypasses ngOnInit's own HTTP cascade (gated on a truthy draft.slug,
    // see other describe blocks' own "slug: ''" convention) -- this
    // interaction only needs loadedSlug populated, not a real page load.
    (component as any).loadedSlug = 'test-campaign';
  });

  it('removes the just-purchased offering from the cart', () => {
    component.selectOffering({ id: 'o1', title: 'תשורה', description: '', minimumAmount: 250, stock: null, imageUrl: null }, {} as any);
    expect(component.isOfferingInCart('o1')).toBe(true);

    spyOn(donationService, 'getRewardCounts').and.returnValue(of({}));
    component.onCheckoutPaymentSucceeded({ offeringIds: ['o1'] });

    expect(component.isOfferingInCart('o1')).toBe(false);
  });

  it('leaves OTHER still-in-cart offerings untouched', () => {
    component.selectOffering({ id: 'o1', title: 'א', description: '', minimumAmount: 250, stock: null, imageUrl: null }, {} as any);
    component.selectOffering({ id: 'o2', title: 'ב', description: '', minimumAmount: 100, stock: null, imageUrl: null }, {} as any);

    spyOn(donationService, 'getRewardCounts').and.returnValue(of({}));
    component.onCheckoutPaymentSucceeded({ offeringIds: ['o1'] });

    expect(component.isOfferingInCart('o1')).toBe(false);
    expect(component.isOfferingInCart('o2')).toBe(true);
  });

  it('refreshes rewardCounts from the server, so a just-sold-out reward is correctly reflected', () => {
    const getSpy = spyOn(donationService, 'getRewardCounts').and.returnValue(of({ o1: 1 }));
    const offering = { id: 'o1', title: 'תשורה', description: '', minimumAmount: 250, stock: 1, imageUrl: null };
    expect(component.isSoldOut(offering)).toBe(false); // stale: purchasedCount defaults to 0

    component.onCheckoutPaymentSucceeded({ offeringIds: ['o1'] });

    expect(getSpy).toHaveBeenCalledWith('test-campaign');
    expect(component.isSoldOut(offering)).toBe(true); // refreshed: purchasedCount(o1) is now 1 >= stock 1
  });
});

// Rewards filter bar visual QA fixes (2026-10-06) -- "the checkbox is huge
// and illogical" + general filter-row tidy-up, reported against a real
// screenshot. The checkbox had no explicit size anywhere, relying entirely
// on unpredictable native/UA rendering.
describe('CampaignPreviewComponent — rewards filter bar visual fixes', () => {
  function renderWithOfferings() {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      offeringsEnabled: true,
      offerings: [{ id: 'o1', title: 'תשורה', description: '', minimumAmount: 50, stock: 5, imageUrl: null }],
      layout: { ...base.layout, sectionPresentation: { rewards: 'cards' } as any },
      blocks: [{ id: 'blk1', type: 'rewards', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any],
    });
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    return fixture;
  }

  afterEach(() => {
    document.querySelectorAll('app-campaign-preview').forEach(el => el.remove());
  });

  it('the "hide sold out" checkbox has an explicit, sane pixel size (not left to native/UA default)', () => {
    const fixture = renderWithOfferings();
    const checkbox = fixture.nativeElement.querySelector('.hm-reward-filter-toggle input[type="checkbox"]') as HTMLElement;
    const style = getComputedStyle(checkbox);
    expect(style.width).toBe('16px');
    expect(style.height).toBe('16px');
  });

  it('the filter row renders as one grouped toolbar (search + select + checkbox all present)', () => {
    const fixture = renderWithOfferings();
    const row = fixture.nativeElement.querySelector('.hm-reward-filters');
    expect(row.querySelector('.hm-reward-filter-search')).not.toBeNull();
    expect(row.querySelector('.hm-reward-filter-select')).not.toBeNull();
    expect(row.querySelector('.hm-reward-filter-toggle')).not.toBeNull();
  });

  // Regression (2026-10-06): .hm-reward-filter-search's own `flex: 1 1 160px`
  // is written assuming the MAIN (row) layout, where flex-basis/grow act on
  // WIDTH. .hm-reward-filters--compact (the sidebar placement) switches to
  // flex-direction:column, making that same declaration apply to HEIGHT
  // instead -- ballooning the search box to 160px+ tall ("the search field
  // is too large"), despite an explicit height:36px sitting right next to it
  // in the base rule (flex-basis wins over the `height` property on the
  // main axis). Must be reset to flex:0 0 auto specifically in compact mode.
  it('the search input keeps a normal, compact height in the sidebar (compact/column) layout, not a flex-basis-inflated one', () => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      offeringsEnabled: true,
      offerings: [{ id: 'o1', title: 'תשורה', description: '', minimumAmount: 50, stock: 5, imageUrl: null }],
      layout: { ...base.layout, layoutMode: 'sidebar-right', sidebarSections: ['rewards'] },
      blocks: [{ id: 'blk1', type: 'rewards', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any],
    });
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);

    const row = fixture.nativeElement.querySelector('.hm-reward-filters--compact');
    expect(row).not.toBeNull();
    const search = row.querySelector('.hm-reward-filter-search') as HTMLElement;
    const height = search.getBoundingClientRect().height;
    expect(height).toBeLessThan(45);

    document.body.removeChild(fixture.nativeElement);
  });
});

// Sidebar section separation (2026-10-06) -- Rewards/Ambassadors/Donors/
// Updates/Sponsors previously went fully transparent + padding:0 once placed
// in the sidebar, relying only on .sidebar-rail-inner's 16px gap to separate
// them -- with no visible boundary of its own, several stacked together read
// as one continuous list instead of distinct sections (reported in visual
// QA). Each now gets the same white-card look .hm-stats/.hm-donate already
// have.
describe('CampaignPreviewComponent — sidebar sections read as distinct cards', () => {
  function renderSidebarSections(sections: Array<'rewards' | 'ambassadors' | 'donors'>) {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    const blocks = sections.map((type, i) => ({
      id: `blk${i}`, type, order: i, visible: true, label: '',
      spacingTop: 0, spacingBottom: 0, data: {},
    } as any));
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      offeringsEnabled: true,
      offerings: [{ id: 'o1', title: 'תשורה', description: '', minimumAmount: 50, stock: null, imageUrl: null }],
      layout: { ...base.layout, layoutMode: 'sidebar-right', sidebarSections: sections },
      blocks,
    });
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    return fixture;
  }

  afterEach(() => {
    document.querySelectorAll('app-campaign-preview').forEach(el => el.remove());
  });

  it('rewards gets a solid white card background in the sidebar, not transparent', () => {
    const fixture = renderSidebarSections(['rewards']);
    const section = fixture.nativeElement.querySelector('.hm-rewards--sidebar-list') as HTMLElement;
    expect(getComputedStyle(section).backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('ambassadors and donors also get a solid white card background in the sidebar', () => {
    const fixture = renderSidebarSections(['ambassadors', 'donors']);
    const amb = fixture.nativeElement.querySelector('.hm-ambassadors--sidebar-list') as HTMLElement;
    const donors = fixture.nativeElement.querySelector('.hm-donors--sidebar-list') as HTMLElement;
    expect(getComputedStyle(amb).backgroundColor).toBe('rgb(255, 255, 255)');
    expect(getComputedStyle(donors).backgroundColor).toBe('rgb(255, 255, 255)');
  });

  it('each sidebar section has its own visible border, giving a distinct boundary between stacked sections', () => {
    const fixture = renderSidebarSections(['rewards', 'ambassadors', 'donors']);
    for (const cls of ['.hm-rewards--sidebar-list', '.hm-ambassadors--sidebar-list', '.hm-donors--sidebar-list']) {
      const el = fixture.nativeElement.querySelector(cls) as HTMLElement;
      const style = getComputedStyle(el);
      expect(style.borderStyle).withContext(cls).toBe('solid');
      expect(style.borderWidth).withContext(cls).not.toBe('0px');
    }
  });
});

// Sidebar natural page scroll (2026-10-05). The sidebar rail previously had a
// FIXED height (calc(100vh - 32px)) with its own overflow-y:auto inner
// scroller -- content past that boundary was clipped, not hidden-but-
// reachable, which is exactly what made Ambassadors/Donors "disappear" in
// visual QA even though the template rendering itself was always correct
// (see the previous describe block). These tests assert directly on the
// computed style/layout geometry that trapped the content, not just on
// template presence.
describe('CampaignPreviewComponent — sidebar has no internal scroll container', () => {
  function renderTallSidebar(sections: Array<'ambassadors' | 'donors' | 'rewards' | 'updates'>) {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    // Explicit, not assumed -- a per-test device-mode default guards this
    // suite against any cross-test StudioUiService state leakage regardless
    // of Jasmine's actual run order.
    TestBed.inject(StudioUiService).setDevice('desktop');
    const base = state.draft;
    const blocks = sections.map((type, i) => ({
      id: `blk${i}`, type, order: i, visible: true, label: '',
      spacingTop: 0, spacingBottom: 0, data: {},
    } as any));
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      supportersCount: 3,
      offeringsEnabled: true,
      offerings: Array.from({ length: 6 }, (_, i) => ({
        id: `o${i}`, title: `תשורה ${i}`, description: '', minimumAmount: 50, stock: null, imageUrl: null,
      })),
      layout: { ...base.layout, layoutMode: 'sidebar-right', sidebarSections: sections },
      blocks,
    });
    // Enough ambassadors that an old viewport-height-constrained rail would
    // have clipped most of them -- real regression signal, not a token count.
    fixture.componentInstance.ambassadorsList = Array.from({ length: 30 }, (_, i) => ({
      id: `a${i}`, fullName: `שגריר ${i}`, slug: `a${i}`, goalAmount: null,
      personalMessage: '', raisedTotal: i * 10, donorCount: i,
    }));
    (fixture.componentInstance as any).donors = Array.from({ length: 30 }, (_, i) => ({
      name: `תורם ${i}`, amount: 50, completedAt: new Date(), isAnonymous: false, isFirst: false,
    }));
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);
    return fixture;
  }

  afterEach(() => {
    document.querySelectorAll('app-campaign-preview').forEach(el => el.remove());
  });

  it('1/2. .sidebar-rail-inner no longer has its own overflow-y:auto/scroll scroller', () => {
    const fixture = renderTallSidebar(['ambassadors']);
    const inner = fixture.nativeElement.querySelector('.sidebar-rail-inner') as HTMLElement;
    const style = getComputedStyle(inner);
    expect(['auto', 'scroll']).not.toContain(style.overflowY);
  });

  it('1. .sidebar-rail is no longer clipped to a fixed viewport height', () => {
    const fixture = renderTallSidebar(['ambassadors']);
    const rail = fixture.nativeElement.querySelector('.sidebar-rail') as HTMLElement;
    expect(getComputedStyle(rail).overflowY).not.toBe('hidden');
  });

  it('1/2/3. a long ambassador list is NOT clipped -- nothing is hidden past an internal scroll boundary (scrollHeight === clientHeight)', () => {
    const fixture = renderTallSidebar(['ambassadors']);
    const inner = fixture.nativeElement.querySelector('.sidebar-rail-inner') as HTMLElement;
    // If an internal scroller still existed, scrollHeight (full content) would
    // exceed clientHeight (visible viewport) for a 30-item list. Equal means
    // every ambassador is actually laid out in the page's own flow.
    expect(inner.scrollHeight).toBe(inner.clientHeight);
  });

  it('4/5. ambassadors AND donors AND rewards all render together in the sidebar, none clipped out', () => {
    const fixture = renderTallSidebar(['ambassadors', 'donors', 'rewards']);
    expect(fixture.nativeElement.querySelector('.hm-ambassadors')).withContext('ambassadors section').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-donors')).withContext('donors section').not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-rewards')).withContext('rewards section').not.toBeNull();
    const inner = fixture.nativeElement.querySelector('.sidebar-rail-inner') as HTMLElement;
    expect(inner.scrollHeight).toBe(inner.clientHeight);
  });

  it('6. compact sidebar filters remain rendered even with a tall, multi-section sidebar', () => {
    const fixture = renderTallSidebar(['ambassadors', 'donors']);
    expect(fixture.nativeElement.querySelector('.hm-amb-compact-filters')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.hm-donor-compact-filters')).not.toBeNull();
  });

  it('7. Section Presentation (cards) still renders correctly once the rail is unconstrained', () => {
    const fixture = renderTallSidebar(['ambassadors']);
    const state = TestBed.inject(CampaignStudioStateService);
    state.patch({ layout: { ...state.draft.layout, sectionPresentation: { ambassadors: 'cards' } } });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hm-lb-grid--sidebar')).not.toBeNull();
  });

  // Desktop position:sticky itself is NOT asserted here -- Karma's headless
  // Chrome window width is narrower than the 768px breakpoint, so the
  // pre-existing `@media (max-width: 768px) { .sidebar-rail { position:
  // static } }` rule legitimately matches regardless of StudioUiService's
  // device mode, making position:sticky un-testable reliably from this
  // runner. The .css source change itself (position: sticky kept, only
  // height/overflow-y removed from the BASE rule, the media-query rules
  // untouched) is the actual guarantee here; see the final report's "still
  // requires human visual QA" note for confirming this on a real desktop width.

  it('mobile: sidebar stacking is untouched -- still position:static, height:auto', () => {
    const fixture = renderTallSidebar(['ambassadors']);
    const ui = TestBed.inject(StudioUiService);
    ui.setDevice('mobile');
    fixture.detectChanges();
    const rail = fixture.nativeElement.querySelector('.sidebar-rail') as HTMLElement;
    expect(getComputedStyle(rail).position).toBe('static');
  });
});

// Sticky Platform Top Strip (2026-10-06) -- .hm-sticky-header (this
// component's own nav) must stick just below the Platform Top Strip
// (platform-top-strip.component.css's .pts-strip, mounted by the parent
// page component above this one), not at the viewport's very top, or the
// two would overlap once both are stuck. The exact pixel value (34px
// desktop / 28px mobile) matches .pts-strip's own height at each
// breakpoint -- unlike .sidebar-rail's media-query-gated sticky (see the
// describe block above), this isn't conditioned on any device-mode class,
// so it's reliably testable regardless of this runner's real viewport width.
describe('CampaignPreviewComponent — sticky header offset below the Platform Top Strip', () => {
  it('.hm-sticky-header stays position:sticky with a positive top offset (not top:0, which would overlap the Top Strip)', () => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    const state = TestBed.inject(CampaignStudioStateService);
    state.patch({ title: 'קמפיין בדיקה', coverImageUrl: 'https://example.com/cover.jpg', slug: '' });
    fixture.detectChanges();
    document.body.appendChild(fixture.nativeElement);

    const header = fixture.nativeElement.querySelector('.hm-sticky-header') as HTMLElement;
    const style = getComputedStyle(header);
    expect(style.position).toBe('sticky');
    expect([34, 28]).toContain(parseFloat(style.top));

    document.body.removeChild(fixture.nativeElement);
  });
});

// Section text overrides — Donate/Stats/Donors Phase 1 (2026-10-06,
// "Style → Theme → Section override" model, confirmed with the user).
// theme.secondaryColor/bodyTextColor are MANDATORY fields (never undefined,
// always seeded by createInitialDraft()) -- these tests specifically prove
// the "untouched campaign looks pixel-identical" guarantee: a freshly
// resolver call with the known legacy literal must return null (no inline
// override), and only a GENUINELY customized value gets applied.
describe('CampaignPreviewComponent — Donate/Stats/Donors section text overrides', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithTheme(themePartial: Record<string, any>) {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    return { ...base, layout: { ...base.layout, theme: { ...base.layout.theme, ...themePartial } } };
  }

  it('sectionBodyTextColor returns null (no override) when bodyTextColor is still at its own known untouched default', () => {
    const draft = draftWithTheme({ bodyTextColor: '#334155' });
    expect(component.sectionBodyTextColor(draft)).toBeNull();
  });

  it('sectionBodyTextColor returns the real value once bodyTextColor has genuinely diverged from default', () => {
    const draft = draftWithTheme({ bodyTextColor: '#1a1a1a' });
    expect(component.sectionBodyTextColor(draft)).toBe('#1a1a1a');
  });

  it('statsTitleColor: an explicit block titleColor always wins outright', () => {
    const draft = draftWithTheme({ secondaryColor: '#6fc9eb' }); // untouched default
    expect(component.statsTitleColor(draft, '#ff0000')).toBe('#ff0000');
  });

  it('statsTitleColor returns null when unset AND secondaryColor is still at its own known untouched default (Stats\' title was pure hardcoded CSS before this feature -- must not suddenly follow the theme)', () => {
    const draft = draftWithTheme({ secondaryColor: '#6fc9eb' });
    expect(component.statsTitleColor(draft, undefined)).toBeNull();
  });

  it('statsTitleColor falls back to the real secondaryColor once it has genuinely diverged from default', () => {
    const draft = draftWithTheme({ secondaryColor: '#123456' });
    expect(component.statsTitleColor(draft, undefined)).toBe('#123456');
  });

  // ── DOM-level: Donate ──
  function renderDonate(donationWidgetData: any, themePartial: Record<string, any> = {}) {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      offeringsEnabled: false,
      layout: { ...base.layout, theme: { ...base.layout.theme, ...themePartial } },
      blocks: [{ id: 'blk1', type: 'donation-widget', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: donationWidgetData } as any],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    return fixture;
  }

  const donateData = { title: '', subtitle: 'תמכו בנו', ctaLabel: '', ctaIcon: '', ctaColor: '', showSecurityBadge: true, showPaymentLogos: false, paymentLogos: [] };

  it('Donate h2: titleColor unset -- resolves to the exact same secondaryColor default the CSS var used to supply (now via the shared resolver, Phase B1 -- same pixel, now inline like every other migrated sectionTitle role)', () => {
    const fixture = renderDonate({ ...donateData, titleColor: undefined });
    const h2 = fixture.nativeElement.querySelector('.hm-donate h2') as HTMLElement;
    expect(h2.style.color).toContain('111, 201, 235'); // #6fc9eb
  });

  it('Donate h2: an explicit titleColor is applied as an inline style', () => {
    const fixture = renderDonate({ ...donateData, titleColor: '#ff0000' });
    const h2 = fixture.nativeElement.querySelector('.hm-donate h2') as HTMLElement;
    expect(h2.style.color).toContain('255, 0, 0');
  });

  it('Donate subtitle: untouched bodyTextColor leaves the hardcoded CSS gray in place (no inline override)', () => {
    const fixture = renderDonate(donateData, { bodyTextColor: '#334155' });
    const subtitle = fixture.nativeElement.querySelector('.hm-donate-subtitle') as HTMLElement;
    expect(subtitle.style.color).toBe('');
  });

  it('Donate subtitle: a genuinely customized bodyTextColor is applied inline', () => {
    const fixture = renderDonate(donateData, { bodyTextColor: '#1a1a1a' });
    const subtitle = fixture.nativeElement.querySelector('.hm-donate-subtitle') as HTMLElement;
    expect(subtitle.style.color).toContain('26, 26, 26');
  });

  // ── DOM-level: Stats ──
  function renderStats(statsData: any) {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      blocks: [{ id: 'blk1', type: 'stats', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: statsData } as any],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    return fixture;
  }

  const statsData = { items: [], style: 'cards', size: 'md', iconColor: '', backgroundColor: '', borderColor: '', borderRadius: 12 };

  it('Stats "גויס עד כה" title: no inline color when both titleColor and secondaryColor are untouched -- legacy hardcoded gray renders through', () => {
    const fixture = renderStats({ ...statsData, titleColor: undefined });
    const title = fixture.nativeElement.querySelector('.hm-raised-title') as HTMLElement;
    expect(title.style.color).toBe('');
  });

  it('Stats "גויס עד כה" title: an explicit titleColor is applied inline', () => {
    const fixture = renderStats({ ...statsData, titleColor: '#00ff00' });
    const title = fixture.nativeElement.querySelector('.hm-raised-title') as HTMLElement;
    expect(title.style.color).toContain('0, 255, 0');
  });

  // ── DOM-level: Donors (title + list/cards name consistency fix) ──
  function renderDonors(donorsData: any) {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      blocks: [{ id: 'blk1', type: 'donors', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: donorsData } as any],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    (fixture.componentInstance as any).donors = [
      { name: 'ישראל ישראלי', amount: 100, completedAt: new Date(), isAnonymous: false, isFirst: false },
    ];
    fixture.detectChanges();
    return fixture;
  }

  const donorsData = { viewMode: 'grid' };

  it('Donors title: no inline color when titleColor is unset -- existing primaryColor(draft) binding is preserved', () => {
    const fixture = renderDonors({ ...donorsData, titleColor: undefined });
    const h2 = fixture.nativeElement.querySelector('.hm-section-title') as HTMLElement;
    expect(h2.style.color).toContain('111, 201, 235'); // #6fc9eb, the default secondaryColor -- already theme-bound pre-feature
  });

  it('Donors title: an explicit titleColor overrides the theme default', () => {
    const fixture = renderDonors({ ...donorsData, titleColor: '#ff00ff' });
    const h2 = fixture.nativeElement.querySelector('.hm-section-title') as HTMLElement;
    expect(h2.style.color).toContain('255, 0, 255');
  });

  it('Donors donor name now has the SAME color source in both Cards and List presentation (consistency fix)', () => {
    const cardsFixture = renderDonors({ ...donorsData });
    const cardsName = cardsFixture.nativeElement.querySelector('.hm-donor-v2-name') as HTMLElement;
    expect(cardsName.style.color).toContain('111, 201, 235'); // already theme-bound before this fix

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const state2 = TestBed.inject(CampaignStudioStateService);
    const base2 = state2.draft;
    state2.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      layout: { ...base2.layout, sectionPresentation: { donors: 'list' } as any },
      blocks: [{ id: 'blk1', type: 'donors', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: donorsData } as any],
    });
    const listFixture = TestBed.createComponent(CampaignPreviewComponent);
    (listFixture.componentInstance as any).donors = [
      { name: 'ישראל ישראלי', amount: 100, completedAt: new Date(), isAnonymous: false, isFirst: false },
    ];
    listFixture.detectChanges();
    const listName = listFixture.nativeElement.querySelector('.hm-donor-list-name') as HTMLElement;
    // Was previously hardcoded #0f2747 with NO inline binding at all -- this
    // is the actual behavior change the consistency fix introduces,
    // confirmed explicitly with the user beforehand.
    expect(listName.style.color).toContain('111, 201, 235');
  });
});

// Typography Phase A (2026-10) -- Foundation + proof set (Donors/
// Ambassadors/Stats Text Roles). text-role-resolver.spec.ts already covers
// the shared resolver's own property-level behavior in isolation; these
// tests prove the SECTIONS actually call it consistently (Cards/List,
// Main/Sidebar) and that the titleColor read-side alias still works end to
// end through the real template.
describe('CampaignPreviewComponent — Typography Phase A (Donors/Ambassadors/Stats Text Roles)', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithTheme(themePartial: Record<string, any> = {}) {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    return { ...base, layout: { ...base.layout, theme: { ...base.layout.theme, ...themePartial } } };
  }

  // 9a. Donors titleColor legacy alias -- the new textStyles.sectionTitle
  // override takes priority over the old titleColor field, which itself
  // still wins over the gated theme/legacy default (unchanged chain).
  describe('9a. Donors sectionTitle — titleColor legacy alias', () => {
    it('neither set -> legacy secondaryColor default', () => {
      const data = { viewMode: 'grid' } as any;
      expect(component.donorsSectionTitleColor(draftWithTheme(), data)).toBe('#6fc9eb');
    });
    it('old titleColor set, new textStyles unset -> titleColor wins (alias intact)', () => {
      const data = { viewMode: 'grid', titleColor: '#ff0000' } as any;
      expect(component.donorsSectionTitleColor(draftWithTheme(), data)).toBe('#ff0000');
    });
    it('both set -> the new textStyles.sectionTitle.color wins over the old titleColor', () => {
      const data = { viewMode: 'grid', titleColor: '#ff0000', textStyles: { sectionTitle: { color: '#00ff00' } } } as any;
      expect(component.donorsSectionTitleColor(draftWithTheme(), data)).toBe('#00ff00');
    });
  });

  // 9b. Stats titleColor legacy alias — same chain, via statsSectionTitleColor.
  describe('9b. Stats sectionTitle — titleColor legacy alias', () => {
    it('old titleColor set, new textStyles unset -> titleColor wins (alias intact)', () => {
      const data = { items: [], style: 'cards', size: 'md', iconColor: '', backgroundColor: '', borderColor: '', borderRadius: 12, titleColor: '#ff0000' } as any;
      expect(component.statsSectionTitleColor(draftWithTheme(), data)).toBe('#ff0000');
    });
    it('both set -> the new textStyles.sectionTitle.color wins over the old titleColor', () => {
      const data = { items: [], style: 'cards', size: 'md', iconColor: '', backgroundColor: '', borderColor: '', borderRadius: 12, titleColor: '#ff0000', textStyles: { sectionTitle: { color: '#00ff00' } } } as any;
      expect(component.statsSectionTitleColor(draftWithTheme(), data)).toBe('#00ff00');
    });
  });

  // 10. Untouched-legacy-campaign guarantee — Ambassadors donorCount has NO
  // themeColorField at all, so no theme customization anywhere ever
  // changes it without an explicit Section override.
  it('10. Ambassadors donorCount never reacts to theme changes (pure legacy-literal role)', () => {
    const draft = draftWithTheme({ secondaryColor: '#111111', bodyTextColor: '#222222', accentColor: '#333333' });
    expect(component.ambassadorDonorCountColor(draft, {} as any)).toBe('#0f172a');
  });

  // secondaryMeta, by contrast, DOES gate on bodyTextColor (same mechanism
  // as Donors' donorMeta) -- untouched stays the legacy caption gray, a
  // genuinely diverged bodyTextColor flows through.
  it('secondaryMeta: untouched bodyTextColor -> legacy caption gray; diverged -> theme value', () => {
    expect(component.ambassadorSecondaryMetaColor(draftWithTheme(), {} as any)).toBe('#94a3b8');
    const diverged = draftWithTheme({ bodyTextColor: '#222222' });
    expect(component.ambassadorSecondaryMetaColor(diverged, {} as any)).toBe('#222222');
  });

  it('10b. untouched campaign: every migrated role resolves to its exact pre-Phase-A pixel value', () => {
    const draft = draftWithTheme(); // factory defaults, nothing customized
    expect(component.donorNameColor(draft, {} as any)).toBe('#6fc9eb');
    expect(component.donorAmountColor(draft, {} as any)).toBe('#cc350f');
    expect(component.donorMetaColor(draft, {} as any)).toBe('#94a3b8');
    expect(component.ambassadorsSectionTitleColor(draft, {} as any)).toBe('#6fc9eb');
  });

  // 7b. Ambassadors Cards/List consistency — the REAL fix: both presentations
  // now resolve the SAME ambassadorName/raisedAmount color+weight via the
  // one shared method, instead of each template deciding independently.
  describe('7b. Ambassadors — Cards/List consistency (the actual bug fix)', () => {
    it('ambassadorNameColor: Cards\' old canonical literal, used for BOTH presentations now', () => {
      const draft = draftWithTheme();
      expect(component.ambassadorNameColor(draft, {} as any)).toBe('#0f172a');
    });
    it('ambassadorNameWeight: unifies to 800 (List used to be 700 with zero theme connection)', () => {
      expect(component.ambassadorNameWeight({} as any)).toBe(800);
    });
    it('ambassadorRaisedColor: matches what List already resolved unconditionally (secondaryColor) -- now also applies to Cards', () => {
      const draft = draftWithTheme();
      expect(component.ambassadorRaisedColor(draft, {} as any)).toBe(component.primaryColor(draft));
    });
    it('an explicit raisedAmount override applies identically regardless of which presentation would have rendered it', () => {
      const draft = draftWithTheme();
      const data = { textStyles: { raisedAmount: { color: '#abcdef' } } } as any;
      expect(component.ambassadorRaisedColor(draft, data)).toBe('#abcdef');
    });
  });

  // 7b (DOM-level). Cards vs List presentation of the SAME campaign now
  // render an identical ambassadorName color/weight -- before this phase
  // Cards was #0f172a/800 and List was #0f2747/700 with zero theme
  // connection, a real found inconsistency.
  it('7b (DOM). Ambassadors ambassadorName: Cards and List render the exact same color + weight', () => {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    const amb = [{ id: 'a1', fullName: 'דנה כהן', slug: 'dana', goalAmount: 1000, personalMessage: '', raisedTotal: 500, donorCount: 3 }];

    state.patch({
      title: 'קמפיין בדיקה', coverImageUrl: 'https://example.com/cover.jpg', slug: '',
      layout: { ...base.layout, sectionPresentation: { ambassadors: 'cards' } as any },
      blocks: [{ id: 'blk1', type: 'ambassadors', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any],
    });
    const cardsFixture = TestBed.createComponent(CampaignPreviewComponent);
    cardsFixture.componentInstance.ambassadorsList = amb;
    cardsFixture.detectChanges();
    const cardsName = cardsFixture.nativeElement.querySelector('.hm-lb-card-name') as HTMLElement;
    expect(cardsName.style.color).toContain('15, 23, 42'); // #0f172a
    expect(cardsName.style.fontWeight).toBe('800');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const state2 = TestBed.inject(CampaignStudioStateService);
    const base2 = state2.draft;
    state2.patch({
      title: 'קמפיין בדיקה', coverImageUrl: 'https://example.com/cover.jpg', slug: '',
      layout: { ...base2.layout, sectionPresentation: { ambassadors: 'list' } as any },
      blocks: [{ id: 'blk1', type: 'ambassadors', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any],
    });
    const listFixture = TestBed.createComponent(CampaignPreviewComponent);
    listFixture.componentInstance.ambassadorsList = amb;
    listFixture.detectChanges();
    const listName = listFixture.nativeElement.querySelector('.hm-amb-list-name') as HTMLElement;
    // Was previously hardcoded #0f2747/700 with NO inline binding -- now
    // matches Cards exactly via the shared resolver.
    expect(listName.style.color).toContain('15, 23, 42');
    expect(listName.style.fontWeight).toBe('800');
  });

  // 8. Main/Sidebar consistency — ambassadorsSectionTitleColor/
  // donorsSectionTitleColor take no placement parameter at all, so the
  // Main-column and Sidebar copies of a title can only ever agree.
  it('8. Main/Sidebar consistency: the same role method is called from both placements with identical results', () => {
    const draft = draftWithTheme({ secondaryColor: '#123456' });
    const ambData = { textStyles: { sectionTitle: { color: '#777777' } } } as any;
    const mainResult = component.ambassadorsSectionTitleColor(draft, ambData);
    const sidebarResult = component.ambassadorsSectionTitleColor(draft, ambData); // same call, standing in for the sidebar copy
    expect(mainResult).toBe(sidebarResult);
    expect(mainResult).toBe('#777777');
  });

  // 12. Hero responsive CSS-variable path — heroTitleSize() now feeds a CSS
  // custom property instead of a raw inline font-size, so the
  // @media(max-width:768px) .hm-hero-title rule can win on mobile instead
  // of being defeated by inline-style specificity.
  it('12. Hero title: the resolved size is exposed as --hm-hero-title-size, NOT as an inline font-size', () => {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    state.patch({
      title: 'קמפיין בדיקה',
      coverImageUrl: 'https://example.com/cover.jpg',
      slug: '',
      heroTextStyle: { ...base.heroTextStyle, fontSize: 'xl' },
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    const title = fixture.nativeElement.querySelector('.hm-hero-title') as HTMLElement;
    expect(title.style.fontSize).toBe(''); // no inline font-size left to defeat the mobile media query
    expect(title.style.getPropertyValue('--hm-hero-title-size')).toBe('48px');
  });
});

// Universal Local Styling — Phase B1 (2026-10). Foundation proof on
// Donation/Ambassadors/Stats/CTA. text-role-resolver.spec.ts already covers
// resolveRoleBorderRadius in isolation (categories 1/2/6/7); these tests
// prove the FOUR SECTIONS actually call the shared methods correctly, and
// that an untouched campaign (no surfaceStyles/buttonStyles/progressStyles/
// new Donation textStyles anywhere) keeps its exact current pixel output.
describe('CampaignPreviewComponent — Universal Local Styling Phase B1', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  function draftWithTheme(themePartial: Record<string, any> = {}) {
    const state = TestBed.inject(CampaignStudioStateService);
    const base = state.draft;
    return { ...base, layout: { ...base.layout, theme: { ...base.layout.theme, ...themePartial } } };
  }

  // 8. Donation container styling.
  describe('8. Donation — container surface', () => {
    const data = {} as any;
    it('7. untouched: no inline value at all (explicit-override-only, so conv-hero\'s gradient/radius keep cascading normally)', () => {
      expect(component.donationContainerBackground(data)).toBeNull();
      expect(component.donationContainerBorderColor(data)).toBeNull();
      expect(component.donationContainerBorderRadius(data)).toBeNull();
    });
    it('4. explicit override always wins', () => {
      const overridden = { surfaceStyles: { container: { background: '#fff8e1', borderColor: '#d4a017', borderRadius: 20 } } } as any;
      expect(component.donationContainerBackground(overridden)).toBe('#fff8e1');
      expect(component.donationContainerBorderColor(overridden)).toBe('#d4a017');
      expect(component.donationContainerBorderRadius(overridden)).toBe(20);
    });
  });

  // 9. Donation amount-button styling (incl. selected state).
  describe('9. Donation — amount button', () => {
    it('1/4. property-level inheritance + explicit override, normal and selected state independently', () => {
      const data = { buttonStyles: { amountButton: { background: '#111111' }, amountButtonSelected: { background: '#222222' } } } as any;
      expect(component.donationAmountButtonBackground(data)).toBe('#111111');
      expect(component.donationAmountButtonSelectedBackground(data)).toBe('#222222');
      expect(component.donationAmountButtonTextColor({} as any)).toBeNull();
      expect(component.donationAmountButtonBorderRadius({} as any)).toBeNull();
    });
  });

  // 10. Donation CTA styling — background aliases the existing ctaColor
  // field rather than duplicating it.
  describe('10. Donation — CTA button', () => {
    it('explicit buttonStyles.cta wins over ctaColor/Auto', () => {
      const draft = draftWithTheme({ primaryColor: '#334455' });
      const data = { ctaColor: '#ff0000', buttonStyles: { cta: { background: '#00ff00' } } } as any;
      expect(component.donationCtaBackground(draft, data)).toBe('#00ff00');
    });
    it('no override: falls through to ctaColor, then themePrimaryColor -- unchanged pre-existing chain', () => {
      const draft = draftWithTheme({ primaryColor: '#334455' });
      expect(component.donationCtaBackground(draft, { ctaColor: '#ff0000' } as any)).toBe('#ff0000');
      expect(component.donationCtaBackground(draft, {} as any)).toBe('#334455');
    });
    it('radius has no composition conflict -- resolves through the normal 3-step chain (unlike background/text)', () => {
      const draft = draftWithTheme();
      expect(component.donationCtaBorderRadius(draft, {} as any)).toBe(12);
      expect(component.donationCtaBorderRadius(draft, { buttonStyles: { cta: { borderRadius: 20 } } } as any)).toBe(20);
    });
  });

  // 11. Donation progress styling -- interpreted as the Stats fundraising
  // ring (donation-widget itself has no independent progress visual; see
  // DONATION_ROLE_NOTES in campaign-preview.component.ts).
  describe('11. Donation progress -> Stats ring', () => {
    it('7. untouched: null (conv-hero\'s white ring keeps cascading)', () => {
      expect(component.statsRingTrackColor({} as any)).toBeNull();
      expect(component.statsRingFillColor({} as any)).toBeNull();
    });
    it('4. explicit override wins', () => {
      const data = { progressStyles: { ring: { trackColor: '#eeeeee', fillColor: '#ff6600' } } } as any;
      expect(component.statsRingTrackColor(data)).toBe('#eeeeee');
      expect(component.statsRingFillColor(data)).toBe('#ff6600');
    });
  });

  // 12. Donation Text Roles.
  describe('12. Donation — text roles', () => {
    it('sectionTitle: titleColor legacy alias still intact under the new textStyles key', () => {
      const draft = draftWithTheme();
      expect(component.donationSectionTitleColor(draft, { titleColor: '#ff0000' } as any)).toBe('#ff0000');
      expect(component.donationSectionTitleColor(draft, { textStyles: { sectionTitle: { color: '#00ff00' } }, titleColor: '#ff0000' } as any)).toBe('#00ff00');
    });
    it('totalSum: explicit-only (composition-sensitive, like Stats\' value role)', () => {
      expect(component.donationTotalSumColor({} as any)).toBeNull();
      expect(component.donationTotalSumColor({ textStyles: { totalSum: { color: '#123456' } } } as any)).toBe('#123456');
    });
  });

  // 13. Ambassadors Cards/List semantic style consistency -- the real fix.
  describe('13. Ambassadors — Cards/List surface + button consistency', () => {
    it('card background/borderColor/radius resolve identically regardless of which presentation calls it', () => {
      const draft = draftWithTheme();
      const data = {} as any;
      const cardsResult = component.ambassadorCardBorderColor(data);
      const listResult = component.ambassadorCardBorderColor(data); // same call stands in for the List copy
      expect(cardsResult).toBe(listResult);
      expect(cardsResult).toBe('var(--line, #e2e8f0)');
    });
    it('view button: unifies to the themed background (List no longer hardcoded gray)', () => {
      const draft = draftWithTheme();
      expect(component.ambassadorViewButtonBackground(draft, {} as any)).toBe(component.primaryColor(draft));
      expect(component.ambassadorViewButtonTextColor({} as any)).toBe('#ffffff');
    });
    it('an explicit override applies identically to both presentations', () => {
      const draft = draftWithTheme();
      const data = { buttonStyles: { viewButton: { background: '#abcdef' } } } as any;
      expect(component.ambassadorViewButtonBackground(draft, data)).toBe('#abcdef');
    });
  });

  // 14. Ambassadors Main/Sidebar persistence -- styling lives on block.data,
  // independent of placement, by construction (no placement parameter
  // exists on any of these methods).
  it('14. Ambassadors styling has no placement parameter at all -- Main and Sidebar can only ever agree', () => {
    const draft = draftWithTheme();
    const data = { surfaceStyles: { card: { borderRadius: 22 } } } as any;
    expect(component.ambassadorCardBorderRadius(draft, data)).toBe(22);
  });

  // 15. Stats existing visual fields remain compatible (iconColor/
  // backgroundColor/borderColor untouched by this phase -- only the new
  // progressStyles.ring is additive).
  it('15. Stats existing design fields are untouched by Phase B1 (no new resolver call involved)', () => {
    const data = { iconColor: '#111111', backgroundColor: '#222222', borderColor: '#333333', borderRadius: 10 } as any;
    expect(data.iconColor).toBe('#111111');
    expect(data.backgroundColor).toBe('#222222');
    expect(data.borderColor).toBe('#333333');
    expect(data.borderRadius).toBe(10);
  });

  // 17. CTA A / CTA B independent styling -- two plain data objects standing
  // in for two block instances never share state (pure functions).
  it('17. two independent CTA blocks never collide', () => {
    const ctaA = { ctaConfig: { color: '#d4a017' }, buttonStyles: { main: { background: '#d4a017' } } } as any;
    const ctaB = { ctaConfig: { color: '#7a1f3d' } } as any; // untouched -- falls back to ctaConfig.color
    expect(component.ctaButtonBackground(ctaA)).toBe('#d4a017');
    expect(component.ctaButtonBackground(ctaB)).toBe('#7a1f3d');
  });
});

// Donation Amount Button Presets (2026-10) -- the focused follow-up to
// Phase B1. Precedence: explicit B1 property override > explicit preset >
// nothing (composition CSS/legacy literal keeps cascading).
describe('CampaignPreviewComponent — Donation Amount Button Presets', () => {
  let component: CampaignPreviewComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    component = fixture.componentInstance;
  });

  // 1 / 18. undefined preset -- every new method returns null, so nothing
  // is injected inline and conv-hero/conv-compact's own CSS keeps cascading
  // exactly as before this feature existed (same explicit-override-only
  // rule as the rest of Donation's B1 roles).
  it('1/18. undefined preset: every resolver method returns null (composition CSS untouched)', () => {
    const data = {} as any;
    expect(component.donationAmountButtonBackground(data)).toBeNull();
    expect(component.donationAmountButtonTextColor(data)).toBeNull();
    expect(component.donationAmountButtonBorderColor(data)).toBeNull();
    expect(component.donationAmountButtonSelectedBorderColor(data)).toBeNull();
    expect(component.donationAmountButtonBorderRadius(data)).toBeNull();
    expect(component.donationAmountButtonMinHeight(data)).toBeNull();
    expect(component.donationAmountButtonPaddingBlock(data)).toBeNull();
    expect(component.donationAmountButtonPaddingInline(data)).toBeNull();
    expect(component.donationAmountButtonFontSize(data)).toBeNull();
    expect(component.donationAmountButtonFontWeight(data)).toBeNull();
    expect(component.donationAmountButtonBorderWidth(data)).toBeNull();
    expect(component.donationAmountButtonShadow(data)).toBeNull();
    expect(component.donationAmountButtonSelectedShadow(data)).toBeNull();
  });

  // 2-8. Each preset resolves its own real values.
  const presets: Array<[string, string]> = [
    ['subtle', '#ffffff'], ['solid', '#ffffff'], ['soft', '#f1f5f9'], ['card', '#ffffff'],
    ['pill', '#ffffff'], ['minimal', 'transparent'], ['prominent', '#ffffff'],
  ];
  for (const [preset, expectedBackground] of presets) {
    it(`resolves the "${preset}" preset's own background/radius/selected-state`, () => {
      const data = { amountButtonPreset: preset } as any;
      expect(component.donationAmountButtonBackground(data)).toBe(expectedBackground);
      expect(component.donationAmountButtonBorderRadius(data)).not.toBeNull();
      expect(component.donationAmountButtonSelectedBackground(data)).not.toBeNull();
    });
  }

  // 9 (behavioral). Selected state actually differs from normal state for
  // a representative preset.
  it('9. selected state is visually distinct from the normal state (card preset)', () => {
    const data = { amountButtonPreset: 'card' } as any;
    const normalBorder = component.donationAmountButtonBorderColor(data);
    const selectedBorder = component.donationAmountButtonSelectedBorderColor(data);
    expect(normalBorder).not.toBe(selectedBorder);
  });

  // 10. Explicit B1 background override beats the preset's own background.
  it('10. explicit buttonStyles.amountButton.background wins over the preset', () => {
    const data = { amountButtonPreset: 'solid', buttonStyles: { amountButton: { background: '#ff00ff' } } } as any;
    expect(component.donationAmountButtonBackground(data)).toBe('#ff00ff');
    // Sizing/padding/etc. still come from the preset -- the override is
    // property-level, not a blanket replacement.
    expect(component.donationAmountButtonMinHeight(data)).toBe(46);
  });

  // 11. Explicit B1 border-radius override beats the preset's own radius.
  it('11. explicit buttonStyles.amountButton.borderRadius wins over the preset', () => {
    const data = { amountButtonPreset: 'pill', buttonStyles: { amountButton: { borderRadius: 4 } } } as any;
    expect(component.donationAmountButtonBorderRadius(data)).toBe(4);
    expect(component.donationAmountButtonBackground(data)).toBe('#ffffff'); // preset's own, untouched
  });

  // 16. Amount buttons were never Style-token-driven before this feature
  // (unlike Donation's container, which uses cards.radius) -- confirming a
  // Campaign Style change has no effect either way when no preset/override
  // is set is the correct "no regression" shape of this check here.
  it('16. no preset set: resolved values are identical regardless of Campaign Style (no Style-token coupling was ever introduced for amount buttons)', () => {
    const untouched = {} as any;
    expect(component.donationAmountButtonBorderRadius(untouched)).toBeNull();
    expect(component.donationAmountButtonBackground(untouched)).toBeNull();
  });
});
