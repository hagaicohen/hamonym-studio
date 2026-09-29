import { resolveVisualTokens, resolveDonationComposition } from './campaign-styles';

// Phase 3B (2026-09-29) — layout personality tokens. Plain function tests,
// no TestBed needed: resolveVisualTokens/resolveDonationComposition are
// pure, take no Angular dependencies.
describe('campaign-styles — Phase 3B visual tokens', () => {
  // A. campaignStyleId === undefined -> legacy layout behavior. No visual
  // tokens at all means every CSS consumer's own var(--hm-x, <legacy>)
  // fallback applies -- no root modifier class, no CSS variable emitted.
  it('A. no campaignStyleId -> resolveVisualTokens returns undefined (legacy)', () => {
    expect(resolveVisualTokens(undefined)).toBeUndefined();
  });

  it('B. Classic -> centered / standard / balanced / classic', () => {
    const tokens = resolveVisualTokens('classic');
    expect(tokens?.hero.composition).toBe('centered');
    expect(tokens?.content.width).toBe('standard');
    expect(tokens?.section.rhythm).toBe('balanced');
    expect(tokens?.donation.composition).toBe('classic');
  });

  it('C. Editorial -> editorial / narrow / airy / classic', () => {
    const tokens = resolveVisualTokens('editorial');
    expect(tokens?.hero.composition).toBe('editorial');
    expect(tokens?.content.width).toBe('narrow');
    expect(tokens?.section.rhythm).toBe('airy');
    expect(tokens?.donation.composition).toBe('classic');
  });

  it('D. Vibrant -> split / wide / balanced / hero', () => {
    const tokens = resolveVisualTokens('vibrant');
    expect(tokens?.hero.composition).toBe('split');
    expect(tokens?.content.width).toBe('wide');
    expect(tokens?.section.rhythm).toBe('balanced');
    expect(tokens?.donation.composition).toBe('hero');
  });

  it('E. Midnight -> split / standard / balanced / hero', () => {
    const tokens = resolveVisualTokens('midnight');
    expect(tokens?.hero.composition).toBe('split');
    expect(tokens?.content.width).toBe('standard');
    expect(tokens?.section.rhythm).toBe('balanced');
    expect(tokens?.donation.composition).toBe('hero');
  });

  // F. Donation precedence — proves the exact rule approved after the
  // conversionWidgetLayout audit: explicit draft value (including the
  // literal 'classic') always wins over the Style default, which only
  // applies when the field was never touched at all (undefined).
  describe('F. donation composition precedence', () => {
    it('undefined draft value + Bold -> effective "hero" (Style default applies)', () => {
      expect(resolveDonationComposition(undefined, 'bold')).toBe('hero');
    });

    it('explicit "classic" + Bold -> effective "classic" (explicit wins, even though it looks like a default)', () => {
      expect(resolveDonationComposition('classic', 'bold')).toBe('classic');
    });

    it('explicit "unified" + Bold -> effective "unified"', () => {
      expect(resolveDonationComposition('unified', 'bold')).toBe('unified');
    });

    it('explicit "split-horizontal" + Bold -> effective "split-horizontal" (not a Style default, but still wins as an explicit choice)', () => {
      expect(resolveDonationComposition('split-horizontal', 'bold')).toBe('split-horizontal');
    });

    it('undefined draft value + no Style -> "classic" (legacy fallback)', () => {
      expect(resolveDonationComposition(undefined, undefined)).toBe('classic');
    });
  });

  // G. Style-derived donation composition must never mutate anything it's
  // given — resolveDonationComposition takes only primitive-ish values (no
  // draft/object reference at all) so it structurally cannot mutate a
  // draft, but this proves it doesn't even attempt to touch a frozen
  // options-shaped object passed through the same call pattern the real
  // renderer uses (effectiveDonationComposition() in
  // campaign-preview.component.ts reads draft.layout fields by value, same
  // as here).
  it('G. resolving a Style-derived composition does not mutate the source layout object', () => {
    const layout = Object.freeze({
      conversionWidgetLayout: undefined as string | undefined,
      campaignStyleId: 'bold' as const,
    });
    expect(() => resolveDonationComposition(layout.conversionWidgetLayout as any, layout.campaignStyleId))
      .not.toThrow();
    expect(layout.conversionWidgetLayout).toBeUndefined();
    expect(layout.campaignStyleId).toBe('bold');
  });
});
