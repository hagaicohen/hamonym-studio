import { ChangeDetectorRef, Directive, EventEmitter, Injectable, Input, Output, OnDestroy, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { isTranslationKey } from './text.pipe';

export type CampaignLang = 'he' | 'en';

// The language a campaign is rendered in (bilingual campaign content, D-38 …
// D-45), independent of the interface language: the Studio canvas and the public
// campaign page each provide one for everything inside them.
@Injectable()
export class CampaignContentLanguage {
  readonly lang = signal<CampaignLang>('he');
  readonly languages = signal<readonly CampaignLang[]>(['he']);
  requestLanguage: (lang: CampaignLang) => void = () => {};
}

// Marks a subtree as campaign content in one language: sets its direction and
// `lang`, and makes `hmPublic` (the public page's own system text: donate
// buttons, progress, checkout…) speak that language. Switching never re-creates
// the subtree, so an open checkout keeps what the donor typed.
@Directive({
  selector: '[hmCampaignContent]',
  standalone: true,
  host: { '[attr.dir]': "ctx.lang() === 'en' ? 'ltr' : 'rtl'", '[attr.lang]': 'ctx.lang()', 'data-i18n-content': '' },
  providers: [CampaignContentLanguage],
})
export class HmCampaignContentDirective {
  readonly ctx = inject(CampaignContentLanguage, { self: true });
  private readonly transloco = inject(TranslocoService);

  @Output() readonly hmCampaignLanguageChange = new EventEmitter<CampaignLang>();
  @Input() set hmCampaignLanguages(value: readonly CampaignLang[]) { this.ctx.languages.set(value); }
  constructor() {
    this.ctx.requestLanguage = lang => {
      if (this.ctx.languages().includes(lang)) this.hmCampaignLanguageChange.emit(lang);
    };
  }

  @Input() set hmCampaignContent(value: CampaignLang | '' | null | undefined) {
    const lang: CampaignLang = value === 'en' ? 'en' : 'he';
    // Dictionaries are bundled per language and loaded on first use.
    this.transloco.load(lang).subscribe();
    this.ctx.lang.set(lang);
  }
}

function resolve(transloco: TranslocoService, value: string, lang: CampaignLang | null, params?: Record<string, unknown>): string {
  if (!isTranslationKey(transloco, value)) return value;
  return lang ? transloco.translate(value, params, lang) : transloco.translate(value, params);
}

// Like `hmText`, for system text that belongs to the campaign page: inside
// `[hmCampaignContent]` it follows the campaign language, elsewhere the interface.
//   {{ 'publicPage.donate.cta' | hmPublic }}
@Pipe({ name: 'hmPublic', standalone: true, pure: false })
export class HmPublicTextPipe implements PipeTransform, OnDestroy {
  private readonly transloco = inject(TranslocoService);
  private readonly ctx = inject(CampaignContentLanguage, { optional: true });
  private readonly sub: Subscription;

  constructor() {
    const cdr = inject(ChangeDetectorRef);
    this.sub = this.transloco.events$.subscribe(() => cdr.markForCheck());
    this.sub.add(this.transloco.langChanges$.subscribe(() => cdr.markForCheck()));
    // No effect() here: transform() reads ctx.lang() inside the template, which
    // already ties the view to the signal. An effect per pipe instance scheduled a
    // new render pass each time a view (and its pipes) was re-created, which made
    // change detection loop forever.
  }

  transform(value: string | null | undefined, params?: Record<string, unknown>): string {
    if (!value) return '';
    return resolve(this.transloco, value, this.ctx?.lang() ?? null, params);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}

// The same rule for code inside a component of the campaign page:
//   private readonly t = publicText();   …   this.t('publicPage.x', { n })
export function publicText(): (value: string | null | undefined, params?: Record<string, unknown>) => string {
  const transloco = inject(TranslocoService);
  const ctx = inject(CampaignContentLanguage, { optional: true });
  return (value, params) => (value ? resolve(transloco, value, ctx?.lang() ?? null, params) : '');
}

// The campaign language a component is rendered in ('he' outside campaign content).
export function campaignLang(): () => CampaignLang {
  const ctx = inject(CampaignContentLanguage, { optional: true });
  return () => ctx?.lang() ?? 'he';
}
