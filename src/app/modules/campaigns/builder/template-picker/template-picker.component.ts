import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CAMPAIGN_TEMPLATES, CampaignTemplate, TEMPLATE_PALETTES, TemplatePalette } from '../templates/campaign-templates';

export interface TemplateSelection {
  template: CampaignTemplate;
  palette: TemplatePalette;
}

@Component({
  selector: 'app-template-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-picker.component.html',
  styleUrl: './template-picker.component.css',
})
export class TemplatePickerComponent {
  // 'switch' = changing the template of a page that already has content: the
  // minimal format is a different page type, so it is not offered there.
  @Input() mode: 'create' | 'switch' = 'create';
  @Output() templateSelected = new EventEmitter<TemplateSelection>();
  @Output() skipped = new EventEmitter<void>();

  get templates(): CampaignTemplate[] {
    return this.mode === 'switch' ? CAMPAIGN_TEMPLATES.filter(t => t.pageFormat !== 'minimal') : CAMPAIGN_TEMPLATES;
  }
  readonly palettes = TEMPLATE_PALETTES;
  hoveredId: string | null = null;
  selectedPalette: TemplatePalette = TEMPLATE_PALETTES[0];

  selectPalette(palette: TemplatePalette): void {
    this.selectedPalette = palette;
  }

  select(template: CampaignTemplate): void {
    this.templateSelected.emit({ template, palette: this.selectedPalette });
  }

  skip(): void {
    this.skipped.emit();
  }
}
