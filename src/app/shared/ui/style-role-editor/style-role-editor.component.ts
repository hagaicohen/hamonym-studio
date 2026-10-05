import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { SurfaceStyle, ButtonStyle, ProgressStyle } from '../../models/style-role.model';

// Universal Local Styling Phase B1 (2026-10) -- the ONE shared Builder
// editor for a non-text style role override (surfaceStyles/buttonStyles/
// progressStyles entries). Deliberately ONE component across all three
// kinds rather than SurfaceRoleEditor/ButtonRoleEditor/ProgressRoleEditor
// as separate classes -- every kind is just a handful of color pickers +
// an optional radius control, structurally identical; the show*
// booleans (same pattern as TextRoleEditorComponent's showFontWeight etc.)
// pick which properties apply to a given role instead of building three
// near-duplicate components. Reuses the exact .tse-* visual language (and
// the same per-property/per-role reset UX) as TextRoleEditorComponent and
// its own sibling .css, so all four role-editor families read as one
// consistent system in the Builder.
export type StyleRoleOverride = Partial<SurfaceStyle & ButtonStyle & ProgressStyle>;

@Component({
  selector: 'app-style-role-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, ColorPickerComponent],
  templateUrl: './style-role-editor.component.html',
  styleUrl: './style-role-editor.component.css',
})
export class StyleRoleEditorComponent {
  @Input() roleLabel = '';

  @Input() override: StyleRoleOverride | undefined;
  @Output() overrideChange = new EventEmitter<StyleRoleOverride | undefined>();

  @Input() showBackground  = false;
  @Input() showTextColor   = false;
  @Input() showBorderColor = false;
  @Input() showBorderRadius = false;
  @Input() showTrackColor  = false;
  @Input() showFillColor   = false;

  // "לפי הסגנון" preview values -- the resolved value when nothing here is
  // set, never written back by this component itself.
  @Input() resolvedBackground  = '';
  @Input() resolvedTextColor   = '';
  @Input() resolvedBorderColor = '';
  @Input() resolvedBorderRadius = 0;
  @Input() resolvedTrackColor  = '';
  @Input() resolvedFillColor   = '';

  expanded = false;

  get hasOverride(): boolean {
    return !!this.override && Object.keys(this.override).length > 0;
  }

  patch(partial: StyleRoleOverride): void {
    this.overrideChange.emit({ ...(this.override ?? {}), ...partial });
  }

  resetProperty(key: keyof StyleRoleOverride): void {
    if (!this.override) return;
    const next: StyleRoleOverride = { ...this.override };
    delete next[key];
    this.overrideChange.emit(Object.keys(next).length ? next : undefined);
  }

  resetRole(): void {
    this.overrideChange.emit(undefined);
  }
}
