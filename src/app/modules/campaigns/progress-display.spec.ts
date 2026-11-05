import { TestBed } from '@angular/core/testing';
import { CampaignPreviewComponent } from './studio/preview/campaign-preview/campaign-preview.component';
import { CampaignDashboardKpisComponent } from './pages/campaign-dashboard-page/sections/campaign-dashboard-kpis/campaign-dashboard-kpis.component';
import { CampaignDiscoverComponent } from './pages/campaign-discover/campaign-discover.component';
import { CampaignsPageComponent } from './pages/campaigns-page/campaigns-page.component';
import { CampaignAmbassadorsPageComponent } from './pages/campaign-ambassadors-page/campaign-ambassadors-page.component';
import { AmbassadorStudioPageComponent } from './pages/ambassador-studio-page/ambassador-studio-page.component';
import { CampaignPublicPageComponent } from './pages/campaign-public-page/campaign-public-page.component';
import { DashboardComponent } from '../dashboard/pages/dashboard/dashboard.component';
import { PlatformCampaignsPageComponent } from '../platform/pages/platform-campaigns-page/platform-campaigns-page.component';

// Pure display methods: no services, HTTP, payments or financial records.
const view = (component: { prototype: object }): any => Object.create(component.prototype);

describe('Actual fundraising percentages and capped visual progress', () => {
  for (const percent of [99, 100, 110, 150]) {
    const raised = percent * 1000;
    const draft = { currentAmount: raised, targetAmount: 100000, endDate: '2099-12-31', offerings: [], updates: [] } as any;
    const ambassador = { raisedTotal: raised, goalAmount: 100000 } as any;

    it(`shows ${percent}% consistently across campaign and ambassador views`, () => {
      const preview = view(CampaignPreviewComponent);
      preview.ambassador = ambassador;
      expect(preview.raisedPct(draft)).toBe(percent);
      expect(preview.statValue('percent', draft)).toBe(percent + '%');
      expect(preview.ambassadorPct()).toBe(percent);
      expect(preview.ambPct(ambassador)).toBe(percent);
      expect(Number(preview.ringDash(draft).split(' ')[0])).toBeCloseTo(Math.min(percent, 100) / 100 * 94.25, 2);
      expect(view(CampaignsPageComponent).progressPercent(draft)).toBe(percent);
      expect(view(CampaignDiscoverComponent).progressPct({ current_amount: raised, target_amount: 100000 })).toBe(percent);
      expect(view(PlatformCampaignsPageComponent).progressPct({ current_amount: raised, target_amount: 100000 })).toBe(percent);
      expect(view(CampaignAmbassadorsPageComponent).progressPct(ambassador)).toBe(percent);
      const studio = view(AmbassadorStudioPageComponent); studio.draft = { goalAmount: 100000 };
      expect(studio.goalPct(ambassador)).toBe(percent);
      expect(view(DashboardComponent).ambProgressPct({ raised_total: raised, goal_amount: 100000 })).toBe(percent);
      const publicPage = view(CampaignPublicPageComponent); publicPage.state = { draft };
      expect(publicPage.goalProgressPct).toBe(percent);
      expect(draft.currentAmount).toBe(raised); expect(draft.targetAmount).toBe(100000);
    });

    it(`renders ${percent}% with the actual amounts and a non-overflowing bar`, () => {
      TestBed.configureTestingModule({ imports: [CampaignDashboardKpisComponent] });
      const fixture = TestBed.createComponent(CampaignDashboardKpisComponent);
      fixture.componentInstance.draft = draft;
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      expect(element.querySelector('.ckp-pct')!.textContent).toContain(percent + '%');
      expect(element.querySelector('.ckp-amount')!.textContent).toContain(raised.toLocaleString('he-IL'));
      expect(element.querySelector('.ckp-of')!.textContent).toContain('100,000');
      const fill = element.querySelector('.ckp-progress-fill') as HTMLElement;
      const track = element.querySelector('.ckp-progress') as HTMLElement;
      expect(fill.style.width).toBe(Math.min(percent, 100) + '%');
      expect(fill.getBoundingClientRect().width).toBeLessThanOrEqual(track.getBoundingClientRect().width + 1);
    });
  }

  it('preserves the no-goal fallback', () => {
    const preview = view(CampaignPreviewComponent);
    expect(preview.raisedPct({ currentAmount: 110000, targetAmount: 0 })).toBe(0);
    expect(preview.statValue('percent', { currentAmount: 110000, targetAmount: 0 })).toBe('0%');
    expect(preview.ringDash({ currentAmount: 110000, targetAmount: 0 })).toBe('0.00 94.25');
  });
});
