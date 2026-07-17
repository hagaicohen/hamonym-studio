import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CAMPAIGN_PRESETS, CampaignPreset } from '../presets/campaign-presets';
import { PresetId } from '../../services/campaign-studio-state.service';

@Component({
  selector: 'app-campaign-preset-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './campaign-preset-picker.component.html',
  styleUrl: './campaign-preset-picker.component.css',
})
export class CampaignPresetPickerComponent {
  @Output() presetSelected = new EventEmitter<PresetId>();

  readonly presets = CAMPAIGN_PRESETS;

  select(preset: CampaignPreset): void {
    this.presetSelected.emit(preset.id);
  }
}
