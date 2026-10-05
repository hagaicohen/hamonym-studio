import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { CampaignPublicPageComponent } from './campaign-public-page.component';
import { CampaignStudioStateService } from '../../services/campaign-studio-state.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';

// Platform Navigation Cleanup (2026-10-06). ngOnInit always reads the route
// slug and fires an HTTP call -- stubbing the route to have NO slug makes
// ngOnInit short-circuit immediately (`if (!slug) { router.navigate(...);
// return; }`, see campaign-public-page.component.ts), leaving isLoading/
// notFound untouched by any async call. Each test then drives the page
// purely through its own public flags + a real, complete draft loaded
// straight into CampaignStudioStateService (the same state the real
// ngOnInit would have produced), and asserts on the rendered DOM -- the
// DOM-level regression pattern already used elsewhere in this codebase for
// template/CSS wiring concerns.
describe('CampaignPublicPageComponent — Platform Navigation Cleanup', () => {
  function render(opts: {
    canEdit: boolean;
    ownerPreview: boolean;
    ambassadorMode?: boolean;
    currentAmbassador?: any;
  }) {
    TestBed.configureTestingModule({
      imports: [CampaignPublicPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({}), // no slug -> ngOnInit short-circuits
              queryParamMap: convertToParamMap({}),
            },
          },
        },
      ],
    });

    const state = TestBed.inject(CampaignStudioStateService);
    const ctx   = TestBed.inject(CurrentContextService);
    if (opts.ambassadorMode) {
      ctx.active.set({ role: 'ambassador', context: null } as any);
    }

    const fixture = TestBed.createComponent(CampaignPublicPageComponent);
    fixture.detectChanges(); // runs the short-circuited ngOnInit once

    const base = state.draft;
    state.loadDraft({ ...base, id: 'camp-1', slug: '', title: 'קמפיין בדיקה' } as any);

    const component = fixture.componentInstance;
    component.isLoading         = false;
    component.notFound          = false;
    component.canEdit           = opts.canEdit;
    component.ownerPreview      = opts.ownerPreview;
    component.currentAmbassador = opts.currentAmbassador ?? null;
    fixture.detectChanges();
    return fixture;
  }

  it('Flow A — anonymous visitor: no purple bar', () => {
    const fixture = render({ canEdit: false, ownerPreview: false });
    expect(fixture.nativeElement.querySelector('.ambassador-edit-bar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.owner-preview-bar')).toBeNull();
  });

  it('Flow B — logged-in non-manager: no purple bar, no manage affordance in-page', () => {
    const fixture = render({ canEdit: false, ownerPreview: false });
    expect(fixture.nativeElement.querySelector('.ambassador-edit-bar')).toBeNull();
    expect(fixture.nativeElement.querySelector('.owner-preview-bar')).toBeNull();
  });

  it('Flow C — manager, published campaign: the old purple "חזרה לעריכה" bar is gone', () => {
    const fixture = render({ canEdit: true, ownerPreview: false });
    expect(fixture.nativeElement.querySelector('.ambassador-edit-bar')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('חזרה לעריכה');
  });

  it('removing the bar leaves no empty layout gap: .public-preview-wrap is the first content element after the Top Strip', () => {
    const fixture = render({ canEdit: true, ownerPreview: false });
    const strip = fixture.nativeElement.querySelector('app-platform-top-strip');
    const wrap  = fixture.nativeElement.querySelector('.public-preview-wrap');
    expect(strip).not.toBeNull();
    expect(wrap).not.toBeNull();
    // No bar element sits between them for a manager viewing a published campaign.
    expect(strip.nextElementSibling).toBe(wrap);
  });

  it('Flow D — unpublished owner preview: lightweight preview status indication is shown, with no Edit action inside it', () => {
    const fixture = render({ canEdit: true, ownerPreview: true });
    const bar = fixture.nativeElement.querySelector('.owner-preview-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('תצוגה מקדימה');
    expect(bar.querySelector('button')).toBeNull();
  });

  it('manager public view still renders normal campaign content (campaign-preview mounted)', () => {
    const fixture = render({ canEdit: true, ownerPreview: false });
    expect(fixture.nativeElement.querySelector('app-campaign-preview')).not.toBeNull();
  });

  it('normal visitor public view still renders normal campaign content (campaign-preview mounted)', () => {
    const fixture = render({ canEdit: false, ownerPreview: false });
    expect(fixture.nativeElement.querySelector('app-campaign-preview')).not.toBeNull();
  });

  it('passes [manageCampaignId] to the Top Strip only when canEdit is true', () => {
    const managerFixture = render({ canEdit: true, ownerPreview: false });
    expect(managerFixture.nativeElement.querySelector('app-platform-top-strip .pts-manage')).not.toBeNull();
  });

  it('does NOT pass [manageCampaignId] to the Top Strip when canEdit is false', () => {
    const visitorFixture = render({ canEdit: false, ownerPreview: false });
    expect(visitorFixture.nativeElement.querySelector('app-platform-top-strip .pts-manage')).toBeNull();
  });

  it('ambassador-self-edit bar is untouched by this cleanup (a different feature, not campaign management)', () => {
    const fixture = render({
      canEdit: false,
      ownerPreview: false,
      ambassadorMode: true,
      currentAmbassador: { id: 'amb-1', campaignId: 'camp-1', status: 'active', fullName: 'שגריר בדיקה', donorCount: 0, raisedTotal: 0 },
    });
    const bar = fixture.nativeElement.querySelector('.ambassador-edit-bar');
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('אתה צופה בדף השגריר שלך');
  });
});
