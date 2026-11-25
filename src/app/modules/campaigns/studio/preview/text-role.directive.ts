import { Directive, Input, inject } from '@angular/core';
import { TextStyle, TextFontSize } from '../../../../shared/models/text-style.model';
import { CampaignContentLanguage } from '../../../../core/i18n/content-language';
import { ElementFontField, elementFont } from '../../utils/campaign-fonts';

// Steps saved by the older sm/md/lg/xl size chips, as the role resolver reads them.
const STEP_PX: Record<TextFontSize, number> = { sm: 13, md: 16, lg: 20, xl: 26 };

// Applies a Text Role override (block.data.textStyles[role], layout.metaTextStyle…)
// to the element that renders that text: the font for the campaign language,
// exact size, weight and alignment. Nothing set = nothing applied, so the
// Campaign Style and the per-language campaign fonts cascade as before. Colors
// keep their own resolver bindings (theme fallbacks).
//   <h2 [hmTextRole]="data.textStyles?.sectionTitle">
@Directive({
  selector: '[hmTextRole]',
  standalone: true,
  host: {
    '[style.font-family]': 'font()',
    '[style.font-size.px]': 'sizePx()',
    '[style.font-weight]': 'role?.fontWeight ?? null',
    '[style.text-align]': 'role?.align ?? null',
  },
})
export class HmTextRoleDirective {
  @Input('hmTextRole') role: Partial<TextStyle> | null | undefined;
  @Input() hmTextRoleField: ElementFontField = 'fontFamilyByLanguage';
  private readonly ctx = inject(CampaignContentLanguage, { optional: true });

  font(): string | null {
    return this.role ? elementFont(this.role, this.ctx?.lang() ?? 'he', this.hmTextRoleField) : null;
  }

  sizePx(): number | null {
    if (!this.role) return null;
    return this.role.fontSizePx ?? (this.role.fontSize ? STEP_PX[this.role.fontSize] : null);
  }
}

export function roleSizePx(role: Partial<TextStyle> | null | undefined): number | null {
  if (!role) return null;
  return role.fontSizePx ?? (role.fontSize ? STEP_PX[role.fontSize] : null);
}
