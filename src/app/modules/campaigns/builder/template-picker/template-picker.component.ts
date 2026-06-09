import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CAMPAIGN_TEMPLATES, CampaignTemplate } from '../templates/campaign-templates';

@Component({
  selector: 'app-template-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './template-picker.component.html',
  styleUrl: './template-picker.component.css',
})
export class TemplatePickerComponent {
  @Output() templateSelected = new EventEmitter<CampaignTemplate>();
  @Output() skipped = new EventEmitter<void>();

  readonly templates = CAMPAIGN_TEMPLATES;
  hoveredId: string | null = null;

  select(template: CampaignTemplate): void {
    this.templateSelected.emit(template);
  }

  skip(): void {
    this.skipped.emit();
  }
}
