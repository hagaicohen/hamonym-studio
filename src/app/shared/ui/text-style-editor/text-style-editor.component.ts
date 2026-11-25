import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import {
  TextStyle, CtaConfig,
  TextAlign, TextFontSize, TextPosition,
} from '../../models/text-style.model';

@Component({
  selector: 'app-text-style-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './text-style-editor.component.html',
  styleUrl: './text-style-editor.component.css',
})
export class TextStyleEditorComponent {
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

  expanded = false;

  readonly presetColors = ['#ffffff', '#000000', '#fbbf24', '#f87171', '#34d399', '#60a5fa', '#a78bfa', '#f472b6'];
  readonly presetIcons  = ['', '❤️', '🙏', '⭐', '🎁', '🤝', '✨', '→'];

  readonly alignOptions: { value: TextAlign; label: string }[] = [
    { value: 'right',  label: 'ימין'  },
    { value: 'center', label: 'מרכז'  },
    { value: 'left',   label: 'שמאל'  },
  ];

  readonly sizeOptions: { value: TextFontSize; label: string }[] = [
    { value: 'sm', label: 'S'  },
    { value: 'md', label: 'M'  },
    { value: 'lg', label: 'L'  },
    { value: 'xl', label: 'XL' },
  ];

  readonly positionOptions: { value: TextPosition; label: string }[] = [
    { value: 'top',    label: 'עליון'  },
    { value: 'center', label: 'מרכז'   },
    { value: 'bottom', label: 'תחתון'  },
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
    const sizeMap: Record<TextFontSize, string> = { sm: 'קטן', md: 'בינוני', lg: 'גדול', xl: 'גדול מאוד' };
    const alignMap: Record<TextAlign, string> = { right: 'ימין', center: 'מרכז', left: 'שמאל' };
    parts.push(sizeMap[this.textStyle.fontSize]);
    parts.push(alignMap[this.textStyle.align]);
    if (this.ctaConfig?.visible) parts.push('+ כפתור CTA');
    return parts.join(' · ');
  }
}
