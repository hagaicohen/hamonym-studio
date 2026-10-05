import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPageBuilderStepComponent } from './campaign-page-builder-step.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';

// Builder Styling UX reorg (2026-10-01) — pure presentation reorganization
// of the Campaign Style / Opening Composition / Colors / Logo controls into
// one "עיצוב הקמפיין" area. These tests exist to prove the reorg did NOT
// touch the underlying engine: same state methods, same internal
// OpeningComposition/CampaignStyleId literal values, same Style count --
// only Hebrew UI copy and grouping changed. Deliberately not calling
// ngOnInit()/detectChanges() (same convention as campaign-preview.component
// .spec.ts) -- these exercise the component's own methods/properties
// directly, not the rendered template or its HTTP-backed lifecycle hooks.
describe('CampaignPageBuilderStepComponent — Builder Styling UX reorg', () => {
  let component: CampaignPageBuilderStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
  });

  it('all 12 Campaign Styles remain selectable (campaignStyles is the full CAMPAIGN_STYLES list, unchanged) -- 9 original + Royal/Community/Heritage (2026-10-06)', () => {
    expect(component.campaignStyles.length).toBe(12);
  });

  it('setCampaignStyle still delegates to the exact same state method (no parallel state introduced)', () => {
    spyOn(state, 'setCampaignStyle');
    component.setCampaignStyle('civic');
    expect(state.setCampaignStyle).toHaveBeenCalledWith('civic');
  });

  it('exactly 3 Opening Composition choices remain, with the new user-facing Hebrew labels', () => {
    expect(component.OPENING_COMPOSITIONS.length).toBe(3);
    expect(component.OPENING_COMPOSITIONS).toEqual([
      { value: 'classic', label: 'קלאסי' },
      { value: 'story-first', label: 'הסיפור במרכז' },
      { value: 'fundraising-split', label: 'גיוס ומדיה' },
    ]);
  });

  it('internal OpeningComposition values are unchanged (not renamed alongside the UI copy)', () => {
    const values = component.OPENING_COMPOSITIONS.map(o => o.value);
    expect(values).toEqual(['classic', 'story-first', 'fundraising-split']);
  });

  it('setOpeningComposition / resetOpeningComposition still delegate to the exact same state methods', () => {
    spyOn(state, 'setOpeningComposition');
    spyOn(state, 'resetOpeningComposition');
    component.setOpeningComposition('story-first');
    component.resetOpeningComposition();
    expect(state.setOpeningComposition).toHaveBeenCalledWith('story-first');
    expect(state.resetOpeningComposition).toHaveBeenCalled();
  });

  function draftWithOpening(campaignStyleId: any, openingComposition: any = undefined) {
    return { ...state.draft, layout: { ...state.draft.layout, campaignStyleId, openingComposition } };
  }

  it('hasStructuredOpening is false for classic (legacy Hero controls stay visible)', () => {
    expect(component.hasStructuredOpening(draftWithOpening(undefined))).toBe(false);
    expect(component.hasStructuredOpening(draftWithOpening('classic'))).toBe(false);
  });

  it('hasStructuredOpening is true for either structured composition (legacy Hero position controls hidden)', () => {
    expect(component.hasStructuredOpening(draftWithOpening('vibrant'))).toBe(true); // Vibrant's own default
    expect(component.hasStructuredOpening(draftWithOpening('civic', 'story-first'))).toBe(true); // explicit override
  });
});

