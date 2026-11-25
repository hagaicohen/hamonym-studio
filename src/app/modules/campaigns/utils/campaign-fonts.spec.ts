import { CampaignStudioStateService } from '../services/campaign-studio-state.service';
import { elementFont, setElementFont, CAMPAIGN_FONTS, fontByStack, fontById, fontsFor, setTypographyFont, typographyVars } from './campaign-fonts';
import { resolveRoleAlign } from './text-role-resolver';

// Campaign typography per content language (D-46, D-47) and alignment (D-48).
describe('campaign-fonts', () => {
  const draft = () => structuredClone(new CampaignStudioStateService().draft);

  it('offers the required Hebrew and English fonts, more besides, and Calibri as a system stack only', () => {
    const he = fontsFor('he').map(f => f.name);
    const en = fontsFor('en').map(f => f.name);
    for (const name of ['Heebo', 'Assistant', 'Rubik', 'Alef', 'Noto Sans Hebrew']) expect(he).toContain(name);
    for (const name of ['Calibri', 'Inter', 'Open Sans', 'Lato', 'Montserrat', 'Georgia']) expect(en).toContain(name);
    expect(he.length).toBeGreaterThan(5);
    expect(en.length).toBeGreaterThan(6);
    const calibri = fontById('calibri')!;
    expect(calibri.source).toBe('system');
    expect(calibri.google).toBeUndefined();
    expect(calibri.stack).toContain('Carlito');
    expect(CAMPAIGN_FONTS.filter(f => f.source === 'google').every(f => !!f.google)).toBeTrue();
  });

  it('keeps the four stacks stored before the catalog as catalog values', () => {
    for (const stack of ["'Heebo', sans-serif", "'Frank Ruhl Libre', 'Heebo', serif", "'Varela Round', 'Heebo', sans-serif", "'Assistant', 'Heebo', sans-serif"]) {
      expect(CAMPAIGN_FONTS.some(f => f.stack === stack)).withContext(stack).toBeTrue();
    }
    expect(fontByStack("'Rubik', 'Heebo', sans-serif")?.id).toBe('rubik');
  });

  it('an existing campaign sets no font variable at all', () => {
    const vars = typographyVars(draft(), 'he');
    expect(vars).toEqual({ headings: null, subtitles: null, body: null, buttons: null });
  });

  it('each language has its own fonts; subtitles and buttons follow the body', () => {
    const d = draft();
    d.layout.typography = setTypographyFont(setTypographyFont(undefined, 'en', 'body', 'calibri'), 'he', 'headings', 'rubik');
    const en = typographyVars(d, 'en');
    expect(en.body).toContain('Calibri');
    expect(en.buttons).toBe(en.body);
    expect(en.headings).toBeNull();
    const he = typographyVars(d, 'he');
    expect(he.headings).toContain('Rubik');
    expect(he.body).toBeNull();
  });

  it('clearing a choice removes it (and the language when empty)', () => {
    const t = setTypographyFont({ en: { body: 'inter' } }, 'en', 'body', null);
    expect(t).toEqual({});
  });

  it('unset alignment follows the reading start; a chosen side stays that side', () => {
    expect(resolveRoleAlign(undefined)).toBe('start');
    expect(resolveRoleAlign(undefined, 'center')).toBe('center');
    expect(resolveRoleAlign('right')).toBe('right');
    expect(resolveRoleAlign('left')).toBe('left');
  });
});


describe('language-specific element fonts', () => {
  const calibri = fontById('calibri')!.stack;
  const heebo = fontById('heebo')!.stack;
  it('has no inline font when no override exists, allowing the campaign role to cascade', () => {
    expect(elementFont(undefined, 'he')).toBeNull();
    expect(elementFont({}, 'en')).toBeNull();
  });
  it('keeps legacy shared overrides unchanged until an explicit edit', () => {
    const style = { fontFamily: heebo };
    expect(elementFont(style, 'en')).toBe(heebo);
    expect(elementFont(style, 'he')).toBe(heebo);
  });
  it('changing English does not change Hebrew or mutate the original', () => {
    const style = { fontFamily: heebo, color: '#123456' };
    const next = setElementFont(style, 'en', calibri);
    expect(elementFont(next, 'en')).toBe(calibri);
    expect(elementFont(next, 'he')).toBe(heebo);
    expect(next.color).toBe(style.color);
    expect(style).toEqual({ fontFamily: heebo, color: '#123456' });
  });
  it('Use campaign default removes only the selected language override, preserving legacy in the other language', () => {
    const next = setElementFont({ fontFamily: heebo }, 'en', null);
    expect(elementFont(next, 'en')).toBeNull();
    expect(elementFont(next, 'he')).toBe(heebo);
    expect(next.fontFamily).toBeUndefined();
  });
  it('removing the last override removes its map and keeps unrelated styles', () => {
    const next = setElementFont({ fontFamilyByLanguage: { en: calibri }, color: 'red' }, 'en', null);
    expect(next.fontFamilyByLanguage).toBeUndefined();
    expect(next.color).toBe('red');
  });
  it('title and subtitle can be overridden independently', () => {
    const title = setElementFont({}, 'en', calibri, 'titleFontFamilyByLanguage');
    const both = setElementFont(title, 'en', heebo, 'subtitleFontFamilyByLanguage');
    expect(elementFont(both, 'en', 'titleFontFamilyByLanguage')).toBe(calibri);
    expect(elementFont(both, 'en', 'subtitleFontFamilyByLanguage')).toBe(heebo);
    expect(elementFont(both, 'he', 'titleFontFamilyByLanguage')).toBeNull();
  });
  it('round-trips fonts and language edits through canonical JSON and undo/redo', () => {
    const state = new CampaignStudioStateService();
    state.setContentLanguage('en');
    state.patch({ title: 'English title' });
    state.patch({ layout: { ...state.draft.layout, typography: { en: { headings: 'calibri' } } } });
    const saved = state.storedDraft();
    const copy = JSON.parse(JSON.stringify(saved));
    expect(copy.layout.typography.en.headings).toBe('calibri');
    expect(copy.contentI18n.en.values.title).toBe('English title');
    state.setContentLanguage('he');
    expect(state.draft.title).not.toBe('English title');
  });
});
