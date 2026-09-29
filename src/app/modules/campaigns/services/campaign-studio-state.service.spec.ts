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
