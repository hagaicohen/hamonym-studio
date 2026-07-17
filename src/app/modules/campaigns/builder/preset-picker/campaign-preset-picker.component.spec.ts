import { TestBed } from '@angular/core/testing';
import { CampaignPresetPickerComponent } from './campaign-preset-picker.component';
import { PresetId } from '../../services/campaign-studio-state.service';

describe('CampaignPresetPickerComponent', () => {
  it('exposes exactly the 3 v1 presets from CAMPAIGN_PRESETS_VISION.md §5', () => {
    TestBed.configureTestingModule({ imports: [CampaignPresetPickerComponent] });
    const component = TestBed.createComponent(CampaignPresetPickerComponent).componentInstance;

    expect(component.presets.map(p => p.id).sort()).toEqual(['donation', 'general', 'race']);
  });

  it('every preset has a non-empty, always-visible description', () => {
    TestBed.configureTestingModule({ imports: [CampaignPresetPickerComponent] });
    const component = TestBed.createComponent(CampaignPresetPickerComponent).componentInstance;

    for (const p of component.presets) {
      expect(p.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('selecting a preset emits its id', () => {
    TestBed.configureTestingModule({ imports: [CampaignPresetPickerComponent] });
    const component = TestBed.createComponent(CampaignPresetPickerComponent).componentInstance;

    let emitted: PresetId | undefined;
    component.presetSelected.subscribe((id: PresetId) => (emitted = id));

    const race = component.presets.find(p => p.id === 'race')!;
    component.select(race);

    expect(emitted).toBe('race');
  });
});
