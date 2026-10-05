import { TestBed } from '@angular/core/testing';
import { CampaignStudioStateService } from './campaign-studio-state.service';

// Campaign Preset UI check: the Preset marker must survive both by itself
// and through a subsequent template pick (applyTemplate rebuilds the whole
// draft from a fresh createInitialDraft(), which would silently wipe it
// unless explicitly preserved). See DECISIONS.md (2026-07-15).
describe('CampaignStudioStateService — Preset persistence', () => {
  let service: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CampaignStudioStateService);
  });

  it('defaults to the "general" preset for a brand-new draft', () => {
    expect(service.draft.layout.preset).toBe('general');
  });

  it('applyPreset sets draft.layout.preset', () => {
    service.applyPreset('race');
    expect(service.draft.layout.preset).toBe('race');
  });

  it('applyTemplate (picking a visual template afterwards) preserves the already-chosen preset', () => {
    service.applyPreset('race');
    service.applyTemplate([], {}, 'standard', 'some-template-id');

    expect(service.draft.layout.preset).toBe('race');
    expect(service.draft.layout.templateId).toBe('some-template-id');
  });
});

// Campaign Location (2026-09-29) — campaign metadata, optional, not Entity
// address. A brand-new draft (and by extension every existing campaign that
// never touched this) must have no location at all, not an inferred/default
// one — no migration, no fake value.
describe('CampaignStudioStateService — Campaign Location', () => {
  let service: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CampaignStudioStateService);
  });

  it('a brand-new draft has no campaign location', () => {
    expect(service.draft.layout.campaignLocation).toBeUndefined();
  });

  it('setCampaignLocation persists a nationwide location', () => {
    service.setCampaignLocation({ type: 'nationwide', label: 'כל הארץ' });
    expect(service.draft.layout.campaignLocation).toEqual({ type: 'nationwide', label: 'כל הארץ' });
  });

  it('setCampaignLocation persists a region with its own city field, separate from label', () => {
    service.setCampaignLocation({ type: 'region', label: 'בית שמש והסביבה', city: 'בית שמש והסביבה' });
    expect(service.draft.layout.campaignLocation).toEqual({
      type: 'region', label: 'בית שמש והסביבה', city: 'בית שמש והסביבה',
    });
  });

  it('setCampaignLocation persists a custom free-text location', () => {
    service.setCampaignLocation({ type: 'custom', label: 'יישובי עוטף עזה' });
    expect(service.draft.layout.campaignLocation).toEqual({ type: 'custom', label: 'יישובי עוטף עזה' });
  });

  it('clearCampaignLocation removes it entirely rather than leaving an empty object', () => {
    service.setCampaignLocation({ type: 'online', label: 'אונליין' });
    service.clearCampaignLocation();
    expect(service.draft.layout.campaignLocation).toBeUndefined();
  });

  it('changing location type does not touch any other layout field (e.g. an already-chosen Campaign Style)', () => {
    service.setCampaignStyle('clean');
    service.setCampaignLocation({ type: 'international', label: 'פעילות בינלאומית' });

    expect(service.draft.layout.campaignStyleId).toBe('clean');
    expect(service.draft.layout.campaignLocation).toEqual({ type: 'international', label: 'פעילות בינלאומית' });
  });
});

// Opening Composition — Phase A, generic (2026-10-01). Explicit campaign
// choice and Campaign Style default are two DIFFERENT concepts (see
// resolveOpeningComposition's own doc comment) -- these tests prove the
// state layer keeps them separate: setting a Style must never write an
// explicit composition, and clearing an explicit composition must return
// to undefined (control to the Style), not to whatever that Style's
// current default happens to be.
describe('CampaignStudioStateService — Opening Composition', () => {
  let service: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CampaignStudioStateService);
  });

  it('a brand-new draft has no explicit opening composition', () => {
    expect(service.draft.layout.openingComposition).toBeUndefined();
  });

  it('setOpeningComposition persists the explicit choice', () => {
    service.setOpeningComposition('story-first');
    expect(service.draft.layout.openingComposition).toBe('story-first');
  });

  it('resetOpeningComposition clears it back to undefined, not to the Style\'s current default', () => {
    service.setCampaignStyle('vibrant'); // Style default would be 'fundraising-split'
    service.setOpeningComposition('classic');
    service.resetOpeningComposition();
    expect(service.draft.layout.openingComposition).toBeUndefined();
  });

  it('changing Campaign Style does NOT mutate an already-set explicit opening composition', () => {
    service.setOpeningComposition('story-first');
    service.setCampaignStyle('vibrant');
    expect(service.draft.layout.openingComposition).toBe('story-first');
  });

  it('setOpeningComposition does not touch any other layout field (e.g. an already-chosen Campaign Style)', () => {
    service.setCampaignStyle('civic');
    service.setOpeningComposition('fundraising-split');
    expect(service.draft.layout.campaignStyleId).toBe('civic');
    expect(service.draft.layout.openingComposition).toBe('fundraising-split');
  });
});

