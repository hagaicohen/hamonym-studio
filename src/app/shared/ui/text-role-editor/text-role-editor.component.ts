import { CampaignStudioStateService } from '../../../modules/campaigns/services/campaign-studio-state.service';
import { Component, Input, Output, EventEmitter, inject } from '@angular/core';
import { CAMPAIGN_FONTS, elementFont, setElementFont, ensureStackLoaded } from '../../../modules/campaigns/utils/campaign-fonts';
import { elementColor, setElementColor } from '../../../modules/campaigns/utils/element-color';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ColorPickerComponent } from '../color-picker/color-picker.component';
import { TextStyle, TextAlign, TextFontSize } from '../../models/text-style.model';
import { TranslocoPipe } from '@jsverse/transloco';
import { HmTextPipe } from '../../../core/i18n/text.pipe';

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
  imports: [HmTextPipe, TranslocoPipe, CommonModule, FormsModule, ColorPickerComponent],
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

  @Input() simple = false;
  @Input() showColor = true;
  // Every text role offers the full set (2026-11-08); a host turns off what
  // does not apply to its element (alignment of a button label, for example).
  @Input() showFontWeight = true;
  @Input() showFontSize = true;
  @Input() showFontFamily = true;
  @Input() showAlign = true;

  // Catalog fonts are loaded on first use; legacy saved stacks remain valid.
  readonly fontOptions: { value: string; label: string }[] = CAMPAIGN_FONTS.map(f => ({ value: f.stack, label: f.id === 'heebo' ? 'editors.fonts.heebo' : f.name }));

  readonly weightOptions: { value: number; label: string }[] = [
    { value: 400, label: 'editors.weights.regular' },
    { value: 700, label: 'editors.weights.bold' },
    { value: 800, label: 'editors.weights.extraBold' },
    { value: 900, label: 'editors.weights.heavy' },
  ];

  readonly sizeOptions: { value: TextFontSize; label: string }[] = [
    { value: 'sm', label: 'S'  },
    { value: 'md', label: 'M'  },
    { value: 'lg', label: 'L'  },
    { value: 'xl', label: 'XL' },
  ];

  readonly alignOptions: { value: TextAlign; label: string }[] = [
    { value: 'right',  label: 'editors.align.right'  },
    { value: 'center', label: 'editors.align.center'  },
    { value: 'left',   label: 'editors.align.left'  },
  ];

  private readonly state = inject(CampaignStudioStateService);
  get selectedFont(): string { return elementFont(this.override, this.state.contentLanguage) ?? ''; }
  setFont(stack: string): void {
    ensureStackLoaded(stack);
    const next = setElementFont(this.override ?? {}, this.state.contentLanguage, stack || null);
    this.overrideChange.emit(Object.keys(next).length ? next : undefined);
  }
  // Color for the open content language (same value as the floating toolbar's).
  get roleColor(): string | undefined { return elementColor(this.override, this.state.contentLanguage); }
  setColor(color: string | null): void {
    const next = setElementColor(this.override ?? {}, this.state.contentLanguage, color);
    this.overrideChange.emit(Object.keys(next).length ? next : undefined);
  }
  @Input() expanded = false;

  get hasOverride(): boolean {
    return !!this.override && Object.keys(this.override).length > 0;
  }

  patch(partial: Partial<TextStyle>): void {
    this.overrideChange.emit({ ...(this.override ?? {}), ...partial });
  }

  // An exact size in px; it replaces the older sm/md/lg/xl step.
  get sizePx(): number | null {
    const o = this.override;
    return o?.fontSizePx ?? (o?.fontSize ? ({ sm: 13, md: 16, lg: 20, xl: 26 } as const)[o.fontSize] : null);
  }
  setSizePx(value: string | number): void {
    const px = Math.round(Number(value));
    if (!Number.isFinite(px) || px <= 0) { this.resetSize(); return; }
    const next: Partial<TextStyle> = { ...(this.override ?? {}), fontSizePx: Math.min(96, Math.max(8, px)) };
    delete next.fontSize;
    this.overrideChange.emit(next);
  }
  resetSize(): void {
    if (!this.override) return;
    const next: Partial<TextStyle> = { ...this.override };
    delete next.fontSize;
    delete next.fontSizePx;
    this.overrideChange.emit(Object.keys(next).length ? next : undefined);
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
