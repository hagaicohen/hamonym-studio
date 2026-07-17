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
