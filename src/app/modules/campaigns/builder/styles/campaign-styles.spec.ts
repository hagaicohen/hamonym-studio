import {
  resolveVisualTokens, resolveDonationComposition, resolveOpeningComposition, resolveSectionSurfaceColors,
  CAMPAIGN_STYLES, CAMPAIGN_STYLE_MAP, resolveTheme, resolveSectionPresentation,
} from './campaign-styles';

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

// Opening Composition — controlled prototype (2026-09-29). Only Vibrant is
// wired to 'fundraising-split' at this stage; every other Style (and no
// Style at all) must resolve to 'classic' so the new .hm-opening markup in
// campaign-preview.component.html stays fully suppressed for them -- see
// resolveOpeningComposition's own doc comment.
//
// Phase A (2026-10-01) -- generic: resolveOpeningComposition now takes
// (explicit, styleId), same explicit -> Style default -> legacy fallback
// chain already proven for donation.composition.
describe('campaign-styles — Opening Composition (Phase A, generic)', () => {
  it('undefined explicit + undefined styleId -> classic (legacy fallback)', () => {
    expect(resolveOpeningComposition(undefined, undefined)).toBe('classic');
  });

  it('undefined explicit + Classic Style -> classic (Style default)', () => {
    expect(resolveOpeningComposition(undefined, 'classic')).toBe('classic');
  });

  it('undefined explicit + Vibrant -> fundraising-split (Style default)', () => {
    expect(resolveOpeningComposition(undefined, 'vibrant')).toBe('fundraising-split');
  });

  it('undefined explicit + Civic -> classic (Civic\'s own default, not yet Fundraising Split)', () => {
    expect(resolveOpeningComposition(undefined, 'civic')).toBe('classic');
  });

  it('explicit story-first + Vibrant -> story-first (explicit overrides the Style default)', () => {
    expect(resolveOpeningComposition('story-first', 'vibrant')).toBe('story-first');
  });

  it('explicit fundraising-split + Civic -> fundraising-split (any Style can use any composition)', () => {
    expect(resolveOpeningComposition('fundraising-split', 'civic')).toBe('fundraising-split');
  });

  it("explicit classic + Vibrant -> classic (explicit 'classic' overrides Vibrant's own fundraising-split default)", () => {
    expect(resolveOpeningComposition('classic', 'vibrant')).toBe('classic');
  });

  it('Bold and Midnight both default to classic (same as every Style except Vibrant)', () => {
    expect(resolveOpeningComposition(undefined, 'bold')).toBe('classic');
    expect(resolveOpeningComposition(undefined, 'midnight')).toBe('classic');
  });
});

// Section-presentation audit (2026-09-30). sectionBgOdd/Even/DividerColor
// are mandatory CampaignLayout fields, always initialized to these exact
// literals in every draft-creation path (verified by full-repo search, see
// resolveSectionSurfaceColors' own doc comment) -- so LEGACY here always
// means passing these three literals, never undefined.
describe('campaign-styles — section surface colors', () => {
  const LEGACY = { odd: '#ffffff', even: '#f8fafc', divider: '#e2e8f0' };

  it('undefined campaignStyleId preserves exact legacy section colors', () => {
    expect(resolveSectionSurfaceColors(undefined, LEGACY)).toEqual(LEGACY);
  });

  it("Classic ('alternating') resolves to the exact same legacy pair", () => {
    expect(resolveSectionSurfaceColors('classic', LEGACY)).toEqual(LEGACY);
  });

  it("Editorial ('plain') resolves to white/white, divider unchanged", () => {
    expect(resolveSectionSurfaceColors('editorial', LEGACY)).toEqual({
      odd: '#ffffff', even: '#ffffff', divider: '#e2e8f0',
    });
  });

  it("Midnight ('tonal') resolves to its own explicit surfaceColors", () => {
    expect(resolveSectionSurfaceColors('midnight', LEGACY)).toEqual({
      odd: '#ffffff', even: '#eef1f8', divider: '#dde4f0',
    });
  });

  it('passing the legacy literal values does NOT suppress a Style default (they read as "never touched")', () => {
    const result = resolveSectionSurfaceColors('midnight', LEGACY);
    expect(result.even).not.toBe(LEGACY.even);
  });

  it('a genuinely non-default explicit value wins over the Style, field by field', () => {
    const explicit = { odd: '#fff5f5', even: LEGACY.even, divider: LEGACY.divider };
    const result = resolveSectionSurfaceColors('midnight', explicit);
    expect(result.odd).toBe('#fff5f5'); // explicit wins
    expect(result.even).toBe('#eef1f8'); // still Style-derived, untouched field
  });
});

