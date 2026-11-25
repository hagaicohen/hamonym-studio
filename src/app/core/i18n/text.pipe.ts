import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { Subscription } from 'rxjs';

// For values that are *either* a translation key or ready-made text — typically a
// message field that holds a fixed message (stored as a key) or the server's own
// error text, or a label that falls back to user data. A known key is translated
// (and re-rendered on a language switch); anything else is shown as is, so server
// text and data never turn into a missing-key marker.
//   {{ errorMessage | hmText }}    {{ 'auth.x' | hmText: { name } }}
@Pipe({ name: 'hmText', standalone: true, pure: false })
export class HmTextPipe implements PipeTransform, OnDestroy {
  private readonly transloco = inject(TranslocoService);
  private readonly sub: Subscription;

  constructor() {
    const cdr = inject(ChangeDetectorRef);
    this.sub = this.transloco.langChanges$.subscribe(() => cdr.markForCheck());
  }

  // Any interpolated value may pass through (numbers, booleans): only a known key
  // string is translated, everything else renders as Angular would render it.
  transform(value: unknown, params?: Record<string, unknown>): string {
    if (value === null || value === undefined) return '';
    if (typeof value !== 'string') return String(value);
    if (!value) return '';
    return isTranslationKey(this.transloco, value) ? this.transloco.translate(value, params) : value;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }
}

const KEY_SHAPE = /^[a-z][\w-]*(\.[\w-]+)+$/;

export function isTranslationKey(transloco: TranslocoService, value: string): boolean {
  if (!KEY_SHAPE.test(value)) return false;
  const lang = transloco.getActiveLang();
  const fallback = transloco.config.defaultLang;
  return transloco.getTranslation(lang)[value] !== undefined || transloco.getTranslation(fallback)[value] !== undefined;
}

// The same rule for code (alerts, confirms, composed labels): a known key is
// translated, anything else is returned as is.
export function textOf(transloco: TranslocoService, value: string | null | undefined, params?: Record<string, unknown>): string {
  if (!value) return '';
  return isTranslationKey(transloco, value) ? transloco.translate(value, params) : value;
}
