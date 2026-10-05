import {
  resolveRoleColor, resolveRoleFontWeight, resolveRoleFontSizePx, resolveRoleFontFamily, resolveRoleAlign,
  resolveTextRole, resolveRoleBorderRadius, LEGACY_THEME_COLOR, TextRoleLegacyDefaults,
} from './text-role-resolver';
import { CampaignTheme } from '../services/campaign-studio-state.service';
import { CampaignStyleVisualTokens } from '../builder/styles/campaign-styles';

// Typography Phase A (2026-10) — the ONE shared resolver every migrated
// Text Role (Donors/Ambassadors/Stats) goes through. Plain function tests,
// no TestBed needed — every exported function here is pure.

function theme(overrides: Partial<CampaignTheme> = {}): CampaignTheme {
  return {
    primaryColor: '#333333',
    secondaryColor: LEGACY_THEME_COLOR.secondaryColor,
    accentColor: LEGACY_THEME_COLOR.accentColor,
    bodyTextColor: LEGACY_THEME_COLOR.bodyTextColor,
    logoBg: '#ffffff',
    topStripBg: '#ffffff',
    rewardsBg: '#ffffff',
    rewardCardBorder: '#e2e8f0',
    rewardCardBorderActive: '#333333',
    lineColor: '#e2e8f0',
    ...overrides,
  };
}

function tokens(headingWeight: number, headingScale: number): CampaignStyleVisualTokens {
  return {
    typography: { fontFamily: "'Heebo', sans-serif", headingWeight, headingScale },
    buttons: { radius: '8px', weight: 700, shadow: 'none' },
    cards: { radius: '12px', shadow: 'none' },
    hero: { composition: 'centered' },
    opening: { composition: 'classic' },
    content: { width: 'standard' },
    section: { rhythm: 'balanced', surface: 'plain' },
    donation: { composition: 'classic' },
  } as CampaignStyleVisualTokens;
}

describe('text-role-resolver — resolveRoleColor', () => {
  // 1. Property-level inheritance — Section override > Theme (gated) > Style/legacy.
  it('1. no override, theme untouched -> legacy literal (the role\'s own pre-existing color)', () => {
    expect(resolveRoleColor(undefined, '#0f172a', theme(), 'secondaryColor')).toBe('#0f172a');
  });

  it('1. no override, theme diverged -> theme value wins over the legacy literal', () => {
    const t = theme({ secondaryColor: '#123456' });
    expect(resolveRoleColor(undefined, '#0f172a', t, 'secondaryColor')).toBe('#123456');
  });

  // 2. Partial override — an explicit Section-level value always wins, even
  // over a diverged theme.
  it('2. explicit override wins over a diverged theme', () => {
    const t = theme({ secondaryColor: '#123456' });
    expect(resolveRoleColor('#ff00ff', '#0f172a', t, 'secondaryColor')).toBe('#ff00ff');
  });

  it('2. explicit override wins over the legacy literal when theme is untouched', () => {
    expect(resolveRoleColor('#ff00ff', '#0f172a', theme(), 'secondaryColor')).toBe('#ff00ff');
  });

  // 10. Untouched-legacy-campaign guarantee — a role with NO themeColorField
  // (donorCount) never reacts to theme at all, no matter how the theme
  // changes; it only ever shows its own legacy literal or an explicit value.
  it('10. no themeColorField -> theme changes are never picked up (pure legacy literal role)', () => {
    const t = theme({ secondaryColor: '#123456', bodyTextColor: '#abcdef', accentColor: '#fedcba' });
    expect(resolveRoleColor(undefined, '#0f172a', t)).toBe('#0f172a');
  });

  // 13. bodyTextColor gating still intact — the exact mechanism
  // sectionBodyTextColor()/statsTitleColor() already proved in Phase 1,
  // generalized here for every role that gates on bodyTextColor.
  it('13. bodyTextColor gate: untouched -> legacy caption literal, not the theme default', () => {
    expect(resolveRoleColor(undefined, '#94a3b8', theme(), 'bodyTextColor')).toBe('#94a3b8');
  });
  it('13. bodyTextColor gate: diverged -> theme value flows through', () => {
    const t = theme({ bodyTextColor: '#222222' });
    expect(resolveRoleColor(undefined, '#94a3b8', t, 'bodyTextColor')).toBe('#222222');
  });

  // 11. Two-instance-no-collision — resolveRoleColor is a pure function of
  // its own arguments; two independent calls (standing in for two
  // instances of a genuinely repeatable block type, e.g. two 'stats'
  // blocks) never leak state into each other.
  it('11. two independent calls with different overrides never collide', () => {
    const t = theme();
    const instanceA = resolveRoleColor('#111111', '#0f172a', t, 'secondaryColor');
    const instanceB = resolveRoleColor('#222222', '#0f172a', t, 'secondaryColor');
    expect(instanceA).toBe('#111111');
    expect(instanceB).toBe('#222222');
  });
});

