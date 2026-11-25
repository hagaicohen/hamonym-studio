import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { CampaignDraft, CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CONTENT_LANGS, ContentLang } from '../../utils/content-i18n';
import { CampaignFont, FONT_ROLES, FontRole, ensureFontLoaded, fontById, fontsFor, setTypographyFont } from '../../utils/campaign-fonts';

// Campaign fonts per content language and text role (D-46). Writes only
// layout.typography; the Campaign Style's own font stays the default, and
// per-element Text Role fonts keep overriding it.
@Component({
  selector: 'app-campaign-typography-editor',
  standalone: true,
  imports: [AsyncPipe, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './campaign-typography-editor.component.html',
  styleUrl: './campaign-typography-editor.component.css',
})
export class CampaignTypographyEditorComponent {
  readonly state = inject(CampaignStudioStateService);
  readonly draft$ = this.state.draft$;
  readonly langs = CONTENT_LANGS;
  readonly roles = FONT_ROLES;
  // The version being edited follows the canvas until another tab is chosen.
  private picked: ContentLang | null = null;
  get lang(): ContentLang { return this.picked ?? this.state.contentLanguage; }

  pick(lang: ContentLang): void {
    this.picked = lang;
    for (const f of fontsFor(lang)) ensureFontLoaded(f);
  }

  constructor() {
    for (const f of fontsFor(this.lang)) ensureFontLoaded(f);
  }

  fonts(): CampaignFont[] { return fontsFor(this.lang); }

  chosen(draft: CampaignDraft, role: FontRole): string {
    return draft.layout.typography?.[this.lang]?.[role] ?? '';
  }

  stackOf(id: string): string | null { return fontById(id)?.stack ?? null; }

  note(draft: CampaignDraft, role: FontRole): string | undefined {
    return fontById(this.chosen(draft, role))?.noteKey;
  }

  set(role: FontRole, fontId: string): void {
    const layout = this.state.draft.layout;
    ensureFontLoaded(fontById(fontId));
    this.state.patch({ layout: { ...layout, typography: setTypographyFont(layout.typography, this.lang, role, fontId || null) } });
  }
}
