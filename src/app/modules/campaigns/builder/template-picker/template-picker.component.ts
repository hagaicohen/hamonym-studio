import { ChangeDetectionStrategy, Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CAMPAIGN_TEMPLATES, CampaignTemplate, TEMPLATE_PALETTES, TemplatePalette, TemplatePreviewRow } from '../templates/campaign-templates';
import { TranslocoPipe } from '@jsverse/transloco';
import { HmTextPipe } from '../../../../core/i18n/text.pipe';

export interface TemplateSelection {
  template: CampaignTemplate;
  palette: TemplatePalette;
}

@Component({
  selector: 'app-template-picker',
  standalone: true,
  imports: [HmTextPipe, TranslocoPipe, CommonModule],
  templateUrl: './template-picker.component.html',
  styleUrl: './template-picker.component.css',
  // Re-rendered on its own events and inputs only; the cards stay the same
  // elements while the host page renders (see previews below).
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  selectedPalette: TemplatePalette = TEMPLATE_PALETTES[0];
  // Each card's preview, built once per palette. Built in the template, it was a
  // new array on every check, so every check re-created the preview elements:
  // a click whose press and release had a check between them (the press itself
  // can cause one) pressed an element that was gone on release, the browser
  // fired no click, and the template was not chosen.
  previews = this.buildPreviews();

  selectPalette(palette: TemplatePalette): void {
    this.selectedPalette = palette;
    this.previews = this.buildPreviews();
  }

  select(template: CampaignTemplate): void {
    this.templateSelected.emit({ template, palette: this.selectedPalette });
  }

  skip(): void {
    this.skipped.emit();
  }

  readonly trackTemplate = (_: number, t: CampaignTemplate): string => t.id;
  readonly trackIndex = (i: number): number => i;

  private buildPreviews(): Map<string, TemplatePreviewRow[]> {
    return new Map(CAMPAIGN_TEMPLATES.map(t => [t.id, t.buildPreview(this.selectedPalette)]));
  }
}
