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
  // 'switch' = changing the template of a page that already has content. The
  // quick donation page is offered there only where the editor supports it
  // (the Studio); the classic wizard's step 9 would hide itself after it.
  @Input() mode: 'create' | 'switch' = 'create';
  @Input() offerQuickDonation = false;
  // Marks the campaign's current template in the gallery.
  @Input() currentTemplateId: string | null = null;
  @Output() templateSelected = new EventEmitter<TemplateSelection>();
  @Output() skipped = new EventEmitter<void>();

  get templates(): CampaignTemplate[] {
    return this.mode === 'switch' && !this.offerQuickDonation ? CAMPAIGN_TEMPLATES.filter(t => t.pageFormat !== 'minimal') : CAMPAIGN_TEMPLATES;
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