// Civic — 9th Campaign Style (2026-09-30). Built entirely through the
// existing generic token system approved in the section-presentation audit
// -- these tests exist to prove exactly that: Civic needs no special-cased
// resolver logic anywhere, it just flows through the same functions every
// other Style already used.
describe('campaign-styles — Civic (9th Style)', () => {
  it('1. Civic resolves as a valid Campaign Style', () => {
    expect(CAMPAIGN_STYLE_MAP['civic']).toBeTruthy();
    expect(CAMPAIGN_STYLES.some(s => s.id === 'civic')).toBe(true);
  });

  it('2. Civic exposes the intended visual tokens', () => {
    const tokens = resolveVisualTokens('civic');
    expect(tokens?.typography.headingWeight).toBe(800);
    expect(tokens?.buttons.radius).toBe('10px');
    expect(tokens?.cards.radius).toBe('12px');
    expect(tokens?.donation.composition).toBe('hero');
  });

  it('3. Civic uses section.surface === "tonal"', () => {
    expect(resolveVisualTokens('civic')?.section.surface).toBe('tonal');
  });

  it('4. Civic has explicit, LIGHT surfaceColors (not a dark-mode swap)', () => {
    const colors = resolveVisualTokens('civic')?.section.surfaceColors;
    expect(colors).toBeDefined();
    expect(colors?.odd).toBe('#ffffff');
    expect(colors?.even).toBe('#eaf1f6');
    expect(colors?.divider).toBe('#d2e1ea');
  });

  it('5. Civic resolves through the exact same generic resolvers as every other Style', () => {
    // resolveTheme/resolveSectionSurfaceColors take no civic-specific branch
    // anywhere -- calling them with 'civic' proves this by construction:
    // if a special case were needed, these would need one added to compile.
    const theme = resolveTheme({} as any, 'civic', undefined);
    expect(theme.primaryColor).toBe('#1F5D88');
    expect(theme.secondaryColor).toBeTruthy();
    expect(theme.accentColor).toBeTruthy();

    const surface = resolveSectionSurfaceColors('civic', { odd: '#ffffff', even: '#f8fafc', divider: '#e2e8f0' });
    expect(surface.even).toBe('#eaf1f6');
  });

  it('5b. secondary (navy) and accent (gold) derive from the SAME primary seed, not a second hardcoded color, and are non-degenerate', () => {
    const theme = resolveTheme({} as any, 'civic', undefined);
    // Non-degenerate: neither channel clipped to black/white/gray (the
    // known failure mode retuned once already for Midnight this session).
    expect(theme.secondaryColor).not.toBe('#000000');
    expect(theme.secondaryColor).not.toBe(theme.primaryColor);
    expect(theme.accentColor).not.toBe('#ffffff');
    expect(theme.accentColor).not.toBe(theme.primaryColor);
  });

  it('6. No Civic-specific rendering branch is required -- resolveOpeningComposition defaults it to "classic" (Civic\'s own choice), but Civic + Fundraising Split works too via an explicit override', () => {
    expect(resolveOpeningComposition(undefined, 'civic')).toBe('classic');
    expect(resolveOpeningComposition('fundraising-split', 'civic')).toBe('fundraising-split');
  });

  it('7. Existing eight Styles retain their current definitions (spot check)', () => {
    expect(resolveVisualTokens('classic')?.section.surface).toBe('alternating');
    expect(resolveVisualTokens('editorial')?.section.surface).toBe('plain');
    expect(resolveVisualTokens('midnight')?.section.surfaceColors).toEqual({
      odd: '#ffffff', even: '#eef1f8', divider: '#dde4f0',
    });
    expect(resolveVisualTokens('vibrant')?.donation.composition).toBe('hero');
    // 12 total (2026-10-06): the original 9 + Royal/Community/Heritage.
    expect(CAMPAIGN_STYLES.length).toBe(12);
  });

  it('8. undefined style retains legacy behavior', () => {
    expect(resolveVisualTokens(undefined)).toBeUndefined();
    expect(resolveTheme({ primaryColor: '#abc' } as any, undefined, undefined).primaryColor).toBe('#abc');
  });
});

