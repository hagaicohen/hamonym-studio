/**
 * Prev/next arrows and the "n / total" counter of a manager collection (old engine
 * `hamManagerCarouselInit`/`hamManagerCarouselUpdate`). The nav is part of the template; its
 * `disabled` state and counter depend on the layout, so they are measured and written here
 * (no bindings), after every list change and while the track scrolls.
 */
const CARD = '.hu-collection-card,.hu-incoming-card';

export function updateCarouselNav(track: HTMLElement, nav: HTMLElement): void {
  const cards = Array.from(track.children).filter((x): x is HTMLElement => x.matches(CARD) && !(x as HTMLElement).hidden);
  const first = cards[0], last = cards[cards.length - 1], trackRect = track.getBoundingClientRect();
  const atFirst = !first || Math.abs(first.getBoundingClientRect().right - trackRect.right) < 8;
  const atLast = !last || last.getBoundingClientRect().left >= trackRect.left - 8;
  nav.querySelector<HTMLButtonElement>('[data-hu-car-prev]')!.disabled = atFirst;
  nav.querySelector<HTMLButtonElement>('[data-hu-car-next]')!.disabled = atLast;
  const visible = cards.reduce((n, c) => n + (c.getBoundingClientRect().right > trackRect.right + 8 ? 1 : 0), 0);
  nav.querySelector('.hu-common-car-count')!.textContent = cards.length ? `${Math.min(cards.length, 1 + visible)} / ${cards.length}` : '0 / 0';
}

/** Arrow click: scroll by one card (RTL: "next" moves left). Returns the cleanup. */
export function bindCarouselNav(track: HTMLElement, nav: HTMLElement): () => void {
  const onClick = (e: Event): void => {
    const btn = (e.target as Element).closest('[data-hu-car-prev],[data-hu-car-next]');
    if (!btn) return;
    const dir = btn.hasAttribute('data-hu-car-next') ? 1 : -1;
    const card = track.querySelector('.hu-collection-card:not([hidden]),.hu-incoming-card:not([hidden])');
    const w = card?.getBoundingClientRect().width || 220;
    const gap = parseFloat(getComputedStyle(track).gap) || 10;
    track.scrollBy({ left: -dir * (w + gap), behavior: 'smooth' });
  };
  const onScroll = (): void => { requestAnimationFrame(() => updateCarouselNav(track, nav)); };
  nav.addEventListener('click', onClick);
  track.addEventListener('scroll', onScroll, { passive: true });
  return () => { nav.removeEventListener('click', onClick); track.removeEventListener('scroll', onScroll); };
}
