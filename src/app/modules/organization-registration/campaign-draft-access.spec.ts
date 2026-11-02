import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { CampaignsPageComponent } from '../campaigns/pages/campaigns-page/campaigns-page.component';
import { CampaignApiService } from '../campaigns/services/campaign-api.service';
import { AmbassadorService } from '../campaigns/services/ambassador.service';
import { CurrentEntityService } from '../../core/services/current-entity.service';
import { CurrentContextService } from '../../core/services/current-context.service';
import { AppLoaderService } from '../../core/services/app-loader.service';
import { NotificationBellComponent } from '../../core/layout/notification-bell/notification-bell.component';
import { PlatformService } from '../platform/services/platform.service';
import { EntitiesService } from '../../core/services/entities.service';

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
      const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.campaigns-alert--pending').textContent).toContain('נשמרים כטיוטות ואינם חשופים לציבור');
      const navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
      fixture.componentInstance.createCampaign();
      expect(navigate).toHaveBeenCalledWith(['/campaigns/create']);
      expect(list).toHaveBeenCalledWith('org-a');
      fixture.destroy();
    });
  }
  it('switches campaign lists by selected organization and ignores late old responses', () => {
    const first=new Subject<any[]>(), second=new Subject<any[]>();
    list.and.callFake((id:string)=>id==='org-a'?first:second);
    const fixture=TestBed.createComponent(CampaignsPageComponent); fixture.detectChanges();
    entity.set({id:'org-b',status:'pending_review'});active.set({role:'entity-manager',context:{id:'org-b'}});fixture.detectChanges();
    second.next([{id:'b-draft',status:'draft'}]);first.next([{id:'a-draft',status:'draft'}]);
    expect(fixture.componentInstance.drafts.map(c=>c.id)).toEqual(['b-draft']);
    fixture.destroy();
  });
});
