import { CAMPAIGN_FONTS, elementFont, setElementFont, ensureStackLoaded, ElementFontField } from '../../../modules/campaigns/utils/campaign-fonts';
import { ElementColorField, elementColor, setElementColor } from '../../../modules/campaigns/utils/element-color';
import { CampaignStudioStateService } from '../../../modules/campaigns/services/campaign-studio-state.service';
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import {
  TextStyle, CtaConfig,
  TextAlign, TextFontSize, TextPosition,
} from '../../models/text-style.model';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HmTextPipe } from '../../../core/i18n/text.pipe';

@Component({
  selector: 'app-text-style-editor',
  standalone: true,
  imports: [HmTextPipe, TranslocoPipe, CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './text-style-editor.component.html',
  styleUrl: './text-style-editor.component.css',
})
export class TextStyleEditorComponent {
  private readonly i18n = inject(TranslocoService);
  @Input()  textStyle!: TextStyle;
  @Output() textStyleChange = new EventEmitter<TextStyle>();

  @Input()  ctaConfig?: CtaConfig;
  @Output() ctaConfigChange = new EventEmitter<CtaConfig>();

  @Input() showPosition = false;
  @Input() showCta = false;
  // Hero: separate size and color for the title and the subtitle.
  @Input() splitTitleSubtitle = false;
  // Studio direct editing: only this part's controls, open right away (no
  // "עיצוב מתקדם" toggle). The alignment written is the part's own one.
  @Input() part: 'title' | 'subtitle' | 'cta' | null = null;
  // What the part shows when it has no alignment of its own (on the Hero the
  // copy is centered; above/below it follows the shared alignment).
  @Input() partAlignFallback: TextAlign = 'center';

  private readonly state = inject(CampaignStudioStateService);
  readonly fontOptions = CAMPAIGN_FONTS;
  get fontField(): ElementFontField { return this.part === 'title' || (!this.part && this.splitTitleSubtitle) ? 'titleFontFamilyByLanguage' : this.part === 'subtitle' ? 'subtitleFontFamilyByLanguage' : 'fontFamilyByLanguage'; }
  get selectedFont(): string { return elementFont(this.part === 'cta' ? this.ctaConfig : this.textStyle, this.state.contentLanguage, this.fontField) ?? ''; }
  setFont(stack: string): void {
    ensureStackLoaded(stack);
    if (this.part === 'cta' && this.ctaConfig) this.ctaConfigChange.emit(setElementFont(this.ctaConfig, this.state.contentLanguage, stack || null));
    else {
      let next = setElementFont(this.textStyle, this.state.contentLanguage, stack || null, this.fontField);
      if (!this.part && this.splitTitleSubtitle) next = setElementFont(next, this.state.contentLanguage, stack || null, 'subtitleFontFamilyByLanguage');
      this.textStyleChange.emit(next);
    }
  }
  // Colors for the open content language (same values as the floating toolbar's).
  partColor(field: ElementColorField): string {
    const lang = this.state.contentLanguage;
    return elementColor(this.textStyle, lang, field) || (field === 'color' ? '' : elementColor(this.textStyle, lang) ?? '');
  }
  setPartColor(field: ElementColorField, color: string): void {
    this.textStyleChange.emit(setElementColor(this.textStyle, this.state.contentLanguage, color || null, field));
  }
  expanded = false;

  readonly presetColors = ['#ffffff', '#000000', '#fbbf24', '#f87171', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  readonly presetIcons  = ['', '❤️', '🙏', '⭐', '🎁', '🤝', '✨', '→'];

  readonly alignOptions: { value: TextAlign; label: string }[] = [
    { value: 'right',  label: 'editors.align.right'  },
    { value: 'center', label: 'editors.align.center'  },
    { value: 'left',   label: 'editors.align.left'  },
  ];

  readonly sizeOptions: { value: TextFontSize; label: string }[] = [
    { value: 'sm', label: 'S'  },
    { value: 'md', label: 'M'  },
    { value: 'lg', label: 'L'  },
    { value: 'xl', label: 'XL' },
  ];

  readonly positionOptions: { value: TextPosition; label: string }[] = [
    { value: 'top',    label: 'editors.position.top'  },
    { value: 'center', label: 'editors.align.center'   },
    { value: 'bottom', label: 'editors.position.bottom'  },
  ];

  patchStyle(partial: Partial<TextStyle>): void {
    this.textStyleChange.emit({ ...this.textStyle, ...partial });
  }

  // The shared alignment also resets the per-part alignment set by dragging,
  // so it keeps controlling both lines.
  setAlign(align: TextAlign): void {
    this.patchStyle(this.splitTitleSubtitle ? { align, titleAlign: undefined, subtitleAlign: undefined } : { align });
  }

  partAlign(): TextAlign {
    const own = this.part === 'subtitle' ? this.textStyle.subtitleAlign : this.textStyle.titleAlign;
    return own ?? this.partAlignFallback;
  }

  setPartAlign(align: TextAlign): void {
    this.patchStyle(this.part === 'subtitle' ? { subtitleAlign: align } : { titleAlign: align });
  }

  patchCta(partial: Partial<CtaConfig>): void {
    if (!this.ctaConfig) return;
    this.ctaConfigChange.emit({ ...this.ctaConfig, ...partial });
  }

  get summary(): string {
    const parts: string[] = [];
    const sizeMap: Record<TextFontSize, string> = { sm: 'editors.size.sm', md: 'editors.size.md', lg: 'editors.size.lg', xl: 'editors.size.xl' };
    const alignMap: Record<TextAlign, string> = { right: 'editors.align.right', center: 'editors.align.center', left: 'editors.align.left' };
    parts.push(sizeMap[this.textStyle.fontSize]);
    parts.push(alignMap[this.textStyle.align]);
    if (this.ctaConfig?.visible) parts.push('editors.summary.withCta');
    return parts.filter(Boolean).map(k => this.i18n.translate(k)).join(' · ');
  }
}
