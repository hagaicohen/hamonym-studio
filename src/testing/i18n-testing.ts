import { Injectable, NgModule, inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Translation, TranslocoLoader, TranslocoService, provideTransloco, provideTranslocoMissingHandler, provideTranslocoTranspiler } from '@jsverse/transloco';
import { Observable, of } from 'rxjs';
import { HM_TRANSLOCO_CONFIG } from '../app/core/i18n/i18n.providers';
import { HmTranspiler } from '../app/core/i18n/icu-transpiler';
import { HmMissingHandler } from '../app/core/i18n/missing-handler';
import { bindTranslateNow } from '../app/core/i18n/translate-now';
import he from '../app/i18n/he';
import en from '../app/i18n/en';

@Injectable()
class SyncTestLoader implements TranslocoLoader {
  getTranslation(lang: string): Observable<Translation> {
    return of(lang === 'en' ? en : he);
  }
}

// Every TestBed gets real dictionaries, loaded synchronously, with Hebrew
// active — so existing specs that assert Hebrew text keep passing unchanged
// (roadmap R9). Registered globally in src/test.ts.
@NgModule({
  providers: [
    provideTransloco({ config: { ...HM_TRANSLOCO_CONFIG, prodMode: true }, loader: SyncTestLoader }),
    provideTranslocoTranspiler(HmTranspiler),
    provideTranslocoMissingHandler(HmMissingHandler),
  ],
})
export class HmI18nTestingModule {
  constructor() {
    const transloco = inject(TranslocoService);
    transloco.setTranslation(he, 'he');
    transloco.setTranslation(en, 'en');
    transloco.setActiveLang('he');
    bindTranslateNow(transloco);
  }
}

// What a Hebrew user sees for a field that holds a translation key or ready-made
// text (bilingual roadmap D-28): keys are translated, anything else is returned as is.
export function inHebrew(value: string | null | undefined): string {
  if (!value) return '';
  const transloco = TestBed.inject(TranslocoService);
  const translated = transloco.translate(value, {}, 'he');
  return translated && translated !== value && !translated.startsWith('⟦') ? translated : value;
}
