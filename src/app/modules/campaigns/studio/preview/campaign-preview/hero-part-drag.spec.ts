import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CampaignPreviewComponent } from './campaign-preview.component';
import { CampaignStudioStateService } from '../../../services/campaign-studio-state.service';
import { CampaignApiService } from '../../../services/campaign-api.service';
import { TextStyleEditorComponent } from '../../../../../shared/ui/text-style-editor/text-style-editor.component';

describe('Hero parts: drag to a position and hide with ×', () => {
  let state: CampaignStudioStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [CampaignPreviewComponent, HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    state = TestBed.inject(CampaignStudioStateService);
    state.patch({ title: 'כותרת', shortDescription: 'תת-כותרת', slug: '' });
  });

  function render(studio = true) {
    state.setPageBuilderActive(studio);
    const fixture = TestBed.createComponent(CampaignPreviewComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const q = (sel: string) => el.querySelector(sel) as HTMLElement;
    return { fixture, el, q };
  }

  function drag(fixture: any, source: HTMLElement, zone: string) {
    source.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    tick();
    fixture.detectChanges();
    const target = (fixture.nativeElement as HTMLElement).querySelector(`[data-drop-zone="${zone}"]`) as HTMLElement;
    expect(target).withContext(`drop zone ${zone}`).not.toBeNull();
    target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    fixture.detectChanges();
  }

  it('the public page gets no handles, no × and nothing draggable', () => {
    const { el, q } = render(false);
    expect(el.querySelector('.hm-hero-part, .hm-hero-part-hide, .hm-hero-part-grip, [draggable="true"]')).toBeNull();
    expect(q('.hm-hero-title').textContent!.trim()).toBe('כותרת');
  });

  it('in the Studio the logo, title and subtitle are draggable and show a grip and a ×', () => {
    const { q } = render();
    for (const sel of ['.hm-hero-org-logo', '.hm-hero-title', '.hm-hero-subtitle']) {
      const part = q(sel);
      expect(part.getAttribute('draggable')).withContext(sel).toBe('true');
      expect(part.getAttribute('title')).withContext(sel).toBe('גררו לשינוי מיקום');
      expect(part.querySelector(':scope > .hm-hero-part-hide')).withContext(sel).not.toBeNull();
      expect(part.querySelector(':scope > .hm-hero-part-grip')).withContext(sel).not.toBeNull();
      expect(getComputedStyle(part).cursor).withContext(sel).toBe('grab');
    }
    expect(q('.hm-hero-title').textContent!.trim()).withContext('the handles add no text').toBe('כותרת');
  });

  it('drop zones appear only while dragging: 3 above, 3 on and 3 below the Hero; the logo has no "below"', fakeAsync(() => {
    const { fixture, el, q } = render();
    expect(el.querySelector('.hm-hero-dropzone')).toBeNull();

    q('.hm-hero-title').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    tick();
    fixture.detectChanges();
    const zones = Array.from(el.querySelectorAll('[data-drop-zone]')).map((z) => z.getAttribute('data-drop-zone'));
    expect(zones).toEqual(['above-right', 'above-center', 'above-left', 'hero-right', 'hero-center', 'hero-left', 'below-right', 'below-center', 'below-left']);
    expect(q('[data-drop-zone="above-right"]').textContent).toContain('מעל ה-Hero · ימין');

    q('.hm-hero-title').dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('.hm-hero-dropzone')).withContext('cleared on dragend').toBeNull();

    q('.hm-hero-org-logo').dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }));
    tick();
    fixture.detectChanges();
    expect(el.querySelector('[data-drop-zone^="below"]')).toBeNull();
    expect(el.querySelectorAll('[data-drop-zone]').length).toBe(6);
  }));

  it('dragging the title above the Hero, to the left, moves it there', fakeAsync(() => {
    const { fixture, q } = render();
    drag(fixture, q('.hm-hero-title'), 'above-left');
    expect(state.draft.layout.heroTitlePosition).toBe('above');
    expect(state.draft.heroTextStyle.titleAlign).toBe('left');
    expect(q('.hm-hero-title')).toBeNull();
    expect(q('.hm-hero-title-external').style.textAlign).toBe('left');
    expect(q('.hm-hero-subtitle')).withContext('the subtitle stays where it was').not.toBeNull();
  }));

  it('dragging the subtitle below the Hero, to the right, and back onto the Hero', fakeAsync(() => {
    const { fixture, q } = render();
    drag(fixture, q('.hm-hero-subtitle'), 'below-right');
    expect(state.draft.layout.heroSubtitlePosition).toBe('below');
    expect(q('.hm-hero-subtitle-external').style.textAlign).toBe('right');

    drag(fixture, q('.hm-hero-subtitle-external'), 'hero-left');
    expect(state.draft.layout.heroSubtitlePosition).toBe('hero');
    const sub = q('.hm-hero-subtitle');
    expect(sub.style.textAlign).toBe('left');
    expect(getComputedStyle(sub).alignSelf).toBe('stretch');
  }));

  it('dragging the logo to the Hero center/right, and above the Hero to the left', fakeAsync(() => {
    const { fixture, q } = render();
    drag(fixture, q('.hm-hero-org-logo'), 'hero-center');
    expect(state.draft.heroLogoPosition).toBe('center');
    expect(q('.hm-hero-org-logo').classList).toContain('hm-hero-org-logo--center');

    drag(fixture, q('.hm-hero-org-logo'), 'hero-right');
    expect(q('.hm-hero-org-logo').classList).toContain('hm-hero-org-logo--right');

    drag(fixture, q('.hm-hero-org-logo'), 'above-left');
    expect(state.draft.heroLogoPosition).toBe('above');
    expect(state.draft.logoStripAlign).toBe('left');
    expect(q('.hm-hero-org-logo')).toBeNull();
    expect(q('.hm-logo-above-badge.hm-hero-part')).withContext('still draggable from above').not.toBeNull();

    drag(fixture, q('.hm-logo-above-badge'), 'hero-left');
    expect(state.draft.heroLogoPosition).toBe('left');
  }));

  it('the × hides the logo, the title and the subtitle without opening the Hero editor', () => {
    const { fixture, q } = render();
    const focus = spyOn(state, 'requestFocusArea');
    (q('.hm-hero-org-logo > .hm-hero-part-hide')).click();
    (q('.hm-hero-title > .hm-hero-part-hide')).click();
    (q('.hm-hero-subtitle > .hm-hero-part-hide')).click();
    fixture.detectChanges();
    expect(state.draft.showLogo).toBeFalse();
    expect(state.draft.layout.heroTitlePosition).toBe('hidden');
    expect(state.draft.layout.heroSubtitlePosition).toBe('hidden');
    expect(q('.hm-hero-org-logo')).toBeNull();
    expect(q('.hm-hero-title')).toBeNull();
    expect(focus).not.toHaveBeenCalled();
  });

  it('a campaign saved before dragging keeps its layout: centered on the Hero, shared alignment above/below', () => {
    state.patch({ heroTextStyle: { ...state.draft.heroTextStyle, align: 'right' } });
    const { fixture, q } = render();
    expect(q('.hm-hero-title').style.textAlign).toBe('');
    expect(q('.hm-hero-title').style.alignSelf).toBe('');
    state.setHeroTitlePosition('below');
    fixture.detectChanges();
    expect(q('.hm-hero-title-external').style.textAlign).toBe('right');
  });

  it('the shared alignment control resets the dragged per-part alignment', () => {
    const editor = TestBed.createComponent(TextStyleEditorComponent).componentInstance;
    editor.splitTitleSubtitle = true;
    editor.textStyle = { ...state.draft.heroTextStyle, titleAlign: 'left', subtitleAlign: 'right' };
    let emitted: any;
    editor.textStyleChange.subscribe((v) => (emitted = v));
    editor.setAlign('center');
    expect(emitted.align).toBe('center');
    expect(emitted.titleAlign).toBeUndefined();
    expect(emitted.subtitleAlign).toBeUndefined();
  });

  it('the dragged alignment is saved inside the existing hero_text_style', () => {
    const api = TestBed.inject(CampaignApiService);
    const http = TestBed.inject(HttpTestingController);
    const draft = { ...state.draft, heroTextStyle: { ...state.draft.heroTextStyle, titleAlign: 'left' as const, subtitleAlign: 'right' as const } };
    api.update('c-1', draft).subscribe();
    const save = http.expectOne((r) => r.method !== 'GET');
    expect(save.request.body.hero_text_style.titleAlign).toBe('left');
    expect(save.request.body.hero_text_style.subtitleAlign).toBe('right');
  });
});