describe('text-role-resolver — resolveRoleFontWeight / resolveRoleFontSizePx', () => {
  it('1. non-heading role ignores Style tokens entirely, even when provided', () => {
    expect(resolveRoleFontWeight(undefined, 800, tokens(400, 1.1), false)).toBe(800);
    expect(resolveRoleFontSizePx(undefined, 15, tokens(400, 1.1), false)).toBe(15);
  });

  it('1. heading-class role without an override scales with the Style\'s own tokens', () => {
    expect(resolveRoleFontWeight(undefined, 900, tokens(700, 1.1), true)).toBe(700);
    expect(resolveRoleFontSizePx(undefined, 20, tokens(700, 1.1), true)).toBe(22); // 20 * 1.1
  });

  // 5. Style-change-with-override — an explicit override is immune to the
  // Campaign Style changing underneath it.
  it('5. explicit override is unaffected by a Style change (heading tokens never apply)', () => {
    expect(resolveRoleFontWeight(950, 900, tokens(700, 1.1), true)).toBe(950);
    expect(resolveRoleFontSizePx('xl', 20, tokens(700, 1.1), true)).toBe(26);
  });
});

describe('text-role-resolver — resolveRoleFontFamily / resolveRoleAlign', () => {
  it('no override -> "inherit" (the Style\'s own fontFamily already cascades via plain CSS)', () => {
    expect(resolveRoleFontFamily(undefined)).toBe('inherit');
  });
  it('explicit override -> that exact value', () => {
    expect(resolveRoleFontFamily("'Assistant', 'Heebo', sans-serif")).toBe("'Assistant', 'Heebo', sans-serif");
  });
  it('align defaults to "right" when the role has no legacy align and nothing is overridden', () => {
    expect(resolveRoleAlign(undefined)).toBe('right');
  });
  it('explicit align wins over the role\'s own legacy default', () => {
    expect(resolveRoleAlign('center', 'right')).toBe('center');
  });
});

describe('text-role-resolver — resolveTextRole (composition)', () => {
  const legacy: TextRoleLegacyDefaults = {
    color: '#0f172a', fontSizePx: 15, fontWeight: 800, align: 'right',
    themeColorField: 'secondaryColor', headingClass: false,
  };

  it('2. partial override only touches the properties it sets, others fall through', () => {
    const resolved = resolveTextRole({ fontWeight: 950 }, legacy, theme(), undefined);
    expect(resolved.fontWeight).toBe(950);
    expect(resolved.color).toBe('#0f172a'); // untouched -> legacy literal
    expect(resolved.fontSizePx).toBe(15);
    expect(resolved.fontFamily).toBe('inherit');
    expect(resolved.align).toBe('right');
  });

  // 6. Theme-change-with-override — an explicit color override on the role
  // is immune to the Theme changing underneath it.
  it('6. explicit color override is unaffected by a Theme change', () => {
    const resolved = resolveTextRole({ color: '#ff00ff' }, legacy, theme({ secondaryColor: '#123456' }), undefined);
    expect(resolved.color).toBe('#ff00ff');
  });
});

// Universal Local Styling Phase B1 (2026-10) — the non-text resolver
// primitive. Every color property on surface/button/progress roles reuses
// resolveRoleColor() as-is (already covered above); resolveRoleBorderRadius
// is the one new function, following the exact same
// explicit > Style-token > legacy chain.
describe('text-role-resolver — resolveRoleBorderRadius (surface/button roles)', () => {
  // 1/2. Property-level inheritance + explicit override.
  it('1. no explicit value, no Style -> legacy px', () => {
    expect(resolveRoleBorderRadius(undefined, 16, undefined, 'cards')).toBe(16);
  });

  it('1. no explicit value, Style present -> the Style\'s own cards.radius token', () => {
    const vt = tokens(700, 1.0);
    vt.cards.radius = '12px';
    expect(resolveRoleBorderRadius(undefined, 16, vt, 'cards')).toBe(12);
  });

  it('2. explicit value always wins, even over a real Style token', () => {
    const vt = tokens(700, 1.0);
    vt.cards.radius = '12px';
    expect(resolveRoleBorderRadius(30, 16, vt, 'cards')).toBe(30);
  });

  it('picks buttons.radius vs cards.radius correctly by kind', () => {
    const vt = tokens(700, 1.0);
    vt.cards.radius = '12px';
    vt.buttons.radius = '20px';
    expect(resolveRoleBorderRadius(undefined, 0, vt, 'cards')).toBe(12);
    expect(resolveRoleBorderRadius(undefined, 0, vt, 'buttons')).toBe(20);
  });

  // 6. Style-change immunity — same guarantee as color/weight: an explicit
  // override never reacts to a Style token change.
  it('6. explicit override survives a Style change (never re-derives from the new token)', () => {
    const royal = tokens(700, 1.05); royal.cards.radius = '10px';
    const community = tokens(700, 1.0); community.cards.radius = '24px';
    expect(resolveRoleBorderRadius(14, 16, royal, 'cards')).toBe(14);
    expect(resolveRoleBorderRadius(14, 16, community, 'cards')).toBe(14);
  });

  // 7. Untouched campaign — no explicit value tracks the Style's token
  // exactly, so an untouched block always matches what a plain var(--hm-
  // card-radius) binding would have shown.
  it('7. untouched: tracks the Style token exactly across a Style change', () => {
    const royal = tokens(700, 1.05); royal.cards.radius = '10px';
    const community = tokens(700, 1.0); community.cards.radius = '24px';
    expect(resolveRoleBorderRadius(undefined, 16, royal, 'cards')).toBe(10);
    expect(resolveRoleBorderRadius(undefined, 16, community, 'cards')).toBe(24);
  });
});
