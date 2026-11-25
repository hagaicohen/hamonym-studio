import { APP_INITIALIZER, EnvironmentProviders, Provider, inject, isDevMode } from '@angular/core';
import { TranslocoService, provideTransloco, provideTranslocoMissingHandler, provideTranslocoTranspiler } from '@jsverse/transloco';
import { bindTranslateNow } from './translate-now';
import { HmTranspiler } from './icu-transpiler';
import { HmTranslocoLoader } from './transloco-loader';
import { HmMissingHandler } from './missing-handler';
import { DEFAULT_UI_LANG, UI_LANGS, UiLanguageService } from './ui-language.service';
import { syncLanguageWithRoutes } from './route-language';

export const HM_TRANSLOCO_CONFIG = {
  availableLangs: [...UI_LANGS],
  defaultLang: DEFAULT_UI_LANG,
  fallbackLang: DEFAULT_UI_LANG,
  reRenderOnLangChange: true,
  missingHandler: { useFallbackTranslation: true, logMissingKey: false, allowEmpty: false },
};

// Runtime i18n (docs/BILINGUAL-I18N-ROADMAP.md §2): Transloco with bundled
// dictionaries, ICU plurals (HmTranspiler), Hebrew default and fallback.
export function provideHmI18n(): (Provider | EnvironmentProviders)[] {
  return [
    provideTransloco({
      config: { ...HM_TRANSLOCO_CONFIG, prodMode: !isDevMode() },
      loader: HmTranslocoLoader,
    }),
    provideTranslocoTranspiler(HmTranspiler),
    provideTranslocoMissingHandler(HmMissingHandler),
    {
      provide: APP_INITIALIZER,
      multi: true,
      useFactory: () => {
        const language = inject(UiLanguageService);
        bindTranslateNow(inject(TranslocoService));
        syncLanguageWithRoutes();
        return () => language.init();
      },
    },
  ];
}