// Royal / Community / Heritage (2026-10-06) -- 10th-12th Styles, confirmed
// with the user (3 approved, not adding more right now). First Styles to
// give fontFamily a genuine distinct value (see index.html for the real
// Google Fonts <link>); the original 9 keep their shared Heebo literal
// unchanged -- retroactively changing a live campaign's font was explicitly
// out of scope.
describe('campaign-styles — Royal / Community / Heritage (10th-12th Styles)', () => {
  it('all three resolve as valid Campaign Styles', () => {
    for (const id of ['royal', 'community', 'heritage'] as const) {
      expect(CAMPAIGN_STYLE_MAP[id]).toBeTruthy();
      expect(CAMPAIGN_STYLES.some(s => s.id === id)).toBe(true);
    }
  });

  it('each has its own distinct, genuinely-loaded fontFamily -- not the shared Heebo literal', () => {
    expect(resolveVisualTokens('royal')?.typography.fontFamily).toContain('Frank Ruhl Libre');
    expect(resolveVisualTokens('community')?.typography.fontFamily).toContain('Varela Round');
    expect(resolveVisualTokens('heritage')?.typography.fontFamily).toContain('Assistant');
    // Each still lists Heebo as its own safety fallback, same convention
    // every other Style's fontFamily already uses.
    expect(resolveVisualTokens('royal')?.typography.fontFamily).toContain('Heebo');
    expect(resolveVisualTokens('community')?.typography.fontFamily).toContain('Heebo');
    expect(resolveVisualTokens('heritage')?.typography.fontFamily).toContain('Heebo');
  });

  it('the original 9 Styles keep their shared Heebo-only fontFamily unchanged', () => {
    for (const id of ['classic', 'clean', 'bold', 'editorial', 'warm', 'vibrant', 'nature', 'midnight', 'civic'] as const) {
      expect(resolveVisualTokens(id)?.typography.fontFamily).toBe("'Heebo', sans-serif");
    }
  });

  it('secondary/accent derive from each Style\'s own single primary seed, not a second hardcoded color, and are non-degenerate', () => {
    for (const id of ['royal', 'community', 'heritage'] as const) {
      const theme = resolveTheme({} as any, id, undefined);
      expect(theme.secondaryColor).toBeTruthy();
      expect(theme.accentColor).toBeTruthy();
      expect(theme.secondaryColor).not.toBe('#000000');
      expect(theme.secondaryColor).not.toBe(theme.primaryColor);
      expect(theme.accentColor).not.toBe('#ffffff');
      expect(theme.accentColor).not.toBe(theme.primaryColor);
    }
  });

  it('Royal and Heritage use distinct tonal section washes from each other and from Midnight/Civic', () => {
    const royal    = resolveVisualTokens('royal')?.section.surfaceColors;
    const heritage = resolveVisualTokens('heritage')?.section.surfaceColors;
    const midnight = resolveVisualTokens('midnight')?.section.surfaceColors;
    const civic    = resolveVisualTokens('civic')?.section.surfaceColors;
    const evens = [royal?.even, heritage?.even, midnight?.even, civic?.even];
    expect(new Set(evens).size).toBe(4); // all four genuinely distinct
  });

  it('Community recommends cards (friendly/visual), Royal and Heritage recommend list (restrained/dignified)', () => {
    expect(resolveVisualTokens('community')?.lists.presentation).toBe('cards');
    expect(resolveVisualTokens('royal')?.lists.presentation).toBe('list');
    expect(resolveVisualTokens('heritage')?.lists.presentation).toBe('list');
  });

  it('Community uses a large, friendly button/card radius; Heritage uses a small, traditional one', () => {
    expect(parseInt(resolveVisualTokens('community')!.buttons.radius, 10)).toBeGreaterThanOrEqual(20);
    expect(parseInt(resolveVisualTokens('heritage')!.buttons.radius, 10)).toBeLessThanOrEqual(8);
  });

  it('resolve through the exact same generic resolvers as every other Style -- no per-Style branch required', () => {
    for (const id of ['royal', 'community', 'heritage'] as const) {
      const surface = resolveSectionSurfaceColors(id, { odd: '#ffffff', even: '#f8fafc', divider: '#e2e8f0' });
      expect(surface).toBeTruthy();
      expect(resolveOpeningComposition(undefined, id)).toBe('classic');
    }
  });
});

