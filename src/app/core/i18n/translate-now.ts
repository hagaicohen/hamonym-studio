import { TranslocoService } from '@jsverse/transloco';
import { textOf } from './text.pipe';

// Translation for code that runs at the moment of an action (alerts, confirms,
// messages built in a method, document titles), in the interface language.
// Static label maps keep translation keys instead and are rendered with
// `hmText`, so they follow a language switch (D-36). Bound once at startup
// (i18n.providers.ts); before that, and in a test without i18n, the value is
// returned unchanged.
//   alert(t('platform.users.saved'))     this.error = t('x.failed', { name })
let service: TranslocoService | null = null;

export function bindTranslateNow(transloco: TranslocoService | null): void {
  service = transloco;
}

export function t(value: string, params?: Record<string, unknown>): string {
  return service ? textOf(service, value, params) : value;
}