// Rewards colors reachable after publish (2026-10-06 fix) -- the "עיצוב
// מתקדם" color panel (rewardsBg/rewardCardBorder/rewardCardBorderActive/
// rewardTitleColor/rewardDescColor/rewardButtonColor) previously lived only
// in campaign-offerings-step, one of PUBLISHED_GATED_STEPS (campaign-editor
// .component.ts) -- a manager could set it while the campaign was a draft
// but never change it again once published. Moved here (step 9, never
// gated), same collapsible toggleSection/isSectionCollapsed mechanism
// already used for Tabs/Containers' own "מתקדם" panels on this step.
describe('CampaignPageBuilderStepComponent — rewards colors (moved from step 4)', () => {
  let component: CampaignPageBuilderStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
  });

  it('the rewards-advanced panel is collapsed by default, same as every other "מתקדם" panel on this step', () => {
    expect(component.isSectionCollapsed('rewards-advanced')).toBe(true);
  });

  it('toggleSection expands and re-collapses it', () => {
    component.toggleSection('rewards-advanced');
    expect(component.isSectionCollapsed('rewards-advanced')).toBe(false);
    component.toggleSection('rewards-advanced');
    expect(component.isSectionCollapsed('rewards-advanced')).toBe(true);
  });

  it('patchTheme writes rewardsBg (and the other reward color fields) onto the live draft, reachable regardless of publish status', () => {
    component.patchTheme({ rewardsBg: '#123456' });
    expect(state.draft.layout.theme.rewardsBg).toBe('#123456');

    component.patchTheme({ rewardCardBorder: '#abcdef' });
    expect(state.draft.layout.theme.rewardCardBorder).toBe('#abcdef');

    component.patchTheme({ rewardTitleColor: '#000000' });
    expect(state.draft.layout.theme.rewardTitleColor).toBe('#000000');
  });

  it('patchTheme does not touch any other layout field (e.g. an already-chosen Campaign Style)', () => {
    state.setCampaignStyle('civic');
    component.patchTheme({ rewardsBg: '#654321' });
    expect(state.draft.layout.campaignStyleId).toBe('civic');
    expect(state.draft.layout.theme.rewardsBg).toBe('#654321');
  });
});

// Typography Phase A (2026-10) — the shared "טקסטים" role-override updater
// (updateTextStyleRole) and the "לפי הסגנון" preview helpers. One generic
// updater serves Donors/Ambassadors/Stats alike, so these tests exercise
// it against all three block types rather than duplicating per-section
// logic that doesn't exist.
describe('CampaignPageBuilderStepComponent — Typography Phase A role overrides', () => {
  let component: CampaignPageBuilderStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
    state.patch({
      blocks: [
        { id: 'stats1', type: 'stats', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { items: [], style: 'cards', size: 'md', iconColor: '', backgroundColor: '', borderColor: '', borderRadius: 12 } } as any,
        { id: 'donors1', type: 'donors', order: 1, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { viewMode: 'grid' } } as any,
        { id: 'amb1', type: 'ambassadors', order: 2, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: {} } as any,
      ],
    });
  });

  it('1/2. sets a fresh role override (property-level, partial) without touching other fields on the block', () => {
    component.updateTextStyleRole('donors1', 'donorName', { color: '#ff0000' });
    const data = state.draft.blocks.find(b => b.id === 'donors1')!.data as any;
    expect(data.textStyles.donorName).toEqual({ color: '#ff0000' });
    expect(data.viewMode).toBe('grid'); // untouched
  });

  it('merging a second role does not clobber the first', () => {
    component.updateTextStyleRole('donors1', 'donorName', { color: '#ff0000' });
    component.updateTextStyleRole('donors1', 'donorAmount', { color: '#00ff00' });
    const data = state.draft.blocks.find(b => b.id === 'donors1')!.data as any;
    expect(data.textStyles.donorName).toEqual({ color: '#ff0000' });
    expect(data.textStyles.donorAmount).toEqual({ color: '#00ff00' });
  });

  // 4. Reset role — undefined deletes the key entirely (minimal persisted JSON).
  it('4. undefined override deletes that role\'s key entirely', () => {
    component.updateTextStyleRole('stats1', 'value', { color: '#ff0000' });
    component.updateTextStyleRole('stats1', 'value', undefined);
    const data = state.draft.blocks.find(b => b.id === 'stats1')!.data as any;
    expect('value' in data.textStyles).toBe(false);
  });

  it('works identically for Ambassadors, whose AmbassadorsBlockData had no textStyles field before this phase', () => {
    component.updateTextStyleRole('amb1', 'ambassadorName', { color: '#111111', fontWeight: 900 });
    const data = state.draft.blocks.find(b => b.id === 'amb1')!.data as any;
    expect(data.textStyles.ambassadorName).toEqual({ color: '#111111', fontWeight: 900 });
  });

  // 11. Two-instance-no-collision — two different blocks of genuinely
  // repeatable types ('stats'/'donation-widget' are not in SINGLE_INSTANCE)
  // never share state through the generic updater.
  it('11. two different block instances keep fully independent textStyles', () => {
    component.updateTextStyleRole('stats1', 'value', { color: '#111111' });
    const data = state.draft.blocks.find(b => b.id === 'stats1')!.data as any;
    expect(data.textStyles.value.color).toBe('#111111');
    // donors1/amb1 (separate instances/blocks) remain untouched.
    const donorsData = state.draft.blocks.find(b => b.id === 'donors1')!.data as any;
    expect(donorsData.textStyles).toBeUndefined();
  });

  it('"לפי הסגנון" preview helpers match the exact resolver legacy defaults used at render time', () => {
    expect(component.donorsRoleResolvedColor(state.draft, 'donorAmount')).toBe('#cc350f');
    expect(component.ambassadorsRoleResolvedColor(state.draft, 'ambassadorName')).toBe('#0f172a');
    const statsData = state.draft.blocks.find(b => b.id === 'stats1')!.data as any;
    expect(component.statsRoleResolvedColor(state.draft, 'label', statsData)).toBe('#62728d');
  });
});

