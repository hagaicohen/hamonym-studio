// Donation Amount Button Presets (2026-10) — a controlled, closed set of
// visual personalities for the donation amount-preset buttons (50/100/180/
// 360 ₪ etc.), NOT a free-form button designer. Each preset is a complete,
// hand-tuned bundle of semantic properties (sizing/typography/chrome/
// selected-state) rather than a single color — picking one is a design
// decision, not a color swatch. undefined/'inherit' means "no preset" —
// today's exact legacy/composition-driven rendering, untouched.
//
// These are deliberately NOT persisted as resolved CSS — only the preset
// NAME is ever written to campaign data (DonationWidgetBlockData
// .amountButtonPreset). This catalog is looked up at render/edit time, so
// refining a preset's exact pixel values later never requires a data
// migration.

export type DonationAmountButtonPreset = 'subtle' | 'solid' | 'soft' | 'card' | 'pill' | 'minimal' | 'prominent';

export interface AmountButtonPresetTokens {
  minHeightPx:    number;
  paddingBlockPx: number;
  paddingInlinePx: number;
  fontSizePx:     number;
  fontWeight:     number;
  borderWidthPx:  number;
  borderRadiusPx: number;
  shadow:         string;
  background:     string;
  borderColor:    string;
  textColor:      string;
  selectedBackground:  string;
  selectedBorderColor: string;
  selectedTextColor:   string;
  selectedShadow:      string;
}

export const AMOUNT_BUTTON_PRESETS: Record<DonationAmountButtonPreset, AmountButtonPresetTokens> = {
  // SUBTLE — small, quiet, delicate. Explicitly the preset the user most
  // wanted available: a genuinely small/solid/delicate amount button,
  // which today's one fixed legacy look never offered.
  subtle: {
    minHeightPx: 34, paddingBlockPx: 6, paddingInlinePx: 4,
    fontSizePx: 12, fontWeight: 700,
    borderWidthPx: 1, borderRadiusPx: 6, shadow: 'none',
    background: '#ffffff', borderColor: '#e7ebf0', textColor: '#475569',
    selectedBackground: '#eef2f6', selectedBorderColor: '#94a3b8', selectedTextColor: '#1e293b', selectedShadow: 'none',
  },
  // SOLID — clean, compact, confident. Close to today's legacy look, now
  // reachable as an explicit, named, resettable choice.
  solid: {
    minHeightPx: 46, paddingBlockPx: 12, paddingInlinePx: 4,
    fontSizePx: 14, fontWeight: 800,
    borderWidthPx: 1.5, borderRadiusPx: 8, shadow: 'none',
    background: '#ffffff', borderColor: '#dbe3ea', textColor: '#0f2747',
    selectedBackground: '#0f2747', selectedBorderColor: '#0f2747', selectedTextColor: '#ffffff', selectedShadow: '0 4px 12px rgba(15,39,71,0.2)',
  },
  // SOFT — friendly, rounded, tinted rather than bordered.
  soft: {
    minHeightPx: 46, paddingBlockPx: 13, paddingInlinePx: 6,
    fontSizePx: 14, fontWeight: 700,
    borderWidthPx: 0, borderRadiusPx: 14, shadow: 'none',
    background: '#f1f5f9', borderColor: 'transparent', textColor: '#334155',
    selectedBackground: '#dbeafe', selectedBorderColor: 'transparent', selectedTextColor: '#1d4ed8', selectedShadow: 'none',
  },
  // CARD — each amount choice reads as its own selectable card.
  card: {
    minHeightPx: 64, paddingBlockPx: 16, paddingInlinePx: 10,
    fontSizePx: 16, fontWeight: 800,
    borderWidthPx: 1.5, borderRadiusPx: 14, shadow: '0 1px 3px rgba(15,23,42,0.06)',
    background: '#ffffff', borderColor: '#e2e8f0', textColor: '#0f172a',
    selectedBackground: '#ffffff', selectedBorderColor: '#0f2747', selectedTextColor: '#0f2747', selectedShadow: '0 4px 14px rgba(15,39,71,0.15)',
  },
  // PILL — rounded modern chips.
  pill: {
    minHeightPx: 40, paddingBlockPx: 9, paddingInlinePx: 8,
    fontSizePx: 14, fontWeight: 700,
    borderWidthPx: 1.5, borderRadiusPx: 999, shadow: 'none',
    background: '#ffffff', borderColor: '#dbe3ea', textColor: '#0f2747',
    selectedBackground: '#0f2747', selectedBorderColor: '#0f2747', selectedTextColor: '#ffffff', selectedShadow: 'none',
  },
  // MINIMAL — almost no chrome. Selected state still gets a real
  // background tint (not just a border-color swap) so it stays
  // unmistakable even with borderWidth effectively 0 in its resting state.
  minimal: {
    minHeightPx: 32, paddingBlockPx: 6, paddingInlinePx: 2,
    fontSizePx: 13, fontWeight: 700,
    borderWidthPx: 0, borderRadiusPx: 2, shadow: 'none',
    background: 'transparent', borderColor: 'transparent', textColor: '#475569',
    selectedBackground: '#f1f5f9', selectedBorderColor: '#0f2747', selectedTextColor: '#0f2747', selectedShadow: 'none',
  },
  // PROMINENT — fundraising-forward, highly visible.
  prominent: {
    minHeightPx: 56, paddingBlockPx: 16, paddingInlinePx: 6,
    fontSizePx: 17, fontWeight: 900,
    borderWidthPx: 2, borderRadiusPx: 10, shadow: '0 2px 8px rgba(15,39,71,0.12)',
    background: '#ffffff', borderColor: '#0f2747', textColor: '#0f2747',
    selectedBackground: '#0f2747', selectedBorderColor: '#0f2747', selectedTextColor: '#ffffff', selectedShadow: '0 6px 18px rgba(15,39,71,0.3)',
  },
};

export const DONATION_AMOUNT_BUTTON_PRESET_OPTIONS: { value: DonationAmountButtonPreset | 'inherit'; label: string }[] = [
  { value: 'inherit',  label: 'לפי הסגנון' },
  { value: 'subtle',   label: 'עדין' },
  { value: 'solid',    label: 'סולידי' },
  { value: 'soft',     label: 'רך' },
  { value: 'card',     label: 'כרטיסים' },
  { value: 'pill',     label: 'גלולה' },
  { value: 'minimal',  label: 'מינימלי' },
  { value: 'prominent', label: 'מודגש' },
];
