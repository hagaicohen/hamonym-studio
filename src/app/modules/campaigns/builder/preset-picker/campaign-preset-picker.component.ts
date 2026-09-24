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
  // Leaving this screen without picking anything — e.g. the visitor opened
  // /campaigns/create by mistake. Nothing has been created/saved yet at
  // this point (reset() ran right before showing this picker), so there's
  // nothing to undo — this is a plain exit, not a draft-discard. See
  // DECISIONS.md (2026-09-24).
  @Output() closed = new EventEmitter<void>();
  // "דף תרומה מהיר" — a UX-only 4th entry point at this same screen, NOT a
  // PresetId (see campaign-studio-state.service.ts's own comment: presets
  // are "a fixed, deliberately short list" that only ever tune Registration-
  // step copy — irrelevant here since a minimal-format campaign never shows
  // that step at all). Kept as its own output so the parent
  // (campaign-studio-page.component.ts) can route it straight to
  // layout.pageFormat='minimal' and skip the Template Picker entirely,
  // instead of going through applyPreset(). See DECISIONS.md (2026-09-24).
  @Output() minimalSelected = new EventEmitter<void>();

  readonly presets = CAMPAIGN_PRESETS;

  select(preset: CampaignPreset): void {
    this.presetSelected.emit(preset.id);
  }

  selectMinimal(): void {
    this.minimalSelected.emit();
  }

  close(): void {
    this.closed.emit();
  }

  // Visual order only (CSS `order`, see the template) — 1 קמפיין תרומות,
  // 2 דף תרומה מהיר (new, not part of `presets`), 3 מירוץ, 4 קמפיין כללי.
  // Keyed by id instead of relying on CAMPAIGN_PRESETS' own array order
  // staying [donation, race, general] forever.
  private readonly PRESET_ORDER: Record<PresetId, number> = { donation: 1, race: 3, general: 4 };
  orderFor(id: PresetId): number {
    return this.PRESET_ORDER[id] ?? 99;
  }
}
