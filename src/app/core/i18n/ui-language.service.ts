import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { I18N_FLAGS } from '../../../environments/i18n-flags';

export type UiLang = 'he' | 'en';
export type UiDir = 'rtl' | 'ltr';

export const UI_LANGS: readonly UiLang[] = ['he', 'en'];
export const DEFAULT_UI_LANG: UiLang = 'he';
export const UI_LANG_STORAGE_KEY = 'hm.ui.lang';

export const dirFor = (lang: UiLang): UiDir => (lang === 'he' ? 'rtl' : 'ltr');

// The single owner of the interface language and direction
// (docs/BILINGUAL-I18N-ROADMAP.md §2.3). Nothing else writes <html lang/dir>
// or the active Transloco language.
//
// - `preferred` is the viewer's choice (persisted per device).
// - `lang` is what is actually shown: Hebrew whenever English is disabled by
//   the kill switch or the current route is not bilingual yet (see
//   route-language.ts), so pages that still contain hard-coded Hebrew keep
//   their exact current Hebrew/RTL rendering.
// - Hebrew is the default; the browser language is deliberately ignored (D-03).
@Injectable({ providedIn: 'root' })
export class UiLanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  readonly englishEnabled = I18N_FLAGS.englishEnabled;
  readonly preferred = signal<UiLang>(this.englishEnabled ? readStoredLang() : DEFAULT_UI_LANG);
  // False while the current route has no translated version yet.
  readonly routeBilingual = signal(false);

  readonly lang = computed<UiLang>(() =>
    this.englishEnabled && this.routeBilingual() ? this.preferred() : DEFAULT_UI_LANG);
  readonly dir = computed<UiDir>(() => dirFor(this.lang()));
  // The selector shows the preference, and notes when this page is Hebrew-only.
  readonly hebrewOnlyHere = computed(() => this.englishEnabled && this.preferred() !== this.lang());

  private applied: UiLang | null = null;

  // Loads the dictionaries the current language needs (Hebrew is always the
  // fallback) and applies it before the first render. Called from an
  // APP_INITIALIZER, so the first paint is already in the right language.
  async init(): Promise<void> {
    await this.ensureLoaded(DEFAULT_UI_LANG);
    if (this.preferred() !== DEFAULT_UI_LANG) await this.ensureLoaded(this.preferred());
    await this.apply();
  }

  async setLanguage(lang: UiLang): Promise<void> {
    if (!UI_LANGS.includes(lang)) return;
    if (lang !== DEFAULT_UI_LANG && !this.englishEnabled) return;
    await this.ensureLoaded(lang);
    this.preferred.set(lang);
    writeStoredLang(lang);
    await this.apply();
  }

  setRouteBilingual(value: boolean): void {
    if (this.routeBilingual() === value) return;
    this.routeBilingual.set(value);
    void this.apply();
  }

  private async ensureLoaded(lang: UiLang): Promise<void> {
    await firstValueFrom(this.transloco.load(lang));
  }

  // A non-default language is applied only once its dictionary is loaded;
  // until then Hebrew stays on screen (never raw keys). When it is already
  // loaded the switch is synchronous, so a navigation never flashes the old language.
  private apply(): Promise<void> {
    const lang = this.lang();
    if (lang === this.applied) return Promise.resolve();
    if (this.isLoaded(lang)) {
      this.commit(lang);
      return Promise.resolve();
    }
    return this.ensureLoaded(lang).then(() => {
      if (this.lang() === lang) this.commit(lang);
    });
  }

  private isLoaded(lang: UiLang): boolean {
    return Object.keys(this.transloco.getTranslation(lang) ?? {}).length > 0;
  }

  private commit(lang: UiLang): void {
    this.applied = lang;
    const root = this.document.documentElement;
    root.lang = lang;
    root.dir = dirFor(lang);
    this.transloco.setActiveLang(lang);
  }
}

function readStoredLang(): UiLang {
  try {
    const v = localStorage.getItem(UI_LANG_STORAGE_KEY);
    return v === 'en' || v === 'he' ? v : DEFAULT_UI_LANG;
  } catch {
    return DEFAULT_UI_LANG;
  }
}

function writeStoredLang(lang: UiLang): void {
  try { localStorage.setItem(UI_LANG_STORAGE_KEY, lang); } catch { /* storage unavailable: the choice lasts for this page view */ }
}
