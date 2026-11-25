/** Icons of the management fields (moved verbatim from the engine). Trusted constants only. */
export const CALENDAR_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/></svg>';

export type ChoiceIcon = 'calendar' | 'infinity' | 'wallet' | 'target' | 'single' | 'match' | 'check' | 'coins';

/** Quiet, recognizable 20px stroke icons for business-model selection cards. */
const CHOICE_PATHS: Record<ChoiceIcon, string> = {
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/><path d="m8.5 15 2.2 2.2 4.8-4.8"/>',
  infinity: '<path d="M12 12c-2.7-3.7-4.5-4.7-6.2-4.7a4.2 4.2 0 0 0 0 8.4c1.7 0 3.5-1 6.2-3.7m0 0c2.7 3.7 4.5 3.7 6.2 3.7a4.2 4.2 0 0 0 0-8.4c-1.7 0-3.5 1-6.2 4.7"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2.6"/><path d="M3.5 9V5.8A2.8 2.8 0 0 1 6.3 3H18"/><path d="M15.5 13h5M16.5 13h.2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3"/>',
  single: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.2h4.1a1.8 1.8 0 0 1 0 3.6h-3.2a1.8 1.8 0 0 0 0 3.6h4"/>',
  match: '<path d="M4 7.5h12m-3-3 3 3-3 3M20 16.5H8m3-3-3 3 3 3"/><path d="M6 3.5v8M18 12.5v8"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.8 2.8L16.5 9"/>',
  coins: '<ellipse cx="9" cy="6.5" rx="5.5" ry="2.4"/><path d="M3.5 6.5v8c0 1.4 2.4 2.5 5.5 2.5 1 0 2-.1 2.8-.3M14.5 6.5v3M12 14c0-1.5 2.1-2.7 4.5-2.7s4.5 1.2 4.5 2.7-2.1 2.7-4.5 2.7S12 15.5 12 14Zm0 0v4.2c0 1.5 2.1 2.7 4.5 2.7s4.5-1.2 4.5-2.7V14"/>'
};

export function choiceIcon(kind: string): string {
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${CHOICE_PATHS[kind as ChoiceIcon] || CHOICE_PATHS.check}</svg>`;
}
