import { Component, Output, EventEmitter } from '@angular/core';
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
  @Output() templateSelected = new EventEmitter<TemplateSelection>();
  @Output() skipped = new EventEmitter<void>();

  readonly templates = CAMPAIGN_TEMPLATES;
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