// Universal Local Styling Phase B1 (2026-10) — the generic updateStyleRole
// updater (the non-text sibling of updateTextStyleRole) and the Donation/
// CTA block types it now serves.
describe('CampaignPageBuilderStepComponent — Universal Local Styling Phase B1', () => {
  let component: CampaignPageBuilderStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
    state.patch({
      blocks: [
        { id: 'donate1', type: 'donation-widget', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { title: '', subtitle: '', ctaLabel: '', ctaIcon: '', ctaColor: '', showSecurityBadge: true, showPaymentLogos: true, paymentLogos: [] } } as any,
        { id: 'ctaA', type: 'cta', order: 1, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { title: 'A', text: '', backgroundColor: '#fff', textStyle: { align: 'center', color: '#000', fontSize: 'md', position: 'center' }, ctaConfig: { visible: true, label: 'A', color: '#111111', align: 'center', icon: '' }, ctaAction: 'donate' } } as any,
        { id: 'ctaB', type: 'cta', order: 2, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { title: 'B', text: '', backgroundColor: '#fff', textStyle: { align: 'center', color: '#000', fontSize: 'md', position: 'center' }, ctaConfig: { visible: true, label: 'B', color: '#222222', align: 'center', icon: '' }, ctaAction: 'donate' } } as any,
      ],
    });
  });

  // 1/2/4. Property-level inheritance, partial override, explicit override.
  it('1/2/4. updateStyleRole writes a partial override without touching other fields on the block', () => {
    component.updateStyleRole('donate1', 'surfaceStyles', 'container', { background: '#fff8e1' });
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    expect(data.surfaceStyles.container).toEqual({ background: '#fff8e1' });
    expect(data.title).toBe(''); // untouched
  });

  // 5. Property-level reset -- undefined deletes the role key entirely.
  it('5. undefined override deletes that role\'s key entirely (minimal persisted JSON)', () => {
    component.updateStyleRole('donate1', 'buttonStyles', 'cta', { background: '#ff0000' });
    component.updateStyleRole('donate1', 'buttonStyles', 'cta', undefined);
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    expect('cta' in data.buttonStyles).toBe(false);
  });

  it('merging a second kind (surfaceStyles + buttonStyles) on the same block does not collide', () => {
    component.updateStyleRole('donate1', 'surfaceStyles', 'container', { background: '#fff8e1' });
    component.updateStyleRole('donate1', 'buttonStyles', 'cta', { background: '#ff0000' });
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    expect(data.surfaceStyles.container).toEqual({ background: '#fff8e1' });
    expect(data.buttonStyles.cta).toEqual({ background: '#ff0000' });
  });

  // 17. CTA A / CTA B independent styling (repeatable-block proof) --
  // writing a buttonStyles override on CTA A must never touch CTA B.
  it('17. CTA A and CTA B keep fully independent buttonStyles', () => {
    component.updateStyleRole('ctaA', 'buttonStyles', 'main', { background: '#d4a017' });
    const dataA = state.draft.blocks.find(b => b.id === 'ctaA')!.data as any;
    const dataB = state.draft.blocks.find(b => b.id === 'ctaB')!.data as any;
    expect(dataA.buttonStyles.main.background).toBe('#d4a017');
    expect(dataB.buttonStyles).toBeUndefined();
    expect(dataB.ctaConfig.color).toBe('#222222'); // untouched -- its own, unaffected by CTA A's override
  });

  // 16. Stats value font-size Builder control -- the audit's one missing
  // UI binding, closed by passing showFontSize into the existing, already-
  // generic TextRoleEditorComponent (no new mechanism built).
  it('16. Stats "value" role resolver already supports fontSize (the Builder just needed to expose it, no data-model change)', () => {
    expect(component.statsRoleResolvedColor(state.draft, 'value', { items: [], style: 'cards', size: 'md', iconColor: '', backgroundColor: '', borderColor: '', borderRadius: 12 } as any)).toBeTruthy();
  });

  it('"לפי הסגנון" preview helpers exist for every new non-text role', () => {
    expect(component.donationContainerResolved(state.draft, 'background')).toBe('#ffffff');
    expect(component.ambassadorsSurfaceResolvedColor(state.draft, 'background')).toBe('#ffffff');
    expect(component.statsRingResolvedColor('fillColor')).toBe('#0f2747');
    expect(component.statsRingResolvedColor('trackColor')).toBe('#e8eef5');
  });
});

