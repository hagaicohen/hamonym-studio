import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TEMPLATE_PALETTES, buildTheme } from './campaign-templates';
import { CampaignApiService } from '../../services/campaign-api.service';

describe('Campaign color palettes', () => {
  const original: Record<string, string> = {
    purple: '#7c3aed', blue: '#0ea5e9', green: '#22c55e', teal: '#10b981',
    orange: '#f59e0b', red: '#ef4444', pink: '#ec4899', slate: '#475569',
  };
  const added: Record<string, string> = {
    'dark-blue': '#1E40AF', 'deep-teal': '#0D9488', burgundy: '#9F1239', gold: '#CA8A04',
  };

  it('keeps the 8 existing colors unchanged, adds the 4 new ones and keeps purple as the default', () => {
    expect(TEMPLATE_PALETTES.length).toBe(12);
    expect(TEMPLATE_PALETTES[0].id).toBe('purple');
    const byId = Object.fromEntries(TEMPLATE_PALETTES.map(p => [p.id, p.base]));
    expect(new Set(TEMPLATE_PALETTES.map(p => p.id)).size).toBe(12);
    for (const [id, base] of Object.entries({ ...original, ...added })) expect(byId[id]).toBe(base);
  });

  it('groups colors by family', () => {
    expect(TEMPLATE_PALETTES.map(p => p.id)).toEqual(
      ['purple', 'pink', 'burgundy', 'red', 'orange', 'gold', 'green', 'teal', 'deep-teal', 'blue', 'dark-blue', 'slate']);
  });

  it('derives a distinct primary color per palette, so the selected swatch is unambiguous', () => {
    const primaries = TEMPLATE_PALETTES.map(p => buildTheme(p)['primaryColor']);
    expect(new Set(primaries).size).toBe(12);
  });

  describe('save and restore', () => {
    let api: CampaignApiService;
    let http: HttpTestingController;
    beforeEach(() => {
      TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
      api = TestBed.inject(CampaignApiService);
      http = TestBed.inject(HttpTestingController);
    });
    afterEach(() => http.verify());

    for (const palette of TEMPLATE_PALETTES) {
      it(`persists and restores ${palette.id} on the owner and public page loads`, () => {
        const theme = buildTheme(palette);
        const draft = (api as any).fromSnake({ layout: { theme } });
        api.create('entity-a', draft).subscribe();
        const post = http.expectOne(r => r.method === 'POST');
        const saved = post.request.body;
        expect(saved.layout.theme.primaryColor).toBe(theme['primaryColor']);
        post.flush(saved);

        let restored: any; let publicRestored: any;
        api.getBySlug('s').subscribe(d => restored = d);
        http.expectOne(r => r.url.endsWith('/slug/s')).flush(saved);
        api.getBySlugPublic('s').subscribe(d => publicRestored = d);
        http.expectOne(r => r.url.endsWith('/public/s')).flush(saved);
        for (const loaded of [restored, publicRestored]) {
          expect(loaded.layout.theme.primaryColor).toBe(theme['primaryColor']);
          expect(loaded.layout.theme.secondaryColor).toBe(theme['secondaryColor']);
          expect(loaded.layout.theme.topStripBg).toBe(theme['topStripBg']);
        }
      });
    }
  });
});