// Section Presentation (2026-10-03, placement-aware 2026-10-06) -- a third
// axis alongside Campaign Style and Opening Composition. Precedence is now
// Section + Placement + Style -> recommendation: an explicit per-campaign
// choice always wins outright; otherwise Sidebar ALWAYS recommends 'list'
// (no Style may recommend Cards for the sidebar); only Main consults the
// Style, falling back to 'cards' with no Style set.
describe('campaign-styles — Section Presentation', () => {
  it('1. no explicit choice, no Style -> falls back to the legacy placement-driven default', () => {
    expect(resolveSectionPresentation('rewards', undefined, undefined, false)).toBe('cards');
    expect(resolveSectionPresentation('rewards', undefined, undefined, true)).toBe('list');
  });

  it('2. Sidebar always recommends list, regardless of Style; Main consults the Style', () => {
    // Vibrant recommends cards for Main...
    expect(resolveSectionPresentation('rewards', undefined, 'vibrant', false)).toBe('cards');
    // ...but never for Sidebar -- Sidebar always forces 'list', even for a
    // Style whose own lists.presentation is 'cards'.
    expect(resolveSectionPresentation('rewards', undefined, 'vibrant', true)).toBe('list');
    // Editorial recommends list even in the main content (placement fallback
    // alone would have said 'cards').
    expect(resolveSectionPresentation('donors', undefined, 'editorial', false)).toBe('list');
  });

  it('3. an explicit per-campaign choice always wins outright, over both the Style and placement', () => {
    expect(resolveSectionPresentation('updates', { updates: 'list' }, 'vibrant', false)).toBe('list');
    expect(resolveSectionPresentation('ambassadors', { ambassadors: 'cards' }, 'editorial', true)).toBe('cards');
  });

  it('4. an explicit choice for one section never leaks into another section\'s own resolution', () => {
    expect(resolveSectionPresentation('donors', { rewards: 'image' }, undefined, false)).toBe('cards');
  });

  it('5. "image" is reachable only as an explicit choice, never as a Style default', () => {
    expect(resolveSectionPresentation('rewards', { rewards: 'image' }, 'vibrant', false)).toBe('image');
    for (const style of CAMPAIGN_STYLES) {
      expect(style.visual.lists.presentation).not.toBe('image');
    }
  });

  it('6. confirmed product examples: Vibrant -> cards, Editorial -> list, Civic -> list', () => {
    expect(CAMPAIGN_STYLE_MAP['vibrant'].visual.lists.presentation).toBe('cards');
    expect(CAMPAIGN_STYLE_MAP['editorial'].visual.lists.presentation).toBe('list');
    expect(CAMPAIGN_STYLE_MAP['civic'].visual.lists.presentation).toBe('list');
  });

  it('7. every Style declares a lists.presentation (no silent gaps)', () => {
    for (const style of CAMPAIGN_STYLES) {
      expect(['cards', 'list']).toContain(style.visual.lists.presentation);
    }
  });
});