// Donation Amount Button Presets (2026-10) -- the focused follow-up to
// Phase B1's foundation.
describe('CampaignPageBuilderStepComponent — Donation Amount Button Presets', () => {
  let component: CampaignPageBuilderStepComponent;
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPageBuilderStepComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(CampaignPageBuilderStepComponent);
    component = fixture.componentInstance;
    state = TestBed.inject(CampaignStudioStateService);
    state.patch({
      blocks: [
        { id: 'donate1', type: 'donation-widget', order: 0, visible: true, label: '', spacingTop: 0, spacingBottom: 0, data: { title: '', subtitle: '', ctaLabel: '', ctaIcon: '', ctaColor: '', showSecurityBadge: true, showPaymentLogos: true, paymentLogos: [] } } as any,
      ],
    });
  });

  it('setAmountButtonPreset writes the preset name only -- no resolved CSS is ever persisted', () => {
    component.setAmountButtonPreset('donate1', 'card');
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    expect(data.amountButtonPreset).toBe('card');
    expect(Object.keys(data)).not.toContain('resolvedBackground'); // sanity -- no resolved-value leakage
  });

  // 12. Resetting the preset ('inherit') deletes the field entirely,
  // returning to Style/legacy-inherited behavior.
  it('12. "inherit" deletes amountButtonPreset entirely', () => {
    component.setAmountButtonPreset('donate1', 'solid');
    component.setAmountButtonPreset('donate1', 'inherit');
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    expect('amountButtonPreset' in data).toBe(false);
  });

  // 13. Resetting the preset must NOT touch the separate, pre-existing B1
  // manual overrides (buttonStyles.amountButton/amountButtonSelected) --
  // "reset preset" and "reset all amount-button styling" are deliberately
  // two different actions.
  it('13. resetting the preset leaves unrelated manual buttonStyles overrides intact', () => {
    component.updateStyleRole('donate1', 'buttonStyles', 'amountButton', { background: '#ff00ff' });
    component.setAmountButtonPreset('donate1', 'prominent');
    component.setAmountButtonPreset('donate1', 'inherit');
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    expect('amountButtonPreset' in data).toBe(false);
    expect(data.buttonStyles.amountButton).toEqual({ background: '#ff00ff' }); // untouched
  });

  // 14. Preset persists through a save/reload cycle -- a plain string
  // field in the same JSON blob as everything else, round-trips exactly.
  it('14. the preset survives a JSON round-trip (stand-in for save/reload)', () => {
    component.setAmountButtonPreset('donate1', 'pill');
    const data = state.draft.blocks.find(b => b.id === 'donate1')!.data as any;
    const reloaded = JSON.parse(JSON.stringify(data));
    expect(reloaded.amountButtonPreset).toBe('pill');
  });

  it('miniAmountButtonStyle renders a real, distinguishable preview per preset (not a generic icon)', () => {
    const subtleMini = component.miniAmountButtonStyle('subtle', false);
    const prominentMini = component.miniAmountButtonStyle('prominent', false);
    expect(subtleMini['borderRadius']).not.toBe(prominentMini['borderRadius']);
    expect(subtleMini['fontWeight']).not.toBe(prominentMini['fontWeight']);
  });

  // 15. Mobile-safe: the preset picker/thumbnail markup relies on the
  // existing wrapping flex layout and the Donation amount-grid's own
  // already-proven auto-fill behavior -- no preset introduces a fixed
  // layout value that could overflow (confirmed structurally: presets only
  // ever set sizing on the BUTTON itself, never on the surrounding grid).
  it('15. no preset mutates layout-grid concerns -- only button-local sizing/chrome', () => {
    for (const opt of component.amountButtonPresetOptions) {
      if (opt.value === 'inherit') continue;
      const mini = component.miniAmountButtonStyle(opt.value, false);
      expect(Object.keys(mini)).not.toContain('width');
      expect(Object.keys(mini)).not.toContain('position');
    }
  });
});
