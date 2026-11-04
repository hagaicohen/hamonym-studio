import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { DashboardComponent } from './dashboard.component';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { AnalyticsRangeService } from '../../../../core/services/analytics-range.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { DateRangePickerComponent } from '../../../../shared/components/date-range-picker/date-range-picker.component';

describe('Responsive Organization Dashboard', () => {
  const org = { id: 'mobile-a', display_name: 'עמותה עם שם ארוך לבדיקת תצוגה מותאמת למובייל', status: 'changes_requested', entity_type: 'association', is_profile_complete: true };
  let http: HttpTestingController;
  let fixture: ReturnType<typeof TestBed.createComponent<DashboardComponent>>;
  beforeEach(() => {
    const other = { ...org, id: 'mobile-b', display_name: 'עמותה נוספת', status: 'rejected' };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: CurrentEntityService, useValue: { currentEntity: signal(org), setEntity: () => {} } },
      { provide: CurrentContextService, useValue: { active: signal({ role: 'entity-manager', context: { id: org.id } }) } },
      { provide: EntitiesService, useValue: {
        getEntityById: (id: string) => of(id === org.id ? org : other),
        getMyEntities: () => of({ entities: [org, other] }),
        getApprovalStatus: () => of({ status: 'changes_requested', comment: 'נא להשלים את המסמכים ולבדוק שהם קריאים', reasonTags: [], actionBy: 'מנהל הפלטפורמה', updatedAt: '2026-11-01' }),
      } },
      { provide: AppLoaderService, useValue: { show: () => {}, hide: () => {} } },
    ] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(DashboardComponent);
    spyOn<any>(fixture.componentInstance, 'buildChart').and.stub();
    spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    fixture.detectChanges();
    http.expectOne(r => r.url.endsWith('/dashboard')).flush({
      kpi: { fundraisingThisMonth: { total: 1234567, pctChange: 5 }, donationsThisMonth: { count: 25, pctChange: 8 }, activeCampaigns: { active: 1, total: 2 }, failedPayments: { count: 0, totalLost: 0 } },
      campaigns: [], alerts: [], chartData: [], failedPayments: [], topAmbassadors: [],
      recentDonations: [{ id: 'test', amount: 1200, donor_name: 'שם תורם לבדיקת תצוגה', campaign_title: 'שם קמפיין ארוך לבדיקה', completed_at: '2026-11-01T10:00:00Z' }],
    });
    fixture.detectChanges();
  });
  afterEach(() => { fixture.destroy(); http.verify(); });
  const style = (element: Element) => getComputedStyle(element);
  it('aligns the notification button with date chips on desktop and preserves its mobile touch target', () => {
    const bell = fixture.nativeElement.querySelector('.dh-bell') as HTMLButtonElement;
    expect(bell.type).toBe('button');
    const box = bell.getBoundingClientRect();
    if (window.innerWidth > 768) {
      const chip = fixture.nativeElement.querySelector('.range-btn').getBoundingClientRect();
      expect(Math.abs((box.top + box.height / 2) - (chip.top + chip.height / 2))).toBeLessThanOrEqual(1);
    } else {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    const scroll = spyOn(fixture.componentInstance, 'scrollToAlerts');
    bell.click();
    expect(scroll).toHaveBeenCalled();
  });
  it('uses borderless metric cards of equal height with a subtle shadow', () => {
    const cards = Array.from(fixture.nativeElement.querySelectorAll('.kpi-card')) as HTMLElement[];
    expect(new Set(cards.map(card => Math.round(card.getBoundingClientRect().height))).size).toBe(1);
    for (const card of cards) {
      expect(style(card).borderTopWidth).toBe('0px');
      expect(style(card).borderRightWidth).toBe('0px');
      expect(style(card).boxShadow).not.toBe('none');
    }
  });
  it('shows zero change neutrally without an upward or downward arrow', () => {
    fixture.componentInstance.data!.kpi.fundraisingThisMonth.pctChange = 0;
    fixture.componentInstance.data!.kpi.donationsThisMonth.pctChange = 0;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.trend-arrow').length).toBe(0);
    const trends = fixture.nativeElement.querySelectorAll('.trend-neutral');
    expect(trends.length).toBe(2);
    expect(trends[0].textContent).toContain('0% ללא שינוי');
    expect(style(trends[0].querySelector('.trend-pct')).color).not.toBe('rgb(14, 166, 90)');
  });
  it('keeps the page and long organization names within the viewport', () => {
    const page = fixture.nativeElement.querySelector('.db');
    expect(page.getBoundingClientRect().width).toBeLessThanOrEqual(window.innerWidth);
    expect(page.scrollWidth).toBeLessThanOrEqual(page.clientWidth + 1);
    expect(fixture.nativeElement.querySelectorAll('.organization-card').length).toBe(2);
  });
  it('uses two compact KPI columns on mobile and four on desktop', () => {
    const grid = fixture.nativeElement.querySelector('.kpi-grid');
    const columns = style(grid).gridTemplateColumns.split(' ').length;
    expect(columns).toBe(window.innerWidth <= 1200 ? 2 : 4);
    expect(fixture.nativeElement.querySelectorAll('.kpi-card').length).toBe(4);
    expect(fixture.nativeElement.querySelector('.kpi-card.neutral')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.kpi-card.danger')).toBeNull();
    expect(style(fixture.nativeElement).getPropertyValue('--primary-color').trim()).toBe('#583cd6');
  });
  it('keeps date chips in one row, reachable by scrolling, with touch targets on mobile', () => {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.range-btn')) as HTMLElement[];
    expect(buttons.length).toBe(6);
    expect(new Set(buttons.map(button => Math.round(button.getBoundingClientRect().top))).size).toBe(1);
    for (const button of buttons) {
      button.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth + 1);
      expect(button.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
      if (window.innerWidth <= 768) expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    }
    const active = fixture.nativeElement.querySelector('.range-btn.active');
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(style(active).backgroundColor).toBe('rgb(243, 239, 255)');
    expect(style(active).color).toBe('rgb(98, 54, 237)');
  });
  it('fits the custom date panel and preserves date selection behavior', () => {
    const picker = fixture.debugElement.query(By.directive(DateRangePickerComponent)).componentInstance as DateRangePickerComponent;
    picker.openCustom(); fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.custom-panel');
    expect(panel.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth + 1);
    expect(panel.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
    const range = TestBed.inject(AnalyticsRangeService); const apply = spyOn(range, 'setCustom');
    picker.customFrom = '2026-10-01'; picker.customTo = '2026-10-28'; picker.applyCustom();
    expect(apply).toHaveBeenCalled(); expect(picker.customOpen).toBeFalse();
  });
  it('keeps the calendar visible and the exact date range readable', () => {
    const icon = fixture.nativeElement.querySelector('.range-calendar-icon');
    expect(style(icon).display).not.toBe('none');
    expect(icon.querySelector('svg')).not.toBeNull();
    const range = fixture.nativeElement.querySelector('.range-display');
    expect(style(range).fontSize).toBe('13px');
    expect(style(range).color).toBe('rgb(71, 85, 105)');
    expect(style(fixture.nativeElement.querySelector('.range-picker')).gap).toBe('10px');
  });
  it('preserves both organization actions and uses full-width mobile buttons', () => {
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.organization-primary-action')) as HTMLAnchorElement[];
    expect(buttons.length).toBe(2);
    expect(buttons[0].getAttribute('href')).toContain('/settings/entities/mobile-a');
    expect(buttons[1].getAttribute('href')).toContain('/settings/entities/mobile-b');
    for (const button of buttons) {
      expect(button.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
      if (window.innerWidth <= 768) expect(button.getBoundingClientRect().width).toBeCloseTo(button.parentElement!.getBoundingClientRect().width, 0);
    }
  });
  it('keeps real Admin feedback visible and confines table scrolling to its card', () => {
    expect(fixture.nativeElement.textContent).toContain('נא להשלים את המסמכים');
    const table = fixture.nativeElement.querySelector('.compact-table');
    expect(table).not.toBeNull();
    if (window.innerWidth <= 768) expect(style(table.closest('.table-card')).overflowX).toBe('auto');
  });
});
