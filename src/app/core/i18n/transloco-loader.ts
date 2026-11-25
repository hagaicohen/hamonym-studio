import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

// Dictionaries are bundled (one lazy chunk per language, hashed with the build),
// never fetched over HTTP, so a deploy can never serve stale translations.
// Each language is assembled from the feature files in src/app/i18n/<lang>/.
@Injectable({ providedIn: 'root' })
export class HmTranslocoLoader implements TranslocoLoader {
  getTranslation(lang: string): Promise<Translation> {
    const load = lang === 'en' ? import('../../i18n/en') : import('../../i18n/he');
    return load.then((m) => m.default);
  }
}
