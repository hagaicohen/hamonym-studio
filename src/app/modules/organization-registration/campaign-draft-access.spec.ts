import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { CampaignsPageComponent } from '../campaigns/pages/campaigns-page/campaigns-page.component';
import { CampaignApiService } from '../campaigns/services/campaign-api.service';
import { CampaignsWelcomeService } from '../../core/services/campaigns-welcome.service';
import { AmbassadorService } from '../campaigns/services/ambassador.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';
import { CurrentContextService } from '../../core/services/current-context.service';
import { AppLoaderService } from '../../core/services/app-loader.service';
import { NotificationBellComponent } from '../../core/layout/notification-bell/notification-bell.component';
import { PlatformService } from '../platform/services/platform.service';
import { EntitiesService } from '../../core/services/entities.service';
import { campaignCreatePath } from '../campaigns/campaign-editor-route';

describe('Campaign drafts before organization approval', () => {
  const entity = signal<any>({ id: 'org-a', status: 'draft' });
  const active = signal<any>({ role: 'entity-manager', context: { id: 'org-a' } });
  let list: jasmine.Spy;
  beforeEach(() => {
    entity.set({ id: 'org-a', status: 'draft' });
    active.set({ role: 'entity-manager', context: { id: 'org-a' } });
    list = jasmine.createSpy().and.returnValue(of([]));
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: CampaignApiService, useValue: { list } },
      { provide: AmbassadorService, useValue: { getMyCampaigns: () => of([]) } },
      { provide: CurrentEntityService, useValue: { currentEntity: entity } },
      { provide: CurrentContextService, useValue: { active, adminMode: () => true, roles: () => [{ role: 'entity-manager', contexts: [{id:'org-a'}, {id:'org-b'}] }] } },
      { provide: PlatformService, useValue: {getNotificationsCount: () => of({pendingReviewCount:1,incompleteDraftsCount:1,flaggedForReviewCount:0})} },
      { provide: EntitiesService, useValue: {} },
      { provide: AppLoaderService, useValue: { show: () => {}, hide: () => {} } },
    ] });
  });
  it('does not count an unsubmitted draft as another Admin review notification', () => {
    const fixture=TestBed.createComponent(NotificationBellComponent);
    (fixture.componentInstance as any).fetch().subscribe();
    expect(fixture.componentInstance.count).toBe(1);
    fixture.destroy();
  });
  for (const status of ['draft', 'pending_review', 'changes_requested']) {
    it(`allows entering the existing campaign wizard and explains draft visibility for ${status}`, () => {
      entity.set({id:'org-a', status});
      const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges(); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.fc-reassure').textContent).toContain('יישמר כטיוטה, ויוכל להתפרסם לאחר אישור העמותה');
      expect(fixture.nativeElement.querySelector('.campaigns-alert--pending')).toBeNull();
      const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      fixture.nativeElement.querySelector('.fc-cta').click();
      expect(navigate).toHaveBeenCalledWith(campaignCreatePath());
      expect(list).toHaveBeenCalledWith('org-a');
      fixture.destroy();
    });
  }
  it('shows the first campaign experience only with zero campaigns, without duplicate actions or banners', () => {
    entity.set({id:'org-a', status:'active'});
    const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges(); fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.fc-title')!.textContent).toContain('הסיפור שלכם מתחיל כאן');
    expect(page.querySelector('.fc-subtitle')!.textContent).toContain('כל שינוי משמעותי מתחיל בצעד אחד');
    expect(page.querySelector('.fc-cta')!.textContent).toContain('יצירת הקמפיין הראשון');
    expect(page.querySelector('.fc-reassure')).toBeNull();
    expect(page.querySelectorAll('.fc-steps li').length).toBe(3);
    expect(page.querySelector('.first-campaign')!.textContent).not.toContain('🚀');
    expect(page.querySelectorAll('.btn-new').length).toBe(0);
    expect(page.querySelector('.campaigns-alert')).toBeNull();
    fixture.destroy();
  });
  it('offers to continue an existing draft instead of the first campaign experience', () => {
    entity.set({id:'org-a', status:'pending_review'});
    list.and.returnValue(of([{ id: 'draft-1', title: 'Draft', status: 'draft' }]));
    const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges(); fixture.detectChanges();
    const page=fixture.nativeElement as HTMLElement;
    expect(page.querySelector('.first-campaign')).toBeNull();
    const edit=spyOn(fixture.componentInstance,'editCampaign');
    (page.querySelector('.fc-continue-btn') as HTMLButtonElement).click();
    expect(edit).toHaveBeenCalledWith('draft-1');
    expect(page.querySelector('.campaigns-alert--pending')).not.toBeNull();
    expect(TestBed.inject(CampaignsWelcomeService).visible()).toBeFalse();
    fixture.destroy();
  });
  describe('campaigns welcome screen', () => {
    const open = () => { const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges(); fixture.detectChanges(); return fixture; };
    const q = (fixture: any, sel: string) => (fixture.nativeElement as HTMLElement).querySelector(sel) as HTMLElement | null;
    beforeEach(() => entity.set({ id: 'org-a', status: 'active' }));

    it('is shown on every visit while the organization has zero campaigns, without Skip', () => {
      for (let visit = 0; visit < 2; visit++) {
        const fixture=open();
        expect(q(fixture,'.first-campaign')).not.toBeNull();
        expect(q(fixture,'.fc-skip')).toBeNull();
        expect(q(fixture,'.fc-empty')).toBeNull();
        fixture.destroy();
      }
    });
    it('launches the existing creation flow from the primary CTA', () => {
      const fixture=open(); const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      q(fixture,'.fc-cta')!.click();
      expect(navigate).toHaveBeenCalledWith(campaignCreatePath());
      fixture.destroy();
    });
    it('flags the welcome for the layout and clears it on leave or when a campaign exists', () => {
      const welcome=TestBed.inject(CampaignsWelcomeService);
      const fixture=open(); expect(welcome.visible()).toBeTrue();
      fixture.destroy(); expect(welcome.visible()).toBeFalse();
      list.and.returnValue(of([{ id: 'c-1', title: 'Live', status: 'published' }]));
      const withCampaign=open();
      expect(q(withCampaign,'.first-campaign')).toBeNull();
      expect(welcome.visible()).toBeFalse();
      withCampaign.destroy();
    });
    it('does not show the welcome while campaigns are still loading', () => {
      const pending=new Subject<any[]>(); list.and.returnValue(pending);
      const fixture=open();
      expect(q(fixture,'.first-campaign')).toBeNull();
      pending.next([]); fixture.detectChanges();
      expect(q(fixture,'.first-campaign')).not.toBeNull();
      fixture.destroy();
    });
  });
  it('switches campaign lists by selected organization and ignores late old responses', () => {
    const first=new Subject<any[]>(), second=new Subject<any[]>();
    list.and.callFake((id:string)=>id==='org-a'?first:second);
    const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges(); fixture.detectChanges();
    entity.set({id:'org-b',status:'pending_review'});active.set({role:'entity-manager',context:{id:'org-b'}});fixture.detectChanges();
    second.next([{id:'b-draft',status:'draft'}]);first.next([{id:'a-draft',status:'draft'}]);
    expect(fixture.componentInstance.drafts.map(c=>c.id)).toEqual(['b-draft']);
    fixture.destroy();
  });
});
