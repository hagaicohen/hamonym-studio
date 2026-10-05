import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { AmbassadorStudioPageComponent } from './ambassador-studio-page.component';
import { AppLoaderService } from '../../../../core/services/app-loader.service';

// Personal-link + goal-above-campaign-goal warning (2026-10-01) -- this page
// talks to the backend directly via HttpClient (not AmbassadorService), so
// HttpClient itself is mocked rather than driven through HttpTestingController.
// The component's own standalone `imports: [HttpClientModule]` re-provides a
// REAL HttpClient at the same injector level, which otherwise wins over a
// plain TestBed provider override -- stripping it via overrideComponent is
// what actually makes the mock take effect.
describe('AmbassadorStudioPageComponent', () => {
  function create() {
    const httpGet = jasmine.createSpy('get').and.returnValue(of({
      ambassador: {
        id: 'amb-1', campaign_id: 'camp-1', full_name: 'דנה לוי', phone: null, email: 'd@x.com',
        goal_amount: null, personal_message: '', personal_title: '', status: 'active', slug: 'dana-levi',
        created_at: '', campaign: { title: 'Campaign', slug: 'camp-1', cover: null, target_amount: 10000 },
      },
    }));
    TestBed.configureTestingModule({
      imports: [AmbassadorStudioPageComponent],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({ id: 'camp-1' }) } },
        },
        { provide: AppLoaderService, useValue: { show: () => {}, hide: () => {} } },
        { provide: HttpClient, useValue: { get: httpGet, patch: () => of({}) } },
      ],
    });
    TestBed.overrideComponent(AmbassadorStudioPageComponent, { remove: { imports: [HttpClientModule] }, add: {} });
    const fixture = TestBed.createComponent(AmbassadorStudioPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    return component;
  }

  it('shows the goal warning only once the entered goal exceeds the campaign target', () => {
    const component = create();
    component.draft.goalAmount = 5000;
    expect(component.goalAboveCampaignGoal()).toBeFalse();

    component.draft.goalAmount = 15000;
    expect(component.goalAboveCampaignGoal()).toBeTrue();

    component.draft.goalAmount = 10000;
    expect(component.goalAboveCampaignGoal()).toBeFalse();
  });

  it('loads the pre-existing slug as the default draft value and marks it available', () => {
    const component = create();
    expect(component.draft.slug).toBe('dana-levi');
    expect(component.slugAvailable).toBeTrue();
  });
});