// Section Presentation — placement-aware recommendation (2026-10-06). An
// explicit choice was made FOR a specific placement and must not blindly
// follow the section across a later placement change -- see
// resolveSectionPresentation in campaign-styles.ts. setSidebarSection is the
// ONLY place this invalidation happens, and only on an actual transition
// (not a redundant call with the same value), so loading an existing
// campaign (which never calls setSidebarSection on its own) never mutates
// anything.
describe('CampaignStudioStateService — Section Presentation placement-awareness', () => {
  let service: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CampaignStudioStateService);
  });

  it('a brand-new draft has no explicit section presentation for any section (no load-time mutation)', () => {
    expect(service.draft.layout.sectionPresentation).toBeUndefined();
    expect(service.getSectionPresentation('ambassadors')).toBeUndefined();
    expect(service.getSectionPresentation('donors')).toBeUndefined();
    expect(service.getSectionPresentation('rewards')).toBeUndefined();
    expect(service.getSectionPresentation('updates')).toBeUndefined();
  });

  it('Ambassadors: an explicit Main choice is cleared by an actual Main -> Sidebar placement change', () => {
    service.setSectionPresentation('ambassadors', 'cards');
    service.setSidebarSection('ambassadors', true);
    expect(service.getSectionPresentation('ambassadors')).toBeUndefined();
  });

  it('Donors: an explicit Sidebar choice is cleared by an actual Sidebar -> Main placement change', () => {
    service.setSidebarSection('donors', true);
    service.setSectionPresentation('donors', 'list');
    service.setSidebarSection('donors', false);
    expect(service.getSectionPresentation('donors')).toBeUndefined();
  });

  it('Rewards: an explicit Main choice is cleared by an actual Main -> Sidebar placement change', () => {
    service.setSectionPresentation('rewards', 'image');
    service.setSidebarSection('rewards', true);
    expect(service.getSectionPresentation('rewards')).toBeUndefined();
  });

  it('Updates: an explicit Main choice is cleared by an actual Main -> Sidebar placement change', () => {
    service.setSectionPresentation('updates', 'cards');
    service.setSidebarSection('updates', true);
    expect(service.getSectionPresentation('updates')).toBeUndefined();
  });

  it('a redundant setSidebarSection call (placement unchanged) does NOT clear an explicit override', () => {
    service.setSidebarSection('donors', true);
    service.setSectionPresentation('donors', 'list');
    service.setSidebarSection('donors', true); // same value again -- no-op transition
    expect(service.getSectionPresentation('donors')).toBe('list');
  });

  it('the manager may override again after a placement change; that new override persists across unrelated patches', () => {
    service.setSectionPresentation('ambassadors', 'cards');
    service.setSidebarSection('ambassadors', true); // clears the Main-era override
    service.setSectionPresentation('ambassadors', 'list'); // re-chosen for Sidebar
    service.setCampaignStyle('vibrant'); // unrelated patch must not disturb it
    expect(service.getSectionPresentation('ambassadors')).toBe('list');
  });

  it('a placement change for one section never clears another section\'s explicit override', () => {
    service.setSectionPresentation('donors', 'cards');
    service.setSectionPresentation('ambassadors', 'cards');
    service.setSidebarSection('donors', true);
    expect(service.getSectionPresentation('ambassadors')).toBe('cards');
  });

  it('resetSectionPresentation still clears an override independent of placement', () => {
    service.setSectionPresentation('updates', 'list');
    service.resetSectionPresentation('updates');
    expect(service.getSectionPresentation('updates')).toBeUndefined();
  });
});
