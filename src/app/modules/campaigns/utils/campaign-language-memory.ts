import type { ContentLang } from './content-i18n';

// The language a visitor reads a campaign in, kept for this browser tab so the
// pages a donation passes through (the payment provider's return to the success
// page, "back to the campaign") stay in it (D-44). Only the language and the
// campaign title in it are kept; nothing the donor typed.
const KEY = (slug: string) => `hamonym:campaign-lang:${slug}`;

export interface RememberedCampaignLanguage {
  lang: ContentLang;
  title?: string;
}

export function rememberCampaignLanguage(slug: string, lang: ContentLang, title?: string): void {
  try {
    if (lang === 'he') sessionStorage.removeItem(KEY(slug));
    else sessionStorage.setItem(KEY(slug), JSON.stringify({ lang, title }));
  } catch { /* Storage unavailable: the ?lang= link still carries the language. */ }
}

export function recallCampaignLanguage(slug: string): RememberedCampaignLanguage | null {
  try {
    const raw = sessionStorage.getItem(KEY(slug));
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && v.lang === 'en' ? { lang: 'en', title: typeof v.title === 'string' ? v.title : undefined } : null;
  } catch {
    return null;
  }
}

// `?lang=en` is the stable public link to the English version; anything else is Hebrew.
export function langParam(value: string | null | undefined): ContentLang | null {
  return value === 'en' ? 'en' : value === 'he' ? 'he' : null;
}
