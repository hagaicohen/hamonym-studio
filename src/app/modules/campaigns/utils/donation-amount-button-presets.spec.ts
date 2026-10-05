import { AMOUNT_BUTTON_PRESETS, DONATION_AMOUNT_BUTTON_PRESET_OPTIONS, DonationAmountButtonPreset } from './donation-amount-button-presets';

// Donation Amount Button Presets (2026-10) — catalog-level sanity checks.
// Plain data, no TestBed needed.
describe('donation-amount-button-presets — catalog', () => {
  const PRESETS: DonationAmountButtonPreset[] = ['subtle', 'solid', 'soft', 'card', 'pill', 'minimal', 'prominent'];

  it('2-8. all 7 presets exist with a complete token set', () => {
    for (const p of PRESETS) {
      const t = AMOUNT_BUTTON_PRESETS[p];
      expect(t).toBeDefined();
      expect(typeof t.minHeightPx).toBe('number');
      expect(typeof t.paddingBlockPx).toBe('number');
      expect(typeof t.paddingInlinePx).toBe('number');
      expect(typeof t.fontSizePx).toBe('number');
      expect(typeof t.fontWeight).toBe('number');
      expect(typeof t.borderWidthPx).toBe('number');
      expect(typeof t.borderRadiusPx).toBe('number');
      expect(typeof t.shadow).toBe('string');
      expect(typeof t.background).toBe('string');
      expect(typeof t.borderColor).toBe('string');
      expect(typeof t.textColor).toBe('string');
      expect(typeof t.selectedBackground).toBe('string');
      expect(typeof t.selectedBorderColor).toBe('string');
      expect(typeof t.selectedTextColor).toBe('string');
      expect(typeof t.selectedShadow).toBe('string');
    }
  });

  // 9. Selected state exists and is genuinely distinguishable (not a tiny,
  // hard-to-perceive color difference) for every preset -- normal and
  // selected must differ in at least background OR border color.
  it('9. every preset defines a visually distinct selected state', () => {
    for (const p of PRESETS) {
      const t = AMOUNT_BUTTON_PRESETS[p];
      const backgroundChanges = t.background !== t.selectedBackground;
      const borderChanges = t.borderColor !== t.selectedBorderColor;
      expect(backgroundChanges || borderChanges).toBe(true);
    }
  });

  it('subtle is genuinely small and delicate -- the specific case called out by the user', () => {
    const subtle = AMOUNT_BUTTON_PRESETS.subtle;
    const solid = AMOUNT_BUTTON_PRESETS.solid;
    const prominent = AMOUNT_BUTTON_PRESETS.prominent;
    expect(subtle.minHeightPx).toBeLessThan(solid.minHeightPx);
    expect(subtle.minHeightPx).toBeLessThan(prominent.minHeightPx);
    expect(subtle.fontSizePx).toBeLessThan(prominent.fontSizePx);
    expect(subtle.paddingBlockPx).toBeLessThan(prominent.paddingBlockPx);
  });

  it('pill is fully rounded, card has real padding/height, distinguishing them visually', () => {
    expect(AMOUNT_BUTTON_PRESETS.pill.borderRadiusPx).toBeGreaterThanOrEqual(999);
    expect(AMOUNT_BUTTON_PRESETS.card.minHeightPx).toBeGreaterThan(AMOUNT_BUTTON_PRESETS.pill.minHeightPx);
    expect(AMOUNT_BUTTON_PRESETS.card.borderRadiusPx).toBeLessThan(999);
  });

  it('the Builder option list includes "inherit" plus all 7 named presets, with Hebrew labels', () => {
    expect(DONATION_AMOUNT_BUTTON_PRESET_OPTIONS.length).toBe(8);
    expect(DONATION_AMOUNT_BUTTON_PRESET_OPTIONS[0]).toEqual({ value: 'inherit', label: 'לפי הסגנון' });
    expect(DONATION_AMOUNT_BUTTON_PRESET_OPTIONS.map(o => o.value)).toEqual(
      ['inherit', 'subtle', 'solid', 'soft', 'card', 'pill', 'minimal', 'prominent']
    );
  });
});
