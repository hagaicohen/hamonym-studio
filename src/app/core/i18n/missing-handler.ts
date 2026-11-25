import { Injectable, isDevMode } from '@angular/core';
import { TranslocoMissingHandler, TranslocoMissingHandlerData } from '@jsverse/transloco';

// Raw keys must never reach the screen. Transloco first falls back to the
// Hebrew value (useFallbackTranslation); this handler is reached only when the
// key exists in no language. Development makes that loud; production shows nothing.
// scripts/test-i18n-keys.cjs catches both cases before they ship.
@Injectable()
export class HmMissingHandler implements TranslocoMissingHandler {
  private readonly reported = new Set<string>();

  handle(key: string, data: TranslocoMissingHandlerData): string {
    if (!isDevMode()) return '';
    if (!this.reported.has(key)) {
      this.reported.add(key);
      console.error(`[i18n] Missing translation key "${key}" (${data.activeLang})`);
    }
    return `⟦${key}⟧`;
  }
}
