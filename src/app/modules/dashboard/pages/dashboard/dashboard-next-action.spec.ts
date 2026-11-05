import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { organizationNextAction } from '../../../../shared/utils/organization-next-action';
import { OrganizationEntryService } from '../../../../core/services/organization-entry.service';
import { CurrentEntityService } from '../../../../core/services/current-entity.service';
import { CurrentContextService } from '../../../../core/services/current-context.service';
import { EntitiesService } from '../../../../core/services/entities.service';
import { AnalyticsRangeService } from '../../../../core/services/analytics-range.service';
import { AppLoaderService } from '../../../../core/services/app-loader.service';
import { DateRangePickerComponent } from '../../../../shared/components/date-range-picker/date-range-picker.component';
import { ApprovalStatusCardComponent } from '../../../settings/components/approval-status-card/approval-status-card.component';

@Component({selector:'app-date-range-picker',standalone:true,template:''}) class RangeStub {}
const ready = {id:'a',status:'active',display_name:'Org A',is_profile_complete:true};
function dashboard(count = 0): any { return {kpi:{activeCampaigns:{total:count,active:0},fundraisingThisMonth:{total:0,pctChange:0},donationsThisMonth:{count:0,pctChange:0},failedPayments:{count:0,totalLost:0}},alerts:[],campaigns:[],chartData:[],recentDonations:[],failedPayments:[],topAmbassadors:[]}; }

