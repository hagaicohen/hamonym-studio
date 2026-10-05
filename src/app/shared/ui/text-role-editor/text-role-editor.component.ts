import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { TextStyle, TextAlign, TextFontSize } from '../../models/text-style.model';

// Typography Phase A (2026-10) -- the shared Builder editor for a per-block
// Text Role override (block.data.textStyles?.[roleName], a Partial
// <TextStyle>, NOT the whole-object-required TextStyle that
// TextStyleEditorComponent edits for Hero/CTA/RichText). Deliberately a
// NEW sibling component rather than a retrofit of TextStyleEditorComponent
// -- that component's @Input() textStyle is required and patchStyle()
// always emits a complete object, which doesn't fit "no property is set
// unless the manager explicitly touched it." Reuses the same visual
// language (.tse-* class names/colors in the sibling .css) on purpose, so
// the two editors look like one family in the Builder.
//
// showColor/showFontWeight/showFontSize/showFontFamily/showAlign let each
// host decide which properties are actually meaningful for the role it's
// editing -- Phase A only wires a subset of these end-to-end per role (see
// each role's own resolver call site in campaign-preview.component.ts);
// showing a control here that the renderer doesn't yet consume would be a
// dead, confusing setting, so hosts enable only what's real today.
@Component({
  selector: 'app-text-role-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './text-role-editor.component.html',
  styleUrl: './text-role-editor.component.css',
})
export class TextRoleEditorComponent {
  @Input() roleLabel = '';
  // The role's resolved value when nothing here is set -- shown as "לפי
  // הסגנון" context, never written back by this component itself.
  @Input() resolvedColor = '';

  @Input() override: Partial<TextStyle> | undefined;
  @Output() overrideChange = new EventEmitter<Partial<TextStyle> | undefined>();

  @Input() showColor = true;
  @Input() showFontWeight = false;
  @Input() showFontSize = false;
  @Input() showFontFamily = false;
  @Input() showAlign = false;

  // Only the fonts actually loaded in index.html (2026-10-06 doc comment
  // there) -- Rubik/Secular One are NOT loaded despite appearing in an
  // earlier curated-set discussion, so they are deliberately absent here
  // rather than offered and silently falling back to the browser default.
  readonly fontOptions: { value: string; label: string }[] = [
    { value: "'Heebo', sans-serif",               label: 'Heebo (רגיל)' },
    { value: "'Frank Ruhl Libre', 'Heebo', serif", label: 'Frank Ruhl Libre' },
    { value: "'Varela Round', 'Heebo', sans-serif", label: 'Varela Round' },
    { value: "'Assistant', 'Heebo', sans-serif",   label: 'Assistant' },
  ];

  readonly weightOptions: { value: number; label: string }[] = [
    { value: 400, label: 'רגיל' },
    { value: 700, label: 'מודגש' },
    { value: 800, label: 'מודגש+' },
    { value: 900, label: 'כבד' },
  ];

  readonly sizeOptions: { value: TextFontSize; label: string }[] = [
    { value: 'sm', label: 'S'  },
    { value: 'md', label: 'M'  },
    { value: 'lg', label: 'L'  },
    { value: 'xl', label: 'XL' },
  ];

  readonly alignOptions: { value: TextAlign; label: string }[] = [
    { value: 'right',  label: 'ימין'  },
    { value: 'center', label: 'מרכז'  },
    { value: 'left',   label: 'שמאל'  },
  ];

  expanded = false;

  get hasOverride(): boolean {
    return !!this.override && Object.keys(this.override).length > 0;
  }

  patch(partial: Partial<TextStyle>): void {
    this.overrideChange.emit({ ...(this.override ?? {}), ...partial });
  }

  resetProperty(key: keyof TextStyle): void {
    if (!this.override) return;
    const next: Partial<TextStyle> = { ...this.override };
    delete next[key];
    this.overrideChange.emit(Object.keys(next).length ? next : undefined);
  }

  resetRole(): void {
    this.overrideChange.emit(undefined);
  }
}
