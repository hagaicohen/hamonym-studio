import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PlatformDashboardPageComponent } from './platform-dashboard-page.component';
import { DashboardOverview, PlatformDashboardService } from '../../services/platform-dashboard.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';

function overview(): DashboardOverview {
  return {
    version: 1, generatedAt: '2026-10-22T21:30:00Z', period: { start: '2026-10-01T00:00:00Z', end: '2026-11-01T00:00:00Z' },
    kpis: { activeEntities: 1, activeCampaigns: 2, donationsMonth: 143.37, newDonorsThisMonth: 1, feesOutstanding: 0, attentionCount: 0 },
    newDonors: [{ name: 'תורם לדוגמה', firstDonationAt: '2026-10-05T21:30:00Z', firstDonationAmount: 143.37 }],
    trend: { range: '30d', points: [{ date: '2026-10-01', value: 143.37 }], total: 143.37, previousTotal: 100 },
    attention: [], activity: [],
  };
}

describe('Platform Dashboard — actual Angular rendering with isolated read fixtures', () => {
  async function setup(data = overview(), superAdmin = true, failFirst = false) {
    const api = { getOverview: jasmine.createSpy('getOverview').and.returnValue(of(data)) };
    if (failFirst) api.getOverview.and.returnValues(throwError(() => ({ status: 503 })), of(data));
    await TestBed.configureTestingModule({
      imports: [PlatformDashboardPageComponent],
      providers: [provideRouter([]),
        { provide: PlatformDashboardService, useValue: api },
        { provide: CurrentContextService, useValue: { isSuperAdmin: () => superAdmin, hasPlatformSection: () => true } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PlatformDashboardPageComponent);
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance, element: fixture.nativeElement as HTMLElement, api };
  }

  it('renders exactly six clickable KPI and correct filtered destination links', async () => {
    const { element } = await setup();
    expect(element.querySelectorAll('.kpi-card').length).toBe(6);
    expect(element.querySelector('a[href*="status=active"]')).not.toBeNull();
    expect(element.querySelector('a[href*="status=published"]')).not.toBeNull();
    expect(element.querySelector('a[href*="period=this_month_israel"]')).not.toBeNull();
    expect(element.querySelector('a[href*="scope=all"]')).not.toBeNull();
    expect(element.textContent).toContain('143.37');
  });

  it('opens the approved Drawer with the exact donor count, name, Israel date and first amount', async () => {
    const { element, fixture } = await setup();
    (element.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement).click(); fixture.detectChanges();
    const drawer = element.querySelector('[role="dialog"]')!;
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(drawer.textContent).toContain('1 תורמים');
    expect(drawer.textContent).toContain('תורם לדוגמה');
    expect(drawer.textContent).toContain('06/10/2026');
    expect(drawer.textContent).toContain('143.37');
    expect(element.querySelector('main')!.hasAttribute('inert')).toBeTrue();
    (drawer.querySelector('.close-button') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    expect(element.querySelector('main')!.hasAttribute('inert')).toBeFalse();
  });

  it('shows a real empty donor state and supports Escape dismissal', async () => {
    const data = overview(); data.newDonors = []; data.kpis.newDonorsThisMonth = 0;
    const { element, fixture } = await setup(data);
    (element.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')!.textContent).toContain('אין תורמים חדשים');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges();
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  });

  it('does not invent names or amounts missing from donor records', async () => {
    const data = overview(); data.newDonors[0].name = null; data.newDonors[0].firstDonationAmount = null;
    const { element, fixture } = await setup(data);
    (element.querySelector('[aria-haspopup="dialog"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelector('.donor-drawer tbody td')!.textContent).toContain('שם לא זמין');
    expect(element.querySelector('.donor-drawer tbody td:last-child')!.textContent).toBe('—');
  });

  it('renders at most five actionable records and pages through the rest', async () => {
    const data = overview(); data.attention = Array.from({ length: 7 }, (_, i) => ({ id: String(i), name: `עמותה ${i}`, reason: 'ממתינה לאישור', action: 'בדוק עמותה', route: ['/platform/organizations', String(i)], query: {} })); data.kpis.attentionCount = 7;
    const { element, fixture } = await setup(data);
    expect(element.querySelectorAll('.attention-item').length).toBe(5);
    (element.querySelector('[aria-label="פריטים נוספים"]') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(element.querySelectorAll('.attention-item').length).toBe(2);
  });

  it('paid history produces no active attention when the read model has no open issue', async () => {
    const { element } = await setup();
    expect(element.querySelectorAll('.attention-item').length).toBe(0);
    expect(element.querySelector('.attention-panel')!.textContent).toContain('אין פריטים הממתינים לטיפול');
  });

  it('all three chart selectors call only the read API', async () => {
    const { element, api, fixture } = await setup();
    (element.querySelectorAll('.range-switch button')[0] as HTMLButtonElement).click(); fixture.detectChanges();
    expect(api.getOverview).toHaveBeenCalledWith('7d');
    (element.querySelectorAll('.range-switch button')[2] as HTMLButtonElement).click(); fixture.detectChanges();
    expect(api.getOverview).toHaveBeenCalledWith('12m');
  });

  it('does not draw an empty graph and does not turn request failures into an empty state', async () => {
    const data = overview(); data.trend = { range: '30d', points: [{ date: '2026-10-01', value: 0 }], total: 0, previousTotal: 0 };
    const { element, fixture, api } = await setup(data, true, true);
    expect(element.querySelector('[role="alert"]')).not.toBeNull();
    expect(element.querySelector('.chart-empty')).toBeNull();
    (element.querySelector('.text-button') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(api.getOverview).toHaveBeenCalledTimes(2);
    expect(element.querySelector('.chart-svg')).toBeNull();
    expect(element.querySelector('.chart-empty')!.textContent).toContain('אין תרומות ששולמו');
  });

  it('hides donor and financial actions for scoped administrators', async () => {
    const { element } = await setup(overview(), false);
    expect(element.querySelector('[aria-haspopup="dialog"]')).toBeNull();
    expect(element.querySelector('a[href*="scope=all"]')).toBeNull();
    expect(element.querySelector('a[href*="period=this_month"]')).toBeNull();
  });

  it('uses RTL, responsive KPI columns and keeps the page within its viewport', async () => {
    const { element } = await setup();
    const main = element.querySelector('main')!;
    expect(getComputedStyle(main).direction).toBe('rtl');
    const columns = getComputedStyle(element.querySelector('.kpi-row')!).gridTemplateColumns.split(' ').length;
    expect(columns).toBe(window.innerWidth <= 600 ? 2 : window.innerWidth <= 1350 ? 3 : 6);
    expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth + 1);
  });

  it('keeps empty chart and attention compact while preserving the full nonempty chart', async () => {
    const data = overview(); data.trend = { range: '30d', points: [], total: 0, previousTotal: 0 };
    const { element, fixture, page } = await setup(data);
    expect(element.querySelector('.chart-panel')!.getBoundingClientRect().height).toBeLessThan(220);
    expect(element.querySelector('.attention-panel')!.getBoundingClientRect().height).toBeLessThan(150);
    expect(element.querySelector('.chart-svg')).toBeNull();
    page.data = overview(); fixture.detectChanges();
    expect(element.querySelector('.chart-svg')!.getBoundingClientRect().height).toBe(180);
  });

  it('emphasizes KPI values and presents Quick Actions as distinct buttons', async () => {
    const { element } = await setup();
    const value = element.querySelector('.kpi-card strong')!;
    expect(parseFloat(getComputedStyle(value).fontSize)).toBeGreaterThanOrEqual(30);
    const action = element.querySelector('.quick-actions a')!;
    expect(getComputedStyle(action).backgroundColor).toBe('rgb(250, 248, 255)');
    expect(action.getBoundingClientRect().height).toBeGreaterThanOrEqual(42);
    for (const link of Array.from(element.querySelectorAll('.quick-actions a'))) {
      expect(getComputedStyle(link).backgroundColor).toBe(getComputedStyle(action).backgroundColor);
      expect(getComputedStyle(link).borderColor).toBe(getComputedStyle(action).borderColor);
    }
  });

  it('removes replayed activity records while preserving distinct actions with identical labels and time', async () => {
    const data = overview();
    const event = { id: 'organization:audit-1', name: 'עמותה לדוגמה', label: 'העמותה אושרה', timestamp: '2026-10-22T10:00:00Z', amount: null, route: ['/platform/organizations', 'org-1'], query: {} };
    data.activity = [event, { ...event }, { ...event, id: 'organization:audit-2' }];
    const { element } = await setup(data);
    expect(element.querySelectorAll('.activity-list > li').length).toBe(2);
    expect(data.activity.length).toBe(3);
  });
});