describe('Organization next action and entry navigation', () => {
  for (const status of ['draft','pending_review','changes_requested','rejected','suspended']) {
    it(`does not automatically create a campaign for ${status}`, () => {
      expect(organizationNextAction({...ready,status},0).createFirstCampaign).toBeFalse();
    });
  }
  it('uses completion flags, not optional logo/documents or campaign health score', () => {
    expect(organizationNextAction(ready,0).createFirstCampaign).toBeTrue();
    expect(organizationNextAction({...ready,is_profile_complete:false},0).createFirstCampaign).toBeFalse();
    expect(organizationNextAction({...ready,requires_completion:true},0).createFirstCampaign).toBeFalse();
    expect(organizationNextAction(ready,1).createFirstCampaign).toBeFalse();
    expect(organizationNextAction({...ready,requires_completion:true,missing_fields:['contact_full_name']},0).missingRequirements).toContain('שם איש הקשר');
  });
  it('keeps entry intents in memory and consumes them once for the selected organization', () => {
    const entry = new OrganizationEntryService();
    entry.enter('a'); expect(entry.consume('a')).toBeTrue(); expect(entry.consume('a')).toBeFalse();
    entry.enter('a'); expect(entry.consume('b')).toBeFalse(); expect(entry.consume('a')).toBeFalse();
    expect(new OrganizationEntryService().consume('a')).toBeFalse();
  });

  let current: any, context: any, api: any, http: HttpTestingController, navigate: jasmine.Spy;
  beforeEach(() => {
    current = {currentEntity:signal<any>(ready),setEntity:(e:any)=>current.currentEntity.set(e)};
    context = {active:signal<any>({role:'entity-manager',context:{id:'a'}})};
    api = {getMyEntities:()=>of({entities:[]}),getEntityById:jasmine.createSpy().and.callFake(()=>of(current.currentEntity())),getApprovalStatus:()=>of({status:'changes_requested',comment:'Actual admin feedback',reasonTags:[],updatedAt:'2026-11-01',actionBy:'Admin'})};
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideRouter([]),
      {provide:CurrentEntityService,useValue:current},{provide:CurrentContextService,useValue:context},
      {provide:EntitiesService,useValue:api},{provide:AnalyticsRangeService,useValue:{activeRange:signal({from:'2026-11-01',to:'2026-12-01'})}},
      {provide:AppLoaderService,useValue:{show:()=>{},hide:()=>{}}},
    ]});
    TestBed.overrideComponent(DashboardComponent,{remove:{imports:[DateRangePickerComponent]},add:{imports:[RangeStub]}});
    http=TestBed.inject(HttpTestingController);
    navigate=spyOn(TestBed.inject(Router),'navigate').and.resolveTo(true);
  });
  afterEach(()=>http.verify());
  function load(count=0) {
    const fixture=TestBed.createComponent(DashboardComponent); spyOn<any>(fixture.componentInstance,'buildChart').and.stub(); fixture.detectChanges();
    http.expectOne(r=>r.url.endsWith('/a/dashboard')).flush(dashboard(count)); fixture.detectChanges();
    return fixture;
  }
  it('redirects once after verified ready/zero-campaign entry and keeps Dashboard accessible on return',()=>{
    TestBed.inject(OrganizationEntryService).enter('a');
    const first=load(); expect(navigate).toHaveBeenCalledWith(['/campaigns'],{replaceUrl:true}); first.destroy();
    navigate.calls.reset(); const back=load(); expect(navigate).not.toHaveBeenCalled();
    expect(back.nativeElement.querySelector('.organization-first-campaign')).not.toBeNull();
    expect(back.nativeElement.querySelector('.kpi-grid')).not.toBeNull();
    expect(back.nativeElement.querySelector('#organization-status-title')).not.toBeNull();
    expect(back.nativeElement.querySelector('.chart-section')).not.toBeNull(); back.destroy();
  });
  it('never redirects a refreshed/direct Dashboard without a context-entry intent',()=>{
    const fixture=load(); expect(navigate).not.toHaveBeenCalled(); fixture.destroy();
  });
  for (const status of ['pending_review','rejected','changes_requested','suspended','draft']) {
    it(`keeps ${status} on the Dashboard despite a fresh entry intent`,()=>{
      current.currentEntity.set({...ready,status});
      api.getApprovalStatus=()=>of({status,comment:'Feedback',reasonTags:[],updatedAt:'2026-11-01',actionBy:'Admin'});
      TestBed.inject(OrganizationEntryService).enter('a');
      const fixture=load();expect(navigate).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('app-organization-status-card')).not.toBeNull();fixture.destroy();
    });
  }
  it('evaluates another selected organization independently of the previously loaded one',()=>{
    current.currentEntity.set({...ready,id:'b',display_name:'Org B',requires_completion:true});
    context.active.set({role:'entity-manager',context:{id:'b'}});
    TestBed.inject(OrganizationEntryService).enter('b');
    const fixture=TestBed.createComponent(DashboardComponent);fixture.detectChanges();
    http.expectOne(r=>r.url.endsWith('/b/dashboard')).flush(dashboard());fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Org B');expect(navigate).not.toHaveBeenCalled();fixture.destroy();
  });
  it('uses all-time campaign count even if the selected period has zero donations',()=>{
    TestBed.inject(OrganizationEntryService).enter('a');
    const fixture=TestBed.createComponent(DashboardComponent);
    spyOn<any>(fixture.componentInstance,'buildChart').and.stub(); fixture.detectChanges();
    http.expectOne(r=>r.url.endsWith('/a/dashboard')).flush(dashboard(1)); fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled(); expect(fixture.nativeElement.querySelector('.kpi-grid')).not.toBeNull(); fixture.destroy();
  });
  it('shows actual correction feedback and links to existing settings instead of bypassing review',()=>{
    current.currentEntity.set({...ready,status:'changes_requested'});
    const fixture=load();
    expect(fixture.nativeElement.textContent).toContain('Actual admin feedback');
    expect(fixture.nativeElement.querySelector('.organization-primary-action').getAttribute('href')).toContain('/settings/entities/a');
    expect(fixture.nativeElement.querySelector('.approval-resubmit-btn')).toBeNull();
    expect(navigate).not.toHaveBeenCalled(); fixture.destroy();
  });
  it('fails visibly instead of redirecting from unverified organization data',()=>{
    TestBed.inject(OrganizationEntryService).enter('a');
    const fixture=TestBed.createComponent(DashboardComponent);fixture.detectChanges();
    http.expectOne(r=>r.url.endsWith('/a/dashboard')).flush({error:'Unavailable'},{status:500,statusText:'Error'});fixture.detectChanges();
    expect(navigate).not.toHaveBeenCalled();expect(fixture.nativeElement.textContent).toContain('Unavailable');fixture.destroy();
  });
  it('ignores stale organization responses after switching to a different organization',()=>{
    const pending=new Subject<any>();api.getEntityById.and.returnValue(pending);
    const fixture=TestBed.createComponent(DashboardComponent);fixture.detectChanges();
    context.active.set({role:'entity-manager',context:{id:'b'}});
    http.expectOne(r=>r.url.endsWith('/a/dashboard')).flush(dashboard());pending.next(ready);pending.complete();
    expect(fixture.componentInstance.data).toBeNull();expect(navigate).not.toHaveBeenCalled();fixture.destroy();
  });
});
