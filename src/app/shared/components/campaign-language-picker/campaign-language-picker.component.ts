import { Component, inject } from '@angular/core';
import { CampaignContentLanguage, HmPublicTextPipe } from '../../../core/i18n/content-language';

@Component({
  selector: 'app-campaign-language-picker',
  standalone: true,
  imports: [HmPublicTextPipe],
  template: `
    @if (context && context.languages().length > 1) {
      <nav class="campaign-language-picker" [attr.aria-label]="'publicPage.campaignPublic.languageSwitch' | hmPublic">
        @for (lang of context.languages(); track lang) {
          <button type="button" [attr.data-language]="lang" [attr.lang]="lang"
            [attr.aria-pressed]="context.lang() === lang" (click)="context.requestLanguage(lang)">
            {{ ('common.language.' + lang) | hmPublic }}
          </button>
        }
      </nav>
    }
  `,
  styles: [`
    .campaign-language-picker { display: flex; gap: 4px; padding-block: 4px; }
    button { font: inherit; font-size: 13px; padding: 4px 10px; border: 1px solid #cbd5e1; border-radius: 999px; background: white; color: #475569; cursor: pointer; }
    button[aria-pressed="true"] { background: #0f172a; color: white; border-color: #0f172a; }
    button:focus-visible { outline: 2px solid #583cd6; outline-offset: 2px; }
  `],
})
export class CampaignLanguagePickerComponent {
  readonly context = inject(CampaignContentLanguage, { optional: true });
}
