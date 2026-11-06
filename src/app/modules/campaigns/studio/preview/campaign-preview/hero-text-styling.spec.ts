import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';
import { TextStyle } from '../../../../../shared/models/text-style.model';

type Position = 'above' | 'hero' | 'below';

describe('Hero title/subtitle styling in every position', () => {
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    state = TestBed.inject(CampaignStudioStateService);
  });

  function render(position: Position, style: Partial<TextStyle>) {
    state.patch({
      title: 'כותרת', shortDescription: 'תת-כותרת', slug: '',
      heroTextStyle: { ...state.draft.heroTextStyle, ...style },
    });
    state.setHeroTitlePosition(position);
    state.setHeroSubtitlePosition(position);
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const onHero = position === 'hero';
    return {
      fixture,
      title: el.querySelector(onHero ? '.hm-hero-title' : '.hm-hero-title-external') as HTMLElement,
      subtitle: el.querySelector(onHero ? '.hm-hero-subtitle' : '.hm-hero-subtitle-external') as HTMLElement,
    };
  }

  const styled: Partial<TextStyle> = {
    titleColor: '#ff0000', subtitleColor: '#00ff00', titleFontSize: 'sm', subtitleFontSize: 'xl',
  };

  for (const position of ['above', 'hero', 'below'] as Position[]) {
    it(`${position}: separate title and subtitle colors and sizes, desktop and mobile`, () => {
      const { title, subtitle } = render(position, styled);
      expect(title.style.color).toBe('rgb(255, 0, 0)');
      expect(subtitle.style.color).toBe('rgb(0, 255, 0)');
      expect(title.style.getPropertyValue('--hm-hero-title-size')).toBe('24px');
      expect(title.style.getPropertyValue('--hm-hero-title-size-m')).toBe('20px');
      expect(subtitle.style.getPropertyValue('--hm-hero-subtitle-size')).toBe('24px');
      expect(subtitle.style.getPropertyValue('--hm-hero-subtitle-size-m')).toBe('18px');
      expect(title.style.fontSize).toBe('');
      // The CSS really uses the variables: whichever width the test browser
      // runs at, the computed size is the one picked for that layout.
      const mobile = window.matchMedia('(max-width: 768px)').matches;
      expect(getComputedStyle(title).fontSize).toBe(mobile ? '20px' : '24px');
      expect(getComputedStyle(subtitle).fontSize).toBe(mobile ? '18px' : '24px');
    });
  }

  it('the canvas follows each change immediately', () => {
    const { fixture, title } = render('above', styled);
    state.patch({ heroTextStyle: { ...state.draft.heroTextStyle, titleColor: '#0000ff', titleFontSize: 'xl' } });
    fixture.detectChanges();
    expect(title.style.color).toBe('rgb(0, 0, 255)');
    expect(title.style.getPropertyValue('--hm-hero-title-size')).toBe('48px');
  });

  describe('campaigns saved before the split controls keep their look', () => {
    const legacy: Partial<TextStyle> = { color: '#ffffff', fontSize: 'xl' };

    it('on the Hero: the shared color and title size still apply; the subtitle keeps its default size', () => {
      const { title, subtitle } = render('hero', legacy);
      expect(title.style.color).toBe('rgb(255, 255, 255)');
      expect(subtitle.style.color).toBe('rgb(255, 255, 255)');
      expect(title.style.getPropertyValue('--hm-hero-title-size')).toBe('48px');
      expect(title.style.getPropertyValue('--hm-hero-title-size-m')).toBe('');
      expect(subtitle.style.getPropertyValue('--hm-hero-subtitle-size')).toBe('');
    });

    for (const position of ['above', 'below'] as Position[]) {
      it(`${position}: no inline color or size, so the white legacy color never lands on the page`, () => {
        const { title, subtitle } = render(position, legacy);
        expect(title.style.color).toBe('');
        expect(subtitle.style.color).toBe('');
        expect(title.style.getPropertyValue('--hm-hero-title-size')).toBe('');
        expect(subtitle.style.getPropertyValue('--hm-hero-subtitle-size')).toBe('');
      });
    }
  });
});

describe('Hero title/subtitle styling — save and reload', () => {
  it('the new fields survive the save payload and the reloaded draft', () => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    const api = TestBed.inject(CampaignApiService);
    const state = TestBed.inject(CampaignStudioStateService);
    const http = TestBed.inject(HttpTestingController);
    const heroTextStyle: TextStyle = {
      ...state.draft.heroTextStyle, titleColor: '#ff0000', subtitleColor: '#00ff00', titleFontSize: 'sm', subtitleFontSize: 'xl',
    };

    api.update('c-1', { ...state.draft, heroTextStyle }).subscribe();
    const save = http.expectOne((r) => r.method === 'PUT' || r.method === 'PATCH');
    expect(save.request.body.hero_text_style).toEqual(heroTextStyle);
    save.flush({ ...save.request.body, id: 'c-1' });

    let reloaded: any;
    api.getById('c-1').subscribe((d) => (reloaded = d));
    http.expectOne((r) => r.method === 'GET').flush({ id: 'c-1', hero_text_style: heroTextStyle });
    expect(reloaded.heroTextStyle).toEqual(heroTextStyle);
  });
});

describe('Hero text style editor — split title/subtitle controls', () => {
  it('title and subtitle get their own size and color; other editors are unchanged', () => {
    TestBed.configureTestingModule({ imports: [TextStyleEditorComponent] });
    const fixture = TestBed.createComponent(TextStyleEditorComponent);
    const editor = fixture.componentInstance;
    editor.textStyle = { align: 'center', color: '#ffffff', fontSize: 'lg', position: 'center' };
    editor.expanded = true;
    const emitted: TextStyle[] = [];
    editor.textStyleChange.subscribe((s) => emitted.push(s));

    fixture.detectChanges();
    const labels = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.tse-label')).map((n) => n.textContent!.trim());
    expect(labels()).toContain('צבע טקסט');
    expect(labels()).not.toContain('צבע כותרת');

    editor.splitTitleSubtitle = true;
    fixture.detectChanges();
    expect(labels()).toEqual(jasmine.arrayContaining(['גודל כותרת', 'גודל תת-כותרת', 'צבע כותרת', 'צבע תת-כותרת']));
    expect(labels()).not.toContain('צבע טקסט');

    editor.patchStyle({ subtitleFontSize: 'sm' });
    editor.patchStyle({ titleColor: '#123456' });
    expect(emitted[0].subtitleFontSize).toBe('sm');
    expect(emitted[0].fontSize).toBe('lg');
    expect(emitted[1].titleColor).toBe('#123456');
    expect(emitted[1].color).toBe('#ffffff');
  });
});
