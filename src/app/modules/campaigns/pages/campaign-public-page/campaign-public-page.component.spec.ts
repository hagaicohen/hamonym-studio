import { TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { of } from 'rxjs';
import { DonationService } from '../../services/donation.service';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
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
  beforeEach(() => sessionStorage.removeItem('hamonym:goal-celebrated:goal-test:100'));
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

    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
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

  function goalFixture(currentAmount: number, targetAmount = 100) {
    const fixture = render({ canEdit: false, ownerPreview: false });
    const component = fixture.componentInstance;
    component.state.patch({ id: 'goal-test', currentAmount, targetAmount });
    (component as any).snapshotTakenAt = new Date(0);
    (component as any).lastSeenAt = new Date(0);
    (component as any).toast = { add() {} };
    const live = spyOn(TestBed.inject(DonationService), 'getLive');
    fixture.detectChanges();
    return { fixture, component, live };
  }

  for (const donationAmount of [10, 25]) {
    it(`celebrates a confirmed donation reaching/crossing the goal by ${donationAmount}, once for four seconds`, fakeAsync(() => {
      const { fixture, component, live } = goalFixture(90);
      live.and.returnValue(of([{ amount: donationAmount, completedAt: new Date(1000) }] as any));
      (component as any).pollLive(); fixture.detectChanges();
      expect(component.celebratingGoal).toBeTrue(); expect(component.goalAchieved).toBeTrue();
      expect(component.state.draft.currentAmount).toBe(90 + donationAmount);
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('.campaign-goal-success')!.textContent).toContain(String(90 + donationAmount));
      expect(element.querySelector('.campaign-goal-progress')!.getAttribute('aria-valuenow')).toBe('100');
      const confetti = element.querySelector('.campaign-goal-confetti')!;
      expect(getComputedStyle(confetti).pointerEvents).toBe('none');
      expect(Number(getComputedStyle(confetti).zIndex)).toBeGreaterThan(9999);
      expect(confetti.querySelectorAll('span').length).toBe(240);
      const visiblePieces = Array.from(confetti.querySelectorAll('span')).filter(piece => getComputedStyle(piece).display !== 'none');
      expect(visiblePieces.length).toBeGreaterThanOrEqual(120);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      expect(getComputedStyle(confetti).display).toBe(reduced ? 'none' : 'block');
      if (reduced) expect(getComputedStyle(element.querySelector('.campaign-goal-progress > span')!).animationName).toBe('none');
      tick(3999); expect(component.celebratingGoal).toBeTrue();
      tick(1); fixture.detectChanges(); expect(component.celebratingGoal).toBeFalse();
      expect(element.querySelector('.campaign-goal-confetti')).toBeNull();
      expect(element.querySelector('.campaign-goal-success')).not.toBeNull();
      live.and.returnValue(of([{ amount: 7, completedAt: new Date(2000) }] as any));
      (component as any).pollLive(); expect(component.celebratingGoal).toBeFalse();
      expect(component.state.draft.currentAmount).toBe(97 + donationAmount);
      fixture.destroy();
      flush(); // Drain the existing preview's deferred UI work after teardown.
    }));
  }

  it('loading/refeshing an already achieved campaign shows success without replaying confetti', () => {
    const { fixture, component, live } = goalFixture(125);
    expect(component.goalAchieved).toBeTrue(); expect(component.celebratingGoal).toBeFalse();
    expect(fixture.nativeElement.querySelector('.campaign-goal-success').textContent).toContain('125');
    expect(fixture.nativeElement.querySelector('.campaign-goal-confetti')).toBeNull();
    live.and.returnValue(of([{ amount: 10, completedAt: new Date(1000) }] as any));
    (component as any).pollLive(); expect(component.celebratingGoal).toBeFalse(); fixture.destroy();
  });

  it('does not celebrate historical/duplicate donations or a campaign without a positive target', () => {
    const { fixture, component, live } = goalFixture(90);
    (component as any).snapshotTakenAt = new Date(2000);
    live.and.returnValue(of([{ amount: 25, completedAt: new Date(1000) }] as any));
    (component as any).pollLive(); expect(component.celebratingGoal).toBeFalse(); expect(component.state.draft.currentAmount).toBe(90);
    component.state.patch({ targetAmount: 0 });
    live.and.returnValue(of([{ amount: 25, completedAt: new Date(3000) }] as any));
    (component as any).pollLive(); expect(component.goalAchieved).toBeFalse(); expect(component.celebratingGoal).toBeFalse(); fixture.destroy();
  });

  it('respects the saved once-per-campaign-goal celebration marker', () => {
    const { fixture, component, live } = goalFixture(90);
    sessionStorage.setItem('hamonym:goal-celebrated:goal-test:100', '1');
    live.and.returnValue(of([{ amount: 10, completedAt: new Date(1000) }] as any));
    (component as any).pollLive(); expect(component.goalAchieved).toBeTrue(); expect(component.celebratingGoal).toBeFalse(); fixture.destroy();
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
